"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { isAdminUser, normalizeRoles } from "@/utils/permissions";
import { userAPI } from "@/services/api";
import { useRouter } from "next/navigation";
import {
  FiUser,
  FiMail,
  FiPhone,
  FiCalendar,
  FiEdit2,
  FiArrowLeft,
  FiCheckCircle,
  FiX,
  FiSave,
} from "react-icons/fi";

/* ═══ Info Row (view mode) ═══ */
const InfoRow = ({ icon: Icon, label, value, iconColor = "#64748b" }) => (
  <div className="flex items-center gap-4 py-4 border-b border-gray-100">
    <div className="w-10 h-10 rounded-lg bg-gray-50 flex items-center justify-center flex-shrink-0 border border-gray-100">
      <Icon style={{ color: iconColor, fontSize: 16 }} />
    </div>
    <div>
      <p className="text-[11px] text-gray-400 font-bold uppercase tracking-wider mb-1">
        {label}
      </p>
      <p className="text-sm font-extrabold text-gray-900">{value || "—"}</p>
    </div>
  </div>
);

/* ═══ Form Field ═══ */
const FormField = ({
  label,
  name,
  value,
  onChange,
  type = "text",
  required = false,
  placeholder = "",
}) => (
  <div className="mb-4">
    <label className="block text-xs font-bold text-gray-600 mb-1 uppercase tracking-wider">
      {label} {required && <span className="text-red-500">*</span>}
    </label>
    <input
      type={type}
      name={name}
      value={value}
      onChange={onChange}
      required={required}
      placeholder={placeholder}
      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-orange-500"
    />
  </div>
);

