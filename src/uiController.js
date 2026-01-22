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
 * Controller to handle DOM rendering for list and filters
 */
export class UIController {
    constructor() {
        this.listElement = document.getElementById('proposals-list');
        this.filterContainer = document.getElementById('category-filters');
        this.zoneFilterContainer = document.getElementById('zone-filters');
        this.countElement = document.getElementById('proposals-count');
        this.searchInput = document.getElementById('search-input');
        this.activeTagsContainer = document.getElementById('active-tags-container');
        this.activeTagsElement = document.getElementById('active-tags');
        this.popularTagsElement = document.getElementById('popular-tags');

        this.activeCategory = 'Todas';
        this.activeZone = 'Todas zonas';
        this.activeTags = new Set();
        this.showAllTags = false;

        // Setup toggle for popular tags section
        const toggleBtn = document.getElementById('toggle-tags');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => {
                this.popularTagsElement.classList.toggle('hidden');
                toggleBtn.querySelector('i').className = this.popularTagsElement.classList.contains('hidden')
                    ? 'fa-solid fa-chevron-right'
                    : 'fa-solid fa-chevron-down';
            });
        }
    }

    renderFilters(categories, allProposals, onFilterClick) {
        const allCategories = ['Todas', 
    ...categories.filter(cat => cat !== 'Inadmitidas' && cat !== 'Sin categoría' && cat !== 'Zona Vías').sort((a, b) => a.localeCompare(b, 'es')),
    'Inadmitidas', 
    'Sin categoría', 
    'Zona Vías'];
        
        // Display names with emojis for better UX
        const displayNames = {
            'Todas': 'Todas categorias',
            'Parques y Naturaleza': '🌳 Parques y Naturaleza',
            'Instalaciones Deportivas': '⚽ Instalaciones Deportivas',
            'Movilidad Ciclista': '🚲 Movilidad Ciclista',
            'Urbanismo': '🏢 Urbanismo',
            'Movilidad Activa': '🚲 Movilidad Activa',
            'Parques y Jardines': '🌳 Parques y Jardines',
            'Limpieza y Residuos': '🧹 Limpieza y Residuos',
            'Pavimentación y Aceras': '🚧 Pavimentación y Aceras',
            'Transporte y Tráfico': '🚌 Transporte y Tráfico',
            'Infancia y Juegos': '🧸 Infancia y Juegos',
            'Social y Equipamientos': '👵 Social y Equipamientos',
            'Educación y Colegios': '🏫 Educación y Colegios',
            'Seguridad y Convivencia': '👮 Seguridad y Convivencia',
            'Medio Ambiente': '🌿 Medio Ambiente',
            'Grandes Infraestructuras': '🏗️ Grandes Infraestructuras',
            'Mobiliario e Iluminación': '💡 Mobiliario e Iluminación',
            'Inadmitidas': '🚫 Inadmitidas',
            'Zona Vías': '🚂 Zona Vías',
            'Accesibilidad': '♿ Accesibilidad',
            'Cultura y Juventud': '🎭 Cultura y Juventud',
            'Infancia y Educación': '👶 Infancia y Educación',
            'Alumbrado Público': '💡 Alumbrado Público',
            ' Social y Equipamientos': '👵 Social y Equipamientos'
        };

        // Count proposals per category
        const counts = {};
        allCategories.forEach(cat => {
            if (cat === 'Todas') {
                counts[cat] = allProposals.length;
            } else if (cat === 'Zona Vías') {
                counts[cat] = allProposals.filter(p => p.tags.includes('Ferroviario')).length;
            } else {
                counts[cat] = allProposals.filter(p => p.category === cat).length;
            }
        });

        this.filterContainer.innerHTML = `
            <div class="relative w-full md:w-auto">
                <select id="category-select" class="w-full md:w-64 px-4 py-2 pr-10 border border-gray-300 rounded-lg bg-white text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 appearance-none cursor-pointer truncate overflow-hidden whitespace-nowrap text-ellipsis">
                    ${allCategories.map(cat => `
                        <option value="${cat}" ${this.activeCategory === cat ? 'selected' : ''}>
                            ${displayNames[cat] || cat} (${counts[cat]})
                        </option>
                    `).join('')}
                </select>
                <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-gray-500">
                    <i class="fa-solid fa-chevron-down text-xs"></i>
                </div>
            </div>
        `;

        // Add event listener
        document.getElementById('category-select').addEventListener('change', (e) => {
            this.activeCategory = e.target.value;
            onFilterClick(this.activeCategory);
        });
    }

    renderZoneFilters(allProposals, onZoneFilterClick) {
        // Extract unique zones and sort by zone_id
        const zonesMap = new Map();
        allProposals.forEach(p => {
            // Try to use zone_id if available, otherwise extract from zone name
            let zoneId = p.zone_id;
            if (zoneId === undefined && p.zone) {
                // Extract zone_id from zone name (e.g., "1. Zona Este 1:" -> 1)
                const match = p.zone.match(/^(\d+)\./);
                if (match) {
                    zoneId = parseInt(match[1]);
                }
            }
            
            if (p.zone && zoneId !== undefined) {
                zonesMap.set(zoneId, p.zone);
            }
        });
        
        // Convert to array and sort by zone_id
        const zones = Array.from(zonesMap.entries())
            .sort((a, b) => a[0] - b[0])
            .map(([id, name]) => ({ id, name }));
        
        // Add "Todas" option
        const allZones = [{ id: 0, name: 'Todas zonas' }, ...zones];
        
        // Count proposals per zone
        const counts = {};
        allZones.forEach(zone => {
            if (zone.id === 0) {
                counts[zone.name] = allProposals.length;
            } else {
                counts[zone.name] = allProposals.filter(p => {
                    let pZoneId = p.zone_id;
                    if (pZoneId === undefined && p.zone) {
                        const match = p.zone.match(/^(\d+)\./);
                        if (match) {
                            pZoneId = parseInt(match[1]);
                        }
                    }
                    return pZoneId === zone.id;
                }).length;
            }
        });

        this.zoneFilterContainer.innerHTML = `
            <div class="relative w-full md:w-auto">
                <select id="zone-select" class="w-full md:w-64 px-4 py-2 pr-10 border border-gray-300 rounded-lg bg-white text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 appearance-none cursor-pointer truncate overflow-hidden whitespace-nowrap text-ellipsis">
                    ${allZones.map(zone => `
                        <option value="${zone.name}" ${this.activeZone === zone.name ? 'selected' : ''}>
                            ${zone.name === 'Todas zonas' ? zone.name + ` (${allProposals.length})` : `${zone.name} (${counts[zone.name]})`}
                        </option>
                    `).join('')}
                </select>
                <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-gray-500">
                    <i class="fa-solid fa-chevron-down text-xs"></i>
                </div>
            </div>
        `;

        // Add event listener
        document.getElementById('zone-select').addEventListener('change', (e) => {
            this.activeZone = e.target.value;
            onZoneFilterClick(this.activeZone);
        });
    }

    renderPopularTags(allProposals, onTagClick) {
        // Calculate tag frequency
        const tagCounts = {};
        allProposals.forEach(p => {
            p.tags.forEach(tag => {
                tagCounts[tag] = (tagCounts[tag] || 0) + 1;
            });
        });

        // Sort by frequency
        const sortedTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]);

        // Show top 15 or all based on state
        const tagsToShow = this.showAllTags ? sortedTags : sortedTags.slice(0, 15);

        this.popularTagsElement.innerHTML = tagsToShow.map(([tag, count]) => {
            const isActive = this.activeTags.has(tag);
            return `
                <button class="popular-tag text-[11px] px-2 py-1 rounded-md border transition-colors cursor-pointer ${isActive
                    ? 'bg-indigo-100 text-indigo-700 border-indigo-300 font-semibold'
                    : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200'
                }" data-tag="${tag}">
                    ${tag} <span class="text-[9px] opacity-70">(${count})</span>
                </button>
            `;
        }).join('');

        // Add "Ver todas" / "Ver menos" link
        if (!this.showAllTags && sortedTags.length > 15) {
            const viewAllBtn = document.createElement('button');
            viewAllBtn.className = 'text-xs text-indigo-600 hover:text-indigo-800 font-semibold underline';
            viewAllBtn.textContent = `Ver todas (${sortedTags.length})`;
            viewAllBtn.addEventListener('click', () => {
                this.showAllTags = true;
                this.renderPopularTags(allProposals, onTagClick);
            });
            this.popularTagsElement.appendChild(viewAllBtn);
        } else if (this.showAllTags) {
            const showLessBtn = document.createElement('button');
            showLessBtn.className = 'text-xs text-gray-500 hover:text-gray-700 font-semibold underline';
            showLessBtn.textContent = 'Ver menos';
            showLessBtn.addEventListener('click', () => {
                this.showAllTags = false;
                this.renderPopularTags(allProposals, onTagClick);
            });
            this.popularTagsElement.appendChild(showLessBtn);
        }

        // Add click handlers to tag buttons
        this.popularTagsElement.querySelectorAll('.popular-tag').forEach(btn => {
            btn.addEventListener('click', () => {
                const tag = btn.getAttribute('data-tag');
                onTagClick(tag);
            });
        });
    }

    renderActiveTags(onRemoveTag) {
        if (this.activeTags.size === 0) {
            this.activeTagsContainer.classList.add('hidden');
            return;
        }

        this.activeTagsContainer.classList.remove('hidden');
        this.activeTagsElement.innerHTML = '';

        this.activeTags.forEach(tag => {
            const chip = document.createElement('div');
            chip.className = 'flex items-center gap-1 bg-indigo-100 text-indigo-700 px-2 py-1 rounded-md text-xs font-medium border border-indigo-300';
            chip.innerHTML = `
                <span>${tag}</span>
                <button class="hover:bg-indigo-200 rounded-full p-0.5 transition-colors" data-tag="${tag}">
                    <i class="fa-solid fa-xmark text-[10px]"></i>
                </button>
            `;

            const removeBtn = chip.querySelector('button');
            removeBtn.addEventListener('click', () => {
                this.activeTags.delete(tag);
                onRemoveTag();
            });

            this.activeTagsElement.appendChild(chip);
        });

        // Add clear all button if multiple tags
        if (this.activeTags.size > 1) {
            const clearAll = document.createElement('button');
            clearAll.className = 'text-xs text-gray-500 hover:text-gray-700 font-medium underline';
            clearAll.textContent = 'Limpiar todo';
            clearAll.addEventListener('click', () => {
                this.activeTags.clear();
                onRemoveTag();
            });
            this.activeTagsElement.appendChild(clearAll);
        }
    }

    addActiveTag(tag) {
        this.activeTags.add(tag);
    }

    getCategoryIcon(category) {
        const icons = {
            'Parques y Naturaleza': 'fa-solid fa-tree',
            'Instalaciones Deportivas': 'fa-solid fa-futbol',
            'Movilidad Ciclista': 'fa-solid fa-bicycle',
            'Urbanismo': 'fa-solid fa-building',
            'Movilidad Activa': 'fa-solid fa-person-biking',
            'Limpieza y Residuos': 'fa-solid fa-broom',
            'Pavimentación y Aceras': 'fa-solid fa-road',
            'Transporte y Tráfico': 'fa-solid fa-bus',
            'Infancia y Juegos': 'fa-solid fa-child',
            'Social y Equipamientos': 'fa-solid fa-users',
            'Educación y Colegios': 'fa-solid fa-school',
            'Seguridad y Convivencia': 'fa-solid fa-shield-halved',
            'Medio Ambiente': 'fa-solid fa-leaf',
            'Grandes Infraestructuras': 'fa-solid fa-hammer',
            'Mobiliario e Iluminación': 'fa-solid fa-lightbulb',
            'Inadmitidas': 'fa-solid fa-ban',
            'Zona Vías': 'fa-solid fa-train',
            'Accesibilidad': 'fa-solid fa-wheelchair',
            'Cultura y Juventud': 'fa-solid fa-masks-theater',
            'Infancia y Educación': 'fa-solid fa-graduation-cap',
            'Alumbrado Público': 'fa-solid fa-lightbulb',
            ' Social y Equipamientos': 'fa-solid fa-users'
        };
        return icons[category] || 'fa-solid fa-location-dot';
    }

    getCategoryColor(category) {
        const colors = {
            'Parques y Naturaleza': '#22c55e',
            'Instalaciones Deportivas': '#f59e0b',
            'Movilidad Ciclista': '#3b82f6',
            'Urbanismo': '#64748b',
            'Movilidad Activa': '#06b6d4',
            'Limpieza y Residuos': '#78350f',
            'Pavimentación y Aceras': '#f97316',
            'Transporte y Tráfico': '#ef4444',
            'Infancia y Juegos': '#ec4899',
            'Social y Equipamientos': '#8b5cf6',
            'Educación y Colegios': '#3b82f6',
            'Seguridad y Convivencia': '#1e293b',
            'Medio Ambiente': '#10b981',
            'Grandes Infraestructuras': '#475569',
            'Mobiliario e Iluminación': '#eab308',
            'Inadmitidas': '#dc2626',
            'Accesibilidad': '#0891b2',
            'Cultura y Juventud': '#c026d3',
            'Infancia y Educación': '#2563eb',
            'Alumbrado Público': '#eab308',
            ' Social y Equipamientos': '#8b5cf6'
        };
        return colors[category] || '#94a3b8';
    }

    renderList(proposals, onTagClick) {
        this.listElement.innerHTML = '';
        this.countElement.textContent = `${proposals.length} propuestas`;

        if (proposals.length === 0) {
            this.listElement.innerHTML = `
                <div class="bg-white p-8 rounded-xl text-center border border-dashed border-gray-300">
                    <i class="fa-solid fa-magnifying-glass text-4xl text-gray-300 mb-3"></i>
                    <p class="text-gray-500 font-medium">No se encontraron propuestas</p>
                    <p class="text-gray-400 text-sm mt-1">Intenta cambiar los filtros o la búsqueda</p>
                </div>
            `;
            return;
        }

        proposals.forEach(proposal => {
            const card = document.createElement('div');
            card.id = `proposal-${proposal.id}`;
            card.className = 'proposal-card bg-white p-4 rounded-xl shadow-sm border border-gray-100';

            card.innerHTML = `
                <div class="flex justify-between items-start mb-2">
                    <span class="text-[10px] font-bold uppercase tracking-wider text-white px-2 py-0.5 rounded flex items-center gap-1" style="background-color: ${this.getCategoryColor(proposal.category)};">
                        <i class="${this.getCategoryIcon(proposal.category)}"></i>
                        ${proposal.category}
                    </span>
                    ${proposal.urgent ? '<i class="fa-solid fa-triangle-exclamation text-red-500 animate-pulse-fast" title="Urgente"></i>' : ''}
                </div>
                
                <h3 class="text-gray-900 font-bold leading-tight mb-1 text-base">
                    <a href="${proposal.external_url}" target="_blank" class="hover:text-indigo-600 transition-colors">${proposal.title}</a>
                </h3>
                <p class="text-gray-600 text-sm line-clamp-2 mb-3">${proposal.summary}</p>
                
                <div class="flex flex-wrap gap-1.5 mb-3" data-tags>
                    ${proposal.tags.slice(0, 4).map(tag => {
                const isActive = this.activeTags.has(tag);
                return `
                            <button class="tag-btn text-[10px] px-2 py-0.5 rounded-md border transition-colors cursor-pointer ${isActive
                        ? 'bg-indigo-100 text-indigo-700 border-indigo-300 font-semibold'
                        : 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200'
                    }" data-tag="${tag}">
                                ${tag}
                            </button>
                        `;
            }).join('')}
                    ${proposal.tags.length > 4 ? `<span class="text-[10px] text-gray-400 px-1" title="${proposal.tags.slice(4).join(', ')}">+${proposal.tags.length - 4}</span>` : ''}
                </div>
                
                <div class="flex items-center justify-between mt-auto pt-3 border-t border-gray-50">
                    <div class="flex items-center text-gray-500 text-xs">
                        <i class="fa-solid fa-location-dot mr-1"></i>
                        <span class="truncate max-w-[180px]">${proposal.zone || 'Varias zonas'}</span>
                    </div>
                    <div class="flex items-center gap-3">
                        ${proposal.lat && proposal.lng ? `
                        <button class="text-indigo-600 hover:text-indigo-800 text-sm font-semibold transition-colors p-1" title="Centrar en mapa" onclick="window.centerMapOnProposal(${proposal.lat}, ${proposal.lng})">
                            <i class="fa-solid fa-map-location-dot"></i>
                        </button>
                        ` : ''}
                        <a href="${proposal.external_url}" target="_blank" class="text-indigo-600 hover:text-indigo-800 text-sm font-semibold transition-colors p-1" title="Ver original">
                            <i class="fa-solid fa-arrow-up-right-from-square"></i>
                        </a>
                    </div>
                </div>
            `;

            // Add click handlers to tags
            const tagButtons = card.querySelectorAll('.tag-btn');
            tagButtons.forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const tag = btn.getAttribute('data-tag');
                    onTagClick(tag);
                });
            });

            this.listElement.appendChild(card);
        });
    }

    scrollToCard(id) {
        const element = document.getElementById(`proposal-${id}`);
        if (element) {
            // On both mobile and desktop, scroll within the list container to keep map visible
            const listContainer = document.getElementById('proposals-list-container');
            const elementRect = element.getBoundingClientRect();
            const containerRect = listContainer.getBoundingClientRect();
            
            // Calculate scroll position relative to container
            // On desktop, position card higher to be more visible
            const offset = window.innerWidth < 768 ? 100 : 50;
            const scrollPosition = elementRect.top - containerRect.top + listContainer.scrollTop - offset;
            
            listContainer.scrollTo({
                top: scrollPosition,
                behavior: 'smooth'
            });
            
            // Highlight effect
            element.classList.add('ring-2', 'ring-indigo-500', 'ring-opacity-50');
            setTimeout(() => {
                element.classList.remove('ring-2', 'ring-indigo-500', 'ring-opacity-50');
            }, 2000);
        }
    }
}
