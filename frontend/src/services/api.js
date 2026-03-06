const API_URL = import.meta.env.VITE_API_URL || '/api';

// Fetch wrapper with token management
const fetchWithAuth = async (url, options = {}) => {
    const token = localStorage.getItem('token');

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
    login: (data) => fetchWithAuth('/auth/login', {
        method: 'POST',
        body: JSON.stringify(data),
    }),
    getMe: () => fetchWithAuth('/auth/me'),
};

// Camions API (Voyage + local_histo_gps_all)
export const camionsAPI = {
    getCamions: () => fetchWithAuth('/camions'),
    getCamionTrajet: (camion) => fetchWithAuth(`/camions/${encodeURIComponent(camion)}/trajet`),
};

// Ouvertures API
export const ouverturesAPI = {
    getOuvertures: (params) => fetchWithAuth(`/ouvertures${buildQueryString(params)}`),


    getCamionsWithOuvertures: () => fetchWithAuth('/ouvertures/camions'),
};

// POI API
export const poiAPI = {
    getPOIs: () => fetchWithAuth('/poi'),
    getPOIHistory: () => fetchWithAuth('/poi/history'),
    createPOI: (data) => fetchWithAuth('/poi', {
        method: 'POST',
        body: JSON.stringify(data),
    }),
    updatePOI: (id, data) => fetchWithAuth(`/poi/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
    }),
    deletePOI: (id) => fetchWithAuth(`/poi/${id}`, {
        method: 'DELETE',
    }),
};

// Arrets API
export const arretsAPI = {
    getArrets: () => fetchWithAuth('/arrets'),
};

// User API
export const userAPI = {
    getUsers: () => fetchWithAuth('/users'),
    getUser: (id) => fetchWithAuth(`/users/${id}`),
    createUser: (data) => fetchWithAuth('/users', {
        method: 'POST',
        body: JSON.stringify(data),
    }),
    updateUser: (id, data) => fetchWithAuth(`/users/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
    }),
    deleteUser: (id) => fetchWithAuth(`/users/${id}`, {
        method: 'DELETE',
    }),
};

export default { authAPI, camionsAPI, ouverturesAPI, poiAPI, arretsAPI, userAPI };

