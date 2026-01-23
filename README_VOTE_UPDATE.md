# Actualización de Votos - Propuestas Participativas 2027

## Overview

Script ultra-optimizado para actualizar los votos de casi 1000 propuestas en **~2 minutos** usando procesamiento concurrente y control inteligente de tiempo.

## 📁 Archivos

- `scripts/update_votes.py` - Script principal ultra-rápido (8 hilos concurrentes)
- `scripts/retry_failed_proposals.py` - Script para reintentar propuestas fallidas
- `scripts/scrape_budgets.py` - Script original de scraping
- `data/proposals_data.json` - Base de datos de propuestas
- `data/update_progress.json` - Archivo de progreso y control de tiempo
- `logs/vote_update.log` - Log del proceso (no se sube a git)
- `data/backups/` - Directorio de backups automáticos

## ⚡ Rendimiento

### Velocidad medida:
- **7.7 propuestas/segundo**
- **0.131 segundos por propuesta**
- **~2 minutos** para 967 propuestas
- **19.8x más rápido** que la versión original

### Configuración optimizada:
- **8 hilos concurrentes**
- **Delay base**: 0.1s
- **Timeout**: 10s
- **Lotes**: 200 propuestas
- **Retries**: 2 intentos

## 🔄 Workflow Inteligente

### Control de Tiempo Automático:
- **Mínimo 1 hora** entre actualizaciones completas
- **Verificación automática** del tiempo transcurrido
- **Forzado manual** disponible si es necesario
- **Timestamp registrado** para control futuro

### Flujo de Ejecución:
1. **Verifica tiempo** → Omite si no ha pasado suficiente tiempo
2. **Crea backup** → Siempre antes de modificar datos
3. **Actualiza votos** → Procesamiento concurrente ultra-rápido
4. **Guarda datos** → Actualiza archivo principal
5. **Marca completado** → Registra timestamp para siguiente ejecución
6. **Genera reporte** → Estadísticas detalladas

## 🚀 Uso

### Actualización Normal
```bash
python3 scripts/update_votes.py
```

El script verificará automáticamente si ha pasado suficiente tiempo desde la última actualización.

### Forzar Actualización
Edita `scripts/update_votes.py` y cambia:
```python
FORCE_UPDATE = True
```

### Reintentar Propuestas Fallidas
```bash
python3 scripts/retry_failed_proposals.py
```

## ⏱️ Comportamiento Temporal

### Escenarios:
- **Primera ejecución**: Siempre se ejecuta
- **Ejecución normal**: Solo si ha pasado ≥ 1 hora
- **Ejecución forzada**: Siempre se ejecuta (ignorando tiempo)
- **Interrumpida**: Continúa desde donde se detuvo

### Mensajes típicos:
```
✅ Actualización procediendo: Han pasado 2.5 horas (mínimo: 1)
⏸️  Actualización omitida: Debe esperar 0.3 horas más (mínimo: 1)
🔄 Actualización procediendo: Forzado por configuración
```

## 📊 Archivos Generados

### Durante el proceso:
- `data/update_progress.json` - Progreso y timestamps
- `logs/vote_update.log` - Log detallado (no se sube a git)
- `data/backups/proposals_data_backup_*.json` - Backups automáticos

### Al finalizar:
- `data/vote_update_report_*.txt` - Reporte completo
- `data/proposals_data.json` - Datos actualizados

## 🛡️ Características de Robustez

### Anti-bloqueo:
- Rate limiting con delays aleatorios
- Headers realistas de navegador
- Retries exponenciales
- Pausas estratégicas cada 200 peticiones

### Resiliencia:
- **Backups automáticos** antes de modificar
- **Checkpoint system** para reanudar si se interrumpe
- **Procesamiento por lotes** eficiente
- **Logging detallado** de errores y éxitos

### Monitoreo:
- Barra de progreso con estadísticas en tiempo real
- Reporte final completo
- Validación de integridad de datos

## 🔧 Configuración

Parámetros ajustables en `update_votes.py`:

