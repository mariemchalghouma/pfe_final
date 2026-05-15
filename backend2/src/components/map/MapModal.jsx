'use client';

import { FiX, FiNavigation, FiClock } from 'react-icons/fi';
import { FaTruck, FaCheckCircle, FaMapMarkerAlt, FaCrosshairs, FaFlag } from 'react-icons/fa';
import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';

// Dynamically import leaflet components (they need `window`)
const MapContainer = dynamic(
    () => import('react-leaflet').then(mod => mod.MapContainer),
    { ssr: false }
);
const TileLayer = dynamic(
    () => import('react-leaflet').then(mod => mod.TileLayer),
    { ssr: false }
);
const Marker = dynamic(
    () => import('react-leaflet').then(mod => mod.Marker),
    { ssr: false }
);
const Popup = dynamic(
    () => import('react-leaflet').then(mod => mod.Popup),
    { ssr: false }
);
const Polyline = dynamic(
    () => import('react-leaflet').then(mod => mod.Polyline),
    { ssr: false }
);

/* ═══ ICON FACTORY ═══ */
const createIcon = (color, options = {}) => {
    if (typeof window === 'undefined') return null;
    const L = require('leaflet');
    const {
        label,
        labelColor = '#fff',
        borderColor = '#fff',
        size = 28,
        fontSize = 14,
        fontWeight = 800,
        innerDot = true,
        innerDotColor = '#fff',
    } = options;

    const innerHtml = label
        ? `<span style="color:${labelColor};font-size:${fontSize}px;font-weight:${fontWeight};line-height:1;">${label}</span>`
        : innerDot
            ? `<div style="width: 10px; height: 10px; background: ${innerDotColor}; border-radius: 50%;"></div>`
            : '';

    return L.divIcon({
        className: 'custom-marker',
        html: `
            <div style="
                width: ${size}px; height: ${size}px;
                background: ${color};
                border: 2px solid ${borderColor};
                border-radius: 50%;
                display: flex; align-items: center; justify-content: center;
                color: ${labelColor};
                box-shadow: 0 2px 5px rgba(0,0,0,0.3);
            ">
                ${innerHtml}
            </div>
        `,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
        popupAnchor: [0, -10],
    });
};

/* ═══ TRUCK ICON ═══ */
const createTruckIcon = () => {
    if (typeof window === 'undefined') return null;
    const L = require('leaflet');
    return L.divIcon({
        className: 'custom-marker',
        html: `
            <div style="
                width: 40px; height: 40px;
                background: linear-gradient(135deg, #3b82f6, #1d4ed8);
                border: 3px solid white;
                border-radius: 50%;
                display: flex; align-items: center; justify-content: center;
                box-shadow: 0 4px 12px rgba(59,130,246,0.5);
                animation: pulse 2s infinite;
            ">
                <span style="font-size: 20px; line-height: 1;">🚛</span>
            </div>
            <style>
                @keyframes pulse {
                    0%, 100% { box-shadow: 0 4px 12px rgba(59,130,246,0.5); }
                    50% { box-shadow: 0 4px 20px rgba(59,130,246,0.8), 0 0 0 8px rgba(59,130,246,0.15); }
                }
            </style>
        `,
        iconSize: [40, 40],
        iconAnchor: [20, 20],
        popupAnchor: [0, -20],
    });
};

/* ═══ NEXT POI ICON (pulsing target) ═══ */
const createNextPoiIcon = (ordre) => {
    if (typeof window === 'undefined') return null;
    const L = require('leaflet');
    return L.divIcon({
        className: 'custom-marker',
        html: `
            <div style="
                width: 36px; height: 36px;
                background: linear-gradient(135deg, #f59e0b, #d97706);
                border: 3px solid white;
                border-radius: 50%;
                display: flex; align-items: center; justify-content: center;
                box-shadow: 0 4px 12px rgba(245,158,11,0.5);
                animation: pulseNext 2s infinite;
            ">
                <span style="color: white; font-size: 14px; font-weight: 900; line-height: 1;">${ordre}</span>
            </div>
            <style>
                @keyframes pulseNext {
                    0%, 100% { box-shadow: 0 4px 12px rgba(245,158,11,0.5); }
                    50% { box-shadow: 0 4px 20px rgba(245,158,11,0.8), 0 0 0 8px rgba(245,158,11,0.15); }
                }
            </style>
        `,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
        popupAnchor: [0, -18],
    });
};

