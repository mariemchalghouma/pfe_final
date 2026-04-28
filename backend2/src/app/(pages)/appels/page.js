"use client";

import React, { useState } from "react";
import CallsTable from "./CallsTable";
import {
  FiPhoneCall,
  FiClock,
  FiCheckCircle,
  FiPhoneMissed,
} from "react-icons/fi";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const sampleCalls = [
  {
    id: "1",
    camion: "TR-8824-FR",
    chauffeur: "Jean Dupont",
    debut: "08:24",
    duree: "08:24 min",
    type: "Carburant",
    etat: "Terminé",
    agent: "SARAH.J",
    summary:
      "Le chauffeur signale un problème de carburant. Aucune anomalie sur la marchandise.",
    messages: [
      {
        from: "agent",
        text: "Bonjour, nous avons détecté un arrêt prolongé. Tout va bien ?",
      },
      {
        from: "chauffeur",
        text: "Oui bonjour, j'ai un problème de carburant.",
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
    etat: "En cours",
    agent: "MARC.A",
    summary: "Appel manuel, pas de suite.",
    messages: [
      { from: "chauffeur", text: "Jai besoin dune assistance" },
      { from: "agent", text: "Nous envoyons quelquun." },
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
    etat: "Terminé",
    agent: "SARAH.J",
    summary: "Problème de porte, intervention nécessaire.",
    messages: [
      { from: "chauffeur", text: "La porte ne ferme plus." },
      { from: "agent", text: "Nous prenons en charge le dossier." },
    ],
    coords: [34.040882, -6.86165],
  },
  {
    id: "4",
    camion: "TR-3392-ES",
    chauffeur: "Carlos Ruiz",
    debut: "14:32",
    duree: "45:00 min",
    type: "Arrêt",
    etat: "Manqué",
    agent: "EMILY.W",
    summary: "Arrêt non conforme détecté.",
    messages: [
      { from: "agent", text: "Bonjour Carlos" },
      { from: "chauffeur", text: "Oui?" },
    ],
    coords: [34.050882, -6.87165],
  },
];

const callVolumeData = [
  { time: "00:00", calls: 12 },
  { time: "06:00", calls: 28 },
  { time: "12:00", calls: 35 },
  { time: "18:00", calls: 22 },
  { time: "23:59", calls: 15 },
];

export default function AppelsPage() {
  const [calls] = useState(sampleCalls);

  const total = calls.length;
  const enCours = calls.filter((c) => c.etat === "En cours").length;
  const termines = calls.filter((c) => c.etat === "Terminé").length;
  const manques = calls.filter((c) => c.etat === "Manqué").length;

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5 mb-8">
        <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
          <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2.5">
            Total Appels
          </div>
          <div className="flex items-center gap-3">
            <div className="text-3xl font-black text-gray-900">{total}</div>
            <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center text-orange-600 shadow-sm">
              <FiPhoneCall className="text-[18px]" />
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
          <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2.5">
            En cours
          </div>
          <div className="flex items-center gap-3">
            <div className="text-3xl font-black text-emerald-600">
              {enCours}
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-600 shadow-sm">
              <FiClock className="text-[18px]" />
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
          <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2.5">
            Terminés
          </div>
          <div className="flex items-center gap-3">
            <div className="text-3xl font-black text-gray-700">{termines}</div>
            <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center text-gray-700 shadow-sm">
              <FiCheckCircle className="text-[18px]" />
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
          <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2.5">
            Manqués
          </div>
          <div className="flex items-center gap-3">
            <div className="text-3xl font-black text-red-600">{manques}</div>
            <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center text-red-600 shadow-sm">
              <FiPhoneMissed className="text-[18px]" />
            </div>
          </div>
        </div>
      </div>

      {/* Table - Full Width */}
      <div className="mb-8">
        <CallsTable calls={calls} />
      </div>

      {/* Chart */}
      <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
        <h3 className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-4">
          Volume des appels
        </h3>
        <div className="text-xs text-gray-500 mb-4 flex justify-between">
          <span>Dernières 24 heures</span>
        </div>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={callVolumeData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="time" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Bar dataKey="calls" fill="#ff8c00" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
