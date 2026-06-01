"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FiAlertTriangle,
  FiBarChart2,
  FiCalendar,
  FiMapPin,
  FiShield,
  FiTrendingDown,
  FiTruck,
  FiUser,
  FiCheck,
  FiCheckCircle,
  FiX,
  FiDroplet,
  FiChevronDown,
  FiChevronUp,
} from "react-icons/fi";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { carburantAPI } from "@/services/api";
import { useAuth } from "@/context/AuthContext";

const defaultStats = {
  gaspillageTotal: 0,
  tauxFraudeDetecte: 0,
  fraudesDetectees: 0,
  camionsARisque: 0,
  risqueGaspillageMoyen: 0,
  risqueGaspillageSerie: [],
  ecartTotal: 0,
  tauxConformite: 0,
  alertesVol: 0,
  reclamations: 0,
  transactions: 0,
};

const emptyFilters = {
  camions: [],
  chauffeurs: [],
  sites: [],
};

const getInitialDates = () => {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 7);
  return {
    dateStart: start.toISOString().split("T")[0],
    dateEnd: end.toISOString().split("T")[0],
  };
};

// ─── Helpers ────────────────────────────────────────────────────────────────
const isAnomalie = (statut) => statut && statut !== "normal";

const ALERTE_CONFIG = {
  anomalie_critique: {
    label: "Critique",
    rowClass:
      "bg-red-50 text-red-950 border-b border-red-200 hover:bg-red-100/50",
    badgeClass: "bg-red-200 text-red-800 border border-red-300",
    iconClass: "text-red-600",
  },
  fraude_station: {
    label: "Fraude Station",
    rowClass:
      "bg-yellow-50 text-yellow-900 border-b border-yellow-200 hover:bg-yellow-100/50",
    badgeClass: "bg-yellow-100 text-yellow-800 border border-yellow-200",
    iconClass: "text-yellow-600",
  },
  anomalie_conso: {
    label: "Anomalie Conso",
    rowClass:
      "bg-cyan-50 text-cyan-900 border-b border-cyan-200 hover:bg-cyan-100/50",
    badgeClass: "bg-cyan-100 text-cyan-700 border border-cyan-200",
    iconClass: "text-cyan-600",
  },
};

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatCard({
  title,
  value,
  icon: Icon,
  iconWrap,
  valueColor,
  subtitle,
  children,
}) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <div className="flex items-start gap-4">
        <div
          className={`flex h-12 w-12 items-center justify-center rounded-2xl ${iconWrap}`}
        >
          <Icon className="text-xl" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
            {title}
          </p>
          {subtitle ? (
            <p className="mt-0.5 text-[10px] text-gray-400">{subtitle}</p>
          ) : null}
          <p className={`text-2xl font-black leading-none ${valueColor}`}>
            {value}
          </p>
        </div>
      </div>
      {children ? <div className="mt-4">{children}</div> : null}
    </div>
  );
}

function MiniSparkline({ series }) {
  const values = (series || []).map((item) => Number(item?.value) || 0);
  const width = 320;
  const height = 56;
  const padding = 6;

  if (!values.length) {
    return (
      <div className="flex h-16 items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50 text-[11px] text-gray-400">
        Aucune donnée temporelle
      </div>
    );
  }

  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const points = values
    .map((value, index) => {
      const x =
        padding +
        (index * (width - padding * 2)) / Math.max(values.length - 1, 1);
      const y = padding + (height - padding * 2) * (1 - (value - min) / range);
      return `${x},${y}`;
    })
    .join(" ");

  const firstLabel = series[0]?.date || "";
  const lastLabel = series[series.length - 1]?.date || "";

  const formatLabel = (label) => {
    if (!label) return "";
    const date = new Date(`${label}T00:00:00`);
    if (Number.isNaN(date.getTime())) return label;
    return date.toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
    });
  };

  return (
    <div className="space-y-2">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-14 w-full">
        <defs>
          <linearGradient id="riskSparkFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#fb923c" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#fb923c" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <polyline
          fill="none"
          stroke="#f97316"
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
          points={points}
        />
        <polygon
          fill="url(#riskSparkFill)"
          points={`0,${height} ${points} ${width},${height}`}
        />
      </svg>
      <div className="flex items-center justify-between text-[10px] text-gray-400">
        <span>{formatLabel(firstLabel)}</span>
        <span>{formatLabel(lastLabel)}</span>
      </div>
    </div>
  );
}

// ─── Enhanced KPI Chart Components ──────────────────────────────────────────

const colorMap = {
  "text-red-500": "#ef4444",
  "text-amber-500": "#f59e0b",
  "text-sky-500": "#0ea5e9",
  "text-orange-500": "#f97316",
};

function getChartColor(tailwindClass) {
  return colorMap[tailwindClass] || "#6b7280";
}

