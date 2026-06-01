"use client";

import React, { useState, useEffect, useMemo } from "react";
import { reclamationsAPI } from "@/services/api";
import {
  FiAlertTriangle,
  FiClock,
  FiXCircle,
  FiCalendar,
  FiTruck,
  FiFileText,
  FiMessageSquare,
  FiHash,
  FiUser,
  FiCheckCircle,
  FiX,
} from "react-icons/fi";

/* ─── Statut Badge ─── */
const StatutBadge = ({ statut }) => {
  const config = {
    CONFIRMEE: {
      label: "Confirmée",
      bg: "bg-red-50",
      text: "text-red-700",
      border: "border-red-200",
      icon: FiAlertTriangle,
      dot: "bg-red-500",
    },
    EN_ATTENTE: {
      label: "En attente",
      bg: "bg-amber-50",
      text: "text-amber-700",
      border: "border-amber-200",
      icon: FiClock,
      dot: "bg-amber-500",
    },
    REJETEE: {
      label: "Rejetée",
      bg: "bg-slate-50",
      text: "text-slate-600",
      border: "border-slate-200",
      icon: FiXCircle,
      dot: "bg-slate-400",
    },
  };

  const c = config[statut] || config.EN_ATTENTE;
  const Icon = c.icon;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border ${c.bg} ${c.text} ${c.border}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      <Icon size={12} />
      {c.label}
    </span>
  );
};

/* ═══════════════════════════════════════════════════════════════════
   PAGE PRINCIPALE
   ═══════════════════════════════════════════════════════════════════ */
