"use client";

import { useState, useEffect } from 'react';
import { FiX } from 'react-icons/fi';

const GroupModal = ({ isOpen, onClose, initialData, onSubmit }) => {
    const [formData, setFormData] = useState({
        nom: '',
        description: '',
        couleur: '#fbbf24', // Default amber
    });

    useEffect(() => {
        if (isOpen) {
            if (initialData) {
                setFormData({
                    nom: initialData.nom || '',
                    description: initialData.description || '',
                    couleur: initialData.couleur || '#fbbf24',
                });
            } else {
                setFormData({
                    nom: '',
                    description: '',
                    couleur: '#fbbf24',
                });
            }
        }
    }, [initialData, isOpen]);

    const handleSubmit = (e) => {
        e.preventDefault();
        onSubmit(formData);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
            <div className="bg-white w-[500px] rounded-2xl shadow-2xl overflow-hidden animate-scale-in">
                <div className="flex justify-between items-center p-6 border-b border-gray-100">
                    <h2 className="text-xl font-bold text-gray-800">
                        {initialData ? 'Modifier le groupe' : 'Nouveau groupe'}
                    </h2>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                        <FiX size={20} className="text-gray-500" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Nom du groupe *</label>
                        <input
                            type="text"
                            required
                            value={formData.nom}
                            onChange={(e) => setFormData({ ...formData, nom: e.target.value })}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none transition-all"
                            placeholder="Ex: Dépôt Principal"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                        <textarea
                            rows="3"
                            value={formData.description}
                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none transition-all resize-none"
                            placeholder="Description optionnelle..."
                        ></textarea>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Couleur</label>
                        <div className="flex gap-2">
                            {['#fbbf24', '#f97316', '#ef4444', '#a855f7', '#06b6d4', '#10b981', '#3b82f6'].map(color => (
                                <button
                                    key={color}
                                    type="button"
                                    onClick={() => setFormData({ ...formData, couleur: color })}
                                    className={`w-8 h-8 rounded-full border-2 transition-transform hover:scale-110 ${formData.couleur === color ? 'border-gray-600 scale-110' : 'border-transparent'}`}
                                    style={{ backgroundColor: color }}
                                />
                            ))}
                        </div>
                    </div>

                    <div className="pt-4 flex gap-3 justify-end">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-gray-600 font-medium hover:bg-gray-50 rounded-lg transition-colors"
                        >
                            Annuler
                        </button>
                        <button
                            type="submit"
                            className="px-6 py-2 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-lg shadow-md hover:shadow-lg transition-all transform active:scale-95"
                        >
                            {initialData ? 'Enregistrer' : 'Créer'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default GroupModal;
