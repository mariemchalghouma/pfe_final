'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { FiBell, FiAlertTriangle, FiUnlock, FiPhoneCall, FiFileText } from 'react-icons/fi';

// Dériver icon / color / bgColor depuis le type de notification
const TYPE_STYLE = {
    'Arrêt':        { icon: FiAlertTriangle, color: 'text-orange-600', bgColor: 'bg-orange-50' },
    'Porte':        { icon: FiUnlock,        color: 'text-amber-600',  bgColor: 'bg-amber-50' },
    'Appel':        { icon: FiPhoneCall,     color: 'text-violet-600', bgColor: 'bg-violet-50' },
    'Réclamation':  { icon: FiFileText,      color: 'text-red-600',    bgColor: 'bg-red-50' },
};
const DEFAULT_STYLE = { icon: FiBell, color: 'text-gray-600', bgColor: 'bg-gray-50' };

const TopNavbar = () => {
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(false);
    const dropdownRef = useRef(null);
    const pollingIntervalRef = useRef(null);

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
                    const mappedNotifications = result.data.map(notif => {
                        const style = TYPE_STYLE[notif.type] || DEFAULT_STYLE;
                        return { ...notif, icon: style.icon, color: style.color, bgColor: style.bgColor };
                    });
                    setNotifications(mappedNotifications);
                }
            }
        } catch (err) {
            console.error("Erreur lors du chargement des notifications:", err);
        } finally {
            setLoading(false);
        }
    };

    // Marquer une notification comme lue via l'API
    const markAsRead = async (notificationId) => {
        try {
            const token = localStorage.getItem('token');
            if (!token) return;

            await fetch("/api/notifications", {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ action: "markAsRead", notificationId }),
            });

            setNotifications(prev =>
                prev.map(n => n.id === notificationId ? { ...n, isNew: false } : n)
            );
        } catch (err) {
            console.error("Erreur markAsRead:", err);
        }
    };

    // Charger les notifications au montage
    useEffect(() => {
        fetchNotifications();
    }, []);

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

    // Écouter les changements de notifications
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

    const unreadCount = notifications.filter(n => n.isNew).length;

    return (
        <header className="h-[68px] bg-[#f7f7f8] border-b border-gray-200 px-6 flex items-center justify-between">
            <Link href="/dashboard" className="inline-flex items-center">
                <Image
                    src="/logo.png"
                    alt="Alumec"
                    width={110}
                    height={34}
                    className="object-contain"
                    priority
                />
            </Link>

            <div className="relative" ref={dropdownRef}>
                <button
                    onClick={() => {
                        setIsDropdownOpen((prev) => !prev);
                        fetchNotifications();
                    }}
                    className="relative p-2 rounded-full text-gray-700 hover:bg-gray-200 transition-colors"
                    aria-label="Notifications"
                    aria-expanded={isDropdownOpen}
                >
                    <FiBell className="text-[21px]" />
                    {unreadCount > 0 && (
                        <span className="absolute -top-1 -right-0.5 w-5 h-5 rounded-full bg-orange-500 text-[11px] font-bold text-white flex items-center justify-center">
                            {unreadCount}
                        </span>
                    )}
                </button>

                {isDropdownOpen && (
                    <div className="absolute right-0 mt-3 w-[340px] max-w-[calc(100vw-1.5rem)] bg-white rounded-2xl shadow-xl shadow-gray-200/60 border border-gray-100 overflow-hidden z-50">
                        <div className="p-4 border-b border-gray-50 bg-gray-50/60">
                            <h3 className="font-bold text-gray-900 text-[15px]">Notifications</h3>
                            <p className="text-xs text-gray-500">{unreadCount} non lue(s)</p>
                        </div>

                        <div className="max-h-[260px] overflow-y-auto">
                            {notifications.slice(0, 4).map((notification) => (
                                <div
                                    key={notification.id}
                                    className="p-4 border-b border-gray-50 hover:bg-orange-50/30 transition-colors flex gap-3 cursor-pointer"
                                    onClick={() => {
                                        if (notification.isNew) markAsRead(notification.id);
                                    }}
                                >
                                    <div className={`mt-0.5 p-2 rounded-xl h-fit ${notification.bgColor} ${notification.color}`}>
                                        <notification.icon className="text-[16px]" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-bold text-gray-900 truncate tracking-tight">
                                            {notification.title}
                                        </p>
                                        <p className="text-xs text-gray-500 truncate mt-0.5">
                                            {notification.message}
                                        </p>
                                        <div className="flex items-center gap-2 mt-1.5">
                                            <p className="text-[11px] text-gray-400 font-medium">
                                                {notification.date}
                                            </p>
                                            <span className="text-gray-300">•</span>
                                            <p className="text-[11px] text-gray-400 font-medium">
                                                {notification.time}
                                            </p>
                                        </div>
                                    </div>
                                    {notification.isNew && (
                                        <div className="mt-2 w-2 h-2 bg-orange-500 rounded-full flex-shrink-0" />
                                    )}
                                </div>
                            ))}
                        </div>

                        <div className="p-3 bg-gray-50/60 border-t border-gray-100 text-center">
                            <Link
                                href="/notifications"
                                onClick={() => setIsDropdownOpen(false)}
                                className="text-sm font-bold text-orange-600 hover:text-orange-700 transition-colors inline-block w-full py-1"
                            >
                                Voir toutes les notifications
                            </Link>
                        </div>
                    </div>
                )}
            </div>
        </header>
    );
};

export default TopNavbar;
