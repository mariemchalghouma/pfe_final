"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  FiActivity,
  FiAlertTriangle,
  FiArrowUp,
  FiBell,
  FiCheckCircle,
  FiClock,
  FiDroplet,
  FiFileText,
  FiMap,
  FiMapPin,
  FiPhoneCall,
  FiRefreshCw,
  FiTruck,
  FiUser,
  FiUsers,
} from "react-icons/fi";
import MapModal from "@/components/map/MapModal";
import {
  arretsAPI,
  camionsAPI,
  carburantAPI,
  poiAPI,
  reclamationsAPI,
  userAPI,
} from "@/services/api";

const periods = [
  { id: "day", label: "Aujourd'hui", days: 1 },
  { id: "week", label: "7 jours", days: 7 },
  { id: "month", label: "30 jours", days: 30 },
];

const demoCallsCount = 4;

const toDateInput = (date) => date.toISOString().slice(0, 10);

const getRangeForPeriod = (periodId) => {
  const period = periods.find((item) => item.id === periodId) || periods[1];
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - (period.days - 1));
  return {
    start: toDateInput(start),
    end: toDateInput(end),
    label: period.label,
  };
};

const normalizeText = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();

const formatNumber = (value) => new Intl.NumberFormat("fr-FR").format(value);

const formatDateTime = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

const formatDateKey = (value) => {
  if (!value) return "";
  if (typeof value === "string" && value.length >= 10)
    return value.slice(0, 10);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return toDateInput(date);
};

const getToneClasses = (tone) => {
  switch (tone) {
    case "success":
      return {
        card: "",
        badge: "bg-emerald-100 text-emerald-700",
        icon: "bg-emerald-100 text-emerald-500",
        line: "text-emerald-700",
      };
    case "warning":
      return {
        card: "",
        badge: "bg-amber-100 text-amber-700",
        icon: "bg-amber-100 text-amber-500",
        line: "text-amber-700",
      };
    case "danger":
      return {
        card: "",
        badge: "bg-red-100 text-red-700",
        icon: "bg-red-100 text-red-500",
        line: "text-red-700",
      };
    case "info":
      return {
        card: "",
        badge: "bg-orange-100 text-orange-600",
        icon: "bg-orange-100 text-orange-500",
        line: "text-sky-700",
      };
    default:
      return {
        card: "",
        badge: "bg-gray-100 text-gray-700",
        icon: "bg-gray-100 text-gray-700",
        line: "text-gray-700",
      };
  }
};

