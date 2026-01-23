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
 * URL Manager for handling shareable search and filter URLs
 * Provides secure parameter handling for GitHub Pages compatibility
 */
export class URLManager {
    constructor() {
        this.params = new URLSearchParams(window.location.search);
    }

    /**
     * Sanitize a string parameter to prevent XSS and injection attacks
     */
    sanitizeString(str) {
        if (!str || typeof str !== 'string') return '';

        // URLSearchParams.get() already returns a decoded string.
        // Do NOT decode again (double-decoding can throw and corrupt input).
        return str
            .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
            .replace(/<[^>]*>/g, '')
            .replace(/[<>]/g, '')
            .replace(/javascript:/gi, '')
            .replace(/data:/gi, '')
            .replace(/vbscript:/gi, '')
            .replace(/on\w+\s*=/gi, '')
            .replace(/\s+/g, ' ')
            .trim()
            .substring(0, 200);
    }

    /**
     * Sanitize array parameter (tags)
     */
    sanitizeArray(arr) {
        if (!Array.isArray(arr)) return [];
        return arr
            .filter(item => typeof item === 'string')
            .map(item => this.sanitizeString(item))
            .filter(item => item.length > 0)
            .slice(0, 10); // Limit to 10 tags max
    }

    /**
     * Validate and sanitize category against known categories
     */
    validateCategory(category, validCategories) {
        if (category == null) return 'Todas';
        const sanitized = this.sanitizeString(category);
        
        // Additional validation: ensure it's exactly one of the valid categories
        if (validCategories.includes(sanitized)) {
            return sanitized;
        }
        
        // Fallback to default if invalid
        console.warn('Invalid category parameter:', category);
        return 'Todas';
    }

    /**
     * Validate and sanitize zone against known zones
     */
    validateZone(zone, validZones) {
        if (zone == null) return 'Todas zonas';
        const sanitized = this.sanitizeString(zone);
        
        // Additional validation: ensure it's exactly one of the valid zones
        if (validZones.includes(sanitized)) {
            return sanitized;
        }
        
        // Fallback to default if invalid
        console.warn('Invalid zone parameter:', zone);
        return 'Todas zonas';
    }

    validateZoneId(zoneId, validZoneIds) {
        if (zoneId == null || zoneId === '') return 0;
        const parsed = parseInt(String(zoneId), 10);
        if (!Number.isFinite(parsed)) return 0;
        if (parsed === 0) return 0;
        return validZoneIds.has(parsed) ? parsed : 0;
    }

