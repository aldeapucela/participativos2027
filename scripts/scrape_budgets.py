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
import argparse
from tqdm import tqdm

# Constantes
BASE_URL = "https://www10.ava.es"
START_URL = "https://www10.ava.es/presupuestosparticipativos/budgets"
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.abspath(os.path.join(SCRIPT_DIR, '..', 'data'))
OUTPUT_JSON = os.path.join(DATA_DIR, "proposals_data.json")
OUTPUT_CSV = os.path.join(DATA_DIR, "proposals_data.csv")
DISCOVERED_URLS = os.path.join(DATA_DIR, "discovered_urls.json")
DELAY = 0.5  # Segundos entre peticiones para ser amable con el servidor

# Mapeo completo de zonas con nombres e IDs
ZONE_COMPLETE_MAPPING = {
    "Zona Este 1": "1. Zona Este 1: Delicias, Nuevo Hospital, Pinar de Jalón, Polígono San Cristóbal, Polígono Argales",
    "Zona Este 2": "2. Zona Este 2: Pajarillos-San Isidro, Las Flores, Buenos Aires",
    "Zona Esgueva 1": "3. Zona Esgueva 1: La Rondilla, Hospital",
    "Zona Esgueva 2": "4. Zona Esgueva 2: Barrio España, San Pedro Regalado, Barrio Belén, Pilarica, Vadillos, Batallas, San Juan, Circular",
    "Zona Pisuerga 1": "5. Zona Pisuerga 1: La Victoria, Fuente Berrocal, La Galera, La Overuela",
    "Zona Pisuerga 2": "6. Zona Pisuerga 2: Huerta del Rey, Villa de Prado, Girón",
    "Zona Parquesol": "7. Zona Parquesol: Parquesol",
    "Zona Sur 1": "8. Zona Sur 1: 4 de Marzo, Campo Grande, La Farola, Arturo Eyries, Plaza de Toros",
    "Zona Sur 2": "9. Zona Sur 2: Covaresa, Parque Alameda, Paula López, Las Villas, Santa Ana, El Peral, Valparaiso, El Pinar, Puente Duero, La Rubia, La Cañada",
    "Zona Centro": "10. Zona Centro: Caño Argales, Plaza España, Plaza Mayor, San Pablo-San Nicolás, San Martín, La Antigua"
}

# Mapeo de zone_id correctos
ZONE_ID_MAPPING = {
    "1. Zona Este 1: Delicias, Nuevo Hospital, Pinar de Jalón, Polígono San Cristóbal, Polígono Argales": 1,
    "2. Zona Este 2: Pajarillos-San Isidro, Las Flores, Buenos Aires": 2,
    "3. Zona Esgueva 1: La Rondilla, Hospital": 3,
    "4. Zona Esgueva 2: Barrio España, San Pedro Regalado, Barrio Belén, Pilarica, Vadillos, Batallas, San Juan, Circular": 4,
    "5. Zona Pisuerga 1: La Victoria, Fuente Berrocal, La Galera, La Overuela": 5,
    "6. Zona Pisuerga 2: Huerta del Rey, Villa de Prado, Girón": 6,
    "7. Zona Parquesol: Parquesol": 7,
    "8. Zona Sur 1: 4 de Marzo, Campo Grande, La Farola, Arturo Eyries, Plaza de Toros": 8,
    "9. Zona Sur 2: Covaresa, Parque Alameda, Paula López, Las Villas, Santa Ana, El Peral, Valparaiso, El Pinar, Puente Duero, La Rubia, La Cañada": 9,
    "10. Zona Centro: Caño Argales, Plaza España, Plaza Mayor, San Pablo-San Nicolás, San Martín, La Antigua": 10
}

def normalize_investment_url(url):
    if not url:
        return url
    u = url.strip()
    m = re.search(r'(https?://[^/]+)?(/presupuestosparticipativos/budgets/\d+/investments/\d+)', u)
    if m:
        path = m.group(2)
        return BASE_URL + path
    m2 = re.search(r'(https?://[^/]+)?(/budgets/\d+/investments/\d+)', u)
    if m2:
        path = m2.group(2)
        return BASE_URL + path
    return u

