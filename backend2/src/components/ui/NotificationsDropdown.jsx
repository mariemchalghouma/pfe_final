'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { FiBell, FiAlertTriangle, FiUnlock, FiDroplet, FiMonitor } from 'react-icons/fi';
import { usePathname } from 'next/navigation';

export const mockNotifications = [
    {
        id: 1,
        type: 'Arrêt',
        title: 'Arrêt non conforme',
        message: 'TN-9012-C arrêté depuis 45min hors zone POI',
        time: 'Il y a 5 min',
        icon: FiAlertTriangle,
        color: 'text-orange-600',
        bgColor: 'bg-orange-50',
        isNew: true
    },
    {
        id: 2,
        type: 'Porte',
        title: 'Ouverture porte suspecte',
        message: 'TN-5678-B ouverture porte détectée hors livraison',
        time: 'Il y a 12 min',
        icon: FiUnlock,
        color: 'text-amber-600',
        bgColor: 'bg-amber-50',
        isNew: true
    },
    {
        id: 3,
        type: 'Carburant',
        title: 'Consommation anormale',
        message: 'TN-3456-D consommation +40% vs moyenne',
        time: 'Il y a 30 min',
        icon: FiDroplet,
        color: 'text-blue-600',
        bgColor: 'bg-blue-50',
        isNew: true
    },
    {
        id: 4,
        type: 'Système',
        title: 'GPS déconnecté',
        message: 'TN-7890-E signal GPS perdu depuis 2h',
        time: 'Il y a 1 h',
        icon: FiMonitor,
        color: 'text-gray-600',
        bgColor: 'bg-gray-100',
        isNew: false
    },
    {
        id: 5,
        type: 'Arrêt',
        title: 'Arrêt prolongé',
        message: 'TN-1234-A arrêté de 25min chez Carrefour',
        time: 'Il y a 2 h',
        icon: FiAlertTriangle,
        color: 'text-orange-600',
        bgColor: 'bg-orange-50',
        isNew: false
    }
];

const NotificationsDropdown = () => {
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const dropdownRef = useRef(null);
    const pathname = usePathname();
    
    const unreadCount = mockNotifications.filter(n => n.isNew).length;

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        setIsDropdownOpen(false);
    }, [pathname]);

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="flex items-center justify-center p-3 text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-2xl transition-all shadow-sm focus:outline-none"
            >
                <FiBell className="text-[22px]" />
                {unreadCount > 0 && (
                    <span className="absolute top-1.5 right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white shadow-sm ring-2 ring-white">
                        {unreadCount}
                    </span>
                )}
            </button>

            {isDropdownOpen && (
                <div className="absolute right-0 mt-3 w-80 bg-white rounded-2xl shadow-xl shadow-gray-200/50 border border-gray-100 overflow-hidden z-50 transform origin-top-right transition-all">
                    <div className="p-4 border-b border-gray-50 bg-gray-50/50">
                        <h3 className="font-bold text-gray-900 text-[15px]">Notifications</h3>
                        <p className="text-xs text-gray-500">{unreadCount} non lue(s)</p>
                    </div>
                    
                    <div className="max-h-[320px] overflow-y-auto">
                        {mockNotifications.slice(0, 4).map((notif) => (
                            <div key={notif.id} className="p-4 border-b border-gray-50 hover:bg-orange-50/30 transition-colors flex gap-4 cursor-pointer relative group">
                                <div className={`mt-0.5 p-2 rounded-xl h-fit ${notif.bgColor} ${notif.color}`}>
                                    <notif.icon className="text-[16px]" />
                                </div>
                                <div className="flex-1 min-w-0 pr-4">
                                    <p className="text-sm font-bold text-gray-900 truncate tracking-tight">{notif.title}</p>
                                    <p className="text-xs text-gray-500 truncate mt-0.5">{notif.message}</p>
                                    <p className="text-[11px] text-gray-400 mt-1.5 font-medium">{notif.time}</p>
                                </div>
                                {notif.isNew && (
                                    <div className="absolute right-4 top-5 w-2 h-2 bg-orange-500 rounded-full"></div>
                                )}
                            </div>
                        ))}
                    </div>
                    
                    <div className="p-3 bg-gray-50/50 border-t border-gray-100 text-center">
                        <Link 
                            href="/notifications" 
                            className="text-sm font-bold text-orange-600 hover:text-orange-700 transition-colors inline-block w-full py-1"
                        >
                            Voir toutes les notifications
                        </Link>
                    </div>
                </div>
            )}
        </div>
    );
};

export default NotificationsDropdown;
