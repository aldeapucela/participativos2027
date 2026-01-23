#!/usr/bin/env python3
"""
Script para reintentar actualizar solo las propuestas que dieron errores
"""

import requests
from bs4 import BeautifulSoup
import json
import time
import os
import random
import logging
import re
from datetime import datetime
from tqdm import tqdm
from concurrent.futures import ThreadPoolExecutor, as_completed
import threading
import sys

# Configuración
BASE_URL = "https://www10.ava.es"
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.abspath(os.path.join(SCRIPT_DIR, '..', 'data'))
LOGS_DIR = os.path.abspath(os.path.join(SCRIPT_DIR, '..', 'logs'))
PROPOSALS_FILE = os.path.join(DATA_DIR, "proposals_data.json")
PROGRESS_FILE = os.path.join(DATA_DIR, "retry_progress.json")
BACKUP_DIR = os.path.join(DATA_DIR, "backups")
LOG_FILE = os.path.join(LOGS_DIR, "retry_vote_update.log")

# Configuración más conservadora para reintentos
BASE_DELAY = 0.5  # delay más conservador
MAX_RETRIES = 3  # más reintentos
TIMEOUT = 15  # timeout más generoso
MAX_WORKERS = 4  # menos hilos concurrentes

# Headers optimizados
HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'es-ES,es;q=0.8,en-US;q=0.5,en;q=0.3',
    'Accept-Encoding': 'gzip, deflate',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
}

# Lock para thread-safe operations
stats_lock = threading.Lock()

# Configuración de logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(LOG_FILE),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

