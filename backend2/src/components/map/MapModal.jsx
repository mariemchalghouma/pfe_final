'use client';

import { FiX } from 'react-icons/fi';
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

const createIcon = (color) => {
    if (typeof window === 'undefined') return null;
    const L = require('leaflet');
    return L.divIcon({
        className: 'custom-marker',
        html: `
      <div style="
        width: 28px; height: 28px;
        background: ${color};
        border: 2px solid white;
        border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        color: white;
        box-shadow: 0 2px 5px rgba(0,0,0,0.3);
      ">
        <div style="width: 10px; height: 10px; background: white; border-radius: 50%;"></div>
      </div>
    `,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
        popupAnchor: [0, -10],
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
        // Dynamic threshold based on zoom levels
        // Zoom 1-6: 100km, Zoom 7-9: 50km, Zoom 10-12: 15km, Zoom 13-15: 2km, Zoom 16+: No cluster
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
                    const markerIcon = pos.color
                        ? createIcon(pos.color)
                        : (createIcon(statusConfig[pos.status]?.color || '#3b82f6'));

                    return markerIcon ? (
                        <Marker
                            key={pos.id || idx}
                            position={[pos.lat, pos.lng]}
                            icon={markerIcon}
                        >
                            <Popup>
                                <div className="text-sm min-w-[150px]">
                                    <p className="font-bold text-gray-800">{pos.label || 'Point'}</p>
                                    {pos.info && <p className="text-gray-500 mt-1">{pos.info}</p>}
                                    {pos.status && (
                                        <span className="inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold text-white uppercase" style={{ background: statusConfig[pos.status]?.color || '#3b82f6' }}>
                                            {statusConfig[pos.status]?.label || pos.status}
                                        </span>
                                    )}
                                </div>
                            </Popup>
                        </Marker>
                    ) : null;
                }
                return <ClusterMarker key={`cluster-${idx}`} cluster={cluster} idx={idx} map={map} />;
            })}
        </>
    );
};

const MapModal = ({ isOpen, onClose, positions = [], routePath = [], center, zoom = 13, title = 'Localisation sur la carte' }) => {
    const validPositions = useMemo(() => positions.filter(pos => !isNaN(pos.lat) && !isNaN(pos.lng)), [positions]);

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

    const mapCenter = center || defaultCenter;

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-white rounded-2xl w-full max-w-5xl h-[80vh] flex flex-col shadow-2xl relative overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                    <div>
                        <h3 className="text-xl font-bold text-gray-800">{title}</h3>
                        {validPositions.length > 0 && (
                            <p className="text-sm text-gray-500 mt-0.5">{validPositions.length} point(s) affiché(s)</p>
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
                        {routePath && routePath.length > 0 && (
                            <Polyline
                                positions={routePath}
                                pathOptions={{ color: '#3b82f6', weight: 4, opacity: 0.8 }}
                            />
                        )}
                        <ClusteredMarkers validPositions={validPositions} />
                    </MapContainer>
                </div>

                <div className="px-6 py-3 border-t border-gray-100 flex items-center gap-6 bg-gray-50 text-sm overflow-x-auto">
                    <span className="font-semibold text-gray-700 whitespace-nowrap">Légende :</span>
                    <div className="flex items-center gap-4">
                        {[
                            { color: 'bg-green-500', label: 'Conforme / En route' },
                            { color: 'bg-red-500', label: 'Non conforme / Alerte' },
                            { color: 'bg-orange-500', label: 'Arrêté' }
                        ].map((item, i) => (
                            <div key={i} className="flex items-center gap-2">
                                <span className={`w-3 h-3 rounded-full ${item.color} border-2 border-white shadow-sm`}></span>
                                <span className="text-gray-600">{item.label}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default MapModal;