    /**
     * Detect potential security threats in URL parameters
     */
    detectThreats(params) {
        const threats = [];
        
        // Check for suspicious patterns
        const suspiciousPatterns = [
            /<script/i,
            /javascript:/i,
            /data:/i,
            /vbscript:/i,
            /on\w+\s*=/i,
            /expression\s*\(/i,
            /@import/i,
            /binding\s*:/i,
            /union\s+select/i,
            /drop\s+table/i,
            /insert\s+into/i,
            /delete\s+from/i,
            /update\s+set/i,
            /exec\s*\(/i,
            /eval\s*\(/i,
            /system\s*\(/i,
            /shell_exec/i
        ];
        
        Object.entries(params).forEach(([key, value]) => {
            if (typeof value === 'string') {
                suspiciousPatterns.forEach(pattern => {
                    if (pattern.test(value)) {
                        threats.push({
                            parameter: key,
                            value: value,
                            pattern: pattern.source,
                            severity: 'high'
                        });
                    }
                });
            }
        });
        
        return threats;
    }

    /**
     * Enhanced parameter validation with threat detection
     */
    getCurrentParams(validCategories = [], validZoneIds = []) {
        const rawParams = {
            q: this.params.get('q'),
            cat: this.params.get('cat'),
            z: this.params.get('z'),
            zone: this.params.get('zone'),
            tags: this.params.get('tags'),
            sort: this.params.get('sort')
        };
        
        // Detect potential threats
        const threats = this.detectThreats(rawParams);
        if (threats.length > 0) {
            console.warn('Security threats detected in URL parameters:', threats);
            // In production, you might want to log this to a security service
        }
        
        const search = this.sanitizeString(rawParams.q);
        const category = this.validateCategory(rawParams.cat, validCategories);

        const validZoneIdsSet = new Set(
            validZoneIds
                .filter(z => typeof z === 'number' && Number.isFinite(z) && z > 0)
        );

        // Prefer numeric zone id (z=<id>), fallback to 0
        const zone = this.validateZoneId(rawParams.z, validZoneIdsSet);
        
        // Handle tags parameter (comma-separated)
        const tagsParam = rawParams.tags;
        const tags = tagsParam 
            ? this.sanitizeArray(tagsParam.split(',').map(t => t.trim()))
            : [];

        // Handle sort parameter
        const sortByVotes = rawParams.sort === 'votes_asc' ? 'asc' : 'desc';

        return {
            search,
            category,
            zone,
            tags,
            sort: sortByVotes
        };
    }

    /**
     * Update URL with current filter state
     */
    updateURL(search, category, zone, tags, sortByVotes = 'desc') {
        const newParams = new URLSearchParams();
        
        // Only add non-default parameters
        if (search && search.trim()) {
            newParams.set('q', search.trim());
        }
        
        if (category && category !== 'Todas') {
            newParams.set('cat', category.trim());
        }
        
        if (typeof zone === 'number' && zone !== 0) {
            newParams.set('z', String(zone));
        }
        
        if (tags && tags.length > 0) {
            const sanitizedTags = this.sanitizeArray(tags);
            if (sanitizedTags.length > 0) {
                newParams.set('tags', sanitizedTags.join(','));
            }
        }

        // Only add sort parameter if not default (desc)
        if (sortByVotes === 'asc') {
            newParams.set('sort', 'votes_asc');
        }
        // Don't add sort parameter for 'desc' (default state)

        // Update URL without page reload - URLSearchParams handles encoding automatically
        const newURL = newParams.toString() 
            ? `${window.location.pathname}?${newParams.toString()}`
            : window.location.pathname;
        
        window.history.replaceState({}, '', newURL);
        this.params = new URLSearchParams(window.location.search);
    }

    /**
     * Generate shareable URL
     */
    generateShareableURL(search, category, zone, tags, sortByVotes = 'desc') {
        const params = new URLSearchParams();
        
        if (search && search.trim()) {
            params.set('q', search.trim());
        }
        
        if (category && category !== 'Todas') {
            params.set('cat', category.trim());
        }
        
        if (typeof zone === 'number' && zone !== 0) {
            params.set('z', String(zone));
        }
        
        if (tags && tags.length > 0) {
            const sanitizedTags = this.sanitizeArray(tags);
            if (sanitizedTags.length > 0) {
                params.set('tags', sanitizedTags.join(','));
            }
        }

        // Only add sort parameter if not default (desc)
        if (sortByVotes === 'asc') {
            params.set('sort', 'votes_asc');
        }
        // Don't add sort parameter for 'desc' (default state)

        const baseURL = `${window.location.origin}${window.location.pathname}`;
        return params.toString() ? `${baseURL}?${params.toString()}` : baseURL;
    }

    /**
     * Copy URL to clipboard
     */
    async copyToClipboard(url) {
        try {
            await navigator.clipboard.writeText(url);
            return true;
        } catch (err) {
            // Fallback for older browsers
            const textArea = document.createElement('textarea');
            textArea.value = url;
            textArea.style.position = 'fixed';
            textArea.style.opacity = '0';
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            
            try {
                document.execCommand('copy');
                document.body.removeChild(textArea);
                return true;
            } catch (fallbackErr) {
                document.body.removeChild(textArea);
                return false;
            }
        }
    }

    /**
     * Check if there are any active parameters
     */
    hasActiveParams() {
        return this.params.toString().length > 0;
    }

    /**
     * Clear all URL parameters
     */
    clearParams() {
        window.history.replaceState({}, '', window.location.pathname);
        this.params = new URLSearchParams();
    }
}
