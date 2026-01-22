# Scraper de Presupuestos Participativos Valladolid

Este script extrae información detallada de las propuestas de los presupuestos participativos de Valladolid para facilitar su análisis estadístico y procesamiento por parte de LLMs.

## Características

- **Arquitectura de dos fases**:
    1. **Descubrimiento**: Localiza y guarda todas las URLs de propuestas en `discovered_urls.json`.
    2. **Extracción**: Descarga y limpia el contenido detallado de cada propuesta.
- **Robustez**: Capacidad de reanudación automática. Si se interrumpe, continúa donde se quedó saltando las URLs ya procesadas en `proposals_data.json`.
- **Barra de progreso**: Interfaz visual con `tqdm` que muestra el progreso real, velocidad y tiempo estimado (ETA).
- **Limpieza de datos**: Extrae direcciones, autores y elimina boilerplate publicitario de las descripciones.
- **Geolocalización**: Normaliza coordenadas GPS para su uso en mapas.

## Instalación

Asegúrate de tener instaladas las dependencias necesarias:

```bash
pip install requests beautifulsoup4 tqdm
```

## Uso

Para ejecutar el scraping completo:

```bash
python3 scrape_budgets.py
```

## Archivos de Salida

- `proposals_data.json`: Datos estructurados completos en formato JSON.
- `proposals_data.csv`: Versión en CSV para abrir en Excel o herramientas de análisis.
- `discovered_urls.json`: Registro de todas las propuestas detectadas para futuras actualizaciones rápidas.

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
