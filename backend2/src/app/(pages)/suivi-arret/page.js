'use client';

import { useState, useEffect, useMemo } from 'react';
import { FiPlus, FiFilter, FiMap } from 'react-icons/fi';
import PoiModal from '@/components/PoiModal';
import MapModal from '@/components/map/MapModal';
import { poiAPI, arretsAPI } from '@/services/api';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid,
    Tooltip, ResponsiveContainer
} from 'recharts';

const EmptyStopIcon = () => (
    <svg width="44" height="44" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="12" cy="12" r="10" stroke="#F97316" strokeWidth="1.8" />
        <rect x="9" y="9" width="6" height="6" rx="1" stroke="#F97316" strokeWidth="1.8" />
    </svg>
);

const Arrets = () => {
    const [arrets, setArrets] = useState([]);
    const [groups, setGroups] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedArretId, setSelectedArretId] = useState(null);

    useEffect(() => {
        const fetchGroups = async () => {
            const initialGroups = [
                { id: 'g1', nom: 'Dépôt', couleur: '#fbbf24' },
                { id: 'g2', nom: 'Client Interne', couleur: '#f97316' },
                { id: 'g3', nom: 'Client Externe', couleur: '#ef4444' },
                { id: 'g4', nom: 'Station', couleur: '#a855f7' },
                { id: 'g5', nom: 'Zone Industrielle', couleur: '#06b6d4' }
            ];
            setGroups(initialGroups);
        };

        fetchGroups();
    }, []);

    const today = new Date().toISOString().split('T')[0];
    const [dateFilterMode, setDateFilterMode] = useState('day');
    const [filterDate, setFilterDate] = useState(today);
    const [filterStartDate, setFilterStartDate] = useState('');
    const [filterEndDate, setFilterEndDate] = useState('');
    const [filterWeek, setFilterWeek] = useState('');
    const [filterMonth, setFilterMonth] = useState('');
    const [filterType, setFilterType] = useState('Tous');
    const [filterMatricule, setFilterMatricule] = useState('');

    const [showPoiModal, setShowPoiModal] = useState(false);
    const [poiModalData, setPoiModalData] = useState(null);
    const [isMapOpen, setIsMapOpen] = useState(false);
    const [mapPositions, setMapPositions] = useState([]);

    const getDateRangeParams = () => {
        if (dateFilterMode === 'day') {
            const day = filterDate || today;
            return { dateStart: day, dateEnd: day };
        }

        if (dateFilterMode === 'range') {
            return {
                dateStart: filterStartDate || today,
                dateEnd: filterEndDate || filterStartDate || today,
            };
        }

        if (dateFilterMode === 'week' && filterWeek) {
            const [year, week] = filterWeek.split('-W').map(Number);
            const firstDayOfYear = new Date(Date.UTC(year, 0, 1));
            const firstWeekDayOffset = (firstDayOfYear.getUTCDay() || 7) - 1;
            const weekStart = new Date(firstDayOfYear);
            weekStart.setUTCDate(firstDayOfYear.getUTCDate() - firstWeekDayOffset + (week - 1) * 7);
            const weekEnd = new Date(weekStart);
            weekEnd.setUTCDate(weekStart.getUTCDate() + 6);
            return {
                dateStart: weekStart.toISOString().split('T')[0],
                dateEnd: weekEnd.toISOString().split('T')[0],
            };
        }

        if (dateFilterMode === 'month' && filterMonth) {
            const [y, m] = filterMonth.split('-').map(Number);
            const monthStart = new Date(Date.UTC(y, m - 1, 1));
            const monthEnd = new Date(Date.UTC(y, m, 0));
            return {
                dateStart: monthStart.toISOString().split('T')[0],
                dateEnd: monthEnd.toISOString().split('T')[0],
            };
        }

        return { dateStart: today, dateEnd: today };
    };

    useEffect(() => {
        const fetchArrets = async () => {
            try {
                setLoading(true);
                const { dateStart, dateEnd } = getDateRangeParams();
                const response = await arretsAPI.getArrets({ dateStart, dateEnd });
                if (response.success) {
                    setArrets(response.data || []);
                } else {
                    setArrets([]);
                }
            } catch (error) {
                console.error('Error fetching arrets:', error);
                setArrets([]);
            } finally {
                setLoading(false);
            }
        };

        fetchArrets();
    }, [dateFilterMode, filterDate, filterStartDate, filterEndDate, filterWeek, filterMonth]);

    const filteredData = useMemo(() => {
        return arrets.filter(arret => {
            const matchesType =
                filterType === 'Tous' ? true :
                    filterType === 'Conforme' ? arret.status === 'conforme' :
                        filterType === 'Non conforme' ? arret.status === 'non_conforme' : true;

            const normalizedFilter = filterMatricule.replace(/\s/g, '').toLowerCase();
            const normalizedCamion = (arret.camion || '').replace(/\s/g, '').toLowerCase();
            const matchesMatricule = filterMatricule ? normalizedCamion.includes(normalizedFilter) : true;

            return matchesType && matchesMatricule;
        });
    }, [arrets, filterType, filterMatricule]);

    const stats = useMemo(() => {
        return {
            total: filteredData.length,
            nc: filteredData.filter(a => a.status === 'non_conforme').length,
            c: filteredData.filter(a => a.status === 'conforme').length
        };
    }, [filteredData]);

    const handleSelectArret = (arret) => {
        setSelectedArretId(arret.id);
        const latStr = parseFloat(arret.lat).toFixed(6);
        const lngStr = parseFloat(arret.lng).toFixed(6);
        setMapPositions([{
            id: arret.id,
            lat: arret.lat,
            lng: arret.lng,
            label: arret.camion,
            status: arret.status,
            info: (
                <>
                    🕒 {arret.date} · ⏳ {arret.duree}
                    <br />
                    📍 Lat: {latStr}, Lng: {lngStr}
                </>
            )
        }]);
        setIsMapOpen(true);
    };

    const handleOpenPoiModal = (e, arret) => {
        e.stopPropagation();
        setPoiModalData(arret);
        setShowPoiModal(true);
    };

    const handleOpenFullMap = () => {
        const positions = filteredData.map(a => {
            const latStr = parseFloat(a.lat).toFixed(6);
            const lngStr = parseFloat(a.lng).toFixed(6);
            return {
                id: a.id,
                lat: a.lat,
                lng: a.lng,
                label: a.camion,
                status: a.status,
                info: (
                    <>
                        🕒 {a.date} · ⏳ {a.duree}
                        <br />
                        📍 Lat: {latStr}, Lng: {lngStr}
                    </>
                )
            };
        });
        setMapPositions(positions);
        setIsMapOpen(true);
    };

    const handleSavePoi = async (poiData) => {
        try {
            await poiAPI.createPOI(poiData);
            setShowPoiModal(false);
            setPoiModalData(null);
            alert('POI ajouté avec succès !');
            window.location.reload();
        } catch (error) {
            console.error('Failed to save POI:', error);
            alert("Erreur lors de l'ajout du POI.");
        }
    };

    const chartData = useMemo(() => {
        const dataByDate = {};
        filteredData.forEach(arret => {
            const date = arret.date.split(' ')[0].substring(5);
            if (!dataByDate[date]) {
                dataByDate[date] = { date, conforme: 0, non_conforme: 0 };
            }
            if (arret.status === 'conforme') dataByDate[date].conforme++;
            else dataByDate[date].non_conforme++;
        });
        return Object.values(dataByDate).sort((a, b) => a.date.localeCompare(b.date));
    }, [filteredData]);

    return (
        <>
            <div className="p-8 max-w-[1600px] mx-auto min-h-screen">
                {/* Filtres & KPIs */}
                <div className="mb-6 flex flex-wrap items-center justify-between gap-6 bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                    <div className="flex flex-wrap items-center gap-4">
                        <div className="flex bg-gray-100 p-1 rounded-xl">
                            {[
                                { id: 'day', label: 'Jour' },
                                { id: 'range', label: 'Plage' },
                                { id: 'week', label: 'Semaine' },
                                { id: 'month', label: 'Mois' }
                            ].map(mode => (
                                <button
                                    key={mode.id}
                                    onClick={() => setDateFilterMode(mode.id)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${dateFilterMode === mode.id ? 'bg-white text-orange-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                >
                                    {mode.label}
                                </button>
                            ))}
                        </div>

                        <div className="flex items-center gap-2">
                            {dateFilterMode === 'day' && (
                                <input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)}
                                    className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all font-medium" />
                            )}
                            {dateFilterMode === 'range' && (
                                <div className="flex items-center gap-2">
                                    <input type="date" value={filterStartDate} onChange={(e) => setFilterStartDate(e.target.value)}
                                        className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all font-medium" />
                                    <span className="text-gray-400 font-bold">au</span>
                                    <input type="date" value={filterEndDate} onChange={(e) => setFilterEndDate(e.target.value)}
                                        className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all font-medium" />
                                </div>
                            )}
                            {dateFilterMode === 'week' && (
                                <input type="week" value={filterWeek} onChange={(e) => setFilterWeek(e.target.value)}
                                    className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all font-medium" />
                            )}
                            {dateFilterMode === 'month' && (
                                <input type="month" value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)}
                                    className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all font-medium" />
                            )}
                        </div>

                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <FiFilter className="text-gray-400" />
                            </div>
                            <input type="text" placeholder="Matricule..." value={filterMatricule} onChange={(e) => setFilterMatricule(e.target.value)}
                                className="pl-10 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm w-44 focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all" />
                        </div>

                        <div className="relative">
                            <select value={filterType} onChange={(e) => setFilterType(e.target.value)}
                                className="pl-3 pr-10 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 appearance-none focus:outline-none focus:ring-2 focus:ring-orange-500 border-none cursor-pointer font-medium">
                                <option>Tous</option>
                                <option>Conforme</option>
                                <option>Non conforme</option>
                            </select>
                            <FiFilter className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                        </div>

                        <button onClick={handleOpenFullMap} className="p-2.5 bg-gray-50 text-gray-400 hover:text-orange-600 hover:bg-orange-50 rounded-xl transition-all border border-gray-100" title="Voir sur la carte">
                            <FiMap className="text-lg" />
                        </button>
                    </div>

                    <div className="flex items-center gap-6">
                        <div className="text-right">
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-tight">Total</p>
                            <p className="text-xl font-black text-gray-900">{stats.total}</p>
                        </div>
                        <div className="w-px h-8 bg-gray-100"></div>
                        <div className="text-right">
                            <p className="text-[10px] font-bold text-green-500 uppercase tracking-widest leading-tight">Conformes</p>
                            <p className="text-xl font-black text-green-600">{stats.c}</p>
                        </div>
                        <div className="w-px h-8 bg-gray-100"></div>
                        <div className="text-right">
                            <p className="text-[10px] font-bold text-red-500 uppercase tracking-widest leading-tight">Non Conformes</p>
                            <p className="text-xl font-black text-red-600">{stats.nc}</p>
                        </div>
                    </div>
                </div>

                {/* Graphe */}
                {chartData.length > 0 && (
                    <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm mb-8">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-[0.1em]">
                                ARRÊTS PAR DATE — CONFORME VS NON CONFORME
                            </h3>
                        </div>
                        <div className="h-[110px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 600, fill: '#9ca3af' }} dy={10} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#d1d5db' }} />
                                    <Tooltip cursor={{ fill: '#f9fafb' }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', fontSize: '12px' }} />
                                    <Line
                                        type="monotone"
                                        dataKey="conforme"
                                        name="Conforme"
                                        stroke="#22c55e"
                                        strokeWidth={2}
                                        dot={{ r: 4, fill: '#22c55e', strokeWidth: 2, stroke: '#fff' }}
                                        activeDot={{ r: 6 }}
                                    />
                                    <Line
                                        type="monotone"
                                        dataKey="non_conforme"
                                        name="Non conforme"
                                        stroke="#ef4444"
                                        strokeWidth={2}
                                        dot={{ r: 4, fill: '#ef4444', strokeWidth: 2, stroke: '#fff' }}
                                        activeDot={{ r: 6 }}
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                        <div className="flex justify-center gap-6 mt-4">
                            <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full bg-[#22c55e]"></div>
                                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Conforme</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full bg-[#ef4444]"></div>
                                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Non conforme</span>
                            </div>
                        </div>
                    </div>
                )}

                {/* Table */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden min-h-[500px]">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left border-collapse">
                            <thead>
                                <tr className="bg-gray-50/50 border-b border-gray-100">
                                    <th className="px-6 py-2.5 font-bold text-gray-500 uppercase tracking-wider text-[11px]">Camion</th>
                                    <th className="px-6 py-2.5 font-bold text-gray-500 uppercase tracking-wider text-[11px]">Date & Heure</th>
                                    <th className="px-6 py-2.5 font-bold text-gray-500 uppercase tracking-wider text-[11px]">Durée</th>
                                    <th className="px-6 py-2.5 font-bold text-gray-500 uppercase tracking-wider text-[11px]">Dest. Programmée</th>
                                    <th className="px-6 py-2.5 font-bold text-gray-500 uppercase tracking-wider text-[11px]">POI proche</th>
                                    <th className="px-6 py-2.5 font-bold text-gray-500 uppercase tracking-wider text-[11px]">N° Voyage</th>
                                    <th className="px-6 py-2.5 font-bold text-gray-500 uppercase tracking-wider text-[11px]">Chauffeur</th>
                                    <th className="px-6 py-2.5 font-bold text-gray-500 uppercase tracking-wider text-[11px]">Téléphone</th>
                                    <th className="px-6 py-2.5 font-bold text-gray-500 uppercase tracking-wider text-[11px]">Vérification (POI)</th>
                                    <th className="px-6 py-2.5 font-bold text-gray-500 uppercase tracking-wider text-[11px]">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {filteredData.map((arret) => (
                                    <tr
                                        key={arret.id}
                                        onClick={() => handleSelectArret(arret)}
                                        className={`group cursor-pointer transition-all ${selectedArretId === arret.id ? 'ring-2 ring-inset ring-orange-200' : ''}`}
                                        style={{ backgroundColor: arret.status === 'conforme' ? '#f0fdf4' : '#fef2f2' }}
                                    >
                                        <td className="px-6 py-2 whitespace-nowrap">
                                            <div className="flex flex-col">
                                                <span className="font-semibold text-gray-900 text-sm">{arret.camion}</span>
                                                <span className="text-[10px] text-gray-400 font-bold uppercase tracking-tight">{arret.systemgps}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-2 whitespace-nowrap font-medium text-gray-600">{arret.date}</td>
                                        <td className="px-6 py-2 whitespace-nowrap">
                                            <span className="px-3 py-1 bg-gray-100 rounded-full text-xs font-bold text-gray-700">{arret.duree}</span>
                                        </td>
                                        <td className="px-6 py-2 whitespace-nowrap">
                                            <span className="font-semibold text-gray-600 text-[12px] tracking-tight truncate max-w-[150px]">
                                                {arret.destination_programmee || '-'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-2">
                                            <span className="font-semibold text-gray-900 text-[12px] tracking-tight truncate max-w-[200px]">
                                                {arret.poiPlanning === '-' ? 'Site Inconnu' : arret.poiPlanning}
                                            </span>
                                        </td>
                                        <td className="px-6 py-2 whitespace-nowrap text-gray-600 font-medium">{arret.voycle}</td>
                                        <td className="px-6 py-2 whitespace-nowrap text-gray-600 font-medium">{arret.chauffeur_nom}</td>
                                        <td className="px-6 py-2 whitespace-nowrap text-gray-600 font-medium">{arret.chauffeur_tel}</td>
                                        <td className="px-6 py-2">
                                            <div className="flex flex-col gap-1.5">
                                                <div className="flex items-center gap-2">
                                                    <div className={`w-2 h-2 rounded-full ${arret.status === 'conforme' ? 'bg-green-500' : 'bg-red-500'}`}></div>
                                                    <span className={`text-[10px] font-semibold uppercase tracking-tighter ${arret.status === 'conforme' ? 'text-green-700' : 'text-red-700'}`}>
                                                        {arret.status === 'conforme' ? 'Conforme' : 'Écart détecté'}
                                                    </span>
                                                </div>
                                                {arret.distance !== null ? (
                                                    <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-100 px-2 py-0.5 rounded-lg w-fit">
                                                        <span className="text-[9px] font-medium text-gray-400 uppercase tracking-widest">Dist.</span>
                                                        <span className="text-[11px] font-semibold text-gray-900">{arret.distance}m</span>
                                                    </div>
                                                ) : (
                                                    <span className="text-[10px] font-bold text-gray-300">Distance indisponible</span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-2">
                                            <div className="flex items-center gap-2 transition-opacity">
                                                {arret.status === 'non_conforme' && (
                                                    <button onClick={(e) => handleOpenPoiModal(e, arret)}
                                                        className="p-2 bg-white border border-gray-200 rounded-lg text-gray-600 hover:text-orange-600 hover:border-orange-200 transition-all shadow-sm"
                                                        title="Ajouter ce lieu comme POI">
                                                        <FiPlus />
                                                    </button>
                                                )}
                                                <button className="p-2 bg-white border border-gray-200 rounded-lg text-gray-600 hover:text-blue-600 hover:border-blue-200 transition-all shadow-sm" title="Détails de l'arrêt">
                                                    <FiMap />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {filteredData.length === 0 && !loading && (
                        <div className="flex flex-col items-center justify-center py-20 bg-gray-50/30 text-center">
                            <div className="w-[80px] h-[80px] rounded-2xl bg-[#F9731614] flex items-center justify-center mb-4">
                                <EmptyStopIcon />
                            </div>
                            <p className="text-2xl leading-none text-gray-900 font-black tracking-tight mb-2">Aucun arrêt trouvé</p>
                            <p className="text-base leading-relaxed text-gray-500 font-medium max-w-lg px-6">
                                Aucune donnée ne correspond à la date sélectionnée.<br />
                                Modifiez les filtres ou choisissez une autre date.
                            </p>
                        </div>
                    )}
                    {loading && (
                        <div className="flex justify-center py-20">
                            <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
                        </div>
                    )}
                </div>
            </div>

            <PoiModal
                isOpen={showPoiModal}
                onClose={() => setShowPoiModal(false)}
                initialData={poiModalData}
                groups={groups}
                onSubmit={handleSavePoi}
            />

            <MapModal
                isOpen={isMapOpen}
                onClose={() => setIsMapOpen(false)}
                positions={mapPositions}
                title={mapPositions.length === 1 ? `Position : ${mapPositions[0].label}` : "Aperçu des arrêts filtrés"}
            />
        </>
    );
};

export default Arrets;
