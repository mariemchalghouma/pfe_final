'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { FiSearch, FiFilter, FiPlus, FiEdit2, FiTrash2, FiClock, FiGrid, FiList, FiMap, FiUpload } from 'react-icons/fi';
import PoiModal from '@/components/PoiModal';
import GroupModal from '@/components/GroupModal';
import MapModal from '@/components/map/MapModal';
import { poiAPI, groupsAPI } from '@/services/api';
import * as XLSX from 'xlsx';


const GestionPoi = () => {
    const [pois, setPois] = useState([]);
    const [groups, setGroups] = useState([]);
    const [history, setHistory] = useState([]);
    const [historySearch, setHistorySearch] = useState('');
    const [historyActionFilter, setHistoryActionFilter] = useState('ALL');
    const [loading, setLoading] = useState(true);

    const [search, setSearch] = useState('');
    const [filterGroup, setFilterGroup] = useState('Tous');
    const [activeTab, setActiveTab] = useState('liste');
    const [selectedPoiId, setSelectedPoiId] = useState(null);

    const [showPoiModal, setShowPoiModal] = useState(false);
    const [editingPoi, setEditingPoi] = useState(null);
    const [showGroupModal, setShowGroupModal] = useState(false);
    const [editingGroup, setEditingGroup] = useState(null);
    const [isMapOpen, setIsMapOpen] = useState(false);
    const [mapPositions, setMapPositions] = useState([]);

    const fileInputRef = useRef(null);

    const fetchPois = async () => {
        setLoading(true);
        try {
            const response = await poiAPI.getPOIs();
            setPois(response.data || []);
        } catch (error) {
            console.error('Failed to fetch POIs:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchHistory = async () => {
        try {
            const response = await poiAPI.getPOIHistory();
            setHistory(response.data || []);
        } catch (error) {
            console.error('Failed to fetch history:', error);
        }
    };

    const fetchGroups = async () => {
        try {
            const response = await groupsAPI.getGroups();
            setGroups(response.data || []);
        } catch (error) {
            console.error('Failed to fetch groups:', error);
        }
    };

    useEffect(() => {
        fetchPois();
        fetchGroups();
    }, []);

    useEffect(() => {
        if (activeTab === 'historique') fetchHistory();
    }, [activeTab]);

    const filteredPois = useMemo(() => {
        return pois.filter((poi) => {
            const matchesSearch = (poi.code || '').toLowerCase().includes(search.toLowerCase());
            const matchesGroup = filterGroup === 'Tous' || poi.groupe === filterGroup;
            return matchesSearch && matchesGroup;
        });
    }, [search, filterGroup, pois]);

    const filteredHistory = useMemo(() => {
        return history.filter((item) => {
            const matchesSearch =
                (item.poi_code || '').toLowerCase().includes(historySearch.toLowerCase()) ||
                (item.details || '').toLowerCase().includes(historySearch.toLowerCase());
            const matchesAction = historyActionFilter === 'ALL' || item.action === historyActionFilter;
            return matchesSearch && matchesAction;
        });
    }, [history, historySearch, historyActionFilter]);

    const handleSelectPoi = (poi) => {
        setSelectedPoiId(poi.id);
        const group = groups.find((g) => g.nom === poi.groupe) || { couleur: '#3b82f6' };
        setMapPositions([{
            id: poi.id, lat: parseFloat(poi.lat), lng: parseFloat(poi.lng),
            label: poi.code, color: group.couleur, info: `${poi.groupe} · ${poi.description}`,
        }]);
        setIsMapOpen(true);
    };

    const handleOpenFullMap = () => {
        const positions = filteredPois.map((poi) => {
            const group = groups.find((g) => g.nom === poi.groupe) || { couleur: '#3b82f6' };
            return {
                id: poi.id, lat: parseFloat(poi.lat), lng: parseFloat(poi.lng),
                label: poi.code, color: group.couleur, info: `${poi.groupe} · ${poi.description}`,
            };
        });
        setMapPositions(positions);
        setIsMapOpen(true);
    };

    const handleSavePoi = async (poiData) => {
        try {
            // Check if group is new
            const groupExists = groups.some(g => g.nom === poiData.groupe);
            if (!groupExists && poiData.groupe) {
                const couleur = '#fbbf24'; // Default
                await groupsAPI.createGroup({
                    nom: poiData.groupe,
                    description: poiData.groupeDescription || '',
                    couleur
                });
                await fetchGroups();
            }

            if (editingPoi) {
                await poiAPI.updatePOI(editingPoi.id, poiData);
            } else {
                await poiAPI.createPOI(poiData);
            }
            setShowPoiModal(false);
            setEditingPoi(null);
            fetchPois();
        } catch (error) {
            console.error('Failed to save POI:', error);
        }
    };

    const handleDeletePoi = async (id) => {
        if (window.confirm('Voulez-vous vraiment supprimer ce POI ?')) {
            try {
                await poiAPI.deletePOI(id);
                fetchPois();
            } catch (error) {
                console.error('Failed to delete POI:', error);
            }
        }
    };

    const handleImportExcel = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (evt) => {
            try {
                const bstr = evt.target.result;
                const wb = XLSX.read(bstr, { type: 'binary' });
                const wsname = wb.SheetNames[0];
                const ws = wb.Sheets[wsname];
                const data = XLSX.utils.sheet_to_json(ws);
                for (const row of data) {
                    await poiAPI.createPOI({
                        code: row.Code || row.code || row.Nom || row.nom,
                        groupe: row.Groupe || row.groupe || 'Tous',
                        type: row.Type || row.type || 'Point',
                        lat: row.Lat || row.lat,
                        lng: row.Lng || row.lng,
                        description: row.Description || row.description || row.Adresse || row.adresse || '',
                    });
                }
                alert(`${data.length} POI importés avec succès !`);
                fetchPois();
            } catch (error) {
                console.error('Excel import failed:', error);
                alert("Erreur lors de l'importation. Vérifiez le format du fichier.");
            }
        };
        reader.readAsBinaryString(file);
        e.target.value = null;
    };

    const handleSaveGroup = async (groupData) => {
        try {
            if (editingGroup) {
                await groupsAPI.updateGroup(editingGroup.id, groupData);
            } else {
                await groupsAPI.createGroup(groupData);
            }
            setShowGroupModal(false);
            setEditingGroup(null);
            fetchGroups();
        } catch (error) {
            console.error('Failed to save group:', error);
        }
    };

    const handleEditGroupClick = (group) => {
        setEditingGroup(group);
        setShowGroupModal(true);
    };

    const handleDeleteGroup = async (groupId) => {
        if (window.confirm('Voulez-vous vraiment supprimer ce groupe ?')) {
            try {
                await groupsAPI.deleteGroup(groupId);
                fetchGroups();
            } catch (error) {
                console.error('Failed to delete group:', error);
            }
        }
    };

    return (
        <>
            <div className="p-4 px-6 max-w-[1600px] mx-auto min-h-screen bg-gray-50/30">
                {/* Header */}
                <div className="mb-6 flex flex-wrap items-center justify-between gap-6 bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                    <div className="flex flex-wrap items-center gap-4">
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><FiSearch className="text-gray-400" /></div>
                            <input type="text" placeholder="Rechercher..." value={search} onChange={(e) => setSearch(e.target.value)}
                                className="pl-10 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm w-44 focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all font-medium" />
                        </div>
                        <div className="relative">
                            <select value={filterGroup} onChange={(e) => setFilterGroup(e.target.value)}
                                className="pl-3 pr-10 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 appearance-none focus:outline-none focus:ring-2 focus:ring-orange-500 border-none cursor-pointer font-medium">
                                <option value="Tous">Tous les groupes</option>
                                {groups.map((g) => (<option key={g.id} value={g.nom}>{g.nom}</option>))}
                            </select>
                            <FiFilter className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                        </div>
                        <div className="flex items-center gap-2 pr-4 border-r border-gray-100 mr-2">
                            <div className="text-right">
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-tight">Total POI</p>
                                <p className="text-xl font-black text-gray-900 leading-tight">{filteredPois.length}</p>
                            </div>
                        </div>
                        <button onClick={handleOpenFullMap} className="p-2.5 bg-gray-50 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all border border-gray-100" title="Voir sur la carte">
                            <FiMap className="text-lg" />
                        </button>
                    </div>
                    <div className="flex items-center gap-3">
                        <input type="file" ref={fileInputRef} onChange={handleImportExcel} accept=".xlsx, .xls" className="hidden" />
                        <button onClick={() => fileInputRef.current.click()}
                            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-bold hover:bg-green-700 transition-all shadow-lg shadow-green-100">
                            <FiUpload className="text-lg" /> Importer Excel
                        </button>
                        <button onClick={() => setShowPoiModal(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-xl text-sm font-bold hover:bg-orange-600 transition-all shadow-lg shadow-orange-200">
                            <FiPlus className="text-lg" /> Nouveau POI
                        </button>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-8 border-b border-gray-100 text-sm font-medium mb-8">
                    <button onClick={() => setActiveTab('liste')}
                        className={`pb-4 transition-all flex items-center gap-2 relative ${activeTab === 'liste' ? 'text-orange-500 border-b-2 border-orange-500' : 'text-gray-500 hover:text-gray-700'}`}>
                        <FiList /> Liste des POI
                    </button>
                    <button onClick={() => setActiveTab('groupes')}
                        className={`pb-4 transition-all flex items-center gap-2 relative ${activeTab === 'groupes' ? 'text-orange-500 border-b-2 border-orange-500' : 'text-gray-500 hover:text-gray-700'}`}>
                        <FiGrid /> Groupes
                    </button>
                    <button onClick={() => setActiveTab('historique')}
                        className={`pb-4 transition-all flex items-center gap-2 relative ${activeTab === 'historique' ? 'text-orange-500 border-b-2 border-orange-500' : 'text-gray-500 hover:text-gray-700'}`}>
                        <FiClock /> Historique
                    </button>
                </div>

                {/* Content */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden min-h-[500px]">
                    {activeTab === 'liste' && (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left border-collapse">
                                <thead>
                                    <tr className="bg-gray-50/50 border-b border-gray-100">
                                        <th className="px-6 py-2.5 font-bold text-gray-500 uppercase tracking-wider text-[11px]">Code du POI</th>
                                        <th className="px-6 py-2.5 font-bold text-gray-500 uppercase tracking-wider text-[11px]">Groupe</th>
                                        <th className="px-6 py-2.5 font-bold text-gray-500 uppercase tracking-wider text-[11px]">Type</th>
                                        <th className="px-6 py-2.5 font-bold text-gray-500 uppercase tracking-wider text-[11px]">Localisation</th>
                                        <th className="px-6 py-2.5 font-bold text-gray-500 uppercase tracking-wider text-[11px]">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {filteredPois.map((poi) => {
                                        const group = groups.find((g) => g.nom === poi.groupe) || { nom: poi.groupe, couleur: '#94a3b8' };
                                        return (
                                            <tr key={poi.id} onClick={() => handleSelectPoi(poi)}
                                                className={`group cursor-pointer transition-all hover:bg-gray-50/50 ${selectedPoiId === poi.id ? 'ring-2 ring-inset ring-orange-200' : ''}`}>
                                                <td className="px-6 py-2 whitespace-nowrap">
                                                    <span className="font-semibold text-gray-900 text-sm">{poi.code}</span>
                                                </td>
                                                <td className="px-6 py-2 whitespace-nowrap">
                                                    <span
                                                        className="px-2.5 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wider border"
                                                        style={{
                                                            backgroundColor: `${group.couleur}10`, // 10% opacity
                                                            color: group.couleur,
                                                            borderColor: `${group.couleur}30` // 30% opacity
                                                        }}
                                                    >
                                                        {poi.groupe}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-2 whitespace-nowrap">
                                                    <span className="px-2.5 py-0.5 bg-gray-100 rounded-full text-[10px] font-semibold text-gray-700">{poi.type}</span>
                                                </td>
                                                <td className="px-6 py-2 text-gray-500 max-w-xs truncate font-medium">
                                                    <div className="flex flex-col">
                                                        <span className="truncate">{poi.description || 'N/A'}</span>
                                                        <span className="text-[10px] text-gray-400 font-bold mt-0.5">{poi.lat}, {poi.lng}</span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-2">
                                                    <div className="flex items-center gap-2 transition-opacity">
                                                        <button onClick={(e) => { e.stopPropagation(); setEditingPoi(poi); setShowPoiModal(true); }}
                                                            className="p-2 bg-white border border-gray-200 rounded-lg text-gray-600 hover:text-orange-600 hover:border-orange-200 transition-all shadow-sm" title="Modifier">
                                                            <FiEdit2 size={14} />
                                                        </button>
                                                        <button onClick={(e) => { e.stopPropagation(); handleDeletePoi(poi.id); }}
                                                            className="p-2 bg-white border border-gray-200 rounded-lg text-red-600 hover:text-red-700 hover:border-red-200 transition-all shadow-sm" title="Supprimer">
                                                            <FiTrash2 size={14} />
                                                        </button>
                                                        <button onClick={(e) => { e.stopPropagation(); handleSelectPoi(poi); }}
                                                            className="p-2 bg-white border border-gray-200 rounded-lg text-blue-600 hover:text-blue-700 hover:border-blue-200 transition-all shadow-sm" title="Détails">
                                                            <FiMap size={14} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {activeTab === 'groupes' && (
                        <div className="p-8 max-w-6xl mx-auto">
                            <div className="flex justify-between items-center mb-10">
                                <div>
                                    <h2 className="text-base font-black text-gray-900 tracking-tight">Configuration des groupes</h2>
                                    <p className="text-gray-500 text-[11px] mt-1">Organisez vos points d&apos;intérêt par catégories personnalisées</p>
                                </div>
                                <button onClick={() => { setEditingGroup(null); setShowGroupModal(true); }}
                                    className="flex items-center gap-2 bg-orange-500 text-white px-6 py-3 rounded-2xl font-bold text-sm hover:bg-orange-600 transition-all shadow-lg shadow-orange-100 group">
                                    <FiPlus className="group-hover:rotate-90 transition-transform" /> Nouveau groupe
                                </button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {groups.map((group) => {
                                    const count = pois.filter((p) => p.groupe === group.nom).length;
                                    return (
                                        <div key={group.id} className="group relative bg-white border border-gray-100 rounded-[32px] p-6 hover:shadow-xl hover:shadow-gray-200/50 transition-all duration-500 overflow-hidden">
                                            <div className="absolute top-0 right-0 w-32 h-32 -mr-8 -mt-8 rounded-full opacity-[0.03] transition-transform group-hover:scale-150 duration-700" style={{ backgroundColor: group.couleur }}></div>
                                            <div className="flex justify-between items-start mb-6">
                                                <div className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-inner" style={{ backgroundColor: `${group.couleur}15` }}>
                                                    <div className="w-5 h-5 rounded-full shadow-sm" style={{ backgroundColor: group.couleur }}></div>
                                                </div>
                                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity translate-y-2 group-hover:translate-y-0 duration-300">
                                                    <button onClick={() => handleEditGroupClick(group)} className="p-2.5 text-gray-400 hover:text-orange-500 hover:bg-orange-50 rounded-xl transition-all" title="Modifier">
                                                        <FiEdit2 size={16} />
                                                    </button>
                                                    <button onClick={() => handleDeleteGroup(group.id)} className="p-2.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all" title="Supprimer">
                                                        <FiTrash2 size={16} />
                                                    </button>
                                                </div>
                                            </div>
                                            <div>
                                                <h3 className="font-black text-gray-900 text-sm mb-1 tracking-tight">{group.nom}</h3>
                                                <p className="text-gray-500 text-[10px] font-medium mb-6 line-clamp-1">{group.description || 'Pas de description définie'}</p>
                                                <div className="flex items-center justify-between pt-6 border-t border-gray-50">
                                                    <div className="flex flex-col">
                                                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Points rattachés</span>
                                                        <span className="text-base font-black text-gray-900">{count}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {groups.length === 0 && (
                                <div className="text-center py-20 bg-gray-50/50 rounded-[40px] border-2 border-dashed border-gray-200">
                                    <div className="w-20 h-20 bg-white rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-sm">
                                        <FiGrid className="text-3xl text-gray-300" />
                                    </div>
                                    <h3 className="text-lg font-black text-gray-900 mb-2">Aucun groupe trouvé</h3>
                                    <p className="text-gray-500 text-sm mb-8">Commencez par créer votre premier groupe de POI</p>
                                    <button onClick={() => setShowGroupModal(true)}
                                        className="inline-flex items-center gap-2 bg-white border border-gray-200 text-gray-900 px-6 py-3 rounded-2xl font-bold text-sm hover:border-orange-200 hover:text-orange-500 transition-all">
                                        <FiPlus /> Créer un groupe
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'historique' && (
                        <div className="p-8 max-w-5xl mx-auto">
                            <div className="flex flex-wrap items-center justify-between gap-6 mb-10 pb-8 border-b border-gray-100">
                                <div>
                                    <h2 className="text-base font-black text-gray-900 tracking-tight">Audit Log</h2>
                                    <p className="text-gray-500 text-[11px] mt-1">Registre complet des modifications du système</p>
                                </div>
                                <div className="flex flex-wrap items-center gap-3">
                                    <div className="relative">
                                        <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm" />
                                        <input type="text" placeholder="Rechercher dans l'historique..." value={historySearch} onChange={(e) => setHistorySearch(e.target.value)}
                                            className="pl-10 pr-4 py-2 bg-gray-50 border border-gray-100 rounded-xl text-[12px] font-bold focus:outline-none focus:ring-2 focus:ring-orange-100 focus:border-orange-200 transition-all w-64" />
                                    </div>
                                    <select value={historyActionFilter} onChange={(e) => setHistoryActionFilter(e.target.value)}
                                        className="px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl text-[12px] font-bold text-gray-700 outline-none focus:ring-2 focus:ring-orange-100 transition-all">
                                        <option value="ALL">Toutes les actions</option>
                                        <option value="CREATE">Créations</option>
                                        <option value="UPDATE">Modifications</option>
                                        <option value="DELETE">Suppressions</option>
                                    </select>
                                </div>
                            </div>

                            {filteredHistory.length > 0 ? (
                                <div className="space-y-6">
                                    {Object.entries(
                                        filteredHistory.reduce((acc, item) => {
                                            const dateLabel = new Date(item.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
                                            if (!acc[dateLabel]) acc[dateLabel] = [];
                                            acc[dateLabel].push(item);
                                            return acc;
                                        }, {})
                                    ).map(([date, items]) => (
                                        <div key={date} className="space-y-4">
                                            <div className="flex items-center gap-4">
                                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">{date}</span>
                                                <div className="h-px bg-gray-50 flex-1"></div>
                                            </div>
                                            {items.map((item) => (
                                                <div key={item.id} className="bg-white border border-gray-100 rounded-2xl p-5 hover:border-gray-200 hover:shadow-sm transition-all group overflow-hidden relative">
                                                    <div className="flex items-start gap-4">
                                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${item.action === 'CREATE' ? 'bg-green-50 text-green-600' : item.action === 'UPDATE' ? 'bg-blue-50 text-blue-600' : 'bg-red-50 text-red-600'}`}>
                                                            {item.action === 'CREATE' ? <FiPlus /> : item.action === 'UPDATE' ? <FiEdit2 /> : <FiTrash2 />}
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex justify-between items-start mb-3">
                                                                <div>
                                                                    <h4 className="text-[13px] font-black text-gray-900 tracking-tight leading-none mb-1">{item.poi_code}</h4>
                                                                    <p className="text-[10px] font-bold text-gray-400 flex items-center gap-1.5 uppercase">
                                                                        <FiClock size={10} />
                                                                        {new Date(item.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                                                                    </p>
                                                                </div>
                                                                <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-tighter ${item.action === 'CREATE' ? 'bg-green-100 text-green-700' : item.action === 'UPDATE' ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'}`}>
                                                                    {item.action}
                                                                </span>
                                                            </div>
                                                            {item.details && (
                                                                <div className="space-y-2">
                                                                    {item.details.split(', ').map((detail, dIdx) => {
                                                                        if (detail.includes(': ')) {
                                                                            const [field, values] = detail.split(': ');
                                                                            const [oldVal, newVal] = values.split(' -> ');
                                                                            return (
                                                                                <div key={dIdx} className="flex flex-col gap-1 py-2 px-3 bg-gray-50/50 rounded-xl border border-gray-50">
                                                                                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">{field}</span>
                                                                                    {newVal ? (
                                                                                        <div className="flex items-center gap-2">
                                                                                            <span className="text-[11px] font-medium text-gray-400 line-through decoration-gray-200/50">{oldVal}</span>
                                                                                            <span className="text-gray-300">&rarr;</span>
                                                                                            <span className="text-[11px] font-bold text-gray-900">{newVal}</span>
                                                                                        </div>
                                                                                    ) : (
                                                                                        <span className="text-[11px] font-bold text-gray-900">{values}</span>
                                                                                    )}
                                                                                </div>
                                                                            );
                                                                        }
                                                                        return (
                                                                            <p key={dIdx} className="text-[11px] font-medium text-gray-500 italic bg-gray-50/30 px-3 py-1.5 rounded-lg">{detail}</p>
                                                                        );
                                                                    })}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center py-32 text-gray-400 bg-gray-50/50 rounded-[40px] border-2 border-dashed border-gray-100">
                                    <div className="w-20 h-20 bg-white rounded-3xl flex items-center justify-center mb-6 shadow-sm border border-gray-50">
                                        <FiClock className="text-3xl text-gray-200" />
                                    </div>
                                    <h3 className="text-sm font-black text-gray-900">Aucun résultat d&apos;audit</h3>
                                    <p className="text-[11px] text-gray-500 mt-1 max-w-xs text-center">Aucune modification ne correspond à vos filtres de recherche.</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            <MapModal isOpen={isMapOpen} onClose={() => setIsMapOpen(false)} positions={mapPositions}
                title={mapPositions.length === 1 ? `Localisation : ${mapPositions[0].label}` : "Points d'intérêt"} />

            <PoiModal isOpen={showPoiModal} onClose={() => { setShowPoiModal(false); setEditingPoi(null); }}
                groups={groups} initialData={editingPoi} onSubmit={handleSavePoi} />

            <GroupModal isOpen={showGroupModal} onClose={() => setShowGroupModal(false)}
                initialData={editingGroup} onSubmit={handleSaveGroup} />
        </>
    );
};

export default GestionPoi;
