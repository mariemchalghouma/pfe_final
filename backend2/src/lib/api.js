// ════════════════════════════════════════════════════════════
// 
// ════════════════════════════════════════════════════════════

 
const API =  process.env.NEXT_PUBLIC_API_URL  ;
const WS = process.env.NEXT_PUBLIC_WS_URL;

// ────────────────────────────────────────────────────────────
// LANCER UN APPEL — sortant OU entrant
//
// Mode SORTANT (par défaut) :
//   lancerAppel('CAM-001', '+21692025375')
//   lancerAppel('CAM-001', '+21692025375', 'outgoing')
//
// Mode ENTRANT (décrochage auto) :
//   lancerAppel('ENTRANT', '', 'incoming')
//   ou : lancerAppelEntrant()
// ────────────────────────────────────────────────────────────
export async function lancerAppel(camion_id, numero = '', mode = 'outgoing') {
    const res = await fetch(`${API}/appel/lancer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ camion_id, numero, mode }),
    })
    return res.json()
    // Retourne :
    //   Sortant : { ok: true, mode: "outgoing", session_id: "a1b2c3d4" }
    //   Entrant : { ok: true, mode: "incoming", message: "En attente..." }
    //   Erreur  : { ok: false, message: "Appel déjà actif" }
}


// ────────────────────────────────────────────────────────────
// RACCOURCI : Activer le mode appel entrant
// Le système attend 120s qu'un chauffeur appelle,
// puis décroche automatiquement et traite avec Whisper+Ollama
// ────────────────────────────────────────────────────────────
export async function lancerAppelEntrant(camion_id = 'ENTRANT') {
    return lancerAppel(camion_id, '', 'incoming')
}

// ────────────────────────────────────────────────────────────
// RACCROCHER L'APPEL EN COURS
// Utilisé quand l'opérateur clique "Raccrocher"
//
// Exemple d'utilisation dans page.js :
//   import { raccrocher } from '../../lib/api'
//   <button onClick={raccrocher}>Raccrocher</button>
// ────────────────────────────────────────────────────────────
export async function raccrocher() {
    const res = await fetch(`${API}/appel/raccrocher`, {
        method: 'POST',
    })
    return res.json()
    // Retourne : { ok: true }
}

// ────────────────────────────────────────────────────────────
// LIRE L'ÉTAT UNE SEULE FOIS (sans WebSocket)
// Utile au premier chargement de la page pour avoir
// l'état immédiatement sans attendre le WebSocket
//
// Exemple d'utilisation :
//   useEffect(() => {
//     getEtatInitial().then(data => console.log(data))
//   }, [])
// ────────────────────────────────────────────────────────────
export async function getEtatInitial() {
    const res = await fetch(`${API}/appel/etat`, {
        cache: 'no-store', // important : ne pas mettre en cache
    })
    return res.json()
    // Retourne : { actif: false, etat_appel: 'idle', ... }
}

// ────────────────────────────────────────────────────────────
// LIRE L'HISTORIQUE DES APPELS PASSÉS
// Les données viennent de la table historique_appels (PostgreSQL)
// Stockées automatiquement par AppelCall.py après chaque appel
//
// Exemple d'utilisation :
//   const [historique, setHistorique] = useState([])
//   useEffect(() => {
//     getHistorique(10).then(d => setHistorique(d.appels || []))
//   }, [])
// ────────────────────────────────────────────────────────────
export async function getHistorique(limit = 10, camion_id = null) {
    let url = `${API}/historique?limit=${limit}`
    if (camion_id) url += `&camion_id=${camion_id}`
    const res = await fetch(url, { cache: 'no-store' })
    return res.json()
    // Retourne : { total: 5, appels: [{session_id, camion_id, etat, ...}] }
}

// ────────────────────────────────────────────────────────────
// APPELS PAR SOURCE — pour les pages arrêts et ouverture-porte
// Permet d'afficher si un appel a été lancé pour un arrêt/porte
// ────────────────────────────────────────────────────────────
export async function getAppelsParSource(date = null) {
    let url = `${API}/appels/par-source`
    if (date) url += `?date=${date}`
    const res = await fetch(url, { cache: 'no-store' })
    return res.json()
}

// ────────────────────────────────────────────────────────────
// LIRE LES MESSAGES D'UNE CONVERSATION
// Les données viennent de messages_appels (PostgreSQL)
// Stockées par AgentOllama._sauvegarder_message_bdd() en temps réel
//
// Exemple d'utilisation :
//   getConversation('a1b2c3d4').then(d => console.log(d.messages))
// ────────────────────────────────────────────────────────────
export async function getConversation(session_id) {
    const res = await fetch(`${API}/conversations/${session_id}`, {
        cache: 'no-store',
    })
    return res.json()
    // Retourne :
    // {
    //   conversation: { session_id, camion_id, fichier_audio, nb_tours, ... },
    //   messages: [
    //     { tour: 1, role: 'chauffeur', contenu: 'panne في الكاميون' },
    //     { tour: 1, role: 'agent',     contenu: 'واش عندك عطب؟'     },
    //   ]
    // }
}

// ────────────────────────────────────────────────────────────
// VALIDATION HUMAINE D'UNE CONVERSATION
// Met a jour l'etat dans voyage_tracking_stops / voyagetracking_port_ouvert
//
// Exemple d'utilisation :
//   validerConversation('a1b2c3d4')
// ────────────────────────────────────────────────────────────
export async function validerConversation(session_id) {
    const res = await fetch(`${API}/conversations/${session_id}/validation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ etat: 'conforme' }),
    })
    return res.json()
}

// ────────────────────────────────────────────────────────────
// VÉRIFIER QUE L'API EST EN LIGNE
// Utile au démarrage de la page pour savoir si api_agent.py tourne
//
// Exemple d'utilisation :
//   checkHealth().then(d => console.log(d.status)) // 'ok' ou 'degraded'
// ────────────────────────────────────────────────────────────
export async function checkHealth() {
    try {
        const res = await fetch(`${API}/health`, { cache: 'no-store' })
        return res.json()
        // Retourne : { status: 'ok', db: 'ok', whisper: 'chargé', appel_actif: false }
    } catch {
        return { status: 'offline' }
    }
}

// ────────────────────────────────────────────────────────────
// CONSTANTES EXPORTÉES
// Utilisées directement dans les composants
// ────────────────────────────────────────────────────────────

// URL du fichier audio — utilisé dans <audio src={audioUrl} />
export const audioUrl = `${API}/appel/audio`

// URL WebSocket — utilisé dans hooks/useAppelEtat.js
export const wsUrl = `${WS}/ws/etat`