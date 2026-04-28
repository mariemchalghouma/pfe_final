"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FiAlertTriangle,
  FiBarChart2,
  FiCalendar,
  FiMapPin,
  FiShield,
  FiTag,
  FiTrendingDown,
  FiMessageSquare,
  FiExternalLink,
  FiTruck,
  FiUser,
} from "react-icons/fi";
import { carburantAPI } from "@/services/api";

const defaultStats = {
  ecartTotal: 0,
  tauxConformite: 0,
  alertesVol: 0,
  reclamations: 0,
  transactions: 0,
};

const emptyFilters = {
  camions: [],
  chauffeurs: [],
  categories: [],
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

export default function CarburantAnalysePage() {
  const initialDates = useMemo(() => getInitialDates(), []);

  const [filters, setFilters] = useState({
    ...initialDates,
    camion: "",
    chauffeur: "",
    categorie: "",
    site: "",
  });
  const [rows, setRows] = useState([]);
  const [stats, setStats] = useState(defaultStats);
  const [filterOptions, setFilterOptions] = useState(emptyFilters);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadData = useCallback(async (nextFilters) => {
    try {
      setLoading(true);
      setError("");

      const params = {
        dateStart: nextFilters.dateStart,
        dateEnd: nextFilters.dateEnd,
        camion: nextFilters.camion || undefined,
        chauffeur: nextFilters.chauffeur || undefined,
        categorie: nextFilters.categorie || undefined,
        site: nextFilters.site || undefined,
      };

      const res = await carburantAPI.getEcarts(params);

      if (!res?.success) {
        throw new Error(
          res?.message || "Impossible de charger l'analyse carburant",
        );
      }

      setRows(res.data || []);
      setStats({ ...defaultStats, ...(res.stats || {}) });
      setFilterOptions({ ...emptyFilters, ...(res.filters || {}) });
    } catch (err) {
      console.error("Erreur chargement analyse carburant:", err);
      setRows([]);
      setStats(defaultStats);
      setError(err?.message || "Erreur de chargement des donnees");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initial = {
      ...initialDates,
      camion: "",
      chauffeur: "",
      categorie: "",
      site: "",
    };
    loadData(initial);
  }, [initialDates, loadData]);

  const updateFilter = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const applyFilters = () => {
    loadData(filters);
  };

  const resetFilters = () => {
    const reset = {
      ...initialDates,
      camion: "",
      chauffeur: "",
      categorie: "",
      site: "",
    };
    setFilters(reset);
    loadData(reset);
  };

  const cardData = [
    {
      title: "ECART TOTAL",
      value: `${stats.ecartTotal || 0} L`,
      icon: FiTrendingDown,
      iconWrap: "bg-red-50 text-red-500",
      valueColor: "text-red-500",
    },
    {
      title: "TAUX CONFORMITE",
      value: `${stats.tauxConformite || 0}%`,
      icon: FiShield,
      iconWrap: "bg-emerald-50 text-emerald-500",
      valueColor: "text-emerald-500",
    },
    {
      title: "ALERTES VOL",
      value: String(stats.alertesVol || 0),
      icon: FiAlertTriangle,
      iconWrap: "bg-amber-50 text-amber-500",
      valueColor: "text-amber-500",
    },
    {
      title: "RECLAMATIONS",
      value: String(stats.reclamations || 0),
      icon: FiMessageSquare,
      iconWrap: "bg-blue-50 text-blue-500",
      valueColor: "text-blue-500",
    },
  ];

  return (
    <section className="min-h-full bg-[#f3f4f6] p-6 text-sm text-gray-700">
      <div className="mx-auto max-w-[1500px] space-y-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {cardData.map((card) => (
            <StatCard key={card.title} {...card} />
          ))}
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="mb-6 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-gray-900">
              <FiBarChart2 className="text-lg" />
              <h2 className="text-base font-black uppercase tracking-wide">
                Filtres
              </h2>
            </div>
            <div className="flex items-center gap-2">
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

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
            <label className="space-y-1.5">
              <span className="flex items-center gap-1 text-xs font-semibold text-gray-500">
                <FiCalendar className="text-sm" /> Debut
              </span>
              <input
                type="date"
                value={filters.dateStart}
                onChange={(e) => updateFilter("dateStart", e.target.value)}
                className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 outline-none ring-orange-400 transition focus:ring-2"
              />
            </label>

            <label className="space-y-1.5">
              <span className="flex items-center gap-1 text-xs font-semibold text-gray-500">
                <FiCalendar className="text-sm" /> Fin
              </span>
              <input
                type="date"
                value={filters.dateEnd}
                onChange={(e) => updateFilter("dateEnd", e.target.value)}
                className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 outline-none ring-orange-400 transition focus:ring-2"
              />
            </label>

            <label className="space-y-1.5">
              <span className="flex items-center gap-1 text-xs font-semibold text-gray-500">
                <FiTruck className="text-sm" /> Camion
              </span>
              <select
                value={filters.camion}
                onChange={(e) => updateFilter("camion", e.target.value)}
                className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 outline-none ring-orange-400 transition focus:ring-2"
              >
                <option value="">Tous</option>
                {filterOptions.camions.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1.5">
              <span className="flex items-center gap-1 text-xs font-semibold text-gray-500">
                <FiUser className="text-sm" /> Chauffeur
              </span>
              <select
                value={filters.chauffeur}
                onChange={(e) => updateFilter("chauffeur", e.target.value)}
                className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 outline-none ring-orange-400 transition focus:ring-2"
              >
                <option value="">Tous</option>
                {filterOptions.chauffeurs.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1.5">
              <span className="flex items-center gap-1 text-xs font-semibold text-gray-500">
                <FiTag className="text-sm" /> Categorie
              </span>
              <select
                value={filters.categorie}
                onChange={(e) => updateFilter("categorie", e.target.value)}
                className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 outline-none ring-orange-400 transition focus:ring-2"
              >
                <option value="">Toutes</option>
                {filterOptions.categories.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1.5">
              <span className="flex items-center gap-1 text-xs font-semibold text-gray-500">
                <FiMapPin className="text-sm" /> Site
              </span>
              <select
                value={filters.site}
                onChange={(e) => updateFilter("site", e.target.value)}
                className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 outline-none ring-orange-400 transition focus:ring-2"
              >
                <option value="">Tous</option>
                {filterOptions.sites.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm min-h-[500px]">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
            <h3 className="flex items-center gap-2 text-base font-black text-gray-900 uppercase tracking-wide">
              <FiBarChart2 className="text-xl text-orange-500" /> Analyse GPS vs
              Ravitaillement
            </h3>
            <span className="text-xs font-bold uppercase tracking-wider text-gray-400">
              {stats.transactions || 0} transactions
            </span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-24 text-sm font-semibold text-gray-500">
              Chargement des donnees...
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-24 text-sm font-semibold text-red-500">
              {error}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[1200px] w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-50/50 border-b border-gray-100">
                    <th className="px-6 py-2.5 font-bold text-gray-500 uppercase tracking-wider text-[11px]">
                      Date
                    </th>
                    <th className="px-6 py-2.5 font-bold text-gray-500 uppercase tracking-wider text-[11px]">
                      Camion
                    </th>
                    <th className="px-6 py-2.5 font-bold text-gray-500 uppercase tracking-wider text-[11px]">
                      Chauffeur
                    </th>
                    <th className="px-6 py-2.5 font-bold text-gray-500 uppercase tracking-wider text-[11px]">
                      Lieu
                    </th>
                    <th className="px-6 py-2.5 font-bold text-gray-500 uppercase tracking-wider text-[11px]">
                      Qte GPS (L)
                    </th>
                    <th className="px-6 py-2.5 font-bold text-gray-500 uppercase tracking-wider text-[11px]">
                      Qte RAV (L)
                    </th>
                    <th className="px-6 py-2.5 font-bold text-gray-500 uppercase tracking-wider text-[11px]">
                      Ecart (L)
                    </th>
                    <th className="px-6 py-2.5 font-bold text-gray-500 uppercase tracking-wider text-[11px]">
                      Km
                    </th>
                    <th className="px-6 py-2.5 font-bold text-gray-500 uppercase tracking-wider text-[11px]">
                      Vit. moy
                    </th>
                    <th className="px-6 py-2.5 font-bold text-gray-500 uppercase tracking-wider text-[11px]">
                      Conform.
                    </th>
                    <th className="px-6 py-2.5 font-bold text-gray-500 uppercase tracking-wider text-[11px]">
                      Alerte
                    </th>
                    <th className="px-6 py-2.5 font-bold text-gray-500 uppercase tracking-wider text-[11px]">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {rows.map((row, idx) => {
                    const confNum = Number(
                      String(row.conformite || "0").replace("%", ""),
                    );
                    const confClass =
                      confNum < 80
                        ? "bg-red-100 text-red-600"
                        : "bg-emerald-100 text-emerald-700";
                    return (
                      <tr
                        key={`${row.noTicket || row.camion}-${idx}`}
                        className="text-sm text-gray-700"
                      >
                        <td className="px-6 py-2 whitespace-nowrap font-medium text-gray-600">
                          {row.date}
                        </td>
                        <td className="px-6 py-2 whitespace-nowrap">
                          <p className="font-semibold text-gray-900 text-sm">
                            {row.camion}
                          </p>
                          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-tight">
                            {row.type}
                          </p>
                        </td>
                        <td className="px-6 py-2 whitespace-nowrap font-medium text-gray-600">
                          {row.chauffeur}
                        </td>
                        <td className="px-6 py-2 whitespace-nowrap font-medium text-gray-600">
                          {row.lieu}
                        </td>
                        <td className="px-6 py-2 whitespace-nowrap font-medium text-gray-600">
                          {row.qteGps}
                        </td>
                        <td className="px-6 py-2 whitespace-nowrap font-medium text-gray-600">
                          {row.qteRav}
                        </td>
                        <td
                          className={`px-6 py-2 whitespace-nowrap font-bold ${Math.abs(row.ecart) >= 10 ? "text-red-500" : "text-emerald-500"}`}
                        >
                          {row.ecart > 0 ? `+${row.ecart}` : row.ecart}
                        </td>
                        <td className="px-6 py-2 whitespace-nowrap font-medium text-gray-600">
                          {row.km}
                        </td>
                        <td className="px-6 py-2 whitespace-nowrap font-medium text-gray-600">
                          {row.vitesse}
                        </td>
                        <td className="px-6 py-2 whitespace-nowrap">
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-bold ${confClass}`}
                          >
                            {row.conformite}
                          </span>
                        </td>
                        <td className="px-6 py-2 whitespace-nowrap">
                          {row.alert ? (
                            <FiAlertTriangle className="text-amber-500" />
                          ) : (
                            <span className="text-gray-300">-</span>
                          )}
                        </td>
                        <td className="px-6 py-2 whitespace-nowrap">
                          <button className="inline-flex items-center gap-1 font-semibold text-orange-500 hover:text-orange-600">
                            <FiExternalLink className="text-sm" /> Courbe
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!rows.length && (
                <div className="flex items-center justify-center py-16 text-sm font-semibold text-gray-500">
                  Aucune transaction trouvee pour ces filtres.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
