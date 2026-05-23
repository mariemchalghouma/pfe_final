"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import {
  FiPlus,
  FiFilter,
  FiMap,
  FiTarget,
  FiCheckCircle,
  FiXCircle,
  FiPhone,
  FiPhoneOff,
} from "react-icons/fi";
import PoiModal from "@/components/PoiModal";
import MapModal from "@/components/map/MapModal";
import { poiAPI, arretsAPI } from "@/services/api";
import { getAppelsParSource } from "@/lib/api";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const EmptyStopIcon = () => (
  <svg
    width="44"
    height="44"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <circle cx="12" cy="12" r="10" stroke="#F97316" strokeWidth="1.8" />
    <rect
      x="9"
      y="9"
      width="6"
      height="6"
      rx="1"
      stroke="#F97316"
      strokeWidth="1.8"
    />
  </svg>
);

const getToday = () => new Date().toISOString().split("T")[0];

const getInitialFilters = (today) => ({
  dateFilterMode: "day",
  filterDate: today,
  filterStartDate: "",
  filterEndDate: "",
  filterWeek: "",
  filterMonth: "",
  filterMatricule: "",
  filterType: "Tous",
  filterSite: "ALL",
});

function StatCard({ title, value, icon: Icon, iconWrap, valueColor }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-4">
        <div
          className={`flex h-12 w-12 items-center justify-center rounded-2xl ${iconWrap}`}
        >
          <Icon className="text-xl" />
        </div>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
            {title}
          </p>
          <p className={`text-2xl font-black leading-none ${valueColor}`}>
            {value}
          </p>
        </div>
      </div>
    </div>
  );
}

const SITE_OPTIONS = [
  "BAR",
  "JER",
  "GAB",
  "SAL",
  "CAP",
  "9901",
  "GAS",
  "BSL",
  "BIZ",
  "SFX",
  "TUN",
  "BKS",
];
const normalizeSite = (value) => (value || "").toString().trim().toUpperCase();

const extractSiteCode = (value) => {
  const raw = (value || "").toString().trim();
  if (!raw || raw === "-") return null;
  const code = raw.includes(" - ") ? raw.split(" - ")[0] : raw;
  const normalized = normalizeSite(code);
  return normalized && normalized !== "-" ? normalized : null;
};

const getPlannedPoiCode = (arret) => {
  const planned = extractSiteCode(arret?.destination_programmee);
  if (planned) return planned;
  return extractSiteCode(arret?.nextDestination) || "";
};

const getPoiDescription = (arret) => {
  const address = (arret?.poiGps || "").toString().trim();
  return address && address !== "-" ? address : "";
};

const normalizeCamion = (value) => (value || "").toString().trim();

const parseToMs = (value) => {
  if (!value) return null;
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  const raw = String(value).trim();
  if (!raw) return null;
  const normalized = raw
    .replace(" ", "T")
    .replace(/([+-]\d{2})$/, "$1:00");
  const ms = Date.parse(normalized);
  return Number.isFinite(ms) ? ms : null;
};

const toDateKey = (value) => {
  const ms = parseToMs(value);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString().split("T")[0];
};

const parseSourceId = (sourceId) => {
  if (!sourceId || !sourceId.includes("|")) return null;
  const [camion, tsRaw] = sourceId.split("|", 2);
  return {
    camion: normalizeCamion(camion),
    tsMs: parseToMs(tsRaw),
  };
};

const isStopCall = (appel) => {
  const sourceTable = (appel?.source_table || "").toString().toLowerCase().trim();
  const typeNc = (appel?.type_nc || "").toString().toLowerCase().trim();
  return sourceTable === "voyage_tracking_stops" || typeNc.startsWith("arret");
};

