'use client';

import { useEffect, useState } from 'react';
import { camionsAPI } from '@/services/api';
import { FiTruck, FiUsers, FiNavigation, FiActivity, FiArrowUp, FiArrowDown, FiMap } from 'react-icons/fi';
import MapModal from '@/components/map/MapModal';

const Dashboard = () => {
    const [camions, setCamions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isMapOpen, setIsMapOpen] = useState(false);
    const [mapPositions, setMapPositions] = useState([]);
    const [showLoginSuccess, setShowLoginSuccess] = useState(false);

    useEffect(() => {
        const loadCamions = async () => {
            try {
                const { data } = await camionsAPI.getCamions();
                const camionsData = data.data || [];
                setCamions(camionsData);

                const positions = camionsData
                    .filter((c) => c.lat != null && c.lng != null)
                    .map((c) => ({
                        id: c.plaque,
                        lat: c.lat,
                        lng: c.lng,
                        label: c.plaque,
                        status: c.statut,
                        info: `🚚 ${c.chauffeur || '—'} · 📍 ${c.localisation || '—'}`
                    }));
                setMapPositions(positions);

            } catch (error) {
                console.error('Erreur chargement camions Dashboard:', error);
            } finally {
                setLoading(false);
            }
        };

        loadCamions();
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined') return;

        const hasLoginSuccess = sessionStorage.getItem('loginSuccess') === '1';
        if (!hasLoginSuccess) return;

        setShowLoginSuccess(true);
        sessionStorage.removeItem('loginSuccess');

        const timer = setTimeout(() => {
            setShowLoginSuccess(false);
        }, 3000);

        return () => clearTimeout(timer);
    }, []);

    return (
        <>
            <div className="p-8 max-w-7xl mx-auto">
                <div className="flex justify-between items-center mb-8">
                    <div>
                        <h1 className="text-3xl font-black text-gray-900 tracking-tight">Tableau de bord</h1>
                        <p className="text-gray-500 mt-1 font-medium">Aperçu en temps réel de votre flotte</p>
                    </div>
                    <button
                        onClick={() => setIsMapOpen(true)}
                        className="flex items-center gap-2 px-6 py-3 bg-gray-900 text-white rounded-2xl font-bold hover:bg-gray-800 transition-all shadow-xl shadow-gray-200"
                    >
                        <FiMap className="text-xl" />
                        Suivi en temps réel
                    </button>
                </div>

                {showLoginSuccess && (
                    <div className="fixed top-6 right-6 z-50 p-4 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl text-sm flex items-center gap-2 shadow-lg">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                        </svg>
                        Alerte: connexion reussie.
                    </div>
                )}

                {/* Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                    <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm hover:shadow-md transition-all">
                        <div className="flex items-center justify-between mb-4">
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Total Camions</p>
                            <div className="bg-orange-100 p-3 rounded-2xl text-orange-600">
                                <FiTruck className="text-xl" />
                            </div>
                        </div>
                        <p className="text-3xl font-black text-gray-900">12</p>
                        <div className="flex items-center gap-1 mt-2 text-green-600 text-sm font-bold">
                            <FiArrowUp /> <span>8 en route</span>
                        </div>
                    </div>

                    <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm hover:shadow-md transition-all">
                        <div className="flex items-center justify-between mb-4">
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Chauffeurs Actifs</p>
                            <div className="bg-blue-100 p-3 rounded-2xl text-blue-600">
                                <FiUsers className="text-xl" />
                            </div>
                        </div>
                        <p className="text-3xl font-black text-gray-900">10</p>
                        <p className="text-gray-400 text-sm font-medium mt-2">sur 12 total</p>
                    </div>

                    <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm hover:shadow-md transition-all">
                        <div className="flex items-center justify-between mb-4">
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Distance Totale</p>
                            <div className="bg-green-100 p-3 rounded-2xl text-green-600">
                                <FiNavigation className="text-xl" />
                            </div>
                        </div>
                        <p className="text-3xl font-black text-gray-900">1,245 <span className="text-base text-gray-300 font-bold">km</span></p>
                        <div className="flex items-center gap-1 mt-2 text-green-600 text-sm font-bold">
                            <FiArrowUp /> <span>+12% aujourd&apos;hui</span>
                        </div>
                    </div>

                    <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm hover:shadow-md transition-all">
                        <div className="flex items-center justify-between mb-4">
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Alertes</p>
                            <div className="bg-red-100 p-3 rounded-2xl text-red-600">
                                <FiActivity className="text-xl" />
                            </div>
                        </div>
                        <p className="text-3xl font-black text-gray-900">3</p>
                        <div className="flex items-center gap-1 mt-2 text-red-600 text-sm font-bold">
                            <FiArrowDown /> <span>2 non conformes</span>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Activité récente */}
                    <div className="bg-white rounded-3xl border border-gray-100 p-8 shadow-sm">
                        <h2 className="text-xl font-black text-gray-900 mb-6 italic tracking-tight uppercase text-[14px]">Activité récente</h2>
                        <div className="space-y-6">
                            {[
                                { time: '14:32', text: '120 TDS 4578 - Départ de Tunis', color: 'bg-orange-500' },
                                { time: '14:15', text: '95 TDS 6543 - Arrêt non conforme à Nabeul', color: 'bg-red-500' },
                                { time: '13:48', text: '142 TDS 8877 - En route vers Sousse', color: 'bg-orange-500' },
                                { time: '13:20', text: '78 NGI 5544 - Arrêt à Zaghouan', color: 'bg-green-500' },
                                { time: '12:55', text: '185 TDS 9321 - Arrêt à Manouba', color: 'bg-green-500' },
                            ].map((item, i) => (
                                <div key={i} className="flex items-start gap-4">
                                    <span className={`w-3 h-3 rounded-full mt-1.5 shrink-0 shadow-sm ${item.color}`}></span>
                                    <div>
                                        <p className="text-[15px] font-bold text-gray-800">{item.text}</p>
                                        <p className="text-xs text-gray-400 font-medium mt-0.5">{item.time}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Statut flotte */}
                    <div className="bg-white rounded-3xl border border-gray-100 p-8 shadow-sm">
                        <h2 className="text-xl font-black text-gray-900 mb-6 italic tracking-tight uppercase text-[14px]">Statut de la flotte</h2>
                        <div className="space-y-8">
                            <div>
                                <div className="flex justify-between text-sm mb-2">
                                    <span className="font-bold text-gray-500">En route</span>
                                    <span className="font-black text-green-600">6 camions</span>
                                </div>
                                <div className="w-full bg-gray-50 rounded-full h-3">
                                    <div className="bg-green-500 h-3 rounded-full shadow-sm" style={{ width: '50%' }}></div>
                                </div>
                            </div>
                            <div>
                                <div className="flex justify-between text-sm mb-2">
                                    <span className="font-bold text-gray-500">Arrêt conforme</span>
                                    <span className="font-black text-orange-600">4 camions</span>
                                </div>
                                <div className="w-full bg-gray-50 rounded-full h-3">
                                    <div className="bg-orange-500 h-3 rounded-full shadow-sm" style={{ width: '33%' }}></div>
                                </div>
                            </div>
                            <div>
                                <div className="flex justify-between text-sm mb-2">
                                    <span className="font-bold text-gray-500">Arrêt non conforme</span>
                                    <span className="font-black text-red-600">2 camions</span>
                                </div>
                                <div className="w-full bg-gray-50 rounded-full h-3">
                                    <div className="bg-red-500 h-3 rounded-full shadow-sm" style={{ width: '17%' }}></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <MapModal
                isOpen={isMapOpen}
                onClose={() => setIsMapOpen(false)}
                positions={mapPositions}
                title="Suivi de la flotte en temps réel"
                zoom={7}
            />
        </>
    );
};

export default Dashboard;
