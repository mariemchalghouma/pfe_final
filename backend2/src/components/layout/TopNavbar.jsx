'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { FiBell } from 'react-icons/fi';
import { mockNotifications } from '@/components/ui/NotificationsDropdown';

const TopNavbar = () => {
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const dropdownRef = useRef(null);

    const unreadCount = mockNotifications.filter((notification) => notification.isNew).length;

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsDropdownOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

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
                    onClick={() => setIsDropdownOpen((prev) => !prev)}
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
                            {mockNotifications.slice(0, 3).map((notification) => (
                                <div
                                    key={notification.id}
                                    className="p-4 border-b border-gray-50 hover:bg-orange-50/30 transition-colors flex gap-3"
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
                                        <p className="text-[11px] text-gray-400 mt-1.5 font-medium">
                                            {notification.time}
                                        </p>
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
