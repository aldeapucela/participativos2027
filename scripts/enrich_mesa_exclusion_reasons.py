#!/usr/bin/env python3
"""Enriquece el dataset de mesa/final con razones de exclusion y enlaces de soporte.

Reglas:
- Lee la ficha publica de cada propuesta y busca el bloque
  `Informe de inviabilidad`.
- Si existe, guarda su texto en `razon_exclusion`.
- Siempre guarda la propia URL de la propuesta en
  `informe_inviabilidad_url` cuando la razon se ha tomado de la ficha.
- Si no hay bloque web, intenta derivar una razon corta desde el acta.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any

import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MESA_CSV = ROOT / "data" / "mesa-final-unificado.csv"
DEFAULT_PROPOSALS_JSON = ROOT / "data" / "proposals_data.json"
REQUEST_DELAY_SECONDS = 0.2
REQUEST_TIMEOUT_SECONDS = 20
MAX_WORKERS = 8


def normalize_text(value: Any) -> str:
    return str(value or "").strip()


def get_proposal_code(proposal: dict[str, Any]) -> str:
    return normalize_text(proposal.get("code"))


def clean_reason_prefix(text: str, proposal_id: str) -> str:
    cleaned = normalize_text(text)
    if not cleaned:
        return ""

    cleaned = re.sub(r"\s+", " ", cleaned)
    cleaned = re.sub(
        rf"^ID\s*{re.escape(proposal_id)}\s*:\s*",
        "",
        cleaned,
        flags=re.IGNORECASE,
    )
    cleaned = re.sub(r"^ID\s*\d+\s*:\s*", "", cleaned, flags=re.IGNORECASE)
    return cleaned.strip(" .;")


def infer_reason_from_extract(extract: str, proposal_id: str) -> str:
    cleaned = clean_reason_prefix(extract, proposal_id)
    if not cleaned:
        return ""

    # Evita usar textos meramente descriptivos del match en acta.
    blockers = (
        "id detectada en tabla/listado",
        "figura en la tabla de priorizadas",
        "cargando",
    )
    lowered = cleaned.lower()
    if any(blocker in lowered for blocker in blockers):
        return ""
    return cleaned


def looks_like_acta_placeholder(text: str) -> bool:
    lowered = normalize_text(text).lower()
    if not lowered:
        return False
    markers = (
        "acta zona",
        "figura en la tabla de propuestas",
        "id detectada en tabla/listado",
        "figura en la relación final",
    )
    return any(marker in lowered for marker in markers)


def load_proposals(path: Path) -> dict[str, dict[str, Any]]:
    proposals = json.loads(path.read_text(encoding="utf-8"))
    by_code: dict[str, dict[str, Any]] = {}
    for proposal in proposals:
        code = get_proposal_code(proposal)
        if code:
            by_code[code] = proposal
    return by_code


def extract_inviability_reason_from_html(html: str) -> str:
    soup = BeautifulSoup(html, "html.parser")
    heading = soup.find(
        lambda tag: tag.name in {"h1", "h2", "h3"} and "informe de inviabilidad" in tag.get_text(" ", strip=True).lower()
    )
    if not heading:
        return ""

    for sibling in heading.find_next_siblings():
        if sibling.name in {"h1", "h2", "h3"}:
            break
        text = sibling.get_text(" ", strip=True)
        if text:
            return text.strip(' "\u201c\u201d')
    return ""


def fetch_inviability_reason(url: str) -> str:
    response = requests.get(
        url,
        timeout=REQUEST_TIMEOUT_SECONDS,
        headers={
            "User-Agent": "aldeapucela-participativos2027/1.0 (+https://aldeapucela.org)",
        },
    )
    response.raise_for_status()
    return extract_inviability_reason_from_html(response.text)


def enrich_rows(
    rows: list[dict[str, str]],
    proposals_by_code: dict[str, dict[str, Any]],
) -> tuple[list[dict[str, str]], int, dict[str, int]]:
    changed = 0
    fetched_reasons: dict[str, str] = {}
    stats = {
        "target_rows": 0,
        "web_reason_rows": 0,
        "acta_fallback_rows": 0,
        "missing_reason_rows": 0,
    }

    fetch_targets: dict[str, str] = {}
    for row in rows:
        if row.get("situacion") not in {
            "Mesa pero no final",
            "Descartada por mesa y fuera de la final",
        }:
            continue
        stats["target_rows"] += 1
        proposal_id = normalize_text(row.get("propuesta_id"))
        proposal = proposals_by_code.get(proposal_id)
        source_url = normalize_text(row.get("enlace")) or normalize_text(proposal.get("url") if proposal else "")
        if source_url:
            fetch_targets[proposal_id] = source_url

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        future_to_id = {
            executor.submit(fetch_inviability_reason, source_url): proposal_id
            for proposal_id, source_url in fetch_targets.items()
        }
        for future in as_completed(future_to_id):
            proposal_id = future_to_id[future]
            try:
                fetched_reasons[proposal_id] = future.result()
            except requests.RequestException:
                fetched_reasons[proposal_id] = ""
            time.sleep(REQUEST_DELAY_SECONDS)

    for row in rows:
        if row.get("situacion") not in {
            "Mesa pero no final",
            "Descartada por mesa y fuera de la final",
        }:
            continue
        proposal_id = normalize_text(row.get("propuesta_id"))
        proposal = proposals_by_code.get(proposal_id)
        source_url = normalize_text(row.get("enlace")) or normalize_text(proposal.get("url") if proposal else "")
        fetched_reason = fetched_reasons.get(proposal_id, "")

        current_reason = normalize_text(row.get("razon_exclusion"))
        if fetched_reason:
            inferred_reason = fetched_reason
            stats["web_reason_rows"] += 1
        elif current_reason and not looks_like_acta_placeholder(current_reason):
            inferred_reason = current_reason
            stats["acta_fallback_rows"] += 1
        else:
            inferred_reason = infer_reason_from_extract(row.get("extracto_acta", ""), proposal_id)
            if inferred_reason:
                stats["acta_fallback_rows"] += 1
            else:
                stats["missing_reason_rows"] += 1
        document_url = normalize_text(row.get("informe_inviabilidad_url"))
        if not document_url and fetched_reason and source_url:
            document_url = source_url

        new_values = {
            "razon_exclusion": inferred_reason,
            "informe_inviabilidad_url": document_url,
        }

        row_changed = False
        for key, value in new_values.items():
            if normalize_text(row.get(key)) != value:
                row[key] = value
                row_changed = True
        if row_changed:
            changed += 1

    return rows, changed, stats


def write_csv(path: Path, rows: list[dict[str, str]]) -> None:
    base_headers = list(rows[0].keys()) if rows else []
    for extra in ("razon_exclusion", "informe_inviabilidad_url"):
        if extra not in base_headers:
            base_headers.append(extra)

    with path.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=base_headers)
        writer.writeheader()
        writer.writerows(rows)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--mesa-csv", type=Path, default=DEFAULT_MESA_CSV)
    parser.add_argument("--proposals-json", type=Path, default=DEFAULT_PROPOSALS_JSON)
    args = parser.parse_args()

    with args.mesa_csv.open(encoding="utf-8", newline="") as fh:
        rows = list(csv.DictReader(fh))

    proposals_by_code = load_proposals(args.proposals_json)
    enriched_rows, changed, stats = enrich_rows(rows, proposals_by_code)
    write_csv(args.mesa_csv, enriched_rows)

    print(f"Filas procesadas: {len(enriched_rows)}")
    print(f"Filas actualizadas: {changed}")
    print(f"Filas objetivo (mesa/no final o descartadas fuera final): {stats['target_rows']}")
    print(f"Con motivo extraido de la web: {stats['web_reason_rows']}")
    print(f"Con motivo provisional desde acta: {stats['acta_fallback_rows']}")
    print(f"Sin motivo localizado todavia: {stats['missing_reason_rows']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
