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
                password: '', // Don't show password
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
            <div className="bg-white rounded-[32px] w-full max-w-lg overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200">
                {/* Header */}
                <div className="px-8 py-6 border-b border-gray-100 flex justify-between items-center">
                    <h2 className="text-xl font-black text-gray-900 tracking-tight">
                        {initialData ? 'Modifier l\'utilisateur' : 'Ajouter un utilisateur'}
                    </h2>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-400">
                        <FiX size={24} />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="p-8 space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest ml-1">Prénom</label>
                            <input
                                required
                                type="text"
                                name="first_name"
                                value={formData.first_name}
                                onChange={handleChange}
                                placeholder="ex: Mohamed"
                                className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest ml-1">Nom</label>
                            <input
                                required
                                type="text"
                                name="last_name"
                                value={formData.last_name}
                                onChange={handleChange}
                                placeholder="ex: Ben Ali"
                                className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                            />
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest ml-1">Identifiant</label>
                        <input
                            required
                            type="text"
                            name="identifiant"
                            value={formData.identifiant}
                            onChange={handleChange}
                            placeholder="ex: m.benali"
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest ml-1">Email</label>
                        <input
                            required
                            type="email"
                            name="email"
                            value={formData.email}
                            onChange={handleChange}
                            placeholder="admin@lumiere.tn"
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest ml-1">Téléphone</label>
                        <input
                            type="tel"
                            name="phone"
                            value={formData.phone}
                            onChange={handleChange}
                            placeholder="+216 98 000 000"
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                        />
                    </div>

                    {!initialData && (
                        <div className="space-y-1.5">
                            <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest ml-1">Mot de passe</label>
                            <input
                                required
                                type="password"
                                name="password"
                                value={formData.password}
                                onChange={handleChange}
                                placeholder="••••••••"
                                className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                            />
                        </div>
                    )}

                    {/* Roles */}
                    <div className="space-y-3">
                        <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest ml-1">Rôles d'accès</label>
                        <div className="space-y-2">
                            {ROLES_OPTIONS.map(role => (
                                <div
                                    key={role.id}
                                    onClick={() => handleRoleToggle(role.id)}
                                    className={`flex items-center justify-between p-3 rounded-2xl border cursor-pointer transition-all ${formData.roles.includes(role.id)
                                        ? 'border-orange-200 bg-orange-50/30'
                                        : 'border-gray-100 bg-white hover:border-gray-200'
                                        }`}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${formData.roles.includes(role.id)
                                            ? 'bg-orange-500 border-orange-500 text-white'
                                            : 'border-gray-200 bg-white'
                                            }`}>
                                            {formData.roles.includes(role.id) && <FiCheck size={12} />}
                                        </div>
                                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${role.color}`}>
                                            {role.label}
                                        </span>
                                    </div>
                                    <span className="text-[11px] font-bold text-gray-400">{role.description}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Active Status */}
                    <div
                        onClick={handleStatusToggle}
                        className="flex items-center gap-3 p-4 bg-gray-50/50 rounded-2xl border border-gray-100 cursor-pointer hover:bg-gray-50 transition-all"
                    >
                        <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${formData.status === 'Actif'
                            ? 'bg-orange-500 border-orange-500 text-white'
                            : 'border-gray-200 bg-white'
                            }`}>
                            {formData.status === 'Actif' && <FiCheck size={12} />}
                        </div>
                        <span className="text-sm font-black text-gray-700">Compte actif</span>
                    </div>

                    {/* Actions */}
                    <div className="grid grid-cols-2 gap-4 pt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-6 py-3.5 bg-gray-50 text-gray-500 rounded-2xl font-black text-sm hover:bg-gray-100 transition-all"
                        >
                            Annuler
                        </button>
                        <button
                            type="submit"
                            className="px-6 py-3.5 bg-orange-500 text-white rounded-2xl font-black text-sm hover:bg-orange-600 transition-all shadow-lg shadow-orange-200"
                        >
                            {initialData ? 'Mettre à jour' : 'Ajouter'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default UserModal;
