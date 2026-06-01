"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FiAlertTriangle,
  FiArrowUp,
  FiCheckCircle,
  FiDroplet,
  FiMapPin,
  FiPhoneCall,
  FiPlus,
} from "react-icons/fi";
import MapModal from "@/components/map/MapModal";
import { useAuth } from "@/context/AuthContext";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
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

const formatNumber = (value, fallback = "—") => {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return new Intl.NumberFormat("fr-FR").format(num);
};

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

/* ═══ Today stat card configs ═══ */
const todayCardConfigs = [
  {
    key: "unreadNotifications",
    label: "NOTIFICATIONS NON LUES",
    icon: "🔔",
    iconBg: "bg-red-50",
    iconColor: "text-red-500",
  },
  {
    key: "fuelAnomalies",
    label: "ANOMALIES CARBURANT",
    icon: "⛽",
    iconBg: "bg-orange-50",
    iconColor: "text-orange-500",
  },
  {
    key: "callsToday",
    label: "APPELS DU JOUR",
    icon: "📞",
    iconBg: "bg-blue-50",
    iconColor: "text-blue-500",
  },
  {
    key: "tripsTotal",
    label: "TRAJETS DU JOUR",
    icon: "🛤️",
    iconBg: "bg-purple-50",
    iconColor: "text-purple-500",
  },
  {
    key: "tripsCompleted",
    label: "TRAJETS TERMINÉS",
    icon: "✅",
    iconBg: "bg-emerald-50",
    iconColor: "text-emerald-500",
  },
  {
    key: "tripsInProgress",
    label: "TRAJETS EN COURS",
    icon: "🔄",
    iconBg: "bg-amber-50",
    iconColor: "text-amber-500",
  },
];

const CHECKLIST_STORAGE_KEY = "dashboard_checklist_tasks";

const defaultChecklistItems = [
  {
    id: "calls",
    title: "Vérifier les appels du jour",
    description: "Sessions à risque et actions prioritaires",
    status: "done",
    icon: FiPhoneCall,
  },
  {
    id: "fuel",
    title: "Valider anomalies carburant",
    description: "Comparer tickets et capteurs",
    status: "attention",
    icon: FiAlertTriangle,
  },
  {
    id: "poi",
    title: "Mettre à jour les POI",
    description: "3 points critiques à confirmer",
    status: "pending",
    icon: FiMapPin,
  },
  {
    id: "reclamations",
    title: "Traiter les réclamations",
    description: "Vérifier les dossiers ouverts",
    status: "pending",
    icon: FiDroplet,
  },
];

const checklistStyles = {
  done: {
    badge: "bg-emerald-100 text-emerald-700",
    iconWrap: "bg-emerald-50",
    iconColor: "text-emerald-500",
  },
  attention: {
    badge: "bg-amber-100 text-amber-700",
    iconWrap: "bg-amber-50",
    iconColor: "text-amber-600",
  },
  pending: {
    badge: "bg-sky-100 text-sky-700",
    iconWrap: "bg-sky-50",
    iconColor: "text-sky-600",
  },
};

const statusLabels = {
  done: "Fait",
  attention: "Urgent",
  pending: "En attente",
};

const statusOrder = ["pending", "attention", "done"];

