"""
api_agent.py — VERSION WHISPER
═══════════════════════════════════════════════════════════════
Adapté pour le nouveau AppelCall.py (Whisper remplace Vosk).


CHANGEMENTS vs version Vosk :
  ✅ init_whisper()          au lieu de init_vosk()
  ✅ boucle_ecoute()         au lieu de Ecouteur (classe)
  ✅ sequence_basculement()  au lieu de sequence_basculement_appel()
  ✅ surveiller_fin_appel([True]) — actif est une liste [bool]
  ✅ EnregistreurWAV()       sans paramètres
  ✅ SAMPLE_RATE             au lieu de VOSK_RATE


PORTS :
  FastAPI  = port 4000
  Next.js  = port 5000


LANCER :
  uvicorn api_agent:app --host 0.0.0.0 --port 4000 --reload
"""


# ══════════════════════════════════════════════════════════════
#  IMPORTS STANDARD
# ══════════════════════════════════════════════════════════════
from fastapi import FastAPI, WebSocket, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
import asyncio, threading, time, os, json, queue
import psycopg2, psycopg2.extras
import pyaudio


# ══════════════════════════════════════════════════════════════
#  IMPORTS DEPUIS AppelCall.py (version Whisper)
#
#  IMPORTANT : api_agent.py appelle les fonctions d'AppelCall
#  en lui passant les données comme paramètres.
#  AppelCall ne lit JAMAIS la BDD lui-même.
# ══════════════════════════════════════════════════════════════
from AppelVosk import (
    # ── Initialisation ──────────────────────────────────────
    init_whisper,               # Charge le modèle Whisper au démarrage
                                # (remplace init_vosk)


    # ── Agent IA ────────────────────────────────────────────
    AgentOllama,                # Crée l'agent Ollama avec session_id
                                # Usage: agent = AgentOllama(camion_id)


    # ── Surveillance appel ──────────────────────────────────
    SurveilleAppel,             # Surveille RINGING → ACTIVE → ENDED via ADB
    generer_rapport_ollama,                           # Stocke dans historique_appels (BDD)


    # ── ADB ─────────────────────────────────────────────────
    lancer_appel_adb,           # Lance l'appel via ADB sur le téléphone
                                # Usage: lancer_appel_adb("+21692025375")
    raccrocher_adb,             # Raccroche via ADB
    decrocher_adb,              # Décroche un appel entrant via ADB
    get_call_state_adb,         # Lit l'état appel (0=IDLE, 1=RINGING, 2=ACTIVE)
    get_caller_number_adb,      # Récupère le numéro de l'appelant entrant


    # ── Audio Bluetooth ─────────────────────────────────────
    sequence_basculement,       # ⚠️ NOUVEAU NOM (était sequence_basculement_appel)
                                # Route l'audio vers DESKTOP-24V22SD via BT
    liberer_sco,                # Libère la connexion Bluetooth SCO
    choisir_sortie_audio,       # Choisit le périphérique de sortie (CABLE Input)
    
    # ── TTS ─────────────────────────────────────────────
    parler,                     # Synthèse vocale (edge-tts)
                                # Usage: parler("Bonjour chauffeur")
    set_enregistreur_global,    # Définit l'enregistreur pour injection TTS
                                # Usage: set_enregistreur_global(enreg)


    # ── Écoute Whisper ──────────────────────────────────────
    boucle_ecoute,              # ⚠️ NOUVEAU — remplace la classe Ecouteur
                                # Fonction BLOQUANTE : VAD + Whisper + callback
                                # Usage: boucle_ecoute(stream, rate, on_texte, actif, enreg)
                                # actif = [True]  ← liste Python (mutable)


    # ── Surveillance fin d'appel ─────────────────────────────
    surveiller_fin_appel,       # ⚠️ NOUVELLE SIGNATURE
                                # Usage: surveiller_fin_appel(actif_flag)
                                # actif_flag = [True] → met [False] quand appel terminé


    # ── Enregistrement WAV ──────────────────────────────────
    EnregistreurWAV,            # ⚠️ SANS PARAMÈTRES maintenant
                                # Usage: enreg = EnregistreurWAV()


    # ── Session tracking ────────────────────────────────────
    demarrer_session_appel,     # Initialise le tracking de session
    log_session_appel,          # Clôture et sauvegarde la session en JSONL


    # ── Constantes ──────────────────────────────────────────
    OUTPUT_WAV,                 # Chemin du fichier WAV de sortie
    SAMPLE_RATE,                # ⚠️ NOUVEAU (était VOSK_RATE) — 16000 Hz
    CHUNK_MS,                   # Durée d'un chunk audio (20ms)
    FORCE_INPUT_NAME_SUBSTR,    # Nom partiel du micro virtuel (ex: "cable output")
    BT_FORCE_RETRIES,           # Nombre de tentatives de basculement BT
)


# ══════════════════════════════════════════════════════════════
#  APPLICATION FASTAPI
# ══════════════════════════════════════════════════════════════
app = FastAPI(title="Agent Appel Whisper API", version="3.0")


app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5000"],  # ← port Next.js
    allow_methods=["*"],
    allow_headers=["*"],
)


# ══════════════════════════════════════════════════════════════
#  CONFIG BDD
# ══════════════════════════════════════════════════════════════
DB_CONFIG = {
    "host":     "localhost",
    "port":     5432,
    "database": "tracking",
    "user":     "postgres",
    "password": "12345",
}
POLL_INTERVAL_S = 30  # Polling BDD toutes les 30s

SYSTEM_PROMPT_RAPPORT = """Tu es un analyste de transport logistique.
À partir d'une conversation entre un agent IA et un chauffeur de camion,
génère un rapport structuré en français.

Le rapport doit contenir exactement ces sections :
1. RÉSUMÉ : 2-3 phrases résumant la situation
2. PROBLÈME SIGNALÉ : Le problème ou la situation décrite par le chauffeur
3. CAUSE IDENTIFIÉE : La cause probable selon les propos du chauffeur (panne, ravitaillement, pause, vol de carburant, erreur capteur, etc.)
4. RÉPONSE AGENT : Ce que l'agent IA a proposé ou demandé
5. STATUT FINAL : Résolu / En attente / Non résolu / Inconnu
6. PRÉDICTION NON-CONFORMITÉ : Un pourcentage entre 0% et 100% estimant la probabilité que ce cas soit réellement non-conforme (vol, fraude, violation). Utilise ces critères STRICTEMENT :
   - Explication claire, cohérente et vérifiable du chauffeur (panne confirmée, ravitaillement en station, pause courte ≤15min) → faible (10-25%)
   - Explication acceptable mais non vérifiable (embouteillage, problème GPS) → modéré (30-50%)
   - Explication vague, évasive, ou réponse peu claire / le chauffeur ne donne pas de réponse claire → ÉLEVÉ (60-80%)
   - Refus de répondre, incohérence, contradiction, indices de fraude, ou aucune réponse → TRÈS ÉLEVÉ (85-100%)
   - Pause déclarée > 15 minutes → au minimum 65%
   IMPORTANT : Si le chauffeur ne fournit pas d'explication claire et convaincante, le score DOIT être ≥ 60%.
   Format: XX% - LABEL (où LABEL est: Conforme probable / Suspicion légère / Suspicion modérée / Suspicion élevée / Non-conforme probable)
7. MOTS-CLÉS : 3-5 mots-clés séparés par des virgules
8. RECOMMANDATION : Action suggérée pour le superviseur

Réponds UNIQUEMENT avec le rapport structuré, sans introduction."""


def connecter_bdd():
    return psycopg2.connect(**DB_CONFIG)





# ══════════════════════════════════════════════════════════════
#  ÉTAT GLOBAL — partagé entre tous les threads
#  Le WebSocket envoie ce dict à Next.js toutes les 1 seconde
# ══════════════════════════════════════════════════════════════
_etat = {
    "actif":          False,
    "etat_appel":     "idle",    # idle/ringing/active/ended/missed/canceled


    # Identifiants
    "camion_id":      "",
    "session_id":     "",


    # Données chauffeur (depuis voyage_chauffeur via jointure SQL)
    "nom_chauffeur":  "",        # SALNOM
    "numero_tel":     "",        # SALTEL
    "type_nc":        "",        # arret_non_prevu / porte_ouverte
    "duree_nc_min":   0,


    # Timing
    "duree_s":        0,
    "t_debut":        None,
    "t_decroche":     None,
    "t_fin":          None,


    # Conversation (synchronisée depuis agent.historique)
    "historique":     [],        # [{role:"user", content:"..."}, ...]
    "nb_tours":       0,


    # Audio
    "chemin_audio":   "",
}


# ── Variables globales des objets en cours ────────────────────
_surv      = None    # Instance SurveilleAppel
_actif_appel = [False]  # ⚠️ NOUVEAU : liste [bool] pour boucle_ecoute
_stream    = None    # Stream PyAudio
_lock      = threading.Lock()
_file_nc   = queue.Queue()  # File d'attente des NC à appeler séquentiellement


