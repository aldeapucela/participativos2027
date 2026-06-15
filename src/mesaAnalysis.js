import { escapeHtml } from './utils.js';

const CSV_URL = 'data/cruce_mesa_vs_final_126_simplificado_2026-06-15.csv?v=20260615d';

const ACTA_BY_ZONE = {
    'Zona Centro': {
        label: 'Acta Zona Centro',
        href: 'data/actas-mesa/acta-zona-centro.pdf',
    },
    'Zona Esgueva 1': {
        label: 'Acta Zona Esgueva 1',
        href: 'data/actas-mesa/acta-zona-esgueva-1.pdf',
    },
    'Zona Esgueva 2': {
        label: 'Acta Zona Esgueva 2',
        href: 'data/actas-mesa/acta-zona-esgueva-2.pdf',
    },
    'Zona Este 1': {
        label: 'Acta Zona Este 1',
        href: 'data/actas-mesa/acta-zona-este-1.pdf',
    },
    'Zona Este 2': {
        label: 'Acta Zona Este 2',
        href: 'data/actas-mesa/acta-zona-este-2.pdf',
    },
    'Zona Parquesol': {
        label: 'Acta Zona Parquesol',
        href: 'data/actas-mesa/acta-zona-parquesol.pdf',
    },
    'Zona Pisuerga 1': {
        label: 'Acta Zona Pisuerga 1',
        href: 'data/actas-mesa/acta-zona-pisuerga-1.pdf',
    },
    'Zona Pisuerga 2': {
        label: 'Acta Zona Pisuerga 2',
        href: 'data/actas-mesa/acta-zona-pisuerga-2.pdf',
    },
    'Zona Sur 1': {
        label: 'Acta Zona Sur 1',
        href: 'data/actas-mesa/acta-zona-sur-1.pdf',
    },
    'Zona Sur 2': {
        label: 'Acta Zona Sur 2',
        href: 'data/actas-mesa/acta-zona-sur-2.pdf',
    },
};

const STATUS_ORDER = [
    'Mesa pero no final',
    'Mesa y final',
    'Final pero no detectada en mesa',
];

const STATUS_META = {
    'Mesa pero no final': {
        className: 'status-mesa-no-final',
        label: 'Elegidas por mesa y fuera de la final',
    },
    'Mesa y final': {
        className: 'status-mesa-final',
        label: 'Elegidas por mesa y en la final',
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
        search: '',
        minSupport: 0,
        quick: 'all',
    },
    sort: {
        key: 'default',
        direction: 'desc',
    },
};

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

function parseRows(rows) {
    return rows.map(row => ({
        situacion: row.situacion,
        zona: row.zona,
        propuestaId: row.propuesta_id,
        titulo: row.titulo_propuesta,
        enlace: row.enlace,
        apoyos: Number.parseInt(row.apoyos, 10) || 0,
        categoria: row.categoria || 'Sin categoria',
        apareceEnMesa: row.aparece_en_mesa,
        ordenMesa: row.orden_detectado_en_mesa,
        apareceEnFinal: row.aparece_en_final_126,
        fiabilidad: row.fiabilidad_lectura_mesa || 'no aplica',
    }));
}

