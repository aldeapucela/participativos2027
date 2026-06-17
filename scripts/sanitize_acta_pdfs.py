#!/usr/bin/env python3
"""Create privacy-safe PDF copies by flattening each page to a raster image.

This is a defensive fallback for documents that may contain visual redactions
while still preserving searchable/selectable text underneath. The output PDF
contains only page images, so hidden text, annotations, form fields and layers
from the source document are not carried over.
"""

from __future__ import annotations

import argparse
import io
from pathlib import Path

import fitz
from PIL import Image


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Flatten PDF pages into raster images and rebuild the document as a "
            "new PDF without embedded source text."
        )
    )
    parser.add_argument("input", type=Path, help="Input PDF or directory containing PDFs")
    parser.add_argument("output", type=Path, help="Output PDF or directory for sanitized PDFs")
    parser.add_argument(
        "--dpi",
        type=int,
        default=200,
        help="Rasterization DPI. Higher values improve sharpness but increase file size.",
    )
    parser.add_argument(
        "--jpeg-quality",
        type=int,
        default=82,
        help="JPEG quality for embedded page images (1-100).",
    )
    return parser.parse_args()


def iter_input_files(input_path: Path) -> list[Path]:
    if input_path.is_file():
        return [input_path]
    return sorted(p for p in input_path.glob("*.pdf") if p.is_file())


def pixmap_to_jpeg_bytes(pixmap: fitz.Pixmap, quality: int) -> bytes:
    mode = "RGB" if pixmap.n < 4 else "RGBA"
    image = Image.frombytes(mode, [pixmap.width, pixmap.height], pixmap.samples)
    if mode == "RGBA":
        image = image.convert("RGB")

    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=quality, optimize=True)
    return buffer.getvalue()


def sanitize_pdf(input_pdf: Path, output_pdf: Path, dpi: int, jpeg_quality: int) -> None:
    src = fitz.open(input_pdf)
    dst = fitz.open()

    try:
        for page in src:
            pix = page.get_pixmap(dpi=dpi, alpha=False)
            jpeg_bytes = pixmap_to_jpeg_bytes(pix, jpeg_quality)
            rect = page.rect

            new_page = dst.new_page(width=rect.width, height=rect.height)
            new_page.insert_image(rect, stream=jpeg_bytes)

        output_pdf.parent.mkdir(parents=True, exist_ok=True)
        dst.save(output_pdf, garbage=4, deflate=True)
    finally:
        dst.close()
        src.close()


def verify_no_text(output_pdf: Path) -> int:
    doc = fitz.open(output_pdf)
    try:
        total_chars = 0
        for page in doc:
            total_chars += len((page.get_text() or "").strip())
        return total_chars
    finally:
        doc.close()


def main() -> int:
    args = parse_args()
    input_files = iter_input_files(args.input)

    if not input_files:
        raise SystemExit(f"No PDF files found in {args.input}")

    output_is_dir = args.output.suffix.lower() != ".pdf" or args.output.is_dir()
    results: list[tuple[Path, Path, int]] = []

    for input_pdf in input_files:
        output_pdf = args.output / input_pdf.name if output_is_dir else args.output
        sanitize_pdf(input_pdf, output_pdf, args.dpi, args.jpeg_quality)
        residual_chars = verify_no_text(output_pdf)
        results.append((input_pdf, output_pdf, residual_chars))

    for src, dst, residual_chars in results:
        status = "OK" if residual_chars == 0 else f"CHECK residual_text_chars={residual_chars}"
        print(f"{status}\t{src}\t->\t{dst}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
