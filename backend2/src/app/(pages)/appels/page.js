"use client";
import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { FiPhoneCall, FiPhoneIncoming, FiPhoneOutgoing } from "react-icons/fi";
import { getHistorique } from "../../../lib/api";
import { arretsAPI, ouverturesAPI } from "@/services/api";

/* eslint-disable react-hooks/exhaustive-deps */

const STORAGE_KEY = "appels_sessions_lues";
function getReadSessions() {
  try {
    return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"));
  } catch {
    return new Set();
  }
}
function saveReadSessions(set) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
}

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

export default function Page() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [readSessions, setReadSessions] = useState(new Set());

  useEffect(() => {
    setReadSessions(getReadSessions());
  }, []);

  // ── Filter state ──
  const today = new Date();
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);
  const toISO = (d) => d.toISOString().split("T")[0];

  const [filterDebut, setFilterDebut] = useState(toISO(weekAgo));
  const [filterFin, setFilterFin] = useState(toISO(today));
  const [filterCamion, setFilterCamion] = useState("");
  const [filterChauffeur, setFilterChauffeur] = useState("");
  const [filterCallMode, setFilterCallMode] = useState("all");
  const [filterCallType, setFilterCallType] = useState("all");
  const [appliedFilters, setAppliedFilters] = useState({
    debut: toISO(weekAgo),
    fin: toISO(today),
    camion: "",
    chauffeur: "",
    callMode: "all",
    callType: "all",
  });
  const [pointNoirMap, setPointNoirMap] = useState(new Map());

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const data = await getHistorique(200);
        setRows(data.appels || []);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const normalizeSourceId = (value) => {
    if (!value) return null;
    const raw = String(value).trim();
    if (!raw || !raw.includes("|")) return null;
    const [camion, tsRaw] = raw.split("|", 2);
    if (!camion || !tsRaw) return null;
    const ts = tsRaw
      .replace("T", " ")
      .split(".")[0]
      .replace(/Z$/, "")
      .replace(/([+-]\d{2}:\d{2})$/, "")
      .trim();
    return `${camion}|${ts}`;
  };

  const formatSourceId = (camion, value) => {
    if (!camion || !value) return null;
    const dt = new Date(value);
    if (!Number.isNaN(dt.getTime())) {
      const iso = dt.toISOString().replace("T", " ").split(".")[0];
      return `${camion}|${iso}`;
    }
    const raw = String(value).trim();
    if (!raw) return null;
    const ts = raw.replace("T", " ").split(".")[0];
    return `${camion}|${ts}`;
  };

  const buildSourceKey = (table, sourceId) => {
    const normalized = normalizeSourceId(sourceId);
    if (!table || !normalized) return null;
    return `${table}|${normalized}`;
  };

  useEffect(() => {
    let active = true;
    async function loadPointNoir() {
      try {
        const dateStart = appliedFilters.debut;
        const dateEnd = appliedFilters.fin;
        const [arretsRes, portesRes] = await Promise.all([
          arretsAPI.getArrets({ dateStart, dateEnd, limit: 2000, offset: 0 }),
          ouverturesAPI.getOuvertures({ dateStart, dateEnd }),
        ]);

        const map = new Map();
        const arrets = Array.isArray(arretsRes?.data) ? arretsRes.data : [];
        const portes = Array.isArray(portesRes?.data) ? portesRes.data : [];

        arrets.forEach((stop) => {
          if (!stop?.isPointNoir) return;
          const sourceId = formatSourceId(
            stop.camion,
            stop.beginstoptime || stop.date,
          );
          const key = buildSourceKey("voyage_tracking_stops", sourceId);
          if (!key) return;
          map.set(key, {
            label: stop.pointNoirPoi || stop.poiPlanning || "Point noir",
          });
        });

        portes.forEach((door) => {
          if (!door?.isPointNoir) return;
          const sourceId = formatSourceId(
            door.camion,
            door.dateOuverture || door.date_ouverture,
          );
          const key = buildSourceKey("voyagetracking_port_ouvert", sourceId);
          if (!key) return;
          map.set(key, {
            label: door.pointNoirPoi || door.poiProche || "Point noir",
          });
        });

        if (active) setPointNoirMap(map);
      } catch (e) {
        console.error("Erreur chargement point noir:", e);
        if (active) setPointNoirMap(new Map());
      }
    }

    loadPointNoir();
    return () => {
      active = false;
    };
  }, [appliedFilters]);

  // Unique lists for dropdowns
  const camionOptions = useMemo(
    () => [...new Set(rows.map((r) => r.camion_id).filter(Boolean))].sort(),
    [rows],
  );
  const chauffeurOptions = useMemo(
    () => [...new Set(rows.map((r) => r.nom_chauffeur).filter(Boolean))].sort(),
    [rows],
  );

  const handleAppliquer = () => {
    setAppliedFilters({
      debut: filterDebut,
      fin: filterFin,
      camion: filterCamion,
      chauffeur: filterChauffeur,
      callMode: filterCallMode,
      callType: filterCallType,
    });
  };
  const handleReinitialiser = () => {
    setFilterDebut(toISO(weekAgo));
    setFilterFin(toISO(today));
    setFilterCamion("");
    setFilterChauffeur("");
    setFilterCallMode("all");
    setFilterCallType("all");
    setAppliedFilters({
      debut: toISO(weekAgo),
      fin: toISO(today),
      camion: "",
      chauffeur: "",
      callMode: "all",
      callType: "all",
    });
  };

  // ── Mark as read handler (localStorage + API) ──
  const handleMarquerLue = (row) => {
    const sid = row.session_id;
    if (!sid || sid === "null") return;
    const updated = new Set(readSessions);
    updated.add(sid);
    saveReadSessions(updated);
    setReadSessions(updated);
  };

  const normalizeMode = (value) =>
    String(value || "")
      .trim()
      .toLowerCase();
  const isIncoming = (row) => {
    const mode = normalizeMode(row?.mode_appel || row?.mode);
    return mode === "incoming" || mode === "entrant";
  };

  const filtered = useMemo(() => {
    let result = rows;

    if (appliedFilters.debut) {
      const start = new Date(appliedFilters.debut);
      start.setHours(0, 0, 0, 0);
      result = result.filter((r) => {
        const d = new Date(r.ts_detection || r.date_appel);
        return d >= start;
      });
    }
    if (appliedFilters.fin) {
      const end = new Date(appliedFilters.fin);
      end.setHours(23, 59, 59, 999);
      result = result.filter((r) => {
        const d = new Date(r.ts_detection || r.date_appel);
        return d <= end;
      });
    }

    if (appliedFilters.camion) {
      result = result.filter((r) => r.camion_id === appliedFilters.camion);
    }

    if (appliedFilters.chauffeur) {
      result = result.filter(
        (r) => r.nom_chauffeur === appliedFilters.chauffeur,
      );
    }

    if (appliedFilters.callMode && appliedFilters.callMode !== "all") {
      if (appliedFilters.callMode === "entrant") {
        result = result.filter((r) => isIncoming(r));
      } else if (appliedFilters.callMode === "sortant") {
        result = result.filter((r) => !isIncoming(r));
      }
    }

    if (appliedFilters.callType && appliedFilters.callType !== "all") {
      const callType = appliedFilters.callType.toLowerCase();
      result = result.filter((r) => {
        const rType = (r.type_nc || "").toString().toLowerCase();
        return rType === callType;
      });
    }

    return result;
  }, [rows, appliedFilters]);

  const { outgoingRows, incomingRows } = useMemo(() => {
    const outgoing = [];
    const incoming = [];
    for (const row of filtered) {
      if (isIncoming(row)) incoming.push(row);
      else outgoing.push(row);
    }
    return { outgoingRows: outgoing, incomingRows: incoming };
  }, [filtered]);

  const statsCards = useMemo(() => {
    const total = loading ? "0" : String(filtered.length);
    const outgoing = loading ? "0" : String(outgoingRows.length);
    const incoming = loading ? "0" : String(incomingRows.length);

    return [
      {
        title: "TOTAL APPELS",
        value: total,
        icon: FiPhoneCall,
        iconWrap: "bg-orange-50 text-orange-500",
        valueColor: "text-orange-600",
      },
      {
        title: "APPELS SORTANTS",
        value: outgoing,
        icon: FiPhoneOutgoing,
        iconWrap: "bg-amber-50 text-amber-500",
        valueColor: "text-amber-600",
      },
      {
        title: "APPELS ENTRANTS",
        value: incoming,
        icon: FiPhoneIncoming,
        iconWrap: "bg-emerald-50 text-emerald-500",
        valueColor: "text-emerald-600",
      },
    ];
  }, [filtered.length, outgoingRows.length, incomingRows.length, loading]);

  const formatDateTime = (value) => {
    if (!value) return { date: "—", time: "" };
    const parts = value.replace("T", " ").split(".");
    const [date, time] = parts[0].split(" ");
    return { date: date || "—", time: time || "" };
  };

  const formatDuration = (seconds) => {
    if (!seconds || Number.isNaN(Number(seconds))) return "—";
    const s = Math.max(0, Math.round(Number(seconds)));
    const m = Math.floor(s / 60);
    const r = s % 60;
    if (m <= 0) return `${r}s`;
    return `${m}min ${r}s`;
  };

  const getTypeLabel = (typeNc) => {
    if (!typeNc) return "—";
    if (typeNc === "porte_ouverte") return "Porte";
    if (typeNc === "arret_non_prevu") return "Arret";
    return typeNc.replaceAll("_", " ");
  };

  const getEtatLabel = (etatAppel, statut) => {
    if (etatAppel === "active") return "Appel en cours";
    if (etatAppel === "ringing") return "Sonnerie";
    if (etatAppel === "ended") return "Appel termine";
    if (etatAppel === "missed") return "Manque";
    if (etatAppel === "canceled") return "Annule";
    if (statut === "nouveau") return "Nouveau";
    if (statut === "en_cours") return "Appel en cours";
    if (statut === "appel_termine") return "Appel termine";
    return "—";
  };

  const ui = {
    page: {
      minHeight: "100vh",
      background: "#f3f4f6",
      padding: "24px",
      fontFamily: "Inter, sans-serif",
      color: "#334155",
    },
    header: {
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: "24px",
      marginBottom: "18px",
      flexWrap: "wrap",
    },
    kicker: {
      fontSize: "11px",
      fontWeight: 700,
      letterSpacing: "0.12em",
      textTransform: "uppercase",
      color: "#64748b",
      margin: "0 0 6px",
    },
    title: {
      fontSize: "18px",
      fontWeight: 800,
      letterSpacing: "-0.01em",
      margin: "0 0 6px",
    },
    subTitle: {
      margin: 0,
      color: "#64748b",
      fontSize: "12px",
    },
    searchWrap: {
      display: "flex",
      justifyContent: "flex-end",
    },
    search: {
      width: "300px",
      border: "1px solid #e5e7eb",
      borderRadius: "12px",
      padding: "10px 14px",
      background: "#fff",
      fontSize: "13px",
    },
    card: {
      background: "#ffffff",
      border: "1px solid #e5e7eb",
      borderRadius: "16px",
      boxShadow: "0 4px 16px rgba(15, 23, 42, 0.04)",
      overflow: "hidden",
    },
    loading: {
      padding: "24px",
      color: "#64748b",
    },
    table: {
      width: "100%",
      borderCollapse: "collapse",
      fontSize: "14px",
    },
    th: {
      textAlign: "left",
      fontWeight: 600,
      color: "#64748b",
      padding: "14px 18px",
      borderBottom: "1px solid #e5e7eb",
      background: "#f9fafb",
    },
    td: {
      padding: "16px 18px",
      borderBottom: "1px solid #f3f4f6",
      verticalAlign: "middle",
    },
    dateStack: {
      display: "flex",
      flexDirection: "column",
      gap: "4px",
    },
    date: { fontWeight: 600 },
    time: { fontSize: "12px", color: "#64748b" },
    driverCell: {
      display: "flex",
      alignItems: "center",
      gap: "12px",
    },
    avatar: {
      width: "36px",
      height: "36px",
      borderRadius: "50%",
      background: "#fff7ed",
      color: "#f97316",
      display: "grid",
      placeItems: "center",
      fontWeight: 700,
    },
    camion: { fontWeight: 700 },
    chauffeur: { fontSize: "12px", color: "#64748b" },
    mono: { fontFamily: "monospace", color: "#64748b" },
    badge: {
      display: "inline-flex",
      alignItems: "center",
      gap: "6px",
      padding: "6px 12px",
      borderRadius: "999px",
      fontSize: "12px",
      fontWeight: 600,
      border: "1px solid transparent",
    },
    duration: { fontWeight: 600 },
    details: { color: "#0f172a", fontWeight: 600, textDecoration: "none" },
    detailsDisabled: { color: "#94a3b8" },
    sectionTitle: {
      margin: "18px 0 10px",
      fontSize: "14px",
      fontWeight: 800,
      letterSpacing: "0.08em",
      textTransform: "uppercase",
      color: "#64748b",
    },
    sectionWrap: { display: "flex", flexDirection: "column", gap: 18 },
  };

  const badgeStyles = {
    type_porte_ouverte: {
      background: "#f2f3ff",
      color: "#5b5bd6",
      borderColor: "#e0e4ff",
    },
    type_arret_non_prevu: {
      background: "#eef7ff",
      color: "#3b82f6",
      borderColor: "#d6e7ff",
    },
    type_default: {
      background: "#f1f5f9",
      color: "#64748b",
      borderColor: "#e2e8f0",
    },
    point_noir: {
      background: "#0f172a",
      color: "#ffffff",
      borderColor: "#0f172a",
    },
    etat_nouveau: {
      background: "#ffe7e7",
      color: "#f97316",
      borderColor: "#ffd1d1",
    },
    etat_en_cours: {
      background: "#e0f2fe",
      color: "#2563eb",
      borderColor: "#cfe8ff",
    },
    etat_active: {
      background: "#e0f2fe",
      color: "#2563eb",
      borderColor: "#cfe8ff",
    },
    etat_appel_termine: {
      background: "#fff3d5",
      color: "#f59e0b",
      borderColor: "#ffe6b3",
    },
    etat_ended: {
      background: "#fff3d5",
      color: "#f59e0b",
      borderColor: "#ffe6b3",
    },
    etat_missed: {
      background: "#f1f5f9",
      color: "#64748b",
      borderColor: "#e2e8f0",
    },
    etat_canceled: {
      background: "#f1f5f9",
      color: "#64748b",
      borderColor: "#e2e8f0",
    },
    lue: { background: "#ecfdf5", color: "#059669", borderColor: "#a7f3d0" },
    non_lue: {
      background: "#fffbeb",
      color: "#d97706",
      borderColor: "#fde68a",
    },
  };

  const renderTable = (tableRows) => (
    <div style={ui.card}>
      {loading ? (
        <p style={ui.loading}>Chargement...</p>
      ) : (
        <table style={ui.table}>
          <thead>
            <tr>
              <th style={ui.th}>Date detection</th>
              <th style={ui.th}>Heure detection</th>
              <th style={ui.th}>Camion / Chauffeur</th>
              <th style={ui.th}>N° Chauffeur</th>
              <th style={ui.th}>Type</th>
              <th style={ui.th}>Etat</th>
              <th style={ui.th}>Heure appel</th>
              <th style={ui.th}>Duree</th>
              <th style={{ ...ui.th, textAlign: "center" }}>Lecture</th>
              <th style={ui.th}>Detail</th>
            </tr>
          </thead>
          <tbody>
            {tableRows.map((r) => {
              const sid =
                r.session_id && r.session_id !== "null" ? r.session_id : "";
              const det = formatDateTime(r.ts_detection || r.date_appel);
              const call = formatDateTime(r.date_appel);
              const typeLabel = getTypeLabel(r.type_nc);
              const etatLabel = getEtatLabel(r.etat_appel, r.statut);
              const typeStyle =
                badgeStyles[`type_${r.type_nc || "default"}`] ||
                badgeStyles.type_default;
              const etatKey = `etat_${r.etat_appel || r.statut || "default"}`;
              const etatStyle =
                badgeStyles[etatKey] || badgeStyles.type_default;
              const sourceTable = r.source_table_2 || r.source_table || "";
              const sourceId = r.source_id_2 || r.source_id || "";
              const sourceKey = buildSourceKey(sourceTable, sourceId);
              const pointNoirInfo = sourceKey
                ? pointNoirMap.get(sourceKey)
                : null;
              const isPointNoir = Boolean(pointNoirInfo);
              return (
                <tr key={r.id}>
                  <td style={ui.td}>
                    <div style={ui.date}>{det.date}</div>
                  </td>
                  <td style={ui.td}>
                    <div style={ui.time}>{det.time || "—"}</div>
                  </td>
                  <td style={ui.td}>
                    <div style={ui.driverCell}>
                      <div style={ui.avatar}>
                        {(r.nom_chauffeur || "NA").slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div style={ui.camion}>{r.camion_id || "—"}</div>
                        <div style={ui.chauffeur}>{r.nom_chauffeur || "—"}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ ...ui.td, ...ui.mono }}>
                    {r.numero_tel || "—"}
                  </td>
                  <td style={ui.td}>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      <span style={{ ...ui.badge, ...typeStyle }}>
                        {typeLabel}
                      </span>
                      {isPointNoir && (
                        <span
                          style={{ ...ui.badge, ...badgeStyles.point_noir }}
                        >
                          Point noir
                        </span>
                      )}
                    </div>
                  </td>
                  <td style={ui.td}>
                    <span style={{ ...ui.badge, ...etatStyle }}>
                      {etatLabel}
                    </span>
                  </td>
                  <td style={ui.td}>
                    <div style={ui.time}>{call.time || "—"}</div>
                  </td>
                  <td style={ui.td}>
                    <div style={ui.duration}>{formatDuration(r.duree_s)}</div>
                  </td>
                  <td style={{ ...ui.td, textAlign: "center" }}>
                    {sid && readSessions.has(sid) ? (
                      <span
                        style={{
                          ...ui.badge,
                          ...badgeStyles.lue,
                          cursor: "default",
                        }}
                      >
                        ✉️ Lue
                      </span>
                    ) : (
                      <span
                        style={{
                          ...ui.badge,
                          ...badgeStyles.non_lue,
                          cursor: sid ? "pointer" : "default",
                        }}
                        onClick={() => sid && handleMarquerLue(r)}
                        title={
                          sid
                            ? "Cliquez pour marquer comme lue"
                            : "Session non disponible"
                        }
                      >
                        ✉️ Non lue
                      </span>
                    )}
                  </td>
                  <td style={ui.td}>
                    {sid ? (
                      <Link style={ui.details} href={`/appels/${sid}`}>
                        Details
                      </Link>
                    ) : (
                      <span style={ui.detailsDisabled}>Details</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );

  return (
    <div style={ui.page}>
      <div className="grid gap-4 md:grid-cols-3" style={{ marginBottom: 18 }}>
        {statsCards.map((card) => (
          <StatCard key={card.title} {...card} />
        ))}
      </div>

      <div
        className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm"
        style={{ marginBottom: 18 }}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-base font-black uppercase tracking-wide text-gray-900">
            Filtres
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={handleReinitialiser}
              className="rounded-xl border border-gray-200 px-3 py-2 text-xs font-bold text-gray-600 hover:bg-gray-50"
            >
              Réinitialiser
            </button>

            <button
              onClick={handleAppliquer}
              disabled={loading}
              className={`rounded-xl px-4 py-2 text-xs font-bold text-white transition-colors ${
                loading
                  ? "bg-orange-300 cursor-not-allowed"
                  : "bg-orange-500 hover:bg-orange-600"
              }`}
            >
              {loading ? "Chargement..." : "Appliquer"}
            </button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <label className="space-y-1.5 xl:col-span-1">
            <span className="text-xs font-semibold text-gray-500">Début</span>
            <input
              type="date"
              value={filterDebut}
              onChange={(e) => setFilterDebut(e.target.value)}
              className="rounded-xl border border-gray-200 px-3 py-2 text-sm bg-white w-full"
            />
          </label>

          <label className="space-y-1.5 xl:col-span-1">
            <span className="text-xs font-semibold text-gray-500">Fin</span>
            <input
              type="date"
              value={filterFin}
              onChange={(e) => setFilterFin(e.target.value)}
              className="rounded-xl border border-gray-200 px-3 py-2 text-sm bg-white w-full"
            />
          </label>

          <label className="space-y-1.5 xl:col-span-1">
            <span className="text-xs font-semibold text-gray-500">Camion</span>
            <select
              value={filterCamion}
              onChange={(e) => setFilterCamion(e.target.value)}
              className="rounded-xl border border-gray-200 px-3 py-2 text-sm bg-white w-full"
            >
              <option value="">Tous</option>
              {camionOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1.5 xl:col-span-1">
            <span className="text-xs font-semibold text-gray-500">
              Chauffeur
            </span>
            <select
              value={filterChauffeur}
              onChange={(e) => setFilterChauffeur(e.target.value)}
              className="rounded-xl border border-gray-200 px-3 py-2 text-sm bg-white w-full"
            >
              <option value="">Tous</option>
              {chauffeurOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1.5 xl:col-span-1">
            <span className="text-xs font-semibold text-gray-500">
              Direction
            </span>
            <select
              value={filterCallMode}
              onChange={(e) => setFilterCallMode(e.target.value)}
              className="rounded-xl border border-gray-200 px-3 py-2 text-sm bg-white w-full"
            >
              <option value="all">Tous</option>
              <option value="entrant">Entrant</option>
              <option value="sortant">Sortant</option>
            </select>
          </label>

          <label className="space-y-1.5 xl:col-span-1">
            <span className="text-xs font-semibold text-gray-500">
              Type d&apos;appel
            </span>
            <select
              value={filterCallType}
              onChange={(e) => setFilterCallType(e.target.value)}
              className="rounded-xl border border-gray-200 px-3 py-2 text-sm bg-white w-full"
            >
              <option value="all">Tous</option>
              <option value="chute_carburant">Chute carburant</option>
              <option value="arret_et_chute_carburant">
                Arret et chute carburant
              </option>
              <option value="arret_non_prevu">Arret</option>
              <option value="arret_et_porte_ouverte">
                Arret et porte ouverte
              </option>
            </select>
          </label>
        </div>
      </div>

      <div style={ui.sectionWrap}>
        {(appliedFilters.callMode === "all" ||
          appliedFilters.callMode === "sortant") && (
          <div>
            <div style={ui.sectionTitle}>Appels sortants</div>
            {renderTable(outgoingRows)}
          </div>
        )}
        {(appliedFilters.callMode === "all" ||
          appliedFilters.callMode === "entrant") && (
          <div>
            <div style={ui.sectionTitle}>Appels entrants</div>
            {renderTable(incomingRows)}
          </div>
        )}
      </div>
    </div>
  );
}
