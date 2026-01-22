/**
 * Filter proposals based on category, zone, tags, and search query
 */
export function filterData(proposals, category, zone, query, activeTags = new Set()) {
    return proposals.filter(p => {
        // Special Category: Zona Vías (Ferroviario tag)
        const isZonaVias = category === 'Zona Vías';
        const categoryMatch = !category || category === 'Todas' || p.category === category || (isZonaVias && p.tags.includes('Ferroviario'));

        // Zone Match
        let zoneMatch = !zone || zone === 'Todas las zonas';
        if (zone && zone !== 'Todas las zonas') {
            // Try to match by zone name directly first
            if (p.zone === zone) {
                zoneMatch = true;
            } else {
                // If not direct match, this shouldn't happen with our current implementation
                // but keeping for compatibility
                zoneMatch = false;
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
