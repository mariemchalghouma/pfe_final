'use client';

import { createContext, useContext } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { canAccessPath } from '@/utils/permissions';
import {
    FiGrid, FiTruck, FiStopCircle, FiUnlock, FiRadio,
    FiDroplet, FiMapPin,
    FiSettings, FiLogOut, FiMenu, FiShield, FiBell
} from 'react-icons/fi';

// Context for sidebar state
export const SidebarContext = createContext(null);

export const useSidebar = () => {
    const ctx = useContext(SidebarContext);
    if (!ctx) {
        throw new Error('useSidebar must be used within SidebarContext.Provider');
    }
    return ctx;
};

const Sidebar = () => {
    const { isCollapsed, toggleCollapsed } = useSidebar();
    const pathname = usePathname();
    const router = useRouter();
    const { logout, user } = useAuth();

    const mainMenu = [
        { name: 'Dashboard', path: '/dashboard', icon: FiGrid },
        { name: 'Temps Réel', path: '/temps-reel', icon: FiRadio },
        { name: 'Camions', path: '/camions', icon: FiTruck },
        { name: 'Suivi Arrêt', path: '/suivi-arret', icon: FiStopCircle },
        { name: 'Ouverture Porte', path: '/ouverture-porte', icon: FiUnlock },
        { name: 'Carburant', path: '/carburant', icon: FiDroplet },
    ];

    const secondaryMenu = [
        { name: 'Notifications', path: '/notifications', icon: FiBell },
        { name: 'Gestion POI', path: '/gestion-poi', icon: FiMapPin },
        { name: 'Administration', path: '/administration', icon: FiShield },
        { name: 'Paramètres', path: '/parametres', icon: FiSettings },
    ];

    const isActive = (path) => pathname === path;

    const MenuItem = ({ item }) => (
        <Link
            href={item.path}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group
        ${isActive(item.path)
                    ? 'bg-orange-500 text-white shadow-md shadow-orange-200'
                    : 'text-gray-600 hover:bg-orange-50 hover:text-orange-600'
                }`}
            title={isCollapsed ? item.name : ''}
        >
            <item.icon className={`text-lg flex-shrink-0 ${isActive(item.path) ? 'text-white' : 'text-gray-400 group-hover:text-orange-500'}`} />
            {!isCollapsed && <span className="text-sm font-medium whitespace-nowrap">{item.name}</span>}
        </Link>
    );

    const handleLogout = () => {
        logout();
        router.push('/login');
    };

    return (
        <div
            className={`h-screen bg-white border-r border-gray-200 flex flex-col fixed left-0 top-0 z-40 transition-all duration-300
        ${isCollapsed ? 'w-[68px]' : 'w-[220px]'}`}
        >
            {/* Header */}
            <div className={`flex items-center ${isCollapsed ? 'flex-col gap-3' : 'gap-2.5'} px-4 py-4 border-b border-gray-100 min-h-[76px]`}>
                <div className="w-[60px] h-[42px] flex items-center justify-center flex-shrink-0">
                    <img 
                        src="/logo.png?v=3" 
                        alt="Logo" 
                        className="w-full h-full object-contain mix-blend-multiply rounded-md"
                    />
                </div>
                {!isCollapsed && (
                    <div className="flex flex-col flex-1 min-w-0">
                        <span className="text-[16px] font-black text-gray-800 whitespace-nowrap uppercase tracking-tight leading-none truncate">Voyage</span>
                        <span className="text-[11px] font-bold text-orange-500 uppercase tracking-widest leading-tight truncate">Tracking</span>
                    </div>
                )}
                <button
                    onClick={toggleCollapsed}
                    className={`p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors flex-shrink-0 ${isCollapsed ? 'mx-auto' : 'ml-auto'}`}
                    title="Menu"
                >
                    <FiMenu className="text-lg" />
                </button>
            </div>

            {/* Main Menu */}
            <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
                {mainMenu.filter((item) => canAccessPath(user, item.path)).map((item) => (
                    <MenuItem key={item.path} item={item} />
                ))}

                {/* Separator */}
                <div className="my-4 border-t border-gray-100"></div>

                {secondaryMenu.filter((item) => canAccessPath(user, item.path)).map((item) => (
                    <MenuItem key={item.path} item={item} />
                ))}
            </nav>

            {/* Footer */}
            <div className="p-4 border-t border-gray-100 flex flex-col gap-2 mt-auto">
                {/* User Avatar Section */}
                <div className={`flex items-center overflow-hidden mb-2 ${isCollapsed ? 'justify-center w-full' : 'gap-3 px-2'}`}>
                    <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-orange-400 to-orange-500 flex items-center justify-center text-white font-bold text-sm shadow-sm flex-shrink-0">
                        {user?.identifiant ? user.identifiant.substring(0, 2).toUpperCase() : 'AP'}
                    </div>
                    {!isCollapsed && (
                        <div className="flex flex-col min-w-0">
                            <span className="text-sm font-bold text-gray-800 truncate">{user?.identifiant || 'Admin Profil'}</span>
                            <span className="text-xs text-gray-500 truncate capitalize">{user?.type || 'Administrateur'}</span>
                        </div>
                    )}
                </div>

                <div className="w-full h-px bg-gray-100 my-1"></div>

                <button
                    onClick={handleLogout}
                    className={`flex items-center gap-3 w-full p-2.5 rounded-xl text-red-500 hover:bg-red-50 transition-colors font-bold ${
                        isCollapsed ? 'justify-center' : ''
                    }`}
                >
                    <FiLogOut className={`text-lg ${isCollapsed ? '' : 'shrink-0'}`} />
                    {!isCollapsed && <span>Déconnexion</span>}
                </button>
            </div>
        </div>
    );
};

export default Sidebar;
