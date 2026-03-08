'use client';

import { createContext, useState, useContext, useEffect } from 'react';
import { authAPI } from '@/services/api';
import { isAdminUser, normalizeRoles } from '@/utils/permissions';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const token = localStorage.getItem('token');
        if (token) {
            checkAuth();
        } else {
            setLoading(false);
        }
    }, []);

    const checkAuth = async () => {
        try {
            const response = await authAPI.getMe();
            setUser({ ...response.data, roles: normalizeRoles(response.data?.roles) });
        } catch (error) {
            localStorage.removeItem('token');
        } finally {
            setLoading(false);
        }
    };

    const login = async (identifiant, password) => {
        const response = await authAPI.login({ identifiant, password });
        const { user, token } = response.data;
        localStorage.setItem('token', token);
        setUser({ ...user, roles: normalizeRoles(user?.roles) });
        return response;
    };

    const logout = () => {
        localStorage.removeItem('token');
        setUser(null);
    };

    const value = {
        user,
        loading,
        login,
        logout,
        isAdmin: isAdminUser(user),
        roles: normalizeRoles(user?.roles),
        isAuthenticated: !!user,
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within AuthProvider');
    }
    return context;
};
