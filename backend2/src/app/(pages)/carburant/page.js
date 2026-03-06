'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  FiSearch, FiX, FiAlertTriangle, FiCheckCircle, FiMapPin,
  FiTruck, FiUser, FiFileText,
} from 'react-icons/fi';
import {
  LineChart, Line, ResponsiveContainer, XAxis, YAxis,
  CartesianGrid, Tooltip, Area,
} from 'recharts';
import { camionsAPI, carburantAPI } from '@/services/api';
import dynamic from 'next/dynamic';

/* ═══ Leaflet dynamic imports (SSR-safe) ═══ */
const MapContainer = dynamic(() => import('react-leaflet').then(m => m.MapContainer), { ssr: false });
const TileLayer    = dynamic(() => import('react-leaflet').then(m => m.TileLayer),     { ssr: false });
const Marker       = dynamic(() => import('react-leaflet').then(m => m.Marker),        { ssr: false });
const Popup        = dynamic(() => import('react-leaflet').then(m => m.Popup),         { ssr: false });
const CircleMarker = dynamic(() => import('react-leaflet').then(m => m.CircleMarker),  { ssr: false });

/* ── Map fly-to helper ── */
const FlyToPoint = ({ position }) => {
  if (typeof window === 'undefined') return null;
  const { useMap } = require('react-leaflet');
  const map = useMap();
  useEffect(() => { if (position) map.flyTo(position, 15, { duration: 0.8 }); }, [position, map]);
  return null;
};

const createStationIcon = () => {
  if (typeof window === 'undefined') return null;
  const L = require('leaflet');
  return L.divIcon({
    className: 'custom-marker',
    html: '<div style="width:32px;height:32px;background:#3b82f6;border:3px solid white;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;box-shadow:0 3px 10px rgba(0,0,0,0.3);">⛽</div>',
    iconSize: [32, 32], iconAnchor: [16, 16], popupAnchor: [0, -16],
  });
};

const createTruckIcon = () => {
  if (typeof window === 'undefined') return null;
  const L = require('leaflet');
  return L.divIcon({
    className: 'custom-marker',
    html: '<div style="width:34px;height:34px;background:#f97316;border:3px solid white;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:17px;box-shadow:0 3px 10px rgba(0,0,0,0.3);">🚛</div>',
    iconSize: [34, 34], iconAnchor: [17, 17], popupAnchor: [0, -17],
  });
};

