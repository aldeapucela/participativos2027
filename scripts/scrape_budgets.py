#!/usr/bin/env python3
"""
Participativos2027 - Plataforma Web de Presupuestos Participativos Valladolid
Copyright (C) 2025

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published
by the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program.  If not, see <https://www.gnu.org/licenses/>.
"""

import requests
from bs4 import BeautifulSoup
import json
import csv
import time
import os
import re
from tqdm import tqdm

# Constantes
BASE_URL = "https://www10.ava.es"
START_URL = "https://www10.ava.es/presupuestosparticipativos/budgets"
OUTPUT_JSON = "../data/proposals_data.json"
OUTPUT_CSV = "../data/proposals_data.csv"
DISCOVERED_URLS = "../data/discovered_urls.json"
DELAY = 0.5  # Segundos entre peticiones para ser amable con el servidor

def get_soup(url):
    """Realiza una petición GET y devuelve el objeto BeautifulSoup."""
    try:
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        return BeautifulSoup(response.content, 'html.parser')
    except requests.RequestException as e:
        print(f"Error al acceder a {url}: {e}")
        return None

def get_zones():
    """Extrae las zonas de participación de la página principal."""
    print("Obteniendo lista de zonas...")
    soup = get_soup(START_URL)
    if not soup:
        return []

    zones = []
    # Buscar secciones que parecen ser zonas (basado en heading_id)
    # Estrategia: Buscar enlaces que contengan 'investments?heading_id='
    # El selector específico puede variar, así que buscamos todos los links relevantes
    links = soup.find_all('a', href=re.compile(r'investments\?heading_id='))
    
    seen_ids = set()
    
    for link in links:
        href = link['href']
        # Extraer ID
        match = re.search(r'heading_id=(\d+)', href)
        if match:
            z_id = match.group(1)
            if z_id in seen_ids:
                continue
            seen_ids.add(z_id)
            
            # Intentar obtener el nombre de la zona. 
            # A veces es el texto del link, o un h2 padre, etc.
            name = link.get_text(strip=True)
            if not name:
                # Fallback: buscar un elemento cercano
                parent_header = link.find_parent('h2') or link.find_parent('h3')
                if parent_header:
                    name = parent_header.get_text(strip=True)
                else:
                    name = f"Zona ID {z_id}"
            
            full_url = BASE_URL + href if href.startswith('/') else href
            zones.append({
                'id': z_id,
                'name': name,
                'url': full_url
            })
            print(f"  Zona encontrada: {name} (ID: {z_id})")
            
    return zones

def get_proposals_from_zone(zone):
    """Itera sobre la paginación de una zona y extrae los enlaces a las propuestas."""
    print(f"Procesando zona: {zone['name']}...")
    proposals = []
    page = 1
    
    while True:
        url = f"{zone['url']}&page={page}"
        print(f"  Leyendo página {page}: {url}")
        soup = get_soup(url)
        if not soup:
            break
            
        new_links_found = False
        proposal_cards = soup.find_all('div', class_='investment-project')
        
        found_urls = []
        if not proposal_cards:
             links = soup.find_all('a', href=re.compile(r'/budgets/\d+/investments/\d+$'))
             found_urls = [link['href'] for link in links]
        else:
            for card in proposal_cards:
                link = card.find('a', href=re.compile(r'/budgets/\d+/investments/\d+'))
                if link:
                    found_urls.append(link['href'])

        for href in found_urls:
            full_url = BASE_URL + href if href.startswith('/') else href
            if 'heading_id' in full_url: continue
            
            # Evitar duplicados en la misma zona
            if not any(p['url'] == full_url for p in proposals):
                proposals.append({
                    'url': full_url,
                    'zone_name': zone['name'],
                    'zone_id': zone['id']
                })
                new_links_found = True

        if not new_links_found:
            print("  No se encontraron más propuestas en esta página. Fin de zona.")
            break
            
        page += 1
        time.sleep(DELAY)
        
    return proposals