function getFilteredRows() {
    const query = normalize(state.filters.search).trim();
    return state.rows.filter(row => {
        const statusMatch = state.filters.status === 'Todas' || row.situacion === state.filters.status;
        const zoneMatch = state.filters.zone === 'Todas' || row.zona === state.filters.zone;
        const categoryMatch = state.filters.category === 'Todas' || row.categoria === state.filters.category;
        const supportMatch = row.apoyos >= state.filters.minSupport;
        const queryMatch = !query || normalize(`${row.titulo} ${row.zona} ${row.categoria} ${row.propuestaId}`).includes(query);
        return statusMatch && zoneMatch && categoryMatch && supportMatch && queryMatch;
    }).sort(compareRows);
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

function setupFilters() {
    const zones = ['Todas', ...new Set(state.rows.map(row => row.zona).filter(Boolean))].sort((a, b) => {
        if (a === 'Todas') return -1;
        if (b === 'Todas') return 1;
        return a.localeCompare(b, 'es', { numeric: true });
    });
    const categories = ['Todas', ...new Set(state.rows.map(row => row.categoria).filter(Boolean))].sort((a, b) => {
        if (a === 'Todas') return -1;
        if (b === 'Todas') return 1;
        return a.localeCompare(b, 'es');
    });
    fillSelect('filter-status', ['Todas', ...STATUS_ORDER], state.filters.status);
    fillSelect('filter-zone', zones, state.filters.zone);
    fillSelect('filter-category', categories, state.filters.category);

    [
        ['filter-status', 'status'],
        ['filter-zone', 'zone'],
        ['filter-category', 'category'],
    ].forEach(([id, key]) => {
        document.getElementById(id)?.addEventListener('change', event => {
            state.filters[key] = event.target.value;
            render();
        });
    });

    document.getElementById('filter-search')?.addEventListener('input', event => {
        state.filters.search = event.target.value;
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

    const statusSelect = document.getElementById('filter-status');
    if (statusSelect) statusSelect.value = state.filters.status;
    updateQuickChipState();
    render();
}

function updateQuickChipState() {
    document.querySelectorAll('.mesa-quick-chip').forEach(button => {
        button.classList.toggle('is-active', button.dataset.quick === state.filters.quick);
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
    document.getElementById('metric-mesa-no-final').textContent = counts['Mesa pero no final'] || 0;
    document.getElementById('metric-mesa-final').textContent = counts['Mesa y final'] || 0;
    document.getElementById('metric-final-no-mesa').textContent = counts['Final pero no detectada en mesa'] || 0;
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
        ? `${counts['Mesa pero no final'] || 0} propuestas elegidas por las mesas no aparecen en la votación final. ${counts['Mesa y final'] || 0} sí llegaron, y ${counts['Final pero no detectada en mesa'] || 0} están en la final pero no las hemos localizado con claridad en las actas.`
        : `Mostrando ${rows.length} propuestas en esta vista.`;
    document.getElementById('overview-insight').textContent = text;
    document.getElementById('zone-insight').textContent = topZone
        ? `No todas las zonas pierden el mismo número de propuestas entre la mesa y la final. En esta vista, ${topZone[0]} es la zona con más propuestas elegidas por mesa que no llegaron al listado final.`
        : 'No hay suficientes datos para mostrar una lectura por zonas.';
}

function renderSummaryRail(rows) {
    const container = document.getElementById('summary-rail');
    const counts = countBy(rows, 'situacion');
    const total = STATUS_ORDER.reduce((sum, status) => sum + (counts[status] || 0), 0) || 1;

    container.innerHTML = STATUS_ORDER.map(status => {
        const value = counts[status] || 0;
        const percent = (value / total) * 100;
        const meta = STATUS_META[status];
        return `
            <div class="mesa-summary-segment ${meta.className}" style="width:${percent}%">
                <span>${escapeHtml(meta.label)}</span>
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
                total: 0,
                mesaNoFinal: 0,
                mesaFinal: 0,
                finalNoMesa: 0,
            });
        }
        const entry = byZone.get(row.zona);
        entry.total += 1;
        if (row.situacion === 'Mesa pero no final') entry.mesaNoFinal += 1;
        if (row.situacion === 'Mesa y final') entry.mesaFinal += 1;
        if (row.situacion === 'Final pero no detectada en mesa') entry.finalNoMesa += 1;
    });

    const zones = Array.from(byZone.entries())
        .sort((a, b) => b[1].mesaNoFinal - a[1].mesaNoFinal || b[1].total - a[1].total);

    container.innerHTML = zones.map(([zone, entry]) => {
        const noFinalWidth = entry.total ? (entry.mesaNoFinal / entry.total) * 100 : 0;
        const mesaFinalWidth = entry.total ? (entry.mesaFinal / entry.total) * 100 : 0;
        const finalNoMesaWidth = Math.max(0, 100 - noFinalWidth - mesaFinalWidth);
        return `
            <div class="mesa-zone-row">
                <div class="mesa-zone-heading">
                    <div>
                        <span>${escapeHtml(zone)}</span>
                    </div>
                    <strong>${entry.mesaNoFinal}/${entry.total}</strong>
                </div>
                <div class="mesa-stack" aria-hidden="true">
                    <span class="status-mesa-no-final" style="width:${noFinalWidth}%"></span>
                    <span class="status-mesa-final" style="width:${mesaFinalWidth}%"></span>
                    <span class="status-final-no-mesa" style="width:${finalNoMesaWidth}%"></span>
                </div>
            </div>
        `;
    }).join('');
}

function renderTopProposals() {
    const topRows = state.rows
        .filter(row => row.situacion === 'Mesa pero no final')
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
            </td>
            <td data-label="Categoria">${escapeHtml(row.categoria)}</td>
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
    renderMetrics(rows);
    renderOverviewInsight(rows);
    renderSummaryRail(rows);
    renderZoneBars(rows);
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
        renderTopProposals();
        render();
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