# ══════════════════════════════════════════════════════════════
#  HELPERS BDD
# ══════════════════════════════════════════════════════════════
def _sauvegarder_historique(donnees: dict):
    """Insère dans historique_appels après chaque appel."""
    try:
        conn = connecter_bdd(); cur = conn.cursor()
        cur.execute("""
            INSERT INTO historique_appels (
                session_id, camion_id, etat, mode_appel,
                duree_s, duree_attente_s,
                t_debut, t_decroche, t_fin, date_appel
            ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,NOW())
            ON CONFLICT (session_id) DO UPDATE SET
                etat=EXCLUDED.etat, duree_s=EXCLUDED.duree_s,
                t_fin=EXCLUDED.t_fin
        """, (
            donnees.get("session_id"),
            donnees.get("camion_id"),
            donnees.get("etat", "ended"),
            donnees.get("mode_appel", "outgoing"),
            donnees.get("duree_s", 0),
            donnees.get("duree_attente_s", 0),
            donnees.get("t_debut"),
            donnees.get("t_decroche"),
            donnees.get("t_fin"),
        ))
        conn.commit(); conn.close()
        print(f"  ✅ historique_appels ← {donnees.get('session_id')}")
    except Exception as e:
        print(f"  ⚠️ historique_appels BDD : {e}")




# ══════════════════════════════════════════════════════════════
#  THREAD POLLING BDD — tourne toutes les 30s
# ══════════════════════════════════════════════════════════════
# Dans api_agent.py — remplace _boucle_polling_bdd()


# Variable pour éviter double log_session_appel
_SESSION_APPEL_TERMINE = [False]




def _boucle_polling_bdd():
    """
    Polling BDD toutes les 30s.
    Les NC détectées sont mises dans _file_nc (queue).
    Si aucun appel n'est actif, on lance le drain immédiatement.
    Sinon le drain sera déclenché en fin d'appel.
    """
    deja_traites = set()
    print(f"  🔄 Polling BDD démarré (toutes les {POLL_INTERVAL_S}s)")


    while True:
        try:
            # ── Ne pas polluer les logs pendant un appel actif ──
            with _lock:
                actif = _etat["actif"]
            if actif:
                time.sleep(POLL_INTERVAL_S)
                continue

            nouvelles = _detecter_nc_bdd(deja_traites)


            for row in nouvelles:
                deja_traites.add(row["id"])


                # ── Insérer dans historique_appels (table combinée) ──────
                detection_id = _inserer_detection(row)
                print(f"  ✅ Détection insérée → id={detection_id}")


                # Ajouter à la file d'attente
                _file_nc.put((row, detection_id))
                print(f"  📋 NC en file d'attente (total: {_file_nc.qsize()})")


            # ── Si des NC en attente et pas d'appel en cours → lancer le drain
            with _lock:
                actif = _etat["actif"]


            if not actif and not _file_nc.empty():
                threading.Thread(
                    target=_drainer_file_nc,
                    daemon=True,
                ).start()


        except Exception as e:
            print(f"  ❌ Polling BDD : {e}")


        time.sleep(POLL_INTERVAL_S)




def _inserer_detection(row: dict) -> int:
    """Insère une NC dans `historique_appels` (table combinée) et retourne l'id."""
    try:
        conn = connecter_bdd()
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO historique_appels (
                source_table, source_id, type_nc, statut,
                camion_id, nom_chauffeur, numero_tel, ts_detection, duree_nc_min,
                source_table_2, source_id_2
            ) VALUES (%s,%s,%s,'nouveau',%s,%s,%s,NOW(),%s,%s,%s)
            ON CONFLICT (source_table, source_id) DO UPDATE SET
                statut = 'nouveau',
                source_table_2 = EXCLUDED.source_table_2,
                source_id_2 = EXCLUDED.source_id_2
            RETURNING id
        """, (
            row.get("source_table"),
            row.get("id"),
            row.get("type_nc"),
            row.get("camion_id"),
            row.get("nom_chauffeur"),
            row.get("numero_tel"),
            row.get("duree_min", 0),
            row.get("source_table_2"),
            row.get("source_id_2"),
        ))
        res = cur.fetchone()
        conn.commit()
        conn.close()
        return res[0] if res else None
    except Exception as e:
        print(f"  ❌ _inserer_detection : {e}")
        return None




def _marquer_en_cours(detection_id: int, session_id: str = None):
    """Marque la détection `en_cours` et attache `session_id`."""
    if not detection_id:
        return
    try:
        conn = connecter_bdd()
        cur = conn.cursor()
        cur.execute("""
            UPDATE historique_appels
            SET statut = 'en_cours',
                session_id = %s
            WHERE id = %s
        """, (session_id, detection_id))
        conn.commit(); conn.close()
        print(f"  🔄 Detection {detection_id} → 'en_cours' (session={session_id})")
    except Exception as e:
        print(f"  ❌ _marquer_en_cours : {e}")




def _marquer_appel_termine(detection_id: int, session_id: str = None):
    """Marque la détection `appel_termine`."""
    if not detection_id:
        return
    try:
        conn = connecter_bdd()
        cur = conn.cursor()
        cur.execute("""
            UPDATE historique_appels
            SET statut = 'appel_termine'
            WHERE id = %s
        """, (detection_id,))
        conn.commit(); conn.close()
        print(f"  ✅ Detection {detection_id} → 'appel_termine'")
    except Exception as e:
        print(f"  ❌ _marquer_appel_termine : {e}")




def _detecter_nc_bdd(deja_traites: set) -> list:
    """
    Détecte 3 types de NC :
      CAS 1 : Arrêt NC seul
      CAS 2 : Arrêt NC + Porte ouverte NC (même camion)
      CAS 3 : Arrêt NC + Chute carburant > 15% en 30min
    """
    resultats = []
    try:
        conn = connecter_bdd()
        cur  = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        # ── DEBUG compteurs ────────────────────────────────────
        cur.execute("""
            SELECT COUNT(*) AS total FROM voyage_tracking_stops
            WHERE etat = 'non_conforme'
              AND beginstoptime >= CURRENT_DATE
              AND beginstoptime <  CURRENT_DATE + 1
        """)
        print(f"  🔍 {cur.fetchone()['total']} arrêts NC aujourd'hui")

        cur.execute("""
            SELECT COUNT(*) AS total FROM voyagetracking_port_ouvert
            WHERE etat = 'non_conforme'
              AND date_ouverture >= CURRENT_DATE
              AND date_ouverture <  CURRENT_DATE + 1
        """)
        print(f"  🔍 {cur.fetchone()['total']} portes NC aujourd'hui")

        # ══════════════════════════════════════════════════════
        #  CAS 2 — Arrêt NC + Porte ouverte NC (même camion)
        #  Priorité sur CAS 1 car plus grave
        # ══════════════════════════════════════════════════════
        cur.execute("""
             SELECT DISTINCT ON (s.camion, s.beginstoptime)
    s.camion || '|' || s.beginstoptime::text AS id,
    s.camion AS camion_id,
    s.address,
    s.beginstoptime,
    s.etat,
    EXTRACT(EPOCH FROM (NOW()-s.beginstoptime))/60 AS duree_min,
    v."SALNOM" AS nom_chauffeur,
    CASE 
        WHEN v."SALTEL" IS NOT NULL 
        THEN '+216' || LPAD(TRIM(TO_CHAR(v."SALTEL",'99999999')),8,'0') 
        ELSE NULL 
    END AS numero_tel,
    'voyage_tracking_stops' AS source_table,
    'arret_et_porte_ouverte' AS type_nc,
    -- Infos porte ouverte
    'voyagetracking_port_ouvert' AS source_table_2,
    p.camion || '|' || p.date_ouverture::text AS source_id_2,
    p.adress AS adresse_porte,
    EXTRACT(EPOCH FROM (
        COALESCE(p.date_fermeture, NOW()) - p.date_ouverture
    ))/60 AS duree_porte_min,
    2 AS cas_nc

FROM voyage_tracking_stops s

JOIN voyage_chauffeur v 
    ON v."PLAMOTI" = s.camion 
    AND DATE(v."VOYDTD") = DATE(s.beginstoptime)

-- Jointure porte ouverte NC : même camion + pendant l'arrêt
JOIN voyagetracking_port_ouvert p 
    ON p.camion = s.camion
    AND p.etat = 'non_conforme'
    AND p.date_ouverture >= CURRENT_DATE 
    AND p.date_ouverture < CURRENT_DATE + 1
    AND p.date_ouverture >= s.beginstoptime
    AND p.date_ouverture <= COALESCE(s.endstoptime, NOW())

WHERE s.etat = 'non_conforme'
    AND s.beginstoptime >= CURRENT_DATE
    AND s.beginstoptime < CURRENT_DATE + 1
    AND NOT EXISTS (
        SELECT 1 FROM historique_appels h
        WHERE h.source_table = 'voyage_tracking_stops'
          AND h.source_id = s.camion || '|' || s.beginstoptime::text
          AND h.statut IN ('en_cours','appel_termine')
    )

ORDER BY s.camion, s.beginstoptime
LIMIT 5
        """)
        for row in cur.fetchall():
            if row["id"] not in deja_traites and row["numero_tel"]:
                resultats.append(dict(row))
                print(f"  🟠 CAS 2 — Arrêt+Porte : camion={row['camion_id']} "
                      f"porte={row['duree_porte_min']:.0f}min")

        # ══════════════════════════════════════════════════════
        #  CAS 3 — Arrêt NC + Chute carburant > 15% en 30min
        # ══════════════════════════════════════════════════════
        cur.execute("""
             SELECT DISTINCT ON (s.camion, s.beginstoptime)
    s.camion || '|' || s.beginstoptime::text  AS id,
    s.camion                                  AS camion_id,
    s.address,
    s.beginstoptime,
    s.endstoptime,
    s.etat,
    EXTRACT(EPOCH FROM (NOW() - s.beginstoptime)) / 60  AS duree_min,
    v."SALNOM"                                AS nom_chauffeur,
    CASE
        WHEN v."SALTEL" IS NOT NULL
        THEN '+216' || LPAD(TRIM(TO_CHAR(v."SALTEL", '99999999')), 8, '0')
        ELSE NULL
    END                                       AS numero_tel,
    'voyage_tracking_stops'                   AS source_table,
    'arret_et_chute_carburant'                AS type_nc,

    -- Infos carburant
    carb.fuel_debut                           AS fuel_avant,
    carb.fuel_fin                             AS fuel_apres,
    carb.chute_litres,
    carb.chute_pct,
    3                                         AS cas_nc