def scrape_proposal_details(url, zone_name, zone_id):
    """Extrae los detalles de una página de propuesta."""
    soup = get_soup(url)
    if not soup:
        return None
        
    data = {
        'url': url,
        'code': None, 
        'zone': zone_name,
        'zone_id': zone_id, # Nuevo campo ID de zona
        'date': None,       # Nuevo campo Fecha
        'title': '',
        'author': None,     # Nuevo campo Autor
        'description': '',
        'address': None, 
        'image_url': None, 
        'documents': [],   
        'categories': [],
        'latitude': None, 
        'longitude': None, 
        'votes': 0 
    }
    
    # 0. ID de Propuesta
    # <p id="investment_code">Código de propuesta... <strong>7995</strong></p>
    id_elem = soup.select_one('#investment_code strong')
    if id_elem:
        data['code'] = id_elem.get_text(strip=True)
    else:
        # Fallback: Extraer ID de la URL (.../investments/7995)
        id_match = re.search(r'/investments/(\d+)', url)
        if id_match:
            data['code'] = id_match.group(1)
    # 0.5 ID de Zona (Mapeo manual 1-10)
    # Extraemos el número del principio del nombre de la zona (ej. "1. Zona Este 1..." -> 1)
    # El usuario quiere IDs del 1 al 10 basados en el nombre.
    zone_num_match = re.match(r'^(\d+)\.', zone_name)
    if zone_num_match:
        data['zone_id'] = int(zone_num_match.group(1))
    else:
        # Fallback si no empieza por número, usar el ID interno o dejar None
        data['zone_id'] = zone_id

    # 1. Información Meta (Fecha)
    # <div class="budget-investment-info"> 02/01/2026 ... </div>
    info_elem = soup.select_one('.budget-investment-info')
    if info_elem:
        info_text = info_elem.get_text(" ", strip=True)
        # Extraer fecha
        date_match = re.search(r'(\d{2}/\d{2}/\d{4})', info_text)
        if date_match:
            data['date'] = date_match.group(1)

    # 1. Título
    # Hay un h1 oculto con el título del sitio. Buscamos el h1 dentro de la sección de la propuesta
    title_elem = soup.select_one('.budget-investment-show h1')
    if title_elem:
        data['title'] = title_elem.get_text(strip=True)
    
    # 1.5 Imagen Principal
    img_elem = soup.select_one('.image-preview img.persisted-image')
    if img_elem:
        src = img_elem.get('src')
        if src:
            data['image_url'] = BASE_URL + src if src.startswith('/') else src

    # 2. Descripción, Ubicación y Autor
    section = soup.select_one('.budget-investment-show')
    if section:
        # Texto crudo puede ser sucio, mejor buscar <p> que no tengan id 'investment_code'
        paragraphs = section.find_all('p')
        visible_text = []
        for p in paragraphs:
            if 'investment_code' not in p.get('id', '') and 'sidebar-title' not in p.get('class', []):
                 text = p.get_text(strip=True)
                 if text and not text.startswith('Código de propuesta') and not text.startswith('Compartir'):
                     visible_text.append(text)
        
        full_desc = "\n".join(visible_text)
        
        # 2.1 Extracción de Ubicación / Dirección
        address_match = re.search(r'Ubicación:(.*)', full_desc, re.IGNORECASE)
        if address_match:
            data['address'] = address_match.group(1).strip()
            full_desc = full_desc.replace(address_match.group(0), "")

        # 2.2 Extracción de Autor
        # Patrón 1: "Propuesto en nombre de:..."
        author_match = re.search(r'Propuesto en nombre de:(.*)', full_desc, re.IGNORECASE)
        if author_match:
            data['author'] = author_match.group(1).strip()
            full_desc = full_desc.replace(author_match.group(0), "")
        else:
            # Patrón 2: Firma al final con "Atentamente,"
            # Buscamos "Atentamente," y capturamos hasta "Quiero participar" (que es boilerplate) o fin de string
            # Usamos re.DOTALL para que . incluya newlines
            signature_match = re.search(r'Atentamente,[\s\n]*(.*?)(?=\n.*Quiero participar|\Z)', full_desc, re.IGNORECASE | re.DOTALL)
            if signature_match:
                possible_author = signature_match.group(1).strip()
                # Limpiamos si hay saltos de línea extraños
                possible_author = possible_author.replace('\n', ' ')
                
                # Si es corto (menos de 100 chars), asumimos que es nombre
                if len(possible_author) < 100:
                    data['author'] = possible_author
                    
                    # Limpiamos todo desde "Atentamente," para abajo en la descripción
                    # Re-buscamos el match completo para reemplazar
                    full_match = re.search(r'Atentamente,.*', full_desc, re.IGNORECASE | re.DOTALL)
                    if full_match:
                         full_desc = full_desc.replace(full_match.group(0), "")

        
        # Limpieza de texto boilerplate
        boilerplate_1 = "Puedes introducir cualquier enlace de Propuesta, Debate y Proyecto de gasto que esté dentro de Presupuestos Participativos Valladolid."
        boilerplate_2 = "Necesitasiniciar sesiónpara continuar."
        
        full_desc = full_desc.replace(boilerplate_1, "").replace(boilerplate_2, "")
        data['description'] = full_desc.strip()
        
    # 2.5 Documentos
    # <div id="documents"> ... <li ...><a href="...">...</a> <strong>Nombre</strong>
    docs_div = soup.select_one('#documents')
    data['documents'] = []
    if docs_div:
        doc_links = docs_div.select('.document-link li')
        for doc in doc_links:
            a_tag = doc.find('a')
            if a_tag:
                doc_url = a_tag.get('href')
                if doc_url:
                    full_doc_url = BASE_URL + doc_url if doc_url.startswith('/') else doc_url
                    # El nombre suele estar en un strong
                    strong_tag = doc.find('strong')
                    if strong_tag:
                        doc_name = strong_tag.get_text(strip=True)
                    else:
                         # Fallback
                        doc_name = doc.get_text(strip=True).replace('Descargar archivo', '').strip()
                        
                    data['documents'].append({
                        'url': full_doc_url,
                        'title': doc_name
                    })

    # 3. Categorías / Tags
    tags = soup.select('.tags a')
    data['categories'] = [tag.get_text(strip=True) for tag in tags]
    
    # 4. Mapa / Ubicación
    map_div = soup.select_one('.map_location')
    if map_div:
        # Los atributos son data-marker-latitude (completo), no data-marker-lat
        lat_str = map_div.get('data-marker-latitude') or map_div.get('data-lat')
        lon_str = map_div.get('data-marker-longitude') or map_div.get('data-lng')
        
        try:
            if lat_str:
                data['latitude'] = float(lat_str)
            if lon_str:
                lon = float(lon_str)
                # Normalizar longitud a rangos [-180, 180]
                while lon < -180:
                    lon += 360
                while lon > 180:
                    lon -= 360
                data['longitude'] = lon
        except ValueError:
            pass
        
    # 5. Votos / Apoyos
    # <span class="total-supports">52 apoyos</span>
    votes_elem = soup.select_one('.total-supports')
    if votes_elem:
        votes_text = votes_elem.get_text(strip=True) # "52 apoyos"
        # Extraer solo el número
        match = re.search(r'(\d+)', votes_text)
        if match:
            data['votes'] = int(match.group(1))
        
    return data