/* ═══ NUMBERED POI ICON ═══ */
const createNumberedPoiIcon = (number, color) => {
    if (typeof window === 'undefined') return null;
    const L = require('leaflet');
    return L.divIcon({
        className: 'custom-marker',
        html: `
            <div style="
                width: 30px; height: 30px;
                background: ${color};
                border: 2px solid white;
                border-radius: 50%;
                display: flex; align-items: center; justify-content: center;
                box-shadow: 0 2px 6px rgba(0,0,0,0.3);
            ">
                <span style="color: white; font-size: 13px; font-weight: 800; line-height: 1;">${number}</span>
            </div>
        `,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
        popupAnchor: [0, -15],
    });
};

/* ═══ START FLAG ICON ═══ */
const createStartIcon = () => {
    if (typeof window === 'undefined') return null;
    const L = require('leaflet');
    return L.divIcon({
        className: 'custom-marker',
        html: `
            <div style="
                width: 30px; height: 30px;
                background: #22c55e;
                border: 2px solid white;
                border-radius: 50%;
                display: flex; align-items: center; justify-content: center;
                box-shadow: 0 2px 6px rgba(34,197,94,0.4);
            ">
                <span style="font-size: 14px; line-height: 1;">🚩</span>
            </div>
        `,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
        popupAnchor: [0, -15],
    });
};

const statusConfig = {
    conforme: { color: '#22c55e', label: 'Conforme' },
    non_conforme: { color: '#ef4444', label: 'Non Conforme' },
    en_route: { color: '#22c55e', label: 'En route' },
    arrete: { color: '#f97316', label: 'Arrêté' },
    arrete_nc: { color: '#ef4444', label: 'Arrêté NC' },
};

