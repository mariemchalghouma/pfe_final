'use client';

import { useState, useEffect } from 'react';
import { FiX, FiMapPin, FiLayers } from 'react-icons/fi';
import dynamic from 'next/dynamic';

const MapContainer = dynamic(
    () => import('react-leaflet').then(mod => mod.MapContainer),
    { ssr: false }
);
const TileLayer = dynamic(
    () => import('react-leaflet').then(mod => mod.TileLayer),
    { ssr: false }
);
const Marker = dynamic(
    () => import('react-leaflet').then(mod => mod.Marker),
    { ssr: false }
);
const Polygon = dynamic(
    () => import('react-leaflet').then(mod => mod.Polygon),
    { ssr: false }
);
const useMapEvents = typeof window !== 'undefined'
    ? require('react-leaflet').useMapEvents
    : () => null;
const useMap = typeof window !== 'undefined'
    ? require('react-leaflet').useMap
    : () => null;

// Helper to update map view when coords change
const RecenterMap = ({ lat, lng }) => {
    if (typeof window === 'undefined') return null;
    const { useMap: useMapHook } = require('react-leaflet');
    const map = useMapHook();
    useEffect(() => {
        if (lat && lng) {
            map.flyTo([lat, lng], 15);
        }
    }, [lat, lng, map]);
    return null;
};

// Component to handle map clicks
const LocationPicker = ({ mode, onLocationSelect, currentPos, polygonPoints, setPolygonPoints }) => {
    if (typeof window === 'undefined') return null;
    const { useMapEvents: useMapEventsHook } = require('react-leaflet');
    const L = require('leaflet');

    useMapEventsHook({
        click(e) {
            if (mode === 'point') {
                onLocationSelect(e.latlng);
            } else {
                setPolygonPoints(prev => [...prev, e.latlng]);
            }
        },
    });

    const pointIcon = L.divIcon({
        className: 'custom-point-marker',
        html: `
            <div style="
                width: 30px; height: 30px;
                background: #f97316;
                border: 2px solid white;
                border-radius: 50% 50% 50% 0;
                transform: rotate(-45deg);
                display: flex; align-items: center; justify-content: center;
                box-shadow: 0 3px 6px rgba(0,0,0,0.3);
            ">
                <div style="
                    width: 10px; height: 10px;
                    background: white;
                    border-radius: 50%;
                    transform: rotate(45deg);
                "></div>
            </div>
        `,
        iconSize: [30, 30],
        iconAnchor: [15, 30],
    });

    return (
        <>
            {mode === 'point' && currentPos && (
                <Marker
                    position={currentPos}
                    draggable={true}
                    icon={pointIcon}
                    eventHandlers={{
                        dragend: (e) => onLocationSelect(e.target.getLatLng()),
                    }}
                />
            )}
            {mode === 'zone' && polygonPoints.length > 0 && (
                <>
                    {polygonPoints.map((pt, idx) => (
                        <Marker key={idx} position={pt} icon={
                            L.divIcon({
                                className: 'bg-transparent',
                                html: `<div style="width: 10px; height: 10px; background: orange; border-radius: 50%; border: 2px solid white;"></div>`
                            })
                        } />
                    ))}
                    <Polygon positions={polygonPoints} color="orange" />
                </>
            )}
        </>
    );
};

