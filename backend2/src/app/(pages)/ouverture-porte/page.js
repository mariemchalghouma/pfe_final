'use client';

import { useMemo, useState, useEffect } from 'react';
import { FiCheckCircle, FiXCircle, FiMapPin, FiFilter, FiMap } from 'react-icons/fi';
import { ouverturesAPI } from '@/services/api';
import MapModal from '@/components/map/MapModal';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid,
    Tooltip, ResponsiveContainer,
} from 'recharts';

const formatDureeMinutes = (minutes) => {
    if (minutes === null || minutes === undefined) return 'En cours';
    const totalMinutes = Number(minutes);
    if (Number.isNaN(totalMinutes)) return 'En cours';
    const heures = Math.floor(totalMinutes / 60);
    const mins = Math.round(totalMinutes % 60);
    if (heures > 0) return `${heures}h ${mins} min`;
    return `${Math.round(totalMinutes)} min`;
};

const EmptyDoorIcon = () => (
    <svg width="44" height="44" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M7.5 3.5L13.5 2.5C14.2 2.4 14.8 2.9 14.8 3.6V20.3C14.8 20.9 14.2 21.4 13.5 21.3L7.5 20.3V3.5Z" stroke="#F97316" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M14.8 4.5H17.5C18.3 4.5 19 5.2 19 6V18C19 18.8 18.3 19.5 17.5 19.5H14.8" stroke="#F97316" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        <circle cx="11.2" cy="11.8" r="0.8" fill="#F97316"/>
        <path d="M5 20.5H19.5" stroke="#F97316" strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
);