/* ═══ Helpers ═══ */
const fmtDateFR = (iso) => {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

/* ═══════════════ PAGE ═══════════════ */
export default function CarburantPage() {

  /* ── state: header ── */
  const [camionsList, setCamionsList] = useState([]);
  const [selectedCamion, setSelectedCamion] = useState('');
  const [camionSearch, setCamionSearch] = useState('');
  const [showCamionDropdown, setShowCamionDropdown] = useState(false);
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');

  /* ── state: data ── */
  const [rows, setRows] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [activeTab, setActiveTab] = useState('detection');

  /* ── state: detail modal ── */
  const [selRow, setSelRow] = useState(null);
  const [niveauData, setNiveauData] = useState(null);
  const [niveauLoading, setNiveauLoading] = useState(false);
  const [selPoint, setSelPoint] = useState(null);
  const [modalTab, setModalTab] = useState('detection');

  /* ═══ Load camions list ═══ */
  useEffect(() => {
    (async () => {
      try {
        const res = await camionsAPI.getCamions();
        if (res.success) setCamionsList(res.data || []);
      } catch (err) { console.error('Err camions:', err); }
    })();
  }, []);

  /* ═══ Rechercher ═══ */
  const handleSearch = useCallback(async () => {
    if (!selectedCamion || !dateStart || !dateEnd) return;
    setLoading(true);
    setSearched(true);
    try {
      const res = await carburantAPI.getEcarts({ camion: selectedCamion, dateStart, dateEnd });
      if (res.success) {
        setRows(res.data || []);
        setStats(res.stats);
      }
    } catch (err) { console.error('Err search:', err); }
    finally { setLoading(false); }
  }, [selectedCamion, dateStart, dateEnd]);

  /* ═══ Row click → open modal ═══ */
  const handleRowClick = useCallback(async (row) => {
    setSelRow(row);
    setSelPoint(null);
    setNiveauData(null);
    setModalTab('detection');
    if (row.dateISO) {
      setNiveauLoading(true);
      try {
        const res = await carburantAPI.getNiveau(row.camion, { date: row.dateISO });
        if (res.success) setNiveauData(res.data);
      } catch (err) { console.error('Err niveau:', err); }
      finally { setNiveauLoading(false); }
    }
  }, []);

  /* ═══ Chart click → GPS point ═══ */
  const handleChartClick = (data) => {
    if (data?.activePayload?.[0]) {
      const pt = data.activePayload[0].payload;
      if (pt.latitude && pt.longitude) setSelPoint(pt);
    }
  };

  const closeModal = () => { setSelRow(null); setNiveauData(null); setSelPoint(null); };

  /* Computed */
  const ecartsFraudes = rows.filter(r => r.statut === 'fraude').length;
  const alertesCount  = rows.filter(r => r.statut !== 'conforme').length;

  /* ═══════════════════════════════════ RENDER ═══════════════════════════════════ */
  return (
    <div className="min-h-screen bg-[#eef1f8]">

      {/* ════════════ TOP BAR ════════════ */}
      <div className="bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-4 px-6 py-4">
          <h1 className="text-lg font-extrabold text-gray-900 whitespace-nowrap">Détails ravitaillement</h1>

          {/* Camion selector (autocomplete) */}
          <div className="relative min-w-[260px]">
            <input
              type="text"
              value={camionSearch}
              onChange={e => { setCamionSearch(e.target.value); setShowCamionDropdown(true); if (!e.target.value) setSelectedCamion(''); }}
              onFocus={() => setShowCamionDropdown(true)}
              placeholder="Saisir ou choisir un matricule…"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {showCamionDropdown && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowCamionDropdown(false)} />
                <ul className="absolute z-20 left-0 right-0 mt-1 max-h-60 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg">
                  {camionsList
                    .filter(c => c.plaque.toUpperCase().includes(camionSearch.toUpperCase()))
                    .map(c => (
                      <li key={c.plaque}
                        onClick={() => { setSelectedCamion(c.plaque); setCamionSearch(c.plaque); setShowCamionDropdown(false); }}
                        className={`px-3 py-2 text-sm cursor-pointer hover:bg-blue-50 transition-colors ${
                          selectedCamion === c.plaque ? 'bg-blue-100 font-bold text-blue-700' : 'text-gray-700'
                        }`}
                      >
                        {c.plaque}
                      </li>
                    ))}
                  {camionsList.filter(c => c.plaque.toUpperCase().includes(camionSearch.toUpperCase())).length === 0 && (
                    <li className="px-3 py-2 text-sm text-gray-400 italic">Aucun résultat</li>
                  )}
                </ul>
              </>
            )}
          </div>

          {/* Dates */}
          <span className="text-sm text-gray-500 font-medium">Du</span>
          <input type="date" value={dateStart} onChange={e => setDateStart(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <span className="text-sm text-gray-500 font-medium">Au</span>
          <input type="date" value={dateEnd} onChange={e => setDateEnd(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500" />

          {/* Rechercher */}
          <button
            onClick={handleSearch}
            disabled={!selectedCamion || !dateStart || !dateEnd}
            className="px-5 py-2 bg-[#1e3a5f] text-white text-sm font-bold rounded-lg inline-flex items-center gap-2 hover:bg-[#16304f] disabled:opacity-40 transition-all"
          >
            <FiSearch /> Rechercher
          </button>
        </div>

        {/* ── Tabs ── */}
        <div className="flex border-t border-gray-100 px-6">
          <button onClick={() => setActiveTab('detection')}
            className={`relative px-4 py-3 text-sm font-bold flex items-center gap-2 transition-all ${activeTab === 'detection' ? 'text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>
            <FiFileText className="text-blue-500" /> Détection
            {activeTab === 'detection' && <span className="absolute bottom-0 left-0 right-0 h-[3px] bg-blue-600 rounded-t" />}
          </button>
          <button onClick={() => setActiveTab('ecarts')}
            className={`relative px-4 py-3 text-sm font-bold flex items-center gap-2 transition-all ${activeTab === 'ecarts' ? 'text-red-600' : 'text-gray-500 hover:text-gray-700'}`}>
            ⚖️ Écarts &amp; Fraudes
            {ecartsFraudes > 0 && <span className="px-2 py-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full">{ecartsFraudes}</span>}
            {activeTab === 'ecarts' && <span className="absolute bottom-0 left-0 right-0 h-[3px] bg-red-600 rounded-t" />}
          </button>
          <button onClick={() => setActiveTab('alertes')}
            className={`relative px-4 py-3 text-sm font-bold flex items-center gap-2 transition-all ${activeTab === 'alertes' ? 'text-red-600' : 'text-gray-500 hover:text-gray-700'}`}>
            🚩 Alertes
            {alertesCount > 0 && <span className="px-2 py-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full">{alertesCount}</span>}
            {activeTab === 'alertes' && <span className="absolute bottom-0 left-0 right-0 h-[3px] bg-red-600 rounded-t" />}
          </button>
        </div>
      </div>

      {/* ════════════ CONTENT ════════════ */}
      <div className="p-6">

        {/* ── Loading ── */}
        {loading && (
          <div className="flex justify-center py-32">
            <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* ── Empty state (before search) ── */}
        {!loading && !searched && (
          <div className="flex flex-col items-center justify-center py-32 text-center">
            <div className="w-20 h-20 rounded-2xl bg-red-50 flex items-center justify-center mb-5 text-4xl">⛽</div>
            <h2 className="text-lg font-bold text-gray-800 mb-2">Aucun camion sélectionné</h2>
            <p className="text-gray-400 text-sm max-w-md">
              Choisissez un camion dans la liste à gauche ou dans
              le sélecteur, puis cliquez <strong>Rechercher</strong>.
            </p>
          </div>
        )}

        {/* ── Empty result ── */}
        {!loading && searched && rows.length === 0 && (
          <div className="flex flex-col items-center justify-center py-32 text-center">
            <FiTruck className="text-5xl text-gray-300 mb-4" />
            <p className="text-gray-400 font-medium">Aucun ravitaillement trouvé pour cette période.</p>
          </div>
        )}

        {/* ── Results ── */}
        {!loading && searched && rows.length > 0 && stats && (
          <>
            {/* ═══ Vehicle Info Bar (icon badges) ═══ */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-5 flex flex-wrap items-center gap-6">
              {/* Camion */}
              <div className="flex items-center gap-2">
                <span className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center text-lg">🚛</span>
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase">Camion</p>
                  <p className="text-sm font-black text-gray-800">{selectedCamion}</p>
                </div>
              </div>

              <div className="w-px h-10 bg-gray-200" />

              {/* Type carburant */}
              <div className="flex items-center gap-2">
                <span className="w-9 h-9 rounded-lg bg-purple-50 flex items-center justify-center text-lg">⛽</span>
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase">Type</p>
                  <p className="text-sm font-bold text-purple-600">{stats.type}</p>
                </div>
              </div>

              <div className="w-px h-10 bg-gray-200" />

              {/* Capacité */}
              <div className="flex items-center gap-2">
                <span className="w-9 h-9 rounded-lg bg-cyan-50 flex items-center justify-center text-lg">🔋</span>
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase">Capacité</p>
                  <p className="text-sm font-bold text-cyan-600">{stats.capacite || '—'} <span className="text-gray-400 font-normal">L</span></p>
                </div>
              </div>

              <div className="w-px h-10 bg-gray-200" />

              {/* Consommation moyenne */}
              <div className="flex items-center gap-2">
                <span className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center text-lg">📊</span>
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase">Conso. moy</p>
                  <p className="text-sm font-bold text-amber-600">{rows[0]?.consm_moy || '—'}</p>
                </div>
              </div>

              <div className="w-px h-10 bg-gray-200" />

              {/* Status badges */}
              <div className="flex items-center gap-4 ml-auto">
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                  <span className="text-xs font-bold text-emerald-700">{rows.filter(r => r.statut === 'conforme').length}</span>
                  <span className="text-[10px] text-emerald-600 font-medium">Conforme</span>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-orange-50 border border-orange-200">
                  <span className="w-2.5 h-2.5 rounded-full bg-orange-400" />
                  <span className="text-xs font-bold text-orange-700">{rows.filter(r => r.statut === 'suspect').length}</span>
                  <span className="text-[10px] text-orange-600 font-medium">Suspect</span>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-50 border border-red-200">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
                  <span className="text-xs font-bold text-red-700">{rows.filter(r => r.statut === 'fraude').length}</span>
                  <span className="text-[10px] text-red-600 font-medium">Fraude</span>
                </div>
              </div>
            </div>

            {/* ═══ KPI Cards ═══ */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">

              {/* QTÉ GPS TOTALE */}
              <div className="bg-white rounded-xl border border-gray-100 p-5 flex items-center gap-4 shadow-sm border-l-4 border-l-red-400">
                <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0 text-2xl">⛽</div>
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">QTÉ GPS TOTALE</p>
                  <p className="text-3xl font-black text-gray-800 leading-tight">{stats.totalGps}<sup className="text-sm font-bold text-gray-400 ml-0.5">L</sup></p>
                  <p className="text-[11px] text-gray-400">Σ table mesure</p>
                </div>
              </div>

              {/* RAVITAILLEMENTS */}
              <div className="bg-white rounded-xl border border-gray-100 p-5 flex items-center gap-4 shadow-sm border-l-4 border-l-green-400">
                <div className="w-14 h-14 rounded-full bg-green-50 flex items-center justify-center flex-shrink-0 text-2xl">🔋</div>
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">RAVITAILLEMENTS</p>
                  <p className="text-3xl font-black text-gray-800 leading-tight">{stats.nbRavitaillements}<span className="text-sm font-bold text-gray-400 ml-1">plein(s)</span></p>
                  <p className="text-[11px] text-gray-400">sur la période</p>
                </div>
              </div>

              {/* ÉCART GPS / DÉCLARÉ */}
              <div className="bg-white rounded-xl border border-gray-100 p-5 flex items-center gap-4 shadow-sm border-l-4 border-l-orange-400">
                <div className="w-14 h-14 rounded-full bg-orange-50 flex items-center justify-center flex-shrink-0 text-2xl">⚖️</div>
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">ÉCART GPS / DÉCLARÉ</p>
                  <p className={`text-3xl font-black leading-tight ${stats.ecartGlobal > 0 ? 'text-red-500' : stats.ecartGlobal < 0 ? 'text-orange-500' : 'text-emerald-500'}`}>
                    {stats.ecartGlobal > 0 ? '+' : ''}{stats.ecartGlobal}<sup className="text-sm font-bold ml-0.5">L</sup>
                  </p>
                  {stats.alertes > 0
                    ? <p className="text-[11px] text-red-500 font-bold">🚩 Fraude probable</p>
                    : <p className="text-[11px] text-emerald-500 font-bold">✅ Conforme</p>
                  }
                </div>
              </div>

              {/* ALERTES ACTIVES */}
              <div className="bg-white rounded-xl border border-gray-100 p-5 flex items-center gap-4 shadow-sm border-l-4 border-l-yellow-400">
                <div className="w-14 h-14 rounded-full bg-yellow-50 flex items-center justify-center flex-shrink-0 text-2xl">🔔</div>
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">ALERTES ACTIVES</p>
                  <p className="text-3xl font-black text-gray-800 leading-tight">{stats.alertes}<span className="text-sm font-bold text-gray-400 ml-1">alerte(s)</span></p>
                  {stats.alertes > 0
                    ? <p className="text-[11px] text-red-500 font-bold">Action requise</p>
                    : <p className="text-[11px] text-emerald-500">Rien à signaler</p>
                  }
                </div>
              </div>
            </div>

            {/* ═══ TABLE ═══ */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              {/* Table header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <h3 className="text-sm font-extrabold text-gray-800 flex items-center gap-2">🧾 Ravitaillements détectés</h3>
                <span className="text-xs text-gray-400 font-semibold">{fmtDateFR(dateStart)} → {fmtDateFR(dateEnd)}</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="px-5 py-3 font-bold text-gray-500 uppercase text-[11px] tracking-wider">Date</th>
                      <th className="px-5 py-3 font-bold text-gray-500 uppercase text-[11px] tracking-wider">Heure</th>
                      <th className="px-5 py-3 font-bold text-gray-500 uppercase text-[11px] tracking-wider">Camion</th>
                      <th className="px-5 py-3 font-bold text-gray-500 uppercase text-[11px] tracking-wider">Qté GPS (L)</th>
                      <th className="px-5 py-3 font-bold text-gray-500 uppercase text-[11px] tracking-wider">Qté Déclarée (L)</th>
                      <th className="px-5 py-3 font-bold text-gray-500 uppercase text-[11px] tracking-wider">Lieu</th>
                      <th className="px-5 py-3 font-bold text-gray-500 uppercase text-[11px] tracking-wider">Statut</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {rows.map((r, i) => (
                      <tr key={i} onClick={() => handleRowClick(r)}
                        className="hover:bg-blue-50/40 cursor-pointer transition-colors">
                        <td className="px-5 py-3 text-gray-700 font-medium">{r.date}</td>
                        <td className="px-5 py-3 text-gray-700 font-medium">{r.heure}</td>
                        <td className="px-5 py-3 text-gray-800 font-bold">{r.camion}</td>
                        <td className="px-5 py-3 font-bold text-teal-600">{r.qttGps} <span className="text-gray-400 font-normal">L</span></td>
                        <td className="px-5 py-3 font-bold text-indigo-600">{r.qttDeclaree} <span className="text-gray-400 font-normal">L</span></td>
                        <td className="px-5 py-3 text-gray-600 text-xs">{r.lieu}</td>
                        <td className="px-5 py-3">
                          {r.statut === 'conforme' ? (
                            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-600 border border-emerald-200">
                              <FiCheckCircle className="text-sm" /> Conforme
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-red-50 text-red-600 border border-red-200">
                              🚩 Fraude probable
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Footer total row */}
              <div className="flex flex-wrap items-center justify-between px-5 py-3 text-white text-sm font-bold" style={{ background: '#141a3c' }}>
                <span className="uppercase tracking-wider">Total Période</span>
                <div className="flex items-center gap-8">
                  <span className="text-teal-300">{stats.totalGps} L</span>
                  <span className="text-indigo-300">{stats.totalDeclaree} L</span>
                  <span className="px-3 py-1 rounded-lg border border-yellow-400/60 text-yellow-300">
                    Écart global : {stats.ecartGlobal > 0 ? '+' : ''}{stats.ecartGlobal} L
                  </span>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ════════════════════════ MODAL DÉTAIL ════════════════════════ */}
      {selRow && (
        <div className="fixed inset-0 z-[2200] bg-black/40 backdrop-blur-sm flex items-start justify-center pt-4 pb-4 overflow-y-auto" onClick={closeModal}>
          <div className="w-full max-w-[900px] mx-4 bg-white rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>

            {/* ── Header ── */}
            <div className="px-6 py-4 flex items-center justify-between" style={{ background: '#1e3a5f' }}>
              <div className="text-white">
                <h3 className="text-lg font-extrabold">Détails ravitaillement — {selRow.camion}</h3>
                <p className="text-blue-200 text-xs mt-0.5">{selRow.date} · {selRow.heure}</p>
              </div>
              <button onClick={closeModal} className="text-white/80 hover:text-white font-bold text-sm flex items-center gap-1 transition-all">
                <FiX className="text-lg" /> Fermer
              </button>
            </div>

            {/* ── Modal tabs ── */}
            <div className="flex border-b border-gray-100 px-6 bg-gray-50/50">
              {[{ id: 'detection', label: 'Détection' }, { id: 'historique', label: 'Historique' }, { id: 'informations', label: 'Informations' }].map(tab => (
                <button key={tab.id} onClick={() => setModalTab(tab.id)}
                  className={`px-4 py-3 text-sm font-bold transition-all relative ${modalTab === tab.id ? 'text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>
                  {tab.label}
                  {modalTab === tab.id && <span className="absolute bottom-0 left-0 right-0 h-[3px] bg-blue-600 rounded-t" />}
                </button>
              ))}
            </div>

            {/* ── Info cards (2×2) ── */}
            <div className="grid grid-cols-2 gap-px bg-gray-100">
              {/* IMMATRICULATION */}
              <div className="bg-white p-5">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">IMMATRICULATION</p>
                <div className="flex items-center gap-3">
                  <span className="text-xl">🚛</span>
                  <div>
                    <p className="text-lg font-black text-gray-800">{selRow.camion}</p>
                    <p className="text-xs text-gray-400">{selRow.camion}</p>
                  </div>
                </div>
              </div>

              {/* QTÉ GPS (TABLE MESURE) */}
              <div className="bg-white p-5">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">QTÉ GPS (TABLE MESURE)</p>
                <p className="text-2xl font-black text-emerald-500 leading-tight">▲ {selRow.qttGps} <span className="text-sm">L</span></p>
                <p className="text-xs text-gray-400 mt-1">{selRow.heure}</p>
              </div>

              {/* QTÉ DÉCLARÉE (TABLE TOTALE) */}
              <div className="bg-white p-5">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">QTÉ DÉCLARÉE (TABLE TOTALE)</p>
                <p className="text-2xl font-black text-blue-600 leading-tight">{selRow.qttDeclaree} <span className="text-sm">L</span></p>
                <p className="text-xs text-gray-400 mt-1">{selRow.prix > 0 ? `${selRow.prix.toFixed(2)} DT` : '—'}</p>
              </div>

              {/* ÉCART */}
              <div className="bg-white p-5">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">ÉCART</p>
                <p className={`text-2xl font-black leading-tight ${selRow.ecart === 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                  {selRow.ecart > 0 ? '+' : ''}{selRow.ecart} <span className="text-sm">L</span>
                </p>
                {selRow.statut === 'conforme' ? (
                  <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-600">✅ Conforme</span>
                ) : (
                  <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded text-[10px] font-bold bg-red-50 text-red-600">🚩 Fraude probable</span>
                )}
              </div>
            </div>

            {/* ── Fuel level chart ── */}
            <div className="p-6 border-t border-gray-100">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-sm font-black text-gray-700">
                  📈 Niveau carburant — {selRow.dateISO
                    ? new Date(selRow.dateISO + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
                    : '—'}
                </h4>
                <div className="flex items-center gap-4 text-xs font-semibold text-gray-400">
                  <span className="inline-flex items-center gap-1"><span className="w-4 h-[2px] bg-blue-500 rounded inline-block" /> Niveau carburant</span>
                  <span className="inline-flex items-center gap-1"><span className="w-3 h-3 bg-orange-400 rounded-full inline-block" /> Ravitaillement</span>
                </div>
              </div>

              {niveauLoading ? (
                <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
              ) : niveauData?.niveauData?.length > 0 ? (
                <div className="h-[260px] cursor-pointer">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={niveauData.niveauData} margin={{ left: 0, right: 10, top: 10, bottom: 0 }} onClick={handleChartClick}>
                      <defs>
                        <linearGradient id="niveauGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.15} />
                          <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef2f7" />
                      <XAxis dataKey="heure" tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 600 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                      <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `${v} L`} />
                      <Tooltip content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0].payload;
                        return (
                          <div className="bg-white rounded-xl shadow-lg border border-gray-100 px-4 py-3 text-sm">
                            <p className="font-bold text-gray-700">{d.heure}</p>
                            <p className="text-blue-500">Niveau: <b>{d.niveau} L</b></p>
                            <p className="text-gray-400">Vitesse: {d.speed} km/h</p>
                            {d.ravitaillement && <p className="text-orange-500 font-bold mt-1">⛽ Ravitaillement</p>}
                            <p className="text-[10px] text-gray-300 mt-1">Cliquez pour voir sur la carte</p>
                          </div>
                        );
                      }} />
                      <Area type="monotone" dataKey="niveau" stroke="none" fill="url(#niveauGrad)" />
                      <Line type="monotone" dataKey="niveau" stroke="#3b82f6" strokeWidth={2.5}
                        dot={props => {
                          const { cx, cy, payload } = props;
                          const isSelected = selPoint?.heure === payload.heure;
                          const isRavit = payload.ravitaillement;
                          return (
                            <circle key={`dot-${payload.heure}`} cx={cx} cy={cy}
                              r={isSelected ? 7 : isRavit ? 6 : 3}
                              fill={isRavit ? '#f59e0b' : '#3b82f6'}
                              stroke={isSelected ? '#1e40af' : 'white'}
                              strokeWidth={isSelected ? 3 : isRavit ? 2 : 1.5}
                              style={{ cursor: 'pointer' }} />
                          );
                        }}
                        activeDot={{ r: 6, stroke: '#3b82f6', strokeWidth: 2, fill: 'white' }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-gray-300">
                  <FiTruck className="text-5xl mb-3" />
                  <p className="font-medium text-sm">Aucune donnée GPS pour cette date</p>
                </div>
              )}
            </div>

            {/* ── Bottom info bar ── */}
            <div className="px-6 pb-2 flex items-center gap-6 text-xs text-gray-500 border-t border-gray-100 pt-3">
              <span className="font-bold inline-flex items-center gap-1">🚛 Immatriculation : {selRow.camion}</span>
              <span className="font-bold inline-flex items-center gap-1">⛽ Qté GPS en L : {selRow.qttGps}</span>
            </div>

            {/* ── Position GPS + Ticket ── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-gray-100 border-t border-gray-100">

              {/* Position GPS */}
              <div className="bg-white p-5">
                <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Position GPS Ravitaillement</h4>
                <div className="h-[220px] rounded-xl overflow-hidden border border-gray-200">
                  {(() => {
                    const lat = selPoint?.latitude ?? selRow.latGps ?? selRow.latRavit;
                    const lng = selPoint?.longitude ?? selRow.lngGps ?? selRow.lngRavit;
                    if (lat && lng) {
                      return (
                        <MapContainer key={`${lat}-${lng}`} center={[lat, lng]} zoom={14}
                          className="h-full w-full" style={{ height: '100%', width: '100%' }}>
                          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>' />
                          <FlyToPoint position={[lat, lng]} />
                          <Marker position={[lat, lng]} icon={selPoint ? createTruckIcon() : createStationIcon()}>
                            <Popup>
                              <div className="text-sm">
                                <p className="font-bold">{selRow.camion}</p>
                                <p>{selRow.lieu}</p>
                                {selPoint && <p className="text-blue-500">⏰ {selPoint.heure} · {selPoint.speed} km/h</p>}
                              </div>
                            </Popup>
                          </Marker>
                        </MapContainer>
                      );
                    }
                    return (
                      <div className="flex flex-col items-center justify-center h-full text-gray-300">
                        <FiMapPin className="text-3xl mb-2" />
                        <p className="text-xs">Position non disponible</p>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Ticket / Référence */}
              <div className="bg-white p-5">
                <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Ticket / Référence</h4>
                <div className="space-y-3">
                  <div className="flex justify-between border-b border-gray-50 pb-2">
                    <span className="text-xs text-gray-400">Station</span>
                    <span className="text-xs font-bold text-gray-700">{selRow.lieu}</span>
                  </div>
                  <div className="flex justify-between border-b border-gray-50 pb-2">
                    <span className="text-xs text-gray-400">Date</span>
                    <span className="text-xs font-bold text-gray-700">{selRow.date}</span>
                  </div>
                  <div className="flex justify-between border-b border-gray-50 pb-2">
                    <span className="text-xs text-gray-400">Heure</span>
                    <span className="text-xs font-bold text-gray-700">{selRow.heure}</span>
                  </div>
                  <div className="flex justify-between border-b border-gray-50 pb-2">
                    <span className="text-xs text-gray-400">Qté Déclarée</span>
                    <span className="text-xs font-bold text-gray-700">{selRow.qttDeclaree} L</span>
                  </div>
                  <div className="flex justify-between border-b border-gray-50 pb-2">
                    <span className="text-xs text-gray-400">Qté GPS</span>
                    <span className="text-xs font-bold text-teal-600">{selRow.qttGps} L</span>
                  </div>
                  <div className="flex justify-between border-b border-gray-50 pb-2">
                    <span className="text-xs text-gray-400">Prix</span>
                    <span className="text-xs font-bold text-gray-700">{selRow.prix > 0 ? `${selRow.prix.toFixed(2)} DT` : '—'}</span>
                  </div>
                  <div className="flex justify-between border-b border-gray-50 pb-2">
                    <span className="text-xs text-gray-400">Type</span>
                    <span className="text-xs font-bold text-gray-700">{selRow.type}</span>
                  </div>
                  {selRow.capacite && (
                    <div className="flex justify-between border-b border-gray-50 pb-2">
                      <span className="text-xs text-gray-400">Capacité réservoir</span>
                      <span className="text-xs font-bold text-gray-700">{selRow.capacite} L</span>
                    </div>
                  )}

                </div>
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
