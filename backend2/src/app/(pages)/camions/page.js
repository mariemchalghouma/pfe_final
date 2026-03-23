'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { FiSearch, FiBarChart2, FiCalendar, FiClock, FiUser, FiTruck, FiX, FiChevronRight, FiMapPin, FiActivity, FiMap } from 'react-icons/fi';
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

const toNumber = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
};

const buildVoyageMapPoints = (voyageData, trajetPoints = []) => {
    const points = [];

    trajetPoints.forEach((pt, idx) => {
        const lat = toNumber(pt.latitude ?? pt.lat);
        const lng = toNumber(pt.longitude ?? pt.lng);
        if (lat == null || lng == null) return;

        const at = pt.gps_timestamp ? fmtTime(pt.gps_timestamp) : null;
        points.push({
            id: `gps-${idx}`,
            lat,
            lng,
            label: idx === 0 ? 'Départ camion' : idx === trajetPoints.length - 1 ? 'Arrivée camion' : `Point GPS #${idx + 1}`,
            info: at ? `Horodatage: ${at}` : 'Point GPS',
            color: idx === 0 ? '#22c55e' : idx === trajetPoints.length - 1 ? '#ef4444' : '#3b82f6',
        });
    });

    (voyageData?.segments || []).forEach((seg, idx) => {
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

    return (
        <div style={{
            position: 'fixed', top: 0, right: 0, bottom: 0, width: '400px', zIndex: 9998,
            background: 'white', boxShadow: '-8px 0 40px rgba(0,0,0,0.1)',
            display: 'flex', flexDirection: 'column', fontFamily: "'Inter', sans-serif",
            animation: 'slideIn 0.25s ease-out',
        }}>
            <style>{`@keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }`}</style>

            {/* Header */}
            <div style={{
                padding: '14px 20px',
                borderBottom: '1px solid #f3f4f6',
                flexShrink: 0,
                background: 'linear-gradient(135deg, #f97316, #fb923c)',
            }}>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                        <div className="flex items-center justify-center w-10 h-10 rounded-xl" style={{ background: 'rgba(255,255,255,0.2)' }}>
                            <FiTruck style={{ color: 'white', fontSize: '18px' }} />
                        </div>
                        <div>
                            <p style={{ fontWeight: 800, fontSize: '34px', lineHeight: 1, color: 'white', letterSpacing: '-0.3px' }}>{data.camion}</p>
                            {hasVoyage && (
                                <p style={{
                                    display: 'inline-flex',
                                    marginTop: '8px',
                                    padding: '3px 10px',
                                    borderRadius: '999px',
                                    background: 'rgba(255,255,255,0.25)',
                                    color: 'white',
                                    fontSize: '16px',
                                    fontWeight: 700,
                                    lineHeight: 1,
                                }}>V{data.voycle}</p>
                            )}
                        </div>
                    </div>
                    <button onClick={onClose} style={{
                        width: '32px', height: '32px', borderRadius: '8px', border: 'none',
                        background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'white', opacity: 0.9, transition: 'all 0.15s',
                    }}>
                        <FiX size={16} />
                    </button>
                </div>
            </div>

            {/* Info cards */}
            <div style={{ padding: '12px 14px 8px 14px', borderBottom: '1px solid #f3f4f6', flexShrink: 0 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gridTemplateRows: 'repeat(3, minmax(0, 1fr))', gap: '6px' }}>
                    {/* Chauffeur */}
                    <div style={{ background: 'white', borderRadius: '12px', padding: '10px 12px', border: '1px solid #d1d5db', gridRow: '1 / span 3' }}>
                        <div className="flex items-center gap-1.5" style={{ marginBottom: '3px' }}>
                            <FiUser style={{ color: '#f97316', fontSize: '10px' }} />
                            <span style={{ fontSize: '8px', color: '#9a3412', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.2px' }}>Chauffeur</span>
                        </div>
                        <p style={{ fontSize: '24px', fontWeight: 800, color: '#0f172a', lineHeight: 1.05 }}>{data.chauffeur || '—'}</p>
                    </div>
                    {/* Horaires */}
                    <div style={{ background: 'white', borderRadius: '10px', padding: '8px 10px', border: '1px solid #d1d5db' }}>
                        <div className="flex items-center gap-1.5" style={{ marginBottom: '3px' }}>
                            <FiClock style={{ color: '#3b82f6', fontSize: '9px' }} />
                            <span style={{ fontSize: '7px', color: '#1e40af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.2px' }}>Horaires</span>
                        </div>
                        <p style={{ fontSize: '17px', fontWeight: 800, color: '#0f172a', lineHeight: 1.1 }}>{data.heureDep || '—'} → {data.heureFin || '—'}</p>
                    </div>

                    {/* Conduite */}
                    <div style={{ background: '#f0fdf4', borderRadius: '10px', padding: '8px 10px', border: '1px solid #a7f3d0' }}>
                        <div className="flex items-center gap-1.5" style={{ marginBottom: '3px' }}>
                            <FiTruck style={{ color: '#16a34a', fontSize: '9px' }} />
                            <span style={{ fontSize: '7px', color: '#15803d', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.2px' }}>Conduite</span>
                        </div>
                        <p style={{ fontSize: '17px', fontWeight: 800, color: '#16a34a', lineHeight: 1.1 }}>
                            {drivingMin > 0 ? fmtDuration(drivingMin) : '00'}
                        </p>
                    </div>

                    {/* Arrêts */}
                    <div style={{ background: '#fffbeb', borderRadius: '10px', padding: '8px 10px', border: '1px solid #fcd34d' }}>
                        <div className="flex items-center gap-1.5" style={{ marginBottom: '3px' }}>
                            <FaParking style={{ color: '#f59e0b', fontSize: '9px' }} />
                            <span style={{ fontSize: '7px', color: '#92400e', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.2px' }}>Arrêts</span>
                        </div>
                        <p style={{ fontSize: '17px', fontWeight: 800, color: '#f59e0b', lineHeight: 1.1 }}>{fmtDuration(stopMin)}</p>
                        <p style={{ fontSize: '10px', color: '#92400e', fontWeight: 600, marginTop: '1px' }}>{nbStops} arrêt(s)</p>
                    </div>
                </div>

                <button
                    type="button"
                    onClick={onShowMap}
                    style={{
                        width: '100%',
                        marginTop: '10px',
                        border: '1px solid #d1d5db',
                        background: '#f3f4f6',
                        borderRadius: '10px',
                        padding: '10px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        color: '#111827',
                        fontWeight: 700,
                        cursor: 'pointer',
                    }}
                >
                    <FiMap style={{ fontSize: '16px' }} />
                    Voir le camion sur la carte
                </button>
            </div>

            {/* Timeline segments */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px' }}>
                <p style={{ fontSize: '10px', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>
                    Detail du camion ({segments.length} segments)
                </p>
                <div className="space-y-0">
                    {segments.map((seg, i) => {
                        const segColor = segmentColors[seg.type] || segmentColors.inactive;
                        const SegIcon = segColor.icon;
                        const dur = seg.duration || Math.round((new Date(seg.end) - new Date(seg.start)) / 60000);
                        return (
                            <div key={i} className="flex gap-3" style={{ paddingBottom: '2px' }}>
                                {/* Timeline line */}
                                <div className="flex flex-col items-center" style={{ width: '24px', flexShrink: 0 }}>
                                    <div style={{
                                        width: '10px', height: '10px', borderRadius: '50%',
                                        background: segColor.bg, border: '2px solid white',
                                        boxShadow: `0 0 0 2px ${segColor.bg}30`, flexShrink: 0, zIndex: 1,
                                    }} />
                                    {i < segments.length - 1 && (
                                        <div style={{ width: '2px', flex: 1, background: '#e5e7eb', marginTop: '-1px' }} />
                                    )}
                                </div>
                                {/* Content */}
                                <div style={{
                                    flex: 1, paddingBottom: '14px',
                                    borderBottom: i < segments.length - 1 ? '1px solid #f9fafb' : 'none',
                                }}>
                                    <div className="flex items-center gap-2 mb-1">
                                        {SegIcon && <SegIcon style={{ color: segColor.bg, fontSize: '12px' }} />}
                                        <span style={{ fontWeight: 700, fontSize: '12px', color: '#1a1a2e' }}>{segColor.label}</span>
                                        <span style={{ fontSize: '10px', color: '#9ca3af', marginLeft: 'auto' }}>
                                            {fmtTime(seg.start)} — {fmtTime(seg.end)}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-3" style={{ fontSize: '11px', color: '#6b7280' }}>
                                        <span>{fmtDuration(dur)}</span>
                                        {seg.poiName && <span>📍 {seg.poiName}</span>}
                                        {seg.distance != null && <span>{seg.distance}m</span>}
                                        {seg.conforme != null && seg.type !== 'driving' && (
                                            <span style={{ color: seg.conforme ? '#22c55e' : '#ef4444', fontWeight: 700 }}>
                                                {seg.conforme ? '✓' : '✗'}
                                            </span>
                                        )}
                                    </div>
                                    {seg.address && seg.address !== '—' && (
                                        <p style={{ fontSize: '10px', color: '#9ca3af', marginTop: '2px' }}>{seg.address}</p>
                                    )}
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

    // Popover state
    const [activePopover, setActivePopover] = useState(null); // { segment, position }

    // Side panel state
    const [selectedVoyage, setSelectedVoyage] = useState(null);
    const [selectedVoyageId, setSelectedVoyageId] = useState(null);
    const [isRouteMapOpen, setIsRouteMapOpen] = useState(false);
    const [selectedRoutePoints, setSelectedRoutePoints] = useState([]);

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

            // Reverse geocoding runs in background to avoid blocking the page loader.
            const addressPromises = camionsData
                .filter((c) => c.lat != null && c.lng != null)
                .map(async (camion) => {
                    const address = await reverseGeocode(camion.lat, camion.lng);
                    return { plaque: camion.plaque, address };
                });

            Promise.allSettled(addressPromises).then((results) => {
                const resolved = results
                    .filter((r) => r.status === 'fulfilled' && r.value?.address)
                    .map((r) => r.value);

                if (resolved.length === 0) return;

                const newAddresses = new Map(resolved.map(({ plaque, address }) => [plaque, address]));
                setAddresses(newAddresses);

                setMapData({
                    markers: camionsData
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
                        }),
                });
            });
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
        return {
            totalClients,
            totalVoyages: ganttData.length,
            totalCamions: uniqueCamions.size,
        };
    }, [ganttData]);

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
                title={selectedVoyage ? `Camion ${selectedVoyage.camion} - Voyage ${selectedVoyage.voycle || '—'}` : 'Camion sur la carte'}
            />
        </div>
    );
};

export default Camions;