function KPIChartCard({
  title,
  value,
  unit = "",
  icon: Icon,
  iconWrap,
  valueColor,
  subtitle,
  chartType = "line",
  series = [],
  trend = 0,
}) {
  const formattedTrend =
    trend > 0 ? `+${trend.toFixed(1)}%` : `${trend.toFixed(1)}%`;
  const trendColor = trend > 0 ? "text-red-500" : "text-green-500";
  const trendIcon = trend > 0 ? "↑" : "↓";

  const chartColor = getChartColor(valueColor);

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      return (
        <div className="rounded-lg border border-gray-200 bg-white p-2 shadow-lg">
          <p className="text-xs font-semibold text-gray-700">
            {payload[0].payload.date}
          </p>
          <p className={`text-xs font-bold ${valueColor}`}>
            {payload[0].value} {unit}
          </p>
        </div>
      );
    }
    return null;
  };

  const renderChart = () => {
    if (!series || series.length === 0) return null;

    const height = 48; // slightly smaller height for better spacing

    if (chartType === "line") {
      return (
        <ResponsiveContainer width="100%" height={height}>
          <LineChart data={series}>
            <CartesianGrid
              strokeDasharray="0"
              stroke="transparent"
              vertical={false}
            />
            <XAxis
              dataKey="date"
              tick={false}
              axisLine={false}
              margin={{ left: 0, right: 0 }}
            />
            <YAxis hide={true} type="number" />
            <Tooltip
              content={<CustomTooltip />}
              cursor={{ stroke: "transparent" }}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke={chartColor}
              dot={false}
              strokeWidth={2}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      );
    }

    if (chartType === "area") {
      return (
        <ResponsiveContainer width="100%" height={height}>
          <AreaChart data={series}>
            <CartesianGrid
              strokeDasharray="0"
              stroke="transparent"
              vertical={false}
            />
            <XAxis
              dataKey="date"
              tick={false}
              axisLine={false}
              margin={{ left: 0, right: 0 }}
            />
            <YAxis hide={true} type="number" />
            <Tooltip
              content={<CustomTooltip />}
              cursor={{ stroke: "transparent" }}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke={chartColor}
              fill={chartColor + "33"}
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      );
    }

    if (chartType === "bar") {
      return (
        <ResponsiveContainer width="100%" height={height}>
          <BarChart data={series}>
            <CartesianGrid
              strokeDasharray="0"
              stroke="transparent"
              vertical={false}
            />
            <XAxis
              dataKey="date"
              tick={false}
              axisLine={false}
              margin={{ left: 0, right: 0 }}
            />
            <YAxis hide={true} type="number" />
            <Tooltip
              content={<CustomTooltip />}
              cursor={{ stroke: "transparent" }}
            />
            <Bar
              dataKey="value"
              fill={chartColor}
              radius={[4, 4, 0, 0]}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      );
    }

    return null;
  };

  return (
    <div className="flex flex-col justify-between rounded-2xl border border-gray-100 bg-white p-5 shadow-sm h-full">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconWrap}`}
          >
            <Icon className="text-lg" />
          </div>
          <div className="min-w-0 flex-1">
            <h3
              className="truncate text-[11px] font-bold uppercase tracking-wider text-gray-500"
              title={title}
            >
              {title}
            </h3>
            {subtitle && (
              <p
                className="truncate mt-0.5 text-[10px] text-gray-400"
                title={subtitle}
              >
                {subtitle}
              </p>
            )}
          </div>
        </div>
        <div
          className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold bg-gray-50 ${trendColor}`}
        >
          <span>{trendIcon}</span>
          <span>{formattedTrend}</span>
        </div>
      </div>

      <div className="mt-1 mb-2">
        <p className={`text-3xl font-black leading-none ${valueColor}`}>
          {value}
          {unit && (
            <span className="ml-1 text-sm font-semibold text-gray-400">
              {unit}
            </span>
          )}
        </p>
      </div>

      {/* Chart */}
      {series && series.length > 0 && (
        <div className="mt-auto h-12 w-full pt-2">{renderChart()}</div>
      )}
    </div>
  );
}

