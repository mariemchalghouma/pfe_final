'use client';

import { useState, useEffect, useMemo } from 'react';
import { FiSearch, FiPlus, FiEdit2, FiTrash2, FiUsers, FiShield, FiUserCheck } from 'react-icons/fi';
import { userAPI } from '@/services/api';
import UserModal from '@/components/UserModal';

const ROLES_MAP = {
    'admin': { label: 'Admin', color: 'bg-red-50 text-red-600 border-red-100' },
    'arrets': { label: 'Suivi Arrêts', color: 'bg-yellow-50 text-yellow-600 border-yellow-100' },
    'portes': { label: 'Suivi Portes', color: 'bg-blue-50 text-blue-600 border-blue-100' },
    'carburant': { label: 'Suivi Carburant', color: 'bg-green-50 text-green-600 border-green-100' },
    'poi': { label: 'Gestion POI', color: 'bg-purple-50 text-purple-600 border-purple-100' },
};

const Administration = () => {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [editingUser, setEditingUser] = useState(null);

    const fetchUsers = async () => {
        setLoading(true);
        try {
            const response = await userAPI.getUsers();
            setUsers(response.data || []);
        } catch (error) {
            console.error('Failed to fetch users:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchUsers();
    }, []);

    const filteredUsers = useMemo(() => {
        return users.filter(user => {
            const fullName = `${user.first_name || ''} ${user.last_name || ''} ${user.name || ''}`.toLowerCase();
            return fullName.includes(search.toLowerCase()) ||
                user.email?.toLowerCase().includes(search.toLowerCase()) ||
                (user.identifiant && user.identifiant.toLowerCase().includes(search.toLowerCase())) ||
                (user.phone && user.phone.includes(search));
        });
    }, [users, search]);

    const stats = useMemo(() => {
        const total = users.length;
        const active = users.filter(u => u.status === 'Actif').length;
        const admins = users.filter(u => u.roles && u.roles.includes('admin')).length;
        return { total, active, admins };
    }, [users]);

    const handleSaveUser = async (userData) => {
        try {
            if (editingUser) {
                await userAPI.updateUser(editingUser.id, userData);
            } else {
                await userAPI.createUser(userData);
            }
            setShowModal(false);
            setEditingUser(null);
            fetchUsers();
        } catch (error) {
            console.error('Failed to save user:', error);
            alert(error.message || 'Une erreur est survenue');
        }
    };

    const handleDeleteUser = async (id) => {
        if (window.confirm('Voulez-vous vraiment supprimer cet utilisateur ?')) {
            try {
                await userAPI.deleteUser(id);
                fetchUsers();
            } catch (error) {
                console.error('Failed to delete user:', error);
            }
        }
    };

    const getInitials = (user) => {
        const f = user.identifiant ? user.identifiant[0] : (user.first_name ? user.first_name[0] : (user.name ? user.name[0] : '?'));
        const l = user.last_name ? user.last_name[0] : '';
        return (f + l).toUpperCase();
    };

    return (
        <div className="p-4 px-6 max-w-[1600px] mx-auto min-h-screen bg-gray-50/30">
            {/* Header Section */}
            <div className="mb-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center">
                        <FiShield className="text-orange-600 text-xl" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-gray-900 tracking-tight">Gestion des Utilisateurs</h1>
                        <p className="text-gray-500 text-[11px] font-medium">Administrer les comptes et les rôles d'accès</p>
                    </div>
                </div>
                <button
                    onClick={() => { setEditingUser(null); setShowModal(true); }}
                    className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-xl text-sm font-bold hover:bg-orange-600 transition-all shadow-lg shadow-orange-200 group"
                >
                    <FiPlus className="text-lg group-hover:rotate-90 transition-transform duration-300" />
                    Ajouter un utilisateur
                </button>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4">
                    <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center">
                        <FiUsers className="text-orange-500 text-lg" />
                    </div>
                    <div>
                        <p className="text-xl font-bold text-gray-900 leading-none">{stats.total}</p>
                        <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mt-1">Total utilisateurs</p>
                    </div>
                </div>
                <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4">
                    <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center">
                        <FiUserCheck className="text-green-500 text-lg" />
                    </div>
                    <div>
                        <p className="text-xl font-bold text-gray-900 leading-none">{stats.active}</p>
                        <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mt-1">Utilisateurs Actifs</p>
                    </div>
                </div>
                <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4">
                    <div className="w-10 h-10 bg-red-50 rounded-xl flex items-center justify-center">
                        <FiShield className="text-red-500 text-lg" />
                    </div>
                    <div>
                        <p className="text-xl font-bold text-gray-900 leading-none">{stats.admins}</p>
                        <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mt-1">Administrateurs</p>
                    </div>
                </div>
            </div>

            {/* Search & Table Wrapper */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-gray-50 flex items-center gap-4">
                    <div className="relative flex-1 max-w-md">
                        <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-xs" />
                        <input type="text" placeholder="Rechercher (nom, identifiant, email)..." value={search} onChange={(e) => setSearch(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-transparent rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-orange-500/10 focus:bg-white focus:border-orange-500 transition-all" />
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-gray-50/50 border-b border-gray-100">
                                <th className="px-6 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Utilisateur</th>
                                <th className="px-6 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Identifiant</th>
                                <th className="px-6 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Email</th>
                                <th className="px-6 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Téléphone</th>
                                <th className="px-6 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Rôles</th>
                                <th className="px-6 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-widest text-center">Statut</th>
                                <th className="px-6 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-widest text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {loading ? (
                                <tr><td colSpan="6" className="px-8 py-20 text-center"><div className="flex flex-col items-center gap-3"><div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin"></div><p className="text-sm font-bold text-gray-400">Chargement...</p></div></td></tr>
                            ) : filteredUsers.length === 0 ? (
                                <tr><td colSpan="6" className="px-8 py-20 text-center"><p className="text-sm font-bold text-gray-400">Aucun utilisateur trouvé</p></td></tr>
                            ) : (
                                filteredUsers.map((user) => (
                                    <tr key={user.id} className="group hover:bg-gray-50/50 transition-colors">
                                        <td className="px-6 py-3">
                                            <div className="flex items-center gap-3">
                                                <div className="w-9 h-9 rounded-xl bg-orange-50 flex items-center justify-center text-orange-600 font-bold text-xs border-2 border-white shadow-sm ring-1 ring-orange-100">{getInitials(user)}</div>
                                                <div>
                                                    <h4 className="text-xs font-bold text-gray-900 leading-tight">{user.first_name || user.name} {user.last_name || ''}</h4>
                                                    <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-tighter mt-0.5">Créé le {new Date(user.created_at).toLocaleDateString('fr-FR')}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-3 text-xs font-bold text-gray-500">{user.identifiant || '-'}</td>
                                        <td className="px-6 py-3 text-xs font-bold text-gray-500 lowercase">{user.email}</td>
                                        <td className="px-6 py-3 text-xs font-bold text-gray-500">{user.phone || '-'}</td>
                                        <td className="px-6 py-3">
                                            <div className="flex flex-wrap gap-1 max-w-[180px]">
                                                {user.roles && user.roles.map(role => (
                                                    <span key={role} className={`px-2 py-0.5 rounded-full text-[8px] font-semibold uppercase tracking-wider border ${ROLES_MAP[role]?.color || 'bg-gray-50 text-gray-500 border-gray-100'}`}>{ROLES_MAP[role]?.label || role}</span>
                                                ))}
                                            </div>
                                        </td>
                                        <td className="px-6 py-3 text-center">
                                            <span className={`inline-flex px-2 py-0.5 rounded-lg text-[8px] font-bold uppercase tracking-widest shadow-sm ${user.status === 'Actif' ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-500'}`}>{user.status || 'Inactif'}</span>
                                        </td>
                                        <td className="px-6 py-3 text-right">
                                            <div className="flex items-center justify-end gap-1.5 transition-opacity">
                                                <button onClick={() => { setEditingUser(user); setShowModal(true); }} className="p-2 bg-white border border-gray-100 rounded-lg text-gray-400 hover:text-orange-500 hover:border-orange-100 hover:shadow-sm transition-all"><FiEdit2 size={12} /></button>
                                                <button onClick={() => handleDeleteUser(user.id)} className="p-2 bg-white border border-gray-100 rounded-lg text-gray-400 hover:text-red-500 hover:border-red-100 hover:shadow-sm transition-all"><FiTrash2 size={12} /></button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
            <UserModal isOpen={showModal} onClose={() => { setShowModal(false); setEditingUser(null); }} onSubmit={handleSaveUser} initialData={editingUser} />
        </div>
    );
};

export default Administration;