def extract_zone_from_html(soup):
    """Extract zone information from the HTML page"""
    if not soup:
        return None, None
    
    # Look for zone information in the page structure
    # The zone appears after the date in the header area
    zone_text = None
    zone_id = None
    
    # Strategy 1: Look for text patterns that match zone names
    # Zone names typically follow patterns like "Zona Este 1", "Zona Sur 2", etc.
    zone_patterns = [
        r'Zona\s+\w+\s+\d+',  # Zona Este 1, Zona Sur 2, etc.
        r'Zona\s+\w+',        # Zona Centro, Zona Norte, etc.
    ]
    
    # Search in the entire page content for zone patterns
    page_text = soup.get_text()
    for pattern in zone_patterns:
        matches = re.findall(pattern, page_text)
        if matches:
            # Take the first match that looks like a zone name
            for match in matches:
                if 'Zona' in match:
                    zone_text = match.strip()
                    break
            if zone_text:
                break
    
    # Strategy 2: Look in the specific header area where date and zone are displayed
    # The zone is typically shown near the date
    info_elements = soup.find_all(['div', 'p', 'span'])
    for elem in info_elements:
        text = elem.get_text(strip=True)
        # Look for zone patterns in element text
        for pattern in zone_patterns:
            match = re.search(pattern, text)
            if match:
                zone_text = match.group(0).strip()
                break
        if zone_text:
            break
    
    # Extract zone_id from zone name
    if zone_text:
        # Extract numeric ID from zone name (e.g., "1. Zona Este 1" -> 1, "Zona Sur 2" -> 2)
        id_match = re.search(r'(\d+)', zone_text)
        if id_match:
            zone_id = int(id_match.group(1))
    
    return zone_text, zone_id

def normalize_zone_name(zone_name):
    """Normalize zone name to complete format"""
    if not zone_name:
        return None, None
    
    # If already in complete format, return as is
    if zone_name in ZONE_ID_MAPPING:
        return zone_name, ZONE_ID_MAPPING[zone_name]
    
    # If in short format, convert to complete format
    if zone_name in ZONE_COMPLETE_MAPPING:
        complete_name = ZONE_COMPLETE_MAPPING[zone_name]
        zone_id = ZONE_ID_MAPPING[complete_name]
        return complete_name, zone_id
    
    return zone_name, None

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
            
            # Construir URL con orden consistente para evitar aleatoriedad
            # Asegurarse de usar budget 6 y orden confidence_score
            if 'budgets/' in href:
                # Reemplazar cualquier parámetro order existente y añadir order=confidence_score
                clean_href = re.sub(r'&?order=[^&]*', '', href)
                if '?' in clean_href:
                    full_url = BASE_URL + clean_href + '&order=confidence_score'
                else:
                    full_url = BASE_URL + clean_href + '?order=confidence_score'
            else:
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
    seen_urls = set()
    page = 1
    max_pages = 500
    
    while True:
        if page > max_pages:
            print(f"  [!] Límite de páginas alcanzado ({max_pages}). Cortando para evitar bucles.")
            break
        url = f"{zone['url']}&page={page}"
        print(f"  Leyendo página {page}: {url}")
        soup = get_soup(url)
        if not soup:
            break
            
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
            full_url = normalize_investment_url(full_url)
            
            # Evitar duplicados en la misma zona
            if full_url not in seen_urls:
                proposals.append({
                    'url': full_url,
                    'zone_name': zone['name'],
                    'zone_id': zone['id']
                })
                seen_urls.add(full_url)

        next_link = (
            soup.select_one('a[rel="next"]')
            or soup.select_one('li.next a')
            or soup.find('a', string=re.compile(r'\b(siguiente|next)\b', re.IGNORECASE))
        )
        if not next_link:
            print("  No hay enlace a página siguiente. Fin de zona.")
            break
            
        page += 1
        time.sleep(DELAY)
        
    return proposals

