'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { FiSearch, FiMapPin, FiArrowLeft, FiBarChart2, FiList, FiCalendar, FiClock, FiUser, FiTruck } from 'react-icons/fi';
import { FaGasPump, FaTachometerAlt, FaThermometerHalf, FaRoad, FaWarehouse, FaUserTie, FaParking, FaExclamationTriangle } from 'react-icons/fa';
import { camionsAPI } from '@/services/api';
import { useMapContext } from '@/context/MapContext';
import { reverseGeocode } from '@/services/geocoding';

const createIcon = (color, letter) => {
    if (typeof window === 'undefined') return null;
    const L = require('leaflet');
    return L.divIcon({
        className: 'custom-marker',
        html: `
      <div style="
        width: 32px; height: 32px;
        background: ${color};
        border: 3px solid white;
        border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        color: white; font-weight: bold; font-size: 13px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      ">${letter}</div>
    `,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
        popupAnchor: [0, -20],
    });
};

const statusConfig = {
    en_route: { label: 'En route', color: '#22c55e', badgeBg: '#dcfce7', badgeText: '#16a34a' },
    arrete: { label: 'Arrêté', color: '#f97316', badgeBg: '#fff7ed', badgeText: '#ea580c' },
    arrete_nc: { label: 'Arrêté NC', color: '#ef4444', badgeBg: '#fef2f2', badgeText: '#dc2626' },
    unknown: { label: 'Inconnu', color: '#94a3b8', badgeBg: '#f1f5f9', badgeText: '#475569' },
};

const getStatusIcon = (status) => {
    if (typeof window === 'undefined') return null;
    const cfg = statusConfig[status] || statusConfig.unknown;
    return createIcon(cfg.color, 'C');
};

/* ═══ Gantt helpers ═══ */
const segmentColors = {
    driving:        { bg: '#22c55e', label: 'En route',         text: 'white',   icon: FiTruck },
    stop:           { bg: '#f59e0b', label: 'Arrêt',            text: 'white',   icon: FaParking },
    stop_long:      { bg: '#ef4444', label: 'Non conforme',     text: 'white',   icon: FaExclamationTriangle },
    client:         { bg: '#8b5cf6', label: 'Client',           text: 'white',   icon: FaUserTie },
    depot:          { bg: '#06b6d4', label: 'Dépôt',            text: 'white',   icon: FaWarehouse },
    ravitaillement: { bg: '#f97316', label: 'Ravitaillement',   text: 'white',   icon: FaGasPump },
    inactive:       { bg: '#cbd5e1', label: 'Inactif',          text: '#64748b', icon: null },
};



