"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  FiTarget,
  FiCheckCircle,
  FiXCircle,
  FiMapPin,
  FiFilter,
  FiMap,
  FiPhone,
  FiPhoneOff,
} from "react-icons/fi";
import { ouverturesAPI } from "@/services/api";
import MapModal from "@/components/map/MapModal";
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

const formatDureeMinutes = (minutes) => {
  if (minutes === null || minutes === undefined) return "En cours";
  const totalMinutes = Number(minutes);
  if (Number.isNaN(totalMinutes)) return "En cours";
  const heures = Math.floor(totalMinutes / 60);
  const mins = Math.round(totalMinutes % 60);
  if (heures > 0) return `${heures}h ${mins} min`;
  return `${Math.round(totalMinutes)} min`;
};

const normalizeCoordinate = (value) => {
  if (value === null || value === undefined) return null;
  const raw =
    typeof value === "string" ? value.trim().replace(",", ".") : value;
  const numberValue = Number(raw);
  return Number.isFinite(numberValue) ? numberValue : null;
};

const normalizeCamion = (value) => (value || "").toString().trim();
const normalizeCamionKey = (value) =>
  (value || "").toString().replace(/\s+/g, "").toUpperCase();

const parseToMs = (value) => {
  if (!value) return null;
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  const raw = String(value).trim();
  if (!raw) return null;
  const normalized = raw.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00");
  const ms = Date.parse(normalized);
  return Number.isFinite(ms) ? ms : null;
};

const normalizeSourceId = (value) => {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw || !raw.includes("|")) return null;
  const [camion, tsRaw] = raw.split("|", 2);
  if (!camion || !tsRaw) return null;
  const camionKey = normalizeCamionKey(camion);
  const ts = tsRaw
    .replace("T", " ")
    .split(".")[0]
    .replace(/Z$/, "")
    .replace(/([+-]\d{2}:?\d{2})$/, "")
    .trim();
  return `${camionKey}|${ts}`;
};

