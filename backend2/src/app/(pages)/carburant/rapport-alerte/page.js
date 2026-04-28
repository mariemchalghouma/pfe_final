"use client";

import {
  FiAlertTriangle,
  FiBarChart2,
  FiCalendar,
  FiMapPin,
  FiPlus,
  FiShield,
  FiTag,
  FiTrendingDown,
  FiMessageSquare,
  FiTruck,
  FiUser,
  FiClock,
  FiCheckCircle,
  FiXCircle,
} from "react-icons/fi";

const statsCards = [
  {
    title: "ECART TOTAL",
    value: "100 L",
    icon: FiTrendingDown,
    iconWrap: "bg-red-50 text-red-500",
    valueColor: "text-red-500",
  },
  {
    title: "TAUX CONFORMITE",
    value: "67%",
    icon: FiShield,
    iconWrap: "bg-emerald-50 text-emerald-500",
    valueColor: "text-emerald-500",
  },
  {
    title: "ALERTES VOL",
    value: "5",
    icon: FiAlertTriangle,
    iconWrap: "bg-amber-50 text-amber-500",
    valueColor: "text-amber-500",
  },
  {
    title: "RECLAMATIONS",
    value: "2",
    icon: FiMessageSquare,
    iconWrap: "bg-blue-50 text-blue-500",
    valueColor: "text-blue-500",
  },
];

const complaints = [
  {
    id: "R001",
    type: "Vol",
    status: "Ouverte",
    camion: "198 TU 7533",
    chauffeur: "Ahmed Trabelsi",
    date: "2026-04-01 a 09:30",
    lieu: "Sfax",
    description:
      "Ecart de 15L detecte lors du ravitaillement a Sfax. Soupcon de siphonnage.",
    tone: "red",
  },
  {
    id: "R002",
    type: "Surcharge",
    status: "En cours",
    camion: "201 TU 6644",
    chauffeur: "Slim Jaziri",
    date: "2026-04-02 a 10:15",
    lieu: "Gabes",
    description:
      "Surcharge carburant facturee, quantite RAV superieure de 15L au GPS.",
    tone: "amber",
  },
];

function toneClass(tone) {
  if (tone === "red") return "bg-red-50 text-red-600 border-red-100";
  return "bg-amber-50 text-amber-600 border-amber-100";
}

function StatCard({ card }) {
  const Icon = card.icon;

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-4">
        <div
          className={`flex h-12 w-12 items-center justify-center rounded-2xl ${card.iconWrap}`}
        >
          <Icon className="text-xl" />
        </div>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
            {card.title}
          </p>
          <p className={`text-2xl font-black leading-none ${card.valueColor}`}>
            {card.value}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function CarburantRapportAlertePage() {
  return (
    <section className="min-h-full bg-[#f3f4f6] p-6 text-sm text-gray-700">
      <div className="mx-auto max-w-[1500px] space-y-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {statsCards.map((card) => (
            <StatCard key={card.title} card={card} />
          ))}
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="mb-6 flex items-center gap-2 text-gray-900">
            <FiBarChart2 className="text-lg" />
            <h2 className="text-base font-black uppercase tracking-wide">
              Filtres
            </h2>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
            <label className="space-y-1.5">
              <span className="flex items-center gap-1 text-xs font-semibold text-gray-500">
                <FiCalendar className="text-sm" /> Debut
              </span>
              <input
                type="date"
                defaultValue="2026-04-01"
                className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 outline-none ring-orange-400 transition focus:ring-2"
              />
            </label>

            <label className="space-y-1.5">
              <span className="flex items-center gap-1 text-xs font-semibold text-gray-500">
                <FiCalendar className="text-sm" /> Fin
              </span>
              <input
                type="date"
                defaultValue="2026-04-08"
                className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 outline-none ring-orange-400 transition focus:ring-2"
              />
            </label>

            <label className="space-y-1.5">
              <span className="flex items-center gap-1 text-xs font-semibold text-gray-500">
                <FiTruck className="text-sm" /> Camion
              </span>
              <select className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 outline-none ring-orange-400 transition focus:ring-2">
                <option>Tous</option>
              </select>
            </label>

            <label className="space-y-1.5">
              <span className="flex items-center gap-1 text-xs font-semibold text-gray-500">
                <FiUser className="text-sm" /> Chauffeur
              </span>
              <select className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 outline-none ring-orange-400 transition focus:ring-2">
                <option>Tous</option>
              </select>
            </label>

            <label className="space-y-1.5">
              <span className="flex items-center gap-1 text-xs font-semibold text-gray-500">
                <FiTag className="text-sm" /> Categorie
              </span>
              <select className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 outline-none ring-orange-400 transition focus:ring-2">
                <option>Toutes</option>
              </select>
            </label>

            <label className="space-y-1.5">
              <span className="flex items-center gap-1 text-xs font-semibold text-gray-500">
                <FiMapPin className="text-sm" /> Site
              </span>
              <select className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 outline-none ring-orange-400 transition focus:ring-2">
                <option>Tous</option>
              </select>
            </label>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm min-h-[500px]">
          <div className="mb-6 flex items-center justify-between gap-3">
            <h3 className="flex items-center gap-2 text-base font-black text-gray-900 uppercase tracking-wide">
              <FiAlertTriangle className="text-xl" /> Reclamations
            </h3>
            <button className="inline-flex items-center gap-2 rounded-2xl bg-orange-500 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-orange-600">
              <FiPlus className="text-base" /> Nouvelle reclamation
            </button>
          </div>

          <div className="mb-6 grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wider text-gray-400">
                Ouvertes
              </p>
              <p className="mt-1 flex items-center gap-2 text-2xl font-bold text-red-500">
                <FiXCircle /> 2
              </p>
            </div>
            <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wider text-gray-400">
                En cours
              </p>
              <p className="mt-1 flex items-center gap-2 text-2xl font-bold text-amber-500">
                <FiClock /> 1
              </p>
            </div>
            <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wider text-gray-400">
                Fermees
              </p>
              <p className="mt-1 flex items-center gap-2 text-2xl font-bold text-emerald-500">
                <FiCheckCircle /> 1
              </p>
            </div>
          </div>

          <div className="mb-6 flex flex-wrap items-center gap-3">
            <select className="h-10 rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-700 outline-none ring-orange-400 transition focus:ring-2">
              <option>Tous statuts</option>
            </select>
            <select className="h-10 rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-700 outline-none ring-orange-400 transition focus:ring-2">
              <option>Tous types</option>
            </select>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {complaints.map((item) => (
              <article
                key={item.id}
                className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm"
              >
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full border px-3 py-1 text-xs font-bold ${toneClass(item.tone)}`}
                    >
                      {item.type}
                    </span>
                    <span
                      className={`rounded-full border px-3 py-1 text-xs font-semibold ${toneClass(item.tone)}`}
                    >
                      {item.status}
                    </span>
                  </div>
                  <span className="text-xs font-semibold text-gray-400">
                    {item.id}
                  </span>
                </div>

                <h4 className="text-lg font-bold text-gray-900">
                  {item.camion} - {item.chauffeur}
                </h4>
                <p className="mt-1 text-xs font-medium text-gray-500">
                  {item.date} - {item.lieu}
                </p>
                <p className="mt-3 text-sm leading-relaxed text-gray-600">
                  {item.description}
                </p>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