export default function ReclamationsPage() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState("");

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 15;

  const fetchReclamations = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await reclamationsAPI.getReclamations();
      if (result.success) {
        setData(result.data);
      } else {
        setError(result.message || "Erreur lors du chargement");
      }
    } catch (err) {
      setError("Erreur de connexion au serveur");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReclamations();
  }, []);

  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => {
        setSuccessMessage("");
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  /* ─── Sort locally ─── */
  const processedData = useMemo(() => {
    let items = [...data];

    // Default sort: latest submissions first.
    items.sort(
      (a, b) =>
        new Date(b.createdAt || 0).getTime() -
        new Date(a.createdAt || 0).getTime(),
    );

    return items;
  }, [data]);

  const totalPages = Math.ceil(processedData.length / ITEMS_PER_PAGE);
  const paginatedData = processedData.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE,
  );

  return (
    <div className="p-6 lg:p-8 max-w-[1440px] mx-auto space-y-6">
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
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 bg-gray-50/50">
          <h2 className="text-base font-black text-gray-900 uppercase tracking-wide">
            Toutes les réclamations
          </h2>
          <span className="text-xs font-bold uppercase tracking-wider text-gray-400">
            {processedData.length} lignes
          </span>
        </div>

        {/* ─── Table ─── */}
        <div className="overflow-x-auto min-h-[420px]">
          {loading ? (
            <div className="flex items-center justify-center py-24">
              <div className="flex flex-col items-center gap-4">
                <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-sm text-gray-400 font-medium">
                  Chargement des réclamations...
                </span>
              </div>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-24">
              <div className="flex flex-col items-center gap-3 text-center">
                <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center">
                  <FiAlertTriangle size={24} className="text-red-400" />
                </div>
                <p className="text-sm font-bold text-gray-700">{error}</p>
                <button
                  onClick={fetchReclamations}
                  className="mt-2 px-4 py-2 rounded-lg bg-orange-500 text-white text-xs font-bold hover:bg-orange-600 transition-colors"
                >
                  Réessayer
                </button>
              </div>
            </div>
          ) : processedData.length === 0 ? (
            <div className="flex items-center justify-center py-24">
              <div className="flex flex-col items-center gap-3 text-center">
                <div className="w-14 h-14 rounded-2xl bg-gray-50 flex items-center justify-center">
                  <FiFileText size={24} className="text-gray-300" />
                </div>
                <p className="text-sm font-bold text-gray-500">
                  Aucune réclamation trouvée
                </p>
              </div>
            </div>
          ) : (
            <table className="w-full text-sm text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/50 border-b border-gray-100">
                  {[
                    { label: "Matricule", field: "matricule", icon: FiTruck },
                    {
                      label: "Chauffeur",
                      field: "chauffeur",
                      icon: FiUser,
                    },
                    {
                      label: "Date Transaction",
                      field: "dateTransaction",
                      icon: FiCalendar,
                    },
                    { label: "N° Ticket", field: "numTicket", icon: FiHash },
                    {
                      label: "Soumis par",
                      field: "soumisPar",
                      icon: FiUser,
                    },
                    {
                      label: "Soumis le",
                      field: "createdAt",
                      icon: FiClock,
                    },
                    {
                      label: "Commentaire",
                      field: null,
                      icon: FiMessageSquare,
                    },
                  ].map((col) => (
                    <th
                      key={col.label}
                      className="px-6 py-2.5 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider"
                    >
                      <div className="flex items-center gap-1.5">
                        <col.icon size={12} />
                        {col.label}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {paginatedData.map((rec) => (
                  <tr key={rec.id}>
                    <td className="px-6 py-2.5">
                      <span className="text-[13px] font-bold text-gray-800 bg-gray-100 px-2.5 py-1 rounded-lg">
                        {rec.matricule}
                      </span>
                    </td>
                    <td className="px-6 py-2.5 whitespace-nowrap text-[13px] text-gray-700">
                      {rec.chauffeur || "—"}
                    </td>
                    <td className="px-6 py-2.5 whitespace-nowrap font-medium text-gray-600">
                      {rec.dateTransaction
                        ? new Date(rec.dateTransaction).toLocaleDateString(
                            "fr-FR",
                            {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            },
                          )
                        : "—"}
                    </td>
                    <td className="px-6 py-2.5 whitespace-nowrap text-[13px] text-gray-600 font-mono">
                      {rec.numTicket}
                    </td>
                    <td className="px-6 py-2.5 whitespace-nowrap text-[13px] text-gray-700 font-semibold">
                      {rec.soumisPar || "—"}
                    </td>
                    <td className="px-6 py-2.5 whitespace-nowrap text-[12px] text-gray-400">
                      {rec.createdAt
                        ? new Date(rec.createdAt).toLocaleString("fr-FR", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "—"}
                    </td>
                    <td className="px-6 py-2.5 text-[12px] text-gray-500 max-w-[220px] truncate">
                      {rec.commentaire || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* ─── Pagination ─── */}
        {!loading && processedData.length > 0 && (
          <div className="flex items-center justify-between px-5 py-3.5 border-t border-gray-100 bg-gray-50/30">
            <span className="text-[11px] text-gray-400 font-medium">
              {processedData.length} réclamation
              {processedData.length > 1 ? "s" : ""} • Page {currentPage} /{" "}
              {totalPages || 1}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className="px-3 py-1.5 rounded-lg text-xs font-bold transition-colors disabled:opacity-30 disabled:cursor-not-allowed bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
              >
                Précédent
              </button>
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                let page;
                if (totalPages <= 5) {
                  page = i + 1;
                } else if (currentPage <= 3) {
                  page = i + 1;
                } else if (currentPage >= totalPages - 2) {
                  page = totalPages - 4 + i;
                } else {
                  page = currentPage - 2 + i;
                }
                return (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={`w-8 h-8 rounded-lg text-xs font-bold transition-all duration-200 ${
                      currentPage === page
                        ? "bg-orange-500 text-white shadow-sm"
                        : "bg-white border border-gray-200 text-gray-500 hover:bg-gray-50"
                    }`}
                  >
                    {page}
                  </button>
                );
              })}
              <button
                onClick={() =>
                  setCurrentPage((p) => Math.min(totalPages, p + 1))
                }
                disabled={currentPage >= totalPages}
                className="px-3 py-1.5 rounded-lg text-xs font-bold transition-colors disabled:opacity-30 disabled:cursor-not-allowed bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
              >
                Suivant
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
