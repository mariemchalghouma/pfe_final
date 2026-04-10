"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  FiActivity,
  FiClock,
  FiFilter,
  FiMapPin,
  FiSearch,
  FiTruck,
  FiUser,
} from "react-icons/fi";
import { camionsAPI } from "@/services/api";

const MapContainer = dynamic(
  () => import("react-leaflet").then((m) => m.MapContainer),
  { ssr: false },
);
const TileLayer = dynamic(
  () => import("react-leaflet").then((m) => m.TileLayer),
  { ssr: false },
);
const Marker = dynamic(() => import("react-leaflet").then((m) => m.Marker), {
  ssr: false,
});
const Popup = dynamic(() => import("react-leaflet").then((m) => m.Popup), {
  ssr: false,
});
const Polyline = dynamic(
  () => import("react-leaflet").then((m) => m.Polyline),
  { ssr: false },
);

const FlyToPosition = ({ position }) => {
  if (typeof window === "undefined") return null;
  const { useMap } = require("react-leaflet");
  const map = useMap();
  useEffect(() => {
    if (position) map.flyTo(position, 11, { duration: 0.8 });
  }, [position, map]);
  return null;
};

const todayIso = () => new Date().toISOString().split("T")[0];

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

const createTruckIcon = (status, selected) => {
  if (typeof window === "undefined") return null;
  const L = require("leaflet");
  const color = selected
    ? "#f97316"
    : status === "en_route"
      ? "#22c55e"
      : "#ef4444";
  return L.divIcon({
    className: "custom-marker",
    html: `<div style="width:30px;height:30px;background:${color};border:3px solid #fff;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-size:14px;box-shadow:0 3px 10px rgba(0,0,0,.3);">🚚</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -16],
  });
};

const createClusterIcon = (count) => {
  if (typeof window === "undefined") return null;
  const L = require("leaflet");
  return L.divIcon({
    className: "custom-cluster",
    html: `<div style="width:44px;height:44px;background:#22c55e;border:3px solid #fff;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:22px;box-shadow:0 4px 12px rgba(0,0,0,.25);">${count}</div>`,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
    popupAnchor: [0, -20],
  });
};

export default function TempsReelPage() {
  const [camions, setCamions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedCamion, setSelectedCamion] = useState(null);
  const [trajet, setTrajet] = useState([]);

  const loadRealtime = useCallback(async () => {
    try {
      const res = await camionsAPI.getTempsReel({ date: todayIso() });
      if (res.success) setCamions(res.data || []);
    } catch (error) {
      console.error("Erreur temps réel:", error);
      setCamions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadTrajet = useCallback(async (camion) => {
    try {
      const res = await camionsAPI.getCamionTrajet(camion, {
        date: todayIso(),
      });
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
    return camions.filter(
      (c) =>
        String(c.camion || "")
          .toLowerCase()
          .includes(q) ||
        String(c.chauffeur || "")
          .toLowerCase()
          .includes(q),
    );
  }, [camions, search]);

  const stats = useMemo(
    () => ({
      total: filteredCamions.length,
      moving: filteredCamions.filter((c) => c.statut === "en_route").length,
      stopped: filteredCamions.filter((c) => c.statut !== "en_route").length,
    }),
    [filteredCamions],
  );

  const clusters = useMemo(() => {
    const thresholdKm = 25;
    const points = filteredCamions.filter(
      (c) => c.lat != null && c.lng != null,
    );
    const result = [];

    points.forEach((item) => {
      let found = null;
      for (const cluster of result) {
        if (
          distanceKm(item.lat, item.lng, cluster.lat, cluster.lng) <=
          thresholdKm
        ) {
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
  }, [filteredCamions]);

  const handleSelectCamion = async (camion) => {
    setSelectedCamion(camion);
    await loadTrajet(camion.camion);
  };

  return (
    <div className="h-screen w-full flex bg-gray-50 overflow-hidden">
      <div className="w-[360px] bg-white border-r border-gray-200 flex flex-col min-h-0">
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <span className="px-2 py-1 rounded-full bg-gray-50 text-xs font-bold text-gray-600 border border-gray-200">
              {stats.total}/{camions.length}
            </span>
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
            <span className="px-2 py-1 rounded-lg bg-orange-500 text-white">
              Tous ({stats.total})
            </span>
            <span className="px-2 py-1 rounded-lg bg-gray-100 text-gray-600">
              🚚 {stats.moving}
            </span>
            <span className="px-2 py-1 rounded-lg bg-gray-100 text-gray-600">
              ⏸ {stats.stopped}
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          {loading && (
            <div className="p-4 text-sm text-gray-400">Chargement...</div>
          )}
          {!loading &&
            filteredCamions.map((c) => (
              <button
                key={c.camion}
                onClick={() => handleSelectCamion(c)}
                className={`w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-orange-50/30 transition-colors ${selectedCamion?.camion === c.camion ? "bg-orange-50/50 border-orange-200" : ""}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-lg font-black text-gray-900">
                      🚚 {c.camion}
                    </p>
                    <p className="text-sm text-gray-600 flex items-center gap-1">
                      <FiUser className="text-xs" /> {c.chauffeur || "—"}
                    </p>
                    <p className="text-sm text-orange-500 flex items-center gap-1 mt-0.5">
                      <FiMapPin className="text-xs" />{" "}
                      {c.lat != null && c.lng != null
                        ? `${c.lat.toFixed(4)}, ${c.lng.toFixed(4)}`
                        : "Position indisponible"}
                    </p>
                    <p className="text-sm text-gray-500 flex items-center gap-2 mt-1">
                      <FiClock className="text-xs" /> {c.derniereMaj} ·{" "}
                      {c.vitesse} km/h
                    </p>
                  </div>
                  <span
                    className={`mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${c.statut === "en_route" ? "bg-green-50 text-green-600 border border-green-200" : "bg-orange-50 text-orange-600 border border-orange-200"}`}
                  >
                    {c.statut === "en_route" ? "En route" : "Arrete"}
                  </span>
                </div>
              </button>
            ))}
        </div>
      </div>

      <div className="flex-1 relative min-h-0">
        <MapContainer
          center={[36.8, 10.18]}
          zoom={7}
          className="h-full w-full"
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {selectedCamion?.lat != null && selectedCamion?.lng != null && (
            <FlyToPosition
              position={[selectedCamion.lat, selectedCamion.lng]}
            />
          )}

          {clusters.map((cluster, idx) => {
            if (cluster.items.length === 1) {
              const truck = cluster.items[0];
              return (
                <Marker
                  key={`truck-${truck.camion}`}
                  position={[truck.lat, truck.lng]}
                  icon={createTruckIcon(
                    truck.statut,
                    selectedCamion?.camion === truck.camion,
                  )}
                  eventHandlers={{ click: () => handleSelectCamion(truck) }}
                >
                  <Popup>
                    <div className="text-sm min-w-[180px]">
                      <p className="font-bold text-gray-900">
                        🚚 {truck.camion}
                      </p>
                      <p className="text-gray-600">{truck.chauffeur || "—"}</p>
                      <p className="text-gray-500">{truck.vitesse} km/h</p>
                    </div>
                  </Popup>
                </Marker>
              );
            }

            return (
              <Marker
                key={`cluster-${idx}`}
                position={[cluster.lat, cluster.lng]}
                icon={createClusterIcon(cluster.items.length)}
              >
                <Popup>
                  <div className="text-sm min-w-[220px]">
                    <p className="font-bold text-gray-900">
                      {cluster.items.length} camions dans cette region
                    </p>
                    <div className="mt-2 space-y-1 max-h-[140px] overflow-y-auto">
                      {cluster.items.map((it) => (
                        <button
                          key={it.camion}
                          onClick={() => handleSelectCamion(it)}
                          className="w-full text-left px-2 py-1 rounded hover:bg-gray-50"
                        >
                          🚚 {it.camion} - {it.vitesse} km/h
                        </button>
                      ))}
                    </div>
                  </div>
                </Popup>
              </Marker>
            );
          })}

          {trajet.length > 1 && (
            <Polyline
              positions={trajet}
              pathOptions={{ color: "#3b82f6", weight: 4, opacity: 0.8 }}
            />
          )}
        </MapContainer>

        {!loading && filteredCamions.length === 0 && (
          <div className="absolute inset-0 z-[900] pointer-events-none flex items-center justify-center">
            <div className="bg-white/92 backdrop-blur-sm border border-gray-200 rounded-2xl shadow-sm px-5 py-4 text-center max-w-sm mx-4">
              <p className="text-base font-extrabold text-gray-900">
                Aucun camion pour la date du jour
              </p>
              <p className="mt-1 text-sm text-gray-600">
                La carte reste vide car l'API retourne 0 position aujourd'hui.
              </p>
            </div>
          </div>
        )}

        <div className="absolute top-4 right-4 z-[1000] bg-white rounded-xl border border-gray-200 shadow-sm px-3 py-2 text-xs font-bold text-gray-600">
          <span className="inline-flex items-center gap-1">
            <FiFilter /> Date: {todayIso()}
          </span>
        </div>
      </div>
    </div>
  );
}
