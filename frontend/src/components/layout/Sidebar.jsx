import { createContext, useContext } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
    FiGrid, FiTruck, FiStopCircle, FiUnlock,
    FiDroplet, FiMapPin,
    FiSettings, FiLogOut, FiMenu, FiShield
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
    const location = useLocation();
    const { logout } = useAuth();

    const mainMenu = [
        { name: 'Dashboard', path: '/', icon: FiGrid },
        { name: 'Camions', path: '/camions', icon: FiTruck },
        { name: 'Suivi Arrêt', path: '/suivi-arret', icon: FiStopCircle },
        { name: 'Ouverture Porte', path: '/ouverture-porte', icon: FiUnlock },
        { name: 'Carburant', path: '/carburant', icon: FiDroplet },
    ];

    const secondaryMenu = [
        { name: 'Gestion POI', path: '/gestion-poi', icon: FiMapPin },
        { name: 'Administration', path: '/administration', icon: FiShield },
        { name: 'Paramètres', path: '/parametres', icon: FiSettings },
    ];

    const isActive = (path) => location.pathname === path;

    const MenuItem = ({ item }) => (
        <Link
            to={item.path}
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

    return (
        <div
            className={`h-screen bg-white border-r border-gray-200 flex flex-col fixed left-0 top-0 z-40 transition-all duration-300
        ${isCollapsed ? 'w-[68px]' : 'w-[220px]'}`}
        >
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-4 border-b border-gray-100">
                <div className="bg-orange-500 rounded-xl p-2 flex-shrink-0">
                    <FiTruck className="text-white text-lg" />
                </div>
                {!isCollapsed && (
                    <span className="text-lg font-bold text-gray-800 whitespace-nowrap">FleetTracker</span>
                )}
                <button
                    onClick={toggleCollapsed}
                    className={`p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors ${isCollapsed ? 'mx-auto mt-1' : 'ml-auto'}`}
                >
                    <FiMenu className="text-lg" />
                </button>
            </div>

            {/* Main Menu */}
            <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
                {mainMenu.map((item) => (
                    <MenuItem key={item.path} item={item} />
                ))}

                {/* Separator */}
                <div className="my-4 border-t border-gray-100"></div>

                {secondaryMenu.map((item) => (
                    <MenuItem key={item.path} item={item} />
                ))}
            </nav>

            {/* Logout */}
            <div className="px-3 py-4 border-t border-gray-100">
                <button
                    onClick={() => { logout(); window.location.href = '/login'; }}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-600 hover:bg-red-50 hover:text-red-600 transition-all w-full"
                    title={isCollapsed ? 'Déconnexion' : ''}
                >
                    <FiLogOut className="text-lg flex-shrink-0" />
                    {!isCollapsed && <span className="text-sm font-medium">Déconnexion</span>}
                </button>
            </div>
        </div>
    );
};

export default Sidebar;
