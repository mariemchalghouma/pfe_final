'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import Sidebar, { SidebarContext, useSidebar } from '@/components/layout/Sidebar';

const DashboardContent = ({ children }) => {
    const { isCollapsed } = useSidebar();

    return (
        <div className="flex h-screen bg-gray-50 overflow-hidden">
            <Sidebar />
            <main
                className="flex-1 overflow-y-auto transition-all duration-300"
                style={{ marginLeft: isCollapsed ? '68px' : '220px' }}
            >
                {children}
            </main>
        </div>
    );
};

export default function DashboardLayout({ children }) {
    const { isAuthenticated, loading } = useAuth();
    const router = useRouter();
    const [isCollapsed, setIsCollapsed] = useState(false);

    useEffect(() => {
        if (!loading && !isAuthenticated) {
            router.push('/login');
        }
    }, [isAuthenticated, loading, router]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-screen bg-gray-50">
                <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    if (!isAuthenticated) return null;

    return (
        <SidebarContext.Provider value={{ isCollapsed, toggleCollapsed: () => setIsCollapsed(prev => !prev) }}>
            <DashboardContent>{children}</DashboardContent>
        </SidebarContext.Provider>
    );
}
