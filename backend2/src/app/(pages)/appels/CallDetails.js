"use client";

import React from "react";
import dynamic from "next/dynamic";
import { FiPlay } from "react-icons/fi";

// Dynamic import for Leaflet to avoid SSR issues
const MapContainer = dynamic(
  () => import("react-leaflet").then((mod) => mod.MapContainer),
  { ssr: false },
);
const TileLayer = dynamic(
  () => import("react-leaflet").then((mod) => mod.TileLayer),
  { ssr: false },
);
const Marker = dynamic(
  () => import("react-leaflet").then((mod) => mod.Marker),
  { ssr: false },
);
const Popup = dynamic(() => import("react-leaflet").then((mod) => mod.Popup), {
  ssr: false,
});

export default function CallDetails({ call }) {
  if (!call) {
    return (
      <div className="p-8 text-center text-gray-500">
        <p className="text-lg">Sélectionnez un appel pour voir les détails.</p>
      </div>
    );
  }

  const defaultCenter = call.coords || [34.020882, -6.84165];

  return (
    <div className="space-y-8">
      {/* Conversation Section */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold text-gray-900">Conversation</h3>
          <button className="flex items-center gap-2 text-sm text-gray-600 bg-gray-50 px-4 py-2 rounded-lg hover:bg-gray-100 transition-colors">
            <FiPlay size={16} /> Écouter l audio
          </button>
        </div>

        <div className="space-y-4 max-h-[400px] overflow-y-auto p-4 bg-gray-50 rounded-lg">
          {call.messages.map((m, idx) => (
            <div
              key={idx}
              className={`flex gap-3 ${m.from === "chauffeur" ? "justify-end" : "justify-start"}`}
            >
              {m.from !== "chauffeur" && (
                <div className="flex-shrink-0">
                  <div className="w-9 h-9 rounded-full bg-orange-100 flex items-center justify-center text-xs font-bold text-orange-700">
                    AG
                  </div>
                  <div className="text-xs text-gray-500 mt-1 text-center whitespace-nowrap">
                    Agent superviseur
                  </div>
                </div>
              )}

              <div
                className={`flex-1 ${m.from === "chauffeur" ? "max-w-xs" : "max-w-sm"}`}
              >
                <div className="text-xs text-gray-500 mb-1">
                  {m.from === "chauffeur" ? "Chauffeur" : "Agent superviseur"} •{" "}
                  {m.time || "14:32:05"}
                </div>
                <div
                  className={`px-4 py-3 rounded-lg text-sm ${
                    m.from === "chauffeur"
                      ? "bg-orange-500 text-white rounded-br-none"
                      : "bg-white text-gray-800 rounded-bl-none border border-gray-200"
                  }`}
                >
                  {m.text}
                </div>
              </div>

              {m.from === "chauffeur" && (
                <div className="flex-shrink-0">
                  <div className="w-9 h-9 rounded-full bg-orange-100 flex items-center justify-center text-xs font-bold text-orange-700">
                    CH
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="mt-6 pt-6 border-t border-gray-200">
          <h4 className="font-bold text-gray-900 text-xs uppercase tracking-wider mb-3">
            Résumé du rapport
          </h4>
          <p className="text-sm text-gray-700 leading-relaxed">
            {call.summary}
          </p>
        </div>
      </div>

      {/* Map Section */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
        <h3 className="text-lg font-bold text-gray-900 mb-4">
          Position de l arrêt
        </h3>
        <div className="rounded-lg overflow-hidden border border-gray-200 h-96">
          <MapContainer
            center={defaultCenter}
            zoom={13}
            scrollWheelZoom={false}
            style={{ height: "100%", width: "100%" }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <Marker position={defaultCenter}>
              <Popup>
                {call.chauffeur} - {call.camion}
              </Popup>
            </Marker>
          </MapContainer>
        </div>
        <div className="mt-4 text-xs text-gray-500">
          🔗 Leaflet | © OpenStreetMap
        </div>
      </div>

      {/* Call Info Card */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <div>
            <p className="text-xs text-gray-500 uppercase font-semibold tracking-wider mb-2">
              Camion
            </p>
            <p className="text-sm font-bold text-gray-900">{call.camion}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase font-semibold tracking-wider mb-2">
              Chauffeur
            </p>
            <p className="text-sm font-bold text-gray-900">{call.chauffeur}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase font-semibold tracking-wider mb-2">
              Type
            </p>
            <p className="text-sm font-bold text-gray-900">{call.type}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase font-semibold tracking-wider mb-2">
              Agent
            </p>
            <p className="text-sm font-bold text-gray-900">{call.agent}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
