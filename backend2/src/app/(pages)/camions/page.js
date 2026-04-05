'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { FiSearch, FiBarChart2, FiCalendar, FiClock, FiUser, FiTruck, FiX, FiChevronRight, FiMapPin, FiActivity, FiMap, FiPhone } from 'react-icons/fi';
import { FaGasPump, FaWarehouse, FaUserTie, FaParking, FaExclamationTriangle, FaDoorOpen, FaCheckCircle, FaTimesCircle } from 'react-icons/fa';
import { camionsAPI } from '@/services/api';
import { useMapContext } from '@/context/MapContext';
import { reverseGeocode } from '@/services/geocoding';
import MapModal from '@/components/map/MapModal';

/* ═══ Leaflet icon ═══ */
const createIcon = (color, letter) => {
    if (typeof window === 'undefined') return null;
    const L = require('leaflet');
    return L.divIcon({
        className: 'custom-marker',
        html: `<div style="width:32px;height:32px;background:${color};border:3px solid white;border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-weight:bold;font-size:13px;box-shadow:0 2px 8px rgba(0,0,0,0.3)">${letter}</div>`,
        iconSize: [32, 32], iconAnchor: [16, 16], popupAnchor: [0, -20],
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

/* ═══ Segment config — mapped to backend types ═══ */
const segmentColors = {
    driving:            { bg: '#22c55e', label: 'En route',          text: 'white',   icon: FiTruck,              dot: '#22c55e' },
    stop_conforme:      { bg: '#f59e0b', label: 'Arrêt Conforme',    text: 'white',   icon: FaCheckCircle,        dot: '#f59e0b' },
    stop_non_conforme:  { bg: '#ef4444', label: 'Arrêt Non Conf.',   text: 'white',   icon: FaExclamationTriangle, dot: '#ef4444' },
    ravitaillement:     { bg: '#f97316', label: 'Ravitaillement',    text: 'white',   icon: FaGasPump,            dot: '#f97316' },
    ouverture_porte:    { bg: '#8b5cf6', label: 'Ouverture Porte',   text: 'white',   icon: FaDoorOpen,           dot: '#8b5cf6' },
    stop:               { bg: '#f59e0b', label: 'Arrêt',             text: 'white',   icon: FaParking,            dot: '#f59e0b' },
    stop_long:          { bg: '#ef4444', label: 'Non conforme',      text: 'white',   icon: FaExclamationTriangle, dot: '#ef4444' },
    client:             { bg: '#8b5cf6', label: 'Client',            text: 'white',   icon: FaUserTie,            dot: '#8b5cf6' },
    depot:              { bg: '#06b6d4', label: 'Dépôt',             text: 'white',   icon: FaWarehouse,          dot: '#06b6d4' },
    inactive:           { bg: '#e2e8f0', label: 'Inactif',           text: '#94a3b8', icon: null,                 dot: '#cbd5e1' },
};

const SITE_OPTIONS = ['BAR', 'JER', 'GAB', 'SAL', 'CAP', '9901', 'GAS', 'BSL', 'BIZ', 'SFX', 'TUN', 'BKS'];

const fmtTime = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const fmtDuration = (minutes) => {
    if (!minutes && minutes !== 0) return '';
    const mins = Math.round(minutes);
    if (mins < 60) return `${mins}min`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}h${m > 0 ? String(m).padStart(2, '0') : '00'}`;
};

const fmtDurationFromISO = (start, end) => {
    const ms = new Date(end) - new Date(start);
    return fmtDuration(ms / 60000);
};

const normalizeSite = (value) => (value || '').toString().trim().toUpperCase();

const toNumber = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
};

const buildVoyageMapPoints = (voyageData, trajetPoints = []) => {
    const points = [];

    // trajetPoints can be [[lat,lng], ...] arrays or {latitude, longitude} objects
    const getLat = (pt) => Array.isArray(pt) ? toNumber(pt[0]) : toNumber(pt.latitude ?? pt.lat);
    const getLng = (pt) => Array.isArray(pt) ? toNumber(pt[1]) : toNumber(pt.longitude ?? pt.lng);

    if (trajetPoints.length > 0) {
        const first = trajetPoints[0];
        const last = trajetPoints[trajetPoints.length - 1];

        const lat1 = getLat(first);
        const lng1 = getLng(first);
        if (lat1 != null && lng1 != null) {
            points.push({
                id: 'gps-depart', lat: lat1, lng: lng1,
                label: 'Départ camion',
                info: 'Départ',
                color: '#22c55e',
            });
        }

        if (trajetPoints.length > 1) {
            const lat2 = getLat(last);
            const lng2 = getLng(last);
            if (lat2 != null && lng2 != null) {
                points.push({
                    id: 'gps-arrivee', lat: lat2, lng: lng2,
                    label: 'Arrivée camion',
                    info: 'Arrivée',
                    color: '#ef4444',
                });
            }
        }
    }

    (voyageData?.segments || []).forEach((seg, idx) => {
        if (seg.type === 'driving') return; // Ne pas afficher la conduite comme un point unique
        const lat = toNumber(seg.lat);
        const lng = toNumber(seg.lng);
        if (lat == null || lng == null) return;
        const segColor = segmentColors[seg.type] || segmentColors.inactive;

        points.push({
            id: `evt-${idx}`,
            lat,
            lng,
            label: segColor.label,
            info: `${fmtTime(seg.start)} -> ${fmtTime(seg.end)}${seg.poiName ? ` | ${seg.poiName}` : ''}`,
            color: segColor.bg,
        });
    });

    return points;
};

/* ═══ POPOVER COMPONENT ═══ */
const SegmentPopover = ({ segment, position, onClose }) => {
    const ref = useRef(null);
    const segColor = segmentColors[segment.type] || segmentColors.inactive;
    const SegIcon = segColor.icon;

    useEffect(() => {
        const handleClick = (e) => {
            if (ref.current && !ref.current.contains(e.target)) onClose();
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [onClose]);

    const duration = segment.duration || Math.round((new Date(segment.end) - new Date(segment.start)) / 60000);

    return (
        <div ref={ref}
            className="fixed z-[9999]"
            style={{ left: position.x, top: position.y, transform: 'translate(-50%, -100%)' }}>
            <div style={{
                background: 'white', borderRadius: '14px', boxShadow: '0 8px 30px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.04)',
                padding: '14px 16px', minWidth: '240px', maxWidth: '320px', fontFamily: "'Inter', sans-serif",
            }}>
                {/* Header */}
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                        <div className="flex items-center justify-center w-7 h-7 rounded-lg" style={{ background: segColor.bg }}>
                            {SegIcon && <SegIcon className="text-white" style={{ fontSize: '12px' }} />}
                        </div>
                        <div>
                            <p style={{ fontWeight: 800, fontSize: '13px', color: '#1a1a2e' }}>{segColor.label}</p>
                            <p style={{ fontSize: '11px', color: '#9ca3af', fontWeight: 500 }}>
                                {fmtTime(segment.start)} — {fmtTime(segment.end)}
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} style={{
                        background: '#f3f4f6', border: 'none', borderRadius: '6px', width: '24px', height: '24px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#6b7280',
                    }}>
                        <FiX size={12} />
                    </button>
                </div>

                {/* Separator */}
                <div style={{ height: '1px', background: '#f3f4f6', margin: '0 -16px', marginBottom: '8px' }} />

                {/* Details */}
                <div className="space-y-1.5" style={{ fontSize: '12px' }}>
                    {segment.type !== 'driving' && (
                        <div className="flex items-center gap-1.5">
                            <FiClock style={{ color: '#9ca3af', flexShrink: 0, fontSize: '13px' }} />
                            <span style={{ color: '#6b7280' }}>Durée :</span>
                            <span style={{ fontWeight: 700, color: '#1a1a2e' }}>{fmtDuration(duration)}</span>
                        </div>
                    )}
                    {segment.type === 'driving' && (
                        <div className="flex items-center gap-1.5">
                            <FiActivity style={{ color: '#22c55e', flexShrink: 0, fontSize: '13px' }} />
                            <span style={{ color: '#6b7280' }}>Durée conduite :</span>
                            <span style={{ fontWeight: 700, color: '#22c55e' }}>{fmtDuration(duration)}</span>
                        </div>
                    )}
                    {segment.poiName && (
                        <div className="flex items-center gap-1.5">
                            <FiMapPin style={{ color: '#6366f1', flexShrink: 0, fontSize: '13px' }} />
                            <span style={{ color: '#6b7280' }}>Lieu :</span>
                            <span style={{ fontWeight: 600, color: '#1a1a2e' }}>{segment.poiName}</span>
                        </div>
                    )}
                    {segment.distance != null && (
                        <div className="flex items-center gap-1.5">
                            <FiChevronRight style={{ color: '#9ca3af', flexShrink: 0, fontSize: '13px' }} />
                            <span style={{ color: '#6b7280' }}>Distance :</span>
                            <span style={{ fontWeight: 700, color: '#1a1a2e' }}>{segment.distance} m</span>
                        </div>
                    )}
                    {/* Door state for stops */}
                    {(segment.type === 'stop_conforme' || segment.type === 'stop_non_conforme' || segment.type === 'stop' || segment.type === 'stop_long') && (
                        <div className="flex items-center gap-1.5">
                            <FaDoorOpen style={{ color: '#7c3aed', flexShrink: 0, fontSize: '13px' }} />
                            <span style={{ color: '#6b7280' }}>Porte :</span>
                            {segment.porteOuverte
                                ? <span style={{ fontWeight: 700, color: '#ef4444', background: '#fef2f2', padding: '1px 6px', borderRadius: '4px', fontSize: '11px' }}>Ouverte</span>
                                : <span style={{ fontWeight: 700, color: '#22c55e', background: '#dcfce7', padding: '1px 6px', borderRadius: '4px', fontSize: '11px' }}>Fermée</span>
                            }
                        </div>
                    )}
                    {segment.conforme != null && segment.type !== 'driving' && (
                        <div className="flex items-center gap-1.5" style={{ marginTop: '4px' }}>
                            {segment.conforme
                                ? <><FaCheckCircle style={{ color: '#22c55e', fontSize: '13px' }} /><span style={{ fontWeight: 700, color: '#22c55e' }}>Conforme</span></>
                                : <><FaTimesCircle style={{ color: '#ef4444', fontSize: '13px' }} /><span style={{ fontWeight: 700, color: '#ef4444' }}>Non conforme</span></>
                            }
                        </div>
                    )}
                    {segment.type === 'ouverture_porte' && (
                        <div style={{ marginTop: '6px', padding: '8px 10px', background: '#f5f3ff', borderRadius: '8px', border: '1px solid #ede9fe' }}>
                            <div className="flex items-center gap-1.5" style={{ marginBottom: '4px' }}>
                                <FaDoorOpen style={{ color: '#7c3aed', fontSize: '12px' }} />
                                <span style={{ fontWeight: 700, fontSize: '11px', color: '#7c3aed' }}>État Porte</span>
                            </div>
                            {segment.tempOuv != null && (
                                <div className="space-y-1" style={{ fontSize: '11px' }}>
                                    <div className="flex items-center justify-between">
                                        <span style={{ color: '#6b7280' }}>🌡️ Ouverture</span>
                                        <span style={{ fontWeight: 700, color: '#ef4444' }}>{segment.tempOuv}°C</span>
                                    </div>
                                    {segment.tempFer != null && (
                                        <div className="flex items-center justify-between">
                                            <span style={{ color: '#6b7280' }}>🌡️ Fermeture</span>
                                            <span style={{ fontWeight: 700, color: '#3b82f6' }}>{segment.tempFer}°C</span>
                                        </div>
                                    )}
                                    {segment.tempVar != null && (
                                        <div className="flex items-center justify-between">
                                            <span style={{ color: '#6b7280' }}>📊 Variation</span>
                                            <span style={{ fontWeight: 700, color: segment.tempVar > 0 ? '#ef4444' : '#22c55e' }}>Δ{segment.tempVar}°C</span>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                    {segment.type !== 'ouverture_porte' && segment.tempOuv != null && (
                        <div className="flex items-center gap-1.5 pt-1" style={{ borderTop: '1px solid #f3f4f6' }}>
                            <span style={{ color: '#6b7280' }}>🌡️ Temp :</span>
                            <span style={{ fontWeight: 600, color: '#1a1a2e' }}>
                                {segment.tempOuv}°C → {segment.tempFer}°C {segment.tempVar != null && `(Δ${segment.tempVar}°C)`}
                            </span>
                        </div>
                    )}
                </div>
            </div>
            {/* Arrow */}
            <div style={{
                width: 0, height: 0, margin: '0 auto',
                borderLeft: '10px solid transparent', borderRight: '10px solid transparent', borderTop: '10px solid white',
            }} />
        </div>
    );
};

/* ═══ GANTT BAR COMPONENT ═══ */
const GanttBar = ({ data, onClickSegment, onClickCamion, isSelected = false }) => {
    const dayStart = useMemo(() => {
        if (!data.segments?.length) return 0;
        const d = new Date(data.segments[0]?.start);
        return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    }, [data.segments]);
    const dayMs = 24 * 60 * 60 * 1000;

    return (
        <div className="flex items-stretch gap-0">
            {/* Left column — camion info */}
            <div className="w-[280px] flex-shrink-0 pr-3 py-3 border-r pl-3 cursor-pointer hover:bg-orange-50/40 transition-colors"
                style={{
                    borderColor: isSelected ? '#fed7aa' : '#f3f4f6',
                    background: isSelected ? '#fff7ed' : 'transparent',
                }}
                onClick={() => onClickCamion?.(data)}>
                {/* Camion + Voyage badge */}
                <div className="flex items-center gap-2">
                    <div className="flex items-center justify-center w-7 h-7 rounded-lg" style={{ background: '#fff7ed' }}>
                        <FiTruck className="text-orange-500 text-[13px]" />
                    </div>
                    <span style={{ fontWeight: 800, fontSize: '13.5px', color: '#1a1a2e', letterSpacing: '-0.3px' }}>{data.camion}</span>
                    {data.voycle && (
                        <span style={{
                            padding: '2px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: 700,
                            background: '#dbeafe', color: '#2563eb',
                        }}>V{data.voycle}</span>
                    )}
                </div>
                {/* Chauffeur + horaires */}
                <div className="flex items-center gap-1.5 mt-1.5">
                    <FiUser style={{ color: '#9ca3af', fontSize: '11px', flexShrink: 0 }} />
                    <span style={{ fontSize: '12px', color: '#6b7280', fontWeight: 500 }} className="truncate">{data.chauffeur || '—'}</span>
                    {data.heureDep && (
                        <span style={{ fontSize: '10px', color: '#3b82f6', fontWeight: 600, marginLeft: 'auto', flexShrink: 0 }}>
                            {data.heureDep} → {data.heureFin || '?'}
                        </span>
                    )}
                </div>

                {/* Noms clients */}
                {data.clients?.length > 0 && (
                    <div className="mt-1.5 space-y-0.5">
                        {data.clients.slice(0, 3).map((c, ci) => (
                            <div key={ci} className="flex items-center gap-1.5">
                                <span style={{
                                    width: '16px', height: '16px', borderRadius: '5px',
                                    background: '#f3e8ff', color: '#7c3aed', fontSize: '8px', fontWeight: 700,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                }}>{c.ordre || ci + 1}</span>
                                <span style={{ fontSize: '10px', fontWeight: 600, color: '#374151' }} className="truncate" title={c.client}>
                                    {c.client || '—'}
                                </span>
                            </div>
                        ))}

                        {data.clients.length > 3 && (
                            <p style={{ fontSize: '10px', color: '#9ca3af', fontWeight: 600, marginLeft: '22px' }}>
                                +{data.clients.length - 3} autre(s) client(s)
                            </p>
                        )}
                    </div>
                )}
            </div>

            {/* Gantt bar */}
            <div className="flex-1 h-[42px] rounded-lg relative overflow-hidden mx-2 self-center"
                style={{ background: '#e8edf3' }}>
                {data.hasData && data.segments?.map((seg, i) => {
                    const start = new Date(seg.start).getTime();
                    const end = new Date(seg.end).getTime();
                    const leftPct = ((start - dayStart) / dayMs) * 100;
                    const widthPct = Math.max(((end - start) / dayMs) * 100, 0.3);
                    const segColor = segmentColors[seg.type] || segmentColors.inactive;
                    const duration = fmtDurationFromISO(seg.start, seg.end);
                    const showLabel = widthPct > 2.5;

                    return (
                        <div key={i}
                            className="absolute top-0 h-full flex items-center justify-center gap-0.5 cursor-pointer transition-all"
                            style={{
                                left: `${Math.max(0, Math.min(100, leftPct))}%`,
                                width: `${Math.min(widthPct, 100 - Math.max(0, leftPct))}%`,
                                background: segColor.bg,
                                borderRadius: '5px',
                                zIndex: seg.type === 'inactive' ? 0 : 1,
                            }}
                            onClick={(e) => {
                                e.stopPropagation();
                                const rect = e.currentTarget.getBoundingClientRect();
                                onClickSegment(seg, { x: rect.left + rect.width / 2, y: rect.top - 8 });
                            }}
                        >
                            {showLabel && (
                                <span style={{
                                    fontSize: '10.5px', fontWeight: 800, color: segColor.text || 'white',
                                    textShadow: '0 1px 2px rgba(0,0,0,0.15)', userSelect: 'none', letterSpacing: '-0.2px',
                                }}>
                                    {duration}
                                </span>
                            )}
                        </div>
                    );
                })}
                {!data.hasData && (
                    <div className="absolute inset-0 flex items-center justify-center" style={{ fontSize: '11px', color: '#94a3b8' }}>
                        Pas de données GPS
                    </div>
                )}
            </div>
        </div>
    );
};

/* ═══ SIDE PANEL ═══ */
const SidePanel = ({ data, onClose, onShowMap }) => {
    if (!data) return null;

    const segments = data.segments || [];
    const drivingMin = segments.filter(s => s.type === 'driving').reduce((s, seg) => s + (seg.duration || 0), 0);
    const stopMin = segments.filter(s => ['stop_conforme', 'stop_non_conforme', 'stop', 'stop_long'].includes(s.type)).reduce((s, seg) => s + (seg.duration || 0), 0);

    const stopTypes = ['stop_conforme', 'stop_non_conforme', 'stop', 'stop_long'];
    const nbStops = segments.filter(s => stopTypes.includes(s.type)).length;
    const hasVoyage = data.voycle != null && String(data.voycle).trim() !== '';
    const chauffeurPhone = data.telephone && data.telephone !== '—' ? data.telephone : null;
    const primaryClient = data.clients?.find((c) => c?.client)?.client || data.clients?.[0]?.code || 'Destination non renseignee';

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            right: 0,
            bottom: 0,
            width: '430px',
            zIndex: 9998,
            background: '#f8fafc',
            boxShadow: '-8px 0 40px rgba(15, 23, 42, 0.14)',
            display: 'flex',
            flexDirection: 'column',
            fontFamily: "'Inter', sans-serif",
            animation: 'slideIn 0.25s ease-out',
        }}>
            <style>{`@keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }`}</style>

            {/* Header */}
            <div style={{
                padding: '22px 20px 18px',
                borderBottom: '1px solid #f1f5f9',
                flexShrink: 0,
                background: 'linear-gradient(135deg, #ff7f1f 0%, #ff8f3f 100%)',
            }}>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center rounded-xl" style={{ width: '48px', height: '48px', background: 'rgba(255,255,255,0.22)' }}>
                            <FiTruck style={{ color: 'white', fontSize: '20px' }} />
                        </div>
                        <div>
                            <p style={{ fontWeight: 800, fontSize: '36px', lineHeight: 1, color: 'white', letterSpacing: '-0.6px' }}>{data.camion}</p>
                            {hasVoyage && (
                                <p style={{
                                    display: 'inline-flex',
                                    marginTop: '10px',
                                    padding: '5px 12px',
                                    borderRadius: '999px',
                                    background: 'rgba(255,255,255,0.24)',
                                    color: 'white',
                                    fontSize: '15px',
                                    fontWeight: 700,
                                    lineHeight: 1,
                                }}>V{data.voycle}</p>
                            )}
                        </div>
                    </div>

                    <button
                        onClick={onClose}
                        style={{
                            width: '30px',
                            height: '30px',
                            borderRadius: '8px',
                            border: 'none',
                            background: 'transparent',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'white',
                            opacity: 0.92,
                        }}
                    >
                        <FiX size={18} />
                    </button>
                </div>
            </div>

            {/* Infos summary */}
            <div style={{ padding: '14px 20px 10px', borderBottom: '1px solid #e2e8f0', flexShrink: 0, background: 'white' }}>
                <div style={{
                    border: '1px solid #d1d5db',
                    borderRadius: '12px',
                    padding: '13px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '10px',
                }}>
                    <div className="flex items-center gap-3 min-w-0">
                        <FiUser style={{ color: '#f97316', fontSize: '16px', flexShrink: 0 }} />
                        <p className="truncate" style={{ fontSize: '20px', fontWeight: 800, color: '#0f172a', lineHeight: 1 }}>{data.chauffeur || '—'}</p>
                    </div>
                    {chauffeurPhone && (
                        <div className="flex items-center gap-2" style={{ color: '#64748b', flexShrink: 0, marginLeft: '8px' }}>
                            <FiPhone style={{ fontSize: '14px' }} />
                            <span style={{ fontSize: '14px', fontWeight: 500 }}>{chauffeurPhone}</span>
                        </div>
                    )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                    <div style={{ background: 'white', borderRadius: '12px', padding: '10px', border: '1px solid #c7d2fe' }}>
                        <div className="flex items-center gap-1.5" style={{ marginBottom: '4px' }}>
                            <FiClock style={{ color: '#2563eb', fontSize: '12px' }} />
                            <span style={{ fontSize: '12px', color: '#2563eb', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Horaires</span>
                        </div>
                        <p style={{ fontSize: '18px', fontWeight: 800, color: '#111827', lineHeight: 1.2 }}>{data.heureDep || '—'} → {data.heureFin || '—'}</p>
                    </div>

                    <div style={{ background: '#f0fdf4', borderRadius: '12px', padding: '10px', border: '1px solid #bbf7d0' }}>
                        <div className="flex items-center gap-1.5" style={{ marginBottom: '4px' }}>
                            <FiTruck style={{ color: '#16a34a', fontSize: '12px' }} />
                            <span style={{ fontSize: '12px', color: '#16a34a', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Conduite</span>
                        </div>
                        <p style={{ fontSize: '26px', fontWeight: 800, color: '#16a34a', lineHeight: 1.2 }}>{drivingMin > 0 ? fmtDuration(drivingMin) : '0h00'}</p>
                    </div>

                    <div style={{ background: '#fffbeb', borderRadius: '12px', padding: '10px', border: '1px solid #fde68a' }}>
                        <div className="flex items-center gap-1.5" style={{ marginBottom: '4px' }}>
                            <FaParking style={{ color: '#f59e0b', fontSize: '11px' }} />
                            <span style={{ fontSize: '12px', color: '#d97706', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Arrêts</span>
                        </div>
                        <p style={{ fontSize: '26px', fontWeight: 800, color: '#d97706', lineHeight: 1.2 }}>{stopMin > 0 ? fmtDuration(stopMin) : '0h00'}</p>
                        <p style={{ fontSize: '11px', color: '#92400e', fontWeight: 600, marginTop: '2px' }}>{nbStops} arrêt(s)</p>
                    </div>
                </div>

                <div style={{
                    marginTop: '10px',
                    border: '1px solid #fdba74',
                    borderRadius: '12px',
                    padding: '10px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    color: '#ea580c',
                    fontWeight: 700,
                    background: '#fff7ed',
                    fontSize: '17px',
                }}>
                    <FaWarehouse style={{ fontSize: '15px', flexShrink: 0 }} />
                    <span className="truncate">{primaryClient}</span>
                </div>

                <button
                    type="button"
                    onClick={onShowMap}
                    style={{
                        width: '100%',
                        marginTop: '10px',
                        border: '1px solid #d1d5db',
                        background: '#f8fafc',
                        borderRadius: '10px',
                        padding: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        color: '#111827',
                        fontWeight: 700,
                        cursor: 'pointer',
                        fontSize: '16px',
                    }}
                >
                    <FiMap style={{ fontSize: '16px' }} />
                    Voir le trajet sur la carte
                </button>
            </div>

            {/* Timeline */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px 20px', background: 'white' }}>
                <p style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '10px' }}>
                    Detail du trajet
                </p>
                <div className="space-y-0">
                    {segments.map((seg, i) => {
                        const segColor = segmentColors[seg.type] || segmentColors.inactive;
                        const dur = seg.duration || Math.round((new Date(seg.end) - new Date(seg.start)) / 60000);
                        return (
                            <div key={i} className="flex gap-3" style={{ paddingBottom: '3px' }}>
                                <div className="flex flex-col items-center" style={{ width: '22px', flexShrink: 0 }}>
                                    <div style={{
                                        width: '11px',
                                        height: '11px',
                                        borderRadius: '50%',
                                        background: segColor.dot || segColor.bg,
                                        border: '2px solid white',
                                        boxShadow: `0 0 0 2px ${segColor.bg}33`,
                                        zIndex: 1,
                                    }} />
                                    {i < segments.length - 1 && (
                                        <div style={{ width: '2px', flex: 1, background: '#e2e8f0', marginTop: '-1px' }} />
                                    )}
                                </div>

                                <div style={{
                                    flex: 1,
                                    paddingBottom: '12px',
                                    borderBottom: i < segments.length - 1 ? '1px solid #f8fafc' : 'none',
                                }}>
                                    <div className="flex items-center gap-2" style={{ marginBottom: '2px' }}>
                                        <span style={{ fontWeight: 700, fontSize: '13px', color: '#0f172a' }}>{segColor.label}</span>
                                        <span style={{ fontSize: '12px', color: '#64748b', marginLeft: 'auto', whiteSpace: 'nowrap' }}>
                                            {fmtTime(seg.start)} — {fmtTime(seg.end)}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2" style={{ fontSize: '12px', color: '#64748b' }}>
                                        {seg.poiName && <span>{seg.poiName}</span>}
                                        {!seg.poiName && seg.address && seg.address !== '—' && <span>{seg.address}</span>}
                                        {!seg.poiName && (!seg.address || seg.address === '—') && <span>{fmtDuration(dur)}</span>}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

/* ═══ MAIN COMPONENT ═══ */
const Camions = () => {
    const { setMapData, setPolylines, setFlyTo } = useMapContext();
    const [camions, setCamions] = useState([]);
    const [trajet, setTrajet] = useState([]);
    const [addresses, setAddresses] = useState(new Map());
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Gantt state
    const [ganttData, setGanttData] = useState([]);
    const [ganttDate, setGanttDate] = useState(new Date().toISOString().split('T')[0]);
    const [ganttLoading, setGanttLoading] = useState(false);
    const [ganttSearch, setGanttSearch] = useState('');
    const [ganttSite, setGanttSite] = useState('ALL');

    // Popover state
    const [activePopover, setActivePopover] = useState(null); // { segment, position }

    // Side panel state
    const [selectedVoyage, setSelectedVoyage] = useState(null);
    const [selectedVoyageId, setSelectedVoyageId] = useState(null);
    const [isRouteMapOpen, setIsRouteMapOpen] = useState(false);
    const [selectedRoutePoints, setSelectedRoutePoints] = useState([]);
    const [selectedRoutePath, setSelectedRoutePath] = useState([]);

    const loadCamions = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await camionsAPI.getCamions();
            const camionsData = response.data || [];
            setCamions(camionsData);

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
                        info: `📍 ${camion.localisation || '—'} · ${camion.vitesse ?? 0} km/h`,
                        badgeLabel: config.label,
                        badgeColor: config.color,
                    };
                });

            setMapData({ markers, polylines: [], flyTo: null, selectedMarkerId: null });

            // Reverse geocoding runs sequentially to respect Nominatim limits (1 req/sec) and avoid freezing the browser.
            const fetchAddressesSequentially = async () => {
                const currentAddresses = new Map();
                const toGeocode = camionsData.filter((c) => c.lat != null && c.lng != null);

                for (const camion of toGeocode) {
                    try {
                        const address = await reverseGeocode(camion.lat, camion.lng);
                        if (address && address !== '—' && !address.match(/^[0-9.-]+,\s*[0-9.-]+$/)) {
                            currentAddresses.set(camion.plaque, address);
                            setAddresses(new Map(currentAddresses));
                            
                            // Update map markers incrementally
                            setMapData(prev => {
                                if (!prev || !prev.markers) return prev;
                                return {
                                    ...prev,
                                    markers: prev.markers.map(m => 
                                        m.id === camion.plaque 
                                            ? { ...m, info: `📍 ${address} · ${camion.vitesse ?? 0} km/h` } 
                                            : m
                                    )
                                };
                            });
                        }
                    } catch (err) {
                        console.warn('Geocoding err', err);
                    }
                    // Attendre 1.1s entre chaque requête API OpenStreetMap (limite de 1 req/s)
                    await new Promise(r => setTimeout(r, 1100));
                }
            };
            
            // Start the fetching process in the background without blocking the main thread
            fetchAddressesSequentially();
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
        loadGantt(ganttDate);
    }, [ganttDate, loadGantt]);

    const availableSites = useMemo(() => {
        const dynamicSites = new Set(
            ganttData.flatMap(d => (d.clients || []).map(c => normalizeSite(c.client))).filter(Boolean)
        );

        const merged = [...SITE_OPTIONS];
        dynamicSites.forEach((s) => {
            if (!merged.includes(s)) merged.push(s);
        });

        return merged;
    }, [ganttData]);

    const filteredGantt = useMemo(() => {
        const q = ganttSearch.toLowerCase().trim();
        return ganttData.filter((d) => {
            const matchesSearch = !q ||
                d.camion?.toLowerCase().includes(q) ||
                d.chauffeur?.toLowerCase().includes(q) ||
                String(d.voycle || '').includes(q) ||
                d.clients?.some(c => c.client?.toLowerCase().includes(q) || c.code?.toLowerCase().includes(q) || c.region?.toLowerCase().includes(q));

            const matchesSite = ganttSite === 'ALL' ||
                d.clients?.some(c => normalizeSite(c.client) === ganttSite || normalizeSite(c.code) === ganttSite);

            return matchesSearch && matchesSite;
        });
    }, [ganttData, ganttSearch, ganttSite]);

    const ganttStats = useMemo(() => {
        const uniqueCamions = new Set(filteredGantt.map(d => d.camion));
        const totalClients = filteredGantt.reduce((s, d) => s + (d.nbClients || 0), 0);
        return {
            totalClients,
            totalVoyages: filteredGantt.length,
            totalCamions: uniqueCamions.size,
        };
    }, [filteredGantt]);

    const loadTrajet = useCallback(async (plaque, options = {}) => {
        const { date, color = '#3b82f6' } = options;
        if (!plaque) {
            setTrajet([]);
            setPolylines([]);
            return [];
        }
        try {
            const response = await camionsAPI.getCamionTrajet(plaque, date ? { date } : {});
            const trajetData = response.data || [];
            setTrajet(trajetData);

            if (trajetData.length > 0) {
                setPolylines([{
                    positions: trajetData,
                    color,
                    weight: 4,
                    opacity: 0.8,
                }]);
            } else {
                setPolylines([]);
            }

            return trajetData;
        } catch {
            setTrajet([]);
            setPolylines([]);
            return [];
        }
    }, [setPolylines]);

    const handleSelectCamion = async (camion, options = {}) => {
        if (camion.lat != null && camion.lng != null) {
            if (!addresses.has(camion.plaque)) {
                const address = await reverseGeocode(camion.lat, camion.lng);
                setAddresses((prev) => new Map(prev).set(camion.plaque, address));
            }
            setFlyTo([camion.lat, camion.lng]);
        } else {
            setFlyTo(null);
        }
        return loadTrajet(camion.plaque, options);
    };

    const handleClickSegment = useCallback((segment, position) => {
        setActivePopover({ segment, position });
    }, []);

    const handleClickCamionRow = useCallback(async (voyageData) => {
        setSelectedVoyageId(voyageData.id);
        setSelectedVoyage(voyageData);
        setIsRouteMapOpen(false);

        let trajetPoints = [];
        // Also show the camion on the map
        const cam = camions.find(c => c.plaque === voyageData.camion);
        if (cam) {
            trajetPoints = await handleSelectCamion(cam, { date: ganttDate, color: '#f97316' });
        } else {
            trajetPoints = await loadTrajet(voyageData.camion, { date: ganttDate, color: '#f97316' });
            const firstPoint = trajetPoints[0];
            if (firstPoint?.latitude != null && firstPoint?.longitude != null) {
                setFlyTo([Number(firstPoint.latitude), Number(firstPoint.longitude)]);
            }
        }

        setSelectedRoutePoints(buildVoyageMapPoints(voyageData, trajetPoints));
        
        // Extract lat/lng for the Polyline (trajetPoints = [[lat,lng], ...])
        const path = trajetPoints
            .map(pt => Array.isArray(pt) ? [toNumber(pt[0]), toNumber(pt[1])] : [toNumber(pt.latitude ?? pt.lat), toNumber(pt.longitude ?? pt.lng)])
            .filter(coord => coord[0] != null && coord[1] != null);
        setSelectedRoutePath(path);
    }, [camions, ganttDate, handleSelectCamion, loadTrajet, setFlyTo]);

    /* ═══ Hours axis ═══ */
    const hours = Array.from({ length: 25 }, (_, i) => i);

    return (
        <div className="flex h-full" style={{ fontFamily: "'Inter', sans-serif" }}>
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

                {/* ── Top bar ── */}
                <div className="flex items-center justify-between px-5 pt-4 pb-3 bg-white" style={{ borderBottom: '1px solid #eee' }}>
                    <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#1a1a2e', letterSpacing: '-0.5px' }}>Camions</h2>
                    <div style={{
                        padding: '6px 14px', borderRadius: '10px', fontSize: '12px', fontWeight: 700,
                        display: 'inline-flex', alignItems: 'center', gap: '6px',
                        background: '#fff7ed', color: '#f97316', border: '1px solid #fed7aa',
                    }}>
                        <FiBarChart2 style={{ fontSize: '14px' }} /> Vue Gantt
                    </div>
                </div>

                {loading && (
                    <div className="flex justify-center" style={{ paddingTop: '120px' }}>
                        <div style={{ width: '44px', height: '44px', border: '4px solid #f97316', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                    </div>
                )}
                {error && !loading && (
                    <div style={{ margin: '16px 20px', padding: '16px 20px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '14px', color: '#dc2626', fontSize: '13px' }}>
                        {error}
                        <button type="button" onClick={loadCamions} style={{ display: 'block', marginTop: '8px', color: '#f97316', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px' }}>Réessayer</button>
                    </div>
                )}

                {/* ═══ GANTT VIEW ═══ */}
                <div className="flex-1 overflow-y-auto px-5 py-4">

                    {/* Legend */}
                    <div className="flex flex-wrap items-center gap-4 mb-4">
                        {Object.entries(segmentColors)
                            .filter(([key]) => ['driving', 'stop_conforme', 'stop_non_conforme', 'ravitaillement', 'ouverture_porte'].includes(key))
                            .map(([key, val]) => (
                                <div key={key} className="flex items-center gap-1.5" style={{ fontSize: '12px' }}>
                                    <span style={{ width: '12px', height: '12px', borderRadius: '4px', background: val.bg, display: 'inline-block' }} />
                                    <span style={{ color: '#6b7280', fontWeight: 600 }}>{val.label}</span>
                                </div>
                            ))}
                    </div>

                    {/* Toolbar */}
                    <div className="flex flex-wrap items-center gap-3 mb-4">
                        <div className="flex items-center gap-2">
                            <FiCalendar style={{ color: '#9ca3af' }} />
                            <input type="date" value={ganttDate} onChange={e => setGanttDate(e.target.value)}
                                style={{
                                    padding: '9px 14px', border: '1px solid #e5e7eb', borderRadius: '12px', fontSize: '13px',
                                    fontWeight: 600, fontFamily: "'Inter', sans-serif", outline: 'none',
                                }} />
                        </div>
                        <div style={{ position: 'relative', flex: 1, maxWidth: '300px' }}>
                            <FiSearch style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                            <input type="text" value={ganttSearch} onChange={e => setGanttSearch(e.target.value)}
                                placeholder="Rechercher camion, chauffeur, client..."
                                style={{
                                    width: '100%', padding: '9px 14px 9px 38px', border: '1px solid #e5e7eb', borderRadius: '12px',
                                    fontSize: '13px', fontFamily: "'Inter', sans-serif", outline: 'none',
                                }} />
                        </div>
                        <select
                            value={ganttSite}
                            onChange={(e) => setGanttSite(e.target.value)}
                            style={{
                                minWidth: '210px',
                                height: '40px',
                                padding: '9px 14px',
                                border: '1px solid #e5e7eb',
                                borderRadius: '12px',
                                background: 'white',
                                fontSize: '13px',
                                fontWeight: 400,
                                fontFamily: "'Inter', sans-serif",
                                color: '#6b7280',
                                outline: 'none',
                                cursor: 'pointer',
                            }}
                        >
                            <option value="ALL">Tous les sites</option>
                            {availableSites.map((site) => (
                                <option key={site} value={site}>{site}</option>
                            ))}
                        </select>
                        <div className="flex items-center gap-2 ml-auto">
                            <span style={{
                                padding: '5px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: 700,
                                background: '#dbeafe', color: '#2563eb', border: '1px solid #bfdbfe',
                            }}>
                                {ganttStats.totalVoyages} camion{ganttStats.totalVoyages > 1 ? 's' : ''}
                            </span>
                            <span style={{
                                padding: '5px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: 700,
                                background: '#f3e8ff', color: '#7c3aed', border: '1px solid #e9d5ff',
                            }}>
                                {ganttStats.totalClients} client{ganttStats.totalClients > 1 ? 's' : ''}
                            </span>
                            <span style={{
                                padding: '5px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: 700,
                                background: '#dcfce7', color: '#16a34a', border: '1px solid #bbf7d0',
                            }}>
                                {ganttStats.totalCamions} camion{ganttStats.totalCamions > 1 ? 's' : ''}
                            </span>
                        </div>
                    </div>

                    {ganttLoading ? (
                        <div className="flex justify-center" style={{ padding: '80px 0' }}>
                            <div style={{ width: '36px', height: '36px', border: '4px solid #f97316', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                        </div>
                    ) : (
                        <div style={{
                            background: 'white', borderRadius: '16px', border: '1px solid #f3f4f6',
                            boxShadow: '0 1px 4px rgba(0,0,0,0.04)', overflow: 'hidden',
                        }}>
                            {/* Time axis */}
                            <div className="flex items-center" style={{ borderBottom: '1px solid #e5e7eb', background: '#fafbfc' }}>
                                <div style={{
                                    width: '280px', flexShrink: 0, padding: '10px 16px',
                                    fontSize: '10px', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '1px',
                                    borderRight: '1px solid #f3f4f6',
                                }}>
                                    CAMIONS
                                </div>
                                <div style={{ flex: 1, position: 'relative', height: '36px', margin: '0 8px' }}>
                                    {hours.map(h => (
                                        <div key={h} style={{ position: 'absolute', top: 0, height: '100%', left: `${(h / 24) * 100}%` }}>
                                            <div style={{ height: '100%', borderLeft: '1px solid #e5e7eb' }} />
                                            <span style={{
                                                position: 'absolute', top: '10px', left: '4px',
                                                fontSize: '10px', color: '#9ca3af', fontWeight: 600,
                                            }}>
                                                {h < 24 ? `${String(h).padStart(2, '0')}:00` : ''}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Rows */}
                            <div>
                                {filteredGantt.map((d, i) => (
                                    <div key={d.id || `${d.camion}-${d.voycle}-${i}`}
                                        style={{
                                            borderBottom: i < filteredGantt.length - 1 ? '1px solid #f9fafb' : 'none',
                                            padding: '4px 8px',
                                            transition: 'background 0.15s',
                                            background: selectedVoyageId === d.id ? '#fff7ed' : 'transparent',
                                        }}
                                        className="hover:bg-orange-50/30"
                                    >
                                        <GanttBar
                                            data={d}
                                            onClickSegment={handleClickSegment}
                                            onClickCamion={handleClickCamionRow}
                                            isSelected={selectedVoyageId === d.id}
                                        />
                                    </div>
                                ))}
                            </div>

                            {filteredGantt.length === 0 && !ganttLoading && (
                                <div className="flex flex-col items-center justify-center" style={{ padding: '80px 0', color: '#d1d5db' }}>
                                    <FiBarChart2 style={{ fontSize: '48px', marginBottom: '12px' }} />
                                    <p style={{ fontWeight: 600, fontSize: '14px' }}>Aucune donnée pour cette date</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* ═══ Popover ═══ */}
            {activePopover && (
                <SegmentPopover
                    segment={activePopover.segment}
                    position={activePopover.position}
                    onClose={() => setActivePopover(null)}
                />
            )}

            {/* ═══ Side Panel ═══ */}
            {selectedVoyage && (
                <>
                    {/* Backdrop */}
                    <div
                        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.15)', zIndex: 9997 }}
                        onClick={() => {
                            setSelectedVoyage(null);
                            setSelectedVoyageId(null);
                        }}
                    />
                    <SidePanel
                        data={selectedVoyage}
                        onClose={() => {
                            setSelectedVoyage(null);
                            setSelectedVoyageId(null);
                        }}
                        onShowMap={() => setIsRouteMapOpen(true)}
                    />
                </>
            )}

            <MapModal
                isOpen={isRouteMapOpen}
                onClose={() => setIsRouteMapOpen(false)}
                positions={selectedRoutePoints}
                routePath={selectedRoutePath}
                title={selectedVoyage ? `Camion ${selectedVoyage.camion} - Voyage ${selectedVoyage.voycle || '—'}` : 'Camion sur la carte'}
            />
        </div>
    );
};

export default Camions;
