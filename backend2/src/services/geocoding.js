/**
 * Service de géocodage inverse (coordonnées → adresse)
 * Utilise l'API Nominatim d'OpenStreetMap (gratuite)
 */

const GEOCODING_CACHE = new Map();
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 heures

/**
 * Convertit des coordonnées GPS en adresse
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {Promise<string>} - Adresse formatée ou coordonnées si erreur
 */
export const reverseGeocode = async (lat, lng) => {
    if (!lat || !lng) return '—';

    const cacheKey = `${lat.toFixed(4)},${lng.toFixed(4)}`;
    const cached = GEOCODING_CACHE.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        return cached.address;
    }

    try {
        const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1&accept-language=fr`,
            {
                headers: {
                    'User-Agent': 'Voyage Tracking App'
                }
            }
        );

        if (!response.ok) {
            throw new Error('Geocoding failed');
        }

        const data = await response.json();

        let address = '';
        if (data.address) {
            const parts = [];
            if (data.address.road) parts.push(data.address.road);
            if (data.address.city || data.address.town || data.address.village) {
                parts.push(data.address.city || data.address.town || data.address.village);
            }
            if (data.address.country) parts.push(data.address.country);
            address = parts.join(', ') || data.display_name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
        } else {
            address = data.display_name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
        }

        GEOCODING_CACHE.set(cacheKey, { address, timestamp: Date.now() });

        return address;
    } catch (error) {
        console.warn('Geocoding error:', error);
        return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    }
};

/**
 * Convertit plusieurs coordonnées en adresses (batch)
 * @param {Array<{lat: number, lng: number}>} coords
 * @returns {Promise<Map<string, string>>} - Map de "lat,lng" → adresse
 */
export const reverseGeocodeBatch = async (coords) => {
    const results = new Map();
    const promises = coords.map(async ({ lat, lng }) => {
        const key = `${lat},${lng}`;
        const address = await reverseGeocode(lat, lng);
        results.set(key, address);
    });

    await Promise.all(promises);
    return results;
};
