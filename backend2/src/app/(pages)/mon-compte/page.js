'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { isAdminUser, normalizeRoles } from '@/utils/permissions';
import { userAPI } from '@/services/api';
import { useRouter } from 'next/navigation';
import {
    FiUser, FiMail, FiPhone, FiCalendar, FiShield, FiEdit2,
    FiArrowLeft, FiClock, FiCheckCircle, FiX, FiCheck, FiSave, FiLock
} from 'react-icons/fi';

/* ═══ Info Row (view mode) ═══ */
const InfoRow = ({ icon: Icon, label, value, iconColor = '#64748b' }) => (
    <div style={{
        display: 'flex', alignItems: 'center', gap: '14px',
        padding: '16px 0',
        borderBottom: '1px solid #f1f5f9',
    }}>
        <div style={{
            width: '42px', height: '42px', borderRadius: '12px',
            background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            border: '1px solid #f1f5f9',
        }}>
            <Icon style={{ color: iconColor, fontSize: '16px' }} />
        </div>
        <div>
            <p style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '2px' }}>
                {label}
            </p>
            <p style={{ fontSize: '15px', fontWeight: 700, color: '#1e293b' }}>
                {value || '—'}
            </p>
        </div>
    </div>
);

/* ═══ Form Field ═══ */
const FormField = ({ label, name, value, onChange, type = 'text', required = false, placeholder = '' }) => (
    <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            {label} {required && <span style={{ color: '#ef4444' }}>*</span>}
        </label>
        <input
            type={type}
            name={name}
            value={value}
            onChange={onChange}
            required={required}
            placeholder={placeholder}
            style={{
                width: '100%',
                padding: '10px 14px',
                border: '1px solid #e2e8f0',
                borderRadius: '10px',
                fontSize: '14px',
                fontWeight: 500,
                fontFamily: "'Inter', sans-serif",
                outline: 'none',
                transition: 'border-color 0.2s',
                color: '#1e293b',
                background: 'white',
            }}
            onFocus={e => e.target.style.borderColor = '#f97316'}
            onBlur={e => e.target.style.borderColor = '#e2e8f0'}
        />
    </div>
);