const OuverturePorte = () => {
    const [ouverturesData, setOuverturesData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [dateFilterMode, setDateFilterMode] = useState('day');
    const [filterDate, setFilterDate] = useState('');
    const [filterStartDate, setFilterStartDate] = useState('');
    const [filterEndDate, setFilterEndDate] = useState('');
    const [filterWeek, setFilterWeek] = useState('');
    const [filterMonth, setFilterMonth] = useState('');
    const [filterMatricule, setFilterMatricule] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [selectedOuvertureId, setSelectedOuvertureId] = useState(null);
    const [isMapOpen, setIsMapOpen] = useState(false);
    const [mapPositions, setMapPositions] = useState([]);

    const getDateRangeParams = () => {
        const today = new Date().toISOString().split('T')[0];

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
        const fetchOuvertures = async () => {
            try {
                setLoading(true);
                const { dateStart, dateEnd } = getDateRangeParams();
                const response = await ouverturesAPI.getOuvertures({ dateStart, dateEnd });
                const ouvertures = response.data || [];

                const formattedData = ouvertures.map((item, index) => {
                    const dateOuvSource = item.dateOuverture ?? item.date_ouverture;
                    const dateFermSource = item.dateFermeture ?? item.date_fermeture;
                    const dateOuv = dateOuvSource ? new Date(dateOuvSource) : null;
                    const dateFerm = dateFermSource ? new Date(dateFermSource) : null;
                    const poiNom = item.poiProche ?? item.poi_nom ?? '-';
                    const poiAdresse = item.adressePoiProche ?? item.poi_adresse ?? '-';
                    const distancePoiMetres = item.distancePoiMetres ?? item.distance_m ?? null;
                    const dureeMinutes = item.dureeMinutes ?? item.duree_minutes ?? null;
                    const lat = item.lat ?? null;
                    const lng = item.lng ?? null;
                    const statut = distancePoiMetres !== null && distancePoiMetres < 10 && dureeMinutes !== null && dureeMinutes < 35 ? 'conforme' : 'non_conforme';

                    return {
                        id: index + 1,
                        camion: item.camion || '-',
                        localisation: item.localisation || item.poiStop || '-',
                        poiProche: poiNom,
                        poiAdresse,
                        distancePoiMetres,
                        lat,
                        lng,
                        ouverture: 'Oui',
                        dateOuv: dateOuv ? dateOuv.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '-',
                        dateOuvJour: dateOuv ? dateOuv.toISOString().split('T')[0] : '-',
                        duree: formatDureeMinutes(dureeMinutes),
                        dureeMinutes,
                        dateFerm: dateFerm ? dateFerm.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : 'En cours',
                        dateFermJour: dateFerm ? dateFerm.toISOString().split('T')[0] : '',
                        statut,
                    };
                });

                setOuverturesData(formattedData);
            } catch (error) {
                console.error('Error fetching ouvertures:', error);
                setOuverturesData([]);
            } finally {
                setLoading(false);
            }
        };

        fetchOuvertures();
    }, [dateFilterMode, filterDate, filterStartDate, filterEndDate, filterWeek, filterMonth]);

    const filteredData = useMemo(() => {
        const getWeekNumber = (dateValue) => {
            const date = new Date(Date.UTC(dateValue.getFullYear(), dateValue.getMonth(), dateValue.getDate()));
            date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
            const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
            return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
        };

        return ouverturesData.filter((o) => {
            const matchStatus = statusFilter === 'all' ? true : o.statut === statusFilter;
            const dateSource = o.dateOuvJour && o.dateOuvJour !== '-' ? o.dateOuvJour : null;
            const matchDate = (() => {
                if (!dateSource) return true;
                if (dateFilterMode === 'day' && filterDate) return dateSource === filterDate;
                if (dateFilterMode === 'range') {
                    if (filterStartDate && filterEndDate) return dateSource >= filterStartDate && dateSource <= filterEndDate;
                    if (filterStartDate) return dateSource >= filterStartDate;
                    if (filterEndDate) return dateSource <= filterEndDate;
                }
                if (dateFilterMode === 'week' && filterWeek) {
                    const [year, week] = filterWeek.split('-W').map(Number);
                    const d = new Date(dateSource);
                    return d.getFullYear() === year && getWeekNumber(d) === week;
                }
                if (dateFilterMode === 'month' && filterMonth) return dateSource.startsWith(filterMonth);
                return true;
            })();

            const normalizedFilter = filterMatricule.replace(/\s/g, '').toLowerCase();
            const normalizedCamion = String(o.camion || '').replace(/\s/g, '').toLowerCase();
            const matchMatricule = filterMatricule ? normalizedCamion.includes(normalizedFilter) : true;

            return matchStatus && matchDate && matchMatricule;
        });
    }, [ouverturesData, statusFilter, dateFilterMode, filterDate, filterStartDate, filterEndDate, filterWeek, filterMonth, filterMatricule]);

    const stats = useMemo(() => ({
        total: filteredData.length,
        conformes: filteredData.filter((o) => o.statut === 'conforme').length,
        nonConformes: filteredData.filter((o) => o.statut === 'non_conforme').length,
    }), [filteredData]);

    const chartData = useMemo(() => {
        const dataByDate = {};
        filteredData.forEach((item) => {
            if (!item.dateOuvJour || item.dateOuvJour === '-') return;
            const date = item.dateOuvJour.substring(5);
            if (!dataByDate[date]) dataByDate[date] = { date, conforme: 0, non_conforme: 0 };
            if (item.statut === 'conforme') dataByDate[date].conforme += 1;
            else dataByDate[date].non_conforme += 1;
        });
        return Object.values(dataByDate).sort((a, b) => a.date.localeCompare(b.date));
    }, [filteredData]);

    const handleOpenFullMap = () => {
        const positions = filteredData
            .filter((item) => item.lat !== null && item.lng !== null)
            .map((item) => ({
                id: item.id, lat: item.lat, lng: item.lng, label: item.camion, status: item.statut,
                info: `${item.localisation} · ⏳ ${item.duree}`,
            }));
        if (positions.length === 0) return;
        setMapPositions(positions);
        setIsMapOpen(true);
    };

    const handleSelectOuverture = (ouverture) => {
        setSelectedOuvertureId(ouverture.id);
        if (ouverture.lat === null || ouverture.lng === null) return;
        setMapPositions([{
            id: ouverture.id, lat: ouverture.lat, lng: ouverture.lng, label: ouverture.camion, status: ouverture.statut,
            info: `${ouverture.localisation} · ⏳ ${ouverture.duree}`,
        }]);
        setIsMapOpen(true);
    };

    return (
        <>
            <div className="p-6">
                <h1 className="text-2xl font-bold text-gray-800 mb-6">Ouverture Portes</h1>

                <div className="mb-6 flex flex-wrap items-center justify-between gap-6 bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                    <div className="flex flex-wrap items-center gap-4">
                        <div className="flex bg-gray-100 p-1 rounded-xl">
                            {[
                                { id: 'day', label: 'Jour' },
                                { id: 'range', label: 'Plage' },
                                { id: 'week', label: 'Semaine' },
                                { id: 'month', label: 'Mois' },
                            ].map((mode) => (
                                <button key={mode.id} onClick={() => setDateFilterMode(mode.id)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${dateFilterMode === mode.id ? 'bg-white text-orange-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
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
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><FiFilter className="text-gray-400" /></div>
                            <input type="text" placeholder="Matricule..." value={filterMatricule} onChange={(e) => setFilterMatricule(e.target.value)}
                                className="pl-10 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm w-44 focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all" />
                        </div>

                        <div className="relative">
                            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
                                className="pl-3 pr-10 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 appearance-none focus:outline-none focus:ring-2 focus:ring-orange-500 border-none cursor-pointer font-medium">
                                <option value="all">Tous</option>
                                <option value="conforme">Conforme</option>
                                <option value="non_conforme">Non conforme</option>
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
                            <p className="text-xl font-black text-green-600">{stats.conformes}</p>
                        </div>
                        <div className="w-px h-8 bg-gray-100"></div>
                        <div className="text-right">
                            <p className="text-[10px] font-bold text-red-500 uppercase tracking-widest leading-tight">Non conformes</p>
                            <p className="text-xl font-black text-red-600">{stats.nonConformes}</p>
                        </div>
                    </div>
                </div>

                {filteredData.length > 0 && (
                    <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm mb-8">
                        <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-[0.1em] mb-6">
                            OUVERTURES PAR DATE — CONFORME VS NON CONFORME
                        </h3>
                        <div className="h-[110px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 600 }} axisLine={false} tickLine={false} />
                                    <YAxis tick={{ fill: '#cbd5e1', fontSize: 10, fontWeight: 500 }} axisLine={false} tickLine={false} width={32} />
                                    <Tooltip cursor={{ fill: 'rgba(241,245,249,0.35)' }} contentStyle={{ borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: 12 }} />
                                    <Line
                                        type="monotone"
                                        dataKey="conforme"
                                        name="Conforme"
                                        stroke="#46B519"
                                        strokeWidth={2}
                                        dot={{ r: 4, fill: '#46B519', strokeWidth: 2, stroke: '#fff' }}
                                        activeDot={{ r: 6 }}
                                    />
                                    <Line
                                        type="monotone"
                                        dataKey="non_conforme"
                                        name="Non conforme"
                                        stroke="#FF4B50"
                                        strokeWidth={2}
                                        dot={{ r: 4, fill: '#FF4B50', strokeWidth: 2, stroke: '#fff' }}
                                        activeDot={{ r: 6 }}
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                        <div className="mt-4 flex items-center justify-center gap-8 text-sm font-semibold text-gray-500">
                            <span className="inline-flex items-center gap-2"><span className="w-4 h-4 rounded-full bg-[#46B519]" /> CONFORME</span>
                            <span className="inline-flex items-center gap-2"><span className="w-4 h-4 rounded-full bg-[#FF4B50]" /> NON CONFORME</span>
                        </div>
                    </div>
                )}

                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden min-h-[500px]">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left border-collapse">
                            <thead>
                                <tr className="bg-gray-50/50 border-b border-gray-100">
                                    <th className="px-6 py-2.5 font-bold text-gray-500 uppercase tracking-wider text-[11px]">Camion</th>
                                    <th className="px-6 py-2.5 font-bold text-gray-500 uppercase tracking-wider text-[11px]">Localisation</th>
                                    <th className="px-6 py-2.5 font-bold text-gray-500 uppercase tracking-wider text-[11px]">POI proche</th>
                                    <th className="px-6 py-2.5 font-bold text-gray-500 uppercase tracking-wider text-[11px]">Adresse POI</th>
                                    <th className="px-6 py-2.5 font-bold text-gray-500 uppercase tracking-wider text-[11px]">Distance</th>
                                    <th className="px-6 py-2.5 font-bold text-gray-500 uppercase tracking-wider text-[11px]">Ouverture</th>
                                    <th className="px-6 py-2.5 font-bold text-gray-500 uppercase tracking-wider text-[11px]">Date ouv.</th>
                                    <th className="px-6 py-2.5 font-bold text-gray-500 uppercase tracking-wider text-[11px]">Durée</th>
                                    <th className="px-6 py-2.5 font-bold text-gray-500 uppercase tracking-wider text-[11px]">Date ferm.</th>
                                    <th className="px-6 py-2.5 font-bold text-gray-500 uppercase tracking-wider text-[11px]">Statut</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {filteredData.map((row) => (
                                    <tr key={row.id} onClick={() => handleSelectOuverture(row)}
                                        className={`group cursor-pointer transition-all ${selectedOuvertureId === row.id ? 'ring-2 ring-inset ring-orange-200' : ''}`}
                                        style={{ backgroundColor: row.statut === 'conforme' ? '#f0fdf4' : '#fef2f2' }}>
                                        <td className="px-6 py-2 whitespace-nowrap"><span className="font-semibold text-gray-900 text-sm">{row.camion}</span></td>
                                        <td className="px-6 py-2 whitespace-nowrap">
                                            <span className="inline-flex items-center gap-1.5 font-medium text-gray-600"><FiMapPin className="text-gray-400" />{row.localisation}</span>
                                        </td>
                                        <td className="px-6 py-2 whitespace-nowrap font-medium text-gray-600">{row.poiProche}</td>
                                        <td className="px-6 py-2 whitespace-nowrap font-medium text-gray-600">{row.poiAdresse}</td>
                                        <td className="px-6 py-2 whitespace-nowrap">
                                            <span className="px-3 py-1 bg-gray-100 rounded-full text-xs font-bold text-gray-700">
                                                {row.distancePoiMetres !== null && row.distancePoiMetres !== undefined ? `${Number(row.distancePoiMetres).toFixed(2)} m` : '-'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-2 whitespace-nowrap">
                                            <span className="px-3 py-1 bg-orange-50 border border-orange-200 rounded-full text-xs font-bold text-orange-700">{row.ouverture}</span>
                                        </td>
                                        <td className="px-6 py-2 whitespace-nowrap font-medium text-gray-600">
                                            <div className="font-semibold text-gray-900 text-sm">{row.dateOuv}</div>
                                            <div className="text-[11px] text-gray-400">{row.dateOuvJour}</div>
                                        </td>
                                        <td className="px-6 py-2 whitespace-nowrap">
                                            <span className="px-3 py-1 bg-gray-100 rounded-full text-xs font-bold text-gray-700">{row.duree}</span>
                                        </td>
                                        <td className="px-6 py-2 whitespace-nowrap font-medium text-gray-600">
                                            <div className="font-semibold text-gray-900 text-sm">{row.dateFerm}</div>
                                            {row.dateFermJour && <div className="text-[11px] text-gray-400">{row.dateFermJour}</div>}
                                        </td>
                                        <td className="px-6 py-2">
                                            {row.statut === 'conforme' ? (
                                                <div className="flex items-center gap-2">
                                                    <div className="w-2 h-2 rounded-full bg-green-500"></div>
                                                    <span className="text-[10px] font-semibold uppercase tracking-tighter text-green-700 inline-flex items-center gap-1">
                                                        <FiCheckCircle /> Conforme
                                                    </span>
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-2">
                                                    <div className="w-2 h-2 rounded-full bg-red-500"></div>
                                                    <span className="text-[10px] font-semibold uppercase tracking-tighter text-red-700 inline-flex items-center gap-1">
                                                        <FiXCircle /> Non conforme
                                                    </span>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {filteredData.length === 0 && !loading && (
                        <div className="flex flex-col items-center justify-center py-24 bg-gray-50/30 text-center">
                            <div className="w-24 h-24 rounded-3xl bg-orange-50 flex items-center justify-center mb-7">
                                <EmptyDoorIcon />
                            </div>
                            <h3 className="text-4xl font-extrabold text-gray-900 mb-4">Aucun evenement trouve</h3>
                            <p className="text-gray-500 text-lg leading-relaxed max-w-xl">
                                Aucune donnee ne correspond a la date selectionnee.<br />
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

            <MapModal
                isOpen={isMapOpen}
                onClose={() => setIsMapOpen(false)}
                positions={mapPositions}
                title={mapPositions.length === 1 ? `Position : ${mapPositions[0].label}` : 'Aperçu des ouvertures filtrées'}
            />
        </>
    );
};

export default OuverturePorte;
