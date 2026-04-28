"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { FiExternalLink } from "react-icons/fi";

export default function CallsTable({ calls = [] }) {
  const router = useRouter();

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Header with controls */}
      <div className="flex items-center justify-between p-5 border-b border-gray-100">
        <h2 className="text-lg font-black text-gray-900 tracking-tight">
          Historique des appels
        </h2>
        <div className="flex gap-3">
          <button className="px-3 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 font-bold text-xs text-gray-600 transition-all shadow-sm">
            Filter
          </button>
          <button className="px-3 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 font-bold text-xs text-gray-600 transition-all shadow-sm">
            Export CSV
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left border-collapse">
          <thead>
            <tr className="bg-gray-50/50 border-b border-gray-100">
              <th className="px-6 py-2.5 font-bold text-gray-500 uppercase tracking-wider text-[11px]">
                Chauffeur
              </th>
              <th className="px-6 py-2.5 font-bold text-gray-500 uppercase tracking-wider text-[11px]">
                Debut appel
              </th>
              <th className="px-6 py-2.5 font-bold text-gray-500 uppercase tracking-wider text-[11px]">
                Durée
              </th>
              <th className="px-6 py-2.5 font-bold text-gray-500 uppercase tracking-wider text-[11px]">
                Type
              </th>
              <th className="px-6 py-2.5 font-bold text-gray-500 uppercase tracking-wider text-[11px]">
                Etat de l appel
              </th>
              <th className="px-6 py-2.5 font-bold text-gray-500 uppercase tracking-wider text-[11px]">
                Action
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {calls.map((call) => (
              <tr key={call.id} className="group cursor-pointer transition-all">
                {/* Chauffeur */}
                <td className="px-6 py-2.5 whitespace-nowrap">
                  <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center text-xs font-bold text-white mb-1 inline-block mr-2">
                    {call.chauffeur
                      .split(" ")
                      .map((n) => n[0])
                      .join("")}
                  </div>
                  <span className="font-semibold text-gray-900 text-sm">
                    {call.chauffeur}
                  </span>
                </td>

                {/* Debut appel */}
                <td className="px-6 py-2.5 whitespace-nowrap font-medium text-gray-600">
                  <span>{call.debut || "-"}</span>
                </td>

                {/* Duree */}
                <td className="px-6 py-2.5 whitespace-nowrap">
                  <span className="text-sm text-gray-700">{call.duree}</span>
                </td>

                {/* Type */}
                <td className="px-6 py-2.5">
                  <span className="inline-flex items-center gap-2 text-sm text-gray-700">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        call.type === "Carburant"
                          ? "bg-orange-500"
                          : call.type === "Porte"
                            ? "bg-yellow-500"
                            : call.type === "Arrêt"
                              ? "bg-red-500"
                              : "bg-blue-400"
                      }`}
                    />
                    {call.type}
                  </span>
                </td>

                {/* Etat */}
                <td className="px-6 py-2.5">
                  {call.etat === "En cours" ? (
                    <span className="inline-flex items-center gap-2 px-3 py-1 bg-gray-100 rounded-full text-xs font-bold text-gray-700 whitespace-nowrap">
                      ● En cours
                    </span>
                  ) : call.etat === "Terminé" ? (
                    <span className="inline-flex items-center gap-2 px-3 py-1 bg-gray-100 rounded-full text-xs font-bold text-gray-700 whitespace-nowrap">
                      ✓ Terminé
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-2 px-3 py-1 bg-red-100 rounded-full text-xs font-bold text-red-700 whitespace-nowrap">
                      ✕ Manqué
                    </span>
                  )}
                </td>

                {/* Action */}
                <td className="px-6 py-2.5">
                  <button
                    onClick={() => router.push(`/appels/${call.id}`)}
                    className="flex items-center gap-2 text-gray-600 hover:text-orange-600 font-medium text-[12px] transition-colors"
                  >
                    Détails
                    <FiExternalLink size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-white">
        <span className="text-xs text-gray-500">
          Showing 1-{Math.min(10, calls.length)} of {calls.length} calls
        </span>
        <div className="flex gap-2">
          <button className="px-3 py-1 text-sm text-gray-600 rounded-lg hover:bg-gray-100">
            ←
          </button>
          {[1, 2, 3].map((page) => (
            <button
              key={page}
              className={`px-3 py-1 text-sm rounded ${
                page === 1
                  ? "bg-orange-100 text-orange-700 font-semibold"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              {page}
            </button>
          ))}
          <button className="px-3 py-1 text-sm text-gray-600 rounded-lg hover:bg-gray-100">
            →
          </button>
        </div>
      </div>
    </div>
  );
}
