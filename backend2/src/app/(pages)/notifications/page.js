"use client";

import { useState } from "react";
import { FiBell, FiCheck } from "react-icons/fi";
import { mockNotifications } from "@/components/ui/NotificationsDropdown";

const CATEGORIES = ["Tous", "Arrêt", "Porte", "Carburant", "Système"];

const NotificationsPage = () => {
  const [activeTab, setActiveTab] = useState("Tous");
  const [notifications, setNotifications] = useState(mockNotifications);

  const filteredNotifs =
    activeTab === "Tous"
      ? notifications
      : notifications.filter((n) => n.type === activeTab);

  const unreadCount = notifications.filter((n) => n.isNew).length;

  const markAllAsRead = () => {
    setNotifications(notifications.map((n) => ({ ...n, isNew: false })));
  };

  return (
    <div className="p-8 max-w-5xl mx-auto min-h-screen">
      {/* Header Notifications */}
      <div className="flex justify-end mb-8 gap-4">
        <button
          onClick={markAllAsRead}
          className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-bold text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm"
        >
          <FiCheck className="text-lg" />
          Tout marquer comme lu
        </button>
      </div>

      {/* Tabs Filter */}
      <div className="flex flex-wrap gap-2 mb-8">
        {CATEGORIES.map((category) => (
          <button
            key={category}
            onClick={() => setActiveTab(category)}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-all shadow-sm ${
              activeTab === category
                ? "bg-orange-500 text-white border-transparent"
                : "bg-white text-gray-600 border border-gray-200 hover:border-orange-300 hover:text-orange-500"
            }`}
          >
            {category}
          </button>
        ))}
      </div>

      {/* Liste des notifications */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {filteredNotifs.length > 0 ? (
          <div className="divide-y divide-gray-50">
            {filteredNotifs.map((notif) => (
              <div
                key={notif.id}
                className={`p-5 flex items-start gap-4 transition-colors hover:bg-orange-50/20 ${notif.isNew ? "bg-orange-50/10" : ""}`}
              >
                <div
                  className={`mt-1 p-2.5 rounded-2xl shadow-sm ${notif.bgColor} ${notif.color}`}
                >
                  <notif.icon className="text-xl" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <h3
                      className={`text-[16px] tracking-tight ${notif.isNew ? "font-black text-gray-900" : "font-bold text-gray-700"}`}
                    >
                      {notif.title}
                    </h3>
                    {notif.isNew && (
                      <span className="px-2 py-0.5 bg-orange-500 text-white text-[10px] uppercase font-bold tracking-widest rounded-full">
                        Nouveau
                      </span>
                    )}
                  </div>
                  <p className="text-[14px] text-gray-500 mt-1">
                    {notif.message}
                  </p>
                  <p className="text-xs text-gray-400 mt-2 font-medium">
                    {notif.time}
                  </p>
                </div>
                <div className="hidden sm:block">
                  <span className="px-4 py-1.5 bg-gray-50 border border-gray-100 rounded-lg text-xs font-bold text-gray-600">
                    {notif.type}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-12 text-center flex flex-col items-center">
            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4 text-gray-300">
              <FiBell className="text-3xl" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-1">
              Aucune notification
            </h3>
            <p className="text-gray-500">
              Vous n&apos;avez aucune notification dans cette catégorie pour le
              moment.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default NotificationsPage;
