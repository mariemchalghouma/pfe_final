// ════════════════════════════════════════════════════════════
// lib/store.js
// Zustand — tiroir central partagé entre tous les composants
// ════════════════════════════════════════════════════════════

import { create } from 'zustand'

// create() crée le store Zustand
// (set) = la fonction pour modifier le contenu du store
//
// ── COMMENT ÇA FONCTIONNE ────────────────────────────────────
//
// 1. useAppelEtat.js reçoit un message WebSocket de api_agent.py
//    exemple : { actif: true, etat_appel: 'active', nom_chauffeur: 'Ahmed' }
//
// 2. useAppelEtat.js appelle setEtat(data)
//    → le store est mis à jour
//
// 3. TOUS les composants qui lisent le store se re-rendent
//    automatiquement avec les nouvelles données
//    → page.js, Header.js, BoutonRaccrocher.js, etc.
//
// ─────────────────────────────────────────────────────────────

export const useAppelStore = create((set) => ({

    // ── ÉTAT DE L'APPEL ─────────────────────────────────────────
    // Mis à jour par setEtat() à chaque message WebSocket reçu
    // (api_agent.py envoie ces données toutes les 1 seconde)
    etat: {

        // État général
        actif: false,   // true si un appel est en cours
        etat_appel: 'idle',  // 'idle' | 'ringing' | 'active' | 'ended' | 'missed' | 'canceled'

        // Identifiants
        camion_id: '',      // ex : "CAM-001"
        session_id: '',      // ex : "a1b2c3d4"

        // Données du chauffeur
        // Ces infos viennent de voyage_chauffeur via la jointure SQL
        // JOIN ON v."PLAMOTI" = s.camion AND DATE(v."VOYDTD") = DATE(s.beginstoptime)
        nom_chauffeur: '',      // SALNOM  → ex : "Ahmed Ben Ali"
        numero_tel: '',      // SALTEL  → ex : "+21692025375"

        // Non-conformité détectée
        type_nc: '',      // ex : "arret_non_prevu" ou "porte_ouverte"
        duree_nc_min: 0,       // ex : 25 (minutes depuis le début de la NC)

        // Timing de l'appel
        duree_s: 0,       // durée de l'appel en secondes (ex : 127)
        t_debut: null,    // ex : "2025-05-02T08:34:00"
        t_decroche: null,    // ex : "2025-05-02T08:34:18"
        t_fin: null,    // ex : "2025-05-02T08:36:47"

        // Conversation en temps réel
        // Synchronisé depuis agent.historique dans AppelCall.py
        // Mis à jour toutes les secondes pendant l'appel
        historique: [],      // [{ role: 'user', content: '...' }, { role: 'assistant', content: '...' }]
        nb_tours: 0,       // nombre d'échanges (1 tour = 1 question + 1 réponse)

        // Audio
        chemin_audio: '',      // chemin du fichier WAV après l'appel
    },

    // ── ÉTAT DE LA CONNEXION WEBSOCKET ──────────────────────────
    // true  = WebSocket connecté  → indicateur vert dans la page
    // false = WebSocket déconnecté → indicateur rouge, reconnexion auto
    connecte: false,

    // ── FONCTIONS DE MISE À JOUR ─────────────────────────────────

    // Appelée par hooks/useAppelEtat.js à chaque message WebSocket
    // data = le JSON complet envoyé par api_agent.py
    setEtat: (etat) => set({ etat }),

    // Appelée par hooks/useAppelEtat.js quand le WebSocket s'ouvre ou se ferme
    setConnecte: (connecte) => set({ connecte }),

}))

// ════════════════════════════════════════════════════════════
// COMMENT UTILISER LE STORE DANS UN COMPOSANT
// ════════════════════════════════════════════════════════════
//
// OPTION 1 — Lire tout l'état (re-render à chaque changement)
//   import { useAppelStore } from '../../lib/store'
//   const etat = useAppelStore((s) => s.etat)
//   <p>{etat.nom_chauffeur}</p>
//   <p>{etat.etat_appel}</p>
//
// OPTION 2 — Lire une seule propriété (meilleure performance)
//   const actif        = useAppelStore((s) => s.etat.actif)
//   const nomChauffeur = useAppelStore((s) => s.etat.nom_chauffeur)
//   const historique   = useAppelStore((s) => s.etat.historique)
//   const connecte     = useAppelStore((s) => s.connecte)
//   ↑ Le composant se re-render SEULEMENT si CETTE propriété change
//
// OPTION 3 — Lire plusieurs propriétés
//   const { etat, connecte } = useAppelStore((s) => ({
//     etat:     s.etat,
//     connecte: s.connecte,
//   }))