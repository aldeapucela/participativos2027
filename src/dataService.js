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
 * Service to handle data fetching and merging
 */
export async function fetchData() {
    try {
        const [rawResponse, metaResponse] = await Promise.all([
            fetch('data/proposals_data.json'),
            fetch('data/proposals_metadata.json')
        ]);

        if (!rawResponse.ok || !metaResponse.ok) {
            throw new Error('Error al cargar los datos');
        }

        const rawData = await rawResponse.json();
        const metaData = await metaResponse.json();

        // Merge datasets using 'code' as key
        const mergedData = rawData.map(proposal => {
            const meta = metaData.find(m => String(m.code) === String(proposal.code)) || {};
            
            // Use metadata category if available, otherwise check title for "Inadmitida"
            let category = meta.category || 'Sin categoría';
            
            // Only override category if metadata doesn't have "Inadmitidas" but title contains "inadmitida"
            if (category !== 'Inadmitidas' && proposal.title && proposal.title.toLowerCase().includes('inadmitida')) {
                category = 'Inadmitidas';
            }
            
            // Normalize categories with encoding issues
            if (category && category.includes(' Social y Equipamientos')) {
                category = 'Social y Equipamientos';
            }
            
            return {
                id: proposal.code,
                title: proposal.title,
                full_description: proposal.description,
                summary: meta.summary || 'Sin resumen disponible',
                category: category,
                tags: meta.tags || [],
                urgent: meta.urgent || false,
                votes: proposal.votes || 0,
                lat: proposal.latitude ? parseFloat(proposal.latitude) : null,
                lng: proposal.longitude ? parseFloat(proposal.longitude) : null,
                zone: proposal.zone,
                zone_id: proposal.zone_id,
                external_url: proposal.url || '#',
                image_url: proposal.image_url
            };
        });

        // Unique categories for filters
        const categories = [...new Set(mergedData.map(p => p.category))].filter(Boolean);

        return {
            proposals: mergedData,
            categories: categories
        };
    } catch (error) {
        console.error('DataService Error:', error);
        return { proposals: [], categories: [] };
    }
}