const fmtTime = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const fmtDuration = (start, end) => {
    const ms = new Date(end) - new Date(start);
    const mins = Math.round(ms / 60000);
    if (mins < 60) return `${mins}min`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}h${m > 0 ? String(m).padStart(2, '0') : ''}`;
};

/* ═══ GANTT BAR COMPONENT ═══ */
const GanttBar = ({ data, hoveredSegment, setHoveredSegment, onClickCamion }) => {
    const dayStart = useMemo(() => {
        if (!data.segments?.length) return 0;
        const d = new Date(data.segments[0]?.start);
        return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    }, [data.segments]);
    const dayMs = 24 * 60 * 60 * 1000;

    return (
        <div className="flex items-stretch gap-0 cursor-pointer" onClick={() => onClickCamion?.(data.camion)}>
            {/* Left column — camion + chauffeur + clients list */}
            <div className="w-[260px] flex-shrink-0 pr-3 py-2 border-r border-gray-100 pl-2">
                {/* Camion + Voyage */}
                <div className="flex items-center gap-1.5">
                    <FiTruck className="text-orange-500 text-[12px] flex-shrink-0" />
                    <span className="font-extrabold text-[13px] text-gray-800 leading-tight">{data.camion}</span>
                    <span className="px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[9px] font-bold">V{data.voycle}</span>
                </div>
                {/* Chauffeur */}
                <div className="flex items-center gap-1 text-xs text-gray-500 mt-0.5">
                    <FiUser className="text-gray-400 text-[10px] flex-shrink-0" />
                    <span className="truncate">{data.chauffeur || '—'}</span>
                    {data.heureDep && (
                        <span className="text-[9px] text-blue-400 ml-auto">{data.heureDep}{data.heureFin ? ` → ${data.heureFin}` : ''}</span>
                    )}
                </div>
                {/* Clients list */}
                <div className="mt-1 space-y-0.5">
                    {(data.clients || []).map((c, ci) => (
                        <div key={ci} className="flex items-center gap-1">
                            <span className="w-4 h-4 rounded-full bg-purple-100 text-purple-700 text-[8px] font-bold flex items-center justify-center flex-shrink-0">
                                {c.ordre || ci + 1}
                            </span>
                            <FaUserTie className="text-purple-400 text-[8px] flex-shrink-0" />
                            <span className="text-[11px] font-medium text-gray-700 truncate" title={c.client}>{c.client}</span>
                            {c.code && c.code !== '—' && (
                                <span className="text-[8px] text-gray-400 font-mono">{c.code}</span>
                            )}
                            {c.region && c.region !== '—' && (
                                <span className="text-[8px] text-orange-400 truncate">{c.region}</span>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Bar */}
            <div className="flex-1 h-[42px] bg-[#d1dce8] rounded-md relative overflow-hidden mx-1 self-center">
                {data.hasData && data.segments?.map((seg, i) => {
                    const start = new Date(seg.start).getTime();
                    const end = new Date(seg.end).getTime();
                    const leftPct = ((start - dayStart) / dayMs) * 100;
                    const widthPct = Math.max(((end - start) / dayMs) * 100, 0.2);
                    const segColor = segmentColors[seg.type] || segmentColors.inactive;
                    const isHovered = hoveredSegment === `${data.camion}-${i}`;
                    const duration = fmtDuration(seg.start, seg.end);
                    const showLabel = widthPct > 3;

                    const SegIcon = segColor.icon;
                    const showIcon = widthPct > 2 && SegIcon && seg.type !== 'driving';

                    return (
                        <div key={i}
                            className="absolute top-0 h-full flex items-center justify-center gap-0.5 transition-all duration-100 group/seg"
                            style={{
                                left: `${Math.max(0, Math.min(100, leftPct))}%`,
                                width: `${Math.min(widthPct, 100 - Math.max(0, leftPct))}%`,
                                background: segColor.bg,
                                zIndex: isHovered ? 20 : (seg.type === 'inactive' ? 0 : 1),
                                borderRadius: '4px',
                            }}
                            onMouseEnter={() => setHoveredSegment(`${data.camion}-${i}`)}
                            onMouseLeave={() => setHoveredSegment(null)}
                        >
                            {showIcon && <SegIcon className="text-[11px] drop-shadow-sm" style={{ color: segColor.text || 'white' }} />}
                            {showLabel && (
                                <span className="text-[10px] font-bold drop-shadow-sm select-none" style={{ color: segColor.text || 'white' }}>
                                    {duration}
                                </span>
                            )}

                            {/* Hover tooltip */}
                            {isHovered && (
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 bg-white rounded-xl shadow-xl border border-gray-200 px-4 py-3 text-left min-w-[240px] pointer-events-none"
                                    style={{ whiteSpace: 'nowrap' }}>
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="w-3.5 h-3.5 rounded-sm flex-shrink-0 flex items-center justify-center" style={{ background: segColor.bg }}>
                                            {SegIcon && <SegIcon className="text-[9px] text-white" />}
                                        </span>
                                        <span className="font-bold text-gray-700 text-sm">{segColor.label}</span>
                                    </div>
                                    <p className="text-gray-500 text-xs">{data.camion} · {data.chauffeur}</p>
                                    <p className="text-gray-500 text-xs mt-1 flex items-center gap-1">
                                        <FiClock className="text-gray-400" />
                                        {fmtTime(seg.start)} → {fmtTime(seg.end)} ({duration})
                                    </p>
                                    {seg.duration > 0 && seg.type !== 'driving' && seg.type !== 'inactive' && (
                                        <p className="text-gray-600 text-xs mt-1 font-semibold">⏱ Durée arrêt : {seg.duration >= 60 ? `${Math.floor(seg.duration/60)}h${seg.duration%60 > 0 ? String(seg.duration%60).padStart(2,'0') : ''}` : `${seg.duration}min`}</p>
                                    )}
                                    {seg.poiName && (
                                        <p className="text-indigo-600 text-xs mt-1 font-semibold">📌 {seg.poiName}{seg.distance != null ? ` (${seg.distance}m)` : ''}</p>
                                    )}
                                    {seg.conforme != null && seg.type !== 'driving' && seg.type !== 'inactive' && (
                                        <p className={`text-xs mt-0.5 font-bold ${seg.conforme ? 'text-green-600' : 'text-red-500'}`}>
                                            {seg.conforme ? '✅ Conforme' : '⚠️ Non conforme'}
                                        </p>
                                    )}
                                    {seg.address && seg.address !== '—' && (
                                        <p className="text-gray-400 text-[10px] mt-1">📍 {seg.address}</p>
                                    )}
                                    <p className="text-orange-400 text-[10px] mt-1.5 font-medium">Cliquez pour les détails</p>
                                </div>
                            )}
                        </div>
                    );
                })}
                {!data.hasData && (
                    <div className="absolute inset-0 flex items-center justify-center text-[10px] text-gray-400">Pas de données GPS</div>
                )}
            </div>
        </div>
    );
};

/* ═══ MAIN COMPONENT ═══ */
const Camions = () => {
    const { setMapData, setPolylines, setFlyTo } = useMapContext();
    const [camions, setCamions] = useState([]);
    const [addresses, setAddresses] = useState(new Map());
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [search, setSearch] = useState('');
    const [selectedCamionPlaque, setSelectedCamionPlaque] = useState(null);
    const [trajet, setTrajet] = useState([]);

    // Gantt state
    const [viewMode, setViewMode] = useState('list'); // 'list' | 'gantt'
    const [ganttData, setGanttData] = useState([]);
    const [ganttDate, setGanttDate] = useState(new Date().toISOString().split('T')[0]);
    const [ganttLoading, setGanttLoading] = useState(false);
    const [hoveredSegment, setHoveredSegment] = useState(null);
    const [ganttSearch, setGanttSearch] = useState('');

    const loadCamions = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await camionsAPI.getCamions();
            const camionsData = response.data || [];
            setCamions(camionsData);

            const addressPromises = camionsData
                .filter((c) => c.lat != null && c.lng != null)
                .map(async (camion) => {
                    const address = await reverseGeocode(camion.lat, camion.lng);
                    return { plaque: camion.plaque, address };
                });

            const addressResults = await Promise.all(addressPromises);
            const newAddresses = new Map(addressResults.map(({ plaque, address }) => [plaque, address]));
            setAddresses(newAddresses);

            const markers = camionsData
                .filter((c) => c.lat != null && c.lng != null)
                .map((camion) => {
                    const config = statusConfig[camion.statut] || statusConfig.unknown;
                    return {
                        id: camion.plaque,
                        lat: camion.lat,
                        lng: camion.lng,
                        icon: getStatusIcon(camion.statut),
                        label: camion.plaque,
                        sublabel: camion.chauffeur || '—',
                        info: `📍 ${newAddresses.get(camion.plaque) || camion.localisation || '—'} · ${camion.vitesse ?? 0} km/h`,
                        badgeLabel: config.label,
                        badgeColor: config.color,
                    };
                });

            setMapData({ markers, polylines: [], flyTo: null, selectedMarkerId: null });
        } catch (err) {
            setError(err.message || 'Impossible de charger les camions');
            setCamions([]);
        } finally {
            setLoading(false);
        }
    }, [setMapData]);

    useEffect(() => {
        loadCamions();
    }, [loadCamions]);

    /* ── Gantt data loader ── */
    const loadGantt = useCallback(async (date) => {
        setGanttLoading(true);
        try {
            const res = await camionsAPI.getGantt(date);
            if (res.success) setGanttData(res.data || []);
        } catch (err) {
            console.error('Erreur Gantt:', err);
            setGanttData([]);
        } finally {
            setGanttLoading(false);
        }
    }, []);

    useEffect(() => {
        if (viewMode === 'gantt') loadGantt(ganttDate);
    }, [viewMode, ganttDate, loadGantt]);

    // Group gantt data by voyage (PLAMOTI + VOYCLE) — no longer needed, controller already groups
    const filteredGantt = useMemo(() => {
        const q = ganttSearch.toLowerCase().trim();
        if (!q) return ganttData;
        return ganttData.filter(d =>
            d.camion?.toLowerCase().includes(q) ||
            d.chauffeur?.toLowerCase().includes(q) ||
            String(d.voycle || '').includes(q) ||
            d.clients?.some(c => c.client?.toLowerCase().includes(q) || c.code?.toLowerCase().includes(q) || c.region?.toLowerCase().includes(q))
        );
    }, [ganttData, ganttSearch]);

    const ganttStats = useMemo(() => {
        const uniqueCamions = new Set(ganttData.map(d => d.camion));
        const totalClients = ganttData.reduce((s, d) => s + (d.nbClients || 0), 0);
        const active = ganttData.filter(d => d.hasData);
        return {
            totalClients,
            totalVoyages: ganttData.length,
            totalCamions: uniqueCamions.size,
            activeCamions: active.length,
        };
    }, [ganttData]);

    const loadTrajet = useCallback(async (plaque) => {
        if (!plaque) {
            setTrajet([]);
            setPolylines([]);
            return;
        }
        try {
            const response = await camionsAPI.getCamionTrajet(plaque);
            const trajetData = response.data || [];
            setTrajet(trajetData);

            if (trajetData.length > 0) {
                setPolylines([{
                    positions: trajetData,
                    color: '#3b82f6',
                    weight: 4,
                    opacity: 0.8,
                }]);
            } else {
                setPolylines([]);
            }
        } catch {
            setTrajet([]);
            setPolylines([]);
        }
    }, [setPolylines]);

    const filteredCamions = camions.filter(
        (c) =>
            String(c.plaque || '').toLowerCase().includes(search.toLowerCase()) ||
            String(c.chauffeur || '').toLowerCase().includes(search.toLowerCase()) ||
            String(c.localisation || '').toLowerCase().includes(search.toLowerCase())
    );

    const selectedCamion = camions.find((c) => c.plaque === selectedCamionPlaque);

    const handleSelectCamion = async (camion) => {
        setSelectedCamionPlaque(camion.plaque);

        if (camion.lat != null && camion.lng != null) {
            if (!addresses.has(camion.plaque)) {
                const address = await reverseGeocode(camion.lat, camion.lng);
                setAddresses((prev) => new Map(prev).set(camion.plaque, address));
            }
            setFlyTo([camion.lat, camion.lng]);
        } else {
            setFlyTo(null);
        }

        loadTrajet(camion.plaque);
    };

    const handleBackToList = () => {
        setSelectedCamionPlaque(null);
        setFlyTo(null);
        setTrajet([]);
        setPolylines([]);
    };

    /* ═══ hours axis for gantt ═══ */
    const hours = Array.from({ length: 25 }, (_, i) => i);

    return (
        <div className="flex h-full">
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

                {/* ── View mode toggle ── */}
                <div className="flex items-center justify-between px-4 pt-4 pb-2 border-b border-gray-100 bg-white">
                    <h2 className="text-xl font-bold text-gray-800">Camions</h2>
                    <div className="flex bg-gray-100 p-1 rounded-xl">
                        <button onClick={() => { setViewMode('list'); setSelectedCamionPlaque(null); }}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all inline-flex items-center gap-1.5 ${viewMode === 'list' ? 'bg-white text-orange-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                            <FiList className="text-sm" /> Liste
                        </button>
                        <button onClick={() => setViewMode('gantt')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all inline-flex items-center gap-1.5 ${viewMode === 'gantt' ? 'bg-white text-orange-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                            <FiBarChart2 className="text-sm" /> Gantt
                        </button>
                    </div>
                </div>

                {loading && viewMode === 'list' && (
                    <div className="p-6 text-center text-gray-500">Chargement des camions…</div>
                )}
                {error && !loading && viewMode === 'list' && (
                    <div className="p-4 mx-4 mt-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                        {error}
                        <button type="button" onClick={loadCamions} className="block mt-2 text-orange-600 font-medium hover:underline">Réessayer</button>
                    </div>
                )}

                {/* ═══ GANTT VIEW ═══ */}
                {viewMode === 'gantt' && (
                    <div className="flex-1 overflow-y-auto px-4 py-3">
                        {/* Hint */}
                        <p className="text-sm text-gray-400 mb-3">Cliquez sur un camion pour voir son trajet →</p>

                        {/* Legend */}
                        <div className="flex items-center gap-5 mb-4 text-xs">
                            {Object.entries(segmentColors).map(([key, val]) => (
                                <div key={key} className="flex items-center gap-1.5">
                                    <span className="w-3.5 h-3.5 rounded-full inline-block" style={{ background: val.bg }} />
                                    <span className="text-gray-600 font-medium">{val.label}</span>
                                </div>
                            ))}
                        </div>

                        {/* Gantt toolbar */}
                        <div className="flex flex-wrap items-center gap-3 mb-4">
                            <div className="flex items-center gap-2">
                                <FiCalendar className="text-gray-400" />
                                <input type="date" value={ganttDate} onChange={e => setGanttDate(e.target.value)}
                                    className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 font-medium" />
                            </div>
                            <div className="relative flex-1 max-w-xs">
                                <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input type="text" value={ganttSearch} onChange={e => setGanttSearch(e.target.value)}
                                    placeholder="Rechercher camion, chauffeur, client..."
                                    className="w-full pl-10 pr-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
                            </div>
                            <div className="flex items-center gap-2 ml-auto">
                                <span className="px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-bold border border-blue-200">
                                    {ganttStats.totalVoyages} trajet{ganttStats.totalVoyages > 1 ? 's' : ''}
                                </span>
                                <span className="px-3 py-1 rounded-full bg-purple-50 text-purple-700 text-xs font-bold border border-purple-200">
                                    {ganttStats.totalClients} client{ganttStats.totalClients > 1 ? 's' : ''}
                                </span>
                                <span className="px-3 py-1 rounded-full bg-green-50 text-green-700 text-xs font-bold border border-green-200">
                                    {ganttStats.totalCamions} camion{ganttStats.totalCamions > 1 ? 's' : ''}
                                </span>
                            </div>
                        </div>

                        {ganttLoading ? (
                            <div className="flex justify-center py-20">
                                <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
                            </div>
                        ) : (
                            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                                {/* Time axis header */}
                                <div className="flex items-center border-b border-gray-200 bg-gray-50">
                                    <div className="w-[260px] flex-shrink-0 px-3 py-2 text-[11px] font-bold text-gray-500 uppercase tracking-wider border-r border-gray-100">TRAJET / CLIENTS</div>
                                    <div className="flex-1 relative h-8 mx-1">
                                        {hours.map(h => (
                                            <div key={h} className="absolute top-0 h-full"
                                                style={{ left: `${(h / 24) * 100}%` }}>
                                                <div className="h-full border-l border-gray-200" />
                                                <span className="absolute top-1.5 left-1 text-[10px] text-gray-400 font-semibold">
                                                    {h < 24 ? `${String(h).padStart(2, '0')}:00` : ''}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Rows — one per voyage */}
                                <div className="divide-y divide-gray-100">
                                    {filteredGantt.map((d, i) => (
                                        <div key={d.id || `${d.camion}-${d.voycle}-${i}`} className="px-2 py-1 hover:bg-orange-50/20 transition-colors relative">
                                            <GanttBar data={d} hoveredSegment={hoveredSegment} setHoveredSegment={setHoveredSegment}
                                                onClickCamion={(plaque) => {
                                                    const cam = camions.find(c => c.plaque === plaque);
                                                    if (cam) { setViewMode('list'); handleSelectCamion(cam); }
                                                }} />
                                        </div>
                                    ))}
                                </div>

                                {filteredGantt.length === 0 && !ganttLoading && (
                                    <div className="py-16 text-center text-gray-400">
                                        <FiBarChart2 className="text-4xl mx-auto mb-2 text-gray-200" />
                                        <p className="font-medium">Aucune donnée pour cette date</p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* ═══ LIST VIEW ═══ */}
                {viewMode === 'list' && !loading && selectedCamion ? (
                    <div className="flex-1 overflow-y-auto">
                        <div className="px-4 pt-4 pb-2">
                            <button
                                onClick={handleBackToList}
                                className="flex items-center gap-2 text-orange-500 hover:text-orange-600 text-sm font-medium transition-colors cursor-pointer"
                            >
                                <FiArrowLeft className="text-base" />
                                Retour à la liste
                            </button>
                        </div>

                        <div className="px-5 pb-4">
                            <div className="flex items-center justify-between">
                                <h2 className="text-xl font-bold text-gray-800">{selectedCamion.plaque}</h2>
                                <span
                                    className="px-3 py-1 rounded-full text-xs font-bold"
                                    style={{
                                        background: (statusConfig[selectedCamion.statut] || statusConfig.unknown).badgeBg,
                                        color: (statusConfig[selectedCamion.statut] || statusConfig.unknown).badgeText,
                                        border: `1.5px solid ${(statusConfig[selectedCamion.statut] || statusConfig.unknown).color}`
                                    }}
                                >
                                    {(statusConfig[selectedCamion.statut] || statusConfig.unknown).label}
                                </span>
                            </div>
                        </div>

                        <div className="mx-5 mb-4 bg-gray-50 rounded-xl p-4 border border-gray-100">
                            <table className="w-full text-sm">
                                <tbody>
                                    <tr className="border-b border-gray-100">
                                        <td className="py-2 text-gray-500 font-medium">Chauffeur</td>
                                        <td className="py-2 text-right text-gray-800 font-semibold">{selectedCamion.chauffeur}</td>
                                    </tr>
                                    <tr className="border-b border-gray-100">
                                        <td className="py-2 text-gray-500 font-medium">Téléphone</td>
                                        <td className="py-2 text-right text-gray-800 font-semibold">{selectedCamion.telephone}</td>
                                    </tr>
                                    <tr className="border-b border-gray-100">
                                        <td className="py-2 text-gray-500 font-medium">Position</td>
                                        <td className="py-2 text-right text-gray-800 font-semibold">
                                            {selectedCamion.lat != null && selectedCamion.lng != null
                                                ? (addresses.get(selectedCamion.plaque) || selectedCamion.localisation || `${selectedCamion.lat.toFixed(4)}, ${selectedCamion.lng.toFixed(4)}`)
                                                : (selectedCamion.localisation || '—')}
                                        </td>
                                    </tr>
                                    <tr>
                                        <td className="py-2 text-gray-500 font-medium">Dernière MAJ</td>
                                        <td className="py-2 text-right text-gray-800 font-semibold">{selectedCamion.derniereMaj}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        <div className="mx-5 mb-4 grid grid-cols-2 gap-3">
                            <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 text-center">
                                <FaTachometerAlt className="mx-auto text-2xl text-gray-400 mb-2" />
                                <p className="text-xs text-gray-500 mb-1">Vitesse</p>
                                <p className="text-xl font-bold text-gray-800">{selectedCamion.vitesse ?? '—'} <span className="text-sm font-normal text-gray-500">km/h</span></p>
                            </div>
                            <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 text-center">
                                <FaRoad className="mx-auto text-2xl text-orange-400 mb-2" />
                                <p className="text-xs text-orange-500 mb-1">Kilométrage</p>
                                <p className="text-xl font-bold text-orange-500">{(selectedCamion.kilometrage ?? 0).toLocaleString()} <span className="text-sm font-normal text-gray-500">km</span></p>
                            </div>
                            <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 text-center">
                                <FaGasPump className="mx-auto text-2xl text-gray-400 mb-2" />
                                <p className="text-xs text-gray-500 mb-1">Carburant</p>
                                <p className="text-xl font-bold text-gray-800">{selectedCamion.carburant != null ? `${selectedCamion.carburant}%` : '—'}</p>
                            </div>
                            <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 text-center">
                                <FaThermometerHalf className="mx-auto text-2xl text-gray-400 mb-2" />
                                <p className="text-xs text-gray-500 mb-1">Temp. moteur</p>
                                <p className="text-xl font-bold text-gray-800">{selectedCamion.tempMoteur != null ? `${selectedCamion.tempMoteur}°C` : '—'}</p>
                            </div>
                        </div>

                        <div className="mx-5 mb-5 bg-gray-50 rounded-xl p-4 border border-gray-100">
                            <h3 className="text-sm font-bold text-gray-700 mb-3">Diagnostics</h3>
                            <div className="space-y-3 text-sm">
                                <div className="flex justify-between items-center">
                                    <span className="text-gray-500">Odomètre</span>
                                    <span className="font-semibold text-gray-800">{(selectedCamion.kilometrage ?? 0).toLocaleString()} km</span>
                                </div>
                                {selectedCamion.carburant != null && (
                                    <div>
                                        <div className="flex justify-between items-center mb-1">
                                            <span className="text-gray-500">Niveau carburant</span>
                                            <span className="font-semibold text-gray-800">{selectedCamion.carburant}%</span>
                                        </div>
                                        <div className="w-full bg-gray-200 rounded-full h-2.5">
                                            <div
                                                className="h-2.5 rounded-full transition-all duration-500"
                                                style={{
                                                    width: `${Math.min(100, selectedCamion.carburant)}%`,
                                                    background: selectedCamion.carburant > 50 ? '#22c55e' :
                                                        selectedCamion.carburant > 20 ? '#f97316' : '#ef4444'
                                                }}
                                            ></div>
                                        </div>
                                    </div>
                                )}
                                <div className="flex justify-between items-center">
                                    <span className="text-gray-500">GPS</span>
                                    <span className="font-semibold text-gray-800">
                                        {selectedCamion.lat != null && selectedCamion.lng != null
                                            ? `${selectedCamion.lat}, ${selectedCamion.lng}`
                                            : '—'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : viewMode === 'list' && !loading ? (
                    <>
                        <div className="p-4 border-b border-gray-100">
                            <div className="relative">
                                <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="Rechercher (plaque, chauffeur, position)..."
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent"
                                />
                            </div>
                            <p className="text-sm text-gray-400 mt-2">{filteredCamions.length} camion{filteredCamions.length !== 1 ? 's' : ''}</p>
                        </div>

                        <div className="flex-1 overflow-y-auto">
                            {!loading && filteredCamions.length === 0 && (
                                <div className="p-4 text-center text-gray-500 text-sm">Aucun camion à afficher.</div>
                            )}
                            {filteredCamions.map((camion) => {
                                const config = statusConfig[camion.statut] || statusConfig.unknown;
                                return (
                                    <div
                                        key={camion.plaque}
                                        onClick={() => handleSelectCamion(camion)}
                                        className="px-4 py-3 border-b border-gray-50 cursor-pointer transition-all hover:bg-orange-50"
                                    >
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="font-bold text-gray-800 text-sm">{camion.plaque}</span>
                                            <span
                                                className="px-2.5 py-0.5 rounded-full text-xs font-semibold"
                                                style={{
                                                    background: config.badgeBg,
                                                    color: config.badgeText,
                                                    border: `1px solid ${config.color}`
                                                }}
                                            >
                                                {config.label}
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm text-orange-500">{camion.chauffeur}</span>
                                            <span className="text-sm text-gray-400">{camion.vitesse} km/h</span>
                                        </div>
                                        <div className="flex items-center gap-1 mt-1">
                                            <FiMapPin className="text-gray-400 text-xs" />
                                            <span className="text-xs text-gray-400">
                                                {camion.lat != null && camion.lng != null
                                                    ? (addresses.get(camion.plaque) || camion.localisation || `${camion.lat.toFixed(4)}, ${camion.lng.toFixed(4)}`)
                                                    : (camion.localisation || '—')}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </>
                ) : null}
            </div>
        </div>
    );
};

export default Camions;