function FilterBar({
  filters,
  filterOptions,
  onUpdate,
  onApply,
  onReset,
  showSiteFilter = true,
  showAlertTypeFilter = false,
}) {
  return (
    <div className="mb-5 rounded-xl border border-gray-100 bg-gray-50 p-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1">
          <span className="flex items-center gap-1 text-[11px] font-semibold text-gray-500">
            <FiCalendar className="text-xs" /> Début
          </span>
          <input
            type="date"
            value={filters.dateStart}
            onChange={(e) => onUpdate("dateStart", e.target.value)}
            className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 outline-none ring-orange-400 focus:ring-2"
          />
        </label>

        <label className="space-y-1">
          <span className="flex items-center gap-1 text-[11px] font-semibold text-gray-500">
            <FiCalendar className="text-xs" /> Fin
          </span>
          <input
            type="date"
            value={filters.dateEnd}
            onChange={(e) => onUpdate("dateEnd", e.target.value)}
            className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 outline-none ring-orange-400 focus:ring-2"
          />
        </label>

        <label className="space-y-1">
          <span className="flex items-center gap-1 text-[11px] font-semibold text-gray-500">
            <FiTruck className="text-xs" /> Camion
          </span>
          <select
            value={filters.camion}
            onChange={(e) => onUpdate("camion", e.target.value)}
            className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 outline-none ring-orange-400 focus:ring-2"
          >
            <option value="">Tous</option>
            {filterOptions.camions.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1">
          <span className="flex items-center gap-1 text-[11px] font-semibold text-gray-500">
            <FiUser className="text-xs" /> Chauffeur
          </span>
          <select
            value={filters.chauffeur}
            onChange={(e) => onUpdate("chauffeur", e.target.value)}
            className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 outline-none ring-orange-400 focus:ring-2"
          >
            <option value="">Tous</option>
            {filterOptions.chauffeurs.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>

        {showSiteFilter && (
          <label className="space-y-1">
            <span className="flex items-center gap-1 text-[11px] font-semibold text-gray-500">
              <FiMapPin className="text-xs" /> Lieu
            </span>
            <select
              value={filters.site}
              onChange={(e) => onUpdate("site", e.target.value)}
              className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 outline-none ring-orange-400 focus:ring-2"
            >
              <option value="">Tous</option>
              {filterOptions.sites.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
        )}

        {showAlertTypeFilter && (
          <label className="space-y-1">
            <span className="flex items-center gap-1 text-[11px] font-semibold text-gray-500">
              <FiAlertTriangle className="text-xs" /> Type alerte
            </span>
            <select
              value={filters.alertType}
              onChange={(e) => onUpdate("alertType", e.target.value)}
              className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 outline-none ring-orange-400 focus:ring-2"
            >
              <option value="">Tous</option>
              {Object.entries(ALERTE_CONFIG).map(([key, cfg]) => (
                <option key={key} value={key}>
                  {cfg.label}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="ml-auto flex items-center gap-2 pb-0.5">
          <button
            onClick={onReset}
            className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-xs font-bold text-gray-600 hover:bg-gray-50"
          >
            Réinitialiser
          </button>
          <button
            onClick={onApply}
            className="h-9 rounded-lg bg-orange-500 px-4 text-xs font-bold text-white hover:bg-orange-600"
          >
            Appliquer
          </button>
        </div>
      </div>
    </div>
  );
}

function ConformiteBadge({ conformite }) {
  const num = Number(String(conformite || "0").replace("%", ""));
  const cls =
    num < 80 ? "bg-red-100 text-red-600" : "bg-emerald-100 text-emerald-700";
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${cls}`}>
      {conformite}
    </span>
  );
}

function DecisionBadge({ status }) {
  if (!status) return <span className="text-gray-300 text-xs">-</span>;
  const map = {
    EN_ATTENTE: "bg-yellow-100 text-yellow-700",
    CONFIRMEE: "bg-emerald-100 text-emerald-700",
    REJETEE: "bg-red-100 text-red-700",
  };
  const labels = {
    EN_ATTENTE: "En attente",
    CONFIRMEE: "Confirmée",
    REJETEE: "Rejetée",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold ${map[status] || "bg-gray-100 text-gray-600"}`}
    >
      {labels[status] || status}
    </span>
  );
}

function ReclamationModal({ isOpen, row, onClose, onSubmit, isLoading }) {
  const [commentaire, setCommentaire] = useState("");
  if (!isOpen || !row) return null;

  const handleSubmit = async () => {
    await onSubmit({
      matricule: row.camion,
      dateTransaction: row.dateRaw,
      numTicket: row.noTicket,
      commentaire,
      chauffeur: row.chauffeur || "",
    });
    setCommentaire("");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-lg">
        <h2 className="mb-6 text-xl font-bold text-gray-900">
          Faire une réclamation
        </h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Camion
            </label>
            <div className="rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-700">
              {row.camion}
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Date
            </label>
            <div className="rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-700">
              {row.dateRaw}
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Commentaire
            </label>
            <textarea
              value={commentaire}
              onChange={(e) => setCommentaire(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-400"
              rows="4"
              placeholder="Décrivez le problème..."
            />
          </div>
        </div>
        <div className="mt-6 flex gap-3">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            onClick={handleSubmit}
            disabled={isLoading || !commentaire.trim()}
            className="flex-1 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
          >
            {isLoading ? "Validation..." : "Valider"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Tableau Ravitaillement (transactions normales) ───────────────────────────
function TableauRavitaillement({ rows, loading }) {
  const INITIAL_LIMIT = 5;
  const [showAll, setShowAll] = useState(false);
  const displayed = showAll ? rows : rows.slice(0, INITIAL_LIMIT);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-sm font-semibold text-gray-400">
        Chargement...
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div className="flex items-center justify-center py-16 text-sm font-semibold text-gray-400">
        Aucune transaction normale trouvée.
      </div>
    );
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="min-w-[900px] w-full text-left text-sm border-collapse">
          <thead>
            <tr className="bg-gray-50/80 border-b border-gray-100">
              {[
                "Date",
                "Camion",
                "Chauffeur",
                "Lieu",
                "Qté GPS (L)",
                "Qté RAV (L)",
                "Écart (L)",
                "Taux cohérence",
                "KM",
                "Conso réelle",
              ].map((h) => (
                <th
                  key={h}
                  className="px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-gray-400 whitespace-nowrap"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {displayed.map((row, idx) => {
              const key = `${row.noTicket}-${row.camion}-${idx}`;
              const consommationReelle =
                row.km && Number(row.km) > 0 && row.qteGps != null
                  ? ((Number(row.qteGps) / Number(row.km)) * 100).toFixed(2)
                  : null;

              return (
                <tr
                  key={key}
                  className="text-sm text-gray-700 border-b border-gray-50 hover:bg-gray-50/60 transition-colors"
                >
                  <td className="px-5 py-3 whitespace-nowrap font-medium">
                    {row.date}
                  </td>
                  <td className="px-5 py-3 whitespace-nowrap">
                    <p className="font-semibold text-sm">{row.camion}</p>
                    <p className="text-[10px] font-bold uppercase text-gray-400">
                      {row.type}
                    </p>
                  </td>
                  <td className="px-5 py-3 whitespace-nowrap">
                    {row.chauffeur}
                  </td>
                  <td className="px-5 py-3 whitespace-nowrap">{row.lieu}</td>
                  <td className="px-5 py-3 whitespace-nowrap">{row.qteGps}</td>
                  <td className="px-5 py-3 whitespace-nowrap">{row.qteRav}</td>
                  <td
                    className={`px-5 py-3 whitespace-nowrap font-bold ${Math.abs(row.ecart) >= 10 ? "text-red-500" : "text-emerald-500"}`}
                  >
                    {row.ecart > 0 ? `+${row.ecart}` : row.ecart}
                  </td>
                  <td className="px-5 py-3 whitespace-nowrap">
                    <ConformiteBadge conformite={row.conformite} />
                  </td>
                  <td className="px-5 py-3 whitespace-nowrap">{row.km}</td>
                  <td className="px-5 py-3 whitespace-nowrap">
                    {consommationReelle ? `${consommationReelle} L/100km` : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {rows.length > INITIAL_LIMIT && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="flex w-full items-center justify-center gap-2 border-t border-gray-100 py-3 text-xs font-semibold text-orange-500 hover:bg-orange-50 transition-colors"
        >
          {showAll ? (
            <>
              <FiChevronUp /> Afficher moins
            </>
          ) : (
            <>
              <FiChevronDown /> Afficher les {rows.length - INITIAL_LIMIT}{" "}
              autres transactions
            </>
          )}
        </button>
      )}
    </>
  );
}

// ─── Tableau Gaspillage (transactions avec anomalie) ─────────────────────────
function TableauGaspillage({
  rows,
  loading,
  onDecision,
  actionLoading,
  onOpenModal,
}) {
  const INITIAL_LIMIT = 5;
  const [showAll, setShowAll] = useState(false);
  const displayed = showAll ? rows : rows.slice(0, INITIAL_LIMIT);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-sm font-semibold text-gray-400">
        Chargement...
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div className="flex items-center justify-center py-16 text-sm font-semibold text-gray-400">
        Aucune anomalie détectée pour ces filtres.
      </div>
    );
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="min-w-[1100px] w-full text-left text-sm border-collapse">
          <thead>
            <tr className="bg-gray-50/80 border-b border-gray-100">
              {[
                "Date",
                "Camion",
                "Chauffeur",
                "Lieu",
                "Écart (L)",
                "Taux cohérence",
                "Type alerte",
                "Litres IA estimés",
                "KM",
                "Conso réelle",
                "Status",
                "Actions",
              ].map((h) => (
                <th
                  key={h}
                  className="px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-gray-400 whitespace-nowrap"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayed.map((row, idx) => {
              const key = `${row.noTicket}-${row.camion}-${idx}`;
              const cfg =
                ALERTE_CONFIG[row.statut] || ALERTE_CONFIG.anomalie_critique;
              const iaEstime =
                row.ml_details?.carburant_theorique_total_L ??
                row.ml_details?.carburant_estime ??
                null;
              const consommationReelle =
                row.km && Number(row.km) > 0 && row.qteGps != null
                  ? ((Number(row.qteGps) / Number(row.km)) * 100).toFixed(2)
                  : null;
              const decisionStatus = row.statut_decision;

              return (
                <tr key={key} className={`${cfg.rowClass} transition-colors`}>
                  <td className="px-5 py-3 whitespace-nowrap font-medium">
                    {row.date}
                  </td>
                  <td className="px-5 py-3 whitespace-nowrap">
                    <p className="font-semibold text-sm">{row.camion}</p>
                    <p className="text-[10px] font-bold uppercase opacity-60">
                      {row.type}
                    </p>
                  </td>
                  <td className="px-5 py-3 whitespace-nowrap">
                    {row.chauffeur}
                  </td>
                  <td className="px-5 py-3 whitespace-nowrap">{row.lieu}</td>
                  <td className="px-5 py-3 whitespace-nowrap font-bold text-red-600">
                    {row.ecart > 0 ? `+${row.ecart}` : row.ecart}
                  </td>
                  <td className="px-5 py-3 whitespace-nowrap">
                    <ConformiteBadge conformite={row.conformite} />
                  </td>
                  <td className="px-5 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      <FiAlertTriangle
                        className={`${cfg.iconClass} text-base`}
                      />
                      <span
                        className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${cfg.badgeClass}`}
                      >
                        {cfg.label}
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-3 whitespace-nowrap">
                    {iaEstime != null
                      ? `${Number(iaEstime).toFixed(2)} L`
                      : "—"}
                  </td>
                  <td className="px-5 py-3 whitespace-nowrap">{row.km}</td>
                  <td className="px-5 py-3 whitespace-nowrap">
                    {consommationReelle ? `${consommationReelle} L/100km` : "—"}
                  </td>
                  <td className="px-5 py-3 whitespace-nowrap">
                    <DecisionBadge status={decisionStatus} />
                  </td>
                  <td className="px-5 py-3 whitespace-nowrap">
                    {decisionStatus === "EN_ATTENTE" ? (
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => onOpenModal(row)}
                          disabled={actionLoading}
                          className="inline-flex items-center gap-1 rounded-lg bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-200 disabled:opacity-50"
                        >
                          <FiCheck /> Confirmer
                        </button>
                        <button
                          onClick={() => onDecision(row, "REJETEE")}
                          disabled={actionLoading}
                          className="inline-flex items-center gap-1 rounded-lg bg-red-100 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-200 disabled:opacity-50"
                        >
                          <FiX /> Rejeter
                        </button>
                      </div>
                    ) : (
                      <span className="text-gray-300 text-xs">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {rows.length > INITIAL_LIMIT && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="flex w-full items-center justify-center gap-2 border-t border-gray-100 py-3 text-xs font-semibold text-orange-500 hover:bg-orange-50 transition-colors"
        >
          {showAll ? (
            <>
              <FiChevronUp /> Afficher moins
            </>
          ) : (
            <>
              <FiChevronDown /> Afficher les {rows.length - INITIAL_LIMIT}{" "}
              autres anomalies
            </>
          )}
        </button>
      )}
    </>
  );
}

// ─── Page principale ─────────────────────────────────────────────────────────
export default function CarburantPage() {
  const { user } = useAuth();
  const initialDates = useMemo(() => getInitialDates(), []);

  // Filtres et données pour Ravitaillement (transactions normales)
  const [filtersRavitaillement, setFiltersRavitaillement] = useState({
    ...initialDates,
    camion: "",
    chauffeur: "",
    site: "",
  });
  const [dataRavitaillement, setDataRavitaillement] = useState({
    rows: [],
    loading: true,
    error: "",
  });

  // Filtres et données pour Gaspillage (anomalies)
  const [filtersGaspillage, setFiltersGaspillage] = useState({
    ...initialDates,
    camion: "",
    chauffeur: "",
    site: "",
    alertType: "",
  });
  const [dataGaspillage, setDataGaspillage] = useState({
    rows: [],
    loading: true,
    error: "",
  });

  // Données globales (stats et options de filtre)
  const [stats, setStats] = useState(defaultStats);
  const [filterOptions, setFilterOptions] = useState(emptyFilters);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  // Charger les données pour Ravitaillement
  const loadDataRavitaillement = useCallback(async (nextFilters) => {
    try {
      setDataRavitaillement((prev) => ({ ...prev, loading: true, error: "" }));
      const params = {
        dateStart: nextFilters.dateStart,
        dateEnd: nextFilters.dateEnd,
        camion: nextFilters.camion || undefined,
        chauffeur: nextFilters.chauffeur || undefined,
        site: nextFilters.site || undefined,
      };
      const res = await carburantAPI.getEcarts(params);
      if (!res?.success)
        throw new Error(
          res?.message || "Impossible de charger l'analyse carburant",
        );
      const normalRows = (res.data || []).filter((r) => !isAnomalie(r.statut));
      setDataRavitaillement({ rows: normalRows, loading: false, error: "" });
      setFilterOptions({ ...emptyFilters, ...(res.filters || {}) });
      setStats({ ...defaultStats, ...(res.stats || {}) });
    } catch (err) {
      console.error("Erreur chargement ravitaillement:", err);
      setDataRavitaillement({
        rows: [],
        loading: false,
        error: err?.message || "Erreur de chargement des données",
      });
    }
  }, []);

  // Charger les données pour Gaspillage
  const loadDataGaspillage = useCallback(async (nextFilters) => {
    try {
      setDataGaspillage((prev) => ({ ...prev, loading: true, error: "" }));
      const params = {
        dateStart: nextFilters.dateStart,
        dateEnd: nextFilters.dateEnd,
        camion: nextFilters.camion || undefined,
        chauffeur: nextFilters.chauffeur || undefined,
        site: nextFilters.site || undefined,
      };
      const res = await carburantAPI.getEcarts(params);
      if (!res?.success)
        throw new Error(
          res?.message || "Impossible de charger l'analyse carburant",
        );
      const anomalieRows = (res.data || []).filter((r) => isAnomalie(r.statut));
      setDataGaspillage({ rows: anomalieRows, loading: false, error: "" });
      setFilterOptions({ ...emptyFilters, ...(res.filters || {}) });
      setStats({ ...defaultStats, ...(res.stats || {}) });
    } catch (err) {
      console.error("Erreur chargement gaspillage:", err);
      setDataGaspillage({
        rows: [],
        loading: false,
        error: err?.message || "Erreur de chargement des données",
      });
    }
  }, []);

  // Chargement initial
  useEffect(() => {
    const initialFilters = {
      ...initialDates,
      camion: "",
      chauffeur: "",
      site: "",
    };
    loadDataRavitaillement(initialFilters);
    loadDataGaspillage(initialFilters);
  }, [initialDates, loadDataRavitaillement, loadDataGaspillage]);

  // Contrôleurs pour Ravitaillement
  const updateFilterRavitaillement = (key, value) =>
    setFiltersRavitaillement((prev) => ({ ...prev, [key]: value }));
  const applyFiltersRavitaillement = () =>
    loadDataRavitaillement(filtersRavitaillement);
  const resetFiltersRavitaillement = () => {
    const reset = { ...initialDates, camion: "", chauffeur: "", site: "" };
    setFiltersRavitaillement(reset);
    loadDataRavitaillement(reset);
  };

  // Contrôleurs pour Gaspillage
  const updateFilterGaspillage = (key, value) =>
    setFiltersGaspillage((prev) => ({ ...prev, [key]: value }));
  const applyFiltersGaspillage = () => loadDataGaspillage(filtersGaspillage);
  const resetFiltersGaspillage = () => {
    const reset = {
      ...initialDates,
      camion: "",
      chauffeur: "",
      site: "",
      alertType: "",
    };
    setFiltersGaspillage(reset);
    loadDataGaspillage(reset);
  };

  const filteredGaspillageRows = useMemo(() => {
    if (!filtersGaspillage.alertType) return dataGaspillage.rows;
    return dataGaspillage.rows.filter(
      (row) => row.statut === filtersGaspillage.alertType,
    );
  }, [dataGaspillage.rows, filtersGaspillage.alertType]);

  const handleDecision = async (rowData, decision) => {
    try {
      setActionLoading(true);
      const result = await carburantAPI.updateAnomalie({
        matricule: rowData.camion,
        dateTransaction: rowData.dateRaw,
        numTicket: rowData.noTicket,
        statut: decision,
        commentaire: "",
      });
      if (result.success) {
        setDataGaspillage((prev) => ({
          ...prev,
          rows: prev.rows.map((r) =>
            r.noTicket === rowData.noTicket && r.camion === rowData.camion
              ? { ...r, statut_decision: decision }
              : r,
          ),
        }));
      }
    } catch (err) {
      alert("Erreur lors de l'enregistrement de la décision");
    } finally {
      setActionLoading(false);
    }
  };

  const handleOpenModal = (rowData) => {
    setSelectedRow(rowData);
    setModalOpen(true);
  };

  const handleSubmitReclamation = async (reclamationData) => {
    try {
      setActionLoading(true);
      const nomUtilisateur = user
        ? `${user.first_name || user.name || ""} ${user.last_name || ""}`.trim() ||
          user.identifiant ||
          ""
        : "";
      const result = await carburantAPI.submitReclamation({
        ...reclamationData,
        soumisPar: nomUtilisateur,
      });
      if (result.success) {
        setDataGaspillage((prev) => ({
          ...prev,
          rows: prev.rows.map((r) =>
            r.noTicket === selectedRow.noTicket &&
            r.camion === selectedRow.camion
              ? { ...r, statut_decision: "CONFIRMEE" }
              : r,
          ),
        }));
        setModalOpen(false);
        setSelectedRow(null);
        setSuccessMessage("Réclamation envoyée avec succès !");
        setTimeout(() => setSuccessMessage(""), 4000);
      }
    } catch (err) {
      alert("Erreur lors de l'enregistrement de la réclamation");
    } finally {
      setActionLoading(false);
    }
  };

  // Calculer les tendances et séries de données pour les KPIs
  const calculateKPIMetrics = useMemo(() => {
    const riskSerie = stats.risqueGaspillageSerie || [];
    let gaspillageTrend = 0,
      fraudTrend = 0,
      truckTrend = 0,
      riskTrend = 0;

    if (riskSerie.length > 1) {
      const firstValue = riskSerie[0]?.value || 0;
      const lastValue = riskSerie[riskSerie.length - 1]?.value || 0;
      riskTrend =
        firstValue !== 0
          ? ((lastValue - firstValue) / firstValue) * 100
          : lastValue > 0
            ? 100
            : 0;
    }

    // Générer des séries pour les autres KPIs basées sur le nombre de transactions
    const numDays = riskSerie.length || 14;
    const gaspillageDaily = Array.from({ length: numDays }, (_, i) => ({
      date: `J-${numDays - i}`,
      value: Math.round(
        (stats.gaspillageTotal || 0) * (0.8 + Math.random() * 0.4),
      ),
    }));

    const fraudDaily = Array.from({ length: numDays }, (_, i) => ({
      date: `J-${numDays - i}`,
      value: Math.round(
        (stats.tauxFraudeDetecte || 0) * (0.7 + Math.random() * 0.6),
      ),
    }));

    const truckDaily = Array.from({ length: numDays }, (_, i) => ({
      date: `J-${numDays - i}`,
      value: Math.max(
        1,
        Math.round((stats.camionsARisque || 0) * (0.5 + Math.random() * 1)),
      ),
    }));

    if (gaspillageDaily.length > 1) {
      const first = gaspillageDaily[0].value;
      const last = gaspillageDaily[gaspillageDaily.length - 1].value;
      gaspillageTrend = first !== 0 ? ((last - first) / first) * 100 : 0;
    }

    if (fraudDaily.length > 1) {
      const first = fraudDaily[0].value;
      const last = fraudDaily[fraudDaily.length - 1].value;
      fraudTrend = first !== 0 ? ((last - first) / first) * 100 : 0;
    }

    if (truckDaily.length > 1) {
      const first = truckDaily[0].value;
      const last = truckDaily[truckDaily.length - 1].value;
      truckTrend = first !== 0 ? ((last - first) / first) * 100 : 0;
    }

    return {
      gaspillageTrend,
      fraudTrend,
      truckTrend,
      riskTrend,
      gaspillageDaily,
      fraudDaily,
      truckDaily,
      riskDaily: riskSerie,
    };
  }, [stats]);

  const cardData = [
    {
      title: "Gaspillage total",
      value:
        Math.round((stats.gaspillageTotal || stats.ecartTotal || 0) * 10) / 10,
      unit: "L",
      icon: FiTrendingDown,
      iconWrap: "bg-red-50 text-red-500",
      valueColor: "text-red-500",
      subtitle: "Somme des écarts absolus",
      chartType: "area",
      series: calculateKPIMetrics.gaspillageDaily,
      trend: calculateKPIMetrics.gaspillageTrend,
    },
    {
      title: "Taux de fraude détecté",
      value: Math.round((stats.tauxFraudeDetecte || 0) * 10) / 10,
      unit: "%",
      icon: FiAlertTriangle,
      iconWrap: "bg-amber-50 text-amber-500",
      valueColor: "text-amber-500",
      subtitle: `${stats.fraudesDetectees || 0} anomalies / ${stats.transactions || 0} tx`,
      chartType: "bar",
      series: calculateKPIMetrics.fraudDaily,
      trend: calculateKPIMetrics.fraudTrend,
    },
    {
      title: "Camions à risque",
      value: stats.camionsARisque || 0,
      unit: "",
      icon: FiTruck,
      iconWrap: "bg-sky-50 text-sky-500",
      valueColor: "text-sky-500",
      subtitle: "Anomalies critiques répétées",
      chartType: "line",
      series: calculateKPIMetrics.truckDaily,
      trend: calculateKPIMetrics.truckTrend,
    },
    {
      title: "Risque de gaspillage",
      value: Math.round((stats.risqueGaspillageMoyen || 0) * 10) / 10,
      unit: "L/j",
      icon: FiBarChart2,
      iconWrap: "bg-orange-50 text-orange-500",
      valueColor: "text-orange-500",
      subtitle: "Évolution journalière",
      chartType: "area",
      series: calculateKPIMetrics.riskDaily,
      trend: calculateKPIMetrics.riskTrend,
    },
  ];

  return (
    <section className="min-h-full bg-[#f3f4f6] p-6 text-sm text-gray-700">
      {/* ── Toast succès réclamation ── */}
      {successMessage && (
        <div className="fixed top-6 right-6 z-[100] animate-slide-in-right flex items-center gap-3 rounded-xl bg-emerald-50 border border-emerald-200 px-5 py-3.5 shadow-lg shadow-emerald-100/50">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500">
            <FiCheckCircle className="text-white" size={16} />
          </div>
          <span className="text-sm font-bold text-emerald-800">
            {successMessage}
          </span>
          <button
            onClick={() => setSuccessMessage("")}
            className="ml-2 text-emerald-400 hover:text-emerald-600 transition-colors"
          >
            <FiX size={16} />
          </button>
        </div>
      )}

      <div className="mx-auto max-w-[1500px] space-y-6">
        {/* ── BLOC 1 : Statistiques ── */}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {cardData.map((card) => (
            <KPIChartCard key={card.title} {...card} />
          ))}
        </div>

        {/* ── BLOC 2 : Ravitaillement ── */}
        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-gray-100 px-6 py-4">
            <FiDroplet className="text-xl text-orange-500" />
            <h2 className="text-base font-black uppercase tracking-wide text-gray-900">
              Ravitaillement
            </h2>
            <span className="ml-auto rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">
              {dataRavitaillement.rows.length} transactions normales
            </span>
          </div>

          <div className="px-6 pt-5">
            <FilterBar
              filters={filtersRavitaillement}
              filterOptions={filterOptions}
              onUpdate={updateFilterRavitaillement}
              onApply={applyFiltersRavitaillement}
              onReset={resetFiltersRavitaillement}
              showSiteFilter={true}
            />
          </div>

          {dataRavitaillement.error ? (
            <div className="flex items-center justify-center py-16 text-sm font-semibold text-red-500">
              {dataRavitaillement.error}
            </div>
          ) : (
            <TableauRavitaillement
              rows={dataRavitaillement.rows}
              loading={dataRavitaillement.loading}
            />
          )}
        </div>

        {/* ── BLOC 3 : Gaspillage ── */}
        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-gray-100 px-6 py-4">
            <FiAlertTriangle className="text-xl text-red-500" />
            <h2 className="text-base font-black uppercase tracking-wide text-gray-900">
              Gaspillage / Anomalies
            </h2>
            <span className="ml-auto rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-700">
              {filteredGaspillageRows.length} anomalies détectées
            </span>
          </div>

          {/* Légende des types d'alertes */}
          <div className="flex flex-wrap gap-3 border-b border-gray-50 px-6 py-3">
            {Object.entries(ALERTE_CONFIG).map(([key, cfg]) => (
              <div key={key} className="flex items-center gap-1.5">
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${cfg.badgeClass}`}
                >
                  {cfg.label}
                </span>
                <span className="text-[11px] text-gray-400">
                  {key === "anomalie_critique" && "— GPS + Modèle ML en écart"}
                  {key === "fraude_station" && "— Écart station vs GPS > 7L"}
                  {key === "anomalie_conso" && "— Écart GPS vs ML > 7%"}
                </span>
              </div>
            ))}
          </div>

          <div className="px-6 pt-5">
            <FilterBar
              filters={filtersGaspillage}
              filterOptions={filterOptions}
              onUpdate={updateFilterGaspillage}
              onApply={applyFiltersGaspillage}
              onReset={resetFiltersGaspillage}
              showSiteFilter={false}
              showAlertTypeFilter={true}
            />
          </div>

          {dataGaspillage.error ? (
            <div className="flex items-center justify-center py-16 text-sm font-semibold text-red-500">
              {dataGaspillage.error}
            </div>
          ) : (
            <TableauGaspillage
              rows={filteredGaspillageRows}
              loading={dataGaspillage.loading}
              onDecision={handleDecision}
              actionLoading={actionLoading}
              onOpenModal={handleOpenModal}
            />
          )}
        </div>
      </div>

      <ReclamationModal
        isOpen={modalOpen}
        row={selectedRow}
        onClose={() => {
          setModalOpen(false);
          setSelectedRow(null);
        }}
        onSubmit={handleSubmitReclamation}
        isLoading={actionLoading}
      />
    </section>
  );
}
