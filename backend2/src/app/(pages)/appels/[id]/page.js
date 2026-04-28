"use client";

import React from "react";
import Link from "next/link";
import { FiPlay, FiArrowLeft } from "react-icons/fi";

const sampleCalls = [
  {
    id: "1",
    camion: "TR-8824-FR",
    chauffeur: "Jean Dupont",
    debut: "08:24",
    duree: "08:24 min",
    type: "Carburant",
    etat: "Conforme",
    agent: "SARAH.J",
    summary:
      "Le chauffeur signale un problème de carburant. Aucune anomalie sur la marchandise.",
    messages: [
      {
        from: "agent",
        text: "Bonjour, nous avons détecté un arrêt prolongé. Tout va bien ?",
        time: "14:32:05",
      },
      {
        from: "chauffeur",
        text: "Oui bonjour, j'ai un problème de carburant.",
        time: "14:32:18",
      },
      {
        from: "agent",
        text: "D'accord. Avez-vous une estimation du temps d'attente ?",
        time: "14:32:35",
      },
      {
        from: "chauffeur",
        text: "On m'a dit environ 30 minutes. La marchandise est en sécurité, je suis sur le site.",
        time: "14:32:48",
      },
    ],
    coords: [34.020882, -6.84165],
  },
  {
    id: "2",
    camion: "TR-1209-BE",
    chauffeur: "Marc Vasseur",
    debut: "03:15",
    duree: "03:15 min",
    type: "Manuel",
    etat: "Conforme",
    agent: "MARC.A",
    summary: "Appel manuel, pas de suite.",
    messages: [
      {
        from: "chauffeur",
        text: "Jai besoin dune assistance",
        time: "10:15:00",
      },
      { from: "agent", text: "Nous envoyons quelquun.", time: "10:15:15" },
    ],
    coords: [34.030882, -6.85165],
  },
  {
    id: "3",
    camion: "TR-5541-DE",
    chauffeur: "Hans Mueller",
    debut: "12:40",
    duree: "12:40 min",
    type: "Porte",
    etat: "Non Conforme",
    agent: "SARAH.J",
    summary: "Problème de porte, intervention nécessaire.",
    messages: [
      { from: "chauffeur", text: "La porte ne ferme plus.", time: "12:40:00" },
      {
        from: "agent",
        text: "Nous prenons en charge le dossier.",
        time: "12:40:20",
      },
    ],
    coords: [34.040882, -6.86165],
  },
];

export default function CallPage({ params }) {
  const { id } = React.use(params);
  const call = sampleCalls.find((c) => c.id === id);

  if (!call) {
    return (
      <div className="p-8 max-w-7xl mx-auto">
        <Link
          href="/appels"
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6"
        >
          <FiArrowLeft size={18} /> Retour aux appels
        </Link>
        <div className="bg-white rounded-3xl border border-gray-100 p-8 shadow-sm text-center">
          <p className="text-gray-500">Appel introuvable.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <Link
          href="/appels"
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 text-sm"
        >
          <FiArrowLeft size={18} /> Retour aux appels
        </Link>
        <h1 className="text-2xl font-black text-gray-900">
          Détails de l appel
        </h1>
        <div className="w-20" />
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Left column - Conversation */}
        <div className="bg-white rounded-3xl border border-gray-100 p-8 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold text-gray-900">Conversation</h3>
            <button className="flex items-center gap-2 text-sm text-gray-600 bg-gray-50 px-4 py-2 rounded-2xl hover:bg-gray-100 transition-colors">
              <FiPlay size={16} /> Écouter audio
            </button>
          </div>

          <div className="space-y-4 max-h-[400px] overflow-y-auto p-4 bg-gray-50 rounded-2xl">
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
                    {m.from === "chauffeur" ? "Chauffeur" : "Agent superviseur"}{" "}
                    • {m.time || "14:32:05"}
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

        {/* Right column - Call Info */}
        <div className="bg-white rounded-3xl border border-gray-100 p-8 shadow-sm">
          <h3 className="font-bold text-gray-900 mb-4 text-sm">
            Informations de l appel
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-500 uppercase font-semibold tracking-wider mb-1">
                Camion
              </p>
              <p className="text-sm font-bold text-gray-900">{call.camion}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase font-semibold tracking-wider mb-1">
                Chauffeur
              </p>
              <p className="text-sm font-bold text-gray-900">
                {call.chauffeur}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase font-semibold tracking-wider mb-1">
                Type
              </p>
              <p className="text-sm font-bold text-gray-900">{call.type}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase font-semibold tracking-wider mb-1">
                Durée
              </p>
              <p className="text-sm font-bold text-gray-900">{call.duree}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
