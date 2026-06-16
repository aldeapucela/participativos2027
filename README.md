# Participativos2027 - Plataforma Web de Presupuestos Participativos Valladolid

Esta aplicación web extrae, procesa y visualiza información detallada de las propuestas de los presupuestos participativos de Valladolid para facilitar su análisis estadístico y exploración interactiva.

## Características

### Aplicación Web
- **Visualización interactiva**: Mapa interactivo con todas las propuestas geolocalizadas.
- **Filtros dinámicos**: Búsqueda y filtrado por zona, autor, votos y palabras clave.
- **Vista detallada**: Información completa de cada propuesta con documentos adjuntos.
- **Diseño responsivo**: Interfaz moderna adaptable a dispositivos móviles y escritorio.

### Sistema de Extracción de Datos
- **Arquitectura de dos fases**:
    1. **Descubrimiento**: Localiza y guarda todas las URLs de propuestas en `discovered_urls.json`.
    2. **Extracción**: Descarga y limpia el contenido detallado de cada propuesta.
- **Robustez**: Capacidad de reanudación automática. Si se interrumpe, continúa donde se quedó saltando las URLs ya procesadas en `proposals_data.json`.
- **Barra de progreso**: Interfaz visual con `tqdm` que muestra el progreso real, velocidad y tiempo estimado (ETA).
- **Limpieza de datos**: Extrae direcciones, autores y elimina boilerplate publicitario de las descripciones.
- **Geolocalización**: Normaliza coordenadas GPS para su uso en mapas.

## Instalación y Uso

### Como aplicación web

Abre el archivo `index.html` en tu navegador:

```bash
# Opción 1: Abrir directamente
open index.html

# Opción 2: Servidor local (recomendado)
python3 -m http.server 8000
# Luego visita http://localhost:8000
```

### Para extraer datos

Si deseas actualizar los datos o ejecutar el scraping:

```bash
pip install requests beautifulsoup4 tqdm
python3 scripts/scrape_budgets.py
```

### Para comparar con el listado municipal actual

Si deseas generar un snapshot externo y compararlo con el histórico interno:

```bash
python3 scripts/compare_current_listing.py --date 2026-06-12
```

Consulta [README_COMPARE_CURRENT_LISTING.md](README_COMPARE_CURRENT_LISTING.md) para el detalle del flujo y los artefactos generados.

## Licencia

### Código Fuente
El código fuente de esta aplicación está licenciado bajo **GNU Affero General Public License v3.0 (AGPL-3.0)**. Ver archivo [LICENSE](LICENSE) para el texto completo.

### Datos
Los datos generados (archivos JSON/CSV en el directorio `/data`) están licenciados bajo **Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)** por Aldea Pucela. 

**Fuente de datos original**: Ayuntamiento de Valladolid (CC BY 3.0 ES) - https://www.valladolid.es/es/temas/hacemos/open-data-datos-abiertos

Los datos han sido procesados, limpiados, geolocalizados y enriquecidos por Aldea Pucela, liberándose bajo CC BY-SA 4.0. Ver archivo [LICENSE-DATA](LICENSE-DATA) para más información sobre atribución requerida.

## Archivos de Salida

- `proposals_data.json`: Datos estructurados completos en formato JSON.
- `proposals_data.csv`: Versión en CSV para abrir en Excel o herramientas de análisis.
- `discovered_urls.json`: Registro de todas las propuestas detectadas para futuras actualizaciones rápidas.
- `final_proposals_snapshot_YYYY-MM-DD.json`: Snapshot externo del listado municipal actual.
- `mesa-final-unificado.csv`: Dataset comparado entre actas de mesa y listado final, enriquecible con razones de exclusión.

## Refresco de razones de exclusion en mesas

Si el Ayuntamiento va publicando nuevos bloques de `Informe de inviabilidad` dentro de las fichas de las propuestas, puedes refrescar el dataset de mesas con:

```bash
python3 scripts/enrich_mesa_exclusion_reasons.py
```

Si solo quieres recalcular la clasificación local de motivos ya guardados en el CSV, sin volver a leer la web municipal:

```bash
python3 scripts/enrich_mesa_exclusion_reasons.py --skip-web
```

El script:

- relee las fichas públicas de propuestas `en mesa pero fuera de la final` y `descartadas por mesa y fuera de la final`;
- da prioridad al texto oficial de `Informe de inviabilidad` cuando exista;
- conserva como fallback una razón resumida desde el acta cuando todavía no hay texto publicado en la ficha;
- imprime un resumen final con cuántas filas tienen motivo web, cuántas siguen con fallback de acta y cuántas continúan sin motivo.
- `proposals_comparison_YYYY-MM-DD.json`: Comparativa completa en JSON.
- `proposals_comparison_YYYY-MM-DD.csv`: Comparativa completa en CSV.
- `proposals_comparison_summary_YYYY-MM-DD.json`: Resumen por zona.
- `proposals_comparison_report_YYYY-MM-DD.md`: Informe narrativo de la comparativa.

## Estructura del Proyecto

```
participativos2027/
├── index.html              # Página principal de la aplicación web
├── style.css              # Estilos de la interfaz
├── src/                   # Código JavaScript de la aplicación
│   ├── main.js            # Controlador principal
│   ├── mapController.js   # Gestión del mapa interactivo
│   ├── uiController.js    # Control de la interfaz de usuario
│   └── dataService.js     # Servicio de carga y gestión de datos
├── scripts/               # Scripts de extracción de datos
│   └── scrape_budgets.py  # Script principal de scraping
├── data/                  # Datos generados
│   ├── proposals_data.json
│   ├── proposals_data.csv
│   ├── proposals_metadata.json
│   └── discovered_urls.json
├── LICENSE                # Licencia AGPL-3.0 para el código
├── LICENSE-DATA           # Licencia CC BY-SA 4.0 para los datos
└── README.md              # Este archivo
```

## Campos Extraídos

- `code`: ID de la propuesta.
- `date`: Fecha de publicación.
- `title`: Título de la propuesta.
- `author`: Persona u organización que la propone.
- `description`: Descripción limpia.
- `address`: Ubicación textual extraída.
- `zone`: Nombre de la zona.
- `zone_id`: ID numérico de la zona (1-10).
- `votes`: Número de apoyos recibidos.
- `latitude` / `longitude`: Coordenadas geográficas.
- `image_url`: Enlace a la imagen principal.
- `documents`: Lista de documentos adjuntos (nombre y URL).