def main():
    print("=== Scraper de Presupuestos Participativos ===")
    
    # --- FASE 1: DESCUBRIMIENTO ---
    discovered_proposals = []
    if os.path.exists(DISCOVERED_URLS):
        with open(DISCOVERED_URLS, 'r', encoding='utf-8') as f:
            discovered_proposals = json.load(f)
        print(f"[*] Fase 1: Cargadas {len(discovered_proposals)} URLs desde {DISCOVERED_URLS}")
    else:
        print("[*] Fase 1: Descubriendo propuestas...")
        zones = get_zones()
        if not zones:
            print("[!] No se encontraron zonas.")
            return

        for zone in zones:
            zone_proposals = get_proposals_from_zone(zone)
            discovered_proposals.extend(zone_proposals)
            
        with open(DISCOVERED_URLS, 'w', encoding='utf-8') as f:
            json.dump(discovered_proposals, f, ensure_ascii=False, indent=2)
        print(f"[*] Fase 1 completada: {len(discovered_proposals)} URLs guardadas en {DISCOVERED_URLS}")

    # --- FASE 2: EXTRACCIÓN ---
    all_data = []
    scraped_urls = set()
    
    if os.path.exists(OUTPUT_JSON):
        try:
            with open(OUTPUT_JSON, 'r', encoding='utf-8') as f:
                all_data = json.load(f)
                scraped_urls = {item['url'] for item in all_data if 'url' in item}
            print(f"[*] Fase 2: {len(scraped_urls)} propuestas ya procesadas. Saltando...")
        except Exception as e:
            print(f"[!] Error al cargar datos: {e}")

    # Filtrar las que faltan por procesar
    to_process = [p for p in discovered_proposals if p['url'] not in scraped_urls]
    
    if not to_process:
        print("[*] ¡Todo al día! No hay nuevas propuestas para extraer.")
        return

    print(f"[*] Fase 2: Extrayendo detalles de {len(to_process)} propuestas nuevas...")
    
    total_new = 0
    try:
        # Barra de progreso tqdm
        pbar = tqdm(to_process, desc="Progreso", unit="propuesta")
        for proposal in pbar:
            p_url = proposal['url']
            pbar.set_postfix(url=p_url[-15:]) # Mostrar final de la URL
            
            details = scrape_proposal_details(p_url, proposal['zone_name'], proposal['zone_id'])
            if details:
                all_data.append(details)
                scraped_urls.add(p_url)
                total_new += 1
                
                # Guardado incremental cada 10 para mayor seguridad
                if total_new % 10 == 0:
                    with open(OUTPUT_JSON, 'w', encoding='utf-8') as f:
                        json.dump(all_data, f, ensure_ascii=False, indent=2)
            
            time.sleep(DELAY)
    except KeyboardInterrupt:
        print("\n[!] Proceso interrumpido por el usuario.")
    finally:
        # Guardado final robusto
        if all_data:
            with open(OUTPUT_JSON, 'w', encoding='utf-8') as f:
                json.dump(all_data, f, ensure_ascii=False, indent=2)
            
            # Exportar a CSV
            keys = all_data[0].keys()
            with open(OUTPUT_CSV, 'w', newline='', encoding='utf-8') as f:
                dict_writer = csv.DictWriter(f, fieldnames=keys)
                dict_writer.writeheader()
                dict_writer.writerows(all_data)
            
            print(f"\n[*] Proceso finalizado.")
            print(f"    Nuevas extraídas: {total_new}")
            print(f"    Total en dataset: {len(all_data)}")
            print(f"    Archivos: {OUTPUT_JSON}, {OUTPUT_CSV}")

if __name__ == "__main__":
    main()