export default function MonComptePage() {
  const { user, refreshUser } = useAuth();
  const router = useRouter();
  const isAdmin = isAdminUser(user);
  const roles = normalizeRoles(user?.roles);

  const buildFormDataFromUser = (currentUser) => {
    if (!currentUser) {
      return {
        identifiant: "",
        first_name: "",
        last_name: "",
        email: "",
        phone: "",
        password: "",
      };
    }

    const normalizedName = (currentUser.name || "").trim();
    const fallbackNameParts = normalizedName
      ? normalizedName.split(/\s+/).filter(Boolean)
      : [];
    const fallbackFirstName = fallbackNameParts[0] || "";
    const fallbackLastName = fallbackNameParts.slice(1).join(" ");

    return {
      identifiant: currentUser.identifiant || "",
      first_name:
        currentUser.prenom || currentUser.first_name || fallbackFirstName || "",
      last_name:
        currentUser.nom || currentUser.last_name || fallbackLastName || "",
      email: currentUser.email || "",
      phone: currentUser.telephone || currentUser.phone || "",
      password: "",
    };
  };

  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState(null);
  const [formData, setFormData] = useState({
    identifiant: "",
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    password: "",
  });

  // Initialize form data from user
  useEffect(() => {
    setFormData(buildFormDataFromUser(user));
  }, [user]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setSaveMessage(null);
    try {
      const payload = { ...formData };
      if (!payload.password) delete payload.password; // Don't send empty password
      await userAPI.updateUser(user.id, payload);
      setSaveMessage({
        type: "success",
        text: "Profil mis à jour avec succès !",
      });
      setIsEditing(false);
      // Refresh user data in the auth context if available
      if (typeof refreshUser === "function") {
        await refreshUser();
      }
    } catch (error) {
      setSaveMessage({
        type: "error",
        text: error.message || "Erreur lors de la mise à jour",
      });
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMessage(null), 4000);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    // Reset form to current user data
    setFormData(buildFormDataFromUser(user));
  };

  const fullNameFromColumns =
    `${user?.prenom || user?.first_name || ""} ${user?.nom || user?.last_name || ""}`.trim();
  const fullName = fullNameFromColumns || (user?.name || "").trim();

  const initials = fullName
    ? fullName
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part.charAt(0).toUpperCase())
        .join("")
    : user?.identifiant
      ? user.identifiant.substring(0, 2).toUpperCase()
      : "U";

  const displayName = fullName || "Utilisateur";

  const createdAt = user?.created_at
    ? new Date(user.created_at).toLocaleDateString("fr-FR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    : null;

  const statusColor =
    (user?.status || "").toLowerCase() === "actif"
      ? { bg: "#dcfce7", text: "#16a34a", border: "#bbf7d0" }
      : { bg: "#fef2f2", text: "#dc2626", border: "#fecaca" };

  const contentWidth = "760px";

  return (
    <div className="p-4 px-6 max-w-[1600px] mx-auto min-h-screen bg-gray-50/30">
      {/* Back button */}
      <button
        onClick={() => router.back()}
        className="inline-flex items-center gap-2 text-gray-500 hover:text-gray-700 text-xs font-bold mb-4 transition-colors"
      >
        <FiArrowLeft size={14} />
        Retour
      </button>

      {/* Success / Error toast (harmonisé) */}
      {saveMessage && (
        <div className="fixed top-6 right-6 z-[100] animate-slide-in-right flex items-center gap-3 rounded-xl bg-emerald-50 border border-emerald-200 px-5 py-3.5 shadow-lg shadow-emerald-100/50">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500">
            <FiCheckCircle className="text-white" size={16} />
          </div>
          <span className="text-sm font-bold text-emerald-800">
            {saveMessage.text}
          </span>
          <button
            onClick={() => setSaveMessage(null)}
            className="ml-2 text-emerald-400 hover:text-emerald-600 transition-colors"
          >
            <FiX size={16} />
          </button>
        </div>
      )}

      {/* Profile Header Card - Professional Design */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 md:p-8 mb-6 max-w-2xl mx-auto">
        <div className="flex items-start gap-6">
          {/* Avatar */}
          <div className="w-20 h-20 rounded-xl bg-gradient-to-br from-orange-500 to-orange-400 flex items-center justify-center text-white font-black text-3xl flex-shrink-0 shadow-md">
            {initials}
          </div>

          {/* Profile Info */}
          <div className="flex-1 pt-1">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-3">
              <div>
                <h1 className="text-xl font-bold text-gray-900">
                  {displayName}
                </h1>
                <p className="text-sm text-gray-500 mt-1">
                  {roles.length > 0 ? roles.join(" • ") : "Utilisateur"}
                </p>
              </div>

              {/* Status Badge - Subtle */}
              <div
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold"
                style={{
                  background: statusColor.bg,
                  color: statusColor.text,
                  border: `1px solid ${statusColor.border}`,
                }}
              >
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ background: statusColor.text }}
                />
                {user?.status || "Actif"}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ VIEW MODE ═══ */}
      {!isEditing && (
        <>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6 max-w-2xl mx-auto">
            <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 pb-2 border-b border-gray-100">
              Informations du compte
            </p>

            <InfoRow
              icon={FiUser}
              label="Identifiant"
              value={user?.identifiant}
              iconColor="#f97316"
            />
            {user?.email && (
              <InfoRow
                icon={FiMail}
                label="Email"
                value={user.email}
                iconColor="#3b82f6"
              />
            )}
            {(user?.telephone || user?.phone) && (
              <InfoRow
                icon={FiPhone}
                label="Téléphone"
                value={user.telephone || user.phone}
                iconColor="#22c55e"
              />
            )}
            {createdAt && (
              <InfoRow
                icon={FiCalendar}
                label="Date de création"
                value={createdAt}
                iconColor="#64748b"
              />
            )}
          </div>

          {isAdmin && (
            <div className="max-w-2xl mx-auto">
              <button
                onClick={() => setIsEditing(true)}
                className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-sm transition-all shadow-md hover:shadow-lg"
              >
                <FiEdit2 size={16} />
                Modifier le profil
              </button>
            </div>
          )}
        </>
      )}

      {/* ═══ EDIT MODE ═══ */}
      {isEditing && (
        <form onSubmit={handleSubmit} className="max-w-2xl mx-auto">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">
            <div className="flex items-center gap-2 mb-6 pb-4 border-b border-gray-100">
              <div className="w-5 h-5 rounded-lg bg-orange-100 flex items-center justify-center">
                <FiEdit2 size={14} className="text-orange-600" />
              </div>
              <p className="text-xs font-bold text-orange-600 uppercase tracking-wider">
                Modifier les informations
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <FormField
                label="Prénom"
                name="first_name"
                value={formData.first_name}
                onChange={handleChange}
                required
                placeholder="Votre prénom"
              />
              <FormField
                label="Nom"
                name="last_name"
                value={formData.last_name}
                onChange={handleChange}
                required
                placeholder="Votre nom"
              />
            </div>

            <FormField
              label="Identifiant"
              name="identifiant"
              value={formData.identifiant}
              onChange={handleChange}
              required
              placeholder="Identifiant unique"
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
              <FormField
                label="Email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                type="email"
                placeholder="votre@email.com"
              />
              <FormField
                label="Téléphone"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                type="tel"
                placeholder="+216..."
              />
            </div>

            <div className="border-t border-gray-100 pt-6">
              <FormField
                label="Nouveau mot de passe"
                name="password"
                value={formData.password}
                onChange={handleChange}
                type="password"
                placeholder="Laisser vide pour ne pas changer"
              />
              <p className="text-xs text-gray-400 mt-1 font-medium">
                Laissez ce champ vide si vous ne souhaitez pas changer le mot de
                passe
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleCancel}
              className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-gray-700 font-bold text-sm flex items-center justify-center gap-2 hover:bg-gray-50 transition-colors"
            >
              <FiX size={16} />
              Annuler
            </button>
            <button
              type="submit"
              disabled={saving}
              className={`flex-1 px-4 py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 text-white transition-all ${
                saving
                  ? "bg-gray-400 cursor-not-allowed"
                  : "bg-gradient-to-r from-orange-500 to-orange-400 hover:shadow-lg shadow-md"
              }`}
            >
              {saving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Enregistrement...
                </>
              ) : (
                <>
                  <FiSave size={16} />
                  Enregistrer
                </>
              )}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
