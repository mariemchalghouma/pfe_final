"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FiAlertTriangle,
  FiArrowUp,
  FiCheckCircle,
  FiDroplet,
  FiMapPin,
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
  const [todayStats, setTodayStats] = useState(null);

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
        dashboardStatsResult,
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
        withFallback(
          fetchJson("/api/dashboard"),
          { success: false, data: null },
          "Dashboard Stats",
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




  /* ═══ Prediction gradient bar color ═══ */
  const getPredictionBarStyle = (pct) => {
    if (pct >= 90) return "bg-gradient-to-r from-red-400 to-red-600";
    if (pct >= 75) return "bg-gradient-to-r from-orange-400 to-red-500";
    return "bg-gradient-to-r from-yellow-400 to-orange-500";
  };

  return (
    <>
      <div className="mx-auto max-w-[1540px] space-y-8 px-6 py-8 xl:px-10">
        {/* ═══════════════════════════════════════════════
            SECTION 1: TODAY'S KPI CARDS (6 cards row)
            ═══════════════════════════════════════════════ */}
        <section className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
          {todayCardConfigs.map((cfg) => {
            const value = todayStats?.[cfg.key] ?? "—";
            return (
              <div
                key={cfg.key}
                className="group relative overflow-hidden rounded-2xl border border-slate-100 bg-white p-5 shadow-[0_2px_12px_rgba(15,23,42,0.04)] transition-all duration-200 hover:shadow-[0_4px_20px_rgba(15,23,42,0.08)]"
              >
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-xl">{cfg.icon}</span>
                  <span className="rounded-full bg-slate-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-slate-400">
                    Aujourd&apos;hui
                  </span>
                </div>
                <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-400">
                  {cfg.label}
                </p>
                <p className="mt-1 text-[28px] font-black leading-none tracking-tight text-slate-900">
                  {loading ? (
                    <span className="inline-block h-7 w-10 animate-pulse rounded bg-slate-100" />
                  ) : (
                    formatNumber(value)
                  )}
                </p>
              </div>
            );
          })}
        </section>

        {/* ═══════════════════════════════════════════════
            SECTION 2: PREDICTION > 60% + CHARTS
            ═══════════════════════════════════════════════ */}
        <section className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          {/* ── Prediction > 60% Panel ── */}
          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm xl:col-span-1">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-50">
                <FiAlertTriangle className="text-red-500" />
              </div>
              <div className="flex-1">
                <h2 className="text-[15px] font-bold tracking-tight text-slate-800">
                  Prédiction &gt; 60%
                </h2>
                <p className="text-[11px] text-slate-400">
                  Chauffeurs à risque
                </p>
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
                      <div className="h-4 w-3/4 rounded bg-slate-100" />
                      <div className="h-3 w-full rounded bg-slate-50" />
                    </div>
                  ))}
                </div>
              ) : todayStats?.predictions?.length > 0 ? (
                todayStats.predictions.map((driver, idx) => (
                  <div
                    key={idx}
                    className="rounded-xl border border-slate-100 px-4 py-3"
                  >
                    <div className="mb-1 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-emerald-400" />
                        <span className="text-[13px] font-bold text-slate-800">
                          {driver.nom_chauffeur}
                        </span>
                      </div>
                      <span className="text-[13px] font-black text-red-500">
                        ~{driver.prediction_pct}%
                      </span>
                    </div>
                    <div className="mb-2 flex items-center gap-2 text-[11px] text-slate-400">
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
                <div className="py-8 text-center text-[13px] text-slate-400">
                  <FiCheckCircle className="mx-auto mb-2 text-2xl text-emerald-400" />
                  Aucun chauffeur à risque aujourd&apos;hui
                </div>
              )}
            </div>
          </div>

          {/* ── Dernières réclamations ── */}
          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm xl:col-span-2">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <h2 className="mt-1.5 text-[16px] font-bold tracking-tight text-slate-800">
                  Dernières réclamations
                </h2>
                <p className="mt-1 text-[12px] text-slate-500">
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
              {(!todayStats?.latestReclamations?.length) && !loading && (
                <p className="py-6 text-center text-[13px] text-slate-400">
                  Aucune réclamation récente
                </p>
              )}
              {(todayStats?.latestReclamations || []).map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-4 rounded-xl border border-slate-50 px-4 py-3 transition-colors hover:bg-slate-50/60"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-[14px] font-bold text-orange-500">
                      <FiDroplet />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-slate-800">
                        {item.matricule}
                      </p>
                      <p className="text-[11px] text-slate-400">
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
          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-6 flex items-start justify-between gap-4">
              <h2 className="mt-1.5 text-[16px] font-bold tracking-tight text-slate-800">
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