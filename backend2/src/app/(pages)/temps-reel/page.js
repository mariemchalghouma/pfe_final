'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { FiActivity, FiClock, FiFilter, FiMapPin, FiSearch, FiTruck, FiUser } from 'react-icons/fi';
import { arretsAPI, camionsAPI } from '@/services/api';

const MapContainer = dynamic(() => import('react-leaflet').then(m => m.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then(m => m.TileLayer), { ssr: false });
const Marker = dynamic(() => import('react-leaflet').then(m => m.Marker), { ssr: false });
const Popup = dynamic(() => import('react-leaflet').then(m => m.Popup), { ssr: false });
const Polyline = dynamic(() => import('react-leaflet').then(m => m.Polyline), { ssr: false });

const FlyToPosition = ({ position }) => {
  if (typeof window === 'undefined') return null;
  const { useMap } = require('react-leaflet');
  const map = useMap();
  useEffect(() => {
    if (position) map.flyTo(position, 11, { duration: 0.8 });
  }, [position, map]);
  return null;
};

const ZoomWatcher = ({ onZoomChange }) => {
  if (typeof window === 'undefined') return null;
  const { useMapEvents } = require('react-leaflet');
  useMapEvents({
    zoomend: (event) => {
      onZoomChange(event.target.getZoom());
    },
  });
  return null;
};

const todayIso = () => new Date().toISOString().split('T')[0];

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

const normalizeCamion = (value) => String(value || '').replace(/\s+/g, '').toUpperCase();

const rowKey = (item) => [
  item?.camion || 'camion',
  item?.dateTrajet || 'date',
  item?.voycle || 'voycle',
].join('__');

const getVisualStatus = (camion) => {
  if (camion.statut === 'en_route') return 'en_route';
  if (camion.arretStatus === 'non_conforme') return 'arrete_non_conforme';
  return 'arrete_conforme';
};

const getStatusTheme = (visualStatus) => {
  if (visualStatus === 'en_route') {
    return {
      color: '#22c55e',
      badgeClass: 'bg-green-50 text-green-600 border border-green-200',
      label: 'En route',
    };
  }
  if (visualStatus === 'arrete_non_conforme') {
    return {
      color: '#ef4444',
      badgeClass: 'bg-red-50 text-red-600 border border-red-200',
      label: 'Arrete non conforme',
    };
  }
  return {
    color: '#f97316',
    badgeClass: 'bg-orange-50 text-orange-600 border border-orange-200',
    label: 'Arrete conforme',
  };
};

const createTruckIcon = (visualStatus, selected) => {
  if (typeof window === 'undefined') return null;
  const L = require('leaflet');
  const theme = getStatusTheme(visualStatus);
  const color = selected ? '#f97316' : theme.color;
  return L.divIcon({
    className: 'custom-marker',
    html: `<div style="width:30px;height:30px;background:${color};border:3px solid #fff;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-size:14px;box-shadow:0 3px 10px rgba(0,0,0,.3);">🚚</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -16],
  });
};

const createClusterIcon = (count, color = '#22c55e') => {
  if (typeof window === 'undefined') return null;
  const L = require('leaflet');
  return L.divIcon({
    className: 'custom-cluster',
    html: `<div style="width:44px;height:44px;background:${color};border:3px solid #fff;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:22px;box-shadow:0 4px 12px rgba(0,0,0,.25);">${count}</div>`,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
    popupAnchor: [0, -20],
  });
};

export default function TempsReelPage() {
  const [camions, setCamions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCamion, setSelectedCamion] = useState(null);
  const [trajet, setTrajet] = useState([]);
  const [zoomLevel, setZoomLevel] = useState(7);

  const loadRealtime = useCallback(async () => {
    try {
      const date = todayIso();
      const [realtimeRes, arretsRes] = await Promise.all([
        camionsAPI.getTempsReel({ date }),
        arretsAPI.getArrets({ date }),
      ]);

      if (!realtimeRes.success) {
        setCamions([]);
        return;
      }

      const arrets = Array.isArray(arretsRes?.data) ? arretsRes.data : [];
      const cleanValue = (value) => {
        if (value === null || value === undefined) return null;
        const text = String(value).trim();
        return text && text !== '-' ? text : null;
      };

      const stopByCamion = arrets.reduce((acc, stop) => {
        const key = normalizeCamion(stop.camion);
        if (!key) return acc;

        if (!acc[key]) {
          acc[key] = {
            conforme: 0,
            nonConforme: 0,
            latestStatus: stop.status || null,
            latestPoiName: cleanValue(stop.poiPlanning),
            latestAddress: cleanValue(stop.poiGps),
          };
        }

        if (stop.status === 'non_conforme') acc[key].nonConforme += 1;
        else if (stop.status === 'conforme') acc[key].conforme += 1;
        return acc;
      }, {});

      const merged = (realtimeRes.data || []).map((truck) => {
        const key = normalizeCamion(truck.camion);
        const stopInfo = stopByCamion[key] || { conforme: 0, nonConforme: 0 };

        let arretStatus = null;
        let arretConformeNom = null;
        let arretConformeAdresse = null;
        if (truck.statut !== 'en_route') {
          arretStatus = stopInfo.nonConforme > 0 ? 'non_conforme' : 'conforme';
          if (arretStatus === 'conforme' && stopInfo.latestStatus === 'conforme') {
            arretConformeNom = stopInfo.latestPoiName || null;
            arretConformeAdresse = stopInfo.latestAddress || null;
          }
        }

        return {
          ...truck,
          arretStatus,
          arretConformeNom,
          arretConformeAdresse,
          visualStatus: getVisualStatus({ ...truck, arretStatus }),
        };
      });

      setCamions(merged);
    } catch (error) {
      console.error('Erreur temps réel:', error);
      setCamions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadTrajet = useCallback(async (camion) => {
    try {
      const res = await camionsAPI.getCamionTrajet(camion, { date: todayIso() });
      if (res.success) setTrajet(res.data || []);
      else setTrajet([]);
    } catch {
      setTrajet([]);
    }
  }, []);

  useEffect(() => {
    loadRealtime();
    const timer = setInterval(loadRealtime, 30000);
    return () => clearInterval(timer);
  }, [loadRealtime]);

  const filteredCamions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return camions;
    return camions.filter((c) =>
      String(c.camion || '').toLowerCase().includes(q) ||
      String(c.chauffeur || '').toLowerCase().includes(q)
    );
  }, [camions, search]);

  const stats = useMemo(() => ({
    total: filteredCamions.length,
    moving: filteredCamions.filter((c) => c.visualStatus === 'en_route').length,
    stoppedConforme: filteredCamions.filter((c) => c.visualStatus === 'arrete_conforme').length,
    stoppedNonConforme: filteredCamions.filter((c) => c.visualStatus === 'arrete_non_conforme').length,
  }), [filteredCamions]);

  const clusters = useMemo(() => {
    const thresholdKm =
      zoomLevel >= 11 ? 0 :
      zoomLevel >= 10 ? 2 :
      zoomLevel >= 9 ? 5 :
      zoomLevel >= 8 ? 12 : 25;
    const points = filteredCamions.filter((c) => c.lat != null && c.lng != null);
    const result = [];

    points.forEach((item) => {
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
  }, [filteredCamions, zoomLevel]);

  const handleSelectCamion = async (camion) => {
    setSelectedCamion(camion);
    await loadTrajet(camion.camion);
  };

  return (
    <div className="h-screen w-full flex bg-gray-50 overflow-hidden">
      <div className="w-[360px] bg-white border-r border-gray-200 flex flex-col min-h-0">
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <FiActivity className="text-orange-500" />
              <h2 className="text-2xl font-black text-gray-900">Temps Reel</h2>
            </div>
            <span className="px-2 py-1 rounded-full bg-gray-50 text-xs font-bold text-gray-600 border border-gray-200">{stats.total}/{camions.length}</span>
          </div>
          <div className="relative">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher..."
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
          <div className="mt-3 flex items-center gap-2 text-xs font-bold">
            <span className="px-2 py-1 rounded-lg bg-orange-500 text-white">Tous ({stats.total})</span>
            <span className="px-2 py-1 rounded-lg bg-green-50 text-green-700 border border-green-200">🚚 En route: {stats.moving}</span>
            <span className="px-2 py-1 rounded-lg bg-orange-50 text-orange-700 border border-orange-200">⏸ Conforme: {stats.stoppedConforme}</span>
            <span className="px-2 py-1 rounded-lg bg-red-50 text-red-700 border border-red-200">⏸ Non conforme: {stats.stoppedNonConforme}</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          {loading && <div className="p-4 text-sm text-gray-400">Chargement...</div>}
          {!loading && filteredCamions.map((c) => (
            (() => {
              const theme = getStatusTheme(c.visualStatus || getVisualStatus(c));
              return (
            <button
              key={rowKey(c)}
              onClick={() => handleSelectCamion(c)}
              className={`w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-orange-50/30 transition-colors ${selectedCamion?.camion === c.camion ? 'bg-orange-50/50 border-orange-200' : ''}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-lg font-black text-gray-900">🚚 {c.camion}</p>
                  <p className="text-sm text-gray-600 flex items-center gap-1"><FiUser className="text-xs" /> {c.chauffeur || '—'}</p>
                  <p className="text-sm text-orange-500 flex items-center gap-1 mt-0.5"><FiMapPin className="text-xs" /> {c.lat != null && c.lng != null ? `${c.lat.toFixed(4)}, ${c.lng.toFixed(4)}` : 'Position indisponible'}</p>
                  {c.visualStatus === 'arrete_conforme' && c.arretConformeNom && <p className="text-sm text-orange-700 mt-0.5">Arret: {c.arretConformeNom}</p>}
                  {c.visualStatus === 'arrete_conforme' && c.arretConformeAdresse && <p className="text-sm text-orange-700">Adresse: {c.arretConformeAdresse}</p>}
                  <p className="text-sm text-gray-500 flex items-center gap-2 mt-1"><FiClock className="text-xs" /> {c.derniereMaj} · {c.vitesse} km/h</p>
                </div>
                <span className={`mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${theme.badgeClass}`}>
                  {theme.label}
                </span>
              </div>
            </button>
              );
            })()
          ))}
        </div>
      </div>

      <div className="flex-1 relative min-h-0">
        <MapContainer center={[36.8, 10.18]} zoom={7} className="h-full w-full" style={{ height: '100%', width: '100%' }}>
          <ZoomWatcher onZoomChange={setZoomLevel} />
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {selectedCamion?.lat != null && selectedCamion?.lng != null && (
            <FlyToPosition position={[selectedCamion.lat, selectedCamion.lng]} />
          )}

          {clusters.map((cluster, idx) => {
            if (cluster.items.length === 1) {
              const truck = cluster.items[0];
              const theme = getStatusTheme(truck.visualStatus || getVisualStatus(truck));
              return (
                <Marker
                  key={`truck-${rowKey(truck)}`}
                  position={[truck.lat, truck.lng]}
                  icon={createTruckIcon(truck.visualStatus || getVisualStatus(truck), selectedCamion?.camion === truck.camion)}
                  eventHandlers={{ click: () => handleSelectCamion(truck) }}
                >
                  <Popup>
                    <div className="text-sm min-w-[180px]">
                      <p className="font-bold text-gray-900">🚚 {truck.camion}</p>
                      <p className="text-gray-600">{truck.chauffeur || '—'}</p>
                      <p className="text-gray-500">{truck.vitesse} km/h</p>
                      {truck.visualStatus === 'arrete_conforme' && truck.arretConformeNom && <p className="text-orange-700">Arret: {truck.arretConformeNom}</p>}
                      {truck.visualStatus === 'arrete_conforme' && truck.arretConformeAdresse && <p className="text-orange-700">Adresse: {truck.arretConformeAdresse}</p>}
                      <p className="font-semibold" style={{ color: theme.color }}>{theme.label}</p>
                    </div>
                  </Popup>
                </Marker>
              );
            }

            const hasNonConforme = cluster.items.some((it) => (it.visualStatus || getVisualStatus(it)) === 'arrete_non_conforme');
            const hasEnRoute = cluster.items.some((it) => (it.visualStatus || getVisualStatus(it)) === 'en_route');
            const clusterColor = hasNonConforme ? '#ef4444' : hasEnRoute ? '#22c55e' : '#f97316';
            const clusterIcon = createClusterIcon(cluster.items.length, clusterColor);

            return (
              <Marker key={`cluster-${idx}`} position={[cluster.lat, cluster.lng]} icon={clusterIcon}>
                <Popup>
                  <div className="text-sm min-w-[220px]">
                    <p className="font-bold text-gray-900">{cluster.items.length} camions dans cette region</p>
                    <div className="mt-2 space-y-1 max-h-[140px] overflow-y-auto">
                      {cluster.items.map((it) => {
                        const theme = getStatusTheme(it.visualStatus || getVisualStatus(it));
                        return (
                          <button
                            key={`cluster-item-${rowKey(it)}`}
                            onClick={() => handleSelectCamion(it)}
                            className="w-full text-left px-2 py-1 rounded hover:bg-gray-50"
                          >
                            <span style={{ color: theme.color }}>🚚</span> {it.camion} - {it.vitesse} km/h
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </Popup>
              </Marker>
            );
          })}

          {trajet.length > 1 && (
            <Polyline positions={trajet} pathOptions={{ color: '#3b82f6', weight: 4, opacity: 0.8 }} />
          )}
        </MapContainer>

        {!loading && filteredCamions.length === 0 && (
          <div className="absolute inset-0 z-[900] pointer-events-none flex items-center justify-center">
            <div className="bg-white/92 backdrop-blur-sm border border-gray-200 rounded-2xl shadow-sm px-5 py-4 text-center max-w-sm mx-4">
              <p className="text-base font-extrabold text-gray-900">Aucun camion pour la date du jour</p>
              <p className="mt-1 text-sm text-gray-600">La carte reste vide car l'API retourne 0 position aujourd'hui.</p>
            </div>
          </div>
        )}

        <div className="absolute top-4 right-4 z-[1000] bg-white rounded-xl border border-gray-200 shadow-sm px-3 py-2 text-xs font-bold text-gray-600">
          <span className="inline-flex items-center gap-1"><FiFilter /> Date: {todayIso()}</span>
        </div>
      </div>
    </div>
  );
}
