#!/usr/bin/env python3
"""
Script optimizado para actualizar votos rápidamente usando procesamiento concurrente
"""

import requests
from bs4 import BeautifulSoup
import json
import time
import os
import random
import logging
from datetime import datetime
from tqdm import tqdm
import shutil
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
import threading

# Configuración
BASE_URL = "https://www10.ava.es"
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.abspath(os.path.join(SCRIPT_DIR, '..', 'data'))
LOGS_DIR = os.path.abspath(os.path.join(SCRIPT_DIR, '..', 'logs'))
PROPOSALS_FILE = os.path.join(DATA_DIR, "proposals_data.json")
PROGRESS_FILE = os.path.join(DATA_DIR, "update_progress.json")
BACKUP_DIR = os.path.join(DATA_DIR, "backups")
LOG_FILE = os.path.join(LOGS_DIR, "vote_update.log")

# Configuración de tiempo y actualización
MIN_UPDATE_INTERVAL_HOURS = 1  # Mínimo 1 hora entre actualizaciones completas
FORCE_UPDATE = False  # Forzar actualización sin importar el tiempo

# Configuración más robusta para GitHub Actions
BASE_DELAY = 0.2  # aumento delay para reducir errores
MAX_RETRIES = 4  # más reintentos
BATCH_SIZE = 100  # lotes más pequeños
PAUSE_EVERY = 100  # pausas más frecuentes
PAUSE_DURATION = 8  # pausas más largas
TIMEOUT = 15  # timeout más generoso
MAX_WORKERS = 6  # menos hilos concurrentes para GitHub Actions

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