const Arrets = () => {
  const [arrets, setArrets] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedArretId, setSelectedArretId] = useState(null);
  const [appelsData, setAppelsData] = useState([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    const fetchGroups = async () => {
      const initialGroups = [
        { id: "g1", nom: "Dépôt", couleur: "#fbbf24" },
        { id: "g2", nom: "Client Interne", couleur: "#f97316" },
        { id: "g3", nom: "Client Externe", couleur: "#ef4444" },
        { id: "g4", nom: "Station", couleur: "#a855f7" },
        { id: "g5", nom: "Zone Industrielle", couleur: "#06b6d4" },
      ];
      setGroups(initialGroups);
    };

    fetchGroups();
  }, []);

  const today = useMemo(() => getToday(), []);
  const initialFilters = useMemo(() => getInitialFilters(today), [today]);
  const [draftFilters, setDraftFilters] = useState(initialFilters);
  const [appliedFilters, setAppliedFilters] = useState(initialFilters);

  const [showPoiModal, setShowPoiModal] = useState(false);
  const [poiModalData, setPoiModalData] = useState(null);
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [mapPositions, setMapPositions] = useState([]);
  const latestFetchIdRef = useRef(0);

  const dateRangeParams = useMemo(() => {
    const {
      dateFilterMode,
      filterDate,
      filterStartDate,
      filterEndDate,
      filterWeek,
      filterMonth,
    } = appliedFilters;

    if (dateFilterMode === "day") {
      const day = filterDate || today;
      return { dateStart: day, dateEnd: day };
    }

    if (dateFilterMode === "range") {
      return {
        dateStart: filterStartDate || today,
        dateEnd: filterEndDate || filterStartDate || today,
      };
    }

    if (dateFilterMode === "week" && filterWeek) {
      const [year, week] = filterWeek.split("-W").map(Number);
      const firstDayOfYear = new Date(Date.UTC(year, 0, 1));
      const firstWeekDayOffset = (firstDayOfYear.getUTCDay() || 7) - 1;
      const weekStart = new Date(firstDayOfYear);
      weekStart.setUTCDate(
        firstDayOfYear.getUTCDate() - firstWeekDayOffset + (week - 1) * 7,
      );
      const weekEnd = new Date(weekStart);
      weekEnd.setUTCDate(weekStart.getUTCDate() + 6);

      return {
        dateStart: weekStart.toISOString().split("T")[0],
        dateEnd: weekEnd.toISOString().split("T")[0],
      };
    }

    if (dateFilterMode === "month" && filterMonth) {
      const [y, m] = filterMonth.split("-").map(Number);
      const monthStart = new Date(Date.UTC(y, m - 1, 1));
      const monthEnd = new Date(Date.UTC(y, m, 0));
      return {
        dateStart: monthStart.toISOString().split("T")[0],
        dateEnd: monthEnd.toISOString().split("T")[0],
      };
    }

    return { dateStart: today, dateEnd: today };
  }, [appliedFilters, today]);

  useEffect(() => {
    let isCancelled = false;
    const fetchId = ++latestFetchIdRef.current;

    const fetchArrets = async () => {
      try {
        setLoading(true);
        const { dateStart, dateEnd } = dateRangeParams;
        const response = await arretsAPI.getArrets({
          dateStart,
          dateEnd,
          limit: 500,
          offset: 0,
        });

        if (isCancelled || fetchId !== latestFetchIdRef.current) {
          return;
        }

        if (response.success) {
          setArrets(response.data || []);
          setHasMore(response.meta?.hasMore || false);
          setOffset(0);
        } else {
          setArrets([]);
          setHasMore(false);
          setOffset(0);
        }
      } catch (error) {
        if (isCancelled || fetchId !== latestFetchIdRef.current) {
          return;
        }
        console.error("Error fetching arrets:", error);
        setArrets([]);
        setHasMore(false);
        setOffset(0);
      } finally {
        if (!isCancelled && fetchId === latestFetchIdRef.current) {
          setLoading(false);
        }
      }
    };

    fetchArrets();

    const fetchAppels = async () => {
      try {
        const { dateStart } = dateRangeParams;
        const result = await getAppelsParSource(dateStart);
        setAppelsData(result.appels || []);
      } catch (error) {
        console.error("Error fetching appels:", error);
      }
    };

    fetchAppels();

    return () => {
      isCancelled = true;
    };
  }, [dateRangeParams]);

  const handleLoadMore = async () => {
    if (loadingMore || loading || !hasMore) return;

    try {
      setLoadingMore(true);
      const { dateStart, dateEnd } = dateRangeParams;
      const newOffset = offset + 500;
      const response = await arretsAPI.getArrets({
        dateStart,
        dateEnd,
        limit: 500,
        offset: newOffset,
      });

      if (response.success) {
        setArrets((prev) => {
          const seen = new Set(prev.map((item) => item.id));
          const next = [...prev];
          (response.data || []).forEach((item) => {
            if (!seen.has(item.id)) {
              seen.add(item.id);
              next.push(item);
            }
          });
          return next;
        });
        setHasMore(response.meta?.hasMore || false);
        setOffset(newOffset);
      }
    } catch (error) {
      console.error("Error loading more arrets:", error);
    } finally {
      setLoadingMore(false);
    }
  };

  const findAppelForArret = (arret) => {
    const camion = normalizeCamion(arret.camion);
    if (!camion) return null;

    const stopMs = parseToMs(arret.beginstoptime || arret._stopStart || arret.date);
    const stopDateKey = toDateKey(arret.beginstoptime || arret.date);

    const candidates = appelsData.filter((a) =>
      a?.session_id &&
      normalizeCamion(a.camion_id) === camion &&
      isStopCall(a)
    );

    if (!candidates.length) return null;

    const MAX_DIFF_MS = 90 * 60 * 1000;
    if (stopMs != null) {
      let best = null;
      for (const appel of candidates) {
        const parsed = parseSourceId(appel.source_id);
        if (!parsed || parsed.camion !== camion || parsed.tsMs == null) continue;
        const diff = Math.abs(parsed.tsMs - stopMs);
        if (!best || diff < best.diff) best = { appel, diff };
      }
      if (best && best.diff <= MAX_DIFF_MS) return best.appel;
    }

    if (stopDateKey) {
      const sameDay = candidates.filter((a) =>
        toDateKey(a.ts_detection || a.date_appel) === stopDateKey
      );
      if (sameDay.length === 1) return sameDay[0];
      if (sameDay.length > 1 && stopMs != null) {
        let best = null;
        for (const appel of sameDay) {
          const appelMs = parseToMs(appel.ts_detection || appel.date_appel);
          if (appelMs == null) continue;
          const diff = Math.abs(appelMs - stopMs);
          if (!best || diff < best.diff) best = { appel, diff };
        }
        if (best) return best.appel;
      }
      if (sameDay.length > 0) return sameDay[0];
    }

    return null;
  };

  const availableSites = useMemo(() => {
    const dynamicSites = new Set(
      arrets
        .flatMap((a) => [
          extractSiteCode(a.destination_programmee),
          extractSiteCode(a.poiPlanning),
        ])
        .filter(Boolean),
    );

    const merged = [...SITE_OPTIONS];
    dynamicSites.forEach((s) => {
      if (!merged.includes(s)) merged.push(s);
    });
    return merged;
  }, [arrets]);

  const filteredData = useMemo(() => {
    const { filterType, filterMatricule, filterSite } = appliedFilters;
    return arrets.filter((arret) => {
      const matchesType =
        filterType === "Tous"
          ? true
          : filterType === "Conforme"
            ? arret.status === "conforme"
            : filterType === "Non conforme"
              ? arret.status === "non_conforme"
              : true;

      const normalizedFilter = (filterMatricule || "")
        .replace(/\s/g, "")
        .toLowerCase();
      const normalizedCamion = (arret.camion || "")
        .replace(/\s/g, "")
        .toLowerCase();
      const matchesMatricule = filterMatricule
        ? normalizedCamion.includes(normalizedFilter)
        : true;

      const rowSites = [
        extractSiteCode(arret.destination_programmee),
        extractSiteCode(arret.poiPlanning),
      ].filter(Boolean);
      const matchesSite = filterSite === "ALL" ? true : rowSites.includes(filterSite);

      return matchesType && matchesMatricule && matchesSite;
    });
  }, [arrets, appliedFilters]);

  const stats = useMemo(() => {
    return {
      total: filteredData.length,
      nc: filteredData.filter((a) => a.status === "non_conforme").length,
      c: filteredData.filter((a) => a.status === "conforme").length,
    };
  }, [filteredData]);

  const handleSelectArret = (arret) => {
    setSelectedArretId(arret.id);
    const latStr = parseFloat(arret.lat).toFixed(6);
    const lngStr = parseFloat(arret.lng).toFixed(6);
    const visitedPois = Array.isArray(arret.validatedPois) ? arret.validatedPois : [];
    setMapPositions([
      {
        id: arret.id,
        lat: arret.lat,
        lng: arret.lng,
        label: arret.camion,
        status: arret.status,
        info: (
          <>
            🕒 {arret.date} · ⏳ {arret.duree}
            <br />
            📍 Lat: {latStr}, Lng: {lngStr}
            {visitedPois.length > 0 && (
              <>
                <br />
                ✓ POI validés: {visitedPois.map((poi) => poi.label || poi.code).join(", ")}
              </>
            )}
            {arret.nextDestination && (
              <>
                <br />
                ➜ Prochaine destination: {arret.nextDestination}
              </>
            )}
          </>
        ),
      },
    ]);
    setIsMapOpen(true);
  };

  const handleOpenPoiModal = (e, arret) => {
    e.stopPropagation();
    setPoiModalData({
      ...arret,
      code: getPlannedPoiCode(arret),
      description: getPoiDescription(arret),
    });
    setShowPoiModal(true);
  };

  const handleOpenFullMap = () => {
    const positions = filteredData.map((a) => {
      const latStr = parseFloat(a.lat).toFixed(6);
      const lngStr = parseFloat(a.lng).toFixed(6);
      const visitedPois = Array.isArray(a.validatedPois) ? a.validatedPois : [];
      return {
        id: a.id,
        lat: a.lat,
        lng: a.lng,
        label: a.camion,
        status: a.status,
        info: (
          <>
            🕒 {a.date} · ⏳ {a.duree}
            <br />
            📍 Lat: {latStr}, Lng: {lngStr}
            {visitedPois.length > 0 && (
              <>
                <br />
                ✓ POI validés: {visitedPois.map((poi) => poi.label || poi.code).join(", ")}
              </>
            )}
            {a.nextDestination && (
              <>
                <br />
                ➜ Prochaine destination: {a.nextDestination}
              </>
            )}
          </>
        ),
      };
    });
    setMapPositions(positions);
    setIsMapOpen(true);
  };

  const updateDraftFilter = (key, value) => {
    setDraftFilters((prev) => ({ ...prev, [key]: value }));
  };

  const applyFilters = () => {
    setAppliedFilters(draftFilters);
  };

  const resetFilters = () => {
    setDraftFilters(initialFilters);
    setAppliedFilters(initialFilters);
  };

  const handleSavePoi = async (poiData) => {
    try {
      await poiAPI.createPOI(poiData);
      let autoValidationFailed = false;

      if (poiModalData?.id) {
        try {
          const updateRes = await arretsAPI.updateEtat({
            row_ctid: poiModalData.id,
            etat: "conforme",
          });
          if (!updateRes?.success || Number(updateRes?.updated || 0) === 0) {
            autoValidationFailed = true;
          }
        } catch (error) {
          autoValidationFailed = true;
          console.error("Failed to update arret etat:", error);
        }
      }

      setShowPoiModal(false);
      setPoiModalData(null);
      alert(
        autoValidationFailed
          ? "POI ajouté, mais l'arrêt n'a pas pu être validé automatiquement."
          : "POI ajouté avec succès !",
      );
      window.location.reload();
    } catch (error) {
      console.error("Failed to save POI:", error);
      alert("Erreur lors de l'ajout du POI.");
    }
  };

  const chartData = useMemo(() => {
    const dataByDate = {};
    filteredData.forEach((arret) => {
      const fullDate = (arret.date || "").split(" ")[0];
      if (!fullDate) return;

      if (!dataByDate[fullDate]) {
        dataByDate[fullDate] = {
          fullDate,
          date: fullDate.substring(5),
          conforme: 0,
          non_conforme: 0,
        };
      }

      if (arret.status === "conforme") {
        dataByDate[fullDate].conforme++;
      } else if (arret.status === "non_conforme") {
        dataByDate[fullDate].non_conforme++;
      }
    });

    return Object.values(dataByDate).sort((a, b) =>
      a.fullDate.localeCompare(b.fullDate),
    );
  }, [filteredData]);

  return (
    <>
      <div className="p-6">
        <div className="mx-auto max-w-[1500px] space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <StatCard
              title="Total"
              value={String(stats.total)}
              icon={FiTarget}
              iconWrap="bg-slate-100 text-slate-500"
              valueColor="text-slate-900"
            />
            <StatCard
              title="Conformes"
              value={String(stats.c)}
              icon={FiCheckCircle}
              iconWrap="bg-orange-50 text-orange-500"
              valueColor="text-orange-600"
            />
            <StatCard
              title="Non conformes"
              value={String(stats.nc)}
              icon={FiXCircle}
              iconWrap="bg-red-50 text-red-500"
              valueColor="text-red-500"
            />
          </div>

          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="mb-6 flex items-center justify-between gap-3">
              <h2 className="text-base font-black uppercase tracking-wide text-gray-900">
                Filtres
              </h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleOpenFullMap}
                  className="rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-2 text-gray-500 transition hover:bg-orange-50 hover:text-orange-600"
                  title="Voir sur la carte"
                >
                  <FiMap className="text-sm" />
                </button>

                <button
                  onClick={resetFilters}
                  className="rounded-xl border border-gray-200 px-3 py-2 text-xs font-bold text-gray-600 hover:bg-gray-50"
                >
                  Reinitialiser
                </button>

                <button
                  onClick={applyFilters}
                  disabled={loading}
                  className={`rounded-xl px-4 py-2 text-xs font-bold text-white transition-colors ${
                    loading
                      ? "bg-orange-300 cursor-not-allowed"
                      : "bg-orange-500 hover:bg-orange-600"
                  }`}
                >
                  {loading ? (
                    <span className="inline-flex items-center gap-2">
                      <svg
                        className="h-4 w-4 animate-spin text-white"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        ></circle>
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                        ></path>
                      </svg>
                      <span>Chargement...</span>
                    </span>
                  ) : (
                    "Appliquer"
                  )}
                </button>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <label className="space-y-1.5 xl:col-span-1">
                <span className="text-xs font-semibold text-gray-500">
                  Mode de date
                </span>
                <div className="inline-flex w-fit rounded-xl bg-gray-100 p-1">
                  {[
                    { id: "day", label: "Jour" },
                    { id: "range", label: "Plage" },
                    { id: "week", label: "Semaine" },
                    { id: "month", label: "Mois" },
                  ].map((mode) => (
                    <button
                      key={mode.id}
                      onClick={() =>
                        updateDraftFilter("dateFilterMode", mode.id)
                      }
                      className={`rounded-lg px-2.5 py-2 text-xs font-bold transition-all ${
                        draftFilters.dateFilterMode === mode.id
                          ? "bg-white text-orange-600 shadow-sm"
                          : "text-gray-500 hover:text-gray-700"
                      }`}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
              </label>

              <label
                className={`space-y-1.5 ${
                  draftFilters.dateFilterMode === "range"
                    ? "xl:col-span-2"
                    : "xl:col-span-1"
                }`}
              >
                <span className="text-xs font-semibold text-gray-500">Date</span>
                <div
                  className={`flex items-center gap-2 ${
                    draftFilters.dateFilterMode === "range"
                      ? "w-full"
                      : "xl:w-[220px]"
                  }`}
                >
                  {draftFilters.dateFilterMode === "day" && (
                    <input
                      type="date"
                      value={draftFilters.filterDate}
                      onChange={(e) =>
                        updateDraftFilter("filterDate", e.target.value)
                      }
                      className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 outline-none ring-orange-400 transition focus:ring-2"
                    />
                  )}
                  {draftFilters.dateFilterMode === "range" && (
                    <>
                      <input
                        type="date"
                        value={draftFilters.filterStartDate}
                        onChange={(e) =>
                          updateDraftFilter("filterStartDate", e.target.value)
                        }
                        className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 outline-none ring-orange-400 transition focus:ring-2"
                      />
                      <input
                        type="date"
                        value={draftFilters.filterEndDate}
                        onChange={(e) =>
                          updateDraftFilter("filterEndDate", e.target.value)
                        }
                        className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 outline-none ring-orange-400 transition focus:ring-2"
                      />
                    </>
                  )}
                  {draftFilters.dateFilterMode === "week" && (
                    <input
                      type="week"
                      value={draftFilters.filterWeek}
                      onChange={(e) =>
                        updateDraftFilter("filterWeek", e.target.value)
                      }
                      className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 outline-none ring-orange-400 transition focus:ring-2"
                    />
                  )}
                  {draftFilters.dateFilterMode === "month" && (
                    <input
                      type="month"
                      value={draftFilters.filterMonth}
                      onChange={(e) =>
                        updateDraftFilter("filterMonth", e.target.value)
                      }
                      className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 outline-none ring-orange-400 transition focus:ring-2"
                    />
                  )}
                </div>
              </label>

              <label className="space-y-1.5">
                <span className="text-xs font-semibold text-gray-500">Matricule</span>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                    <FiFilter className="text-gray-400" />
                  </div>
                  <input
                    type="text"
                    placeholder="Matricule..."
                    value={draftFilters.filterMatricule}
                    onChange={(e) =>
                      updateDraftFilter("filterMatricule", e.target.value)
                    }
                    className="h-11 w-full rounded-xl border border-gray-200 bg-white pl-10 pr-3 text-sm font-medium text-gray-700 outline-none ring-orange-400 transition focus:ring-2"
                  />
                </div>
              </label>

              <label className="space-y-1.5">
                <span className="text-xs font-semibold text-gray-500">Site</span>
                <select
                  value={draftFilters.filterSite}
                  onChange={(e) => updateDraftFilter("filterSite", e.target.value)}
                  className="h-11 w-full appearance-none rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 outline-none ring-orange-400 transition focus:ring-2"
                >
                  <option value="ALL">Tous les sites</option>
                  {availableSites.map((site) => (
                    <option key={site} value={site}>
                      {site}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1.5">
                <span className="text-xs font-semibold text-gray-500">Type</span>
                <div className="relative">
                  <select
                    value={draftFilters.filterType}
                    onChange={(e) => updateDraftFilter("filterType", e.target.value)}
                    className="h-11 w-full appearance-none rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 outline-none ring-orange-400 transition focus:ring-2"
                  >
                    <option>Tous</option>
                    <option>Conforme</option>
                    <option>Non conforme</option>
                  </select>
                </div>
              </label>
            </div>
          </div>

          {chartData.length > 0 && (
            <div className="mb-8 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
              <div className="mb-6 flex items-center justify-between">
                <h3 className="text-[11px] font-bold uppercase tracking-[0.1em] text-gray-400">
                  ARRÊTS PAR DATE — CONFORME VS NON CONFORME
                </h3>
              </div>
              <div className="h-[190px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={chartData}
                    margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="#f3f4f6"
                    />
                    <XAxis
                      dataKey="date"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 10, fontWeight: 600, fill: "#9ca3af" }}
                      dy={10}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 10, fill: "#9ca3af" }}
                      allowDecimals={false}
                      domain={[0, (dataMax) => Math.max(5, dataMax + 5)]}
                    />
                    <Tooltip
                      cursor={{ fill: "#f9fafb" }}
                      formatter={(value, name) => [value, name]}
                      contentStyle={{
                        borderRadius: "12px",
                        border: "none",
                        boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1)",
                        fontSize: "12px",
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="conforme"
                      name="Conforme"
                      stroke="#22c55e"
                      strokeWidth={2}
                      dot={{
                        r: 4,
                        fill: "#22c55e",
                        strokeWidth: 2,
                        stroke: "#fff",
                      }}
                      activeDot={{ r: 6 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="non_conforme"
                      name="Non conforme"
                      stroke="#ef4444"
                      strokeWidth={2}
                      dot={{
                        r: 4,
                        fill: "#ef4444",
                        strokeWidth: 2,
                        stroke: "#fff",
                      }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-4 flex justify-center gap-6">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-[#22c55e]"></div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                    Conforme
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-[#ef4444]"></div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                    Non conforme
                  </span>
                </div>
              </div>
            </div>
          )}

          <div className="min-h-[500px] overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/50">
                    <th className="px-6 py-2.5 text-[11px] font-bold uppercase tracking-wider text-gray-500">
                      Camion
                    </th>
                    <th className="px-6 py-2.5 text-[11px] font-bold uppercase tracking-wider text-gray-500">
                      Date & Heure
                    </th>
                    <th className="px-6 py-2.5 text-[11px] font-bold uppercase tracking-wider text-gray-500">
                      Durée
                    </th>
                    <th className="px-6 py-2.5 text-[11px] font-bold uppercase tracking-wider text-gray-500">
                      Dest. Programmée
                    </th>
                    <th className="px-6 py-2.5 text-[11px] font-bold uppercase tracking-wider text-gray-500">
                      POI proche
                    </th>
                    <th className="px-6 py-2.5 text-[11px] font-bold uppercase tracking-wider text-gray-500">
                      N° Voyage
                    </th>
                    <th className="px-6 py-2.5 text-[11px] font-bold uppercase tracking-wider text-gray-500">
                      Chauffeur
                    </th>
                    <th className="px-6 py-2.5 text-[11px] font-bold uppercase tracking-wider text-gray-500">
                      Téléphone
                    </th>
                    <th className="px-6 py-2.5 text-[11px] font-bold uppercase tracking-wider text-gray-500">
                      Vérification (POI)
                    </th>
                    <th className="px-6 py-2.5 text-[11px] font-bold uppercase tracking-wider text-gray-500">
                      Appel
                    </th>
                    <th className="px-6 py-2.5 text-[11px] font-bold uppercase tracking-wider text-gray-500">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredData.map((arret) => {
                    const isPointNoir = Boolean(arret.isPointNoir);
                    return (
                    <tr
                      key={arret.id}
                      onClick={() => handleSelectArret(arret)}
                      className={`group cursor-pointer transition-all ${
                        selectedArretId === arret.id
                          ? "ring-2 ring-inset ring-orange-200"
                          : ""
                      }`}
                      style={{
                        backgroundColor: isPointNoir
                          ? "#fefce8"
                          : arret.status === "conforme" ? "#f0fdf4" : "#fef2f2",
                      }}
                    >
                      <td className="whitespace-nowrap px-6 py-2">
                        <div className="flex flex-col">
                          <span className="text-sm font-semibold text-gray-900">
                            {arret.camion}
                          </span>
                          <span className="text-[10px] font-bold uppercase tracking-tight text-gray-400">
                            {arret.systemgps}
                          </span>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-6 py-2 font-medium text-gray-600">
                        {arret.date}
                      </td>
                      <td className="whitespace-nowrap px-6 py-2">
                        <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-bold text-gray-700">
                          {arret.duree}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-6 py-2">
                        <div className="flex flex-col">
                          <span className="max-w-[150px] truncate text-[12px] font-semibold tracking-tight text-gray-600">
                            {arret.destination_programmee || "-"}
                          </span>
                          {arret.nextDestination && (
                            <span className="mt-1 text-[10px] font-semibold text-blue-600">
                              Prochaine: {arret.nextDestination}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-2">
                        <span className="max-w-[200px] truncate text-[12px] font-semibold tracking-tight text-gray-900">
                          {arret.poiPlanning === "-"
                            ? "Site Inconnu"
                            : arret.poiPlanning}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-6 py-2 font-medium text-gray-600">
                        {arret.voycle}
                      </td>
                      <td className="whitespace-nowrap px-6 py-2 font-medium text-gray-600">
                        {arret.chauffeur_nom}
                      </td>
                      <td className="whitespace-nowrap px-6 py-2 font-medium text-gray-600">
                        {arret.chauffeur_tel}
                      </td>
                      <td className="px-6 py-2">
                        <div className="flex flex-col gap-1.5">
                          <div className="flex items-center gap-2">
                            <div
                              className={`h-2 w-2 rounded-full ${
                                isPointNoir
                                  ? "bg-slate-900"
                                  : arret.status === "conforme"
                                    ? "bg-green-500"
                                    : "bg-red-500"
                              }`}
                            ></div>
                            <span
                              className={`text-[10px] font-semibold uppercase tracking-tighter ${
                                isPointNoir
                                  ? "text-slate-900"
                                  : arret.status === "conforme"
                                    ? "text-green-700"
                                    : "text-red-700"
                              }`}
                            >
                              {isPointNoir
                                ? "Point noir"
                                : arret.status === "conforme"
                                  ? "Conforme"
                                  : "Écart détecté"}
                            </span>
                          </div>
                          {arret.distance_poi_proche !== null ? (
                            <div className="flex w-fit items-center gap-1.5 rounded-lg border border-gray-100 bg-gray-50 px-2 py-0.5">
                              <span className="text-[9px] font-medium uppercase tracking-widest text-gray-400">
                                Dist. POI proche
                              </span>
                              <span className="text-[11px] font-semibold text-gray-900">
                                {arret.distance_poi_proche}m
                              </span>
                            </div>
                          ) : (
                            <span className="text-[10px] font-bold text-gray-300">
                              Dist. POI proche indisponible
                            </span>
                          )}
                          {isPointNoir && arret.pointNoirPoi && (
                            <span className="text-[11px] font-semibold text-slate-700">
                              Point noir: {arret.pointNoirPoi}
                            </span>
                          )}
                          {Array.isArray(arret.validatedPois) &&
                          arret.validatedPois.length > 0 ? (
                            <div className="flex flex-col gap-1">
                              <span
                                className={`text-[10px] font-bold uppercase tracking-widest ${
                                  arret.status === "conforme"
                                    ? "text-green-700"
                                    : "text-amber-700"
                                }`}
                              >
                                {arret.status === "conforme"
                                  ? "Visite POI validée"
                                  : "POI lié (non conforme)"}
                              </span>
                              {arret.validatedPois.map((poi, idx) => (
                                <span
                                  key={`${arret.id}-poi-${idx}`}
                                  className={`text-[11px] font-semibold ${
                                    arret.status === "conforme"
                                      ? "text-green-700"
                                      : "text-amber-700"
                                  }`}
                                >
                                  {arret.status === "conforme" ? "✓" : "-"} {poi.label || poi.code}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-[10px] font-bold text-gray-300">
                              {arret.status === "conforme"
                                ? "Aucune visite POI validée"
                                : "Aucun POI lié"}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-6 py-2">
                        {(() => {
                          const appel = findAppelForArret(arret);
                          if (appel && appel.session_id) {
                            return (
                              <Link
                                href={`/appels/${appel.session_id}`}
                                onClick={(e) => e.stopPropagation()}
                                className="inline-flex items-center gap-1.5 rounded-full border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-bold text-green-700 transition-all hover:bg-green-100"
                              >
                                <FiPhone /> Appel lancé
                              </Link>
                            );
                          }
                          return (
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-bold text-gray-400">
                              <FiPhoneOff /> Pas d'appel
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-6 py-2">
                        <div className="flex items-center gap-2 transition-opacity">
                          {arret.status === "non_conforme" && !isPointNoir && (
                            <button
                              onClick={(e) => handleOpenPoiModal(e, arret)}
                              className="rounded-lg border border-gray-200 bg-white p-2 text-gray-600 shadow-sm transition-all hover:border-orange-200 hover:text-orange-600"
                              title="Ajouter ce lieu comme POI"
                            >
                              <FiPlus />
                            </button>
                          )}
                          <button
                            className="rounded-lg border border-gray-200 bg-white p-2 text-gray-600 shadow-sm transition-all hover:border-blue-200 hover:text-blue-600"
                            title="Détails de l'arrêt"
                          >
                            <FiMap />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                  })}
                </tbody>
              </table>
            </div>
            {filteredData.length === 0 && !loading && (
              <div className="flex flex-col items-center justify-center bg-gray-50/30 py-20 text-center">
                <div className="mb-4 flex h-[80px] w-[80px] items-center justify-center rounded-2xl bg-[#F9731614]">
                  <EmptyStopIcon />
                </div>
                <p className="mb-2 text-2xl font-black tracking-tight text-gray-900">
                  Aucun arrêt trouvé
                </p>
                <p className="max-w-lg px-6 text-base font-medium leading-relaxed text-gray-500">
                  Aucune donnée ne correspond à la date sélectionnée.
                  <br />
                  Modifiez les filtres ou choisissez une autre date.
                </p>
              </div>
            )}
            {loading && (
              <div className="flex justify-center py-20">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-orange-500 border-t-transparent"></div>
              </div>
            )}
            {hasMore && !loading && (
              <div className="flex justify-center bg-gray-50/30 py-6">
                <button
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="rounded-xl bg-orange-500 px-6 py-2.5 font-semibold text-white shadow-sm transition-colors hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-orange-300"
                >
                  {loadingMore
                    ? "Chargement..."
                    : `Charger plus (${arrets.length} affichés)`}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <PoiModal
        isOpen={showPoiModal}
        onClose={() => setShowPoiModal(false)}
        initialData={poiModalData}
        groups={groups}
        onSubmit={handleSavePoi}
      />

      <MapModal
        isOpen={isMapOpen}
        onClose={() => setIsMapOpen(false)}
        positions={mapPositions}
        title={
          mapPositions.length === 1
            ? `Position : ${mapPositions[0].label}`
            : "Aperçu des arrêts filtrés"
        }
      />
    </>
  );
};

export default Arrets;
