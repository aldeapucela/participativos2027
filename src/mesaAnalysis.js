import { escapeHtml } from './utils.js';

const CSV_URL = '../data/mesa-final-unificado.csv?v=20260616a';

const ACTA_BY_ZONE = {
    'Zona Centro': {
        label: 'Acta Zona Centro',
        href: '../data/actas-mesa/acta-zona-centro.pdf',
    },
    'Zona Esgueva 1': {
        label: 'Acta Zona Esgueva 1',
        href: '../data/actas-mesa/acta-zona-esgueva-1.pdf',
    },
    'Zona Esgueva 2': {
        label: 'Acta Zona Esgueva 2',
        href: '../data/actas-mesa/acta-zona-esgueva-2.pdf',
    },
    'Zona Este 1': {
        label: 'Acta Zona Este 1',
        href: '../data/actas-mesa/acta-zona-este-1.pdf',
    },
    'Zona Este 2': {
        label: 'Acta Zona Este 2',
        href: '../data/actas-mesa/acta-zona-este-2.pdf',
    },
    'Zona Parquesol': {
        label: 'Acta Zona Parquesol',
        href: '../data/actas-mesa/acta-zona-parquesol.pdf',
    },
    'Zona Pisuerga 1': {
        label: 'Acta Zona Pisuerga 1',
        href: '../data/actas-mesa/acta-zona-pisuerga-1.pdf',
    },
    'Zona Pisuerga 2': {
        label: 'Acta Zona Pisuerga 2',
        href: '../data/actas-mesa/acta-zona-pisuerga-2.pdf',
    },
    'Zona Sur 1': {
        label: 'Acta Zona Sur 1',
        href: '../data/actas-mesa/acta-zona-sur-1.pdf',
    },
    'Zona Sur 2': {
        label: 'Acta Zona Sur 2',
        href: '../data/actas-mesa/acta-zona-sur-2.pdf',
    },
};

const STATUS_ORDER = [
    'Mesa pero no final',
    'Descartada por mesa y fuera de la final',
    'Descartada por mesa y en la final',
    'Mesa y final',
    'Final pero no detectada en mesa',
];

const TABLE_HIDDEN_STATUSES = new Set([
    'Descartada por mesa y fuera de la final',
]);

const STATUS_META = {
    'Mesa pero no final': {
        className: 'status-mesa-no-final',
        label: 'Elegidas por mesa y fuera de la final',
    },
    'Mesa y final': {
        className: 'status-mesa-final',
        label: 'Elegidas por mesa y en la final',
    },
    'Descartada por mesa y fuera de la final': {
        className: 'status-mesa-discarded',
        label: 'Descartadas por mesa y fuera de la final',
    },
    'Descartada por mesa y en la final': {
        className: 'status-mesa-discarded-final',
        label: 'Descartadas por mesa y aun así en la final',
    },
    'Final pero no detectada en mesa': {
        className: 'status-final-no-mesa',
        label: 'En la final sin localizar claramente en acta',
    },
};

const state = {
    rows: [],
    filters: {
        status: 'Todas',
        zone: 'Todas',
        category: 'Todas',
        exclusionType: 'Todas',
        search: '',
        minSupport: 0,
        quick: 'all',
    },
    sort: {
        key: 'default',
        direction: 'desc',
    },
};

const DEFAULT_FILTERS = {
    status: 'Todas',
    zone: 'Todas',
    category: 'Todas',
    exclusionType: 'Todas',
    search: '',
    minSupport: 0,
    quick: 'all',
};

const FILTER_QUERY_KEYS = {
    status: 'status',
    zone: 'zone',
    category: 'category',
    exclusionType: 'exclusion_type',
    search: 'q',
    minSupport: 'min_support',
};

function hasActiveFilters(filters = state.filters) {
    return (
        filters.status !== DEFAULT_FILTERS.status
        || filters.zone !== DEFAULT_FILTERS.zone
        || filters.category !== DEFAULT_FILTERS.category
        || filters.exclusionType !== DEFAULT_FILTERS.exclusionType
        || filters.search.trim() !== DEFAULT_FILTERS.search
        || filters.minSupport !== DEFAULT_FILTERS.minSupport
    );
}

function getActaForZone(zone) {
    return ACTA_BY_ZONE[zone] || null;
}

