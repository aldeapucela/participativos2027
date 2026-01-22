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
        handleFilterChange(ui.activeCategory, ui.searchInput.value);
    };

    const handleFilterChange = (category, query) => {
        currentProposals = filterData(proposals, category, query, ui.activeTags);

        ui.renderPopularTags(proposals, handleTagClick);
        ui.renderActiveTags(() => handleFilterChange(ui.activeCategory, ui.searchInput.value));
        ui.renderList(currentProposals, handleTagClick);
        map.renderMarkers(currentProposals, (id) => ui.scrollToCard(id));
    };

    // 4. Initial Render
    ui.renderFilters(categories, proposals, (category) => {
        handleFilterChange(category, ui.searchInput.value);
    });

    ui.renderPopularTags(proposals, handleTagClick);
    ui.renderActiveTags(() => handleFilterChange(ui.activeCategory, ui.searchInput.value));
    ui.renderList(currentProposals, handleTagClick);
    map.renderMarkers(currentProposals, (id) => ui.scrollToCard(id));

    // 5. Event Listeners
    ui.searchInput.addEventListener('input', debounce((e) => {
        handleFilterChange(ui.activeCategory, e.target.value);
    }, 300));
}

// Start App when DOM is ready
document.addEventListener('DOMContentLoaded', init);
