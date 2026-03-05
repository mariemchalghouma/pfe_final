"use client";

import { useState, useRef, useEffect, useCallback } from 'react';
import Sidebar, { SidebarContext } from './Sidebar';
import MapView from '../map/MapView';

const Layout = ({ children }) => {
    // Sidebar collapsed state (shared with Sidebar via context)
    const [isCollapsed, setIsCollapsed] = useState(false);
    const toggleCollapsed = useCallback(() => {
        setIsCollapsed((prev) => !prev);
    }, []);

    return (
        <SidebarContext.Provider value={{ isCollapsed, toggleCollapsed }}>
            <div className="flex h-screen bg-gray-50 overflow-hidden">
                <Sidebar />

                {/* Main content area: sidebar offset + page content */}
                <div
                    className={`flex flex-col flex-1 transition-all duration-300 ${isCollapsed ? 'ml-[68px]' : 'ml-[220px]'} overflow-hidden relative`}
                    id="main-content"
                >
                    <div className="flex-1 overflow-y-auto bg-white border-l border-gray-200">
                        {children}
                    </div>
                </div>
            </div>
        </SidebarContext.Provider>
    );
};

export default Layout;
