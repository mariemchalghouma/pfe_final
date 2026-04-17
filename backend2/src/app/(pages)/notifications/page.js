"use client";

import { useState, useEffect } from "react";
import { FiBell, FiCheck } from "react-icons/fi";
import {
  FiAlertTriangle,
  FiUnlock,
  FiDroplet,
  FiMonitor,
} from "react-icons/fi";

const CATEGORIES = ["Tous", "Arrêt", "Porte", "Carburant", "Système"];

// Map des icônes
const ICON_MAP = {
  FiAlertTriangle,
  FiUnlock,
  FiDroplet,
  FiMonitor,
};

const NotificationsPage = () => {
  const [activeTab, setActiveTab] = useState("Tous");
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [readNotificationIds, setReadNotificationIds] = useState(new Set());

  // Charger les IDs lus depuis localStorage au montage
  useEffect(() => {
    try {
      const stored = localStorage.getItem("readNotificationIds");
      if (stored) {
        setReadNotificationIds(new Set(JSON.parse(stored)));
      }
    } catch (err) {
      console.error("Erreur lecture localStorage:", err);
    }
  }, []);

  // Charger les notifications depuis l'API
  useEffect(() => {
    const fetchNotifications = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch("/api/notifications", {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
        });

        if (!response.ok) {
          throw new Error("Erreur lors du chargement des notifications");
        }

        const result = await response.json();

        if (result.success && result.data) {
          setNotifications(result.data);
        } else {
          setError("Impossible de charger les notifications");
        }
      } catch (err) {
        console.error("Erreur:", err);
        setError(err.message || "Une erreur est survenue");
      } finally {
        setLoading(false);
      }
    };

    fetchNotifications();
  }, []);

  const filteredNotifs =
    activeTab === "Tous"
      ? notifications
      : notifications.filter((n) => n.type === activeTab);

  const unreadCount = notifications.filter(
    (n) => !readNotificationIds.has(n.id),
  ).length;

  const markAllAsRead = async () => {
    try {
      // Marquer tous les IDs comme lus
      const allIds = new Set(readNotificationIds);
      notifications.forEach((n) => allIds.add(n.id));
      setReadNotificationIds(allIds);

      // Persister dans localStorage
      try {
        localStorage.setItem(
          "readNotificationIds",
          JSON.stringify(Array.from(allIds)),
        );
      } catch (err) {
        console.error("Erreur sauvegarde localStorage:", err);
      }

      // Émettre un événement pour mettre à jour le dropdown
      window.dispatchEvent(new Event("notificationUpdated"));
    } catch (err) {
      console.error("Erreur:", err);
    }
  };

  const markSingleAsRead = async (notificationId) => {
    try {
      // Ajouter l'ID aux notifications lues
      const newReadIds = new Set(readNotificationIds);
      newReadIds.add(notificationId);
      setReadNotificationIds(newReadIds);

      // Persister dans localStorage
      try {
        localStorage.setItem(
          "readNotificationIds",
          JSON.stringify(Array.from(newReadIds)),
        );
      } catch (err) {
        console.error("Erreur sauvegarde localStorage:", err);
      }

      // Émettre un événement pour mettre à jour le dropdown
      window.dispatchEvent(new Event("notificationUpdated"));
    } catch (err) {
      console.error("Erreur:", err);
    }
  };

  return (
    <div className="p-8 max-w-5xl mx-auto min-h-screen">
      {/* Header Notifications */}
      <div className="flex justify-end mb-8 gap-4">
        <button
          onClick={markAllAsRead}
          disabled={loading || unreadCount === 0}
          className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-bold text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
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
            disabled={loading}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-all shadow-sm disabled:opacity-50 ${
              activeTab === category
                ? "bg-orange-500 text-white border-transparent"
                : "bg-white text-gray-600 border border-gray-200 hover:border-orange-300 hover:text-orange-500"
            }`}
          >
            {category}
          </button>
        ))}
      </div>

      {/* État de chargement */}
      {loading && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div>
          <p className="mt-4 text-gray-600">Chargement des notifications...</p>
        </div>
      )}

      {/* Gestion des erreurs */}
      {error && !loading && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
          <p className="text-red-600 font-semibold">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-all"
          >
            Réessayer
          </button>
        </div>
      )}

      {/* Liste des notifications */}
      {!loading && !error && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {filteredNotifs.length > 0 ? (
            <div className="divide-y divide-gray-50">
              {filteredNotifs.map((notif) => {
                const IconComponent = ICON_MAP[notif.icon];
                return (
                  <div
                    key={notif.id}
                    className={`p-5 flex items-start gap-4 transition-colors hover:bg-orange-50/20 ${
                      notif.isNew ? "bg-orange-50/10" : ""
                    }`}
                  >
                    <div
                      className={`mt-1 p-2.5 rounded-2xl shadow-sm ${notif.bgColor} ${notif.color}`}
                    >
                      {IconComponent ? (
                        <IconComponent className="text-xl" />
                      ) : (
                        <FiBell className="text-xl" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3">
                        <h3
                          className={`text-[16px] tracking-tight ${
                            !readNotificationIds.has(notif.id)
                              ? "font-black text-gray-900"
                              : "font-bold text-gray-700"
                          }`}
                        >
                          {notif.title}
                        </h3>
                        {!readNotificationIds.has(notif.id) && (
                          <span className="px-2 py-0.5 bg-orange-500 text-white text-[10px] uppercase font-bold tracking-widest rounded-full">
                            Nouveau
                          </span>
                        )}
                      </div>
                      <p className="text-[14px] text-gray-500 mt-1">
                        {notif.message}
                      </p>
                      <div className="flex items-center gap-2 mt-2">
                        <p className="text-xs text-gray-400 font-medium">
                          {notif.date}
                        </p>
                        <span className="text-gray-300">•</span>
                        <p className="text-xs text-gray-400 font-medium">
                          {notif.time}
                        </p>
                      </div>
                    </div>
                    <div className="hidden sm:block">
                      <span className="px-4 py-1.5 bg-gray-50 border border-gray-100 rounded-lg text-xs font-bold text-gray-600">
                        {notif.type}
                      </span>
                    </div>
                    {!readNotificationIds.has(notif.id) && (
                      <button
                        onClick={() => markSingleAsRead(notif.id)}
                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors ml-2"
                        title="Marquer comme lu"
                      >
                        <FiCheck className="text-lg text-gray-600 hover:text-orange-500" />
                      </button>
                    )}
                  </div>
                );
              })}
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
                Vous n&apos;avez aucune notification dans cette catégorie pour
                le moment.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default NotificationsPage;