FROM voyage_tracking_stops s
JOIN voyage_chauffeur v
  ON  v."PLAMOTI"      = s.camion
  AND DATE(v."VOYDTD") = DATE(s.beginstoptime)

-- ✅ Chute carburant entre beginstoptime et endstoptime
JOIN LATERAL (
    SELECT
        m_debut.fuel                                        AS fuel_debut,
        m_fin.fuel                                          AS fuel_fin,
        m_debut.fuel - m_fin.fuel                           AS chute_litres,
        ROUND(((m_debut.fuel - m_fin.fuel)
            / NULLIF(m_debut.fuel, 0) * 100)::numeric, 1)  AS chute_pct
    FROM niveau_carburant m_debut
    JOIN LATERAL (
        SELECT fuel
        FROM niveau_carburant m_inner
        WHERE m_inner.camion = m_debut.camion
          AND m_inner.gps_dt >= s.beginstoptime
          AND m_inner.gps_dt <= s.endstoptime
        ORDER BY m_inner.gps_dt DESC
        LIMIT 1
    ) m_fin ON TRUE
    WHERE m_debut.camion = s.camion
      AND m_debut.gps_dt = (
            SELECT MIN(gps_dt)
            FROM niveau_carburant
            WHERE camion  = s.camion
              AND gps_dt >= s.beginstoptime
              AND gps_dt <= s.endstoptime
          )
      AND m_debut.fuel > 0
      AND (m_debut.fuel - m_fin.fuel) / NULLIF(m_debut.fuel, 0) > 0.15
) carb ON TRUE

WHERE s.etat = 'non_conforme'
  AND s.beginstoptime >= CURRENT_DATE
  AND s.beginstoptime <  CURRENT_DATE + 1
  AND s.endstoptime IS NOT NULL            -- ✅ arrêt terminé obligatoire
  AND NOT EXISTS (
      SELECT 1 FROM historique_appels h
      WHERE h.source_table = 'voyage_tracking_stops'
        AND h.source_id    = s.camion || '|' || s.beginstoptime::text
        AND h.statut      IN ('en_cours', 'appel_termine')
  )
ORDER BY s.camion, s.beginstoptime DESC
LIMIT 5
        """)
        for row in cur.fetchall():
            if row["id"] not in deja_traites and row["numero_tel"]:
                resultats.append(dict(row))
                print(f"  🔴 CAS 3 — Arrêt+Carburant : camion={row['camion_id']} "
                      f"chute={row['chute_pct']}% ({row['chute_litres']} L)")
        # ══════════════════════════════════════════════════════
        #  CAS 4 —  arrectconfrome  Chute carburant > 15% en 30min
        # ══════════════════════════════════════════════════════
        cur.execute( """  SELECT DISTINCT ON (m1.ctid)
    m1.ctid::text                                           AS id,
    m1.camion                                               AS camion_id,
    m1.gps_dt                                               AS beginstoptime,
    EXTRACT(EPOCH FROM (NOW() - m1.gps_dt)) / 60           AS duree_min,
    v."SALNOM"                                              AS nom_chauffeur,
    CASE
        WHEN v."SALTEL" IS NOT NULL
        THEN '+216' || LPAD(TRIM(TO_CHAR(v."SALTEL", '99999999')), 8, '0')
        ELSE NULL
    END                                                     AS numero_tel,
    'niveau_carburant'                                               AS source_table,
    'chute_carburant'                                       AS type_nc,

    -- Infos carburant
    m1.fuel                                                 AS fuel_avant,
    m2.fuel                                                 AS fuel_apres,
    m1.fuel - m2.fuel                                       AS chute_litres,
    ROUND(((m1.fuel - m2.fuel)
        / NULLIF(m1.fuel, 0) * 100)::numeric, 1)           AS chute_pct,
    3                                                       AS cas_nc

FROM niveau_carburant m1

-- Jointure principale : chauffeur du jour
JOIN voyage_chauffeur v
  ON  v."PLAMOTI"      = m1.camion
  AND DATE(v."VOYDTD") = DATE(m1.gps_dt)

-- Niveau suivant dans les 30 minutes (pour calculer la chute)
JOIN LATERAL (
    SELECT fuel
    FROM niveau_carburant m_inner
    WHERE m_inner.camion = m1.camion
      AND m_inner.gps_dt > m1.gps_dt
      AND m_inner.gps_dt <= m1.gps_dt + INTERVAL '30 minutes'
    ORDER BY m_inner.gps_dt DESC
    LIMIT 1
) m2 ON TRUE

WHERE m1.date_creation = CURRENT_DATE
  AND m1.fuel > 0
  AND (m1.fuel - m2.fuel) / NULLIF(m1.fuel, 0) > 0.15
  AND NOT EXISTS (
      SELECT 1 FROM historique_appels h
      WHERE h.source_table = 'niveau_carburant'
        AND h.source_id    = m1.ctid::text
        AND h.statut      IN ('en_cours', 'appel_termine')
  )