const Dashboard = () => {
  const [period, setPeriod] = useState("week");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [showLoginSuccess, setShowLoginSuccess] = useState(false);
  const [errors, setErrors] = useState([]);
  const [users, setUsers] = useState([]);
  const [pois, setPois] = useState([]);
  const [camions, setCamions] = useState([]);
  const [reclamations, setReclamations] = useState([]);
  const [arrets, setArrets] = useState([]);
  const [carburantRows, setCarburantRows] = useState([]);
  const [poiHistory, setPoiHistory] = useState([]);
  const [notifications, setNotifications] = useState([]);

  const loadDashboard = useCallback(
    async (signal) => {
      const { start, end } = getRangeForPeriod(period);
      const token =
        typeof window !== "undefined" ? localStorage.getItem("token") : null;

      const fetchJson = async (url, options = {}) => {
        const headers = {
          "Content-Type": "application/json",
          ...(options.headers || {}),
        };

        if (token) {
          headers.Authorization = `Bearer ${token}`;
        }

        const response = await fetch(url, {
          ...options,
          headers,
          signal,
        });

        if (!response.ok) {
          const errorPayload = await response.json().catch(() => null);
          throw new Error(errorPayload?.message || `HTTP ${response.status}`);
        }

        return response.json();
      };

      const withFallback = async (promise, fallbackValue, label) => {
        try {
          return await promise;
        } catch (error) {
          setErrors((current) => [...current, `${label}: ${error.message}`]);
          return fallbackValue;
        }
      };

      setErrors([]);

      const [
        usersResult,
        poisResult,
        camionsResult,
        reclamationsResult,
        arretsResult,
        carburantResult,
        poiHistoryResult,
        notificationsResult,
      ] = await Promise.all([
        withFallback(
          fetchJson("/api/users"),
          { success: false, data: [] },
          "Utilisateurs",
        ),
        withFallback(
          fetchJson("/api/poi"),
          { success: false, data: [] },
          "POI",
        ),
        withFallback(
          fetchJson("/api/camions"),
          { success: false, data: [] },
          "Camions",
        ),
        withFallback(
          fetchJson(`/api/reclamations?dateStart=${start}&dateEnd=${end}`),
          {
            success: false,
            data: [],
            stats: { total: 0, confirmees: 0, enAttente: 0, rejetees: 0 },
          },
          "Réclamations carburant",
        ),
        withFallback(
          fetchJson(`/api/arrets?dateStart=${start}&dateEnd=${end}&limit=1000`),
          { success: false, data: [] },
          "Arrêts",
        ),
        withFallback(
          fetchJson(`/api/carburant?dateStart=${start}&dateEnd=${end}`),
          { success: false, data: [] },
          "Carburant",
        ),
        withFallback(
          fetchJson("/api/poi/history"),
          { success: false, data: [] },
          "Historique POI",
        ),
        withFallback(
          fetchJson("/api/notifications"),
          { success: false, data: [] },
          "Notifications",
        ),
      ]);

      setUsers(Array.isArray(usersResult?.data) ? usersResult.data : []);
      setPois(Array.isArray(poisResult?.data) ? poisResult.data : []);
      setCamions(Array.isArray(camionsResult?.data) ? camionsResult.data : []);
      setReclamations(
        Array.isArray(reclamationsResult?.data) ? reclamationsResult.data : [],
      );
      setArrets(Array.isArray(arretsResult?.data) ? arretsResult.data : []);
      setCarburantRows(
        Array.isArray(carburantResult?.data) ? carburantResult.data : [],
      );
      setPoiHistory(
        Array.isArray(poiHistoryResult?.data) ? poiHistoryResult.data : [],
      );
      setNotifications(
        Array.isArray(notificationsResult?.data)
          ? notificationsResult.data
          : [],
      );

      setLastUpdated(new Date());
    },
    [period],
  );

  useEffect(() => {
    const controller = new AbortController();

    const run = async () => {
      setLoading(true);
      try {
        await loadDashboard(controller.signal);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    };

    run();

    return () => controller.abort();
  }, [loadDashboard]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const timer = window.setInterval(() => {
      setRefreshing(true);
      loadDashboard().finally(() => setRefreshing(false));
    }, 60000);

    return () => window.clearInterval(timer);
  }, [loadDashboard]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const hasLoginSuccess = sessionStorage.getItem("loginSuccess") === "1";
    if (!hasLoginSuccess) return;

    setShowLoginSuccess(true);
    sessionStorage.removeItem("loginSuccess");

    const timer = window.setTimeout(() => {
      setShowLoginSuccess(false);
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

  const mapPositions = useMemo(
    () =>
      camions
        .filter((camion) => camion.lat != null && camion.lng != null)
        .map((camion) => ({
          id: camion.plaque,
          lat: camion.lat,
          lng: camion.lng,
          label: camion.plaque,
          status: camion.statut,
          info: `🚚 ${camion.chauffeur || "—"} · 📍 ${camion.localisation || "—"}`,
        })),
    [camions],
  );

  const activeUsers = useMemo(
    () =>
      users.filter((user) => {
        const status = normalizeText(user.status);
        return (
          status === "actif" || status === "active" || status === "enabled"
        );
      }).length,
    [users],
  );

  const totalUsers = users.length;
  const totalPois = pois.length;
  const totalCamions = camions.length;
  const fuelReclamations = reclamations.length;
  const fuelAnomalies = carburantRows.filter(
    (row) => row.statut && normalizeText(row.statut) !== "normal",
  );
  const anomaliesTraitees = fuelAnomalies.filter(
    (row) => normalizeText(row.statut_decision) === "confirmee",
  ).length;
  const anomaliesNonTraitees = fuelAnomalies.filter(
    (row) => normalizeText(row.statut_decision) !== "confirmee",
  ).length;
  const openAlerts = notifications.length;
  const nonConformingStops = arrets.filter(
    (stop) => normalizeText(stop.status) !== "conforme",
  ).length;

  const callsToday = demoCallsCount;

  const kpis = [
    {
      title: "Nombre total d'utilisateurs",
      value: totalUsers,
      subtitle: `${activeUsers} actifs`,
      icon: FiUsers,
      tone: "info",
      change: `Sur ${totalUsers} comptes`,
    },
    {
      title: "Nombre de POI",
      value: totalPois,
      subtitle: "Points de contrôle et sites",
      icon: FiMapPin,
      tone: "success",
      change: `${poiHistory.length} mouvements récents`,
    },
    {
      title: "Réclamations carburant",
      value: fuelReclamations,
      subtitle: `${reclamations.filter((item) => normalizeText(item.statutAnomalie) === "en_attente").length} en attente`,
      icon: FiDroplet,
      tone: "warning",
      change: `${periods.find((item) => item.id === period)?.label || "Période"}`,
    },
    {
      title: "Anomalies traitées",
      value: anomaliesTraitees,
      subtitle: "Statuts confirmés",
      icon: FiCheckCircle,
      tone: "success",
    },
    {
      title: "Anomalies non traitées",
      value: anomaliesNonTraitees,
      subtitle: "En attente de traitement",
      icon: FiAlertTriangle,
      tone: "danger",
    },
    {
      title: "Total camions",
      value: totalCamions,
      subtitle: `${camions.filter((camion) => normalizeText(camion.statut) === "en_route").length} en route`,
      icon: FiTruck,
      tone: "default",
      change: `${camions.filter((camion) => normalizeText(camion.statut) !== "en_route").length} à l&apos;arrêt`,
    },
    {
      title: "Utilisateurs actifs",
      value: activeUsers,
      subtitle: "Dernier statut connu",
      icon: FiUser,
      tone: "success",
      change: `${Math.max(totalUsers - activeUsers, 0)} inactifs`,
    },
    {
      title: "Appels du jour",
      value: callsToday,
      subtitle: "Source démonstration en attente d'API",
      icon: FiPhoneCall,
      tone: "info",
      change: "à brancher",
    },
    {
      title: "Arrêts non conformes",
      value: nonConformingStops,
      subtitle: "Sur la période sélectionnée",
      icon: FiActivity,
      tone: "danger",
      change: `${arrets.length} arrêts analysés`,
    },
    {
      title: "Alertes",
      value: openAlerts,
      subtitle: "Notifications de terrain",
      icon: FiBell,
      tone: "warning",
      change: "mise à jour automatique",
    },
  ];

  const reclamationChartData = useMemo(() => {
    const grouped = new Map();

    reclamations.forEach((item) => {
      const key = formatDateKey(item.dateTransaction || item.createdAt);
      if (!key) return;
      grouped.set(key, (grouped.get(key) || 0) + 1);
    });

    return Array.from(grouped.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [reclamations]);

  const stopsChartData = useMemo(() => {
    const grouped = new Map();

    arrets.forEach((item) => {
      const key = formatDateKey(item.date);
      if (!key) return;
      const isConforme = normalizeText(item.status) === "conforme";
      if (!isConforme) {
        grouped.set(key, (grouped.get(key) || 0) + 1);
      } else if (!grouped.has(key)) {
        grouped.set(key, 0);
      }
    });

    return Array.from(grouped.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [arrets]);

  const recentActivity = useMemo(() => {
    const items = [];

    reclamations
      .slice(0, 5)
      .sort(
        (a, b) =>
          new Date(b.createdAt || b.dateTransaction) -
          new Date(a.createdAt || a.dateTransaction),
      )
      .forEach((item) => {
        items.push({
          id: `reclamation-${item.id}`,
          title: `Réclamation carburant - ${item.matricule}`,
          description: `${item.commentaire || "Réclamation enregistrée"} · ticket ${item.numTicket || "—"}`,
          meta: formatDateTime(item.createdAt || item.dateTransaction),
          tone: "warning",
          href: "/reclamations",
        });
      });

    poiHistory.slice(0, 5).forEach((item, index) => {
      items.push({
        id: `poi-${item.id || index}`,
        title: `${item.action || "Mise à jour"} POI ${item.poi_code || item.code || "—"}`,
        description: item.details || "Historique POI",
        meta: formatDateTime(item.created_at || item.createdAt),
        tone: item.action === "CREATE" ? "success" : "info",
        href: "/gestion-poi",
      });
    });

    notifications.slice(0, 5).forEach((item) => {
      items.push({
        id: `notif-${item.id}`,
        title: item.title || "Alerte",
        description: item.message || "Notification opérationnelle",
        meta: `${item.date || ""} ${item.time || ""}`.trim(),
        tone: item.type === "Arrêt" ? "danger" : "warning",
        href: "/notifications",
      });
    });

    return items
      .sort((a, b) => {
        const left = new Date(a.meta || 0).getTime();
        const right = new Date(b.meta || 0).getTime();
        return Number.isNaN(right) || Number.isNaN(left) ? 0 : right - left;
      })
      .slice(0, 10);
  }, [notifications, poiHistory, reclamations]);

  const latestAlerts = useMemo(
    () =>
      notifications.slice(0, 6).map((item) => ({
        id: item.id,
        title: item.title,
        message: item.message,
        meta: `${item.date || ""} ${item.time || ""}`.trim(),
        tone: item.type === "Arrêt" ? "danger" : "warning",
      })),
    [notifications],
  );

  const fleetSummary = useMemo(() => {
    const enRoute = camions.filter(
      (camion) => normalizeText(camion.statut) === "en_route",
    ).length;
    const stopped = Math.max(totalCamions - enRoute, 0);
    const activeRatio =
      totalCamions > 0 ? Math.round((enRoute / totalCamions) * 100) : 0;
    return { enRoute, stopped, activeRatio };
  }, [camions, totalCamions]);

  const periodLabel =
    periods.find((item) => item.id === period)?.label || "7 jours";

  const renderStatCard = (item) => {
    const tone = getToneClasses(item.tone);
    const Icon = item.icon;

    return (
      <div
        key={item.title}
        className="min-h-[150px] rounded-[18px] border border-slate-200 bg-white p-5 shadow-[0_2px_8px_rgba(15,23,42,0.04)]"
      >
        <div className="flex h-full flex-col justify-between gap-3">
          <div className="flex items-start justify-between gap-3">
            <p className="max-w-[72%] text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
              {item.title}
            </p>
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${tone.icon}`}
            >
              <Icon className="text-[18px]" />
            </div>
          </div>
          <div>
            <p className="text-[26px] font-black leading-none tracking-tight text-slate-950">
              {formatNumber(item.value)}
            </p>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="mx-auto max-w-[1540px] space-y-8 px-6 py-8 xl:px-10">
        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
          {kpis.map(renderStatCard)}
        </section>

        <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="mt-1.5 text-[16px] font-bold tracking-tight text-slate-800">
                  Réclamations carburant
                </h2>
                <p className="mt-1 text-[12px] text-slate-500">
                  Évolution sur {periodLabel.toLowerCase()}
                </p>
              </div>
              <Link
                href="/reclamations"
                className="inline-flex items-center gap-2 text-[12px] font-semibold text-orange-500 transition-colors hover:text-orange-600"
              >
                Détails <FiArrowUp className="rotate-45" />
              </Link>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={reclamationChartData}>
                <defs>
                  <linearGradient id="fuelGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f97316" stopOpacity={0.28} />
                    <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <Tooltip />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke="#f97316"
                  fill="url(#fuelGradient)"
                  strokeWidth={3}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="mt-1.5 text-[16px] font-bold tracking-tight text-slate-800">
                  Arrêts non conformes
                </h2>
                <p className="mt-1 text-[12px] text-slate-500">
                  Évolution sur {periodLabel.toLowerCase()}
                </p>
              </div>
              <Link
                href="/suivi-arret"
                className="inline-flex items-center gap-2 text-[12px] font-semibold text-orange-500 transition-colors hover:text-orange-600"
              >
                Détails <FiArrowUp className="rotate-45" />
              </Link>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={stopsChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke="#dc2626"
                  strokeWidth={3}
                  dot={{ r: 3 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <h2 className="mt-1.5 text-[16px] font-bold tracking-tight text-slate-800">
                  Dernières réclamations
                </h2>
              </div>
              <Link
                href="/reclamations"
                className="inline-flex items-center gap-2 text-[12px] font-semibold text-orange-500 transition-colors hover:text-orange-600"
              >
                Voir tout <FiArrowUp className="rotate-45" />
              </Link>
            </div>

            <div className="space-y-4">
              {reclamations.slice(0, 4).map((item) => (
                <div
                  key={item.id}
                  className="flex items-start justify-between gap-4 rounded-2xl px-2 py-1.5"
                >
                  <div className="min-w-0">
                    <p className="text-[14px] font-semibold text-slate-800">
                      {item.matricule}
                    </p>
                    <p className="text-[12px] text-slate-500">
                      {item.commentaire || "Réclamation carburant"} •{" "}
                      {formatDateTime(item.createdAt || item.dateTransaction)}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-[9px] font-semibold uppercase tracking-[0.18em] ${item.statutAnomalie === "CONFIRMEE" ? "bg-emerald-100 text-emerald-700" : item.statutAnomalie === "REJETEE" ? "bg-slate-100 text-slate-600" : "bg-amber-100 text-amber-700"}`}
                  >
                    {item.statutAnomalie === "CONFIRMEE"
                      ? "Fermée"
                      : item.statutAnomalie === "REJETEE"
                        ? "Rejetée"
                        : "Ouverte"}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <h2 className="mt-1.5 text-[16px] font-bold tracking-tight text-slate-800">
                  Nouveaux POI
                </h2>
              </div>
              <Link
                href="/gestion-poi"
                className="inline-flex items-center gap-2 text-[12px] font-semibold text-orange-500 transition-colors hover:text-orange-600"
              >
                Voir tout <FiArrowUp className="rotate-45" />
              </Link>
            </div>

            <div className="space-y-4">
              {pois.slice(0, 4).map((poi, index) => (
                <div
                  key={poi.id || index}
                  className="flex items-start gap-4 rounded-2xl px-1 py-1.5"
                >
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-orange-50 text-orange-500">
                    <FiMapPin className="text-[18px]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-semibold text-slate-800">
                      {poi.description || poi.code || "POI"}
                    </p>
                    <p className="text-[12px] text-slate-500">
                      {poi.type || "—"} • {poi.groupe || "—"}
                    </p>
                    <p className="text-[12px] text-slate-500">
                      {poi.lat != null && poi.lng != null
                        ? `${poi.lat}, ${poi.lng}`
                        : "—"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {showLoginSuccess && (
          <div className="fixed right-6 top-6 z-50 inline-flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700 shadow-sm">
            <FiCheckCircle /> Connexion réussie.
          </div>
        )}

        {errors.length > 0 && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 shadow-sm">
            Certaines sources n&apos;ont pas répondu correctement. Le dashboard
            reste affiché avec les autres données.
          </div>
        )}
      </div>

      <MapModal
        isOpen={isMapOpen}
        onClose={() => setIsMapOpen(false)}
        positions={mapPositions}
        title="Suivi de la flotte en temps réel"
        zoom={7}
      />
    </>
  );
};

export default Dashboard;