class VoteUpdater:
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
        
    def create_backup(self):
        """Crear backup del archivo de datos"""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_file = os.path.join(BACKUP_DIR, f"proposals_data_backup_{timestamp}.json")
        
        try:
            shutil.copy2(PROPOSALS_FILE, backup_file)
            logger.info(f"Backup creado: {backup_file}")
            return backup_file
        except Exception as e:
            logger.error(f"Error creando backup: {e}")
            return None
    
    def should_update(self, progress):
        """Determinar si se debe actualizar basado en el tiempo transcurrido"""
        if FORCE_UPDATE:
            return True, "Forzado por configuración"
        
        last_update = progress.get("last_complete_timestamp")
        if not last_update:
            return True, "Primera ejecución"
        
        try:
            from datetime import datetime
            last_update_time = datetime.fromisoformat(last_update)
            current_time = datetime.now()
            hours_since_update = (current_time - last_update_time).total_seconds() / 3600
            
            if hours_since_update >= MIN_UPDATE_INTERVAL_HOURS:
                return True, f"Han pasado {hours_since_update:.1f} horas (mínimo: {MIN_UPDATE_INTERVAL_HOURS})"
            else:
                remaining_hours = MIN_UPDATE_INTERVAL_HOURS - hours_since_update
                return False, f"Debe esperar {remaining_hours:.1f} horas más (mínimo: {MIN_UPDATE_INTERVAL_HOURS})"
                
        except Exception as e:
            logger.warning(f"Error verificando tiempo: {e}")
            return True, "Error en verificación de tiempo"
    
    def load_progress(self):
        """Cargar progreso previo si existe"""
        if os.path.exists(PROGRESS_FILE):
            try:
                with open(PROGRESS_FILE, 'r') as f:
                    return json.load(f)
            except Exception as e:
                logger.warning(f"Error cargando progreso: {e}")
        return {"last_processed_index": -1, "processed_codes": [], "errors": [], "last_complete_timestamp": None}
    
    def save_progress(self, progress):
        """Guardar progreso actual"""
        try:
            with open(PROGRESS_FILE, 'w') as f:
                json.dump(progress, f, indent=2)
        except Exception as e:
            logger.error(f"Error guardando progreso: {e}")
    
    def mark_complete(self, progress):
        """Marcar la actualización como completada"""
        progress["last_complete_timestamp"] = datetime.now().isoformat()
        progress["last_processed_index"] = -1  # Resetear para próxima ejecución completa
        progress["processed_codes"] = []  # Resetear para próxima ejecución completa
        self.save_progress(progress)
    
    def get_vote_count(self, proposal_url, proposal_code):
        """Obtener votos de forma ultra-robusta para GitHub Actions"""
        
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
                    import re
                    numbers = re.findall(r'\d+', text)
                    if numbers:
                        return int(numbers[0])
                
                # Búsqueda alternativa más exhaustiva si falla la principal
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
                        return int(matches[-1])
                
                # Si no se encuentra nada, asumir 0 en lugar de None
                logger.warning(f"No se encontraron votos para propuesta {proposal_code}, asumiendo 0")
                return 0
                    
            except requests.exceptions.RequestException as e:
                wait_time = (attempt + 1) * 2  # Backoff más agresivo
                if attempt == MAX_RETRIES - 1:
                    logger.warning(f"Error final para propuesta {proposal_code}: {e}")
                    return 0  # Retornar 0 en lugar de None
                logger.warning(f"Intento {attempt + 1}/{MAX_RETRIES} para propuesta {proposal_code}: {e}. Esperando {wait_time}s...")
                time.sleep(wait_time)
                
            except Exception as e:
                if attempt == MAX_RETRIES - 1:
                    logger.error(f"Error inesperado para propuesta {proposal_code}: {e}")
                    return 0  # Retornar 0 en lugar de None
                time.sleep(1)
        
        return 0  # Retornar 0 como último recurso
    
    def process_proposal(self, proposal):
        """Procesar una propuesta individual"""
        proposal_code = proposal.get("code")
        proposal_url = proposal.get("url")
        
        if not proposal_code or not proposal_url:
            return None
        
        try:
            new_votes = self.get_vote_count(proposal_url, proposal_code)
            
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
                # Ya no debería llegar aquí con los cambios hechos
                with stats_lock:
                    self.error_count += 1
                return {"code": proposal_code, "error": "No se pudieron obtener votos"}
                
        except Exception as e:
            with stats_lock:
                self.error_count += 1
            return {"code": proposal_code, "error": str(e)}
    
    def update_proposals(self, proposals, progress):
        """Actualizar propuestas usando procesamiento concurrente"""
        
        start_index = progress.get("last_processed_index", -1) + 1
        remaining_proposals = proposals[start_index:]
        
        # Filtrar ya procesadas
        processed_codes = set(progress.get("processed_codes", []))
        proposals_to_process = [p for p in remaining_proposals if p.get("code") not in processed_codes]
        
        logger.info(f"Procesando {len(proposals_to_process)} propuestas con {MAX_WORKERS} hilos")
        
        with tqdm(total=len(proposals_to_process), desc="Actualizando votos") as pbar:
            
            # Procesar en lotes para no sobrecargar
            for i in range(0, len(proposals_to_process), BATCH_SIZE):
                batch = proposals_to_process[i:i + BATCH_SIZE]
                
                with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
                    # Enviar todas las propuestas del lote
                    future_to_proposal = {
                        executor.submit(self.process_proposal, proposal): proposal 
                        for proposal in batch
                    }
                    
                    # Recoger resultados
                    for future in as_completed(future_to_proposal):
                        result = future.result()
                        if result and result.get("code"):
                            progress["processed_codes"].append(result["code"])
                            if result.get("error"):
                                progress["errors"].append({
                                    "code": result["code"],
                                    "error": result["error"],
                                    "timestamp": datetime.now().isoformat()
                                })
                        
                        pbar.update(1)
                
                # Pausa breve entre lotes
                if i + BATCH_SIZE < len(proposals_to_process):
                    time.sleep(PAUSE_DURATION)
                
                # Guardar progreso cada lote
                self.save_progress(progress)
                self.save_proposals(proposals)
                
                # Mostrar estadísticas
                with stats_lock:
                    logger.info(f"Lote completado: {self.processed_count}/{len(proposals)} procesados, "
                              f"{self.updated_count} actualizados, {self.error_count} errores")
        
        return proposals
    
    def save_proposals(self, proposals):
        """Guardar las propuestas actualizadas"""
        try:
            with open(PROPOSALS_FILE, 'w', encoding='utf-8') as f:
                json.dump(proposals, f, indent=2, ensure_ascii=False)
        except Exception as e:
            logger.error(f"Error guardando propuestas: {e}")
    
    def generate_report(self, progress):
        """Generar reporte final"""
        elapsed_time = time.time() - self.start_time
        avg_time_per_proposal = elapsed_time / max(self.processed_count, 1)
        
        report = f"""
=== REPORTE DE ACTUALIZACIÓN DE VOTOS ===
Fecha: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}

Estadísticas:
- Propuestas procesadas: {self.processed_count}
- Propuestas actualizadas: {self.updated_count}
- Errores: {self.error_count}
- Tiempo total: {elapsed_time:.2f} segundos ({elapsed_time/60:.1f} minutos)
- Tiempo promedio por propuesta: {avg_time_per_proposal:.3f} segundos
- Velocidad: {self.processed_count/elapsed_time:.1f} propuestas/segundo

Configuración utilizada:
- Hilos concurrentes: {MAX_WORKERS}
- Delay base: {BASE_DELAY}s
- Tamaño de lote: {BATCH_SIZE}
- Timeout: {TIMEOUT}s

Errores registrados: {len(progress.get('errors', []))}
"""
        
        if progress.get('errors'):
            report += "\nÚltimos errores:\n"
            for error in progress['errors'][-5:]:
                report += f"- Propuesta {error['code']}: {error.get('error', 'Unknown')}\n"
        
        logger.info(report)
        
        # Guardar reporte
        report_file = os.path.join(DATA_DIR, f"vote_update_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt")
        try:
            with open(report_file, 'w') as f:
                f.write(report)
            logger.info(f"Reporte guardado en: {report_file}")
        except Exception as e:
            logger.error(f"Error guardando reporte: {e}")
    
    def run(self):
        """Ejecutar el proceso de actualización con control de tiempo"""
        logger.info("Iniciando actualización de votos...")
        
        # 1. Cargar progreso
        progress = self.load_progress()
        
        # 2. Verificar si se debe actualizar
        should_update, reason = self.should_update(progress)
        
        if not should_update:
            logger.info(f"Actualización omitida: {reason}")
            logger.info(f"Última actualización: {progress.get('last_complete_timestamp', 'Nunca')}")
            logger.info(f"Para forzar actualización, establece FORCE_UPDATE = True en el script")
            return True
        
        logger.info(f"Actualización procediendo: {reason}")
        
        # 3. Crear backup
        backup_file = self.create_backup()
        if not backup_file:
            logger.error("No se pudo crear el backup. Abortando.")
            return False
        
        # 4. Cargar datos
        try:
            with open(PROPOSALS_FILE, 'r', encoding='utf-8') as f:
                proposals = json.load(f)
            logger.info(f"Cargadas {len(proposals)} propuestas")
        except Exception as e:
            logger.error(f"Error cargando propuestas: {e}")
            return False
        
        # 5. Actualizar votos
        try:
            updated_proposals = self.update_proposals(proposals, progress)
            
            # 6. Guardar datos finales
            self.save_proposals(updated_proposals)
            
            # 7. Marcar como completada
            self.mark_complete(progress)
            
            # 8. Generar reporte
            self.generate_report(progress)
            
            logger.info("Actualización completada exitosamente!")
            return True
            
        except KeyboardInterrupt:
            logger.info("Proceso interrumpido. Guardando progreso...")
            self.save_progress(progress)
            self.save_proposals(proposals)
            return False
        except Exception as e:
            logger.error(f"Error durante la actualización: {e}")
            return False

def main():
    """Función principal"""
    updater = VoteUpdater()
    
    try:
        success = updater.run()
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        logger.info("Proceso interrumpido")
        sys.exit(1)

if __name__ == "__main__":
    main()
