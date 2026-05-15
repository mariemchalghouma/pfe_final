// ════════════════════════════════════════════════════════════
// hooks/useAppelEtat.js
// Ouvre le WebSocket vers api_agent.py et met à jour le store
// ════════════════════════════════════════════════════════════

'use client'
import { useEffect, useRef } from 'react'
import { useAppelStore } from '../lib/store'
import { wsUrl } from '../lib/api'

// ── QU'EST-CE QU'UN HOOK ────────────────────────────────────
// Un hook = une fonction qui commence par "use"
// Elle contient de la logique React réutilisable
// Tu l'appelles dans n'importe quel composant :
//   const { etat, connecte } = useAppelEtat()
// Et tout fonctionne automatiquement
// ─────────────────────────────────────────────────────────────

export function useAppelEtat() {

    // useRef garde une référence au WebSocket en mémoire
    // sans déclencher de re-render quand il change
    const wsRef = useRef(null)

    // Récupérer les fonctions du store pour modifier les données
    const setEtat = useAppelStore((s) => s.setEtat)
    const setConnecte = useAppelStore((s) => s.setConnecte)

    // ── useEffect ───────────────────────────────────────────────
    // useEffect avec [] s'exécute UNE SEULE FOIS
    // quand le composant s'affiche pour la première fois
    useEffect(() => {

        function connecter() {

            // ── ÉTAPE 1 : Créer la connexion WebSocket ─────────────
            // wsUrl = 'ws://localhost:3000/ws/etat'
            //          ↑ vient de lib/api.js → .env.local
            //
            // Du côté de api_agent.py :
            //   @app.websocket("/ws/etat")
            //   async def ws_etat(websocket):
            //       await websocket.accept()
            //       while True:
            //           await websocket.send_json(dict(_etat))
            //           await asyncio.sleep(1)
            const ws = new WebSocket(wsUrl)
            wsRef.current = ws  // on garde la référence pour pouvoir fermer plus tard

            // ── ÉTAPE 2 : Connexion établie ────────────────────────
            ws.onopen = () => {
                setConnecte(true)
                // → store.connecte = true
                // → l'indicateur dans page.js devient vert
                console.log('[WebSocket] Connecté à api_agent.py')
            }

            // ── ÉTAPE 3 : Message reçu ─────────────────────────────
            // api_agent.py envoie automatiquement toutes les 1 seconde :
            // {
            //   "actif": true,
            //   "etat_appel": "active",
            //   "camion_id": "CAM-001",
            //   "nom_chauffeur": "Ahmed Ben Ali",
            //   "numero_tel": "+21692025375",
            //   "type_nc": "arret_non_prevu",
            //   "duree_nc_min": 25,
            //   "duree_s": 47,
            //   "historique": [
            //     { "role": "assistant", "content": "أهلاً Ahmed..." },
            //     { "role": "user",      "content": "panne في الكاميون" }
            //   ],
            //   "nb_tours": 1
            // }
            ws.onmessage = (event) => {
                // event.data = le JSON en string envoyé par api_agent.py
                const data = JSON.parse(event.data)

                // Mettre à jour le store Zustand avec les nouvelles données
                // → TOUS les composants qui lisent le store se rafraîchissent
                setEtat(data)
            }

            // ── ÉTAPE 4 : Connexion perdue ─────────────────────────
            ws.onclose = () => {
                setConnecte(false)
                // → store.connecte = false
                // → l'indicateur dans page.js devient rouge

                console.log('[WebSocket] Déconnecté — reconnexion dans 3s...')

                // Reconnexion automatique après 3 secondes
                // Si api_agent.py redémarre, Next.js se reconnecte tout seul
                setTimeout(connecter, 3000)
            }

            // ── ÉTAPE 5 : Erreur ───────────────────────────────────
            ws.onerror = (err) => {
                console.error('[WebSocket] Erreur:', err)
                ws.close()  // → déclenche onclose → reconnexion automatique
            }
        }

        // Lancer la connexion
        connecter()

        // ── CLEANUP ─────────────────────────────────────────────
        // S'exécute quand le composant quitte le DOM
        // (ex: l'utilisateur ferme l'onglet)
        return () => {
            if (wsRef.current) {
                wsRef.current.close()
            }
        }

    }, [setEtat, setConnecte])
    //   ↑ [] vide = s'exécute une seule fois
    //   On met setEtat et setConnecte pour éviter un warning React
    //   (ces fonctions ne changent jamais donc ça ne relance pas l'effet)

    // ── RETOURNER LES DONNÉES ────────────────────────────────
    // Le hook retourne les données du store
    // pour que le composant puisse les utiliser directement
    return {
        etat: useAppelStore((s) => s.etat),
        connecte: useAppelStore((s) => s.connecte),
    }
}

// ════════════════════════════════════════════════════════════
// EXEMPLE D'UTILISATION DANS UNE PAGE
// ════════════════════════════════════════════════════════════
//
// import { useAppelEtat } from '../../hooks/useAppelEtat'
//
// export default function Dashboard() {
//
//   // Un seul appel → WebSocket ouvert, données disponibles
//   const { etat, connecte } = useAppelEtat()
//
//   return (
//     <div>
//       {/* Indicateur connexion */}
//       <p>{connecte ? '🟢 Connecté' : '🔴 Déconnecté'}</p>
//
//       {/* État de l'appel — mis à jour toutes les 1 seconde */}
//       <p>État : {etat.etat_appel}</p>
//
//       {/* Données du chauffeur */}
//       <p>Chauffeur : {etat.nom_chauffeur}</p>
//       <p>Téléphone : {etat.numero_tel}</p>
//
//       {/* Conversation en temps réel */}
//       {etat.historique.map((tour, i) => (
//         <p key={i}>[{tour.role}] {tour.content}</p>
//       ))}
//     </div>
//   )
// }