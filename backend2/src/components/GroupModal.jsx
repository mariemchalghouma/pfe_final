'use client';

import { useState } from 'react';
import { FiX } from 'react-icons/fi';

const COLORS = [
    '#ef4444', '#f97316', '#f59e0b', '#22c55e', '#14b8a6',
    '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899', '#6b7280'
];

const buildGroupFormData = (data = null) => ({
    nom: data?.nom ?? '',
    description: data?.description ?? '',
    couleur: data?.couleur ?? COLORS[0]
});

const GroupModal = ({ isOpen, onClose, initialData, onSubmit }) => {
    const [formData, setFormData] = useState(() => buildGroupFormData(initialData));

    if (!isOpen) return null;

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!formData.nom.trim()) {
            alert('Le nom du groupe est requis.');
            return;
        }
        if (onSubmit) onSubmit(formData);
    };

    return (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-white w-[420px] rounded-2xl shadow-2xl overflow-hidden">
                <div className="p-6">
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-xl font-bold text-gray-800">
                            {initialData ? 'Modifier le groupe' : 'Nouveau groupe'}
                        </h2>
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                        >
                            <FiX className="text-gray-500" />
                        </button>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Nom du groupe *</label>
                            <input
                                type="text"
                                required
                                value={formData.nom}
                                onChange={e => setFormData({ ...formData, nom: e.target.value })}
                                className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none transition-all"
                                placeholder="Ex: Dépôts, Clients, Stations..."
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                            <textarea
                                value={formData.description}
                                onChange={e => setFormData({ ...formData, description: e.target.value })}
                                rows="3"
                                className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none transition-all resize-none"
                                placeholder="Description du groupe..."
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Couleur</label>
                            <div className="flex flex-wrap gap-2">
                                {COLORS.map(c => (
                                    <button
                                        key={c}
                                        type="button"
                                        onClick={() => setFormData({ ...formData, couleur: c })}
                                        className={`w-8 h-8 rounded-full transition-all ${formData.couleur === c
                                            ? 'ring-2 ring-offset-2 ring-orange-500 scale-110'
                                            : 'hover:scale-105'
                                            }`}
                                        style={{ backgroundColor: c }}
                                    />
                                ))}
                            </div>
                        </div>

                        <div className="flex gap-3 pt-2">
                            <button
                                type="button"
                                onClick={onClose}
                                className="flex-1 px-4 py-2.5 border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50 font-medium text-sm"
                            >
                                Annuler
                            </button>
                            <button
                                type="submit"
                                className="flex-1 px-4 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl font-medium text-sm shadow-lg shadow-orange-200 transition-all"
                            >
                                Enregistrer
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default GroupModal;