def discover_budget_ids():
    soup = get_soup(START_URL)
    if not soup:
        return []

    budget_ids = set()
    links = soup.find_all('a', href=re.compile(r'/presupuestosparticipativos/budgets/\d+'))
    for link in links:
        href = link.get('href')
        if not href:
            continue
        match = re.search(r'/presupuestosparticipativos/budgets/(\d+)', href)
        if match:
            budget_ids.add(int(match.group(1)))

    return sorted(budget_ids)

def audit_missing_investments(budget_ids, discovered_proposals, scraped_urls):
    known_urls = {p.get('url') for p in discovered_proposals if p.get('url')}
    results = []

    for budget_id in budget_ids:
        web_items = discover_investments_from_budget(budget_id)
        web_urls = {p.get('url') for p in web_items if p.get('url')}

        missing_from_dataset = sorted([u for u in web_urls if u not in scraped_urls])
        missing_from_discovery = sorted([u for u in web_urls if u not in known_urls])

        results.append({
            'budget_id': budget_id,
            'web_total': len(web_urls),
            'known_total': len([u for u in web_urls if u in known_urls]),
            'scraped_total': len([u for u in web_urls if u in scraped_urls]),
            'missing_from_discovery': missing_from_discovery,
            'missing_from_dataset': missing_from_dataset,
        })

    return results

