'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import {
    FiAlertTriangle,
    FiCheckCircle,
    FiDownload,
    FiDroplet,
    FiFilter,
    FiMapPin,
    FiTruck,
    FiUser,
    FiX,
    FiXCircle,
} from 'react-icons/fi';
import {
    BarChart, Bar,
    CartesianGrid,
    Line,
    LineChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import { carburantAPI } from '@/services/api';
import dynamic from 'next/dynamic';

/* ── Leaflet dynamic imports (SSR-safe) ── */
const MapContainer = dynamic(() => import('react-leaflet').then(m => m.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then(m => m.TileLayer), { ssr: false });
const Marker = dynamic(() => import('react-leaflet').then(m => m.Marker), { ssr: false });
const Popup = dynamic(() => import('react-leaflet').then(m => m.Popup), { ssr: false });

/* ── Map helper: fly to position ── */
const FlyToPoint = ({ position }) => {
    if (typeof window === 'undefined') return null;
    const { useMap } = require('react-leaflet');
    const map = useMap();
    useEffect(() => {
        if (position) map.flyTo(position, 15, { duration: 0.8 });
    }, [position, map]);
    return null;
};

const createTruckIcon = () => {
    if (typeof window === 'undefined') return null;
    const L = require('leaflet');
    return L.divIcon({
        className: 'custom-marker',
        html: `<div style="width:32px;height:32px;background:#f97316;border:3px solid white;border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-size:16px;box-shadow:0 3px 8px rgba(0,0,0,0.3);">🚛</div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
        popupAnchor: [0, -16],
    });
};

/* ───────────── helpers ───────────── */

const statusPill = {
    conforme: 'bg-emerald-100 text-emerald-700',
    avertissement: 'bg-amber-100 text-amber-700',
    depassement: 'bg-red-100 text-red-700',
};

const statusRowBg = {
    conforme: '#f6fffa',
    avertissement: '#fffaf2',
    depassement: '#fff5f5',
};

const statusLabel = {
    conforme: 'Conforme',
    avertissement: 'Avertissement',
    depassement: 'Dépassement',
};

const statusIcon = {
    conforme: FiCheckCircle,
    avertissement: FiAlertTriangle,
    depassement: FiXCircle,
};

const fmtDate = (d) => {
    if (!d) return '—';
    const dt = new Date(d);
    return dt.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const fmtDateISO = (d) => {
    if (!d) return '';
    return new Date(d).toISOString().split('T')[0];
};

const getWeekNumber = (date) => {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
};

/* ───────────── composant ───────────── */

export default function CarburantPage() {
    /* ── state ── */
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);

    // filters
    const [dateFilterMode, setDateFilterMode] = useState('day');
    const [filterDate, setFilterDate] = useState('');
    const [filterStartDate, setFilterStartDate] = useState('');
    const [filterEndDate, setFilterEndDate] = useState('');
    const [filterWeek, setFilterWeek] = useState('');
    const [filterMonth, setFilterMonth] = useState('');
    const [matricule, setMatricule] = useState('');
    const [chauffeur, setChauffeur] = useState('all');
    const [statut, setStatut] = useState('all');

    // detail modal
    const [selectedRow, setSelectedRow] = useState(null);
    const [detailData, setDetailData] = useState(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailDateMode, setDetailDateMode] = useState('day');
    const [detailDate, setDetailDate] = useState('');
    const [selectedPoint, setSelectedPoint] = useState(null);
    const [detailRows, setDetailRows] = useState([]);

    /* ── fetch données ── */
    useEffect(() => {
        const load = async () => {
            try {
                setLoading(true);
                const res = await carburantAPI.getEcarts();
                if (res.success) {
                    setRows(res.data || []);
                }
            } catch (err) {
                console.error('Erreur chargement carburant:', err);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, []);

    /* ── filtres ── */
    const filteredData = useMemo(() => {
        return rows.filter((r) => {
            const dateISO = fmtDateISO(r.date);
            const d = r.date ? new Date(r.date) : null;

            let matchDate = true;
            if (dateFilterMode === 'day' && filterDate) {
                matchDate = dateISO === filterDate;
            } else if (dateFilterMode === 'range') {
                if (filterStartDate && filterEndDate) matchDate = dateISO >= filterStartDate && dateISO <= filterEndDate;
                else if (filterStartDate) matchDate = dateISO >= filterStartDate;
                else if (filterEndDate) matchDate = dateISO <= filterEndDate;
            } else if (dateFilterMode === 'week' && filterWeek && d) {
                const [year, week] = filterWeek.split('-W').map(Number);
                matchDate = d.getFullYear() === year && getWeekNumber(d) === week;
            } else if (dateFilterMode === 'month' && filterMonth) {
                matchDate = dateISO.startsWith(filterMonth);
            }

            const m = matricule.trim().toLowerCase();
            const matchMat = m ? (r.camion || '').toLowerCase().includes(m) : true;
            const matchCh = chauffeur === 'all' ? true : r.chauffeur === chauffeur;
            const matchSt = statut === 'all' ? true : r.etat === statut;

            return matchDate && matchMat && matchCh && matchSt;
        });
    }, [rows, dateFilterMode, filterDate, filterStartDate, filterEndDate, filterWeek, filterMonth, matricule, chauffeur, statut]);

    /* ── regroup filtered par camion ── */
    const filteredGrouped = useMemo(() => {
        const map = {};
        filteredData.forEach((r) => {
            const key = (r.camion || '').trim().toUpperCase();
            if (!map[key]) {
                map[key] = {
                    camion: r.camion,
                    chauffeur: r.chauffeur,
                    records: [],
                    totalQuantiteTotale: 0,
                    totalQuantiteRavit: 0,
                    totalMontant: 0,
                    facturesCount: 0,
                };
            }
            map[key].records.push(r);
            map[key].totalQuantiteTotale += r.quantiteTotale ?? 0;
            map[key].totalQuantiteRavit += r.quantiteRavitaillement ?? 0;
            map[key].totalMontant += r.montantRavitaillement ?? 0;
            map[key].facturesCount += 1;
            if (r.chauffeur && r.chauffeur !== '—') map[key].chauffeur = r.chauffeur;
        });

        return Object.values(map).map((g) => {
            const ecartL = g.totalQuantiteTotale - g.totalQuantiteRavit;
            const ecartPct = g.totalQuantiteTotale ? ((ecartL / g.totalQuantiteTotale) * 100) : 0;
            const hasDepassement = g.records.some(r => r.etat === 'depassement');
            const hasAvertissement = g.records.some(r => r.etat === 'avertissement');
            const etat = hasDepassement ? 'depassement' : hasAvertissement ? 'avertissement' : 'conforme';
            return { ...g, ecartL: Math.round(ecartL * 10) / 10, ecartPct: Math.round(ecartPct * 10) / 10, etat };
        });
    }, [filteredData]);

    /* ── stats ── */
    const stats = useMemo(() => {
        const totalConsoL = filteredData.reduce((s, r) => s + (r.quantiteTotale ?? 0), 0);
        const totalMontant = filteredData.reduce((s, r) => s + (r.montantRavitaillement ?? 0), 0);
        const horsObj = filteredGrouped.filter(g => g.etat === 'depassement').length;
        const nbPleins = filteredData.length;
        const consoMoy = filteredData.length > 0
            ? (totalConsoL / filteredData.length)
            : 0;
        return {
            totalConsoL: Math.round(totalConsoL),
            totalMontant: Math.round(totalMontant),
            horsObj,
            nbPleins,
            consoMoy: Math.round(consoMoy * 10) / 10,
        };
    }, [filteredData, filteredGrouped]);

    /* ── chart ── */
    const chartData = useMemo(() => {
        const map = {};
        filteredData.forEach((r) => {
            const d = fmtDateISO(r.date);
            if (!d) return;
            const label = d.substring(5);
            if (!map[label]) map[label] = { date: label, conforme: 0, avertissement: 0, depassement: 0 };
            map[label][r.etat] = (map[label][r.etat] || 0) + 1;
        });
        return Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
    }, [filteredData]);

    /* ── select row → open detail modal ── */
    const handleSelectRow = async (group) => {
        setSelectedRow(group);
        setSelectedPoint(null);
        setDetailData(null);
        // Pick the most recent date from records
        const dates = group.records.map(r => r.date).filter(Boolean).sort((a, b) => new Date(b) - new Date(a));
        const firstDate = dates[0] ? new Date(dates[0]).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
        setDetailDate(firstDate);
        setDetailDateMode('day');
        // Load detail écarts
        setDetailLoading(true);
        try {
            const res = await carburantAPI.getEcartsByCamion(group.camion);
            if (res.success) setDetailRows(res.data || []);
        } catch (err) { console.error(err); }
        // Load fuel level for date
        await loadNiveauData(group.camion, firstDate);
    };

    /* ── load fuel level data for a date ── */
    const loadNiveauData = useCallback(async (camion, date) => {
        if (!camion || !date) return;
        setDetailLoading(true);
        setSelectedPoint(null);
        try {
            const res = await carburantAPI.getNiveau(camion, date);
            if (res.success) {
                setDetailData(res.data);
            }
        } catch (err) {
            console.error('Erreur chargement niveau:', err);
        } finally {
            setDetailLoading(false);
        }
    }, []);

    /* ── when detail date changes, reload ── */
    const handleDetailDateChange = (newDate) => {
        setDetailDate(newDate);
        if (selectedRow) {
            loadNiveauData(selectedRow.camion, newDate);
        }
    };

    /* ── handle chart point click ── */
    const handleChartPointClick = (data) => {
        if (data && data.activePayload && data.activePayload[0]) {
            const point = data.activePayload[0].payload;
            if (point.latitude && point.longitude) {
                setSelectedPoint(point);
            }
        }
    };

    /* ── data derived from detailData ── */
    const niveauChartData = useMemo(() => {
        if (!detailData?.niveauData?.length) return [];
        return detailData.niveauData.map(pt => ({
            ...pt,
            critique: 20,
        }));
    }, [detailData]);

    const detailStats = useMemo(() => {
        if (!detailData?.stats) return {};
        return detailData.stats;
    }, [detailData]);

    /* ── chauffeurs list ── */
    const chauffeursList = useMemo(() => {
        const set = new Set();
        rows.forEach(r => { if (r.chauffeur && r.chauffeur !== '—') set.add(r.chauffeur); });
        return [...set].sort();
    }, [rows]);

    /* ── export CSV ── */
    const handleExport = () => {
        const headers = ['Matricule', 'Chauffeur', 'Date', 'Lieu', 'Qté Totale (L)', 'Qté Ravit. (L)', 'Écart (L)', 'Montant (DT)', 'État'];
        const csvRows = [headers.join(';')];
        filteredData.forEach(r => {
            csvRows.push([
                r.camion, r.chauffeur, fmtDate(r.date), r.lieu,
                r.quantiteTotale, r.quantiteRavitaillement, r.ecart,
                r.montantRavitaillement, r.etat
            ].join(';'));
        });
        const blob = new Blob(['\uFEFF' + csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `carburant_export_${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    };

    /* ───────────── RENDER ───────────── */
    return (
        <>
            <div className="p-6 md:p-8 max-w-[1600px] mx-auto min-h-screen">
                {/* ─── Header ─── */}
                <h1 className="text-3xl font-black text-gray-900 tracking-tight mb-1">Suivi Carburant</h1>
                <p className="text-gray-400 text-sm mb-6">Analyse comparative GPS vs Ravitaillement</p>

                {/* ─── KPI Cards ─── */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
                    <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="bg-red-50 p-2.5 rounded-xl"><FiDroplet className="text-red-500 text-lg" /></div>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Consommation totale</p>
                        </div>
                        <p className="text-3xl font-black text-gray-900">{stats.totalConsoL.toLocaleString('fr-FR')}<span className="text-base font-semibold text-gray-400 ml-1">L</span></p>
                    </div>

                    <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="bg-amber-50 p-2.5 rounded-xl"><span className="text-amber-500 text-lg">💰</span></div>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Coût total</p>
                        </div>
                        <p className="text-3xl font-black text-gray-900">{stats.totalMontant.toLocaleString('fr-FR')}<span className="text-base font-semibold text-gray-400 ml-1">DT</span></p>
                    </div>

                    <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="bg-orange-50 p-2.5 rounded-xl"><FiAlertTriangle className="text-orange-500 text-lg" /></div>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Hors objectif</p>
                        </div>
                        <p className="text-3xl font-black text-gray-900">{stats.horsObj}<span className="text-base font-semibold text-gray-400 ml-1">camions</span></p>
                        {stats.horsObj > 0 && <p className="text-xs text-red-500 font-semibold mt-1">↑ dépassement</p>}
                    </div>

                    <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="bg-green-50 p-2.5 rounded-xl"><FiCheckCircle className="text-green-500 text-lg" /></div>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Pleins effectués</p>
                        </div>
                        <p className="text-3xl font-black text-gray-900">{stats.nbPleins}</p>
                    </div>

                    <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="bg-blue-50 p-2.5 rounded-xl"><FiTruck className="text-blue-500 text-lg" /></div>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Consomm. moy.</p>
                        </div>
                        <p className="text-3xl font-black text-gray-900">{stats.consoMoy}<span className="text-base font-semibold text-gray-400 ml-1">L</span></p>
                    </div>
                </div>

                {/* ─── Filtres ─── */}
                <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-6 shadow-sm flex flex-wrap items-center gap-3">
                    <div className="flex bg-gray-100 p-1 rounded-xl">
                        {[
                            { id: 'day', label: 'Jour' },
                            { id: 'range', label: 'Plage' },
                            { id: 'week', label: 'Semaine' },
                            { id: 'month', label: 'Mois' },
                        ].map((mode) => (
                            <button key={mode.id} onClick={() => setDateFilterMode(mode.id)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${dateFilterMode === mode.id ? 'bg-white text-orange-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                                {mode.label}
                            </button>
                        ))}
                    </div>

                    <div className="flex items-center gap-2">
                        {dateFilterMode === 'day' && (
                            <input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)}
                                className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all font-medium" />
                        )}
                        {dateFilterMode === 'range' && (
                            <>
                                <input type="date" value={filterStartDate} onChange={(e) => setFilterStartDate(e.target.value)}
                                    className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all font-medium" />
                                <span className="text-gray-400 font-bold text-sm">au</span>
                                <input type="date" value={filterEndDate} onChange={(e) => setFilterEndDate(e.target.value)}
                                    className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all font-medium" />
                            </>
                        )}
                        {dateFilterMode === 'week' && (
                            <input type="week" value={filterWeek} onChange={(e) => setFilterWeek(e.target.value)}
                                className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all font-medium" />
                        )}
                        {dateFilterMode === 'month' && (
                            <input type="month" value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)}
                                className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all font-medium" />
                        )}
                    </div>

                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><FiFilter className="text-gray-400" /></div>
                        <input type="text" value={matricule} onChange={(e) => setMatricule(e.target.value)} placeholder="Matricule..."
                            className="pl-10 pr-3 py-2 border border-gray-200 rounded-xl text-sm w-44 focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all" />
                    </div>

                    <select value={chauffeur} onChange={(e) => setChauffeur(e.target.value)}
                        className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 font-medium">
                        <option value="all">Tous chauffeurs</option>
                        {chauffeursList.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>

                    <select value={statut} onChange={(e) => setStatut(e.target.value)}
                        className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 font-medium">
                        <option value="all">Tous statuts</option>
                        <option value="conforme">Conforme</option>
                        <option value="avertissement">Avertissement</option>
                        <option value="depassement">Dépassement</option>
                    </select>

                    <button onClick={handleExport}
                        className="ml-auto px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 inline-flex items-center gap-2 hover:bg-gray-50 transition-all">
                        <FiDownload /> Export
                    </button>
                </div>

                {/* ─── Titre table ─── */}
                <div className="mb-3">
                    <h2 className="text-xl font-black text-gray-900">Analyse comparative carburant — Flotte complète</h2>
                    <p className="text-xs text-gray-400">GPS vs Ravitaillement · Cliquez sur une ligne pour voir le détail du camion</p>
                </div>

                {/* ─── Chart ─── */}
                <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm mb-6">
                    <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-[0.1em] mb-4">ÉCARTS PAR DATE — CONFORME / AVERTISSEMENT / DÉPASSEMENT</h3>
                    <div className="h-[180px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 600, fill: '#9ca3af' }} dy={10} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#d1d5db' }} />
                                <Tooltip cursor={{ fill: '#f9fafb' }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', fontSize: '12px' }} />
                                <Bar dataKey="conforme" name="Conforme" stackId="a" fill="#22c55e" barSize={40} />
                                <Bar dataKey="avertissement" name="Avertissement" stackId="a" fill="#f59e0b" barSize={40} />
                                <Bar dataKey="depassement" name="Dépassement" stackId="a" fill="#ef4444" radius={[4, 4, 0, 0]} barSize={40} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="flex justify-center gap-6 mt-3">
                        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-sm bg-[#22c55e]" /><span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Conforme</span></div>
                        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-sm bg-[#f59e0b]" /><span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Avertissement</span></div>
                        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-sm bg-[#ef4444]" /><span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Dépassement</span></div>
                    </div>
                </div>

                {/* ─── Tableau principal ─── */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="grid grid-cols-12 text-white text-center text-[13px] font-bold">
                        <div className="col-span-3 bg-[#141a3c] py-2.5">🚛 IDENTIFICATION</div>
                        <div className="col-span-2 bg-[#2f62d9] py-2.5">⚡ DONNÉES GPS</div>
                        <div className="col-span-3 bg-[#10956b] py-2.5">⛽ RAVITAILLEMENT (FACTURES)</div>
                        <div className="col-span-4 bg-[#d81f26] py-2.5">📊 ANALYSE ÉCARTS</div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[1100px]">
                            <thead>
                                <tr className="bg-gray-50 border-b border-gray-200 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                                    <th className="px-4 py-3">Matricule</th>
                                    <th className="px-4 py-3">Chauffeur</th>
                                    <th className="px-4 py-3">GPS (L)</th>
                                    <th className="px-4 py-3">Ravit. (L)</th>
                                    <th className="px-4 py-3">Factures</th>
                                    <th className="px-4 py-3">Montant</th>
                                    <th className="px-4 py-3">Écart (L)</th>
                                    <th className="px-4 py-3">Écart (%)</th>
                                    <th className="px-4 py-3">Statut</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredGrouped.map((g) => {
                                    const Icon = statusIcon[g.etat];
                                    return (
                                        <tr key={g.camion}
                                            onClick={() => handleSelectRow(g)}
                                            className="cursor-pointer border-b border-gray-100 hover:brightness-[0.97] transition-all"
                                            style={{ background: statusRowBg[g.etat] }}>
                                            <td className="px-4 py-3.5">
                                                <div className="font-black text-lg text-gray-800">{g.camion}</div>
                                            </td>
                                            <td className="px-4 py-3.5">
                                                <div className="flex items-center gap-2">
                                                    <FiUser className="text-gray-400" />
                                                    <span className="text-sm font-medium text-gray-600">{g.chauffeur || '—'}</span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3.5">
                                                <div className="text-2xl font-black text-gray-800">{Math.round(g.totalQuantiteTotale).toLocaleString('fr-FR')}<span className="text-xs font-semibold text-gray-400 ml-0.5">L</span></div>
                                                <div className="text-[10px] text-gray-400">📡 GPS</div>
                                            </td>
                                            <td className="px-4 py-3.5">
                                                <div className="text-2xl font-black text-gray-800">{Math.round(g.totalQuantiteRavit).toLocaleString('fr-FR')}<span className="text-xs font-semibold text-gray-400 ml-0.5">L</span></div>
                                                <div className="text-[10px] text-gray-400">⛽ Ravit.</div>
                                            </td>
                                            <td className="px-4 py-3.5">
                                                <div className="text-lg font-black text-blue-600">{g.facturesCount} <span className="text-xs font-semibold">factures</span></div>
                                            </td>
                                            <td className="px-4 py-3.5">
                                                <div className="text-lg font-bold text-gray-700">{Math.round(g.totalMontant).toLocaleString('fr-FR')} <span className="text-xs text-gray-400">DT</span></div>
                                            </td>
                                            <td className="px-4 py-3.5">
                                                <div className={`text-2xl font-black ${g.etat === 'conforme' ? 'text-emerald-600' : g.etat === 'avertissement' ? 'text-amber-600' : 'text-red-600'}`}>
                                                    {g.ecartL > 0 ? '+' : ''}{g.ecartL} L
                                                </div>
                                                <div className={`h-1.5 mt-1.5 rounded-full w-20 ${g.etat === 'conforme' ? 'bg-emerald-500' : g.etat === 'avertissement' ? 'bg-amber-500' : 'bg-red-500'}`} />
                                            </td>
                                            <td className={`px-4 py-3.5 text-2xl font-black ${g.etat === 'conforme' ? 'text-emerald-600' : g.etat === 'avertissement' ? 'text-amber-600' : 'text-red-600'}`}>
                                                {g.ecartPct > 0 ? '+' : ''}{g.ecartPct}%
                                            </td>
                                            <td className="px-4 py-3.5">
                                                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${statusPill[g.etat]}`}>
                                                    {Icon && <Icon className="text-sm" />}
                                                    {statusLabel[g.etat]}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {filteredGrouped.length === 0 && !loading && (
                        <div className="flex flex-col items-center justify-center py-20 bg-gray-50/30">
                            <FiFilter className="text-5xl text-gray-200 mb-4" />
                            <p className="text-gray-400 font-medium">Aucun enregistrement ne correspond aux critères.</p>
                        </div>
                    )}
                    {loading && (
                        <div className="flex justify-center py-20">
                            <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
                        </div>
                    )}
                </div>
            </div>

            {/* ═══════════ MODAL DÉTAIL — NIVEAU CARBURANT ═══════════ */}
            {selectedRow && (
                <div className="fixed inset-0 z-[2200] bg-black/40 backdrop-blur-sm flex items-start justify-center pt-4 pb-4 overflow-y-auto" onClick={() => { setSelectedRow(null); setSelectedPoint(null); setDetailData(null); }}>
                    <div className="w-full max-w-[1500px] mx-4 bg-white rounded-2xl border border-gray-100 shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>

                        {/* ── Header ── */}
                        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                            <div>
                                <h3 className="text-2xl font-black text-gray-800">Niveau carburant — {selectedRow.camion}</h3>
                                <p className="text-gray-400 text-sm">{detailData?.chauffeur || selectedRow.chauffeur || '—'} · Cargo · Objectif: {detailData?.objectif || 20} L/100km</p>
                            </div>
                            <div className="flex items-center gap-3">
                                {/* Date filter tabs */}
                                <div className="flex bg-gray-100 p-1 rounded-xl">
                                    {[{ id: 'day', label: 'Jour' }, { id: 'range', label: 'Plage' }, { id: 'week', label: 'Semaine' }, { id: 'month', label: 'Mois' }].map(mode => (
                                        <button key={mode.id} onClick={() => setDetailDateMode(mode.id)}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${detailDateMode === mode.id ? 'bg-white text-orange-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                                            {mode.label}
                                        </button>
                                    ))}
                                </div>
                                <input type="date" value={detailDate} onChange={(e) => handleDetailDateChange(e.target.value)}
                                    className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 font-medium" />
                                <button onClick={() => { setSelectedRow(null); setSelectedPoint(null); setDetailData(null); }} className="p-2 rounded-full text-gray-500 hover:bg-gray-100 transition-all">
                                    <FiX className="text-2xl" />
                                </button>
                            </div>
                        </div>

                        {/* ── KPI Row ── */}
                        <div className="grid grid-cols-2 md:grid-cols-4 border-b border-gray-100">
                            <div className="p-5 border-r border-gray-100">
                                <p className="text-[10px] font-bold text-orange-500 uppercase tracking-widest">Total consommé</p>
                                <p className="text-4xl font-black text-gray-800 leading-none mt-2">{detailStats.totalConso?.toLocaleString('fr-FR') ?? '—'}</p>
                                <p className="text-gray-300 text-sm">litres / mois</p>
                            </div>
                            <div className="p-5 border-r border-gray-100">
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Consomm. moy.</p>
                                <p className="text-4xl font-black text-gray-800 leading-none mt-2">{detailStats.consoMoy ?? '—'}</p>
                                <p className="text-gray-300 text-sm">L/100km</p>
                            </div>
                            <div className="p-5 border-r border-gray-100">
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Nb pleins</p>
                                <p className="text-4xl font-black text-gray-800 leading-none mt-2">{detailStats.nbPleins ?? 0}</p>
                                <p className="text-gray-300 text-sm">ce mois</p>
                            </div>
                            <div className="p-5">
                                <span className="inline-block px-3 py-1 rounded-lg text-white bg-blue-500 text-sm font-bold uppercase">Coût total</span>
                                <p className="text-4xl font-black text-gray-800 leading-none mt-2">{detailStats.totalMontant?.toLocaleString('fr-FR') ?? '—'}</p>
                                <div className="flex items-center justify-between mt-1">
                                    <p className="text-gray-300 text-sm">DT ce mois</p>
                                    <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold ${statusPill[detailStats.etat || selectedRow.etat]}`}>
                                        {(() => { const I = statusIcon[detailStats.etat || selectedRow.etat]; return I ? <I /> : null; })()}
                                        {statusLabel[detailStats.etat || selectedRow.etat]}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* ── Chart + Map Side by Side ── */}
                        <div className="grid grid-cols-1 lg:grid-cols-5">
                            {/* Left: Fuel Level Chart */}
                            <div className="lg:col-span-3 border-r border-gray-100 p-6">
                                <div className="flex items-center justify-between mb-4">
                                    <h4 className="text-lg font-black text-gray-700">
                                        Niveau réservoir — Journée du {detailDate ? new Date(detailDate + 'T00:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'}
                                    </h4>
                                    <div className="flex items-center gap-4 text-sm font-semibold text-gray-400">
                                        <span className="inline-flex items-center gap-1"><span className="w-5 h-0.5 bg-orange-500 rounded inline-block" /> Niveau</span>
                                        <span className="inline-flex items-center gap-1"><span className="w-3 h-3 bg-blue-500 rounded-full inline-block" /> Ravitaillement</span>
                                        <span className="inline-flex items-center gap-1"><span className="w-3 h-3 bg-red-400 rounded-full inline-block" /> Critique</span>
                                    </div>
                                </div>

                                {detailLoading ? (
                                    <div className="flex justify-center py-20">
                                        <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
                                    </div>
                                ) : niveauChartData.length > 0 ? (
                                    <div className="h-[320px] cursor-pointer">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <LineChart data={niveauChartData} margin={{ left: 0, right: 10, top: 10, bottom: 0 }} onClick={handleChartPointClick}>
                                                <defs>
                                                    <linearGradient id="niveauGrad" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="0%" stopColor="#f97316" stopOpacity={0.15} />
                                                        <stop offset="100%" stopColor="#f97316" stopOpacity={0.02} />
                                                    </linearGradient>
                                                </defs>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef2f7" />
                                                <XAxis dataKey="heure" tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 600 }} axisLine={false} tickLine={false} />
                                                <YAxis domain={[0, 105]} tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
                                                <Tooltip
                                                    content={({ active, payload }) => {
                                                        if (!active || !payload?.length) return null;
                                                        const d = payload[0].payload;
                                                        return (
                                                            <div className="bg-white rounded-xl shadow-lg border border-gray-100 px-4 py-3 text-sm">
                                                                <p className="font-bold text-gray-700">{d.heure}</p>
                                                                <p className="text-orange-500">Niveau: <b>{d.niveau}%</b></p>
                                                                <p className="text-gray-400">Vitesse: {d.speed} km/h</p>
                                                                {d.ravitaillement && <p className="text-blue-500 font-bold">⛽ Ravitaillement</p>}
                                                                <p className="text-[10px] text-gray-300 mt-1">Cliquez pour voir sur la carte</p>
                                                            </div>
                                                        );
                                                    }}
                                                />
                                                <Line type="monotone" dataKey="niveau" stroke="#f97316" strokeWidth={3} fill="url(#niveauGrad)"
                                                    dot={(props) => {
                                                        const { cx, cy, payload } = props;
                                                        const isSelected = selectedPoint && selectedPoint.heure === payload.heure;
                                                        const isRavit = payload.ravitaillement;
                                                        return (
                                                            <circle
                                                                key={`dot-${payload.heure}`}
                                                                cx={cx} cy={cy}
                                                                r={isSelected ? 7 : isRavit ? 5 : 4}
                                                                fill={isRavit ? '#3b82f6' : '#f97316'}
                                                                stroke={isSelected ? '#1e40af' : 'white'}
                                                                strokeWidth={isSelected ? 3 : 2}
                                                                style={{ cursor: 'pointer', filter: isSelected ? 'drop-shadow(0 0 6px rgba(249,115,22,0.5))' : 'none' }}
                                                            />
                                                        );
                                                    }}
                                                    activeDot={{ r: 7, stroke: '#f97316', strokeWidth: 3, fill: 'white' }}
                                                />
                                                <Line type="monotone" dataKey="critique" stroke="#fca5a5" strokeWidth={2} strokeDasharray="8 8" dot={false} />
                                            </LineChart>
                                        </ResponsiveContainer>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center py-20 text-gray-300">
                                        <FiTruck className="text-5xl mb-3" />
                                        <p className="font-medium">Aucune donnée GPS pour cette date</p>
                                        <p className="text-xs mt-1">Essayez une autre date</p>
                                    </div>
                                )}

                                <div className="mt-3 text-xs text-gray-400 bg-orange-50 rounded-xl px-4 py-2.5 flex items-center gap-2 border border-orange-100">
                                    <FiMapPin className="text-orange-400 flex-shrink-0" />
                                    Cliquez sur un point de la courbe pour voir la position du camion sur la carte →
                                </div>
                            </div>

                            {/* Right: GPS Map + Chauffeur */}
                            <div className="lg:col-span-2 flex flex-col">
                                {/* Position GPS Header */}
                                <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                                    <h4 className="text-base font-black text-gray-700 inline-flex items-center gap-2">
                                        <FiMapPin className="text-red-500" /> Position GPS
                                    </h4>
                                    {selectedPoint && (
                                        <div className="flex items-center gap-3 text-xs font-bold">
                                            <span className="text-red-500">{selectedPoint.heure}</span>
                                            <span className="text-gray-400">·</span>
                                            <span className="text-orange-500">⛽ {selectedPoint.niveau}%</span>
                                            <span className="text-gray-400">·</span>
                                            <span className="text-blue-500">💨 {selectedPoint.speed} km/h</span>
                                        </div>
                                    )}
                                </div>

                                {/* Map */}
                                <div className="flex-1 min-h-[320px] relative bg-gray-50">
                                    {selectedPoint ? (
                                        <MapContainer
                                            key={`${selectedPoint.latitude}-${selectedPoint.longitude}`}
                                            center={[selectedPoint.latitude, selectedPoint.longitude]}
                                            zoom={15}
                                            className="h-full w-full"
                                            style={{ height: '100%', width: '100%', minHeight: '320px' }}
                                        >
                                            <TileLayer
                                                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                                                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                            />
                                            <FlyToPoint position={[selectedPoint.latitude, selectedPoint.longitude]} />
                                            <Marker
                                                position={[selectedPoint.latitude, selectedPoint.longitude]}
                                                icon={createTruckIcon()}
                                            >
                                                <Popup>
                                                    <div className="text-sm min-w-[180px]">
                                                        <p className="font-black text-gray-800 text-base">{selectedRow.camion}</p>
                                                        <p className="text-gray-500 mt-1">⏰ {selectedPoint.heure}</p>
                                                        <p className="text-orange-500 font-bold">⛽ Réservoir: <span className="text-lg">{selectedPoint.niveau}%</span></p>
                                                        <p className="text-blue-500">💨 Vitesse: {selectedPoint.speed} km/h</p>
                                                        <p className="text-gray-400 text-xs mt-1">{selectedPoint.latitude.toFixed(4)}, {selectedPoint.longitude.toFixed(4)}</p>
                                                    </div>
                                                </Popup>
                                            </Marker>
                                        </MapContainer>
                                    ) : (
                                        <div className="flex flex-col items-center justify-center h-full min-h-[320px] text-gray-300">
                                            <FiMapPin className="text-5xl mb-3" />
                                            <p className="font-medium text-sm">Sélectionnez un point sur la courbe</p>
                                            <p className="text-xs">pour afficher la position GPS</p>
                                        </div>
                                    )}
                                </div>

                                {/* Affectations chauffeurs */}
                                <div className="border-t border-gray-100">
                                    <div className="px-5 py-3 flex items-center justify-between">
                                        <h4 className="text-sm font-black text-gray-700 inline-flex items-center gap-2">
                                            <FiUser className="text-blue-500" /> Affectations chauffeurs
                                        </h4>
                                        <span className="text-xs px-3 py-1 rounded-full bg-orange-50 text-orange-500 font-bold">
                                            {detailData?.ravitaillements?.length || 0} affectation · {detailData?.chauffeur !== '—' ? '1' : '0'} chauffeur
                                        </span>
                                    </div>
                                    <div className="px-5 pb-4">
                                        {detailData?.chauffeur && detailData.chauffeur !== '—' ? (
                                            <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 border border-gray-100">
                                                <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center">
                                                    <FiUser className="text-orange-500" />
                                                </div>
                                                <div>
                                                    <p className="font-bold text-gray-700 text-sm">{detailData.chauffeur}</p>
                                                    <p className="text-xs text-gray-400">{detailData.telephone || '—'}</p>
                                                </div>
                                            </div>
                                        ) : (
                                            <p className="text-center text-sm text-gray-300 py-3">Aucune affectation sur cette période</p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
