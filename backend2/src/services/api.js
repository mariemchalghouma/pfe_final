// Service API centralisé pour toutes les requêtes
const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

// Fetch wrapper with token management
const fetchWithAuth = async (url, options = {}) => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

    const headers = {
        'Content-Type': 'application/json',
        ...options.headers,
    };

    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }

    const config = {
        ...options,
        headers,
    };

    const response = await fetch(`${API_URL}${url}`, config);

    if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'An error occurred' }));
        throw new Error(error.message || `HTTP error! status: ${response.status}`);
    }

    return response.json();
};

// Helper to build query string from params
const buildQueryString = (params) => {
    if (!params || Object.keys(params).length === 0) return '';
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
            query.append(key, value);
        }
    });
    const queryString = query.toString();
    return queryString ? `?${queryString}` : '';
};

// Auth API
export const authAPI = {
    login: (data) => fetchWithAuth('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(data),
    }),
    getMe: () => fetchWithAuth('/api/auth/me'),
};

// Camions API
export const camionsAPI = {
    getCamions: () => fetchWithAuth('/api/camions'),
    getCamionTrajet: (camion) => fetchWithAuth(`/api/camions/${encodeURIComponent(camion)}/trajet`),
    getGantt: (date) => fetchWithAuth(`/api/camions/gantt${buildQueryString({ date })}`),
};

// Ouvertures API
export const ouverturesAPI = {
    getOuvertures: (params) => fetchWithAuth(`/api/ouvertures${buildQueryString(params)}`),
    getCamionsWithOuvertures: () => fetchWithAuth('/api/ouvertures/camions'),
};

// POI API
export const poiAPI = {
    getPOIs: () => fetchWithAuth('/api/poi'),
    getPOIHistory: () => fetchWithAuth('/api/poi/history'),
    createPOI: (data) => fetchWithAuth('/api/poi', {
        method: 'POST',
        body: JSON.stringify(data),
    }),
    updatePOI: (id, data) => fetchWithAuth(`/api/poi/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
    }),
    deletePOI: (id) => fetchWithAuth(`/api/poi/${id}`, {
        method: 'DELETE',
    }),
};

// Arrets API
export const arretsAPI = {
    getArrets: () => fetchWithAuth('/api/arrets'),
};

// Carburant API
export const carburantAPI = {
    getEcarts: (params = {}) => fetchWithAuth(`/api/carburant${buildQueryString(params)}`),
    getEcartsByCamion: (camion, params = {}) => fetchWithAuth(`/api/carburant/${encodeURIComponent(camion)}${buildQueryString(params)}`),
    getNiveau: (camion, params = {}) => fetchWithAuth(`/api/carburant/${encodeURIComponent(camion)}/niveau${buildQueryString(params)}`),
};

export default { authAPI, camionsAPI, ouverturesAPI, poiAPI, arretsAPI, carburantAPI };