const distanceKm = (lat1, lng1, lat2, lng2) => {
    const toRad = (v) => (v * Math.PI) / 180;
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const createClusterIcon = (count) => {
    if (typeof window === 'undefined') return null;
    const L = require('leaflet');
    return L.divIcon({
        className: 'custom-cluster',
        html: `<div style="
            width: 32px; height: 32px;
            background: #f59e0b;
            border: 2px solid white;
            border-radius: 50%;
            display: flex; align-items: center; justify-content: center;
            color: white;
            font-weight: 800;
            font-size: 14px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.25);
        ">${count}</div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
        popupAnchor: [0, -16],
    });
};

/* ═══ SMART MARKER ICON RESOLVER ═══ */
const getMarkerIcon = (pos) => {
    if (typeof window === 'undefined') return null;

    switch (pos.markerType) {
        case 'truck':
            return createTruckIcon();

        case 'start':
            return createStartIcon();

        case 'poi_visited':
            return createIcon('#fff', {
                label: '✓',
                labelColor: '#22c55e',
                borderColor: '#22c55e',
                size: 30,
                fontSize: 16,
                innerDot: false,
            });

        case 'poi_next':
            return createNextPoiIcon(pos.ordre || '?');

        case 'poi_planned':
            return createNumberedPoiIcon(pos.ordre || '?', '#8b5cf6');

        case 'end':
            return createIcon('#64748b', { size: 26 });

        case 'event':
        default: {
            const color = pos.color || statusConfig[pos.status]?.color || '#3b82f6';
            return createIcon(color, { size: 24 });
        }
    }
};

/* ═══ POPUP CONTENT ═══ */
const MarkerPopup = ({ pos }) => {
    const isTruck = pos.markerType === 'truck';
    const isPoiVisited = pos.markerType === 'poi_visited';
    const isPoiNext = pos.markerType === 'poi_next';

    return (
        <div className="text-sm min-w-[180px] max-w-[260px]" style={{ fontFamily: "'Inter', sans-serif" }}>
            <p style={{ fontWeight: 800, fontSize: '14px', color: '#1a1a2e', marginBottom: '4px' }}>
                {pos.label || 'Point'}
            </p>

            {pos.info && (
                <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '6px' }}>
                    {pos.info}
                </p>
            )}

            {/* Truck-specific info */}
            {isTruck && pos.speed != null && (
                <div style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '6px 8px', background: '#eff6ff',
                    borderRadius: '8px', marginBottom: '4px',
                }}>
                    <span style={{ fontSize: '11px', color: '#3b82f6', fontWeight: 700 }}>
                        🏎️ {pos.speed} km/h
                    </span>
                </div>
            )}

            {/* Visited POI badge */}
            {isPoiVisited && (
                <span style={{
                    display: 'inline-block',
                    padding: '2px 8px', borderRadius: '6px',
                    background: '#dcfce7', color: '#16a34a',
                    fontSize: '10px', fontWeight: 700, textTransform: 'uppercase',
                }}>
                    ✓ Visité
                </span>
            )}

            {/* Next POI badge */}
            {isPoiNext && (
                <span style={{
                    display: 'inline-block',
                    padding: '2px 8px', borderRadius: '6px',
                    background: '#fef3c7', color: '#d97706',
                    fontSize: '10px', fontWeight: 700, textTransform: 'uppercase',
                    animation: 'pulseText 2s infinite',
                }}>
                    🎯 Prochaine destination
                </span>
            )}

            {/* Status badge for other types */}
            {pos.status && !isPoiVisited && !isPoiNext && (
                <span
                    className="inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold text-white uppercase"
                    style={{ background: statusConfig[pos.status]?.color || '#3b82f6' }}
                >
                    {statusConfig[pos.status]?.label || pos.status}
                </span>
            )}
        </div>
    );
};

const ClusterMarker = ({ cluster, idx, map }) => {
    return (
        <Marker
            key={`cluster-${idx}`}
            position={[cluster.lat, cluster.lng]}
            icon={createClusterIcon(cluster.items.length)}
            eventHandlers={{
                click: (e) => {
                    const currentZoom = map.getZoom();
                    map.flyTo([cluster.lat, cluster.lng], Math.min(currentZoom + 3, 18), { duration: 1 });
                }
            }}
        >
        </Marker>
    );
};

const ClusteredMarkers = ({ validPositions }) => {
    const { useMap } = require('react-leaflet');
    const map = useMap();

    const [zoom, setZoom] = useState(map.getZoom());

    useEffect(() => {
        const onZoom = () => setZoom(map.getZoom());
        map.on('zoomend', onZoom);
        return () => map.off('zoomend', onZoom);
    }, [map]);

    const clusters = useMemo(() => {
        let thresholdKm = 0;
        if (zoom <= 6) thresholdKm = 100;
        else if (zoom <= 9) thresholdKm = 50;
        else if (zoom <= 12) thresholdKm = 15;
        else if (zoom <= 15) thresholdKm = 2;
        else thresholdKm = 0.05;

        const result = [];
        validPositions.forEach((item) => {
            let found = null;
            for (const cluster of result) {
                if (distanceKm(item.lat, item.lng, cluster.lat, cluster.lng) <= thresholdKm) {
                    found = cluster;
                    break;
                }
            }
            if (!found) {
                result.push({ lat: item.lat, lng: item.lng, items: [item] });
            } else {
                found.items.push(item);
                const n = found.items.length;
                found.lat = (found.lat * (n - 1) + item.lat) / n;
                found.lng = (found.lng * (n - 1) + item.lng) / n;
            }
        });
        return result;
    }, [validPositions, zoom]);

    if (typeof window === 'undefined') return null;

    return (
        <>
            {clusters.map((cluster, idx) => {
                if (cluster.items.length === 1) {
                    const pos = cluster.items[0];
                    const markerIcon = getMarkerIcon(pos);

                    return markerIcon ? (
                        <Marker
                            key={pos.id || idx}
                            position={[pos.lat, pos.lng]}
                            icon={markerIcon}
                        >
                            <Popup><MarkerPopup pos={pos} /></Popup>
                        </Marker>
                    ) : null;
                }
                return <ClusterMarker key={`cluster-${idx}`} cluster={cluster} idx={idx} map={map} />;
            })}
        </>
    );
};

/* ═══ POI ROUTE LINE ═══ */
const PoiRouteLine = ({ positions }) => {
    // Build a polyline connecting: start → POIs in order → current position
    const routeCoords = useMemo(() => {
        const coords = [];
        const start = positions.find(p => p.markerType === 'start');
        const pois = positions
            .filter(p => p.markerType?.startsWith('poi_'))
            .sort((a, b) => (a.ordre || 0) - (b.ordre || 0));
        const truck = positions.find(p => p.markerType === 'truck' || p.markerType === 'end');

        if (start) coords.push([start.lat, start.lng]);

        // Add visited POIs first, then current truck, then remaining POIs
        const visitedPois = pois.filter(p => p.visited);
        const remainingPois = pois.filter(p => !p.visited);

        visitedPois.forEach(p => coords.push([p.lat, p.lng]));
        if (truck) coords.push([truck.lat, truck.lng]);
        remainingPois.forEach(p => coords.push([p.lat, p.lng]));

        return coords;
    }, [positions]);

    if (routeCoords.length < 2) return null;

    // Split into completed (solid) and remaining (dashed)
    const truckIdx = positions.findIndex(p => p.markerType === 'truck' || p.markerType === 'end');
    const visitedCount = positions.filter(p => p.visited).length;

    // Find the split point in routeCoords
    const start = positions.find(p => p.markerType === 'start');
    const splitIdx = (start ? 1 : 0) + visitedCount + (truckIdx >= 0 ? 1 : 0);

    const completedPath = routeCoords.slice(0, splitIdx);
    const remainingPath = routeCoords.slice(Math.max(0, splitIdx - 1));

    return (
        <>
            {completedPath.length >= 2 && (
                <Polyline
                    positions={completedPath}
                    pathOptions={{ color: '#22c55e', weight: 4, opacity: 0.8 }}
                />
            )}
            {remainingPath.length >= 2 && (
                <Polyline
                    positions={remainingPath}
                    pathOptions={{ color: '#f59e0b', weight: 3, opacity: 0.6, dashArray: '10, 8' }}
                />
            )}
        </>
    );
};

const MapModal = ({ isOpen, onClose, positions = [], routePath = [], center, zoom = 13, title = 'Localisation sur la carte', enableClustering = true }) => {
    const validPositions = useMemo(() => positions.filter(pos => !isNaN(pos.lat) && !isNaN(pos.lng)), [positions]);

    // Check if we have POI data (use POI route line instead of raw GPS path)
    const hasPois = validPositions.some(p => p.markerType?.startsWith('poi_'));

    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => { document.body.style.overflow = 'unset'; };
    }, [isOpen]);

    const defaultCenter = useMemo(() =>
        validPositions.length > 0 ? [validPositions[0].lat, validPositions[0].lng] : [36.8065, 10.1815]
        , [validPositions]);

    // Center on truck if available
    const truckPos = validPositions.find(p => p.markerType === 'truck');
    const mapCenter = center || (truckPos ? [truckPos.lat, truckPos.lng] : defaultCenter);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-white rounded-2xl w-full max-w-5xl h-[80vh] flex flex-col shadow-2xl relative overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                    <div>
                        <h3 className="text-xl font-bold text-gray-800">{title}</h3>
                        {validPositions.length > 0 && (
                            <p className="text-sm text-gray-500 mt-0.5">
                                {validPositions.filter(p => p.markerType?.startsWith('poi_')).length} POI(s)
                                {' · '}
                                {validPositions.filter(p => p.visited).length} visité(s)
                                {truckPos && ` · ${truckPos.speed || 0} km/h`}
                            </p>
                        )}
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-400 hover:text-gray-600">
                        <FiX className="text-2xl" />
                    </button>
                </div>

                <div className="flex-1 relative bg-gray-50">
                    <MapContainer center={mapCenter} zoom={zoom} className="h-full w-full" style={{ height: '100%', width: '100%' }}>
                        <TileLayer
                            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        />

                        {/* GPS trace line (raw path) */}
                        {routePath && routePath.length > 0 && (
                            <Polyline
                                positions={routePath}
                                pathOptions={{ color: '#93c5fd', weight: 3, opacity: 0.5 }}
                            />
                        )}

                        {/* POI route line (start → visited POIs → truck → remaining POIs) */}
                        {hasPois && <PoiRouteLine positions={validPositions} />}

                        {enableClustering ? (
                            <ClusteredMarkers validPositions={validPositions} />
                        ) : (
                            validPositions.map((pos, idx) => {
                                const markerIcon = getMarkerIcon(pos);
                                return markerIcon ? (
                                    <Marker
                                        key={pos.id || idx}
                                        position={[pos.lat, pos.lng]}
                                        icon={markerIcon}
                                    >
                                        <Popup><MarkerPopup pos={pos} /></Popup>
                                    </Marker>
                                ) : null;
                            })
                        )}
                    </MapContainer>
                </div>

                {/* Enhanced Legend */}
                <div className="px-6 py-3 border-t border-gray-100 flex items-center gap-6 bg-gray-50 text-sm overflow-x-auto">
                    <span className="font-semibold text-gray-700 whitespace-nowrap">Légende :</span>
                    <div className="flex items-center gap-4 flex-wrap">
                        {[
                            { emoji: '🚛', label: 'Position camion', extra: 'border-blue-400' },
                            { emoji: '🚩', label: 'Départ' },
                            { color: 'bg-green-500', label: '✓ POI visité' },
                            { color: 'bg-amber-500', label: '🎯 Prochain POI' },
                            { color: 'bg-violet-500', label: 'POI planifié' },
                        ].map((item, i) => (
                            <div key={i} className="flex items-center gap-2 whitespace-nowrap">
                                {item.emoji ? (
                                    <span className="text-sm">{item.emoji}</span>
                                ) : (
                                    <span className={`w-3 h-3 rounded-full ${item.color} border-2 border-white shadow-sm`}></span>
                                )}
                                <span className="text-gray-600 text-xs font-medium">{item.label}</span>
                            </div>
                        ))}
                        <div className="flex items-center gap-2 whitespace-nowrap">
                            <span className="w-6 border-t-2 border-green-500"></span>
                            <span className="text-gray-600 text-xs font-medium">Trajet fait</span>
                        </div>
                        <div className="flex items-center gap-2 whitespace-nowrap">
                            <span className="w-6 border-t-2 border-amber-500 border-dashed"></span>
                            <span className="text-gray-600 text-xs font-medium">Trajet restant</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default MapModal;
