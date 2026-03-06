'use client';

import { useState, useEffect } from 'react';
import { FiX, FiCheck } from 'react-icons/fi';

const ROLES_OPTIONS = [
    { id: 'admin', label: 'Admin', color: 'bg-red-50 text-red-600 border-red-100', description: 'Accès total' },
    { id: 'arrets', label: 'Suivi Arrêts', color: 'bg-yellow-50 text-yellow-600 border-yellow-100', description: 'Page Arrêts' },
    { id: 'portes', label: 'Suivi Portes', color: 'bg-blue-50 text-blue-600 border-blue-100', description: 'Page Portes' },
    { id: 'carburant', label: 'Suivi Carburant', color: 'bg-green-50 text-green-600 border-green-100', description: 'Page Carburant' },
    { id: 'poi', label: 'Gestion POI', color: 'bg-purple-50 text-purple-600 border-purple-100', description: 'Page POI' },
];

const UserModal = ({ isOpen, onClose, onSubmit, initialData }) => {
    const [formData, setFormData] = useState({
        first_name: '',
        last_name: '',
        identifiant: '',
        email: '',
        phone: '',
        password: '',
        roles: [],
        status: 'Actif'
    });

    useEffect(() => {
        if (initialData) {
            setFormData({
                identifiant: '',
                ...initialData,
                password: '',
                roles: initialData.roles || []
            });
        } else {
            setFormData({
                first_name: '',
                last_name: '',
                identifiant: '',
                email: '',
                phone: '',
                password: '',
                roles: [],
                status: 'Actif'
            });
        }
    }, [initialData, isOpen]);

    if (!isOpen) return null;

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleRoleToggle = (roleId) => {
        setFormData(prev => {
            const roles = prev.roles.includes(roleId)
                ? prev.roles.filter(r => r !== roleId)
                : [...prev.roles, roleId];
            return { ...prev, roles };
        });
    };

    const handleStatusToggle = () => {
        setFormData(prev => ({
            ...prev,
            status: prev.status === 'Actif' ? 'Inactif' : 'Actif'
        }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        onSubmit(formData);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200">
                <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/30">
                    <h2 className="text-xl font-bold text-gray-800">
                        {initialData ? 'Modifier l\'utilisateur' : 'Nouvel utilisateur'}
                    </h2>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-400">
                        <FiX size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Name Section */}
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Prénom *</label>
                                    <input required type="text" name="first_name" value={formData.first_name} onChange={handleChange} placeholder="ex: Mohamed"
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none transition-all text-sm" />
                                </div>
                                <div className="space-y-1">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Nom *</label>
                                    <input required type="text" name="last_name" value={formData.last_name} onChange={handleChange} placeholder="ex: Ben Ali"
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none transition-all text-sm" />
                                </div>
                            </div>

                            <div className="space-y-1">
                                <label className="block text-sm font-medium text-gray-700 mb-1">Identifiant *</label>
                                <input required type="text" name="identifiant" value={formData.identifiant} onChange={handleChange} placeholder="ex: m.benali"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none transition-all text-sm" />
                            </div>

                            <div className="space-y-1">
                                <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                                <input required type="email" name="email" value={formData.email} onChange={handleChange} placeholder="admin@lumiere.tn"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none transition-all text-sm" />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Téléphone</label>
                                    <input type="tel" name="phone" value={formData.phone} onChange={handleChange} placeholder="+216 98..."
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none transition-all text-sm" />
                                </div>
                                <div className="space-y-1">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Mot de passe {!initialData && '*'}</label>
                                    <input required={!initialData} type="password" name="password" value={formData.password} onChange={handleChange} placeholder="••••••••"
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none transition-all text-sm" />
                                </div>
                            </div>

                            <div onClick={handleStatusToggle} className="flex items-center gap-3 p-3 bg-gray-50/50 rounded-xl border border-gray-100 cursor-pointer hover:bg-gray-50 transition-all">
                                <div className={`w-5 h-5 rounded-lg border flex items-center justify-center transition-all ${formData.status === 'Actif' ? 'bg-orange-500 border-orange-500 text-white' : 'border-gray-200 bg-white'}`}>
                                    {formData.status === 'Actif' && <FiCheck size={12} />}
                                </div>
                                <span className="text-sm font-medium text-gray-700">Compte actif</span>
                            </div>
                        </div>

                        {/* Roles Section */}
                        <div className="space-y-4">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Rôles d'accès</label>
                            <div className="grid grid-cols-1 gap-2">
                                {ROLES_OPTIONS.map(role => (
                                    <div key={role.id} onClick={() => handleRoleToggle(role.id)}
                                        className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${formData.roles.includes(role.id) ? 'border-orange-200 bg-orange-50/30' : 'border-gray-50 bg-white hover:border-gray-100'}`}>
                                        <div className="flex items-center gap-3">
                                            <div className={`w-5 h-5 rounded-lg border flex items-center justify-center transition-all ${formData.roles.includes(role.id) ? 'bg-orange-500 border-orange-500 text-white' : 'border-gray-200 bg-white'}`}>
                                                {formData.roles.includes(role.id) && <FiCheck size={12} />}
                                            </div>
                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${role.color}`}>{role.label}</span>
                                        </div>
                                        <span className="text-[10px] font-medium text-gray-400">{role.description}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 pt-4 border-t border-gray-100">
                        <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium text-sm transition-all">
                            Annuler
                        </button>
                        <button type="submit" className="flex-1 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-medium text-sm shadow-lg shadow-orange-200 transition-all">
                            {initialData ? 'Mettre à jour' : 'Enregistrer'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default UserModal;
