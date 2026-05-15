"use client";

import { useState, useEffect } from "react";
import { FiBell, FiCheck, FiAlertTriangle, FiUnlock, FiPhoneCall, FiFileText } from "react-icons/fi";
import Link from "next/link";

const CATEGORIES = ["Tous", "Arrêt", "Porte", "Appel", "Réclamation"];

// Style visuel par type de notification
const TYPE_STYLE = {
  "Arrêt":        { icon: FiAlertTriangle, color: "text-orange-600", bgColor: "bg-orange-50" },
  "Porte":        { icon: FiUnlock,        color: "text-amber-600",  bgColor: "bg-amber-50" },
  "Appel":        { icon: FiPhoneCall,     color: "text-violet-600", bgColor: "bg-violet-50" },
  "Réclamation":  { icon: FiFileText,      color: "text-red-600",    bgColor: "bg-red-50" },
};
const DEFAULT_STYLE = { icon: FiBell, color: "text-gray-600", bgColor: "bg-gray-50" };

// Couleur de badge par catégorie
const CATEGORY_COLORS = {
  "Arrêt": { bg: "bg-orange-50", text: "text-orange-600", border: "border-orange-200" },
  "Porte": { bg: "bg-amber-50", text: "text-amber-600", border: "border-amber-200" },
  "Appel": { bg: "bg-violet-50", text: "text-violet-600", border: "border-violet-200" },
  "Réclamation": { bg: "bg-red-50", text: "text-red-600", border: "border-red-200" },
  "Système": { bg: "bg-gray-50", text: "text-gray-600", border: "border-gray-200" },
};

const NotificationsPage = () => {
  const [activeTab, setActiveTab] = useState("Tous");
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const getToken = () =>
    typeof window !== "undefined" ? localStorage.getItem("token") : null;

  // Charger les notifications depuis l'API
  const fetchNotifications = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch("/api/notifications", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
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

  useEffect(() => {
    fetchNotifications();
    // Polling toutes les 20s
    const interval = setInterval(fetchNotifications, 20000);
    return () => clearInterval(interval);
  }, []);

  const filteredNotifs =
    activeTab === "Tous"
      ? notifications
      : notifications.filter((n) => n.type === activeTab);

  const unreadCount = notifications.filter((n) => n.isNew).length;

  // Compteurs par catégorie
  const countByCategory = {};
  CATEGORIES.forEach((cat) => {
    if (cat === "Tous") {
      countByCategory[cat] = notifications.length;
    } else {
      countByCategory[cat] = notifications.filter((n) => n.type === cat).length;
    }
  });

  // Marquer toutes comme lues via l'API
  const markAllAsRead = async () => {
    try {
      const response = await fetch("/api/notifications", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ action: "markAllAsRead" }),
      });

      if (response.ok) {
        setNotifications((prev) =>
          prev.map((n) => ({ ...n, isNew: false })),
        );
        window.dispatchEvent(new Event("notificationUpdated"));
      }
    } catch (err) {
      console.error("Erreur markAllAsRead:", err);
    }
  };

  // Marquer une seule notification comme lue via l'API
  const markSingleAsRead = async (notificationId) => {
    try {
      const response = await fetch("/api/notifications", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ action: "markAsRead", notificationId }),
      });

      if (response.ok) {
        setNotifications((prev) =>
          prev.map((n) =>
            n.id === notificationId ? { ...n, isNew: false } : n,
          ),
        );
        window.dispatchEvent(new Event("notificationUpdated"));
      }
    } catch (err) {
      console.error("Erreur markSingleAsRead:", err);
    }
  };

  return (
    <div className="p-8 max-w-5xl mx-auto min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">Notifications</h1>
          <p className="text-sm text-gray-500 mt-1">
            {unreadCount > 0
              ? `${unreadCount} notification${unreadCount > 1 ? "s" : ""} non lue${unreadCount > 1 ? "s" : ""}`
              : "Toutes les notifications sont lues"}
          </p>
        </div>
        <button
          onClick={markAllAsRead}
          disabled={loading || unreadCount === 0}
          className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-bold text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <FiCheck className="text-lg" />
          Tout marquer comme lu
        </button>
      </div>

      {/* Tabs Filter avec compteurs */}
      <div className="flex flex-wrap gap-2 mb-8">
        {CATEGORIES.map((category) => (
          <button
            key={category}
            onClick={() => setActiveTab(category)}
            disabled={loading}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-all shadow-sm disabled:opacity-50 flex items-center gap-2 ${activeTab === category
              ? "bg-orange-500 text-white border-transparent"
              : "bg-white text-gray-600 border border-gray-200 hover:border-orange-300 hover:text-orange-500"
              }`}
          >
            {category}
            {countByCategory[category] > 0 && (
              <span
                className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${activeTab === category
                  ? "bg-white/20 text-white"
                  : "bg-gray-100 text-gray-500"
                  }`}
              >
                {countByCategory[category]}
              </span>
            )}
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
                const style = TYPE_STYLE[notif.type] || DEFAULT_STYLE;
                const IconComponent = style.icon;
                const notifColor = style.color;
                const notifBgColor = style.bgColor;
                const isRead = !notif.isNew;
                const catColors = CATEGORY_COLORS[notif.type] || CATEGORY_COLORS["Système"];

                // Determine target link based on notification type
                let targetHref = null;
                if (notif.type === "Appel" && notif.sessionId) {
                  targetHref = `/appels/${notif.sessionId}`;
                } else if (notif.type === "Arrêt") {
                  targetHref = `/suivi-arret`;
                } else if (notif.type === "Porte") {
                  targetHref = `/ouverture-porte`;
                } else if (notif.type === "Réclamation") {
                  targetHref = `/reclamations`;
                }

                const isClickable = !!targetHref;

                const content = (
                  <div
                    key={notif.id}
                    className={`p-5 flex items-start gap-4 transition-colors hover:bg-orange-50/20 ${!isRead ? "bg-orange-50/10" : ""
                      } ${isClickable ? "cursor-pointer" : ""}`}
                    onClick={() => {
                      if (!isRead) markSingleAsRead(notif.id);
                    }}
                  >
                    <div
                      className={`mt-1 p-2.5 rounded-2xl shadow-sm ${notifBgColor} ${notifColor}`}
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
                          className={`text-[16px] tracking-tight ${!isRead
                            ? "font-black text-gray-900"
                            : "font-bold text-gray-700"
                            }`}
                        >
                          {notif.title}
                        </h3>
                        {!isRead && (
                          <span className="px-2 py-0.5 bg-orange-500 text-white text-[10px] uppercase font-bold tracking-widest rounded-full">
                            Nouveau
                          </span>
                        )}
                        {notif.statutAppel === "En cours" && (
                          <span className="px-2 py-0.5 bg-red-500 text-white text-[10px] uppercase font-bold tracking-widest rounded-full animate-pulse">
                            En cours
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
                      <span className={`px-4 py-1.5 rounded-lg text-xs font-bold ${catColors.bg} ${catColors.border} ${catColors.text} border`}>
                        {notif.type}
                      </span>
                    </div>
                    {!isRead && (
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          markSingleAsRead(notif.id);
                        }}
                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors ml-2"
                        title="Marquer comme lu"
                      >
                        <FiCheck className="text-lg text-gray-600 hover:text-orange-500" />
                      </button>
                    )}
                  </div>
                );

                // Wrapper avec lien pour les types supportés
                if (isClickable) {
                  return (
                    <Link
                      key={notif.id}
                      href={targetHref}
                      className="block"
                    >
                      {content}
                    </Link>
                  );
                }

                return content;
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