class FailedProposalsRetry:
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update(HEADERS)
        self.start_time = time.time()
        self.processed_count = 0
        self.error_count = 0
        self.updated_count = 0
        
        # Crear directorios
        os.makedirs(BACKUP_DIR, exist_ok=True)
        os.makedirs(LOGS_DIR, exist_ok=True)
    
    def load_failed_proposals(self):
        """Cargar las propuestas que fallaron del último reporte"""
        # Buscar el reporte más reciente
        import glob
        report_files = glob.glob(os.path.join(DATA_DIR, "vote_update_report_*.txt"))
        
        if not report_files:
            logger.error("No se encontraron reportes anteriores")
            return []
        
        latest_report = max(report_files, key=os.path.getctime)
        logger.info(f"Cargando errores del reporte: {os.path.basename(latest_report)}")
        
        failed_codes = []
        try:
            with open(latest_report, 'r') as f:
                content = f.read()
                
            # Extraer códigos de propuestas con errores
            import re
            error_pattern = r'- Propuesta (\d+):'
            matches = re.findall(error_pattern, content)
            failed_codes = [code for code in matches if code]
            
        except Exception as e:
            logger.error(f"Error leyendo reporte: {e}")
            return []
        
        # Cargar todas las propuestas y filtrar las que fallaron
        try:
            with open(PROPOSALS_FILE, 'r', encoding='utf-8') as f:
                all_proposals = json.load(f)
            
            failed_proposals = [
                proposal for proposal in all_proposals 
                if proposal.get("code") in failed_codes
            ]
            
            logger.info(f"Se encontraron {len(failed_proposals)} propuestas para reintentar")
            return failed_proposals
            
        except Exception as e:
            logger.error(f"Error cargando propuestas: {e}")
            return []
    
    def get_vote_count_retry(self, proposal_url, proposal_code):
        """Obtener votos con configuración más robusta"""
        
        for attempt in range(MAX_RETRIES):
            try:
                # Delay más conservador
                time.sleep(BASE_DELAY + random.uniform(0, 0.2))
                
                response = self.session.get(proposal_url, timeout=TIMEOUT)
                response.raise_for_status()
                
                soup = BeautifulSoup(response.content, 'html.parser')
                
                # Búsqueda directa del span con clase total-supports
                vote_span = soup.find('span', class_='total-supports')
                if vote_span:
                    text = vote_span.get_text().strip()
                    
                    # Caso especial: "Sin apoyos"
                    if "sin apoyos" in text.lower():
                        return 0
                    
                    # Extraer número del texto "X apoyos"
                    numbers = re.findall(r'\d+', text)
                    if numbers:
                        return int(numbers[0])
                
                # Búsqueda alternativa: buscar en todo el HTML
                page_text = soup.get_text()
                vote_patterns = [
                    r'(\d+)\s*apoyos?',
                    r'apoyos?\s*[:\-]?\s*(\d+)',
                    r'(\d+)\s*votos?',
                    r'votos?\s*[:\-]?\s*(\d+)',
                ]
                
                for pattern in vote_patterns:
                    matches = re.findall(pattern, page_text, re.IGNORECASE)
                    if matches:
                        return int(matches[-1])  # Tomar el último número encontrado
                
                # Si no se encuentra nada, asumir 0 votos
                logger.warning(f"No se encontraron votos para propuesta {proposal_code}, asumiendo 0")
                return 0
                    
            except requests.exceptions.RequestException as e:
                wait_time = (attempt + 1) * 2  # Backoff más agresivo
                if attempt == MAX_RETRIES - 1:
                    logger.warning(f"Error final para propuesta {proposal_code}: {e}")
                    return None
                logger.warning(f"Intento {attempt + 1}/{MAX_RETRIES} para propuesta {proposal_code}: {e}. Esperando {wait_time}s...")
                time.sleep(wait_time)
                
            except Exception as e:
                if attempt == MAX_RETRIES - 1:
                    logger.error(f"Error inesperado para propuesta {proposal_code}: {e}")
                    return None
                time.sleep(1)
        
        return None
    
    def process_proposal(self, proposal):
        """Procesar una propuesta individual"""
        proposal_code = proposal.get("code")
        proposal_url = proposal.get("url")
        
        if not proposal_code or not proposal_url:
            return None
        
        try:
            new_votes = self.get_vote_count_retry(proposal_url, proposal_code)
            
            if new_votes is not None:
                old_votes = proposal.get("votes", 0)
                
                result = {
                    "code": proposal_code,
                    "old_votes": old_votes,
                    "new_votes": new_votes,
                    "updated": new_votes != old_votes,
                    "error": None
                }
                
                if new_votes != old_votes:
                    proposal["votes"] = new_votes
                    
                with stats_lock:
                    if new_votes != old_votes:
                        self.updated_count += 1
                    self.processed_count += 1
                
                return result
            else:
                with stats_lock:
                    self.error_count += 1
                return {"code": proposal_code, "error": "No se pudieron obtener votos"}
                
        except Exception as e:
            with stats_lock:
                self.error_count += 1
            return {"code": proposal_code, "error": str(e)}
    
    def retry_failed_proposals(self, proposals):
        """Reintentar actualizar las propuestas fallidas"""
        
        logger.info(f"Reintentando {len(proposals)} propuestas con configuración conservadora")
        
        with tqdm(total=len(proposals), desc="Reintentando propuestas fallidas") as pbar:
            
            with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
                # Enviar todas las propuestas
                future_to_proposal = {
                    executor.submit(self.process_proposal, proposal): proposal 
                    for proposal in proposals
                }
                
                results = []
                for future in as_completed(future_to_proposal):
                    result = future.result()
                    if result:
                        results.append(result)
                    pbar.update(1)
        
        return proposals, results
    
    def save_proposals(self, proposals):
        """Guardar las propuestas actualizadas"""
        try:
            with open(PROPOSALS_FILE, 'w', encoding='utf-8') as f:
                json.dump(proposals, f, indent=2, ensure_ascii=False)
        except Exception as e:
            logger.error(f"Error guardando propuestas: {e}")
    
    def generate_report(self, results):
        """Generar reporte del reintento"""
        elapsed_time = time.time() - self.start_time
        avg_time_per_proposal = elapsed_time / max(self.processed_count, 1)
        
        successful_retries = len([r for r in results if not r.get("error")])
        
        report = f"""
=== REPORTE DE REINTENTO DE PROPUESTAS FALLIDAS ===
Fecha: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}

Estadísticas del reintento:
- Propuestas procesadas: {self.processed_count}
- Propuestas actualizadas: {self.updated_count}
- Reintentos exitosos: {successful_retries}
- Errores persistentes: {self.error_count}
- Tiempo total: {elapsed_time:.2f} segundos
- Tiempo promedio por propuesta: {avg_time_per_proposal:.3f} segundos

Detalles de actualizaciones:
"""
        
        for result in results:
            if result.get("updated") and not result.get("error"):
                report += f"✓ Propuesta {result['code']}: {result['old_votes']} → {result['new_votes']} votos\n"
        
        if self.error_count > 0:
            report += f"\nErrores persistentes:\n"
            for result in results:
                if result.get("error"):
                    report += f"✗ Propuesta {result['code']}: {result['error']}\n"
        
        logger.info(report)
        
        # Guardar reporte
        report_file = os.path.join(DATA_DIR, f"retry_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt")
        try:
            with open(report_file, 'w') as f:
                f.write(report)
            logger.info(f"Reporte de reintento guardado en: {report_file}")
        except Exception as e:
            logger.error(f"Error guardando reporte: {e}")
    
    def run(self):
        """Ejecutar el proceso de reintento"""
        logger.info("Iniciando reintento de propuestas fallidas...")
        
        # 1. Cargar propuestas fallidas
        failed_proposals = self.load_failed_proposals()
        if not failed_proposals:
            logger.info("No hay propuestas fallidas para reintentar")
            return True
        
        # 2. Cargar todas las propuestas para actualizar
        try:
            with open(PROPOSALS_FILE, 'r', encoding='utf-8') as f:
                all_proposals = json.load(f)
        except Exception as e:
            logger.error(f"Error cargando propuestas: {e}")
            return False
        
        # 3. Crear backup antes de modificar
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_file = os.path.join(BACKUP_DIR, f"proposals_data_backup_retry_{timestamp}.json")
        try:
            import shutil
            shutil.copy2(PROPOSALS_FILE, backup_file)
            logger.info(f"Backup creado: {backup_file}")
        except Exception as e:
            logger.error(f"Error creando backup: {e}")
        
        # 4. Reintentar actualizar
        try:
            updated_proposals, results = self.retry_failed_proposals(failed_proposals)
            
            # 5. Actualizar el archivo completo con los cambios
            code_to_proposal = {p["code"]: p for p in updated_proposals}
            for proposal in all_proposals:
                if proposal["code"] in code_to_proposal:
                    proposal.update(code_to_proposal[proposal["code"]])
            
            # 6. Guardar datos actualizados
            self.save_proposals(all_proposals)
            
            # 7. Generar reporte
            self.generate_report(results)
            
            logger.info("Reintento completado!")
            return True
            
        except KeyboardInterrupt:
            logger.info("Proceso interrumpido")
            return False
        except Exception as e:
            logger.error(f"Error durante el reintento: {e}")
            return False

def main():
    """Función principal"""
    retry = FailedProposalsRetry()
    
    try:
        success = retry.run()
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        logger.info("Proceso interrumpido")
        sys.exit(1)

if __name__ == "__main__":
    main()