function parseCsv(text) {
    const rows = [];
    let current = '';
    let row = [];
    let inQuotes = false;

    for (let i = 0; i < text.length; i += 1) {
        const char = text[i];
        const next = text[i + 1];

        if (char === '"' && inQuotes && next === '"') {
            current += '"';
            i += 1;
            continue;
        }

        if (char === '"') {
            inQuotes = !inQuotes;
            continue;
        }

        if (char === ',' && !inQuotes) {
            row.push(current);
            current = '';
            continue;
        }

        if ((char === '\n' || char === '\r') && !inQuotes) {
            if (char === '\r' && next === '\n') i += 1;
            row.push(current);
            if (row.some(value => value !== '')) rows.push(row);
            row = [];
            current = '';
            continue;
        }

        current += char;
    }

    if (current || row.length) {
        row.push(current);
        rows.push(row);
    }

    const headers = rows.shift() || [];
    return rows.map(values => Object.fromEntries(headers.map((header, index) => [header, values[index] || ''])));
}

function normalize(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
}

// Known canonical categories from the platform.
// Any token not in this list (after light cleaning) is discarded.
const KNOWN_CATEGORIES = new Set([
    'Asociaciones',
    'Contaminación ambiental y acústica',
    'Cultura',
    'Cultura y Embellecimiento Urbano',
    'Deporte',
    'Deportes',
    'Educación',
    'Igualdad',
    'Medio Ambiente',
    'Medio Ambiente - Limpieza',
    'Participación ciudadana',
    'Participación ciudadana - Asociaciones',
    'Patrimonio',
    'Ruido - Contaminación acústica',
    'Salud',
    'Salud y consumo - Animales',
    'Seguridad y emergencias',
    'Servicios sociales',
    'Transportes y movilidad',
    'Turismo',
    'Urbanismo',
]);

