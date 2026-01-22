/**
 * Controller to handle Leaflet Map logic
 */
export class MapController {
    constructor(elementId, center = [41.6523, -4.7285]) { // Valladolid coordinates
        this.map = L.map(elementId, {
            zoomControl: false // Custom position later
        }).setView(center, 13);

        this.markers = L.layerGroup().addTo(this.map);

        // CartoDB Positron Tiles (cleaner look)
        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
            subdomains: 'abcd',
            maxZoom: 20
        }).addTo(this.map);

        // Zoom Control to topright
        L.control.zoom({ position: 'topright' }).addTo(this.map);
    }

    renderMarkers(proposals, onClickCallback) {
        this.markers.clearLayers();

        if (proposals.length === 0) return;

        const bounds = [];

        proposals.forEach(proposal => {
            if (proposal.lat && proposal.lng) {
                const categoryIcon = this.getCategoryIcon(proposal.category);
                const categoryColor = this.getCategoryColor(proposal.category);

                // Create custom icon with FontAwesome (white on colored background)
                const icon = L.divIcon({
                    html: `<div style="background-color: ${categoryColor}; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 3px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.3);"><i class="${categoryIcon}" style="color: white; font-size: 16px;"></i></div>`,
                    className: 'custom-marker',
                    iconSize: [36, 36],
                    iconAnchor: [18, 18]
                });

                const marker = L.marker([proposal.lat, proposal.lng], { icon });

                // Professional popup with better spacing
                marker.bindPopup(`
                    <div style="min-width: 260px; padding: 12px;">
                        <a href="${proposal.external_url}" target="_blank" style="text-decoration: none; color: inherit; display: block; margin-bottom: 12px;">
                            <h3 style="margin: 0 0 8px 0; font-size: 15px; font-weight: 700; color: #111827; line-height: 1.3;">
                                ${proposal.title}
                            </h3>
                        </a>
                        <p style="margin: 0 0 12px 0; font-size: 13px; color: #6b7280; line-height: 1.5;">
                            ${proposal.summary}
                        </p>
                        <div style="display: flex; align-items: center; gap: 8px; padding-top: 10px; border-top: 1px solid #e5e7eb;">
                            <i class="${categoryIcon}" style="color: ${categoryColor}; font-size: 15px;"></i>
                            <span style="font-size: 11px; font-weight: 600; text-transform: uppercase; color: #4f46e5; letter-spacing: 0.5px;">
                                ${proposal.category}
                            </span>
                        </div>
                    </div>
                `, {
                    maxWidth: 300,
                    className: 'custom-popup'
                });

                marker.on('click', () => {
                    onClickCallback(proposal.id);
                });

                marker.addTo(this.markers);
                bounds.push([proposal.lat, proposal.lng]);
            }
        });

        if (bounds.length > 0) {
            this.map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
        }
    }

    getCategoryIcon(category) {
        const icons = {
            '🌳 Parques y Naturaleza': 'fa-solid fa-tree',
            '⚽ Instalaciones Deportivas': 'fa-solid fa-futbol',
            '🚲 Movilidad Ciclista': 'fa-solid fa-bicycle',
            '🏢 Urbanismo': 'fa-solid fa-building',
            '🚲 Movilidad Activa': 'fa-solid fa-person-biking',
            '🧹 Limpieza y Residuos': 'fa-solid fa-broom',
            '🚧 Pavimentación y Aceras': 'fa-solid fa-road',
            '🚌 Transporte y Tráfico': 'fa-solid fa-bus',
            '🧸 Infancia y Juegos': 'fa-solid fa-child',
            '👵 Social y Equipamientos': 'fa-solid fa-users',
            '🏫 Educación y Colegios': 'fa-solid fa-school',
            '👮 Seguridad y Convivencia': 'fa-solid fa-shield-halved',
            '🌿 Medio Ambiente': 'fa-solid fa-leaf',
            '🏗️ Grandes Infraestructuras': 'fa-solid fa-hammer',
            '💡 Mobiliario e Iluminación': 'fa-solid fa-lightbulb'
        };
        return icons[category] || 'fa-solid fa-location-dot';
    }

    getCategoryColor(category) {
        const colors = {
            '🌳 Parques y Naturaleza': '#22c55e',
            '⚽ Instalaciones Deportivas': '#f59e0b',
            '🚲 Movilidad Ciclista': '#3b82f6',
            '🏢 Urbanismo': '#64748b',
            '🚲 Movilidad Activa': '#06b6d4',
            '🧹 Limpieza y Residuos': '#78350f',
            '🚧 Pavimentación y Aceras': '#f97316',
            '🚌 Transporte y Tráfico': '#ef4444',
            '🧸 Infancia y Juegos': '#ec4899',
            '👵 Social y Equipamientos': '#8b5cf6',
            '🏫 Educación y Colegios': '#3b82f6',
            '👮 Seguridad y Convivencia': '#1e293b',
            '🌿 Medio Ambiente': '#10b981',
            '🏗️ Grandes Infraestructuras': '#475569',
            '💡 Mobiliario e Iluminación': '#eab308'
        };
        return colors[category] || '#94a3b8';
    }
}