const formatLocalDateTime = (value) => {
  const dt = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(dt.getTime())) return null;
  const pad2 = (v) => String(v).padStart(2, "0");
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())} ${pad2(dt.getHours())}:${pad2(dt.getMinutes())}:${pad2(dt.getSeconds())}`;
};

const formatSourceId = (camion, value) => {
  if (!camion || !value) return null;
  if (typeof value === "string") {
    const raw = value.trim();
    if (!raw) return null;
    const looksIso =
      raw.includes("T") || /Z$/.test(raw) || /[+-]\d{2}:?\d{2}$/.test(raw);
    if (looksIso) {
      const localTs = formatLocalDateTime(raw);
      if (localTs) return `${camion}|${localTs}`;
    }
    const ts = raw
      .replace("T", " ")
      .split(".")[0]
      .replace(/Z$/, "")
      .replace(/([+-]\d{2}:?\d{2})$/, "")
      .trim();
    return `${camion}|${ts}`;
  }
  const localTs = formatLocalDateTime(value);
  if (localTs) return `${camion}|${localTs}`;
  return null;
};

const buildSourceKey = (table, sourceId) => {
  const normalized = normalizeSourceId(sourceId);
  if (!table || !normalized) return null;
  return `${table}|${normalized}`;
};

const getToday = () => new Date().toISOString().split("T")[0];

const getInitialFilters = (today) => ({
  dateFilterMode: "day",
  filterDate: today,
  filterStartDate: "",
  filterEndDate: "",
  filterWeek: "",
  filterMonth: "",
  filterMatricule: "",
  statusFilter: "all",
});

const EmptyDoorIcon = () => (
  <svg
    width="44"
    height="44"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M7.5 3.5L13.5 2.5C14.2 2.4 14.8 2.9 14.8 3.6V20.3C14.8 20.9 14.2 21.4 13.5 21.3L7.5 20.3V3.5Z"
      stroke="#F97316"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M14.8 4.5H17.5C18.3 4.5 19 5.2 19 6V18C19 18.8 18.3 19.5 17.5 19.5H14.8"
      stroke="#F97316"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle cx="11.2" cy="11.8" r="0.8" fill="#F97316" />
    <path
      d="M5 20.5H19.5"
      stroke="#F97316"
      strokeWidth="1.8"
      strokeLinecap="round"
    />
  </svg>
);

const StatCard = ({ title, value, icon: Icon, iconWrap, valueColor }) => (
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

const OuverturePorte = () => {
  const today = useMemo(() => getToday(), []);
  const initialFilters = useMemo(() => getInitialFilters(today), [today]);

  const [ouverturesData, setOuverturesData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draftFilters, setDraftFilters] = useState(initialFilters);
  const [appliedFilters, setAppliedFilters] = useState(initialFilters);
  const [selectedOuvertureId, setSelectedOuvertureId] = useState(null);
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [mapPositions, setMapPositions] = useState([]);
  const [appelsData, setAppelsData] = useState([]);

  const updateDraftFilter = (key, value) => {
    setDraftFilters((prev) => ({ ...prev, [key]: value }));
  };

  const getDateRangeParams = useCallback(
    (filters) => {
      const {
        dateFilterMode,
        filterDate,
        filterStartDate,
        filterEndDate,
        filterWeek,
        filterMonth,
      } = filters;

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
    },
    [today],
  );

  useEffect(() => {
    const fetchOuvertures = async () => {
      try {
        setLoading(true);
        const { dateStart, dateEnd } = getDateRangeParams(appliedFilters);
        const response = await ouverturesAPI.getOuvertures({
          dateStart,
          dateEnd,
        });
        const ouvertures = response.data || [];

        const formattedData = ouvertures.map((item, index) => {
          const dateOuvSource = item.dateOuverture ?? item.date_ouverture;
          const dateFermSource = item.dateFermeture ?? item.date_fermeture;
          const dateOuv = dateOuvSource ? new Date(dateOuvSource) : null;
          const dateFerm = dateFermSource ? new Date(dateFermSource) : null;
          const poiNom = item.poiProche ?? item.poi_nom ?? "-";
          const poiAdresse = item.adressePoiProche ?? item.poi_adresse ?? "-";
          const distancePoiMetres =
            item.distancePoiMetres ?? item.distance_m ?? null;
          const dureeMinutes = item.dureeMinutes ?? item.duree_minutes ?? null;
          const lat = normalizeCoordinate(item.lat ?? item.latitude);
          const lng = normalizeCoordinate(item.lng ?? item.longitude);
          const voyagePlanifie = Boolean(
            item.voyagePlanifie ?? item.voyage_planifie,
          );
          const isPointNoir = Boolean(item.isPointNoir);
          const pointNoirPoi = item.pointNoirPoi ?? null;
          const pointNoirDistanceMetres =
            item.distancePointNoirMetres ??
            item.point_noir_distance_m ??
            item.pointNoirDistanceMetres ??
            null;
          const statut =
            item.statut ??
            (voyagePlanifie &&
            distancePoiMetres !== null &&
            distancePoiMetres < 10 &&
            dureeMinutes !== null &&
            dureeMinutes < 35
              ? "conforme"
              : "non_conforme");

          return {
            id: index + 1,
            camion: item.camion || "-",
            localisation: item.localisation || item.poiStop || "-",
            poiProche: poiNom,
            poiAdresse,
            distancePoiMetres,
            voyagePlanifie,
            lat,
            lng,
            ouverture: "Oui",
            isPointNoir,
            pointNoirPoi,
            pointNoirDistanceMetres,
            dateOuvRaw: dateOuvSource || null,
            dateFermRaw: dateFermSource || null,
            dateOuv: dateOuv
              ? dateOuv.toLocaleTimeString("fr-FR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "-",
            dateOuvJour: dateOuv ? dateOuv.toISOString().split("T")[0] : "-",
            duree: formatDureeMinutes(dureeMinutes),
            dureeMinutes,
            dateFerm: dateFerm
              ? dateFerm.toLocaleTimeString("fr-FR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "En cours",
            dateFermJour: dateFerm ? dateFerm.toISOString().split("T")[0] : "",
            statut,
          };
        });

        setOuverturesData(formattedData);
      } catch (error) {
        console.error("Error fetching ouvertures:", error);
        setOuverturesData([]);
      } finally {
        setLoading(false);
      }
    };

    fetchOuvertures();

    const fetchAppels = async () => {
      try {
        const { dateStart } = getDateRangeParams(appliedFilters);
        const result = await getAppelsParSource(dateStart);
        setAppelsData(result.appels || []);
      } catch (error) {
        console.error("Error fetching appels:", error);
        setAppelsData([]);
      }
    };

    fetchAppels();
  }, [appliedFilters, getDateRangeParams]);

  // Helper: find matching call for a door opening
  const findAppelForPorte = (row) => {
    const camion = normalizeCamion(row.camion);
    const camionKey = normalizeCamionKey(camion);
    const doorMs = parseToMs(
      row.dateOuvRaw ||
        row.dateOuverture ||
        row.date_ouverture ||
        row.dateOuvJour,
    );
    const doorSourceId = formatSourceId(
      camion,
      row.dateOuvRaw ||
        row.dateOuverture ||
        row.date_ouverture ||
        row.dateOuvJour,
    );
    const doorKey = buildSourceKey("voyagetracking_port_ouvert", doorSourceId);

    if (!doorKey) return null;

    const matchSecondary = appelsData.find(
      (a) =>
        a?.session_id &&
        normalizeCamionKey(a.camion_id) === camionKey &&
        buildSourceKey(a.source_table_2, a.source_id_2) === doorKey,
    );
    if (matchSecondary) return matchSecondary;

    const matchPrimary = appelsData.find(
      (a) =>
        a?.session_id &&
        normalizeCamionKey(a.camion_id) === camionKey &&
        buildSourceKey(a.source_table, a.source_id) === doorKey,
    );
    if (matchPrimary) return matchPrimary;

    const MAX_DIFF_MS = 30 * 60 * 1000;
    if (doorMs != null) {
      const fallbackMatch = appelsData.find((a) => {
        if (!a?.session_id) return false;
        if (normalizeCamionKey(a.camion_id) !== camionKey) return false;
        const typeNc = String(a.type_nc || "").toLowerCase();
        if (!typeNc.includes("arret_et_porte_ouverte")) return false;
        const table2 = String(a.source_table_2 || "")
          .toLowerCase()
          .trim();
        if (table2 !== "voyagetracking_port_ouvert") return false;
        if (a.source_id_2) return false;

        const appelMs = parseToMs(a.ts_detection || a.date_appel);
        if (appelMs == null) return false;
        return Math.abs(appelMs - doorMs) <= MAX_DIFF_MS;
      });
      if (fallbackMatch) return fallbackMatch;
    }

    return null;
  };

  const filteredData = useMemo(() => {
    const getWeekNumber = (dateValue) => {
      const date = new Date(
        Date.UTC(
          dateValue.getFullYear(),
          dateValue.getMonth(),
          dateValue.getDate(),
        ),
      );
      date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
      const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
      return Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
    };

    return ouverturesData.filter((o) => {
      const {
        statusFilter,
        dateFilterMode,
        filterDate,
        filterStartDate,
        filterEndDate,
        filterWeek,
        filterMonth,
        filterMatricule,
      } = appliedFilters;

      const matchStatus =
        statusFilter === "all" ? true : o.statut === statusFilter;
      const dateSource =
        o.dateOuvJour && o.dateOuvJour !== "-" ? o.dateOuvJour : null;
      const matchDate = (() => {
        if (!dateSource) return true;
        if (dateFilterMode === "day" && filterDate)
          return dateSource === filterDate;
        if (dateFilterMode === "range") {
          if (filterStartDate && filterEndDate)
            return dateSource >= filterStartDate && dateSource <= filterEndDate;
          if (filterStartDate) return dateSource >= filterStartDate;
          if (filterEndDate) return dateSource <= filterEndDate;
        }
        if (dateFilterMode === "week" && filterWeek) {
          const [year, week] = filterWeek.split("-W").map(Number);
          const d = new Date(dateSource);
          return d.getFullYear() === year && getWeekNumber(d) === week;
        }
        if (dateFilterMode === "month" && filterMonth)
          return dateSource.startsWith(filterMonth);
        return true;
      })();

      const normalizedFilter = filterMatricule.replace(/\s/g, "").toLowerCase();
      const normalizedCamion = String(o.camion || "")
        .replace(/\s/g, "")
        .toLowerCase();
      const matchMatricule = filterMatricule
        ? normalizedCamion.includes(normalizedFilter)
        : true;

      return matchStatus && matchDate && matchMatricule;
    });
  }, [ouverturesData, appliedFilters]);

  const stats = useMemo(
    () => ({
      total: filteredData.length,
      conformes: filteredData.filter((o) => o.statut === "conforme").length,
      nonConformes: filteredData.filter((o) => o.statut === "non_conforme")
        .length,
    }),
    [filteredData],
  );

  const chartData = useMemo(() => {
    const dataByDate = {};
    filteredData.forEach((item) => {
      if (!item.dateOuvJour || item.dateOuvJour === "-") return;
      const date = item.dateOuvJour.substring(5);
      if (!dataByDate[date])
        dataByDate[date] = { date, conforme: 0, non_conforme: 0 };
      if (item.statut === "conforme") dataByDate[date].conforme += 1;
      else dataByDate[date].non_conforme += 1;
    });
    return Object.values(dataByDate).sort((a, b) =>
      a.date.localeCompare(b.date),
    );
  }, [filteredData]);

  const handleOpenFullMap = () => {
    const positions = filteredData
      .filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lng))
      .map((item) => {
        const latStr = item.lat.toFixed(6);
        const lngStr = item.lng.toFixed(6);
        return {
          id: item.id,
          lat: item.lat,
          lng: item.lng,
          label: item.camion,
          status: item.statut,
          color: item.isPointNoir ? "#0f172a" : undefined,
          info: (
            <>
              📍 {item.localisation} · ⏳ {item.duree}
              <br />
              Lat: {latStr}, Lng: {lngStr}
              {item.isPointNoir && item.pointNoirPoi && (
                <>
                  <br />
                  Point noir: {item.pointNoirPoi}
                </>
              )}
            </>
          ),
        };
      });
    if (positions.length === 0) return;
    setMapPositions(positions);
    setIsMapOpen(true);
  };

  const handleSelectOuverture = (ouverture) => {
    setSelectedOuvertureId(ouverture.id);
    if (!Number.isFinite(ouverture.lat) || !Number.isFinite(ouverture.lng)) {
      alert("Ce point n'a pas de coordonnees valides.");
      return;
    }
    const latStr = ouverture.lat.toFixed(6);
    const lngStr = ouverture.lng.toFixed(6);
    setMapPositions([
      {
        id: ouverture.id,
        lat: ouverture.lat,
        lng: ouverture.lng,
        label: ouverture.camion,
        status: ouverture.statut,
        color: ouverture.isPointNoir ? "#0f172a" : undefined,
        info: (
          <>
            📍 {ouverture.localisation} · ⏳ {ouverture.duree}
            <br />
            Lat: {latStr}, Lng: {lngStr}
            {ouverture.isPointNoir && ouverture.pointNoirPoi && (
              <>
                <br />
                Point noir: {ouverture.pointNoirPoi}
              </>
            )}
          </>
        ),
      },
    ]);
    setIsMapOpen(true);
  };

  const applyFilters = () => {
    setAppliedFilters(draftFilters);
  };

  const resetFilters = () => {
    setDraftFilters(initialFilters);
    setAppliedFilters(initialFilters);
  };

  const cardData = [
    {
      title: "TOTAL",
      value: String(stats.total),
      icon: FiTarget,
      iconWrap: "bg-slate-100 text-slate-500",
      valueColor: "text-slate-900",
    },
    {
      title: "CONFORMES",
      value: String(stats.conformes),
      icon: FiCheckCircle,
      iconWrap: "bg-orange-50 text-orange-500",
      valueColor: "text-orange-600",
    },
    {
      title: "NON CONFORMES",
      value: String(stats.nonConformes),
      icon: FiXCircle,
      iconWrap: "bg-red-50 text-red-500",
      valueColor: "text-red-500",
    },
  ];

  return (
    <>
      <section className="min-h-full bg-[#f3f4f6] p-6 text-sm text-gray-700">
        <div className="mx-auto max-w-[1500px] space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {cardData.map((card) => (
              <StatCard key={card.title} {...card} />
            ))}
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
                  className="rounded-xl bg-orange-500 px-4 py-2 text-xs font-bold text-white hover:bg-orange-600"
                >
                  Appliquer
                </button>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <label className="space-y-1.5 xl:col-span-1">
                <span className="text-xs font-semibold text-gray-500">
                  Mode de date
                </span>
                <div className="inline-flex w-fit bg-gray-100 p-1 rounded-xl">
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
                      className={`px-2.5 py-2 rounded-lg text-xs font-bold transition-all ${draftFilters.dateFilterMode === mode.id ? "bg-white text-orange-600 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
              </label>

              <label
                className={`space-y-1.5 ${draftFilters.dateFilterMode === "range" ? "xl:col-span-2" : "xl:col-span-1"}`}
              >
                <span className="text-xs font-semibold text-gray-500">
                  Date
                </span>
                <div
                  className={`flex items-center gap-2 ${draftFilters.dateFilterMode === "range" ? "w-full" : "xl:w-[220px]"}`}
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
                <span className="text-xs font-semibold text-gray-500">
                  Matricule
                </span>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
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
                <span className="text-xs font-semibold text-gray-500">
                  Statut
                </span>
                <div className="relative">
                  <select
                    value={draftFilters.statusFilter}
                    onChange={(e) =>
                      updateDraftFilter("statusFilter", e.target.value)
                    }
                    className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 outline-none ring-orange-400 transition focus:ring-2 appearance-none"
                  >
                    <option value="all">Tous</option>
                    <option value="conforme">Conforme</option>
                    <option value="non_conforme">Non conforme</option>
                  </select>
                  <FiFilter className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
              </label>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr>
                    <th
                      className="px-6 py-3"
                      style={{
                        textAlign: "left",
                        fontWeight: 600,
                        color: "#64748b",
                        padding: "14px 18px",
                        borderBottom: "1px solid #e5e7eb",
                        background: "#f9fafb",
                      }}
                    >
                      Camion
                    </th>
                    <th
                      className="px-6 py-3"
                      style={{
                        textAlign: "left",
                        fontWeight: 600,
                        color: "#64748b",
                        padding: "14px 18px",
                        borderBottom: "1px solid #e5e7eb",
                        background: "#f9fafb",
                      }}
                    >
                      Voyage planifié
                    </th>
                    <th
                      className="px-6 py-3"
                      style={{
                        textAlign: "left",
                        fontWeight: 600,
                        color: "#64748b",
                        padding: "14px 18px",
                        borderBottom: "1px solid #e5e7eb",
                        background: "#f9fafb",
                      }}
                    >
                      Localisation
                    </th>
                    <th
                      className="px-6 py-3"
                      style={{
                        textAlign: "left",
                        fontWeight: 600,
                        color: "#64748b",
                        padding: "14px 18px",
                        borderBottom: "1px solid #e5e7eb",
                        background: "#f9fafb",
                      }}
                    >
                      POI proche
                    </th>
                    <th
                      className="px-6 py-3"
                      style={{
                        textAlign: "left",
                        fontWeight: 600,
                        color: "#64748b",
                        padding: "14px 18px",
                        borderBottom: "1px solid #e5e7eb",
                        background: "#f9fafb",
                      }}
                    >
                      Adresse POI
                    </th>
                    <th
                      className="px-6 py-3"
                      style={{
                        textAlign: "left",
                        fontWeight: 600,
                        color: "#64748b",
                        padding: "14px 18px",
                        borderBottom: "1px solid #e5e7eb",
                        background: "#f9fafb",
                      }}
                    >
                      Distance
                    </th>
                    <th
                      className="px-6 py-3"
                      style={{
                        textAlign: "left",
                        fontWeight: 600,
                        color: "#64748b",
                        padding: "14px 18px",
                        borderBottom: "1px solid #e5e7eb",
                        background: "#f9fafb",
                      }}
                    >
                      Ouverture
                    </th>
                    <th
                      className="px-6 py-3"
                      style={{
                        textAlign: "left",
                        fontWeight: 600,
                        color: "#64748b",
                        padding: "14px 18px",
                        borderBottom: "1px solid #e5e7eb",
                        background: "#f9fafb",
                      }}
                    >
                      Date ouv.
                    </th>
                    <th
                      className="px-6 py-3"
                      style={{
                        textAlign: "left",
                        fontWeight: 600,
                        color: "#64748b",
                        padding: "14px 18px",
                        borderBottom: "1px solid #e5e7eb",
                        background: "#f9fafb",
                      }}
                    >
                      Durée
                    </th>
                    <th
                      className="px-6 py-3"
                      style={{
                        textAlign: "left",
                        fontWeight: 600,
                        color: "#64748b",
                        padding: "14px 18px",
                        borderBottom: "1px solid #e5e7eb",
                        background: "#f9fafb",
                      }}
                    >
                      Date ferm.
                    </th>
                    <th
                      className="px-6 py-3"
                      style={{
                        textAlign: "left",
                        fontWeight: 600,
                        color: "#64748b",
                        padding: "14px 18px",
                        borderBottom: "1px solid #e5e7eb",
                        background: "#f9fafb",
                      }}
                    >
                      Statut
                    </th>
                    <th
                      className="px-6 py-3"
                      style={{
                        textAlign: "left",
                        fontWeight: 600,
                        color: "#64748b",
                        padding: "14px 18px",
                        borderBottom: "1px solid #e5e7eb",
                        background: "#f9fafb",
                      }}
                    >
                      Appel
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredData.map((row) => (
                    <tr
                      key={row.id}
                      onClick={() => handleSelectOuverture(row)}
                      className={`group cursor-pointer transition-colors ${selectedOuvertureId === row.id ? "bg-orange-50/60" : "hover:bg-gray-50/70"}`}
                      style={{
                        backgroundColor: row.isPointNoir
                          ? "#fefce8"
                          : row.statut === "conforme"
                            ? "#f8fff8"
                            : "#fff7f7",
                      }}
                    >
                      <td className="whitespace-nowrap px-6 py-4 align-middle">
                        <span className="text-sm font-semibold text-gray-900">
                          {row.camion}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 align-middle">
                        {row.voyagePlanifie ? (
                          <span className="px-3 py-1 rounded-full text-xs font-bold bg-green-50 text-green-700 border border-green-200">
                            Oui
                          </span>
                        ) : (
                          <span className="px-3 py-1 rounded-full text-xs font-bold bg-red-50 text-red-700 border border-red-200">
                            Non
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 align-middle">
                        <span className="inline-flex items-center gap-1.5 font-medium text-gray-600">
                          <FiMapPin className="text-gray-400" />
                          {row.localisation}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 align-middle font-medium text-gray-600">
                        {row.poiProche}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 align-middle font-medium text-gray-600">
                        {row.poiAdresse}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 align-middle">
                        <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-bold text-gray-700">
                          {row.distancePoiMetres !== null &&
                          row.distancePoiMetres !== undefined
                            ? `${Number(row.distancePoiMetres).toFixed(2)} m`
                            : "-"}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 align-middle">
                        <span className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-bold text-orange-700">
                          {row.ouverture}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 align-middle font-medium text-gray-600">
                        <div className="text-sm font-semibold text-gray-900">
                          {row.dateOuv}
                        </div>
                        <div className="text-[11px] text-gray-400">
                          {row.dateOuvJour}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 align-middle">
                        <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-bold text-gray-700">
                          {row.duree}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 align-middle font-medium text-gray-600">
                        <div className="text-sm font-semibold text-gray-900">
                          {row.dateFerm}
                        </div>
                        {row.dateFermJour && (
                          <div className="text-[11px] text-gray-400">
                            {row.dateFermJour}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 align-middle">
                        {row.isPointNoir ? (
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-2 rounded-full bg-slate-900"></div>
                            <span className="text-[10px] font-semibold uppercase tracking-tighter text-red-900 inline-flex items-center gap-1 rounded-full bg-red-50 border border-red-200 px-2 py-0.5">
                              Non conforme (Point noir)
                            </span>
                          </div>
                        ) : row.statut === "conforme" ? (
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-green-500"></div>
                            <span className="text-[10px] font-semibold uppercase tracking-tighter text-green-700 inline-flex items-center gap-1">
                              <FiCheckCircle /> Conforme
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-red-500"></div>
                            <span className="text-[10px] font-semibold uppercase tracking-tighter text-red-700 inline-flex items-center gap-1">
                              <FiXCircle /> Non conforme
                            </span>
                          </div>
                        )}
                        {row.isPointNoir && row.pointNoirPoi && (
                          <div className="mt-1 text-[10px] font-semibold text-slate-600">
                            Point noir: {row.pointNoirPoi}
                            {row.pointNoirDistanceMetres != null && (
                              <span className="text-slate-500">
                                {` (${Number(row.pointNoirDistanceMetres).toFixed(0)} m)`}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 align-middle">
                        {(() => {
                          const appel = findAppelForPorte(row);
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
                              <FiPhoneOff /> Pas d&apos;appel
                            </span>
                          );
                        })()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {filteredData.length === 0 && !loading && (
              <div className="flex flex-col items-center justify-center py-20 bg-gray-50/30 text-center">
                <div className="w-[80px] h-[80px] rounded-2xl bg-orange-50 flex items-center justify-center mb-4">
                  <EmptyDoorIcon />
                </div>
                <h3 className="text-2xl leading-none text-gray-900 font-black tracking-tight mb-2">
                  Aucun événement trouvé
                </h3>
                <p className="text-base leading-relaxed text-gray-500 font-medium max-w-lg px-6">
                  Aucune donnée ne correspond à la date sélectionnée.
                  <br />
                  Modifiez les filtres ou choisissez une autre date.
                </p>
              </div>
            )}

            {loading && (
              <div className="flex justify-center py-20">
                <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
              </div>
            )}
          </div>

          {filteredData.length > 0 && (
            <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm mb-8">
              <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-[0.1em] mb-6">
                OUVERTURES PAR DATE — CONFORME VS NON CONFORME
              </h3>
              <div className="h-[110px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={chartData}
                    margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="#f1f5f9"
                    />
                    <XAxis
                      dataKey="date"
                      tick={{ fill: "#94a3b8", fontSize: 11, fontWeight: 600 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fill: "#cbd5e1", fontSize: 10, fontWeight: 500 }}
                      axisLine={false}
                      tickLine={false}
                      width={32}
                    />
                    <Tooltip
                      cursor={{ fill: "rgba(241,245,249,0.35)" }}
                      contentStyle={{
                        borderRadius: "10px",
                        border: "1px solid #e2e8f0",
                        fontSize: 12,
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="conforme"
                      name="Conforme"
                      stroke="#46B519"
                      strokeWidth={2}
                      dot={{
                        r: 4,
                        fill: "#46B519",
                        strokeWidth: 2,
                        stroke: "#fff",
                      }}
                      activeDot={{ r: 6 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="non_conforme"
                      name="Non conforme"
                      stroke="#FF4B50"
                      strokeWidth={2}
                      dot={{
                        r: 4,
                        fill: "#FF4B50",
                        strokeWidth: 2,
                        stroke: "#fff",
                      }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-4 flex items-center justify-center gap-8 text-sm font-semibold text-gray-500">
                <span className="inline-flex items-center gap-2">
                  <span className="w-4 h-4 rounded-full bg-[#46B519]" />{" "}
                  CONFORME
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="w-4 h-4 rounded-full bg-[#FF4B50]" /> NON
                  CONFORME
                </span>
              </div>
            </div>
          )}
        </div>
      </section>

      <MapModal
        isOpen={isMapOpen}
        onClose={() => setIsMapOpen(false)}
        positions={mapPositions}
        title={
          mapPositions.length === 1
            ? `Position : ${mapPositions[0].label}`
            : "Aperçu des ouvertures filtrées"
        }
      />
    </>
  );
};

export default OuverturePorte;
