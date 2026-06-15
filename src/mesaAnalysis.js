import { escapeHtml } from './utils.js';

const CSV_URL = 'data/cruce_mesa_vs_final_126_simplificado_2026-06-15.csv';

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
        label: 'En la final sin localizar en acta',
    },
};

const state = {
    rows: [],
    filters: {
        status: 'Todas',
        zone: 'Todas',
        category: 'Todas',
        search: '',
    },
};

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
        const queryMatch = !query || normalize(`${row.titulo} ${row.zona} ${row.categoria} ${row.propuestaId}`).includes(query);
        return statusMatch && zoneMatch && categoryMatch && queryMatch;
    }).sort(compareRows);
}

function compareRows(a, b) {
    const statusA = STATUS_ORDER.indexOf(a.situacion);
    const statusB = STATUS_ORDER.indexOf(b.situacion);
    if (statusA !== statusB) return statusA - statusB;
    if (b.apoyos !== a.apoyos) return b.apoyos - a.apoyos;
    return a.zona.localeCompare(b.zona, 'es');
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
}

function renderMetrics(rows) {
    const counts = countBy(rows, 'situacion');
    document.getElementById('metric-mesa-no-final').textContent = counts['Mesa pero no final'] || 0;
    document.getElementById('metric-mesa-final').textContent = counts['Mesa y final'] || 0;
    document.getElementById('metric-final-no-mesa').textContent = counts['Final pero no detectada en mesa'] || 0;
    document.getElementById('filtered-count').textContent = `${rows.length} propuestas`;
}

function renderStatusBars(rows) {
    const container = document.getElementById('status-bars');
    const counts = countBy(rows, 'situacion');
    const max = Math.max(...STATUS_ORDER.map(status => counts[status] || 0), 1);

    container.innerHTML = STATUS_ORDER.map(status => {
        const value = counts[status] || 0;
        const percent = Math.round((value / max) * 100);
        const meta = STATUS_META[status];
        return `
            <div class="mesa-bar-row">
                <div class="mesa-bar-label">
                    <span>${escapeHtml(meta.label)}</span>
                    <strong>${value}</strong>
                </div>
                <div class="mesa-bar-track">
                    <div class="mesa-bar-fill ${meta.className}" style="width: ${percent}%"></div>
                </div>
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
                    <span>${escapeHtml(zone)}</span>
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
        .slice(0, 10);

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

function render() {
    const rows = getFilteredRows();
    renderMetrics(rows);
    renderStatusBars(rows);
    renderZoneBars(rows);
    renderTable(rows);
}

async function init() {
    try {
        const response = await fetch(CSV_URL);
        if (!response.ok) throw new Error('No se pudo cargar el CSV');
        state.rows = parseRows(parseCsv(await response.text())).sort(compareRows);
        document.body.classList.add('mesa-ready');
        setupFilters();
        renderTopProposals();
        render();
    } catch (error) {
        console.error(error);
        document.getElementById('proposal-table').innerHTML = '<tr><td colspan="6" class="mesa-empty">No se han podido cargar los datos.</td></tr>';
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