export default function MonComptePage() {
    const { user, refreshUser } = useAuth();
    const router = useRouter();
    const isAdmin = isAdminUser(user);
    const roles = normalizeRoles(user?.roles);

    const [isEditing, setIsEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saveMessage, setSaveMessage] = useState(null);
    const [formData, setFormData] = useState({
        identifiant: '',
        first_name: '',
        last_name: '',
        email: '',
        phone: '',
        password: '',
    });

    // Initialize form data from user
    useEffect(() => {
        if (user) {
            setFormData({
                identifiant: user.identifiant || '',
                first_name: user.prenom || user.first_name || '',
                last_name: user.nom || user.last_name || '',
                email: user.email || '',
                phone: user.telephone || user.phone || '',
                password: '',
            });
        }
    }, [user]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        setSaveMessage(null);
        try {
            const payload = { ...formData };
            if (!payload.password) delete payload.password; // Don't send empty password
            await userAPI.updateUser(user.id, payload);
            setSaveMessage({ type: 'success', text: 'Profil mis à jour avec succès !' });
            setIsEditing(false);
            // Refresh user data in the auth context if available
            if (typeof refreshUser === 'function') {
                await refreshUser();
            }
        } catch (error) {
            setSaveMessage({ type: 'error', text: error.message || 'Erreur lors de la mise à jour' });
        } finally {
            setSaving(false);
            setTimeout(() => setSaveMessage(null), 4000);
        }
    };

    const handleCancel = () => {
        setIsEditing(false);
        // Reset form to current user data
        if (user) {
            setFormData({
                identifiant: user.identifiant || '',
                first_name: user.prenom || user.first_name || '',
                last_name: user.nom || user.last_name || '',
                email: user.email || '',
                phone: user.telephone || user.phone || '',
                password: '',
            });
        }
    };

    const initials = user?.nom
        ? `${(user.prenom || user.nom).charAt(0)}${user.nom ? user.nom.charAt(0) : ''}`.toUpperCase()
        : user?.identifiant
            ? user.identifiant.substring(0, 2).toUpperCase()
            : 'U';

    const displayName = user?.nom
        ? `${user.prenom || ''} ${user.nom}`.trim()
        : user?.identifiant || 'Utilisateur';

    const createdAt = user?.created_at
        ? new Date(user.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
        : null;

    const statusColor = (user?.status || '').toLowerCase() === 'actif'
        ? { bg: '#dcfce7', text: '#16a34a', border: '#bbf7d0' }
        : { bg: '#fef2f2', text: '#dc2626', border: '#fecaca' };

    return (
        <div style={{ fontFamily: "'Inter', sans-serif", padding: '28px 32px', maxWidth: '720px', margin: '0 auto' }}>

            {/* Back button */}
            <button
                onClick={() => router.back()}
                style={{
                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: '#64748b', fontSize: '13px', fontWeight: 600,
                    marginBottom: '20px', padding: '6px 0',
                }}
            >
                <FiArrowLeft style={{ fontSize: '14px' }} />
                Retour
            </button>

            {/* Success / Error message */}
            {saveMessage && (
                <div style={{
                    padding: '12px 16px', borderRadius: '12px', marginBottom: '16px',
                    display: 'flex', alignItems: 'center', gap: '8px',
                    fontSize: '13px', fontWeight: 600,
                    background: saveMessage.type === 'success' ? '#dcfce7' : '#fef2f2',
                    color: saveMessage.type === 'success' ? '#16a34a' : '#dc2626',
                    border: `1px solid ${saveMessage.type === 'success' ? '#bbf7d0' : '#fecaca'}`,
                }}>
                    {saveMessage.type === 'success' ? <FiCheckCircle /> : <FiX />}
                    {saveMessage.text}
                </div>
            )}

            {/* Profile Header Card */}
            <div style={{
                borderRadius: '20px',
                overflow: 'hidden',
                boxShadow: '0 4px 20px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.03)',
                background: 'white',
                marginBottom: '20px',
            }}>
                {/* Orange banner */}
                <div style={{
                    background: 'linear-gradient(135deg, #f97316 0%, #fb923c 50%, #fdba74 100%)',
                    padding: '32px 28px 60px',
                    position: 'relative',
                }}>
                    <div style={{
                        position: 'absolute',
                        top: '50%', left: '50%',
                        width: '300px', height: '300px',
                        borderRadius: '50%',
                        background: 'rgba(255,255,255,0.06)',
                        transform: 'translate(-30%, -60%)',
                        pointerEvents: 'none',
                    }} />
                </div>

                {/* Avatar + Name area overlapping banner */}
                <div style={{ padding: '0 28px', marginTop: '-48px', position: 'relative', zIndex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '18px', marginBottom: '20px', flexWrap: 'wrap' }}>
                        <div style={{
                            width: '96px', height: '96px', borderRadius: '50%',
                            background: 'linear-gradient(135deg, #f97316, #fb923c)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: 'white', fontWeight: 800, fontSize: '32px',
                            border: '4px solid white',
                            boxShadow: '0 4px 16px rgba(249,115,22,0.3)',
                            flexShrink: 0,
                        }}>
                            {initials}
                        </div>
                        <div style={{ flex: 1, paddingBottom: '8px', minWidth: '180px' }}>
                            <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#0f172a', lineHeight: 1.2, letterSpacing: '-0.4px' }}>
                                {displayName}
                            </h1>
                            <p style={{ fontSize: '14px', color: '#64748b', fontWeight: 500, marginTop: '2px' }}>
                                {user?.identifiant || '—'}
                            </p>
                        </div>
                        {/* Status badge */}
                        <span style={{
                            padding: '5px 14px', borderRadius: '999px', fontSize: '12px', fontWeight: 700,
                            background: statusColor.bg, color: statusColor.text,
                            border: `1px solid ${statusColor.border}`,
                            textTransform: 'uppercase', letterSpacing: '0.5px',
                            flexShrink: 0, marginBottom: '12px',
                            display: 'inline-flex', alignItems: 'center', gap: '4px',
                        }}>
                            <FiCheckCircle style={{ fontSize: '12px' }} />
                            {user?.status || 'Actif'}
                        </span>
                    </div>

                    {/* Roles */}
                    {roles.length > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
                            <FiShield style={{ color: '#94a3b8', fontSize: '14px' }} />
                            {roles.map((role, i) => (
                                <span key={i} style={{
                                    padding: '4px 12px', borderRadius: '999px', fontSize: '12px', fontWeight: 700,
                                    background: role === 'admin' ? '#fff7ed' : '#f1f5f9',
                                    color: role === 'admin' ? '#ea580c' : '#475569',
                                    border: `1px solid ${role === 'admin' ? '#fed7aa' : '#e2e8f0'}`,
                                    textTransform: 'uppercase',
                                }}>
                                    {role}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* ═══ VIEW MODE ═══ */}
            {!isEditing && (
                <>
                    <div style={{
                        borderRadius: '16px',
                        background: 'white',
                        boxShadow: '0 1px 6px rgba(0,0,0,0.04), 0 0 0 1px rgba(0,0,0,0.03)',
                        padding: '8px 24px 4px',
                        marginBottom: '20px',
                    }}>
                        <p style={{
                            fontSize: '11px', fontWeight: 700, color: '#94a3b8',
                            textTransform: 'uppercase', letterSpacing: '0.8px',
                            padding: '14px 0 4px',
                        }}>
                            Informations du compte
                        </p>

                        {user?.email && <InfoRow icon={FiMail} label="Email" value={user.email} iconColor="#3b82f6" />}
                        {(user?.telephone || user?.phone) && <InfoRow icon={FiPhone} label="Téléphone" value={user.telephone || user.phone} iconColor="#22c55e" />}
                        <InfoRow icon={FiUser} label="Identifiant" value={user?.identifiant} iconColor="#f97316" />
                        {(user?.prenom || user?.first_name) && <InfoRow icon={FiUser} label="Prénom" value={user.prenom || user.first_name} iconColor="#8b5cf6" />}
                        {(user?.nom || user?.last_name) && <InfoRow icon={FiUser} label="Nom" value={user.nom || user.last_name} iconColor="#8b5cf6" />}
                        {createdAt && <InfoRow icon={FiCalendar} label="Date de création" value={createdAt} iconColor="#64748b" />}
                    </div>

                    {/* Modifier button — admin only */}
                    {isAdmin && (
                        <button
                            onClick={() => setIsEditing(true)}
                            style={{
                                width: '100%',
                                padding: '14px',
                                borderRadius: '14px',
                                border: 'none',
                                background: 'linear-gradient(135deg, #f97316, #fb923c)',
                                color: 'white',
                                fontWeight: 700,
                                fontSize: '15px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '8px',
                                boxShadow: '0 4px 14px rgba(249,115,22,0.3)',
                                transition: 'transform 0.15s, box-shadow 0.15s',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(249,115,22,0.35)'; }}
                            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 14px rgba(249,115,22,0.3)'; }}
                        >
                            <FiEdit2 style={{ fontSize: '16px' }} />
                            Modifier le profil
                        </button>
                    )}
                </>
            )}

            {/* ═══ EDIT MODE ═══ */}
            {isEditing && (
                <form onSubmit={handleSubmit}>
                    <div style={{
                        borderRadius: '16px',
                        background: 'white',
                        boxShadow: '0 1px 6px rgba(0,0,0,0.04), 0 0 0 1px rgba(0,0,0,0.03)',
                        padding: '20px 24px',
                        marginBottom: '20px',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                            <p style={{
                                fontSize: '11px', fontWeight: 700, color: '#f97316',
                                textTransform: 'uppercase', letterSpacing: '0.8px',
                                display: 'flex', alignItems: 'center', gap: '6px',
                            }}>
                                <FiEdit2 style={{ fontSize: '12px' }} />
                                Modifier les informations
                            </p>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
                            <FormField label="Prénom" name="first_name" value={formData.first_name} onChange={handleChange} required placeholder="Votre prénom" />
                            <FormField label="Nom" name="last_name" value={formData.last_name} onChange={handleChange} required placeholder="Votre nom" />
                        </div>

                        <FormField label="Identifiant" name="identifiant" value={formData.identifiant} onChange={handleChange} required placeholder="Identifiant unique" />

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
                            <FormField label="Email" name="email" value={formData.email} onChange={handleChange} type="email" placeholder="votre@email.com" />
                            <FormField label="Téléphone" name="phone" value={formData.phone} onChange={handleChange} type="tel" placeholder="+216..." />
                        </div>

                        <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '16px', marginTop: '4px' }}>
                            <FormField label="Nouveau mot de passe" name="password" value={formData.password} onChange={handleChange} type="password" placeholder="Laisser vide pour ne pas changer" />
                            <p style={{ fontSize: '11px', color: '#94a3b8', marginTop: '-10px', fontWeight: 500 }}>
                                Laissez ce champ vide si vous ne souhaitez pas changer le mot de passe
                            </p>
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div style={{ display: 'flex', gap: '12px' }}>
                        <button
                            type="button"
                            onClick={handleCancel}
                            style={{
                                flex: 1,
                                padding: '14px',
                                borderRadius: '14px',
                                border: '1px solid #e2e8f0',
                                background: 'white',
                                color: '#475569',
                                fontWeight: 700,
                                fontSize: '14px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '6px',
                            }}
                        >
                            <FiX style={{ fontSize: '16px' }} />
                            Annuler
                        </button>
                        <button
                            type="submit"
                            disabled={saving}
                            style={{
                                flex: 1,
                                padding: '14px',
                                borderRadius: '14px',
                                border: 'none',
                                background: saving ? '#94a3b8' : 'linear-gradient(135deg, #f97316, #fb923c)',
                                color: 'white',
                                fontWeight: 700,
                                fontSize: '14px',
                                cursor: saving ? 'not-allowed' : 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '6px',
                                boxShadow: saving ? 'none' : '0 4px 14px rgba(249,115,22,0.3)',
                            }}
                        >
                            {saving ? (
                                <>
                                    <div style={{ width: '16px', height: '16px', border: '2px solid white', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                                    Enregistrement...
                                </>
                            ) : (
                                <>
                                    <FiSave style={{ fontSize: '16px' }} />
                                    Enregistrer
                                </>
                            )}
                        </button>
                    </div>
                    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                </form>
            )}
        </div>
    );
}