```python
# Control de tiempo
MIN_UPDATE_INTERVAL_HOURS = 1  # Mínimo tiempo entre actualizaciones
FORCE_UPDATE = False  # Forzar actualización

# Rendimiento
BASE_DELAY = 0.1  # segundos entre peticiones
MAX_RETRIES = 2  # reintentos por propuesta
BATCH_SIZE = 200  # propuestas por lote
PAUSE_EVERY = 200  # pausa cada N peticiones
PAUSE_DURATION = 5  # segundos de pausa
TIMEOUT = 10  # segundos timeout
MAX_WORKERS = 8  # hilos concurrentes
```

## 📈 Recuperación en caso de errores

### Si algo falla:
1. **Backup disponible**: En `data/backups/`
2. **Progreso guardado**: En `data/update_progress.json`
3. **Log de errores**: En `logs/vote_update.log`

### Para restaurar backup:
```bash
# Listar backups
ls -la data/backups/

# Restaurar último backup
cp data/backups/proposals_data_backup_YYYYMMDD_HHMMSS.json data/proposals_data.json
```

### Para limpiar progreso:
```bash
rm data/update_progress.json
```

## 📊 Monitoreo y Logs

### Ver logs en tiempo real:
```bash
tail -f logs/vote_update.log
```

### Ver errores recientes:
```bash
grep ERROR logs/vote_update.log
```

### Ver estadísticas:
```bash
grep "Propuestas procesadas" logs/vote_update.log
```

## 🎯 Recomendaciones

1. **Ejecutar en horario valle** para menor carga del servidor
2. **Monitorizar el log** si hay muchos errores
3. **No interrumpir** durante un lote si es posible
4. **Verificar reporte** al finalizar
5. **Usar retry script** si quedaron propuestas fallidas

## 🔍 Solución de problemas

### Errores comunes:
- **429 Too Many Requests**: El script maneja esto automáticamente con retries
- **Timeout**: Ya está optimizado a 10s
- **No se encuentran votos**: El retry script maneja casos especiales

### Estados de actualización:
- **"Sin apoyos"**: Registrado como 0 votos
- **Span no encontrado**: Búsqueda alternativa en HTML
- **Timeout persistente**: Reintentar con script de recovery

## 🔒 Seguridad

- ✅ **Backups automáticos** antes de modificar
- ✅ **Validación de datos** post-actualización
- ✅ **Reintentos inteligentes** ante fallos
- ✅ **Logs completos** para auditoría
- ✅ **Recuperación granular** por propuesta
- ✅ **Anti-bloqueo** con rate limiting
- ✅ **Control de tiempo** para evitar sobre-carga

## 📊 Comparación de Versiones

| Característica | Versión Original | Versión Actual |
|---------------|------------------|----------------|
| Tiempo total | 40 minutos | **2 minutos** |
| Velocidad | 0.4 prop/s | **7.7 prop/s** |
| Hilos | 1 | **8 concurrentes** |
| Delay | 1.5s | **0.1s** |
| Control tiempo | No | **Sí** |
| Speedup | 1x | **19.8x** |

La versión actual mantiene toda la robustez de la original pero es **20 veces más rápida** con control inteligente de tiempo.

## 🤖 Automatización con GitHub Actions

El sistema ahora incluye **automatización completa** mediante GitHub Actions:

### **Características:**
- **Ejecución automática**: Todos los días a las 2:00 AM UTC
- **Ejecución manual**: Disponible desde GitHub UI
- **Detección inteligente**: Solo hace commit si hay cambios
- **Reintentos automáticos**: Ejecuta script de retry si hay errores
- **Reportes detallados**: Summary con estadísticas y logs en GitHub

### **Monitoreo:**
- Verificar ejecuciones en: GitHub → Actions → "Actualizar Votos Diarios"
- Historial completo de logs y resultados
- Estadísticas de cada actualización

### **Control Manual:**
Para ejecutar manualmente:
1. GitHub → Actions → "Actualizar Votos Diarios"
2. Click en "Run workflow" → "Run workflow"