ORDER BY m1.ctid, m1.gps_dt DESC
LIMIT 5
         

        """)
        for row in cur.fetchall():
            if row["id"] not in deja_traites and row["numero_tel"]:
                resultats.append(dict(row))
                print(f"  🔴 CAS 4 — Carburant : camion={row['camion_id']} "
                      f"chute={row['chute_pct']}% ({row['chute_litres']} L)")

        # ══════════════════════════════════════════════════════
        #  CAS 1 — Arrêt NC seul
        #  Seulement si ce camion n'est pas déjà dans CAS 2 ou 3
        # ══════════════════════════════════════════════════════
        camions_cas_2_3 = {r["camion_id"] for r in resultats}

        cur.execute("""
            SELECT DISTINCT ON (s.camion, s.beginstoptime)
                s.camion || '|' || s.beginstoptime::text  AS id,
                s.camion                                  AS camion_id,
                s.address,
                s.beginstoptime,
                s.etat,
                EXTRACT(EPOCH FROM (NOW()-s.beginstoptime))/60  AS duree_min,
                v."SALNOM"                                AS nom_chauffeur,
                CASE
                    WHEN v."SALTEL" IS NOT NULL
                    THEN '+216' || LPAD(TRIM(TO_CHAR(v."SALTEL",'99999999')),8,'0')
                    ELSE NULL
                END                                       AS numero_tel,
                'voyage_tracking_stops'                   AS source_table,
                'arret_non_prevu'                         AS type_nc,
                1                                         AS cas_nc

            FROM voyage_tracking_stops s
            JOIN voyage_chauffeur v
              ON  v."PLAMOTI"      = s.camion
              AND DATE(v."VOYDTD") = DATE(s.beginstoptime)

            WHERE s.etat = 'non_conforme'
              AND s.beginstoptime >= CURRENT_DATE
              AND s.beginstoptime <  CURRENT_DATE + 1
              AND EXTRACT(EPOCH FROM (NOW()-s.beginstoptime))/60 > 10
              AND NOT EXISTS (
                  SELECT 1 FROM historique_appels h
                  WHERE h.source_table = 'voyage_tracking_stops'
                    AND h.source_id    = s.camion || '|' || s.beginstoptime::text
                    AND h.statut      IN ('en_cours','appel_termine')
              )
            ORDER BY s.camion, s.beginstoptime DESC
            LIMIT 5
        """)
        for row in cur.fetchall():
            camion = row["camion_id"]
            # Ignorer si déjà dans CAS 2 ou 3
            if camion in camions_cas_2_3:
                continue
            if row["id"] not in deja_traites and row["numero_tel"]:
                resultats.append(dict(row))
                print(f"  🟡 CAS 1 — Arrêt seul : camion={camion} "
                      f"durée={row['duree_min']:.0f}min")

        conn.close()

    except Exception as e:
        print(f"  ❌ _detecter_nc_bdd : {e}")

    print(f"  🔍 {len(resultats)} NC à traiter ce cycle")
    return resultats

# ════════════════════════════════════════════════════════════
def _executer_appel_auto(row: dict, detection_id: int = None):
    """
    Lance l'appel complet — VERSION SYNCHRONE (bloquante).
    Appelée par _drainer_file_nc() dans un thread unique.
    """
    global _surv, _actif_appel


    numero        = row.get("numero_tel", "")
    camion_id     = row.get("camion_id",  "INCONNU")
    nom_chauffeur = row.get("nom_chauffeur", "Chauffeur")
    type_nc       = row.get("type_nc",    "NC")
    duree         = int(row.get("duree_min", 0))


    print(f"\n  📞 Appel auto → {nom_chauffeur} ({numero})")


    agent = AgentOllama(
        camion_id,
        nom_chauffeur=nom_chauffeur,
        type_nc=type_nc,
        duree_min=duree,
        cas_nc=row.get("cas_nc", 1),
        chute_pct=row.get("chute_pct", 0),
        duree_porte_min=row.get("duree_porte_min", 0),
    )
    _surv = SurveilleAppel(
        mode="outgoing",
        camion_id=camion_id,
        session_id=agent.session_id,
    )


    import datetime
    with _lock:
        _etat.update({
            "actif":          True,
            "etat_appel":     "ringing",
            "camion_id":      camion_id,
            "session_id":     agent.session_id,
            "nom_chauffeur":  nom_chauffeur,
            "numero_tel":     numero,
            "type_nc":        type_nc,
            "duree_nc_min":   duree,
            "t_debut":        datetime.datetime.now().isoformat(),
            "t_decroche":     None,
            "t_fin":          None,
            "duree_s":        0,
            "historique":     [],
            "nb_tours":       0,
            "chemin_audio":   "",
        })


    demarrer_session_appel(agent.session_id, numero, camion_id)


    # ── Vérifier si un appel entrant est en cours → PRIORITÉ ENTRANT ──
    etat_tel = get_call_state_adb()
    if etat_tel == 1:
        print("  ⚠️ Appel entrant en sonnerie → priorité à l'entrant, on reporte")
        with _lock:
            _etat["actif"] = False
            _etat["etat_appel"] = "idle"
        # Remettre dans la file pour plus tard
        _file_nc.put((row, detection_id))
        time.sleep(30)  # attendre que l'appel entrant finisse
        return
    elif etat_tel == 2:
        print("  ⚠️ Appel entrant actif → priorité à l'entrant, on reporte")
        with _lock:
            _etat["actif"] = False
            _etat["etat_appel"] = "idle"
        _file_nc.put((row, detection_id))
        time.sleep(30)
        return


    ok = lancer_appel_adb(numero)
    if not ok:
        print(f"  ❌ ADB échec")
        with _lock:
            _etat["actif"]      = False
            _etat["etat_appel"] = "canceled"
        log_session_appel("adb_failed")
        if detection_id:
            _marquer_appel_termine(detection_id, agent.session_id)
        return


    # Marquer en cours avec session_id
    if detection_id:
        _marquer_en_cours(detection_id, agent.session_id)

    _surv.demarrer()


    # ── Créer l'enregistreur AVANT l'attente pour capturer dès la sonnerie ──
    enreg        = EnregistreurWAV(agent.session_id)
    set_enregistreur_global(enreg)
    _actif_appel = [True]
    chunk_size_rec = int(SAMPLE_RATE * CHUNK_MS / 1000)
    chunks_per_sec = int(1000 / CHUNK_MS)

    # ── Attente décrochage — tout en enregistrant l'audio ──
    print(f"  ⏳ Attente décrochage (enregistrement en cours)...")
    t_wait = time.time()
    chunk_count = 0
    while (time.time() - t_wait) < 60:
        try:
            raw = _stream.read(chunk_size_rec, exception_on_overflow=False)
            enreg.ajouter(raw)
        except:
            time.sleep(0.01)
        chunk_count += 1
        if chunk_count % chunks_per_sec == 0:
            if get_call_state_adb() == 2:
                print("  ✅ Appel décroché !")
                break


    # ── Basculement BT avec enregistrement continu ──
    for tentative in range(BT_FORCE_RETRIES):
        sequence_basculement()
        t_drain = time.time()
        while time.time() - t_drain < 0.5:
            try:
                raw = _stream.read(chunk_size_rec, exception_on_overflow=False)
                enreg.ajouter(raw)
            except:
                time.sleep(0.01)
        if get_call_state_adb() == 2:
            print(f"  ✅ Basculement OK (tentative {tentative+1})")
            break
        print(f"  🔄 Retry BT ({tentative+1}/{BT_FORCE_RETRIES})...")


    th_fin = threading.Thread(
        target=surveiller_fin_appel,
        args=(_actif_appel,),
        daemon=True,
    )
    th_fin.start()


    def _surveiller_surv():
        while _actif_appel[0]:
            time.sleep(2)
            if not _surv._actif:
                _actif_appel[0] = False
                break
    threading.Thread(target=_surveiller_surv, daemon=True).start()


    def _sync_etat():
        while _actif_appel[0]:
            time.sleep(1)
            with _lock:
                etat_obj = getattr(_surv, "_etat", None)
                if etat_obj:
                    etat_name = (etat_obj.name.lower()
                                 if hasattr(etat_obj, "name")
                                 else str(etat_obj).lower())
                    _etat["etat_appel"] = etat_name
                _etat["duree_s"]    = _surv.duree_en_cours()
                _etat["historique"] = list(agent.historique)
                _etat["nb_tours"]   = len(agent.historique) // 2
    threading.Thread(target=_sync_etat, daemon=True).start()

    # ── Attendre que le chauffeur soit prêt (3s après décrochage) ──
    time.sleep(3)


    # ── Message d'accueil selon le CAS ────────────────────────
    cas_nc = row.get("cas_nc", 1)

    if cas_nc == 2:
        # CAS 2 : Arrêt NC + Porte ouverte
        duree_porte = int(row.get("duree_porte_min", 0))
        msg = (
            f"أهلاً {nom_chauffeur}، أنا المساعد الآلي. "
            f"لاحظنا توقف الكاميون {camion_id} منذ {duree} دقيقة "
            f"مع فتح الباب منذ {duree_porte} دقيقة. "
            f"شنو صار؟"
        )
    elif cas_nc == 3:
        # CAS 3 : Arrêt NC + Chute carburant > 15%
        chute_pct = row.get("chute_pct", 0)
        msg = (
            f"أهلاً {nom_chauffeur}، أنا المساعد الآلي. "
            f"لاحظنا توقف الكاميون {camion_id} منذ {duree} دقيقة "
            f"مع نقص في الوقود بنسبة {chute_pct} بالمائة. "
            f"واش صار؟"
        )
    elif cas_nc == 4:
        # CAS 4 : Chute carburant seule > 15%
        chute_pct = row.get("chute_pct", 0)
        msg = (
            f"أهلاً {nom_chauffeur}، أنا المساعد الآلي. "
            f"لاحظنا نقص كبير في الوقود بنسبة {chute_pct} بالمائة "
            f"في الكاميون {camion_id}. "
            f"واش عندك تفسير؟"
        )
    else:
        # CAS 1 : Arrêt NC seul (par défaut)
        msg = (
            f"أهلاً {nom_chauffeur}، أنا المساعد الآلي. "
            f"لاحظنا توقف الكاميون {camion_id} منذ {duree} دقيقة. "
            f"كيفاش نعاونك؟"
        )

    print(f"  🔊 Agent (CAS {cas_nc}) : {msg}")
    parler(msg)


    def on_texte(texte, result, pause):
        print(f"\n  🎤 Chauffeur : {texte}")
        rep = agent.repondre(texte)
        if rep:
            parler(rep)


    boucle_ecoute(_stream, SAMPLE_RATE, on_texte, _actif_appel, enreg)


    print(f"\n  📵 Appel terminé — {nom_chauffeur}")


    import datetime
    t_fin = datetime.datetime.now().isoformat()
    with _lock:
        if _surv and _surv.resultat_final:
            r = _surv.resultat_final
            _etat.update({
                "actif":      False,
                "etat_appel": r.get("etat", "ended"),
                "duree_s":    r.get("duree_s", 0),
                "t_debut":    r.get("t_debut"),
                "t_decroche": r.get("t_decroche"),
                "t_fin":      r.get("t_fin", t_fin),
            })
        else:
            _etat.update({
                "actif":      False,
                "etat_appel": "ended",
                "t_fin":      t_fin,
            })


    fichier_audio = enreg.sauvegarder()
    if fichier_audio:
        with _lock:
            _etat["chemin_audio"] = fichier_audio


    if agent.historique:
        agent.sauvegarder(fichier_audio=fichier_audio)

        # Reconstruire la conversation texte pour le rapport
        def _lancer_rapport(hist=list(agent.historique), sid=agent.session_id, cid=agent.camion_id):
            time.sleep(8)  # laisser Ollama se libérer complètement
            lignes = [
                f"Session: {sid} | Camion: {cid}",
                "=" * 50, ""
            ]
            for m in hist:
                role = "Chauffeur" if m["role"] == "user" else "Agent"
                lignes.append(f"[{role}] {m['content']}\n")
            conv_texte = "\n".join(lignes)
            generer_rapport_ollama(conv_texte, sid)

        threading.Thread(target=_lancer_rapport, daemon=True).start()


    if not _SESSION_APPEL_TERMINE[0]:
        log_session_appel("raccroche")


    # ── ✅ MARQUER LA DÉTECTION COMME TERMINÉE ────────────
    if detection_id:
        _marquer_appel_termine(detection_id, agent.session_id)


    # ── Nettoyage ─────────────────────────────────────────
    set_enregistreur_global(None)  # Nettoyer la référence globale
    raccrocher_adb()
    liberer_sco()
    _surv.arreter()


# ══════════════════════════════════════════════════════════════
#  DRAIN FILE NC — traite la file d'attente séquentiellement
# ══════════════════════════════════════════════════════════════
def _drainer_file_nc():
    """
    Traite les NC en file d'attente une par une.
    Pause de 5 secondes entre chaque appel.
    Lancé depuis _boucle_polling_bdd ou en fin d'appel.
    """
    print(f"  📋 Drain file NC démarré ({_file_nc.qsize()} en attente)")


    while not _file_nc.empty():
        # ── Vérifier qu'un appel n'est pas déjà en cours ──
        with _lock:
            if _etat["actif"]:
                print("  ⏳ Appel en cours — drain en pause")
                return  # le drain sera relancé quand l'appel finira


        try:
            row, detection_id = _file_nc.get_nowait()
        except queue.Empty:
            break


        camion_id = row.get("camion_id", "?")
        print(f"\n  {'═'*50}")
        print(f"  📋 Traitement NC file : camion={camion_id} "
              f"(reste: {_file_nc.qsize()})")
        print(f"  {'═'*50}")


        _executer_appel_auto(row, detection_id)


        # ── Pause entre les appels (laisser le téléphone respirer) ──
        if not _file_nc.empty():
            print(f"  ⏳ Pause 60s avant le prochain appel...")
            time.sleep(60)


    print("  ✅ File NC vidée — tous les appels traités")


# ══════════════════════════════════════════════════════════════
#  APPELS ENTRANTS — listener permanent
# ══════════════════════════════════════════════════════════════
def _boucle_appels_entrants():
    """
    Thread permanent : surveille les appels entrants via ADB.
    Quand un appel entrant est détecté :
      - Si un appel sortant est en cours → on attend
      - Sinon → on décroche et on traite
    PRIORITÉ : l'appel entrant est TOUJOURS traité.
    """
    etat_prec = 0
    print("  👂 Listener appels entrants démarré")


    while True:
        try:
            etat = get_call_state_adb()


            # ── Sonnerie détectée ────────────────────────
            if etat == 1 and etat_prec != 1:
                print("\n  📲 Appel ENTRANT détecté — sonnerie !")


                with _lock:
                    appel_sortant_actif = _etat["actif"]


                if appel_sortant_actif:
                    print("  ⚠️ Appel sortant actif → entrant prioritaire, "
                          "on attend fin du sortant...")
                    # Attendre que le sortant finisse (max 120s)
                    t_att = time.time()
                    while time.time() - t_att < 120:
                        with _lock:
                            if not _etat["actif"]:
                                break
                        time.sleep(1)


                # Décrocher après 8 secondes de sonnerie
                print("  ⏳ Attente 8s avant décrochage...")
                time.sleep(8)
                if get_call_state_adb() == 1:
                    decrocher_adb()


                # Attendre confirmation décrochage
                t_wait = time.time()
                while (time.time() - t_wait) < 15:
                    if get_call_state_adb() == 2:
                        print("  ✅ Appel entrant décroché !")
                        break
                    time.sleep(0.5)
                else:
                    print("  ⚠️ Délai décrochage dépassé")
                    etat_prec = etat
                    continue


            # ── Appel actif (décroché) sans être géré ──────
            elif etat == 2 and etat_prec != 2:
                with _lock:
                    deja_gere = _etat["actif"]


                if not deja_gere:
                    print("  🎙️ Appel entrant actif → traitement...")
                    _traiter_appel_entrant()
                    print("\n  👂 En attente du prochain appel entrant...\n")


            etat_prec = etat if etat != -1 else etat_prec


        except Exception as e:
            print(f"  ❌ Listener entrant : {e}")


        time.sleep(1.5)


def _valider_appel_entrant(numero: str) -> dict:
    """
    Vérifie que le numéro appelant correspond à un chauffeur
    avec un trajet aujourd'hui, et que l'heure actuelle est
    dans la fenêtre [VOYHRD - 30min ; VOYHRF + 30min].

    Conditions :
      1. SALTEL = numéro appelant
      2. VOYDTD = aujourd'hui
    3. heure_appel entre (VOYHRD - 30min) et (VOYHRF + 30min)

    Retourne un dict avec les infos chauffeur ou None si rejeté.
    """
    if not numero or len(numero) < 8:
        print("  ⚠️ Numéro appelant invalide ou vide")
        return None

    try:
        # Extraire les 8 derniers chiffres pour la comparaison
        num_net = "".join(c for c in numero if c.isdigit())[-8:]

        conn = connecter_bdd()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("""
            SELECT
                v."PLAMOTI"  AS camion_id,
                v."SALNOM"   AS nom_chauffeur,
                v."SALTEL"   AS tel,
                v."VOYDTD"   AS date_trajet,
                v."VOYHRD"   AS heure_depart,
                v."VOYHRF"   AS heure_arrivee,
                v."AFFCODE"  AS affectation
            FROM voyage_chauffeur v
            WHERE REPLACE(REPLACE(TRIM(TO_CHAR(v."SALTEL", '99999999')), ' ', ''), '+', '')
                  LIKE %s
              AND DATE(v."VOYDTD") = CURRENT_DATE
            ORDER BY v."VOYHRD" ASC
        """, (f"%{num_net}",))

        rows = cur.fetchall()
        conn.close()

        if not rows:
            print(f"  ❌ Numéro {numero} non trouvé dans voyage_chauffeur aujourd'hui")
            return None

        # ── Vérifier : heure appel entre VOYHRD-30min et VOYHRF+30min ──
        # VOYHRD/VOYHRF sont des bigint au format HHMM (ex: 800 = 08h00, 1730 = 17h30)
        import datetime
        maintenant = datetime.datetime.now()
        marge = datetime.timedelta(minutes=30)
        premiere_fenetre_log = None

        for row in rows:
            voyhrd_raw = row.get("heure_depart")
            voyhrf_raw = row.get("heure_arrivee")

            if voyhrd_raw is None or voyhrf_raw is None:
                continue

            try:
                dep_int = int(voyhrd_raw)
                fin_int = int(voyhrf_raw)
                h_dep, m_dep = dep_int // 100, dep_int % 100
                h_fin, m_fin = fin_int // 100, fin_int % 100
                if not (0 <= h_dep <= 23 and 0 <= m_dep <= 59 and 0 <= h_fin <= 23 and 0 <= m_fin <= 59):
                    continue
            except Exception:
                continue

            dt_depart = maintenant.replace(hour=h_dep, minute=m_dep, second=0, microsecond=0)
            dt_fin = maintenant.replace(hour=h_fin, minute=m_fin, second=0, microsecond=0)
            if dt_fin < dt_depart:
                dt_fin += datetime.timedelta(days=1)

            borne_inf_dt = dt_depart - marge
            borne_sup_dt = dt_fin + marge

            if premiere_fenetre_log is None:
                premiere_fenetre_log = (
                    f"maintenant={maintenant.strftime('%H:%M')} "
                    f"VOYHRD={h_dep:02d}:{m_dep:02d} "
                    f"VOYHRF={h_fin:02d}:{m_fin:02d} "
                    f"fenêtre=[{borne_inf_dt.strftime('%H:%M')}→{borne_sup_dt.strftime('%H:%M')}]"
                )

            if borne_inf_dt <= maintenant <= borne_sup_dt:
                print(f"  ✅ Chauffeur en trajet : {row['nom_chauffeur']} "
                      f"camion={row['camion_id']} "
                      f"VOYHRD={h_dep:02d}:{m_dep:02d} "
                      f"VOYHRF={h_fin:02d}:{m_fin:02d} "
                      f"(fenêtre {borne_inf_dt.strftime('%H:%M')}→{borne_sup_dt.strftime('%H:%M')})")
                return dict(row)

        print(f"  ❌ Appel hors fenêtre VOYHRD/VOYHRF ± 30min : {premiere_fenetre_log or 'fenêtre indisponible'}")
        return None

    except Exception as e:
        print(f"  ❌ _valider_appel_entrant : {e}")
        return None


def _inserer_historique_entrant(session_id: str, info_chauffeur: dict, numero: str):
    """Insère l'appel entrant dans historique_appels."""
    try:
        import datetime
        conn = connecter_bdd()
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO historique_appels (
                session_id, source_table, source_id, type_nc,
                camion_id, nom_chauffeur, numero_tel,
                statut, etat_appel, mode_appel,
                ts_detection, date_appel
            ) VALUES (
                %s, 'appel_entrant', %s, 'appel_entrant',
                %s, %s, %s,
                'en_cours', 'active', 'incoming',
                NOW(), NOW()
            )
            RETURNING id
        """, (
            session_id,
            f"incoming_{session_id}",
            info_chauffeur.get("camion_id", "ENTRANT"),
            info_chauffeur.get("nom_chauffeur", "Chauffeur"),
            numero,
        ))
        detection_id = cur.fetchone()[0]
        conn.commit()
        conn.close()
        print(f"  ✅ historique_appels ← appel entrant id={detection_id}")
        return detection_id
    except Exception as e:
        print(f"  ⚠️ _inserer_historique_entrant : {e}")
        return None


def _traiter_appel_entrant():
    """
    Traite un appel entrant déjà décroché.
    1. Récupère le numéro de l'appelant via ADB
    2. Valide contre voyage_chauffeur (trajet actif + horaire)
    3. Si rejeté → raccroche
    4. Si accepté → traite avec Whisper+Ollama et stocke en BDD
    """
    global _surv, _actif_appel


    # ── Basculement audio BT (drain buffer pendant l'attente) ──
    chunk_size_rec = int(SAMPLE_RATE * CHUNK_MS / 1000)
    for tentative in range(BT_FORCE_RETRIES):
        sequence_basculement()
        t_drain = time.time()
        while time.time() - t_drain < 0.5:
            try:
                _stream.read(chunk_size_rec, exception_on_overflow=False)
            except:
                time.sleep(0.01)
        if get_call_state_adb() == 2:
            print(f"  ✅ Basculement OK ({tentative+1})")
            break


    # ── 1. Récupérer le numéro de l'appelant ──────────────
    numero = get_caller_number_adb()
    print(f"  📞 Numéro appelant : {numero or 'NON DÉTECTÉ'}")


    # ── 2. Valider le chauffeur (trajet actif) ────────────
    info_chauffeur = _valider_appel_entrant(numero)

    if not info_chauffeur:
        print("  🚫 Appel entrant REJETÉ — pas de trajet actif")
        parler("عذراً، هذا الرقم غير مسجل في رحلة اليوم. بالسلامة.")
        time.sleep(3)
        raccrocher_adb()
        with _lock:
            _etat["actif"] = False
            _etat["etat_appel"] = "idle"
        return


    # ── 3. Préparer l'appel avec les infos chauffeur ──────
    camion_id     = info_chauffeur.get("camion_id", "ENTRANT")
    nom_chauffeur = info_chauffeur.get("nom_chauffeur", "Chauffeur")

    agent = AgentOllama(camion_id)
    enreg = EnregistreurWAV(agent.session_id)
    set_enregistreur_global(enreg)  # Permettre à parler() d'injecter le TTS
    _surv = SurveilleAppel("incoming", camion_id, agent.session_id)

    # Insérer dans historique_appels
    detection_id = _inserer_historique_entrant(agent.session_id, info_chauffeur, numero)

    import datetime
    with _lock:
        _etat.update({
            "actif":          True,
            "etat_appel":     "active",
            "camion_id":      camion_id,
            "session_id":     agent.session_id,
            "nom_chauffeur":  nom_chauffeur,
            "numero_tel":     numero,
            "type_nc":        "appel_entrant",
            "duree_nc_min":   0,
            "t_debut":        datetime.datetime.now().isoformat(),
            "t_decroche":     datetime.datetime.now().isoformat(),
            "t_fin":          None,
            "duree_s":        0,
            "historique":     [],
            "nb_tours":       0,
            "chemin_audio":   "",
        })


    demarrer_session_appel(agent.session_id, numero, camion_id)
    _surv.demarrer()


    _actif_appel = [True]
    threading.Thread(
        target=surveiller_fin_appel, args=(_actif_appel,), daemon=True
    ).start()


    def _surveiller_surv():
        while _actif_appel[0]:
            time.sleep(2)
            if not _surv._actif:
                _actif_appel[0] = False
                break
    threading.Thread(target=_surveiller_surv, daemon=True).start()


    def _sync_etat():
        while _actif_appel[0]:
            time.sleep(1)
            with _lock:
                etat_obj = getattr(_surv, "_etat", None)
                if etat_obj:
                    etat_name = (etat_obj.name.lower()
                                 if hasattr(etat_obj, "name")
                                 else str(etat_obj).lower())
                    _etat["etat_appel"] = etat_name
                _etat["duree_s"]    = _surv.duree_en_cours()
                _etat["historique"] = list(agent.historique)
                _etat["nb_tours"]   = len(agent.historique) // 2
    threading.Thread(target=_sync_etat, daemon=True).start()


    # Message d'accueil personnalisé
    parler(f"أهلاً {nom_chauffeur}، أنا المساعد الآلي. كيفاش نعاونك؟")


    def on_texte(texte, result, pause):
        print(f"\n  🎤 {nom_chauffeur} (entrant) : {texte}")
        rep = agent.repondre(texte)
        if rep:
            parler(rep)


    boucle_ecoute(_stream, SAMPLE_RATE, on_texte, _actif_appel, enreg)


    # ── Fin appel entrant ─────────────────────────────────
    print(f"\n  📵 Appel entrant terminé — {nom_chauffeur}")


    import datetime
    t_fin = datetime.datetime.now().isoformat()
    with _lock:
        if _surv and _surv.resultat_final:
            r = _surv.resultat_final
            _etat.update({
                "actif":      False,
                "etat_appel": r.get("etat", "ended"),
                "duree_s":    r.get("duree_s", 0),
                "t_fin":      r.get("t_fin", t_fin),
            })
        else:
            _etat.update({
                "actif":      False,
                "etat_appel": "ended",
                "t_fin":      t_fin,
            })


    fichier_audio = enreg.sauvegarder()
    if fichier_audio:
        with _lock:
            _etat["chemin_audio"] = fichier_audio


    if agent.historique:
        agent.sauvegarder(fichier_audio=fichier_audio)
        def _lancer_rapport(hist=list(agent.historique), sid=agent.session_id, cid=agent.camion_id):
            time.sleep(8)
            lignes = [f"Session: {sid} | Camion: {cid}", "=" * 50, ""]
            for m in hist:
                role = "Chauffeur" if m["role"] == "user" else "Agent"
                lignes.append(f"[{role}] {m['content']}\n")
            generer_rapport_ollama("\n".join(lignes), sid)
        threading.Thread(target=_lancer_rapport, daemon=True).start()


    log_session_appel("raccroche")

    # ── Marquer terminé dans historique_appels ─────────────
    if detection_id:
        _marquer_appel_termine(detection_id, agent.session_id)

    set_enregistreur_global(None)  # Nettoyer la référence globale
    liberer_sco()
    _surv.arreter()


    # ── Si des NC en attente → relancer le drain ──────────
    if not _file_nc.empty():
        print(f"  📋 {_file_nc.qsize()} NC en attente → drain relancé")
        time.sleep(5)
        threading.Thread(target=_drainer_file_nc, daemon=True).start()


# ══════════════════════════════════════════════════════════════
#  RÉCUPÉRATION NC EN ATTENTE AU DÉMARRAGE
# ══════════════════════════════════════════════════════════════
def _recuperer_nc_en_attente():
    """
    Au démarrage de api_agent.py, récupère les NC avec
    statut='nouveau' dans historique_appels (non traitées).
    Les ajoute à _file_nc puis lance le drain.
    """
    try:
        conn = connecter_bdd()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("""
            SELECT id, source_table, source_id, type_nc,
                   camion_id, nom_chauffeur, numero_tel,
                   COALESCE(duree_nc_min, 0) AS duree_min
            FROM historique_appels
            WHERE statut = 'nouveau'
              AND ts_detection >= CURRENT_DATE
            ORDER BY ts_detection ASC
        """)
        rows = cur.fetchall()
        conn.close()


        if not rows:
            print("  ✅ Aucune NC en attente au démarrage")
            return


        print(f"  🔄 {len(rows)} NC en attente trouvées au démarrage → file")
        for row in rows:
            _file_nc.put((dict(row), row["id"]))


        # Lancer le drain dans un thread
        threading.Thread(target=_drainer_file_nc, daemon=True).start()


    except Exception as e:
        print(f"  ❌ Récupération NC : {e}")


# ══════════════════════════════════════════════════════════════
#  DÉMARRAGE FASTAPI
# ══════════════════════════════════════════════════════════════
@app.on_event("startup")
def startup():
    """
    Exécuté une seule fois au démarrage.
    1. Charge Whisper
    2. Ouvre le stream audio CABLE Output
    3. Lance le thread polling BDD
    4. Récupère les NC en attente (statut='nouveau') depuis la BDD
    5. Lance le listener appels entrants
    """
    global _stream


    print("\n  ═══════════════════════════════════════════")
    print("  api_agent.py — Démarrage (version Whisper)")
    print("  ═══════════════════════════════════════════\n")


    # ── 1. Charger Whisper ───────────────────────────────────
    # ⚠️ Remplace init_vosk()
    init_whisper()


    # ── 2. Choisir la sortie audio (CABLE Input pour TTS) ────
    choisir_sortie_audio()


    # ── 3. Ouvrir le stream d'entrée (CABLE Output) ──────────
    pa = pyaudio.PyAudio()
    vm_idx = 0
    for i in range(pa.get_device_count()):
        info = pa.get_device_info_by_index(i)
        if (info.get("maxInputChannels", 0) > 0 and
                FORCE_INPUT_NAME_SUBSTR.lower() in info["name"].lower()):
            vm_idx = i
            print(f"  ✅ Micro : [{i}] {info['name']}")
            break


    info    = pa.get_device_info_by_index(vm_idx)
    # ⚠️ On utilise SAMPLE_RATE (16000) et non vm_rate
    # car Whisper fonctionne en 16kHz
    cs = int(SAMPLE_RATE * CHUNK_MS / 1000)
    try:
        _stream = pa.open(
            format=pyaudio.paInt16,
            channels=1,
            rate=SAMPLE_RATE,        # ⚠️ SAMPLE_RATE au lieu de vm_rate
            input=True,
            input_device_index=vm_idx,
            frames_per_buffer=cs,
        )
        print(f"  ✅ Stream audio {SAMPLE_RATE}Hz\n")
    except Exception as e:
        # Fallback sur le taux natif du périphérique
        vm_rate = int(info["defaultSampleRate"])
        cs = int(vm_rate * CHUNK_MS / 1000)
        _stream = pa.open(
            format=pyaudio.paInt16, channels=1, rate=vm_rate,
            input=True, input_device_index=vm_idx, frames_per_buffer=cs,
        )
        print(f"  ✅ Stream audio {vm_rate}Hz (fallback)\n")


    # ── 4. Lancer le thread de polling BDD ───────────────────
    threading.Thread(target=_boucle_polling_bdd, daemon=True).start()
    print("  ✅ Polling BDD démarré")


    # ── 5. Récupérer les NC en attente (statut='nouveau') ────
    #   → Si api_agent a été redémarré, les NC non traitées
    #     sont remises dans la file et traitées automatiquement
    _recuperer_nc_en_attente()
    print("  ✅ Récupération NC terminée")


    # ── 6. Lancer le listener appels entrants ────────────────
    #   → Surveille en permanence les appels entrants via ADB
    #   → Décroche automatiquement et traite avec Whisper+Ollama
    threading.Thread(target=_boucle_appels_entrants, daemon=True).start()
    print("  ✅ Listener appels entrants démarré")


    print("\n  ═══════════════════════════════════════════")
    print("  ✅ TOUS LES SERVICES DÉMARRÉS")
    print("     • Whisper chargé")
    print("     • Polling BDD (30s)")
    print("     • Récupération NC en attente")
    print("     • Listener appels entrants")
    print("  ═══════════════════════════════════════════\n")




# ══════════════════════════════════════════════════════════════
#  ROUTES HTTP — appelées par Next.js
# ══════════════════════════════════════════════════════════════
class LancerBody(BaseModel):
    camion_id: str
    numero:    str  = ""           # Vide pour appel entrant
    mode:      str  = "outgoing"   # "outgoing" ou "incoming"




@app.post("/appel/lancer")
def route_lancer_appel(body: LancerBody):
    """
    Lance un appel — mode sortant OU entrant.

    Mode SORTANT (outgoing) — l'agent appelle le chauffeur :
      fetch('/appel/lancer', {
        method: 'POST',
        body: JSON.stringify({
          camion_id: 'CAM-001',
          numero: '+21692025375',
          mode: 'outgoing'
        })
      })

    Mode ENTRANT (incoming) — active le décrochage auto :
      fetch('/appel/lancer', {
        method: 'POST',
        body: JSON.stringify({
          camion_id: 'ENTRANT',
          mode: 'incoming'
        })
      })
    """
    with _lock:
        if _etat["actif"]:
            return {
                "ok":      False,
                "message": "Appel déjà actif",
                "session_id": _etat["session_id"],
            }


    # ══════════════════════════════════════════════════════
    #  MODE SORTANT — l'agent appelle le chauffeur
    # ══════════════════════════════════════════════════════
    if body.mode == "outgoing":
        if not body.numero:
            return {"ok": False, "message": "Numéro requis pour un appel sortant"}

        row = {
            "id":            "manuel",
            "camion_id":     body.camion_id,
            "numero_tel":    body.numero,
            "nom_chauffeur": "—",
            "type_nc":       "manuel",
            "duree_min":     0,
        }
        _file_nc.put((row, None))
        threading.Thread(target=_drainer_file_nc, daemon=True).start()
        time.sleep(0.5)

        with _lock:
            return {
                "ok":         True,
                "mode":       "outgoing",
                "session_id": _etat["session_id"],
            }


    # ══════════════════════════════════════════════════════
    #  MODE ENTRANT — attente + décrochage automatique
    # ══════════════════════════════════════════════════════
    elif body.mode == "incoming":
        def _attendre_et_traiter():
            """Attend un appel entrant (RINGING/ACTIVE) puis traite."""
            print("\n  👂 Mode entrant activé — attente appel...")
            t_att = time.time()
            while time.time() - t_att < 120:
                etat_tel = get_call_state_adb()

                if etat_tel == 1:
                    # Sonnerie → décrocher
                    print("  📲 Appel entrant en sonnerie → décrochage...")
                    time.sleep(2)
                    decrocher_adb()
                    # Attendre confirmation
                    t_wait = time.time()
                    while (time.time() - t_wait) < 15:
                        if get_call_state_adb() == 2:
                            break
                        time.sleep(0.5)
                    _traiter_appel_entrant()
                    return

                elif etat_tel == 2:
                    # Déjà décroché → traiter directement
                    print("  ✅ Appel entrant déjà actif → traitement...")
                    _traiter_appel_entrant()
                    return

                time.sleep(1.5)

            print("  ⏰ Timeout 120s — aucun appel entrant reçu")
            with _lock:
                _etat["actif"] = False
                _etat["etat_appel"] = "idle"

        # Marquer l'état en attente immédiatement
        import datetime
        with _lock:
            _etat.update({
                "actif":         True,
                "etat_appel":    "waiting_incoming",
                "camion_id":     body.camion_id or "ENTRANT",
                "session_id":    "",
                "nom_chauffeur": "En attente...",
                "numero_tel":    "entrant",
                "type_nc":       "appel_entrant",
                "t_debut":       datetime.datetime.now().isoformat(),
            })

        threading.Thread(target=_attendre_et_traiter, daemon=True).start()
        return {
            "ok":         True,
            "mode":       "incoming",
            "message":    "En attente d'appel entrant (120s max)",
        }


    else:
        return {
            "ok":      False,
            "message": f"Mode inconnu: {body.mode}. Utilisez 'outgoing' ou 'incoming'.",
        }




@app.get("/appel/etat")
def route_get_etat():
    """
    Next.js → lit l'état courant (sans WebSocket).
    Utile au premier chargement de la page.
    """
    with _lock:
        return dict(_etat)




@app.post("/appel/raccrocher")
def route_raccrocher():
    """
    Next.js → force la fin de l'appel.
    Met actif[0] = False → boucle_ecoute s'arrête.
    """
    global _actif_appel
    # ⚠️ Arrêter boucle_ecoute via la liste [bool]
    _actif_appel[0] = False


    if _surv:
        _surv.arreter()
    raccrocher_adb()
    liberer_sco()


    with _lock:
        _etat["actif"]     = False
        _etat["etat_appel"] = "ended"


    return {"ok": True}




@app.get("/appel/audio")
def route_get_audio(session_id: str = None):
    """
    Next.js → stream le WAV pour lecteur audio.
    Usage : <audio src="http://localhost:4000/appel/audio?session_id=xxx" />
    Si session_id est fourni, on sert le fichier audio spécifique à cette session.
    Sinon, on sert OUTPUT_WAV (appel en cours / dernier appel).
    """
    audio_path = None

    # 1. Chercher le fichier audio spécifique à la session dans la BDD
    if session_id:
        try:
            conn = connecter_bdd()
            cur = conn.cursor()
            cur.execute(
                "SELECT fichier_audio FROM conversations_appels WHERE session_id=%s",
                (session_id,)
            )
            row = cur.fetchone()
            conn.close()
            if row and row[0]:
                candidate = row[0].strip()
                if os.path.exists(candidate):
                    audio_path = candidate
        except Exception as e:
            print(f"⚠️ Erreur lookup audio session {session_id}: {e}")

    # 2. Fallback sur OUTPUT_WAV
    if not audio_path and os.path.exists(OUTPUT_WAV):
        audio_path = OUTPUT_WAV

    if not audio_path or not os.path.exists(audio_path):
        return {"ok": False, "message": "Pas de fichier audio"}

    return FileResponse(
        audio_path,
        media_type="audio/wav",
        headers={
            "Content-Disposition": f"inline; filename={os.path.basename(audio_path)}",
            "Accept-Ranges": "bytes",
        },
    )




@app.get("/historique")
def route_historique(limit: int = 20, camion_id: str = None):
    """
    Next.js → liste des appels depuis historique_appels (BDD).
    Les données sont déjà stockées par SurveilleAppel et AgentOllama.
    """
    try:
        conn = connecter_bdd()
        cur  = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        if camion_id:
            cur.execute("""
                SELECT * FROM historique_appels
                WHERE camion_id = %s
                ORDER BY date_appel DESC LIMIT %s
            """, (camion_id, limit))
        else:
            cur.execute("""
                SELECT * FROM historique_appels
                ORDER BY date_appel DESC LIMIT %s
            """, (limit,))
        rows = cur.fetchall()
        conn.close()
        return {"total": len(rows), "appels": [dict(r) for r in rows]}
    except Exception as e:
        return {"error": str(e)}




@app.get("/conversations/{session_id}")
def route_conversation(session_id: str):
    """
    Next.js → détail d'une conversation (depuis conversations_appels).
    Stockée automatiquement par AgentOllama.sauvegarder().
    """
    try:
        conn = connecter_bdd()
        cur  = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)


        # Conversation complète (JOIN historique_appels pour duree_s et date_appel)
        cur.execute("""
            SELECT c.*, h.duree_s, h.date_appel
            FROM conversations_appels c
            LEFT JOIN historique_appels h ON h.session_id = c.session_id
            WHERE c.session_id=%s
        """, (session_id,))
        conv = cur.fetchone()
        
        if conv:
            conv = dict(conv)
            cur.execute("""
                SELECT source_table, source_id, source_table_2, source_id_2, type_nc
                FROM historique_appels
                WHERE session_id=%s
                ORDER BY ts_detection DESC
                LIMIT 1
            """, (session_id,))
            hist_row = cur.fetchone()

            def _etat_from_source(table: str, sid: str):
                if not table or not sid:
                    return None
                parts = sid.split("|", 1) if "|" in sid else []
                if table == "voyage_tracking_stops" and len(parts) == 2:
                    cur.execute("""
                        SELECT etat FROM voyage_tracking_stops
                        WHERE camion = %s AND beginstoptime = %s::timestamptz
                        LIMIT 1
                    """, (parts[0], parts[1]))
                elif table == "voyagetracking_port_ouvert" and len(parts) == 2:
                    cur.execute("""
                        SELECT etat FROM voyagetracking_port_ouvert
                        WHERE camion = %s AND date_ouverture = %s::timestamptz
                        LIMIT 1
                    """, (parts[0], parts[1]))
                elif table == "voyage_tracking_stops":
                    cur.execute("""
                        SELECT etat FROM voyage_tracking_stops
                        WHERE ctid = %s::tid
                        LIMIT 1
                    """, (sid,))
                elif table == "voyagetracking_port_ouvert":
                    cur.execute("""
                        SELECT etat FROM voyagetracking_port_ouvert
                        WHERE ctid = %s::tid
                        LIMIT 1
                    """, (sid,))
                else:
                    return None
                row = cur.fetchone()
                return row.get("etat") if row else None

            def _is_conforme(table: str, sid: str):
                etat = _etat_from_source(table, sid)
                if etat is None:
                    return None
                return etat == "conforme"

            if hist_row:
                if hist_row.get("type_nc"):
                    conv["type_nc"] = hist_row["type_nc"]

                primary_ok = _is_conforme(hist_row.get("source_table"), hist_row.get("source_id"))
                secondary_ok = _is_conforme(hist_row.get("source_table_2"), hist_row.get("source_id_2"))

                if primary_ok is None and secondary_ok is None:
                    conv["validation_status"] = "inconnu"
                    conv["validation_conforme"] = None
                elif primary_ok is True and (secondary_ok is None or secondary_ok is True):
                    conv["validation_status"] = "valide"
                    conv["validation_conforme"] = True
                else:
                    conv["validation_status"] = "non_valide"
                    conv["validation_conforme"] = False
            else:
                conv["validation_status"] = "inconnu"
                conv["validation_conforme"] = None


        # Messages individuels
        cur.execute("""
            SELECT tour, role, contenu, horodatage
            FROM messages_appels
            WHERE session_id=%s ORDER BY tour, id
        """, (session_id,))
        messages = cur.fetchall()
        conn.close()


        if not conv:
            raise HTTPException(404, f"Session {session_id} introuvable")

        return {
            "conversation": dict(conv),
            "messages":     [dict(m) for m in messages],
        }
    except HTTPException:
        raise
    except Exception as e:
        return {"error": str(e)}




@app.get("/rapports")
def liste_rapports(limit: int = 20, camion_id: str = None):
    """
    Liste tous les rapports générés avec résumé.
    """
    try:
        conn = connecter_bdd()
        cur  = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)


        if camion_id:
            cur.execute("""
                SELECT c.session_id, c.camion_id, h.duree_s, c.nb_tours,
                       h.date_appel, c.rapport
                FROM conversations_appels c
                LEFT JOIN historique_appels h ON h.session_id = c.session_id
                WHERE c.rapport IS NOT NULL
                  AND c.camion_id = %s
                ORDER BY h.date_appel DESC LIMIT %s
            """, (camion_id, limit))
        else:
            cur.execute("""
                SELECT c.session_id, c.camion_id, h.duree_s, c.nb_tours,
                       h.date_appel, c.rapport
                FROM conversations_appels c
                LEFT JOIN historique_appels h ON h.session_id = c.session_id
                WHERE c.rapport IS NOT NULL
                ORDER BY h.date_appel DESC LIMIT %s
            """, (limit,))


        rows = cur.fetchall()
        conn.close()
        return {"total": len(rows), "rapports": [dict(r) for r in rows]}


    except Exception as e:
        return {"error": str(e)}




@app.get("/appels/par-source")
def route_appels_par_source(date: str = None):
    """
    Retourne les appels indexés par camion+date pour que les pages
    arrêts et ouverture-porte puissent afficher si un appel a été lancé.
    """
    try:
        conn = connecter_bdd()
        cur  = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        if date:
            cur.execute("""
                SELECT id, camion_id, session_id, type_nc,
                       source_table, source_id, source_table_2, source_id_2,
                       date_appel, ts_detection, statut, etat_appel
                FROM historique_appels
                WHERE DATE(COALESCE(ts_detection, date_appel)) = %s
                ORDER BY date_appel DESC
            """, (date,))
        else:
            cur.execute("""
                SELECT id, camion_id, session_id, type_nc,
                       source_table, source_id, source_table_2, source_id_2,
                       date_appel, ts_detection, statut, etat_appel
                FROM historique_appels
                WHERE DATE(COALESCE(ts_detection, date_appel)) >= CURRENT_DATE - 30
                ORDER BY date_appel DESC
            """)
        rows = cur.fetchall()
        conn.close()
        return {"appels": [dict(r) for r in rows]}
    except Exception as e:
        return {"error": str(e), "appels": []}


@app.get("/health")
def route_health():
    db_ok = True
    try:
        conn = connecter_bdd(); conn.close()
    except Exception:
        db_ok = False
    with _lock:
        return {
            "status":       "ok" if db_ok else "degraded",
            "db":           "ok" if db_ok else "error",
            "appel_actif":  _etat["actif"],
            "etat_appel":   _etat["etat_appel"],
            "whisper":      "chargé",
        }
@app.post("/conversations/{session_id}/validation")
def route_validation_conversation(session_id: str):
    """
    Bouton "Confirmer" sur la page session.
    1. Retrouve source_table + source_id depuis historique_appels
    2. Met etat = 'conforme' dans voyage_tracking_stops et voyagetracking_port_ouvert ou dans voyage_tracking_stops  seullment selon les cas 
    """
    try:
        conn = connecter_bdd()
        cur  = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        # ── 1. Retrouver la détection NC liée à cette session ──
        cur.execute("""
            SELECT id, source_table, source_id, source_table_2, source_id_2, statut
            FROM historique_appels
            WHERE session_id   = %s
              AND source_table IS NOT NULL
            ORDER BY ts_detection DESC
            LIMIT 1
        """, (session_id,))
        row = cur.fetchone()

        if not row:
            conn.close()
            print(f"  ⚠️ Validation: aucune NC pour session {session_id}")
            return {
                "ok":    False,
                "error": f"Aucune détection NC pour session {session_id}",
                "updated": {
                    "voyage_tracking_stops":      0,
                    "voyagetracking_port_ouvert": 0,
                },
            }

        detection_id   = row["id"]
        source_table   = row["source_table"]
        source_id      = row["source_id"]
        source_table_2 = row.get("source_table_2")
        source_id_2    = row.get("source_id_2")
        cur2 = conn.cursor()

        # ── 2. Mettre à jour la/les table(s) source ───────────────
        #  source_id format : "camion|timestamp" (stable) ou "(page,row)" (legacy ctid)
        stops_updated  = 0
        portes_updated = 0

        def _update_etat_conforme(cur_u, table, sid):
            """Update etat→conforme avec clé stable camion|timestamp, fallback ctid."""
            parts = sid.split("|", 1) if sid and "|" in sid else []
            if table == "voyage_tracking_stops" and len(parts) == 2:
                cur_u.execute("""
                    UPDATE voyage_tracking_stops
                    SET etat = 'conforme'
                    WHERE camion = %s
                      AND beginstoptime = %s::timestamptz
                      AND etat = 'non_conforme'
                """, (parts[0], parts[1]))
            elif table == "voyagetracking_port_ouvert" and len(parts) == 2:
                cur_u.execute("""
                    UPDATE voyagetracking_port_ouvert
                    SET etat = 'conforme'
                    WHERE camion = %s
                      AND date_ouverture = %s::timestamptz
                      AND etat = 'non_conforme'
                """, (parts[0], parts[1]))
            elif table == "voyage_tracking_stops":
                cur_u.execute("""
                    UPDATE voyage_tracking_stops
                    SET etat = 'conforme'
                    WHERE ctid = %s::tid
                      AND etat = 'non_conforme'
                """, (sid,))
            elif table == "voyagetracking_port_ouvert":
                cur_u.execute("""
                    UPDATE voyagetracking_port_ouvert
                    SET etat = 'conforme'
                    WHERE ctid = %s::tid
                      AND etat = 'non_conforme'
                """, (sid,))
            else:
                return 0
            return cur_u.rowcount

        # Source 1
        if source_table == "voyage_tracking_stops":
            stops_updated = _update_etat_conforme(cur2, source_table, source_id)
        elif source_table == "voyagetracking_port_ouvert":
            portes_updated = _update_etat_conforme(cur2, source_table, source_id)

        # Source 2 : voyagetracking_port_ouvert (CAS 2 uniquement)
        if source_table_2 == "voyagetracking_port_ouvert" and source_id_2:
            portes_updated += _update_etat_conforme(cur2, source_table_2, source_id_2)

        conn.commit()
        conn.close()

        # ── 4. Mettre à jour _etat global (WebSocket live) ─────
        with _lock:
            if _etat.get("session_id") == session_id:
                _etat["nc_confirmee"] = True

        total = stops_updated + portes_updated
        print(f"  ✅ Validation humaine — session={session_id} "
              f"table={source_table} source_id={source_id} "
              f"rows={total} (stops={stops_updated}, portes={portes_updated})")

        return {
            "ok": True,
            "updated": {
                "voyage_tracking_stops":      stops_updated,
                "voyagetracking_port_ouvert": portes_updated,
            },
        }

    except Exception as e:
        print(f"  ❌ /conversations/{session_id}/validation : {e}")
        return {
            "ok":    False,
            "error": str(e),
            "updated": {
                "voyage_tracking_stops":      0,
                "voyagetracking_port_ouvert": 0,
            },
        }
# ══════════════════════════════════════════════════════════════
#  WEBSOCKET /ws/etat
#
#  RÔLE :
#  Connexion permanente → FastAPI pousse _etat toutes les 1s.
#  Next.js reçoit sans demander.
#
#  CE QUE NEXT.JS REÇOIT (exemple pendant un appel) :
#  {
#    "actif": true,
#    "etat_appel": "active",
#    "nom_chauffeur": "Ahmed Ben Ali",   ← SALNOM
#    "numero_tel": "+21692025375",       ← SALTEL
#    "type_nc": "arret_non_prevu",
#    "duree_nc_min": 25,
#    "duree_s": 47,
#    "historique": [
#      {"role": "assistant", "content": "أهلاً Ahmed..."},
#      {"role": "user",      "content": "panne في الكاميون"}
#    ],
#    "nb_tours": 1
#  }
# ══════════════════════════════════════════════════════════════
@app.websocket("/ws/etat")
async def ws_etat(websocket: WebSocket):
    await websocket.accept()
    print("  🔌 WebSocket connecté")
    try:
        while True:
            with _lock:
                payload = dict(_etat)
            await websocket.send_json(payload)
            await asyncio.sleep(1)
    except Exception:
        print("  🔌 WebSocket déconnecté")