function normalizeCategories(raw) {
    if (!raw) return '';
    // Strip surrounding/internal quotes and semicolons, then split on |
    const cleaned = raw
        .replace(/"/g, '')
        .replace(/;/g, '')
        .trim();
    const parts = cleaned.split('|').map(p => p.trim()).filter(Boolean);
    // Keep only tokens that match a known canonical category
    const valid = parts.filter(p => KNOWN_CATEGORIES.has(p));
    // Deduplicate while preserving order
    return [...new Set(valid)].join(' | ');
}

function parseRows(rows) {
    return rows.map(row => ({
        situacion: row.situacion,
        zona: row.zona,
        propuestaId: row.propuesta_id,
        titulo: row.titulo_propuesta,
        enlace: row.enlace,
        apoyos: Number.parseInt(row.apoyos, 10) || 0,
        categoria: normalizeCategories(row.categoria) || 'Sin categoría',
        apareceEnMesa: row.aparece_en_mesa,
        apareceDescartadaEnMesa: row.aparece_descartada_en_mesa,
        ordenMesa: row.orden_detectado_en_mesa,
        apareceEnFinal: row.aparece_en_final_126,
        decisionMesa: row.decision_mesa || '',
        fiabilidad: row.fiabilidad_lectura_mesa || 'no aplica',
        extractoActa: row.extracto_acta || '',
        razonExclusion: row.razon_exclusion || '',
        tipoRazonExclusion: row.tipo_razon_exclusion || '',
        informeInviabilidadUrl: row.informe_inviabilidad_url || '',
    }));
}

function getProposalLinkById(proposalId) {
    const existingLink = state.rows.find(row => row.propuestaId === proposalId)?.enlace;
    if (existingLink) return existingLink;
    if (/^\d{4}$/.test(String(proposalId || ''))) {
        return `https://www10.ava.es/presupuestosparticipativos/budgets/6/investments/${proposalId}`;
    }
    return '';
}

function renderReasonTextWithLinks(text) {
    const source = String(text || '');
    const pattern = /\b(propuesta\s+|ID\s*)(\d{4})\b/gi;
    let lastIndex = 0;
    let html = '';

    source.replace(pattern, (match, prefix, proposalId, offset) => {
        html += escapeHtml(source.slice(lastIndex, offset));
        const localMatch = state.rows.some(row => row.propuestaId === proposalId);
        const fallbackLink = getProposalLinkById(proposalId);
        if (localMatch) {
            html += `${escapeHtml(prefix)}<button type="button" class="mesa-inline-proposal-link" data-related-proposal-id="${escapeHtml(proposalId)}">${escapeHtml(proposalId)}</button>`;
        } else if (fallbackLink) {
            html += `${escapeHtml(prefix)}<a href="${escapeHtml(fallbackLink)}" target="_blank" rel="noopener noreferrer" class="mesa-inline-proposal-link">${escapeHtml(proposalId)}</a>`;
        } else {
            html += escapeHtml(match);
        }
        lastIndex = offset + match.length;
        return match;
    });

    html += escapeHtml(source.slice(lastIndex));
    return html;
}

function formatExclusionReason(row) {
    if (!row.razonExclusion) return '';
    if (
        row.situacion !== 'Mesa pero no final'
        && row.situacion !== 'Descartada por mesa y fuera de la final'
    ) {
        return '';
    }
    return `
        <div class="mesa-exclusion-note">
            <div class="mesa-exclusion-head">
                <span class="mesa-exclusion-label">Razon de exclusion</span>
                ${row.tipoRazonExclusion ? `<span class="mesa-exclusion-type-pill">${escapeHtml(row.tipoRazonExclusion)}</span>` : ''}
            </div>
            <p>${renderReasonTextWithLinks(row.razonExclusion)}</p>
        </div>
    `;
}

function getRowsMatchingBaseFilters() {
    const query = normalize(state.filters.search).trim();
    return state.rows.filter(row => {
        if (TABLE_HIDDEN_STATUSES.has(row.situacion)) return false;
        const statusMatch = state.filters.status === 'Todas' || row.situacion === state.filters.status;
        const zoneMatch = state.filters.zone === 'Todas' || row.zona === state.filters.zone;
        const rowCategories = row.categoria ? row.categoria.split('|').map(c => c.trim()).filter(Boolean) : [];
        const categoryMatch = state.filters.category === 'Todas' || rowCategories.includes(state.filters.category);
        const supportMatch = row.apoyos >= state.filters.minSupport;
        const queryMatch = !query || normalize(`${row.titulo} ${row.zona} ${row.categoria} ${row.propuestaId}`).includes(query);
        return statusMatch && zoneMatch && categoryMatch && supportMatch && queryMatch;
    });
}

function getFilteredRows() {
    return getRowsMatchingBaseFilters()
        .filter(row => state.filters.exclusionType === 'Todas' || row.tipoRazonExclusion === state.filters.exclusionType)
        .sort(compareRows);
}

function compareRows(a, b) {
    if (state.sort.key !== 'default') {
        return compareBySort(a, b);
    }
    const statusA = STATUS_ORDER.indexOf(a.situacion);
    const statusB = STATUS_ORDER.indexOf(b.situacion);
    if (statusA !== statusB) return statusA - statusB;
    if (b.apoyos !== a.apoyos) return b.apoyos - a.apoyos;
    return a.zona.localeCompare(b.zona, 'es');
}

function compareBySort(a, b) {
    const direction = state.sort.direction === 'asc' ? 1 : -1;
    switch (state.sort.key) {
        case 'situacion':
            return direction * a.situacion.localeCompare(b.situacion, 'es');
        case 'zona':
            return direction * a.zona.localeCompare(b.zona, 'es', { numeric: true });
        case 'apoyos':
            return direction * (a.apoyos - b.apoyos);
        case 'titulo':
            return direction * a.titulo.localeCompare(b.titulo, 'es');
        case 'categoria':
            return direction * a.categoria.localeCompare(b.categoria, 'es');
        default:
            return 0;
    }
}

function countBy(rows, key) {
    return rows.reduce((acc, row) => {
        acc[row[key]] = (acc[row[key]] || 0) + 1;
        return acc;
    }, {});
}

function fillSelect(id, values, currentValue) {
    const select = document.getElementById(id);
    if (!select) return;
    select.innerHTML = values.map(value => (
        `<option value="${escapeHtml(value)}" ${value === currentValue ? 'selected' : ''}>${escapeHtml(value)}</option>`
    )).join('');
}

function refreshExclusionTypeOptions() {
    const exclusionTypeSelect = document.getElementById('filter-exclusion-type');
    if (!exclusionTypeSelect) return;

    const availableTypes = ['Todas', ...new Set(
        getRowsMatchingBaseFilters()
            .map(row => row.tipoRazonExclusion)
            .filter(Boolean),
    )].sort((a, b) => {
        if (a === 'Todas') return -1;
        if (b === 'Todas') return 1;
        return a.localeCompare(b, 'es');
    });

    if (state.filters.exclusionType !== 'Todas' && !availableTypes.includes(state.filters.exclusionType)) {
        state.filters.exclusionType = 'Todas';
    }

    fillSelect('filter-exclusion-type', availableTypes, state.filters.exclusionType);
}

function syncQuickFilterFromState() {
    if (state.filters.status === 'Mesa pero no final' && state.filters.minSupport === 0) {
        state.filters.quick = 'mesa-no-final';
        return;
    }
    if (state.filters.status === 'Mesa y final' && state.filters.minSupport === 0) {
        state.filters.quick = 'mesa-final';
        return;
    }
    if (state.filters.status === 'Todas' && state.filters.minSupport === 50) {
        state.filters.quick = '50plus';
        return;
    }
    if (state.filters.status === 'Todas' && state.filters.minSupport === 100) {
        state.filters.quick = '100plus';
        return;
    }
    state.filters.quick = 'all';
}

function updateFilterControls() {
    const statusSelect = document.getElementById('filter-status');
    const zoneSelect = document.getElementById('filter-zone');
    const categorySelect = document.getElementById('filter-category');
    const searchInput = document.getElementById('filter-search');

    if (statusSelect) statusSelect.value = state.filters.status;
    if (zoneSelect) zoneSelect.value = state.filters.zone;
    if (categorySelect) categorySelect.value = state.filters.category;
    if (searchInput) searchInput.value = state.filters.search;
    refreshExclusionTypeOptions();
}

function getShareableFilterParams() {
    const params = new URLSearchParams();

    if (state.filters.status !== DEFAULT_FILTERS.status) {
        params.set(FILTER_QUERY_KEYS.status, state.filters.status);
    }
    if (state.filters.zone !== DEFAULT_FILTERS.zone) {
        params.set(FILTER_QUERY_KEYS.zone, state.filters.zone);
    }
    if (state.filters.category !== DEFAULT_FILTERS.category) {
        params.set(FILTER_QUERY_KEYS.category, state.filters.category);
    }
    if (state.filters.exclusionType !== DEFAULT_FILTERS.exclusionType) {
        params.set(FILTER_QUERY_KEYS.exclusionType, state.filters.exclusionType);
    }
    if (state.filters.search.trim()) {
        params.set(FILTER_QUERY_KEYS.search, state.filters.search.trim());
    }
    if (state.filters.minSupport !== DEFAULT_FILTERS.minSupport) {
        params.set(FILTER_QUERY_KEYS.minSupport, String(state.filters.minSupport));
    }

    return params;
}

function updateUrlFromFilters() {
    const params = getShareableFilterParams();
    const nextQuery = params.toString();
    const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}${window.location.hash}`;
    window.history.replaceState({}, '', nextUrl);
}

function applyFiltersFromUrl({ zones = [], categories = [], exclusionTypes = [] } = {}) {
    const params = new URLSearchParams(window.location.search);
    const nextFilters = {
        ...DEFAULT_FILTERS,
    };
    const visibleStatuses = new Set(STATUS_ORDER.filter(status => !TABLE_HIDDEN_STATUSES.has(status)));
    const status = params.get(FILTER_QUERY_KEYS.status);
    const zone = params.get(FILTER_QUERY_KEYS.zone);
    const category = params.get(FILTER_QUERY_KEYS.category);
    const exclusionType = params.get(FILTER_QUERY_KEYS.exclusionType);
    const search = params.get(FILTER_QUERY_KEYS.search);
    const minSupport = Number.parseInt(params.get(FILTER_QUERY_KEYS.minSupport) || '', 10);

    if (status && visibleStatuses.has(status)) {
        nextFilters.status = status;
    }
    if (zone && zones.includes(zone)) {
        nextFilters.zone = zone;
    }
    if (category && categories.includes(category)) {
        nextFilters.category = category;
    }
    if (exclusionType && exclusionTypes.includes(exclusionType)) {
        nextFilters.exclusionType = exclusionType;
    }
    if (search) {
        nextFilters.search = search;
    }
    if (Number.isFinite(minSupport) && minSupport > 0) {
        nextFilters.minSupport = minSupport;
    }

    state.filters = nextFilters;
    syncQuickFilterFromState();
}

function setupFilters() {
    const zones = ['Todas', ...new Set(state.rows.map(row => row.zona).filter(Boolean))].sort((a, b) => {
        if (a === 'Todas') return -1;
        if (b === 'Todas') return 1;
        return a.localeCompare(b, 'es', { numeric: true });
    });
    const allCategories = new Set();
    state.rows.forEach(row => {
        if (row.categoria) {
            row.categoria.split('|').forEach(cat => {
                const trimmed = cat.trim();
                if (trimmed) allCategories.add(trimmed);
            });
        }
    });
    const categories = ['Todas', ...Array.from(allCategories)].sort((a, b) => {
        if (a === 'Todas') return -1;
        if (b === 'Todas') return 1;
        return a.localeCompare(b, 'es');
    });
    const exclusionTypes = ['Todas', ...new Set(state.rows.map(row => row.tipoRazonExclusion).filter(Boolean))].sort((a, b) => {
        if (a === 'Todas') return -1;
        if (b === 'Todas') return 1;
        return a.localeCompare(b, 'es');
    });
    applyFiltersFromUrl({ zones, categories, exclusionTypes });
    const visibleStatuses = STATUS_ORDER.filter(status => !TABLE_HIDDEN_STATUSES.has(status));
    fillSelect('filter-status', ['Todas', ...visibleStatuses], state.filters.status);
    fillSelect('filter-zone', zones, state.filters.zone);
    fillSelect('filter-category', categories, state.filters.category);
    updateFilterControls();

    [
        ['filter-status', 'status'],
        ['filter-zone', 'zone'],
        ['filter-category', 'category'],
        ['filter-exclusion-type', 'exclusionType'],
    ].forEach(([id, key]) => {
        document.getElementById(id)?.addEventListener('change', event => {
            state.filters[key] = event.target.value;
            syncQuickFilterFromState();
            render();
        });
    });

    document.getElementById('filter-search')?.addEventListener('input', event => {
        state.filters.search = event.target.value;
        syncQuickFilterFromState();
        render();
    });

    document.querySelectorAll('.mesa-quick-chip').forEach(button => {
        button.addEventListener('click', () => {
            applyQuickFilter(button.dataset.quick || 'all');
        });
    });

    document.querySelectorAll('.mesa-sort-button').forEach(button => {
        button.addEventListener('click', () => {
            const nextKey = button.dataset.sort;
            if (!nextKey) return;
            if (state.sort.key === nextKey) {
                state.sort.direction = state.sort.direction === 'asc' ? 'desc' : 'asc';
            } else {
                state.sort.key = nextKey;
                state.sort.direction = nextKey === 'apoyos' ? 'desc' : 'asc';
            }
            render();
        });
    });
}

function applyQuickFilter(quick) {
    state.filters.quick = quick;
    if (quick === 'all') {
        state.filters.status = 'Todas';
        state.filters.minSupport = 0;
    } else if (quick === 'mesa-no-final') {
        state.filters.status = 'Mesa pero no final';
        state.filters.minSupport = 0;
    } else if (quick === 'mesa-final') {
        state.filters.status = 'Mesa y final';
        state.filters.minSupport = 0;
    } else if (quick === '50plus') {
        state.filters.status = 'Todas';
        state.filters.minSupport = 50;
    } else if (quick === '100plus') {
        state.filters.status = 'Todas';
        state.filters.minSupport = 100;
    }

    updateFilterControls();
    updateQuickChipState();
    render();
}

function updateQuickChipState() {
    document.querySelectorAll('.mesa-quick-chip').forEach(button => {
        button.classList.toggle('is-active', button.dataset.quick === state.filters.quick);
    });
}

function jumpToDetailedList() {
    const detailSection = document.getElementById('mesa-detail-section');
    if (!detailSection) return;
    detailSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function focusProposalFromReference(proposalId) {
    const normalizedId = String(proposalId || '').trim();
    if (!normalizedId) return;
    state.filters.status = 'Todas';
    state.filters.zone = 'Todas';
    state.filters.category = 'Todas';
    state.filters.exclusionType = 'Todas';
    state.filters.minSupport = 0;
    state.filters.quick = 'all';
    state.filters.search = normalizedId;
    syncQuickFilterFromState();
    updateFilterControls();
    render();
    const searchInput = document.getElementById('filter-search');
    if (searchInput) {
        searchInput.focus();
        searchInput.setSelectionRange(normalizedId.length, normalizedId.length);
    }
    jumpToDetailedList();
}

function focusDetailedStatus(status) {
    state.filters.quick = 'all';
    state.filters.status = status;
    state.filters.minSupport = 0;
    updateFilterControls();
    updateQuickChipState();
    render();
    jumpToDetailedList();
}

function setupSectionActions() {
    document.getElementById('view-all-mesa-no-final')?.addEventListener('click', () => {
        applyQuickFilter('mesa-no-final');
        jumpToDetailedList();
    });

    document.addEventListener('click', event => {
        const trigger = event.target.closest('[data-related-proposal-id]');
        if (!trigger) return;
        const proposalId = trigger.getAttribute('data-related-proposal-id');
        if (!proposalId) return;
        focusProposalFromReference(proposalId);
    });
}

function renderSortIndicators() {
    document.querySelectorAll('.mesa-sort-indicator').forEach(indicator => {
        const key = indicator.dataset.indicatorFor;
        if (key !== state.sort.key) {
            indicator.textContent = '';
            return;
        }
        indicator.textContent = state.sort.direction === 'asc' ? '↑' : '↓';
    });
}

function renderMetrics(rows) {
    const counts = countBy(rows, 'situacion');
    const metricsContainer = document.getElementById('summary-metrics');
    const summaryStatuses = [
        'Mesa pero no final',
        'Descartada por mesa y en la final',
        'Mesa y final',
        'Final pero no detectada en mesa',
    ];
    if (metricsContainer) {
        metricsContainer.innerHTML = summaryStatuses.map(status => {
            const meta = STATUS_META[status];
            const value = counts[status] || 0;
            return `
                <article class="mesa-summary-metric mesa-summary-metric-actionable">
                    <span class="mesa-metric-label">
                        <span class="mesa-metric-dot ${meta.className}" aria-hidden="true"></span>
                        ${escapeHtml(meta.label)}
                    </span>
                    <button type="button" class="mesa-summary-metric-button ${meta.className}" data-summary-status="${escapeHtml(status)}">${value}</button>
                </article>
            `;
        }).join('');
        metricsContainer.querySelectorAll('[data-summary-status]').forEach(button => {
            button.addEventListener('click', () => {
                const status = button.getAttribute('data-summary-status');
                if (status) focusDetailedStatus(status);
            });
        });
    }
    document.getElementById('filtered-count').textContent = `${rows.length} propuestas`;
}

function renderOverviewInsight(rows) {
    const counts = countBy(rows, 'situacion');
    const byZone = rows
        .filter(row => row.situacion === 'Mesa pero no final')
        .reduce((acc, row) => {
            acc[row.zona] = (acc[row.zona] || 0) + 1;
            return acc;
        }, {});
    const topZone = Object.entries(byZone).sort((a, b) => b[1] - a[1])[0];
    const text = topZone
        ? `${counts['Mesa pero no final'] || 0} propuestas elegidas por las mesas no aparecen en la votación final. ${counts['Descartada por mesa y en la final'] || 0} fueron descartadas por la mesa y aun así sí aparecen en la final. ${counts['Mesa y final'] || 0} sí llegaron y ${counts['Final pero no detectada en mesa'] || 0} están en la final pero no las hemos localizado con claridad en las actas.`
        : `Mostrando ${rows.length} propuestas en esta vista.`;
    document.getElementById('overview-insight').textContent = text;
    document.getElementById('zone-insight').textContent = topZone
        ? `No todas las zonas pierden el mismo número de propuestas entre la mesa y la final. En esta vista, ${topZone[0]} es la zona con más propuestas elegidas por mesa que no llegaron al listado final.`
        : 'No hay suficientes datos para mostrar una lectura por zonas.';
}

function renderSummaryRail(rows) {
    const container = document.getElementById('summary-rail');
    const counts = countBy(rows, 'situacion');
    const summaryStatuses = [
        'Mesa pero no final',
        'Descartada por mesa y en la final',
        'Mesa y final',
        'Final pero no detectada en mesa',
    ];
    const total = summaryStatuses.reduce((sum, status) => sum + (counts[status] || 0), 0) || 1;

    container.innerHTML = summaryStatuses.map(status => {
        const value = counts[status] || 0;
        const percent = (value / total) * 100;
        const meta = STATUS_META[status];
        return `
            <div
                class="mesa-summary-segment ${meta.className}"
                style="width:${percent}%"
                title="${escapeHtml(meta.label)}: ${value}"
                aria-label="${escapeHtml(meta.label)}: ${value}"
            >
                <span class="mesa-summary-sr">${escapeHtml(meta.label)}: ${value}</span>
            </div>
        `;
    }).join('');
}

function renderZoneBars(rows) {
    const container = document.getElementById('zone-bars');
    const byZone = new Map();
    rows.forEach(row => {
        if (!byZone.has(row.zona)) {
            byZone.set(row.zona, {
                visibleTotal: 0,
                mesaNoFinal: 0,
                discardedFinal: 0,
                mesaFinal: 0,
                finalNoMesa: 0,
            });
        }
        const entry = byZone.get(row.zona);
        if (row.situacion === 'Mesa pero no final') entry.mesaNoFinal += 1;
        if (row.situacion === 'Descartada por mesa y en la final') entry.discardedFinal += 1;
        if (row.situacion === 'Mesa y final') entry.mesaFinal += 1;
        if (row.situacion === 'Final pero no detectada en mesa') entry.finalNoMesa += 1;
        if ([
            'Mesa pero no final',
            'Descartada por mesa y en la final',
            'Mesa y final',
            'Final pero no detectada en mesa',
        ].includes(row.situacion)) {
            entry.visibleTotal += 1;
        }
    });

    const zones = Array.from(byZone.entries())
        .sort((a, b) => b[1].mesaNoFinal - a[1].mesaNoFinal || b[1].visibleTotal - a[1].visibleTotal);

    container.innerHTML = zones.map(([zone, entry]) => {
        const total = entry.visibleTotal || 1;
        const noFinalWidth = (entry.mesaNoFinal / total) * 100;
        const discardedFinalWidth = (entry.discardedFinal / total) * 100;
        const mesaFinalWidth = (entry.mesaFinal / total) * 100;
        const finalNoMesaWidth = Math.max(0, 100 - noFinalWidth - discardedFinalWidth - mesaFinalWidth);
        const segments = [
            {
                className: 'status-mesa-no-final',
                width: noFinalWidth,
                count: entry.mesaNoFinal,
            },
            {
                className: 'status-mesa-discarded-final',
                width: discardedFinalWidth,
                count: entry.discardedFinal,
            },
            {
                className: 'status-mesa-final',
                width: mesaFinalWidth,
                count: entry.mesaFinal,
            },
            {
                className: 'status-final-no-mesa',
                width: finalNoMesaWidth,
                count: entry.finalNoMesa,
            },
        ];
        return `
            <div class="mesa-zone-row">
                <div class="mesa-zone-heading">
                    <div>
                        <span>${escapeHtml(zone)}</span>
                    </div>
                </div>
                <div class="mesa-stack" aria-hidden="true">
                    ${segments.map(segment => `
                        <span class="${segment.className}" style="width:${segment.width}%">
                            ${segment.width >= 8 && segment.count > 0 ? `<span class="mesa-stack-value">${segment.count}</span>` : ''}
                        </span>
                    `).join('')}
                </div>
            </div>
        `;
    }).join('');
}

function renderTopProposals() {
    const topRows = state.rows
        .filter(row => (
            row.situacion === 'Mesa pero no final'
            && row.apareceDescartadaEnMesa !== 'SI'
        ))
        .sort((a, b) => b.apoyos - a.apoyos)
        .slice(0, 5);

    document.getElementById('top-proposals').innerHTML = topRows.map((row, index) => `
        <article class="mesa-top-item">
            <span class="mesa-top-rank">${index + 1}</span>
            <div>
                <a href="${escapeHtml(row.enlace)}" target="_blank" rel="noopener noreferrer">${escapeHtml(row.titulo)}</a>
                <p>${escapeHtml(row.zona)} · ${row.apoyos} apoyos</p>
            </div>
        </article>
    `).join('');
}

function renderDiscardedFinalCases(rows) {
    const flagged = rows
        .filter(row => row.situacion === 'Descartada por mesa y en la final')
        .sort((a, b) => b.apoyos - a.apoyos);
    const container = document.getElementById('discarded-final-list');
    const count = document.getElementById('discarded-final-count');
    if (!container || !count) return;
    count.textContent = `${flagged.length} propuestas`;
    if (!flagged.length) {
        container.innerHTML = '<p class="mesa-empty mesa-empty-inline">No hemos detectado casos en esta categoría.</p>';
        return;
    }
    container.innerHTML = flagged.map(row => `
        <article class="mesa-flagged-item">
            <div class="mesa-flagged-head">
                <a href="${escapeHtml(row.enlace)}" target="_blank" rel="noopener noreferrer">${escapeHtml(row.titulo)}</a>
                <span class="mesa-pill status-mesa-discarded-final">En la final</span>
            </div>
            <p>${escapeHtml(row.zona)} · ${row.apoyos} apoyos</p>
            <blockquote>
                <span class="mesa-quote-label">Fragmento del acta</span>
                <span class="mesa-quote-text">${escapeHtml(row.extractoActa)}</span>
            </blockquote>
        </article>
    `).join('');
}

function statusPill(status) {
    const meta = STATUS_META[status] || STATUS_META['Mesa pero no final'];
    return `<span class="mesa-pill ${meta.className}">${escapeHtml(meta.label)}</span>`;
}

function renderTable(rows) {
    const tbody = document.getElementById('proposal-table');
    if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="mesa-empty">No hay resultados con esos filtros.</td></tr>';
        return;
    }

    tbody.innerHTML = rows.map(row => `
        <tr>
            <td data-label="Situacion">${statusPill(row.situacion)}</td>
            <td data-label="Zona">${escapeHtml(row.zona)}</td>
            <td data-label="Apoyos"><strong>${row.apoyos}</strong></td>
            <td data-label="Propuesta">
                <a href="${escapeHtml(row.enlace)}" target="_blank" rel="noopener noreferrer">${escapeHtml(row.titulo)}</a>
                <span class="mesa-proposal-id">#${escapeHtml(row.propuestaId)}</span>
                ${formatExclusionReason(row)}
            </td>
            <td data-label="Categoria">
                <div class="mesa-categories-wrap">
                    ${row.categoria ? row.categoria.split('|').map(cat => cat.trim()).filter(Boolean).map(cat => `<span class="mesa-category-pill">${escapeHtml(cat)}</span>`).join('') : ''}
                </div>
            </td>
        </tr>
    `).join('');
}

function renderActaLinks() {
    const container = document.getElementById('acta-links');
    const entries = Object.entries(ACTA_BY_ZONE).sort((a, b) => a[0].localeCompare(b[0], 'es', { numeric: true }));
    container.innerHTML = entries.map(([zone]) => `
        <button type="button" class="mesa-acta-link-card" data-acta-zone="${escapeHtml(zone)}">
            <strong>${escapeHtml(zone)}</strong>
            <span class="mesa-acta-icon" aria-hidden="true"><i class="fa-regular fa-file-pdf"></i></span>
        </button>
    `).join('');
}

function setupActaModal() {
    const modal = document.getElementById('acta-modal');
    const closeButton = document.getElementById('acta-modal-close');
    const frame = document.getElementById('acta-modal-frame');

    document.addEventListener('click', event => {
        const trigger = event.target.closest('[data-acta-zone]');
        if (!trigger) return;
        const zone = trigger.dataset.actaZone;
        if (!zone) return;
        openActaModal(zone);
    });

    closeButton?.addEventListener('click', () => {
        closeActaModal();
    });

    modal?.addEventListener('click', event => {
        if (event.target === modal) {
            closeActaModal();
        }
    });

    modal?.addEventListener('close', () => {
        if (frame) frame.src = 'about:blank';
        document.body.classList.remove('mesa-modal-open');
    });

    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && modal?.open) {
            closeActaModal();
        }
    });
}

function openActaModal(zone) {
    const acta = getActaForZone(zone);
    const modal = document.getElementById('acta-modal');
    const title = document.getElementById('acta-modal-title');
    const frame = document.getElementById('acta-modal-frame');
    const openLink = document.getElementById('acta-modal-open');
    if (!acta || !modal || !title || !frame || !openLink) return;

    title.textContent = acta.label;
    frame.src = acta.href;
    openLink.href = acta.href;
    document.body.classList.add('mesa-modal-open');
    if (typeof modal.showModal === 'function') {
        modal.showModal();
    } else {
        modal.setAttribute('open', 'open');
    }
}

function closeActaModal() {
    const modal = document.getElementById('acta-modal');
    if (!modal) return;
    if (typeof modal.close === 'function') {
        modal.close();
    } else {
        modal.removeAttribute('open');
        document.body.classList.remove('mesa-modal-open');
        const frame = document.getElementById('acta-modal-frame');
        if (frame) frame.src = 'about:blank';
    }
}

function render() {
    const rows = getFilteredRows();
    updateUrlFromFilters();
    renderMetrics(state.rows);
    renderOverviewInsight(state.rows);
    renderSummaryRail(state.rows);
    renderZoneBars(state.rows);
    renderDiscardedFinalCases(state.rows);
    renderSortIndicators();
    updateQuickChipState();
    renderTable(rows);
}

async function init() {
    try {
        const response = await fetch(CSV_URL);
        if (!response.ok) throw new Error('No se pudo cargar el CSV');
        state.rows = parseRows(parseCsv(await response.text())).sort(compareRows);
        document.body.classList.add('mesa-ready');
        renderActaLinks();
        setupActaModal();
        setupFilters();
        const shouldScrollToTable = hasActiveFilters();
        setupSectionActions();
        renderTopProposals();
        render();
        if (shouldScrollToTable) {
            requestAnimationFrame(() => {
                jumpToDetailedList();
            });
        }
    } catch (error) {
        console.error(error);
        document.getElementById('proposal-table').innerHTML = '<tr><td colspan="5" class="mesa-empty">No se han podido cargar los datos.</td></tr>';
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
