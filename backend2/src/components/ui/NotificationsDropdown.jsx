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
    const [notifications, setNotifications] = useState(mockNotifications);
    const [loading, setLoading] = useState(false);
    const [readNotificationIds, setReadNotificationIds] = useState(new Set());
    const dropdownRef = useRef(null);
    const pathname = usePathname();
    const pollingIntervalRef = useRef(null);
    
    // Charger les IDs lus depuis localStorage au montage
    useEffect(() => {
        try {
            const stored = localStorage.getItem('readNotificationIds');
            if (stored) {
                setReadNotificationIds(new Set(JSON.parse(stored)));
            }
        } catch (err) {
            console.error("Erreur lecture localStorage:", err);
        }
    }, []);

    // Calculer le compteur de notifications non lues
    const unreadCount = notifications.filter(n => !readNotificationIds.has(n.id)).length;

    // Récupérer les notifications depuis l'API
    const fetchNotifications = async () => {
        try {
            const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
            if (!token) return;

            setLoading(true);
            const response = await fetch("/api/notifications", {
                method: "GET",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
            });

            if (response.ok) {
                const result = await response.json();
                if (result.success && result.data) {
                    // Mapper les icônes des strings aux composants
                    const mappedNotifications = result.data.map(notif => ({
                        ...notif,
                        icon: {
                            'FiAlertTriangle': FiAlertTriangle,
                            'FiUnlock': FiUnlock,
                            'FiDroplet': FiDroplet,
                            'FiMonitor': FiMonitor,
                        }[notif.icon] || FiBell,
                    }));
                    setNotifications(mappedNotifications);
                }
            }
        } catch (err) {
            console.error("Erreur lors du chargement des notifications:", err);
        } finally {
            setLoading(false);
        }
    };

    // Marquer une notification comme lue
    const markAsRead = (notificationId) => {
        const newReadIds = new Set(readNotificationIds);
        newReadIds.add(notificationId);
        setReadNotificationIds(newReadIds);
        
        // Persister dans localStorage
        try {
            localStorage.setItem('readNotificationIds', JSON.stringify(Array.from(newReadIds)));
        } catch (err) {
            console.error("Erreur sauvegarde localStorage:", err);
        }
    };

    // Charger les notifications au montage et recharger quand la page change
    useEffect(() => {
        fetchNotifications();
    }, [pathname]);

    // Polling toutes les 20 secondes
    useEffect(() => {
        pollingIntervalRef.current = setInterval(() => {
            fetchNotifications();
        }, 20000);

        return () => {
            if (pollingIntervalRef.current) {
                clearInterval(pollingIntervalRef.current);
            }
        };
    }, []);

    // Écouter les changements de notifications (quand on marque comme lu)
    useEffect(() => {
        const handleNotificationUpdate = () => {
            fetchNotifications();
        };

        window.addEventListener('notificationUpdated', handleNotificationUpdate);
        return () => {
            window.removeEventListener('notificationUpdated', handleNotificationUpdate);
        };
    }, []);

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
                onClick={() => {
                    setIsDropdownOpen(!isDropdownOpen);
                    fetchNotifications();
                }}
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
                        {notifications.slice(0, 4).map((notif) => {
                            const isRead = readNotificationIds.has(notif.id);
                            return (
                                <div 
                                    key={notif.id} 
                                    className="p-4 border-b border-gray-50 hover:bg-orange-50/30 transition-colors flex gap-4 relative group"
                                    onClick={() => markAsRead(notif.id)}
                                >
                                    <div className={`mt-0.5 p-2 rounded-xl h-fit ${notif.bgColor} ${notif.color}`}>
                                        <notif.icon className="text-[16px]" />
                                    </div>
                                    <div className="flex-1 min-w-0 pr-4">
                                        <p className="text-sm font-bold text-gray-900 truncate tracking-tight">{notif.title}</p>
                                        <p className="text-xs text-gray-500 truncate mt-0.5">{notif.message}</p>
                                        <div className="flex items-center gap-2 mt-1.5">
                                            <p className="text-[11px] text-gray-400 font-medium">{notif.date}</p>
                                            <span className="text-gray-300">•</span>
                                            <p className="text-[11px] text-gray-400 font-medium">{notif.time}</p>
                                        </div>
                                    </div>
                                    {!isRead && (
                                        <div className="absolute right-4 top-5 w-2 h-2 bg-orange-500 rounded-full"></div>
                                    )}
                                </div>
                            );
                        })}
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
