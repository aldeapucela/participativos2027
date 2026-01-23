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
 * Filter proposals based on category, zone, tags, and search query
 */
export function filterData(proposals, category, zone, query, activeTags = new Set(), sortByVotes = 'desc') {
    let filtered = proposals.filter(p => {
        // Special Category: Zona Vías (Ferroviario tag)
        const isZonaVias = category === 'Zona Vías';
        const categoryMatch = !category || category === 'Todas' || p.category === category || (isZonaVias && p.tags.includes('Ferroviario'));

        // Zone Match
        let zoneMatch = zone == null || zone === 0 || zone === 'Todas zonas';
        if (zone != null && zone !== 0 && zone !== 'Todas zonas') {
            const targetZoneId = typeof zone === 'number' ? zone : null;

            let pZoneId = p.zone_id;
            if ((pZoneId === undefined || pZoneId === null) && p.zone) {
                const match = p.zone.match(/^(\d+)\./);
                if (match) {
                    pZoneId = parseInt(match[1]);
                }
            }

            if (targetZoneId != null) {
                zoneMatch = pZoneId === targetZoneId;
            } else {
                // Backwards compatibility: zone passed as name
                zoneMatch = p.zone === zone;
            }
        }

        // Tag Match: Proposal must have ALL active tags
        const tagMatch = activeTags.size === 0 || Array.from(activeTags).every(tag => p.tags.includes(tag));

        // Search Match (Title, Summary, Tags)
        const searchMatch = !query ||
            p.title.toLowerCase().includes(query.toLowerCase()) ||
            p.summary.toLowerCase().includes(query.toLowerCase()) ||
            p.tags.some(tag => tag.toLowerCase().includes(query.toLowerCase()));

        return categoryMatch && zoneMatch && tagMatch && searchMatch;
    });

    // Sort by votes (always active)
    if (sortByVotes === 'desc') {
        filtered.sort((a, b) => (b.votes || 0) - (a.votes || 0));
    } else {
        filtered.sort((a, b) => (a.votes || 0) - (b.votes || 0));
    }

    return filtered;
}

/**
 * Debounce function to limit the rate at which a function is executed
 */
export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

export function escapeHtml(value) {
    if (value == null) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
