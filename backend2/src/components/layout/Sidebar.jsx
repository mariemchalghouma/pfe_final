'use client';

import { createContext, useContext, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { canAccessPath, normalizeRoles } from '@/utils/permissions';
import {
    FiGrid, FiTruck, FiStopCircle, FiUnlock, FiRadio,
    FiDroplet, FiMapPin, FiBarChart2, FiAlertTriangle,
    FiPhone,
    FiLogOut, FiShield, FiChevronLeft, FiChevronDown
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
    const [openSubMenus, setOpenSubMenus] = useState({ '/carburant/analyse': true });

    const roleLabels = {
        admin: 'Administrateur',
        poi: 'POI',
        arrets: 'Arrêts',
        portes: 'Portes',
        carburant: 'Carburant',
    };

    const userRoles = normalizeRoles(user?.roles);
    const primaryRole = userRoles[0];
    const userRoleLabel = primaryRole
        ? roleLabels[primaryRole] || String(primaryRole).toUpperCase()
        : 'Utilisateur';

    const mainMenu = [
        { name: 'Dashboard', path: '/dashboard', icon: FiGrid },
        { name: 'Temps Réel', path: '/temps-reel', icon: FiRadio },
        { name: 'Camions', path: '/camions', icon: FiTruck },
        { name: 'Appels', path: '/appels', icon: FiPhone },
        { name: 'Suivi Arrêt', path: '/suivi-arret', icon: FiStopCircle },
        { name: 'Ouverture Porte', path: '/ouverture-porte', icon: FiUnlock },
        {
            name: 'Carburant',
            path: '/carburant/analyse',
            icon: FiDroplet,
            subMenu: [
                { name: 'Analyse', path: '/carburant/analyse', icon: FiBarChart2 },
                { name: 'Rapport et Alerte', path: '/carburant/rapport-alerte', icon: FiAlertTriangle },
            ],
        },
    ];

    const secondaryMenu = [
        { name: 'Gestion POI', path: '/gestion-poi', icon: FiMapPin },
        { name: 'Utilisateur', path: '/administration', icon: FiShield },
    ];

    const isActive = (path) => pathname === path || pathname.startsWith(`${path}/`);
    const toggleSubMenu = (path) => {
        setOpenSubMenus((prev) => ({ ...prev, [path]: !prev[path] }));
    };

    const MenuItem = ({ item }) => {
        const childIsActive = item.subMenu?.some((subItem) => isActive(subItem.path));
        const itemIsActive = isActive(item.path) || childIsActive;
        const visibleSubItems = item.subMenu?.filter((subItem) => canAccessPath(user, subItem.path)) || [];
        const isSubMenuOpen = openSubMenus[item.path] ?? false;

        return (
            <div className="space-y-2">
                {item.subMenu ? (
                    <button
                        type="button"
                        onClick={() => toggleSubMenu(item.path)}
                        className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group
        ${itemIsActive
                                ? 'bg-orange-500 text-white shadow-[0_8px_24px_rgba(249,115,22,0.35)]'
                                : 'text-slate-200 hover:bg-white/10 hover:text-white'
                            }`}
                        title={isCollapsed ? item.name : ''}
                    >
                        <div className="flex items-center gap-3 min-w-0">
                            <item.icon className={`text-lg flex-shrink-0 ${itemIsActive ? 'text-white' : 'text-slate-300 group-hover:text-white'}`} />
                            {!isCollapsed && <span className="text-[13px] font-semibold whitespace-nowrap leading-none">{item.name}</span>}
                        </div>
                        {!isCollapsed && (
                            <FiChevronDown className={`text-base transition-transform ${isSubMenuOpen ? 'rotate-180 text-white' : 'text-slate-200'}`} />
                        )}
                    </button>
                ) : (
                    <Link
                        href={item.path}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group
        ${itemIsActive
                                ? 'bg-orange-500 text-white shadow-[0_8px_24px_rgba(249,115,22,0.35)]'
                                : 'text-slate-200 hover:bg-white/10 hover:text-white'
                            }`}
                        title={isCollapsed ? item.name : ''}
                    >
                        <item.icon className={`text-lg flex-shrink-0 ${itemIsActive ? 'text-white' : 'text-slate-300 group-hover:text-white'}`} />
                        {!isCollapsed && <span className="text-[13px] font-semibold whitespace-nowrap leading-none">{item.name}</span>}
                    </Link>
                )}

                {!isCollapsed && item.subMenu && visibleSubItems.length > 0 && isSubMenuOpen && (
                    <div className="ml-8 space-y-1 border-l border-white/10 pl-3">
                        {visibleSubItems.map((subItem) => (
                                <Link
                                    key={subItem.path}
                                    href={subItem.path}
                                    className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-[12px] font-semibold transition-colors
                                    ${isActive(subItem.path)
                                            ? 'bg-white/10 text-orange-300'
                                            : 'text-slate-300 hover:bg-white/10 hover:text-white'
                                        }`}
                                >
                                    <subItem.icon className="text-sm" />
                                    <span>{subItem.name}</span>
                                </Link>
                            ))}
                    </div>
                )}
            </div>
        );
    };

    const handleLogout = () => {
        logout();
        router.push('/login');
    };

    return (
        <div
            className={`app-sidebar h-screen bg-gradient-to-b from-[#2c2d31] to-[#242529] border-r border-white/10 flex flex-col fixed left-0 top-0 z-40 transition-all duration-300
        ${isCollapsed ? 'w-[84px]' : 'w-[258px]'}`}
        >
            {/* Header */}
            <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'} px-5 py-6 min-h-[88px]`}>
                {!isCollapsed && (
                    <div className="flex items-baseline gap-2 min-w-0">
                        <span className="text-[23px] font-black text-white leading-none tracking-[-0.02em]">VOYAGE</span>
                        <span className="text-[14px] font-bold text-orange-400 leading-none tracking-wide">TRACKING</span>
                    </div>
                )}

                <button
                    onClick={toggleCollapsed}
                    className={`p-1.5 rounded-lg hover:bg-white/10 text-slate-300 transition-colors flex-shrink-0 ${isCollapsed ? 'mx-auto' : ''}`}
                    title="Menu"
                >
                    <FiChevronLeft className={`text-lg transition-transform ${isCollapsed ? 'rotate-180' : ''}`} />
                </button>
            </div>

            {/* Main Menu */}
            <nav className="flex-1 px-4 py-2 space-y-2 overflow-y-auto no-scrollbar">
                {mainMenu.filter((item) => canAccessPath(user, item.path)).map((item) => (
                    <MenuItem key={item.path} item={item} />
                ))}

                {/* Separator */}
                <div className="my-4 border-t border-white/10"></div>

                {secondaryMenu.filter((item) => canAccessPath(user, item.path)).map((item) => (
                    <MenuItem key={item.path} item={item} />
                ))}
            </nav>

            {/* Footer */}
            <div className="p-4 border-t border-white/10 flex flex-col gap-2 mt-auto bg-black/10">

                <Link
                    href="/mon-compte"
                    className={`flex items-center overflow-hidden mb-2 cursor-pointer rounded-xl text-slate-200 hover:bg-white/10 hover:text-white transition-colors p-1.5 no-underline ${isCollapsed ? 'justify-center w-full' : 'gap-3 px-2'}`}
                    title="Mon compte"
                >
                    <div className="w-10 h-10 rounded-full bg-orange-500 flex items-center justify-center text-white font-bold text-sm shadow-sm flex-shrink-0">
                        {user?.identifiant ? user.identifiant.substring(0, 2).toUpperCase() : 'AP'}
                    </div>

                    {!isCollapsed && (
                        <div className="flex flex-col min-w-0">
                            <span className="text-[11px] font-bold text-white truncate">
                                {user?.identifiant || 'Admin Profil'}
                            </span>
                            <span className="text-[10px] text-slate-300 truncate">
                                {userRoleLabel}
                            </span>
                        </div>
                    )}
                </Link>

                <div className="w-full h-px bg-white/10 my-1"></div>

                <button
                    onClick={handleLogout}
                    className={`flex items-center gap-3 w-full p-2.5 rounded-xl text-red-300 hover:text-red-200 hover:bg-red-500/10 transition-colors font-bold ${
                        isCollapsed ? 'justify-center' : ''
                    }`}
                >
                    <FiLogOut className={`text-lg ${isCollapsed ? '' : 'shrink-0'}`} />
                    {!isCollapsed && <span className="text-[13px]">Déconnexion</span>}
                </button>

            </div>
        </div>
    );
};

export default Sidebar;
