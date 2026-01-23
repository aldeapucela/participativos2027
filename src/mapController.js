/**
 * Participativos2027 - Plataforma Web de Presupuestos Participativos Valladolid
 * Copyright (C) 2025
 * 
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 * 
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 * 
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/**
 * Controller to handle Leaflet Map logic
 */
export class MapController {
    constructor(elementId, center = [41.6523, -4.7285]) { // Valladolid coordinates
        // Check if map container already has a map instance
        const container = L.DomUtil.get(elementId);
        if (container && container._leaflet_id) {
            try {
                container._leaflet_map?.remove?.();
            } catch (e) {
            }
            delete container._leaflet_id;
            while (container.firstChild) {
                container.removeChild(container.firstChild);
            }
        }
        
        this.map = L.map(elementId, {
            zoomControl: false, // Custom position later
            maxZoom: 20 // Required for MarkerClusterGroup
        }).setView(center, 13);

        if (container) {
            container._leaflet_map = this.map;
        }

        // Create marker cluster group instead of regular layer group
        this.markers = L.markerClusterGroup({
            chunkedLoading: true,
            chunkProgress: function(processed, total) {
                console.log(`Loading clusters: ${processed}/${total}`);
            },
            spiderfyOnMaxZoom: true, // Show spiderfy when too many markers at same location
            showCoverageOnHover: true, // Show coverage area on hover
            zoomToBoundsOnClick: true, // Zoom to cluster bounds on click
            maxClusterRadius: 45, // Minimal clustering - only cluster very close markers
            iconCreateFunction: function(cluster) {
                var childCount = cluster.getChildCount();
                var c = ' marker-cluster-';
                if (childCount < 10) {
                    c += 'small';
                } else if (childCount < 100) {
                    c += 'medium';
                } else {
                    c += 'large';
                }
                return new L.DivIcon({ 
                    html: '<div><span>' + childCount + '</span></div>', 
                    className: 'marker-cluster ' + c, 
                    iconSize: new L.Point(40, 40) 
                });
            }
        }).addTo(this.map);

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
        const boundsForFit = [];
        const valladolidCenter = [41.6523, -4.7285];
        const maxDistanceKmForFit = 30;
        const minCityZoom = 12;

        const distanceKm = (a, b) => {
            const toRad = (deg) => (deg * Math.PI) / 180;
            const R = 6371;
            const dLat = toRad(b[0] - a[0]);
            const dLon = toRad(b[1] - a[1]);
            const lat1 = toRad(a[0]);
            const lat2 = toRad(b[0]);
            const sinDLat = Math.sin(dLat / 2);
            const sinDLon = Math.sin(dLon / 2);
            const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
            return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
        };

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
                        <div style="display: flex; align-items: center; justify-content: space-between; padding-top: 10px; border-top: 1px solid #e5e7eb;">
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <i class="${categoryIcon}" style="color: ${categoryColor}; font-size: 15px;"></i>
                                <span style="font-size: 11px; font-weight: 600; text-transform: uppercase; color: #4f46e5; letter-spacing: 0.5px;">
                                    ${this.cleanCategoryName(proposal.category)}
                                </span>
                            </div>
                            <div style="display: flex; align-items: center; color: #9ca3af; font-size: 10px; font-weight: 500;">
                                <i class="fa-solid fa-heart" style="margin-right: 2px;"></i>
                                ${proposal.votes || 0}
                            </div>
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

                // Only use sane points around Valladolid for fitBounds (prevents zooming out due to bad geocoding)
                const d = distanceKm(valladolidCenter, [proposal.lat, proposal.lng]);
                if (d <= maxDistanceKmForFit) {
                    boundsForFit.push([proposal.lat, proposal.lng]);
                }
            }
        });

        if (bounds.length > 0) {
            // On mobile, don't use fitBounds to prevent unwanted resizing
            if (window.innerWidth < 768) {
                // Set a reasonable center and zoom for mobile
                this.map.setView([41.6523, -4.7285], 13);
            } else {
                // On desktop, use fitBounds but ignore far outliers (bad geocoding)
                if (boundsForFit.length > 0) {
                    const targetZoom = this.map.getBoundsZoom(boundsForFit, false, [50, 50]);
                    if (targetZoom < minCityZoom) {
                        // Prioritize a city-level view even if some points are far apart
                        this.map.setView(valladolidCenter, minCityZoom);
                    } else {
                        this.map.fitBounds(boundsForFit, { padding: [50, 50], maxZoom: 15 });
                    }
                } else {
                    this.map.setView(valladolidCenter, 13);
                }
            }
        }
    }

    centerOnProposal(lat, lng) {
        if (lat && lng) {
            this.map.setView([lat, lng], 18);
        }
    }

    cleanCategoryName(category) {
        // Remove emojis and special characters from category name
        return category.replace(/[^\w\sáéíóúÁÉÍÓÚñÑüÜ-]/g, '').trim();
    }

    getCategoryIcon(category) {
        const icons = {
            'Parques y Naturaleza': 'fa-solid fa-tree',
            'Parques y Jardines': 'fa-solid fa-tree',
            'Instalaciones Deportivas': 'fa-solid fa-futbol',
            'Movilidad Ciclista': 'fa-solid fa-bicycle',
            'Urbanismo': 'fa-solid fa-building',
            'Movilidad Activa': 'fa-solid fa-person-biking',
            'Limpieza y Residuos': 'fa-solid fa-broom',
            'Pavimentación y Aceras': 'fa-solid fa-road',
            'Transporte y Tráfico': 'fa-solid fa-bus',
            'Infancia y Juegos': 'fa-solid fa-child',
            'Infancia y Educación': 'fa-solid fa-graduation-cap',
            'Social y Equipamientos': 'fa-solid fa-users',
            'Educación y Colegios': 'fa-solid fa-school',
            'Seguridad y Convivencia': 'fa-solid fa-shield-halved',
            'Seguridad Vial': 'fa-solid fa-car',
            'Medio Ambiente': 'fa-solid fa-leaf',
            'Grandes Infraestructuras': 'fa-solid fa-hammer',
            'Mobiliario e Iluminación': 'fa-solid fa-lightbulb',
            'Zona Vías': 'fa-solid fa-train',
            'Zonas Caninas': 'fa-solid fa-dog',
            'Accesibilidad': 'fa-solid fa-wheelchair',
            'Alumbrado Público': 'fa-solid fa-lightbulb',
            'Cultura y Juventud': 'fa-solid fa-masks-theater',
            'Cultura y Patrimonio': 'fa-solid fa-landmark',
            '♿ Accesibilidad': 'fa-solid fa-wheelchair',
            '💡 Alumbrado Público': 'fa-solid fa-lightbulb',
            '🎭 Cultura y Juventud': 'fa-solid fa-masks-theater',
            '👶 Infancia y Educación': 'fa-solid fa-graduation-cap'
        };
        return icons[category] || 'fa-solid fa-location-dot';
    }

    getCategoryColor(category) {
        const colors = {
            'Parques y Naturaleza': '#22c55e',
            'Parques y Jardines': '#22c55e',
            'Instalaciones Deportivas': '#f59e0b',
            'Movilidad Ciclista': '#3b82f6',
            'Urbanismo': '#64748b',
            'Movilidad Activa': '#06b6d4',
            'Limpieza y Residuos': '#78350f',
            'Pavimentación y Aceras': '#f97316',
            'Transporte y Tráfico': '#ef4444',
            'Infancia y Juegos': '#ec4899',
            'Infancia y Educación': '#2563eb',
            'Social y Equipamientos': '#8b5cf6',
            'Educación y Colegios': '#3b82f6',
            'Seguridad y Convivencia': '#1e293b',
            'Seguridad Vial': '#dc2626',
            'Medio Ambiente': '#10b981',
            'Grandes Infraestructuras': '#475569',
            'Mobiliario e Iluminación': '#eab308',
            'Zona Vías': '#374151',
            'Zonas Caninas': '#a16207',
            'Accesibilidad': '#0891b2',
            'Alumbrado Público': '#eab308',
            'Cultura y Juventud': '#c026d3',
            'Cultura y Patrimonio': '#9333ea',
            '♿ Accesibilidad': '#0891b2',
            '💡 Alumbrado Público': '#eab308',
            '🎭 Cultura y Juventud': '#c026d3',
            '👶 Infancia y Educación': '#2563eb'
        };
        return colors[category] || '#94a3b8';
    }
}