def discover_investments_from_budget(budget_id):
    proposals = []
    seen_urls = set()
    page = 1
    max_pages = 500
    
    while True:
        if page > max_pages:
            print(f"  [!] Límite de páginas alcanzado ({max_pages}). Cortando para evitar bucles.")
            break

        url = f"{BASE_URL}/presupuestosparticipativos/budgets/{budget_id}/investments?page={page}"
        print(f"  Leyendo budget {budget_id} página {page}: {url}")
        soup = get_soup(url)
        if not soup:
            break

        links = soup.find_all('a', href=re.compile(rf'/budgets/{re.escape(str(budget_id))}/investments/\d+'))
        for link in links:
            href = link.get('href')
            if not href:
                continue
            full_url = BASE_URL + href if href.startswith('/') else href
            full_url = normalize_investment_url(full_url)
            if full_url in seen_urls:
                continue
            seen_urls.add(full_url)
            proposals.append({'url': full_url, 'zone_name': None, 'zone_id': None})

        next_link = (
            soup.select_one('a[rel="next"]')
            or soup.select_one('li.next a')
            or soup.find('a', string=re.compile(r'\b(siguiente|next)\b', re.IGNORECASE))
        )
        if not next_link:
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
    # 0.5 Procesamiento de Zona
    # Si no tenemos zona_name o está vacía, intentar extraer del HTML
    if not zone_name or zone_name == '':
        extracted_zone, extracted_id = extract_zone_from_html(soup)
        if extracted_zone:
            zone_name = extracted_zone
            zone_id = extracted_id
            print(f"  [+] Extraída zona del HTML para {data['code']}: {zone_name}")
    
    # Normalizar el nombre de zona al formato completo
    if zone_name:
        normalized_zone, normalized_id = normalize_zone_name(zone_name)
        if normalized_zone:
            data['zone'] = normalized_zone
            data['zone_id'] = normalized_id
        else:
            # Si no se puede normalizar, usar el valor original
            data['zone'] = zone_name
            data['zone_id'] = zone_id
    else:
        data['zone'] = None
        data['zone_id'] = None

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

    os.makedirs(DATA_DIR, exist_ok=True)

    parser = argparse.ArgumentParser(add_help=True)
    parser.add_argument('--force-discovery', action='store_true')
    parser.add_argument('--backfill-budget', type=int, default=None)
    parser.add_argument('--backfill-ids', type=str, default=None)
    parser.add_argument('--audit-budget', type=int, default=None)
    parser.add_argument('--audit-all-budgets', action='store_true')
    parser.add_argument('--sync-missing', action='store_true')
    parser.add_argument('--backfill-zones', action='store_true', help='Backfill missing zone information from existing proposals')
    args = parser.parse_args()
    
    # --- BACKFILL DE ZONAS ---
    if args.backfill_zones:
        print("[*] Backfill de información de zonas...")
        
        # Cargar datos existentes
        if not os.path.exists(OUTPUT_JSON):
            print(f"[!] No existe el archivo {OUTPUT_JSON}")
            return
            
        with open(OUTPUT_JSON, 'r', encoding='utf-8') as f:
            proposals = json.load(f)
        
        # Encontrar propuestas con información de zona incompleta
        missing_zone_proposals = []
        for proposal in proposals:
            zone = proposal.get('zone', '')
            zone_id = proposal.get('zone_id')
            
            # Si la zona está vacía o el zone_id es None, necesita backfill
            if not zone or zone == '' or zone_id is None:
                missing_zone_proposals.append(proposal)
        
        print(f"[*] Encontradas {len(missing_zone_proposals)} propuestas con información de zona incompleta")
        
        if not missing_zone_proposals:
            print("[*] Todas las propuestas tienen información de zona completa")
            return
        
        # Procesar cada propuesta con zona incompleta
        updated_count = 0
        try:
            pbar = tqdm(missing_zone_proposals, desc="Backfill de zonas", unit="propuesta")
            for proposal in pbar:
                url = proposal['url']
                pbar.set_postfix(url=url[-15:])
                
                soup = get_soup(url)
                if soup:
                    # Extraer zona del HTML
                    extracted_zone, extracted_id = extract_zone_from_html(soup)
                    
                    if extracted_zone:
                        # Normalizar zona
                        normalized_zone, normalized_id = normalize_zone_name(extracted_zone)
                        
                        if normalized_zone:
                            proposal['zone'] = normalized_zone
                            proposal['zone_id'] = normalized_id
                            updated_count += 1
                            print(f"  [+] Actualizada zona para {proposal['code']}: {normalized_zone}")
                        else:
                            proposal['zone'] = extracted_zone
                            proposal['zone_id'] = extracted_id
                            updated_count += 1
                            print(f"  [+] Actualizada zona para {proposal['code']}: {extracted_zone}")
                    else:
                        print(f"  [!] No se pudo extraer zona para {proposal['code']}")
                
                time.sleep(DELAY)
        
        except KeyboardInterrupt:
            print("\n[!] Proceso interrumpido por el usuario")
        
        # Guardar datos actualizados
        with open(OUTPUT_JSON, 'w', encoding='utf-8') as f:
            json.dump(proposals, f, ensure_ascii=False, indent=2)
        
        # Exportar a CSV
        if proposals:
            keys = proposals[0].keys()
            with open(OUTPUT_CSV, 'w', newline='', encoding='utf-8') as f:
                dict_writer = csv.DictWriter(f, fieldnames=keys)
                dict_writer.writeheader()
                dict_writer.writerows(proposals)
        
        print(f"\n[*] Backfill de zonas completado:")
        print(f"    Propuestas procesadas: {len(missing_zone_proposals)}")
        print(f"    Zonas actualizadas: {updated_count}")
        print(f"    Total en dataset: {len(proposals)}")
        return
    
    # --- FASE 1: DESCUBRIMIENTO ---
    discovered_proposals = []
    if os.path.exists(DISCOVERED_URLS) and not args.force_discovery:
        with open(DISCOVERED_URLS, 'r', encoding='utf-8') as f:
            discovered_proposals = json.load(f)

        # Normalizar URLs (p.ej. quitar /vote) y deduplicar
        normalized = []
        seen = set()
        for p in discovered_proposals:
            if not isinstance(p, dict):
                continue
            u = normalize_investment_url(p.get('url'))
            if not u or u in seen:
                continue
            p['url'] = u
            normalized.append(p)
            seen.add(u)
        discovered_proposals = normalized
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

    if args.backfill_budget is not None or args.backfill_ids:
        existing_urls = {p.get('url') for p in discovered_proposals if p.get('url')}
        backfill_items = []

        if args.backfill_budget is not None:
            print(f"[*] Backfill: descubriendo inversiones del budget {args.backfill_budget}...")
            budget_discovered = discover_investments_from_budget(args.backfill_budget)
            for p in budget_discovered:
                u = p.get('url')
                if u and u not in existing_urls:
                    backfill_items.append(p)
                    existing_urls.add(u)

        if args.backfill_ids:
            ids = [x.strip() for x in args.backfill_ids.split(',') if x.strip()]
            for inv_id in ids:
                url = f"{BASE_URL}/presupuestosparticipativos/budgets/{args.backfill_budget or 6}/investments/{inv_id}"
                url = normalize_investment_url(url)
                if url not in existing_urls:
                    backfill_items.append({'url': url, 'zone_name': None, 'zone_id': None})
                    existing_urls.add(url)

        if backfill_items:
            discovered_proposals.extend(backfill_items)
            with open(DISCOVERED_URLS, 'w', encoding='utf-8') as f:
                json.dump(discovered_proposals, f, ensure_ascii=False, indent=2)
            print(f"[*] Backfill: añadidas {len(backfill_items)} URLs nuevas a {DISCOVERED_URLS}")
        else:
            print("[*] Backfill: no hay URLs nuevas que añadir a discovered_urls.")

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

    if args.audit_budget is not None or args.audit_all_budgets:
        if args.audit_all_budgets:
            budget_ids = discover_budget_ids()
            if not budget_ids:
                print("[!] No se pudieron descubrir budgets para auditoría.")
                return
        else:
            budget_ids = [args.audit_budget]

        print(f"[*] Auditoría: comprobando budgets: {budget_ids}")
        audit = audit_missing_investments(budget_ids, discovered_proposals, scraped_urls)

        total_missing = 0
        for item in audit:
            missing_n = len(item['missing_from_dataset'])
            total_missing += missing_n
            print(
                f"    Budget {item['budget_id']}: web={item['web_total']} scraped={item['scraped_total']} missing={missing_n}"
            )

        print(f"[*] Auditoría: faltan {total_missing} inversiones en el dataset.")

        if args.sync_missing:
            existing_urls = {p.get('url') for p in discovered_proposals if p.get('url')}
            new_items = []
            for item in audit:
                for u in item['missing_from_dataset']:
                    if u not in existing_urls:
                        new_items.append({'url': u, 'zone_name': None, 'zone_id': None})
                        existing_urls.add(u)

            if new_items:
                discovered_proposals.extend(new_items)
                with open(DISCOVERED_URLS, 'w', encoding='utf-8') as f:
                    json.dump(discovered_proposals, f, ensure_ascii=False, indent=2)
                print(f"[*] Sync: añadidas {len(new_items)} URLs a {DISCOVERED_URLS}")
            else:
                print("[*] Sync: no hay URLs nuevas para añadir a discovered_urls.")
        else:
            # Solo auditoría, no seguimos con extracción
            return

    # Filtrar las que faltan por procesar
    to_process = [p for p in discovered_proposals if p.get('url') and p['url'] not in scraped_urls]
    
    if not to_process:
        print("[*] ¡Todo al día! No hay nuevas propuestas para extraer.")
        return

    print(f"[*] Fase 2: Extrayendo detalles de {len(to_process)} propuestas nuevas...")
    
    total_new = 0
    try:
        # Barra de progreso tqdm
        pbar = tqdm(to_process, desc="Progreso", unit="propuesta")
        for proposal in pbar:
            p_url = normalize_investment_url(proposal['url'])
            pbar.set_postfix(url=p_url[-15:]) # Mostrar final de la URL
            
            details = scrape_proposal_details(p_url, proposal.get('zone_name') or '', proposal.get('zone_id'))
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
