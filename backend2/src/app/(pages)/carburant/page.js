'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  FiSearch, FiX, FiAlertTriangle, FiCheckCircle, FiMapPin,
  FiTruck, FiUser, FiFileText, FiEye, FiSettings, FiDroplet,
  FiBarChart2, FiActivity, FiCalendar, FiClock, FiArrowLeft, FiFilter,
} from 'react-icons/fi';
import {
  LineChart, Line, ResponsiveContainer, XAxis, YAxis,
  CartesianGrid, Tooltip, Area, ReferenceLine,
  BarChart, Bar, ComposedChart, Legend,
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
    html: '<div style="width:32px;height:32px;background:#22c55e;border:3px solid white;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;box-shadow:0 3px 10px rgba(0,0,0,0.3);">⛽</div>',
    iconSize: [32, 32], iconAnchor: [16, 16], popupAnchor: [0, -16],
  });
};

const createTruckIcon = () => {
  if (typeof window === 'undefined') return null;
  const L = require('leaflet');
  return L.divIcon({
    className: 'custom-marker',
    html: '<div style="width:34px;height:34px;background:#ef4444;border:3px solid white;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:17px;box-shadow:0 3px 10px rgba(0,0,0,0.3);">🚛</div>',
    iconSize: [34, 34], iconAnchor: [17, 17], popupAnchor: [0, -17],
  });
};

/* ═══ Helpers ═══ */
const fmtDateFR = (iso) => {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

const getEtatMoteurInfo = (point) => {
  if (!point) return { key: 'inconnu', label: 'Inconnu', color: '#6b7280', bg: '#f3f4f6' };

  const rawState = point.etatMoteur;
  if (rawState === 'en_route') return { key: 'en_route', label: 'En route', color: '#16a34a', bg: '#dcfce7' };
  if (rawState === 'arrete') return { key: 'arrete', label: 'Arrêté', color: '#ea580c', bg: '#ffedd5' };

  const numericCon = point.con != null ? Number(point.con) : NaN;
  if (!Number.isNaN(numericCon)) {
    return numericCon > 0
      ? { key: 'en_route', label: 'En route', color: '#16a34a', bg: '#dcfce7' }
      : { key: 'arrete', label: 'Arrêté', color: '#ea580c', bg: '#ffedd5' };
  }

  return { key: 'inconnu', label: 'Inconnu', color: '#6b7280', bg: '#f3f4f6' };
};

/* ═══ SVG Icon Components (matching reference screenshots) ═══ */
const FuelPumpIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 22V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v17" />
    <path d="M3 22h10" />
    <path d="M13 10h2a2 2 0 0 1 2 2v3a2 2 0 0 0 2 2h0a2 2 0 0 0 2-2V9.83a2 2 0 0 0-.59-1.42L18 6" />
    <path d="M6 12h4" />
    <path d="M6 8h4" />
  </svg>
);

const DropletIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
  </svg>
);

const ChartBarIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="12" width="4" height="8" rx="1" />
    <rect x="10" y="8" width="4" height="12" rx="1" />
    <rect x="17" y="4" width="4" height="16" rx="1" />
  </svg>
);

const TruckSmallIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 3h15v13H1z" />
    <path d="M16 8h4l3 3v5h-7V8z" />
    <circle cx="5.5" cy="18.5" r="2.5" />
    <circle cx="18.5" cy="18.5" r="2.5" />
  </svg>
);