const Dashboard = () => {
  const { user } = useAuth();
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
  const [todayStats, setTodayStats] = useState(null);
  const [checklist, setChecklist] = useState(defaultChecklistItems);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskStatus, setNewTaskStatus] = useState("pending");
  const [checklistNotice, setChecklistNotice] = useState("");
  const [checklistNoticeType, setChecklistNoticeType] = useState("success");

  const userDisplayName = useMemo(() => {
    const firstName = user?.first_name || "";
    const lastName = user?.last_name || "";
    const full = `${firstName} ${lastName}`.trim();
    return full || user?.name || user?.identifiant || "Utilisateur";
  }, [user?.first_name, user?.last_name, user?.name, user?.identifiant]);

  const loadDashboard = useCallback(
    async (signal) => {
      const { start, end } = getRangeForPeriod(period);
      const token =
        typeof window !== "undefined" ? localStorage.getItem("token") : null;

      const isAborted = () => Boolean(signal?.aborted);

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
          if (isAborted()) return fallbackValue;
          setErrors((current) => [...current, `${label}: ${error.message}`]);
          return fallbackValue;
        }
      };

      setErrors([]);

      const criticalRequests = Promise.all([
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
          fetchJson("/api/dashboard"),
          { success: false, data: null },
          "Dashboard Stats",
        ),
      ]);

      const supplementaryRequests = Promise.all([
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

      const [
        reclamationsResult,
        arretsResult,
        carburantResult,
        dashboardStatsResult,
      ] = await criticalRequests;

      void supplementaryRequests.then(
        ([
          usersResult,
          poisResult,
          camionsResult,
          poiHistoryResult,
          notificationsResult,
        ]) => {
          if (isAborted()) return;

          setUsers(Array.isArray(usersResult?.data) ? usersResult.data : []);
          setPois(Array.isArray(poisResult?.data) ? poisResult.data : []);
          setCamions(
            Array.isArray(camionsResult?.data) ? camionsResult.data : [],
          );
          setPoiHistory(
            Array.isArray(poiHistoryResult?.data) ? poiHistoryResult.data : [],
          );
          setNotifications(
            Array.isArray(notificationsResult?.data)
              ? notificationsResult.data
              : [],
          );
        },
      );

      setReclamations(
        Array.isArray(reclamationsResult?.data) ? reclamationsResult.data : [],
      );
      setArrets(Array.isArray(arretsResult?.data) ? arretsResult.data : []);
      setCarburantRows(
        Array.isArray(carburantResult?.data) ? carburantResult.data : [],
      );
      setTodayStats(dashboardStatsResult?.data || null);

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
    if (typeof window === "undefined") return;
    try {
      const stored = JSON.parse(
        localStorage.getItem(CHECKLIST_STORAGE_KEY) || "[]",
      );
      if (Array.isArray(stored) && stored.length > 0) {
        setChecklist(stored);
      }
    } catch {
      // ignore invalid storage
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(CHECKLIST_STORAGE_KEY, JSON.stringify(checklist));
    } catch {
      // ignore storage errors
    }
  }, [checklist]);

  useEffect(() => {
    if (!checklistNotice) return undefined;
    const timer = window.setTimeout(() => setChecklistNotice(""), 2500);
    return () => window.clearTimeout(timer);
  }, [checklistNotice]);

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

  const handleAddTask = (event) => {
    event?.preventDefault?.();
    const title = newTaskTitle.trim();
    if (!title) {
      setChecklistNoticeType("error");
      setChecklistNotice("Veuillez saisir un titre.");
      return;
    }
    const nextTask = {
      id: `task_${Date.now()}`,
      title,
      description: "Tâche personnalisée",
      status: newTaskStatus,
      icon: FiCheckCircle,
    };
    setChecklist((current) => [nextTask, ...current]);
    setNewTaskTitle("");
    setNewTaskStatus("pending");
    setChecklistNoticeType("success");
    setChecklistNotice("Tâche ajoutée.");
  };

  const handleCycleStatus = (itemId) => {
    setChecklist((current) =>
      current.map((item) => {
        if (item.id !== itemId) return item;
        const currentIndex = statusOrder.indexOf(item.status);
        const nextStatus =
          statusOrder[(currentIndex + 1) % statusOrder.length] || "pending";
        const statusLabel = statusLabels[nextStatus] || "En attente";
        setChecklistNoticeType(nextStatus === "done" ? "success" : "info");
        setChecklistNotice(`Statut mis à jour : ${statusLabel}.`);
        return { ...item, status: nextStatus };
      }),
    );
  };

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

  const trendMeta = useMemo(() => getRangeForPeriod(period), [period]);

  const trendSeries = useMemo(() => {
    const counts = new Map();
    arrets.forEach((row) => {
      const status = String(row.status || row.etat || "").toLowerCase();
      if (status !== "non_conforme") return;
      const dateKey = formatDateKey(
        row.beginstoptime || row.date || row.endstoptime,
      );
      if (!dateKey) return;
      counts.set(dateKey, (counts.get(dateKey) || 0) + 1);
    });

    const startDate = new Date(trendMeta.start);
    const endDate = new Date(trendMeta.end);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()))
      return [];

    const series = [];
    for (
      let d = new Date(startDate);
      d <= endDate;
      d.setDate(d.getDate() + 1)
    ) {
      const key = toDateInput(d);
      series.push({
        date: key,
        value: counts.get(key) || 0,
      });
    }
    return series;
  }, [arrets, trendMeta.end, trendMeta.start]);

  const trendTotal = useMemo(
    () => trendSeries.reduce((sum, row) => sum + row.value, 0),
    [trendSeries],
  );
  const trendPeak = useMemo(
    () => trendSeries.reduce((max, row) => Math.max(max, row.value), 0),
    [trendSeries],
  );
  const trendLatest = trendSeries.length
    ? trendSeries[trendSeries.length - 1].value
    : 0;

  const checklistProgress = useMemo(() => {
    const total = checklist.length;
    const done = checklist.filter((item) => item.status === "done").length;
    const pct = total ? Math.round((done / total) * 100) : 0;
    return { total, done, pct };
  }, [checklist]);

  const lastUpdatedLabel = useMemo(() => {
    if (!lastUpdated) return "—";
    return formatDateTime(lastUpdated);
  }, [lastUpdated]);

  /* ═══ Prediction gradient bar color ═══ */
  const getPredictionBarStyle = (pct) => {
    if (pct >= 90) return "bg-gradient-to-r from-red-400 to-red-600";
    if (pct >= 75) return "bg-gradient-to-r from-orange-400 to-red-500";
    return "bg-gradient-to-r from-yellow-400 to-orange-500";
  };

  return (
    <section className="min-h-full bg-[#f3f4f6] p-6 text-sm text-gray-700">
      <div className="mx-auto max-w-[1540px] space-y-6">
        {/* ═══════════════════════════════════════════════
            HEADER: USER + STATUS
            ═══════════════════════════════════════════════ */}
        <section className="dash-fade flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-gray-100 bg-white px-6 py-5 shadow-sm">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400">
              Tableau de bord
            </p>
            <h1 className="mt-2 text-lg font-black uppercase tracking-wide text-gray-900">
              Bonjour, {userDisplayName}
            </h1>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════
            SECTION 1: TODAY'S KPI CARDS (6 cards row)
            ═══════════════════════════════════════════════ */}
        <section className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
          {todayCardConfigs.map((cfg) => {
            const value = todayStats?.[cfg.key] ?? "—";
            return (
              <div
                key={cfg.key}
                className="group relative overflow-hidden rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-all duration-200 hover:shadow-md"
              >
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-xl">{cfg.icon}</span>
                  <span className="rounded-full bg-gray-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-gray-400">
                    Aujourd&apos;hui
                  </span>
                </div>
                <p className="mt-3 text-[10px] font-bold uppercase tracking-widest text-gray-400">
                  {cfg.label}
                </p>
                <p className="mt-1 text-[28px] font-black leading-none tracking-tight text-gray-900">
                  {loading ? (
                    <span className="inline-block h-7 w-10 animate-pulse rounded bg-gray-100" />
                  ) : (
                    formatNumber(value)
                  )}
                </p>
              </div>
            );
          })}
        </section>

        {/* ═══════════════════════════════════════════════
            SECTION 1B: QUICK ACTIONS + MINIMAL TREND
            ═══════════════════════════════════════════════ */}
        <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_2fr]">
          <div className="dash-fade relative overflow-hidden rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="relative">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400">
                    Checklist
                  </p>
                  <h2 className="mt-2 text-base font-black uppercase tracking-wide text-gray-900">
                    Routine de supervision
                  </h2>
                  <p className="mt-1 text-[12px] text-gray-500">
                    {checklistProgress.total} actions clés pour aujourd&apos;hui
                  </p>
                </div>
                <div className="rounded-full border border-gray-100 bg-white px-3 py-1 text-[11px] font-semibold text-gray-500 shadow-sm">
                  {checklistProgress.done}/{checklistProgress.total} terminées
                </div>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-gray-100">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-amber-400 to-orange-400"
                  style={{ width: `${checklistProgress.pct}%` }}
                />
              </div>
              {checklistNotice ? (
                <div
                  className={`mt-4 rounded-xl border px-3 py-2 text-[12px] font-semibold ${
                    checklistNoticeType === "error"
                      ? "border-red-200 bg-red-50 text-red-700"
                      : checklistNoticeType === "info"
                        ? "border-sky-200 bg-sky-50 text-sky-700"
                        : "border-emerald-200 bg-emerald-50 text-emerald-700"
                  }`}
                >
                  {checklistNotice}
                </div>
              ) : null}

              <form
                onSubmit={handleAddTask}
                className="mt-5 flex flex-wrap gap-2 rounded-2xl border border-dashed border-gray-200 bg-gray-50/70 px-3 py-3"
              >
                <input
                  type="text"
                  value={newTaskTitle}
                  onChange={(event) => setNewTaskTitle(event.target.value)}
                  placeholder="Ajouter une tâche..."
                  className="flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-[12px] font-medium text-gray-700 outline-none transition focus:border-orange-300 focus:ring-2 focus:ring-orange-100"
                />
                <select
                  value={newTaskStatus}
                  onChange={(event) => setNewTaskStatus(event.target.value)}
                  className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-[12px] font-semibold text-gray-600"
                >
                  <option value="pending">En attente</option>
                  <option value="attention">Urgent</option>
                  <option value="done">Fait</option>
                </select>
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2 text-[12px] font-semibold text-white shadow-sm transition hover:bg-orange-600"
                >
                  <FiPlus className="text-[14px]" />
                  Ajouter
                </button>
              </form>

              <div className="mt-4 space-y-3">
                {checklist.map((item) => {
                  const Icon = item.icon || FiCheckCircle;
                  const tone =
                    checklistStyles[item.status] || checklistStyles.pending;
                  const statusLabel = statusLabels[item.status] || "En attente";
                  return (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white px-3 py-3 shadow-sm"
                    >
                      <div
                        className={`flex h-10 w-10 items-center justify-center rounded-xl ${tone.iconWrap}`}
                      >
                        <Icon className={`text-[18px] ${tone.iconColor}`} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-semibold text-gray-800">
                          {item.title}
                        </p>
                        <p className="text-[11px] text-gray-400">
                          {item.description || "Tâche personnalisée"}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCycleStatus(item.id)}
                        className={`shrink-0 rounded-full px-3 py-1 text-[9px] font-bold uppercase tracking-widest transition ${tone.badge}`}
                        title="Cliquer pour changer l'état"
                      >
                        {statusLabel}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="dash-fade relative overflow-hidden rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="relative">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400">
                    Tendance
                  </p>
                  <h2 className="mt-2 text-base font-black uppercase tracking-wide text-gray-900">
                    Arrêts non conformes
                  </h2>
                  <p className="mt-1 text-[12px] text-gray-500">
                    Total {formatNumber(trendTotal, "0")} sur{" "}
                    {trendMeta.label.toLowerCase()}.
                  </p>
                </div>
                <div className="inline-flex items-center gap-1 rounded-full bg-gray-100 p-1 text-[11px] font-semibold text-gray-500">
                  {periods
                    .filter((item) => item.id !== "day")
                    .map((item) => (
                      <button
                        key={item.id}
                        onClick={() => setPeriod(item.id)}
                        className={`rounded-full px-3 py-1 transition-all ${
                          period === item.id
                            ? "bg-white text-gray-900 shadow-sm"
                            : "text-gray-500"
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                </div>
              </div>

              <div className="mt-4 h-[170px]">
                {loading ? (
                  <div className="flex h-full items-center justify-center">
                    <div className="h-3 w-3 animate-ping rounded-full bg-orange-400" />
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={trendSeries}
                      margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient
                          id="trendFill"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="0%"
                            stopColor="#f97316"
                            stopOpacity={0.35}
                          />
                          <stop
                            offset="100%"
                            stopColor="#f97316"
                            stopOpacity={0.02}
                          />
                        </linearGradient>
                      </defs>
                      <XAxis
                        dataKey="date"
                        tickFormatter={(value) => String(value || "").slice(5)}
                        tick={{ fontSize: 10, fill: "#94a3b8" }}
                        axisLine={false}
                        tickLine={false}
                        interval="preserveStartEnd"
                      />
                      <YAxis hide />
                      <Tooltip
                        contentStyle={{
                          borderRadius: 12,
                          border: "none",
                          boxShadow: "0 8px 24px rgba(15,23,42,0.12)",
                          fontSize: 12,
                        }}
                        labelFormatter={(label) => `Date: ${label}`}
                        formatter={(value) => [value, "Arrêts NC"]}
                      />
                      <Area
                        type="monotone"
                        dataKey="value"
                        stroke="#f97316"
                        strokeWidth={2}
                        fill="url(#trendFill)"
                        activeDot={{ r: 5 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-4 text-[11px] font-semibold text-slate-500">
                <span>Dernier jour: {formatNumber(trendLatest, "0")}</span>
                <span>Pic: {formatNumber(trendPeak, "0")}</span>
              </div>
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════
            SECTION 2: PREDICTION > 60% + CHARTS
            ═══════════════════════════════════════════════ */}
        <section className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          {/* ── Prediction > 60% Panel ── */}
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm xl:col-span-1">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-50">
                <FiAlertTriangle className="text-red-500" />
              </div>
              <div className="flex-1">
                <h2 className="text-[15px] font-black uppercase tracking-wide text-gray-800">
                  Prédiction &gt; 60%
                </h2>
                <p className="text-[11px] text-gray-400">Chauffeurs à risque</p>
              </div>
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-red-500 text-[11px] font-bold text-white">
                {todayStats?.predictionsCount ?? 0}
              </span>
            </div>

            <div className="max-h-[420px] space-y-4 overflow-y-auto pr-1">
              {loading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="animate-pulse space-y-2">
                      <div className="h-4 w-3/4 rounded bg-gray-100" />
                      <div className="h-3 w-full rounded bg-gray-50" />
                    </div>
                  ))}
                </div>
              ) : todayStats?.predictions?.length > 0 ? (
                todayStats.predictions.map((driver, idx) => (
                  <div
                    key={idx}
                    className="rounded-xl border border-gray-100 px-4 py-3"
                  >
                    <div className="mb-1 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-emerald-400" />
                        <span className="text-[13px] font-bold text-gray-800">
                          {driver.nom_chauffeur}
                        </span>
                      </div>
                      <span className="text-[13px] font-black text-red-500">
                        ~{driver.prediction_pct}%
                      </span>
                    </div>
                    <div className="mb-2 flex items-center gap-2 text-[11px] text-gray-400">
                      <span>{driver.camion_id}</span>
                      <span>·</span>
                      <span>{driver.nb_appels} rav.</span>
                      <span className="ml-auto">
                        Écart moy. {driver.ecart_moy}%
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${getPredictionBarStyle(driver.prediction_pct)}`}
                        style={{
                          width: `${Math.min(driver.prediction_pct, 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-8 text-center text-[13px] text-gray-400">
                  <FiCheckCircle className="mx-auto mb-2 text-2xl text-emerald-400" />
                  Aucun chauffeur à risque aujourd&apos;hui
                </div>
              )}
            </div>
          </div>

          {/* ── Dernières réclamations ── */}
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm xl:col-span-2">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <h2 className="mt-1.5 text-[16px] font-black uppercase tracking-wide text-gray-800">
                  Dernières réclamations
                </h2>
                <p className="mt-1 text-[12px] text-gray-500">
                  Réclamations carburant récentes
                </p>
              </div>
              <Link
                href="/reclamations"
                className="inline-flex items-center gap-2 text-[12px] font-semibold text-orange-500 transition-colors hover:text-orange-600"
              >
                Voir tout <FiArrowUp className="rotate-45" />
              </Link>
            </div>
            <div className="space-y-3">
              {!todayStats?.latestReclamations?.length && !loading && (
                <p className="py-6 text-center text-[13px] text-gray-400">
                  Aucune réclamation récente
                </p>
              )}
              {(todayStats?.latestReclamations || []).map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-4 rounded-xl border border-gray-50 px-4 py-3 transition-colors hover:bg-gray-50/60"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-[14px] font-bold text-orange-500">
                      <FiDroplet />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-gray-800">
                        {item.matricule}
                      </p>
                      <p className="text-[11px] text-gray-400">
                        {item.commentaire || "Réclamation carburant"} •{" "}
                        {formatDateTime(item.createdAt || item.dateTransaction)}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-3 py-1 text-[9px] font-semibold uppercase tracking-[0.18em] ${item.statutAnomalie === "CONFIRMEE" ? "bg-emerald-100 text-emerald-700" : item.statutAnomalie === "REJETEE" ? "bg-slate-100 text-slate-600" : "bg-amber-100 text-amber-700"}`}
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
        </section>

        {/* ═══════════════════════════════════════════════
            SECTION 3: NOUVEAUX POI
            ═══════════════════════════════════════════════ */}
        <section className="grid grid-cols-1 gap-6">
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="mb-6 flex items-start justify-between gap-4">
              <h2 className="mt-1.5 text-[16px] font-black uppercase tracking-wide text-gray-800">
                Nouveaux POI
              </h2>
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
                    <p className="truncate text-[14px] font-semibold text-gray-800">
                      {poi.description || poi.code || "POI"}
                    </p>
                    <p className="text-[12px] text-gray-500">
                      {poi.type || "—"} • {poi.groupe || "—"}
                    </p>
                    <p className="text-[12px] text-gray-500">
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
    </section>
  );
};

export default Dashboard;
