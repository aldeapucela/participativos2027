/**
 * Filter proposals based on category, tags, and search query
 */
export function filterData(proposals, category, query, activeTags = new Set()) {
    return proposals.filter(p => {
        // Special Category: Zona Vías (Ferroviario tag)
        const isZonaVias = category === 'Zona Vías';
        const categoryMatch = !category || category === 'Todas' || p.category === category || (isZonaVias && p.tags.includes('Ferroviario'));

        // Tag Match: Proposal must have ALL active tags
        const tagMatch = activeTags.size === 0 || Array.from(activeTags).every(tag => p.tags.includes(tag));

        // Search Match (Title, Summary, Tags)
        const searchMatch = !query ||
            p.title.toLowerCase().includes(query.toLowerCase()) ||
            p.summary.toLowerCase().includes(query.toLowerCase()) ||
            p.tags.some(tag => tag.toLowerCase().includes(query.toLowerCase()));

        return categoryMatch && tagMatch && searchMatch;
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