const PoiModal = ({ isOpen, onClose, initialData, groups = [], onSubmit }) => {
    if (!isOpen) return null;

    const [formData, setFormData] = useState({
        code: '',
        type: 'Point',
        groupe: groups[0]?.nom || 'Dépôt',
        lat: '',
        lng: '',
        description: '',
        rayon: '',
        nouveauGroupe: ''
    });

    const [isAddingGroup, setIsAddingGroup] = useState(false);

    const [mode, setMode] = useState('point');
    const [polygonPoints, setPolygonPoints] = useState([]);

    useEffect(() => {
        if (initialData) {
            setFormData({
                code: initialData.code || '',
                type: initialData.type || 'Point',
                groupe: initialData.groupe || (groups[0]?.nom || 'Dépôt'),
                lat: initialData.lat?.toString() || '',
                lng: initialData.lng?.toString() || '',
                description: initialData.description || '',
                rayon: initialData.rayon !== null && initialData.rayon !== undefined ? initialData.rayon.toString() : ''
            });
        } else {
            setFormData({
                code: '',
                type: 'Point',
                groupe: groups[0]?.nom || 'Dépôt',
                lat: '',
                lng: '',
                description: '',
                rayon: '',
                nouveauGroupe: ''
            });
            setIsAddingGroup(false);
        }
    }, [initialData, groups, isOpen]);

    const handleLocationSelect = (latlng) => {
        setFormData(prev => ({
            ...prev,
            lat: latlng.lat.toFixed(6),
            lng: latlng.lng.toFixed(6)
        }));
    };

    const handleCoordChange = (field, value) => {
        if (/^-?\d*\.?\d*$/.test(value) || value === '') {
            setFormData(prev => ({ ...prev, [field]: value }));
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        const lat = parseFloat(formData.lat);
        const lng = parseFloat(formData.lng);
        const rayon = formData.rayon === '' ? null : parseFloat(formData.rayon);

        if (isNaN(lat) || isNaN(lng)) {
            alert('Veuillez saisir des coordonnées valides.');
            return;
        }

        if (rayon !== null && (isNaN(rayon) || rayon < 0)) {
            alert('Veuillez saisir un rayon valide (>= 0).');
            return;
        }

        if (onSubmit) {
            const finalGroupe = isAddingGroup ? formData.nouveauGroupe : formData.groupe;
            if (isAddingGroup && !formData.nouveauGroupe.trim()) {
                alert('Veuillez saisir un nom pour le nouveau groupe.');
                return;
            }
            onSubmit({
                ...formData,
                groupe: finalGroupe,
                groupeDescription: isAddingGroup ? formData.nouveauGroupeDescription : '',
                lat,
                lng,
                rayon
            });
        }
    };

    return (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-white w-[900px] h-[600px] rounded-2xl shadow-2xl flex overflow-hidden">

                {/* === LEFT: FORM === */}
                <div className="w-1/3 p-6 flex flex-col border-r border-gray-100">
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-xl font-bold text-gray-800">
                            {initialData ? 'Modifier POI' : 'Nouveau POI'}
                        </h2>
                    </div>

                    <form onSubmit={handleSubmit} className="flex-1 space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Code *</label>
                            <input
                                type="text"
                                required
                                value={formData.code}
                                onChange={e => setFormData({ ...formData, code: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none transition-all"
                                placeholder="Ex: Entrepôt Nord"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Type *</label>
                                <select
                                    value={formData.type}
                                    onChange={e => setFormData({ ...formData, type: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none"
                                >
                                    <option>Point</option>
                                    <option>Polygone</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Groupe *</label>
                                <select
                                    value={isAddingGroup ? 'NEW' : formData.groupe}
                                    onChange={e => {
                                        if (e.target.value === 'NEW') {
                                            setIsAddingGroup(true);
                                        } else {
                                            setIsAddingGroup(false);
                                            setFormData({ ...formData, groupe: e.target.value });
                                        }
                                    }}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none"
                                >
                                    {groups.map(g => (
                                        <option key={g.id} value={g.nom}>{g.nom}</option>
                                    ))}
                                    <option value="NEW">+ Nouveau groupe...</option>
                                </select>
                            </div>
                        </div>

                        {isAddingGroup && (
                            <div className="space-y-3 animate-fade-in py-2 px-3 bg-orange-50/30 rounded-xl border border-orange-100">
                                <div>
                                    <label className="block text-[10px] font-bold text-orange-600 uppercase tracking-wider mb-1">Nom du nouveau groupe *</label>
                                    <input
                                        type="text"
                                        required
                                        value={formData.nouveauGroupe}
                                        onChange={e => setFormData({ ...formData, nouveauGroupe: e.target.value })}
                                        className="w-full px-3 py-2 border border-orange-200 bg-white rounded-lg focus:ring-2 focus:ring-orange-500 outline-none transition-all text-sm"
                                        placeholder="Ex: Entrepôt"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-orange-600 uppercase tracking-wider mb-1">Description du groupe</label>
                                    <input
                                        type="text"
                                        value={formData.nouveauGroupeDescription}
                                        onChange={e => setFormData({ ...formData, nouveauGroupeDescription: e.target.value })}
                                        className="w-full px-3 py-2 border border-orange-200 bg-white rounded-lg focus:ring-2 focus:ring-orange-500 outline-none transition-all text-sm"
                                        placeholder="Ex: Sites de stockage"
                                    />
                                </div>
                            </div>
                        )}

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                            <input
                                type="text"
                                value={formData.description}
                                onChange={e => setFormData({ ...formData, description: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none transition-all"
                                placeholder="Adresse complète..."
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Rayon (m)</label>
                            <input
                                type="number"
                                min="0"
                                step="0.1"
                                value={formData.rayon}
                                onChange={e => setFormData({ ...formData, rayon: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none transition-all"
                                placeholder="Ex: 50"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1">Latitude *</label>
                                <input
                                    type="text"
                                    required
                                    value={formData.lat}
                                    onChange={(e) => handleCoordChange('lat', e.target.value)}
                                    placeholder="Ex: 36.8000"
                                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-800 focus:ring-2 focus:ring-orange-500 outline-none transition-all"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1">Longitude *</label>
                                <input
                                    type="text"
                                    required
                                    value={formData.lng}
                                    onChange={(e) => handleCoordChange('lng', e.target.value)}
                                    placeholder="Ex: 10.1000"
                                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-800 focus:ring-2 focus:ring-orange-500 outline-none transition-all"
                                />
                            </div>
                        </div>

                        <div className="mt-auto pt-4">
                            <p className="text-xs text-orange-600 bg-orange-50 p-2 rounded-md mb-4 border border-orange-100 flex items-center gap-2">
                                <FiMapPin />
                                {mode === 'point' ? "Cliquez sur la carte ou saisissez les coordonnées." : "Cliquez pour dessiner la zone."}
                            </p>

                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium text-sm"
                                >
                                    Annuler
                                </button>
                                <button
                                    type="submit"
                                    className="flex-1 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-medium text-sm shadow-lg shadow-orange-200 transition-all"
                                >
                                    Enregistrer
                                </button>
                            </div>
                        </div>
                    </form>
                </div>

                {/* === RIGHT: MAP === */}
                <div className="w-2/3 relative h-full">
                    <div className="absolute top-4 right-4 z-[500] bg-white rounded-lg shadow-md p-1 flex items-center gap-1 border border-gray-100">
                        <button
                            onClick={() => setMode('point')}
                            className={`p-2 rounded-md transition-all ${mode === 'point' ? 'bg-orange-100 text-orange-600' : 'text-gray-500 hover:bg-gray-50'}`}
                            title="Mode Point"
                        >
                            <FiMapPin />
                        </button>
                        <div className="w-px h-4 bg-gray-200"></div>
                        <button
                            onClick={() => setMode('zone')}
                            className={`p-2 rounded-md transition-all ${mode === 'zone' ? 'bg-orange-100 text-orange-600' : 'text-gray-500 hover:bg-gray-50'}`}
                            title="Mode Zone (Polygone)"
                        >
                            <FiLayers />
                        </button>
                    </div>

                    <MapContainer
                        center={[
                            parseFloat(formData.lat) || 36.8,
                            parseFloat(formData.lng) || 10.1
                        ]}
                        zoom={13}
                        className="h-full w-full"
                        zoomControl={true}
                    >
                        <TileLayer
                            attribution='&copy; OpenStreetMap'
                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        />
                        <RecenterMap
                            lat={parseFloat(formData.lat)}
                            lng={parseFloat(formData.lng)}
                        />
                        <LocationPicker
                            mode={mode}
                            onLocationSelect={handleLocationSelect}
                            currentPos={
                                (!isNaN(parseFloat(formData.lat)) && !isNaN(parseFloat(formData.lng)))
                                    ? [parseFloat(formData.lat), parseFloat(formData.lng)]
                                    : null
                            }
                            polygonPoints={polygonPoints}
                            setPolygonPoints={setPolygonPoints}
                        />
                    </MapContainer>
                </div>

                {/* Close button */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 z-[2001] bg-white p-2 rounded-full shadow-lg hover:bg-gray-100 transition-colors"
                >
                    <FiX className="text-gray-600" />
                </button>
            </div>
        </div>
    );
};

export default PoiModal;