/* ═══════════════ PAGE ═══════════════ */
export default function CarburantPage() {

  /* ── state: header ── */
  const [selectedCamion, setSelectedCamion] = useState('');
  const [dateFilterMode, setDateFilterMode] = useState('day');
  const [filterDate, setFilterDate] = useState('');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [filterWeek, setFilterWeek] = useState('');
  const [filterMonth, setFilterMonth] = useState('');
  const [filterMatricule, setFilterMatricule] = useState('');
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');

  /* ── state: data ── */
  const [rows, setRows] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  /* ── state: detail view ── */
  const [selRow, setSelRow] = useState(null);
  const [niveauData, setNiveauData] = useState(null);
  const [niveauLoading, setNiveauLoading] = useState(false);
  const [selPoint, setSelPoint] = useState(null);
  const [detailTab, setDetailTab] = useState('detection');

  const getDateRangeParams = useCallback(() => {
    const today = new Date().toISOString().split('T')[0];

    if (dateFilterMode === 'day') {
      const day = filterDate || today;
      return { start: day, end: day };
    }

    if (dateFilterMode === 'range') {
      return {
        start: filterStartDate || today,
        end: filterEndDate || filterStartDate || today,
      };
    }

    if (dateFilterMode === 'week' && filterWeek) {
      const [year, week] = filterWeek.split('-W').map(Number);
      const firstDayOfYear = new Date(Date.UTC(year, 0, 1));
      const firstWeekDayOffset = (firstDayOfYear.getUTCDay() || 7) - 1;
      const weekStart = new Date(firstDayOfYear);
      weekStart.setUTCDate(firstDayOfYear.getUTCDate() - firstWeekDayOffset + (week - 1) * 7);
      const weekEnd = new Date(weekStart);
      weekEnd.setUTCDate(weekStart.getUTCDate() + 6);
      return {
        start: weekStart.toISOString().split('T')[0],
        end: weekEnd.toISOString().split('T')[0],
      };
    }

    if (dateFilterMode === 'month' && filterMonth) {
      const [y, m] = filterMonth.split('-').map(Number);
      const monthStart = new Date(Date.UTC(y, m - 1, 1));
      const monthEnd = new Date(Date.UTC(y, m, 0));
      return {
        start: monthStart.toISOString().split('T')[0],
        end: monthEnd.toISOString().split('T')[0],
      };
    }

    return { start: today, end: today };
  }, [dateFilterMode, filterDate, filterStartDate, filterEndDate, filterWeek, filterMonth]);

  /* ═══ Rechercher ═══ */
  const handleSearch = useCallback(async () => {
    if (!selectedCamion) return;
    const { start, end } = getDateRangeParams();
    setDateStart(start);
    setDateEnd(end);

    setLoading(true);
    setSearched(true);
    setSelRow(null);
    setNiveauData(null);
    try {
      const res = await carburantAPI.getEcarts({ camion: selectedCamion, dateStart: start, dateEnd: end });
      if (res.success) {
        setRows(res.data || []);
        setStats(res.stats);
      }
    } catch (err) { console.error('Err search:', err); }
    finally { setLoading(false); }
  }, [selectedCamion, getDateRangeParams]);

  useEffect(() => {
    setSelectedCamion(filterMatricule.trim());
  }, [filterMatricule]);

  /* ═══ Row click → show detail view ═══ */
  const handleRowClick = useCallback(async (row) => {
    setSelRow(row);
    setSelPoint(null);
    setNiveauData(null);
    setDetailTab('detection');
    if (selectedCamion && dateStart && dateEnd) {
      setNiveauLoading(true);
      try {
        const res = await carburantAPI.getNiveau(selectedCamion, { dateStart, dateEnd });
        if (res.success) setNiveauData(res.data);
      } catch (err) { console.error('Err niveau:', err); }
      finally { setNiveauLoading(false); }
    }
  }, [selectedCamion, dateStart, dateEnd]);

  /* ═══ Chart click → GPS point ═══ */
  const handleChartClick = (data) => {
    if (data?.activePayload?.[0]) {
      const pt = data.activePayload[0].payload;
      if (pt.latitude && pt.longitude) {
        setSelPoint(pt);
        setDetailTab('historique');
      }
    }
  };

  const closeDetail = () => { setSelRow(null); setNiveauData(null); setSelPoint(null); };

  /* ═══════════════════════════════════ RENDER ═══════════════════════════════════ */
  return (
    <div className="min-h-screen" style={{ background: '#f5f6fa', fontFamily: "'Inter', sans-serif" }}>

      {/* ════════════ TOP BAR ════════════ */}
      <div className="bg-white" style={{ borderBottom: '1px solid #eee' }}>
        <div className="flex flex-wrap items-center gap-4 px-6 py-5">
          <h1 style={{ fontSize: '20px', fontWeight: 800, color: '#1a1a2e', letterSpacing: '-0.5px' }}>
            Ravitaillement
          </h1>

          <div className="flex bg-gray-100 p-1 rounded-xl">
            {[
              { id: 'day', label: 'Jour' },
              { id: 'range', label: 'Plage' },
              { id: 'week', label: 'Semaine' },
              { id: 'month', label: 'Mois' },
            ].map((mode) => (
              <button
                key={mode.id}
                onClick={() => setDateFilterMode(mode.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${dateFilterMode === mode.id ? 'bg-white text-orange-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
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
              <div className="flex items-center gap-2">
                <input type="date" value={filterStartDate} onChange={(e) => setFilterStartDate(e.target.value)}
                  className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all font-medium" />
                <span className="text-gray-400 font-bold">au</span>
                <input type="date" value={filterEndDate} onChange={(e) => setFilterEndDate(e.target.value)}
                  className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all font-medium" />
              </div>
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
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <FiFilter className="text-gray-400" />
            </div>
            <input
              type="text"
              placeholder="Matricule..."
              value={filterMatricule}
              onChange={(e) => setFilterMatricule(e.target.value)}
              className="pl-10 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm w-44 focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all"
            />
          </div>

          {/* Rechercher */}
          <button
            onClick={handleSearch}
            disabled={!selectedCamion}
            style={{
              padding: '10px 22px', background: !selectedCamion ? '#d1d5db' : '#f97316',
              color: 'white', fontSize: '13px', fontWeight: 700, borderRadius: '10px',
              border: 'none', cursor: !selectedCamion ? 'not-allowed' : 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              transition: 'all 0.2s', fontFamily: "'Inter', sans-serif",
              boxShadow: !selectedCamion ? 'none' : '0 4px 14px rgba(249,115,22,0.3)',
            }}
          >
            <FiSearch /> Rechercher
          </button>
        </div>
      </div>

      {/* ════════════ CONTENT ════════════ */}
      <div style={{ padding: '24px' }}>

        {/* ── Loading ── */}
        {loading && (
          <div className="flex justify-center" style={{ paddingTop: '120px', paddingBottom: '120px' }}>
            <div style={{ width: '44px', height: '44px', border: '4px solid #f97316', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {/* ── Empty state (before search) ── */}
        {!loading && !searched && (
          <div className="flex flex-col items-center justify-center text-center" style={{ paddingTop: '120px', paddingBottom: '120px' }}>
            <div style={{
              width: '80px', height: '80px', borderRadius: '20px', background: 'linear-gradient(135deg, #fff7ed, #fed7aa)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '20px', fontSize: '36px',
            }}>⛽</div>
            <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#1a1a2e', marginBottom: '8px' }}>Aucun camion sélectionné</h2>
            <p style={{ color: '#9ca3af', fontSize: '14px', maxWidth: '400px', lineHeight: '1.6' }}>
              Choisissez un camion dans le sélecteur, puis cliquez <strong style={{ color: '#f97316' }}>Rechercher</strong>.
            </p>
          </div>
        )}

        {/* ── Empty result ── */}
        {!loading && searched && rows.length === 0 && (
          <div className="flex flex-col items-center justify-center text-center" style={{ paddingTop: '120px', paddingBottom: '120px' }}>
            <FiTruck style={{ fontSize: '52px', color: '#d1d5db', marginBottom: '16px' }} />
            <p style={{ color: '#9ca3af', fontWeight: 600, fontSize: '15px' }}>Aucun ravitaillement trouvé pour cette période.</p>
          </div>
        )}

        {/* ── Results ── */}
        {!loading && searched && rows.length > 0 && stats && !selRow && (
          <>
            {/* ═══ KPI Cards (matching reference icons) ═══ */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '20px' }}>

              {/* Consommation moyenne */}
              <div style={{
                background: 'white', borderRadius: '16px', padding: '20px 24px', display: 'flex', alignItems: 'center', gap: '16px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)', border: '1px solid #f3f4f6',
              }}>
                <div style={{
                  width: '52px', height: '52px', borderRadius: '50%',
                  border: '2.5px solid #fdba74',
                  background: '#fff7ed',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <FuelPumpIcon />
                </div>
                <div>
                  <p style={{ fontSize: '26px', fontWeight: 800, color: '#1a1a2e', lineHeight: 1.1 }}>
                    {rows[0]?.consm_moy || '—'}
                  </p>
                  <p style={{ fontSize: '12px', color: '#9ca3af', fontWeight: 500, marginTop: '3px' }}>Consommation moyenne</p>
                </div>
              </div>

              {/* Total Ravitaillement */}
              <div style={{
                background: 'white', borderRadius: '16px', padding: '20px 24px', display: 'flex', alignItems: 'center', gap: '16px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)', border: '1px solid #f3f4f6',
              }}>
                <div style={{
                  width: '52px', height: '52px', borderRadius: '50%',
                  border: '2.5px solid #fdba74',
                  background: '#fff7ed',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <DropletIcon />
                </div>
                <div>
                  <p style={{ fontSize: '26px', fontWeight: 800, color: '#1a1a2e', lineHeight: 1.1 }}>
                    {stats.totalDeclaree} <span style={{ fontSize: '16px', color: '#9ca3af', fontWeight: 500 }}>L</span>
                  </p>
                  <p style={{ fontSize: '12px', color: '#9ca3af', fontWeight: 500, marginTop: '3px' }}>Total Ravitaillement</p>
                </div>
              </div>

              {/* Total de carburant utilisé */}
              <div style={{
                background: 'white', borderRadius: '16px', padding: '20px 24px', display: 'flex', alignItems: 'center', gap: '16px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)', border: '1px solid #f3f4f6',
              }}>
                <div style={{
                  width: '52px', height: '52px', borderRadius: '50%',
                  border: '2.5px solid #fdba74',
                  background: '#fff7ed',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <ChartBarIcon />
                </div>
                <div>
                  <p style={{ fontSize: '26px', fontWeight: 800, color: '#1a1a2e', lineHeight: 1.1 }}>
                    {stats.totalGps}<span style={{ fontSize: '16px', color: '#9ca3af', fontWeight: 500 }}>L</span>
                  </p>
                  <p style={{ fontSize: '12px', color: '#9ca3af', fontWeight: 500, marginTop: '3px' }}>Total de carburant utilisé</p>
                </div>
              </div>

              {/* Nombre de Ravitaillements */}
              <div style={{
                background: 'white', borderRadius: '16px', padding: '20px 24px', display: 'flex', alignItems: 'center', gap: '16px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)', border: '1px solid #f3f4f6',
              }}>
                <div style={{
                  width: '52px', height: '52px', borderRadius: '50%',
                  border: '2.5px solid #fdba74',
                  background: '#fff7ed',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <TruckSmallIcon />
                </div>
                <div>
                  <p style={{ fontSize: '26px', fontWeight: 800, color: '#1a1a2e', lineHeight: 1.1 }}>
                    {stats.nbRavitaillements}
                  </p>
                  <p style={{ fontSize: '12px', color: '#9ca3af', fontWeight: 500, marginTop: '3px' }}>Nombre de Ravitaillements</p>
                </div>
              </div>
            </div>

            {/* ═══ Analyse Écart (progress bars) ═══ */}
            <div style={{
              background: 'white', borderRadius: '16px', padding: '20px', marginBottom: '20px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)', border: '1px solid #f3f4f6',
            }}>
              <div className="flex items-center justify-between" style={{ marginBottom: '16px' }}>
                <div className="flex items-center gap-2">
                  <FiBarChart2 style={{ color: '#f97316', fontSize: '18px' }} />
                  <span style={{ fontSize: '14px', fontWeight: 700, color: '#1a1a2e' }}>Analyse Écart</span>
                </div>
                <span style={{
                  fontSize: '13px', fontWeight: 700,
                  color: stats.ecartGlobal > 0 ? '#ef4444' : stats.ecartGlobal < 0 ? '#f97316' : '#10b981',
                  background: stats.ecartGlobal > 0 ? '#fef2f2' : stats.ecartGlobal < 0 ? '#fff7ed' : '#ecfdf5',
                  padding: '4px 12px', borderRadius: '8px',
                }}>
                  Écart : {stats.ecartGlobal > 0 ? '+' : ''}{stats.ecartGlobal} L ({stats.totalGps > 0 ? ((Math.abs(stats.ecartGlobal) / stats.totalGps) * 100).toFixed(1) : 0}%)
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <div>
                  <div className="flex items-center justify-between" style={{ marginBottom: '8px' }}>
                    <span style={{ fontSize: '12px', color: '#6b7280', fontWeight: 600 }}>Total GPS</span>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: '#1a1a2e' }}>{stats.totalGps} L</span>
                  </div>
                  <div style={{ width: '100%', height: '10px', background: '#f3f4f6', borderRadius: '10px', overflow: 'hidden' }}>
                    <div style={{
                      width: '100%', height: '100%', borderRadius: '10px',
                      background: 'linear-gradient(90deg, #f97316, #fb923c)',
                    }} />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between" style={{ marginBottom: '8px' }}>
                    <span style={{ fontSize: '12px', color: '#6b7280', fontWeight: 600 }}>Ravitaillement</span>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: '#1a1a2e' }}>{stats.totalDeclaree} L</span>
                  </div>
                  <div style={{ width: '100%', height: '10px', background: '#f3f4f6', borderRadius: '10px', overflow: 'hidden' }}>
                    <div style={{
                      width: stats.totalGps > 0 ? `${Math.min((stats.totalDeclaree / stats.totalGps) * 100, 100)}%` : '0%',
                      height: '100%', borderRadius: '10px',
                      background: 'linear-gradient(90deg, #fbbf24, #f59e0b)',
                    }} />
                  </div>
                </div>
              </div>
            </div>

            {/* ═══ TABLE ═══ */}
            <div style={{
              background: 'white', borderRadius: '16px', overflow: 'hidden',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)', border: '1px solid #f3f4f6',
            }}>
              <div className="flex items-center justify-between" style={{ padding: '16px 20px', borderBottom: '1px solid #f3f4f6' }}>
                <div className="flex items-center gap-2">
                  <FiTruck style={{ color: '#f97316', fontSize: '16px' }} />
                  <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#1a1a2e' }}>{selectedCamion}</h3>
                </div>
                <span style={{ fontSize: '12px', color: '#9ca3af', fontWeight: 600 }}>{fmtDateFR(dateStart)} → {fmtDateFR(dateEnd)}</span>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', fontSize: '13px', textAlign: 'left', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#fafbfc' }}>
                      <th style={{ padding: '12px 20px', fontWeight: 700, color: '#6b7280', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>#</th>
                      <th style={{ padding: '12px 20px', fontWeight: 700, color: '#6b7280', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Date de ravitaillement</th>
                      <th style={{ padding: '12px 20px', fontWeight: 700, color: '#6b7280', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Adresse</th>
                      <th style={{ padding: '12px 20px', fontWeight: 700, color: '#6b7280', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'center' }}>Qté de ravitaillement (L)</th>
                      <th style={{ padding: '12px 20px', fontWeight: 700, color: '#6b7280', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'center' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i}
                        style={{
                          borderTop: '1px solid #f9fafb', cursor: 'pointer', transition: 'background 0.15s',
                          background: r.statut === 'fraude' ? '#fef2f2' : (i % 2 === 0 ? '#ffffff' : '#fafbfc'),
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = '#fff7ed'}
                        onMouseLeave={e => e.currentTarget.style.background = r.statut === 'fraude' ? '#fef2f2' : (i % 2 === 0 ? '#ffffff' : '#fafbfc')}
                        onClick={() => handleRowClick(r)}
                      >
                        <td style={{ padding: '14px 20px', color: '#6b7280', fontWeight: 500 }}>{i + 1}</td>
                        <td style={{ padding: '14px 20px', color: '#374151', fontWeight: 600 }}>{r.date}</td>
                        <td style={{ padding: '14px 20px', color: '#6b7280', fontWeight: 500 }}>{r.lieu}</td>
                        <td style={{ padding: '14px 20px', textAlign: 'center', fontWeight: 700, color: '#1a1a2e' }}>{r.qttGps}</td>
                        <td style={{ padding: '14px 20px', textAlign: 'center' }}>
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={(e) => { e.stopPropagation(); handleRowClick(r); }}
                              style={{
                                width: '32px', height: '32px', borderRadius: '8px', border: '1px solid #e5e7eb',
                                background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                transition: 'all 0.15s', color: '#f97316',
                              }}
                              onMouseEnter={e => { e.currentTarget.style.background = '#fff7ed'; e.currentTarget.style.borderColor = '#f97316'; }}
                              onMouseLeave={e => { e.currentTarget.style.background = 'white'; e.currentTarget.style.borderColor = '#e5e7eb'; }}
                            >
                              <FiEye style={{ fontSize: '14px' }} />
                            </button>
                            <button
                              style={{
                                width: '32px', height: '32px', borderRadius: '8px', border: '1px solid #e5e7eb',
                                background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                transition: 'all 0.15s', color: '#6b7280',
                              }}
                              onMouseEnter={e => { e.currentTarget.style.background = '#f3f4f6'; }}
                              onMouseLeave={e => { e.currentTarget.style.background = 'white'; }}
                            >
                              <FiSettings style={{ fontSize: '14px' }} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* ═══════════════ DETAIL VIEW (inline, replaces table) ═══════════════ */}
        {!loading && selRow && (
          <div>

            {/* ── Detail tabs ── */}
            <div style={{
              background: 'white', borderRadius: '16px 16px 0 0', borderBottom: '1px solid #f3f4f6',
              padding: '0 20px', display: 'flex', alignItems: 'center',
            }}>
              <button onClick={closeDetail} style={{
                display: 'flex', alignItems: 'center', gap: '6px', padding: '14px 12px 14px 0',
                border: 'none', background: 'transparent', cursor: 'pointer', color: '#6b7280',
                fontSize: '13px', fontWeight: 600, fontFamily: "'Inter', sans-serif",
                marginRight: '16px', borderRight: '1px solid #f3f4f6', paddingRight: '16px',
              }}>
                <FiArrowLeft /> Retour
              </button>
              {[
                { id: 'detection', label: 'Detection' },
                { id: 'historique', label: 'Historique' },
                { id: 'informations', label: 'Informations' },
              ].map(tab => (
                <button key={tab.id} onClick={() => setDetailTab(tab.id)}
                  style={{
                    padding: '14px 18px', fontSize: '13px', fontWeight: 700, border: 'none', background: 'transparent',
                    cursor: 'pointer', fontFamily: "'Inter', sans-serif", position: 'relative',
                    color: detailTab === tab.id ? '#f97316' : '#6b7280', transition: 'all 0.2s',
                  }}>
                  {tab.label}
                  {detailTab === tab.id && <span style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '3px', background: '#f97316', borderRadius: '3px 3px 0 0' }} />}
                </button>
              ))}
            </div>

            {/* ═══ TAB CONTENT ═══ */}

            {/* ── DETECTION TAB: smooth orange area chart ── */}
            {detailTab === 'detection' && (
              <div style={{
                background: 'white', padding: '24px', marginBottom: '20px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
              }}>
                {niveauLoading ? (
                  <div className="flex justify-center" style={{ padding: '60px 0' }}>
                    <div style={{ width: '36px', height: '36px', border: '4px solid #f97316', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                  </div>
                ) : niveauData?.niveauData?.length > 0 ? (
                  <>
                    <div style={{ height: '320px', cursor: 'pointer' }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={niveauData.niveauData} margin={{ left: 10, right: 10, top: 10, bottom: 0 }} onClick={handleChartClick}>
                          <defs>
                            <linearGradient id="areaGradOrange" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#f97316" stopOpacity={0.25} />
                              <stop offset="100%" stopColor="#f97316" stopOpacity={0.03} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={true} stroke="#e5e7eb" />
                          <XAxis
                            dataKey="heure"
                            tick={{ fill: '#6b7280', fontSize: 10, fontWeight: 500, fontFamily: 'Inter' }}
                            axisLine={false} tickLine={false}
                            interval="preserveStartEnd"
                          />
                          <YAxis
                            tick={{ fill: '#6b7280', fontSize: 10, fontFamily: 'Inter' }}
                            axisLine={false} tickLine={false}
                            label={{ value: 'Niveau carburant', angle: -90, position: 'insideLeft', style: { fontSize: 11, fill: '#9ca3af', fontFamily: 'Inter' } }}
                          />
                          {/* Red dashed threshold line */}
                          <ReferenceLine y={20} stroke="#ef4444" strokeDasharray="8 5" strokeWidth={1.5} />
                          <Tooltip content={({ active, payload }) => {
                            if (!active || !payload?.length) return null;
                            const d = payload[0]?.payload;
                            if (!d) return null;
                            return (
                              <div style={{
                                background: 'white', borderRadius: '10px', boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
                                border: '1px solid #f3f4f6', padding: '10px 14px', fontSize: '13px', fontFamily: "'Inter', sans-serif",
                              }}>
                                <p style={{ fontWeight: 600, color: '#6b7280', marginBottom: '2px' }}>
                                  {d.timestamp ? new Date(d.timestamp).toLocaleDateString('fr-FR', { month: '2-digit', day: '2-digit' }) : ''} {d.heure}
                                </p>
                                <p style={{ color: '#f97316', fontWeight: 700 }}>Litres : {d.niveau} L</p>
                                <p style={{ color: getEtatMoteurInfo(d).color, fontWeight: 700 }}>
                                  Etat moteur : {getEtatMoteurInfo(d).label}
                                </p>
                                <p style={{ color: '#6b7280' }}>
                                  Lat: {Number(d.latitude).toFixed(5)} | Lng: {Number(d.longitude).toFixed(5)}
                                </p>
                                <p style={{ fontSize: '10px', color: '#9ca3af', marginTop: '4px' }}>Cliquez pour localiser</p>
                              </div>
                            );
                          }} />
                          {/* Orange fill area */}
                          <Area type="monotone" dataKey="niveau" stroke="none" fill="url(#areaGradOrange)" />
                          {/* Orange smooth line */}
                          <Line type="monotone" dataKey="niveau" stroke="#f97316" strokeWidth={2.5}
                            dot={props => {
                              const { cx, cy, payload } = props;
                              const isSelected = selPoint?.heure === payload.heure;
                              const isRavit = payload.ravitaillement;
                              return (
                                <circle key={`dot-${payload.heure}`} cx={cx} cy={cy}
                                  r={isSelected ? 6 : 3.5}
                                  fill={isRavit ? '#fb923c' : '#f97316'}
                                  stroke={isSelected ? '#c2410c' : 'white'}
                                  strokeWidth={isSelected ? 3 : 1.5}
                                  style={{ cursor: 'pointer' }} />
                              );
                            }}
                            activeDot={{ r: 6, stroke: '#f97316', strokeWidth: 2, fill: 'white' }}
                          />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center" style={{ padding: '60px 0', color: '#d1d5db' }}>
                    <FiTruck style={{ fontSize: '48px', marginBottom: '12px' }} />
                    <p style={{ fontWeight: 600, fontSize: '14px' }}>Aucune donnée GPS pour cette période</p>
                  </div>
                )}
              </div>
            )}

            {/* ── HISTORIQUE TAB: map + info bar + bar/line chart ── */}
            {detailTab === 'historique' && (
              <div style={{ marginBottom: '20px' }}>
                {/* Map */}
                <div style={{
                  background: 'white', overflow: 'hidden',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                }}>
                  <div style={{ height: '400px' }}>
                    {(() => {
                      const lat = selPoint?.latitude ?? selRow.latGps ?? selRow.latRavit;
                      const lng = selPoint?.longitude ?? selRow.lngGps ?? selRow.lngRavit;
                      if (lat && lng) {
                        const gpsPoints = niveauData?.niveauData || [];
                        return (
                          <MapContainer key={`${lat}-${lng}`} center={[lat, lng]} zoom={14}
                            className="h-full w-full" style={{ height: '100%', width: '100%' }}>
                            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>' />
                            <FlyToPoint position={[lat, lng]} />
                            {gpsPoints.map((pt, idx) => {
                              const isSelected =
                                selPoint &&
                                String(selPoint.timestamp) === String(pt.timestamp) &&
                                Number(selPoint.latitude) === Number(pt.latitude) &&
                                Number(selPoint.longitude) === Number(pt.longitude);

                              return (
                                <CircleMarker
                                  key={`gps-${pt.timestamp || idx}`}
                                  center={[pt.latitude, pt.longitude]}
                                  radius={isSelected ? 7 : 4}
                                  pathOptions={{
                                    color: isSelected ? '#c2410c' : '#f97316',
                                    fillColor: isSelected ? '#fb923c' : '#fdba74',
                                    fillOpacity: isSelected ? 0.95 : 0.75,
                                    weight: isSelected ? 2 : 1,
                                  }}
                                >
                                  <Popup>
                                    <div style={{ fontSize: '13px', fontFamily: "'Inter', sans-serif" }}>
                                      <p style={{ fontWeight: 700 }}>📍 Point GPS {pt.heure}</p>
                                      <p>Fuel: <strong>{pt.niveau} L</strong></p>
                                      <p>
                                        Etat moteur:{' '}
                                        <strong style={{ color: getEtatMoteurInfo(pt).color }}>
                                          {getEtatMoteurInfo(pt).label}
                                        </strong>
                                      </p>
                                      <p style={{ color: '#6b7280' }}>
                                        Lat: {Number(pt.latitude).toFixed(5)} | Lng: {Number(pt.longitude).toFixed(5)}
                                      </p>
                                    </div>
                                  </Popup>
                                </CircleMarker>
                              );
                            })}
                            {selRow.latRavit && selRow.lngRavit && (
                              <Marker position={[selRow.latRavit, selRow.lngRavit]} icon={createStationIcon()}>
                                <Popup>
                                  <div style={{ fontSize: '13px', fontFamily: "'Inter', sans-serif" }}>
                                    <p style={{ fontWeight: 700 }}>⛽ Station</p>
                                    <p>{selRow.lieu}</p>
                                  </div>
                                </Popup>
                              </Marker>
                            )}
                            {selPoint && (
                              <Marker position={[selPoint.latitude, selPoint.longitude]} icon={createTruckIcon()}>
                                <Popup>
                                  <div style={{ fontSize: '13px', fontFamily: "'Inter', sans-serif" }}>
                                    <p style={{ fontWeight: 700 }}>🚛 {selRow.camion}</p>
                                    <p style={{ color: '#f97316' }}>⏰ {selPoint.heure} · {selPoint.niveau} L</p>
                                    <p>
                                      ⚙ Etat moteur:{' '}
                                      <strong style={{ color: getEtatMoteurInfo(selPoint).color }}>
                                        {getEtatMoteurInfo(selPoint).label}
                                      </strong>
                                    </p>
                                    <p style={{ color: '#6b7280' }}>
                                      📍 {Number(selPoint.latitude).toFixed(5)}, {Number(selPoint.longitude).toFixed(5)}
                                    </p>
                                  </div>
                                </Popup>
                              </Marker>
                            )}
                            {!selPoint && (
                              <Marker position={[lat, lng]} icon={selRow.latGps ? createTruckIcon() : createStationIcon()}>
                                <Popup>
                                  <div style={{ fontSize: '13px', fontFamily: "'Inter', sans-serif" }}>
                                    <p style={{ fontWeight: 700 }}>{selRow.camion}</p>
                                    <p>{selRow.lieu}</p>
                                  </div>
                                </Popup>
                              </Marker>
                            )}
                          </MapContainer>
                        );
                      }
                      return (
                        <div className="flex flex-col items-center justify-center" style={{ height: '100%', color: '#d1d5db', background: '#fafbfc' }}>
                          <FiMapPin style={{ fontSize: '40px', marginBottom: '12px' }} />
                          <p style={{ fontSize: '14px', fontWeight: 600 }}>Position GPS non disponible</p>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Orange info bar */}
                  <div className="flex items-center gap-6" style={{
                    background: '#f97316', padding: '12px 20px', color: 'white', fontSize: '13px', fontWeight: 600,
                  }}>
                    <span className="flex items-center gap-2">
                      <FiTruck /> Immatriculation <strong style={{ fontWeight: 800 }}>{selectedCamion}</strong>
                    </span>
                    <span className="flex items-center gap-2">
                      <FiCalendar /> {dateStart}
                    </span>
                    <span className="flex items-center gap-2">
                      <FiCalendar /> {dateEnd}
                    </span>
                  </div>
                </div>

                {/* Bar + Line chart */}
                <div style={{
                  background: 'white', padding: '24px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.04)', borderRadius: '0 0 16px 16px',
                }}>
                  {niveauLoading ? (
                    <div className="flex justify-center" style={{ padding: '60px 0' }}>
                      <div style={{ width: '36px', height: '36px', border: '4px solid #f97316', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                    </div>
                  ) : niveauData?.niveauData?.length > 0 ? (
                    <>
                      <div style={{ height: '280px', cursor: 'pointer' }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <ComposedChart data={niveauData.niveauData} margin={{ left: 0, right: 10, top: 10, bottom: 0 }} onClick={handleChartClick}>
                            <defs>
                              <linearGradient id="barGrad2" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#fdba74" stopOpacity={0.9} />
                                <stop offset="100%" stopColor="#fed7aa" stopOpacity={0.5} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                            <XAxis
                              dataKey="heure"
                              tick={{ fill: '#94a3b8', fontSize: 9, fontWeight: 600, fontFamily: 'Inter' }}
                              axisLine={false} tickLine={false}
                              interval="preserveStartEnd"
                              angle={-45}
                              textAnchor="end"
                              height={50}
                            />
                            <YAxis
                              tick={{ fill: '#94a3b8', fontSize: 10, fontFamily: 'Inter' }}
                              axisLine={false} tickLine={false}
                            />
                            <Tooltip content={({ active, payload }) => {
                              if (!active || !payload?.length) return null;
                              const d = payload[0]?.payload;
                              if (!d) return null;
                              return (
                                <div style={{
                                  background: 'white', borderRadius: '10px', boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
                                  border: '1px solid #f3f4f6', padding: '10px 14px', fontSize: '13px', fontFamily: "'Inter', sans-serif",
                                }}>
                                  <p style={{ fontWeight: 700, color: '#374151', marginBottom: '4px' }}>{d.timestamp ? new Date(d.timestamp).toLocaleString('fr-FR') : d.heure}</p>
                                  <p style={{ color: '#f97316' }}>Litres : <b>{d.niveau} L</b></p>
                                  <p style={{ color: '#ef4444' }}>Niveau carburant US : <b>{d.con ?? '—'}</b></p>
                                  <p style={{ color: getEtatMoteurInfo(d).color }}>Etat moteur : <b>{getEtatMoteurInfo(d).label}</b></p>
                                  <p style={{ color: '#6b7280' }}>
                                    Lat: {Number(d.latitude).toFixed(5)} | Lng: {Number(d.longitude).toFixed(5)}
                                  </p>
                                  {d.ravitaillement && <p style={{ color: '#f97316', fontWeight: 700, marginTop: '4px' }}>⛽ Ravitaillement détecté</p>}
                                  <p style={{ fontSize: '10px', color: '#9ca3af', marginTop: '4px' }}>Cliquez pour voir sur la carte</p>
                                </div>
                              );
                            }} />
                            {/* Orange bars — fuel level (Litres) */}
                            <Bar
                              dataKey="niveau"
                              fill="url(#barGrad2)"
                              radius={[2, 2, 0, 0]}
                              name="Litres"
                            />
                            {/* Red line — consumption / engine state */}
                            <Line
                              type="monotone"
                              dataKey="con"
                              stroke="#ef4444"
                              strokeWidth={2}
                              dot={{ r: 2.5, fill: '#ef4444', stroke: 'white', strokeWidth: 1 }}
                              name="Niveau carburant US"
                            />
                          </ComposedChart>
                        </ResponsiveContainer>
                      </div>
                      {/* Legend */}
                      <div className="flex items-center justify-center gap-8" style={{ marginTop: '16px', fontSize: '12px', color: '#6b7280' }}>
                        <span className="flex items-center gap-2">
                          <span style={{ width: '16px', height: '12px', background: '#fdba74', borderRadius: '2px', display: 'inline-block' }} />
                          Litres
                        </span>
                        <span className="flex items-center gap-2">
                          <span style={{ width: '16px', height: '2px', background: '#ef4444', display: 'inline-block', position: 'relative' }}>
                            <span style={{ position: 'absolute', top: '-3px', left: '6px', width: '5px', height: '5px', borderRadius: '50%', background: '#ef4444', border: '1px solid white' }} />
                          </span>
                          <span style={{ marginLeft: '4px' }}>Niveau carburant US</span>
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center" style={{ padding: '60px 0', color: '#d1d5db' }}>
                      <FiTruck style={{ fontSize: '48px', marginBottom: '12px' }} />
                      <p style={{ fontWeight: 600, fontSize: '14px' }}>Aucune donnée GPS pour cette période</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── INFORMATIONS TAB ── */}
            {detailTab === 'informations' && (
              <div style={{
                background: 'white', borderRadius: '0 0 16px 16px', padding: '24px', marginBottom: '20px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
              }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1px', background: '#f3f4f6', borderRadius: '12px', overflow: 'hidden' }}>
                  <div style={{ background: 'white', padding: '20px' }}>
                    <p style={{ fontSize: '10px', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>Immatriculation</p>
                    <p style={{ fontSize: '17px', fontWeight: 800, color: '#1a1a2e' }}>{selRow.camion}</p>
                  </div>
                  <div style={{ background: 'white', padding: '20px' }}>
                    <p style={{ fontSize: '10px', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>Qté GPS</p>
                    <p style={{ fontSize: '17px', fontWeight: 800, color: '#10b981' }}>▲ {selRow.qttGps} L</p>
                  </div>
                  <div style={{ background: 'white', padding: '20px' }}>
                    <p style={{ fontSize: '10px', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>Qté Déclarée</p>
                    <p style={{ fontSize: '17px', fontWeight: 800, color: '#f97316' }}>{selRow.qttDeclaree} L</p>
                  </div>
                  <div style={{ background: 'white', padding: '20px' }}>
                    <p style={{ fontSize: '10px', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>Écart</p>
                    <p style={{ fontSize: '17px', fontWeight: 800, color: selRow.ecart === 0 ? '#10b981' : '#ef4444' }}>
                      {selRow.ecart > 0 ? '+' : ''}{selRow.ecart} L
                    </p>
                    {selRow.statut === 'conforme'
                      ? <span style={{ fontSize: '10px', fontWeight: 700, color: '#10b981', background: '#ecfdf5', padding: '2px 8px', borderRadius: '6px' }}>✅ Conforme</span>
                      : <span style={{ fontSize: '10px', fontWeight: 700, color: '#ef4444', background: '#fef2f2', padding: '2px 8px', borderRadius: '6px' }}>🚩 Fraude probable</span>
                    }
                  </div>
                </div>
                <div style={{ marginTop: '16px' }}>
                  {[
                    { label: 'Station', value: selRow.lieu },
                    { label: 'Date', value: selRow.date },
                    { label: 'Heure', value: selRow.heure },
                    { label: 'Type', value: selRow.type },
                    { label: 'Prix', value: selRow.prix > 0 ? `${selRow.prix.toFixed(2)} DT` : '—' },
                    ...(selRow.capacite ? [{ label: 'Capacité réservoir', value: `${selRow.capacite} L` }] : []),
                  ].map((item, idx) => (
                    <div key={idx} className="flex justify-between" style={{ padding: '10px 0', borderBottom: '1px solid #f9fafb' }}>
                      <span style={{ fontSize: '12px', color: '#9ca3af', fontWeight: 500 }}>{item.label}</span>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: '#374151' }}>{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
