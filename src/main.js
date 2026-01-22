import { fetchData } from './dataService.js';
import { UIController } from './uiController.js';
import { MapController } from './mapController.js';
import { filterData, debounce } from './utils.js';

/**
 * Application Entry Point
 */
async function init() {
    // 1. Initialize Controllers
    const ui = new UIController();
    const map = new MapController('map');
    
    // Store map controller globally for access from card buttons
    window.mapController = map;

    // 2. Fetch Data
    const { proposals, categories } = await fetchData();
    let currentProposals = proposals;

    // 3. Define handlers first
    const handleTagClick = (tag) => {
        // Toggle tag in active filters
        if (ui.activeTags.has(tag)) {
            ui.activeTags.delete(tag);
        } else {
            ui.addActiveTag(tag);
        }
        handleFilterChange(ui.activeCategory, ui.activeZone, ui.searchInput.value);
    };

    const handleFilterChange = (category, zone, query) => {
        currentProposals = filterData(proposals, category, zone, query, ui.activeTags);

        ui.renderPopularTags(proposals, handleTagClick);
        ui.renderActiveTags(() => handleFilterChange(ui.activeCategory, ui.activeZone, ui.searchInput.value));
        ui.renderList(currentProposals, handleTagClick);
        map.renderMarkers(currentProposals, (id) => ui.scrollToCard(id));
    };

    // 4. Initial Render
    ui.renderFilters(categories, proposals, (category) => {
        handleFilterChange(category, ui.activeZone, ui.searchInput.value);
    });
    
    ui.renderZoneFilters(proposals, (zone) => {
        handleFilterChange(ui.activeCategory, zone, ui.searchInput.value);
    });

    ui.renderPopularTags(proposals, handleTagClick);
    ui.renderActiveTags(() => handleFilterChange(ui.activeCategory, ui.activeZone, ui.searchInput.value));
    ui.renderList(currentProposals, handleTagClick);
    map.renderMarkers(currentProposals, (id) => ui.scrollToCard(id));

    // 5. Event Listeners
    ui.searchInput.addEventListener('input', debounce((e) => {
        handleFilterChange(ui.activeCategory, ui.activeZone, e.target.value);
    }, 300));
}

// Wait for DOM to be ready before initializing
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    // DOM already loaded, initialize immediately
    init();
}

// Also expose to window for debugging
window.init = init;

// Expose map centering function globally
window.centerMapOnProposal = (lat, lng) => {
    if (window.mapController) {
        window.mapController.centerOnProposal(lat, lng);
    }
};
