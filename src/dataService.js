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
            
            return {
                id: proposal.code,
                title: proposal.title,
                full_description: proposal.description,
                summary: meta.summary || 'Sin resumen disponible',
                category: meta.category || 'Sin categoría',
                tags: meta.tags || [],
                urgent: meta.urgent || false,
                lat: proposal.latitude ? parseFloat(proposal.latitude) : null,
                lng: proposal.longitude ? parseFloat(proposal.longitude) : null,
                zone: proposal.zone,
                zone_id: proposal.zone_id,
                external_url: proposal.url || '#'
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
