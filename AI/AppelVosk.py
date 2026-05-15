 

#!C:/Users/Admin/AppData/Local/Programs/Python/Python310/python.exe
# ⚠️ LANCER AVEC : C:\Users\Admin\AppData\Local\Programs\Python\Python310\python.exe test_whisper_realtime.py
"""
AGENT IA WHISPER — Pipeline simplifié (Whisper remplace Vosk)
═══════════════════════════════════════════════════════════════
Modes :
  [1] Fichier WAV       — transcrit un fichier existant
  [2] Micro temps réel  — VAD + Whisper segment par segment
  [3] Agent appelle     — ADB + Bluetooth + Whisper + Ollama + TTS
  [4] Chauffeur appelle — attente appel entrant + traitement auto
  [5] Benchmark         — mesure vitesse d'inférence

Fonctionnalités portées de AppelCall.py :
  ✅ Connexion DESKTOP-24V22SD (Bluetooth SCO + UIAutomator)
  ✅ Stockage état appel dans historique_appels (BDD PostgreSQL)
  ✅ Stockage conversation texte dans conversations_appels (BDD)
  ✅ Stockage messages individuels dans messages_appels (BDD)
  ✅ Stockage chemin audio WAV dans conversations_appels (BDD)
  ✅ Sauvegarde conversation dans OUTPUT_FILE (fichier texte)
  ✅ Session tracking (_InfoSession + JSONL)
  ✅ Surveillance fin d'appel via ADB telephony.registry
"""


import sys, os, time, struct, threading, wave, tempfile, re
import subprocess, uuid, json, asyncio
import numpy as np
from datetime import datetime, timedelta


# ══════════════════════════════════════════════════════════════
#  CONFIGURATION
# ══════════════════════════════════════════════════════════════
WHISPER_MODEL       = "medium"
WHISPER_DEVICE      = "cuda"
WHISPER_COMPUTE     = "float16"
WHISPER_LANGUAGE    = "ar"
WHISPER_BEAM_SIZE   = 5


SAMPLE_RATE         = 16000
CHUNK_MS            = 20
FORCE_INPUT_NAME_SUBSTR  = "cable output"
FORCE_OUTPUT_NAME_SUBSTR = "cable input"


VAD_AGGRESSIVENESS     = 2
SILENCE_AFTER_SPEECH_S = 1.2
SILENCE_RMS_THRESHOLD  = 250
VAD_RMS_FALLBACK       = 280


NUMERO_CHAUFFEUR    = "+21692025375"
TTS_VOICE           = "ar-SA-ZariyahNeural"
TTS_RATE            = "+10%"
TTS_VOLUME          = "+100%"
TTS_VOLUME_FACTOR   = 2.5
TTS_SILENCE_DEBUT_S = 1.5
TTS_SILENCE_FIN_S   = 0.8
DELAI_AVANT_CLIC_S  = 18


OLLAMA_URL          = "http://localhost:11434/api/chat"
OLLAMA_MODEL        = "qwen2.5:3b"
OUTPUT_FILE         = r"C:\Users\Admin\Downloads\transcription_appel.txt"
OUTPUT_WAV          = r"C:\Users\Admin\Downloads\conversation_whisper.wav"
OUTPUT_WAV_DIR      = r"C:\Users\Admin\Downloads\appels_audio"
OUTPUT_DIAG_LOG     = r"C:\Users\Admin\Downloads\diag_whisper.jsonl"
SESSION_LOG_PATH    = r"C:\Users\Admin\Downloads\sessions_appel.jsonl"


# Coordonnées du bouton DESKTOP-24V22SD dans le menu BT pendant l'appel
# (Redmi 12 - résolution 1080x2400)
BT_TAP_X            = 540
BT_TAP_Y            = 380
BT_DEVICE_NAME      = "DESKTOP-24V22SD"
BT_FORCE_ON_CALL    = True
BT_FORCE_RETRIES    = 5


DB_HOST = "localhost"; DB_PORT = 5432
DB_NAME = "tracking"; DB_USER = "postgres"; DB_PASSWORD = "12345"


SYSTEM_PROMPT = """أنت مساعد هاتفي للسائق في شركة نقل.
تتحدث باللهجة التونسية فقط. ردك دايماً قصير: جملة أو جملتين.
دورك الوحيد: أسئلة الوقود والأعطال.
- كم لتر يضيف
- أين أقرب محطة توتال
- تحذير إذا تجاوز هدف الاستهلاك
لا فرنسية. تونسي دارجة فقط."""


SYSTEM_PROMPT_RAPPORT = """Tu es un analyste de transport logistique.
À partir d'une conversation entre un agent IA et un chauffeur de camion,
génère un rapport structuré en français.

Le rapport doit contenir exactement ces sections :
1. RÉSUMÉ : 2-3 phrases résumant la situation
2. PROBLÈME SIGNALÉ : Le problème ou la situation décrite par le chauffeur
3. CAUSE IDENTIFIÉE : La cause probable selon les propos du chauffeur (panne, ravitaillement, pause, vol de carburant, erreur capteur, etc.)
4. RÉPONSE AGENT : Ce que l'agent IA a proposé ou demandé
5. STATUT FINAL : Résolu / En attente / Non résolu / Inconnu
6. PRÉDICTION NON-CONFORMITÉ : Un pourcentage entre 0% et 100% estimant la probabilité que ce cas soit réellement non-conforme (vol, fraude, violation). Utilise ces critères :
   - Explication claire et cohérente du chauffeur → faible (10-30%)
   - Explication vague ou contradictoire → moyen (40-60%)
   - Refus de répondre, incohérence, ou indices de fraude → élevé (70-100%)
   Format: XX% - LABEL (où LABEL est: Conforme probable / Suspicion légère / Suspicion modérée / Suspicion élevée / Non-conforme probable)
7. MOTS-CLÉS : 3-5 mots-clés séparés par des virgules
8. RECOMMANDATION : Action suggérée pour le superviseur

Réponds UNIQUEMENT avec le rapport structuré, sans introduction."""


# ══════════════════════════════════════════════════════════════
#  DÉPENDANCES
# ══════════════════════════════════════════════════════════════
def check_deps():
    missing = []
    for pkg, pip_name in [
        ("faster_whisper", "faster-whisper"), ("pyaudio", "pyaudio"),
        ("numpy", "numpy"), ("webrtcvad", "webrtcvad-wheels"),
        ("sounddevice", "sounddevice"), ("soundfile", "soundfile"),
        ("edge_tts", "edge-tts"), ("requests", "requests"),
        ("scipy", "scipy"), ("psycopg2", "psycopg2-binary"),
    ]:
        try: __import__(pkg)
        except ImportError: missing.append(pip_name)
    if missing:
        print(f"\n  ❌ Manquants : {', '.join(missing)}")
        print(f"  pip install {' '.join(missing)}\n"); sys.exit(1)


check_deps()


import pyaudio
import sounddevice as sd
sd.default.latency = 'high'
sd.default.blocksize = 8192
import soundfile as sf
import edge_tts
import requests as req_http
import psycopg2
import enum
import xml.etree.ElementTree as ET
from faster_whisper import WhisperModel
from scipy.signal import resample_poly
from math import gcd


_vad = None
try:
    import webrtcvad
    _vad = webrtcvad.Vad(VAD_AGGRESSIVENESS)
except Exception: pass


def _print_clean(msg):
    try: sys.stdout.write("\r\033[K"); sys.stdout.flush()
    except: pass
    print(msg)


def connecter_bdd():
    return psycopg2.connect(host=DB_HOST, port=DB_PORT, database=DB_NAME, user=DB_USER, password=DB_PASSWORD)


# ══════════════════════════════════════════════════════════════
#  GÉNÉRATION DE RAPPORT POST-APPEL (Ollama)
# ══════════════════════════════════════════════════════════════
def _extraire_prediction(rapport: str) -> dict:
    """
    Extrait le pourcentage et le label de prédiction depuis le rapport.
    Cherche la ligne 'PRÉDICTION NON-CONFORMITÉ' et parse 'XX% - LABEL'.
    """
    import re
    result = {"prediction_pct": None, "prediction_label": None}
    if not rapport:
        return result
    for line in rapport.splitlines():
        line_lower = line.lower()
        if 'prédiction' in line_lower or 'prediction' in line_lower or 'non-conformit' in line_lower:
            # Chercher un pattern XX% dans la ligne
            match = re.search(r'(\d{1,3})\s*%', line)
            if match:
                result["prediction_pct"] = int(match.group(1))
            # Chercher le label après le tiret
            label_match = re.search(r'\d{1,3}\s*%\s*[-–—:]\s*(.+)', line)
            if label_match:
                result["prediction_label"] = label_match.group(1).strip()
            elif result["prediction_pct"] is not None:
                # Déduire le label du pourcentage
                pct = result["prediction_pct"]
                if pct <= 30:
                    result["prediction_label"] = "Conforme probable"
                elif pct <= 50:
                    result["prediction_label"] = "Suspicion légère"
                elif pct <= 70:
                    result["prediction_label"] = "Suspicion modérée"
                elif pct <= 90:
                    result["prediction_label"] = "Suspicion élevée"
                else:
                    result["prediction_label"] = "Non-conforme probable"
            break
    return result


def _sauvegarder_rapport(session_id: str, rapport: str):
    """
    Sauvegarde le rapport dans conversations_appels via upsert.
    Extrait et stocke aussi la prédiction de non-conformité.
    """
    prediction = _extraire_prediction(rapport)
    try:
        conn = connecter_bdd(); cur = conn.cursor()
        cur.execute("""
            INSERT INTO conversations_appels
                (session_id, rapport, rapport_ts, prediction_pct, prediction_label, date_appel)
            VALUES (%s, %s, NOW(), %s, %s, NOW())
            ON CONFLICT (session_id) DO UPDATE SET
                rapport          = EXCLUDED.rapport,
                rapport_ts       = NOW(),
                prediction_pct   = EXCLUDED.prediction_pct,
                prediction_label = EXCLUDED.prediction_label
        """, (session_id, rapport, prediction.get("prediction_pct"), prediction.get("prediction_label")))
        conn.commit(); conn.close()
        pct_str = f"{prediction.get('prediction_pct')}%" if prediction.get('prediction_pct') is not None else 'N/A'
        print(f"  💾 Rapport sauvegardé → session {session_id} (prédiction: {pct_str})")
    except Exception as e:
        print(f"  ❌ _sauvegarder_rapport : {e}")


def generer_rapport_ollama(conversation_texte: str, session_id: str) -> str:
    """
    Génère un rapport structuré en français à partir de la conversation.
    """
    # ── Attendre qu'Ollama soit libre (post-appel) ─────────────
    time.sleep(8)

    print(f"\n  📝 Génération rapport Ollama → session {session_id}...")

    # ── Guard : si conversation_texte est None, récupérer depuis BDD ──
    if not conversation_texte or not conversation_texte.strip():
        print(f"  ⚠️ conversation_texte vide/None → tentative récupération BDD...")
        try:
            conn = connecter_bdd(); cur = conn.cursor()
            cur.execute(
                "SELECT conversation_texte FROM conversations_appels WHERE session_id = %s",
                (session_id,)
            )
            row = cur.fetchone(); conn.close()
            if row and row[0]:
                conversation_texte = row[0]
                print(f"  ✅ Conversation récupérée depuis BDD ({len(conversation_texte)} chars)")
            else:
                print(f"  ❌ Aucune conversation en BDD pour session {session_id}")
                return "Erreur : conversation introuvable en BDD."
        except Exception as e:
            print(f"  ❌ Récupération BDD pour rapport : {e}")
            return "Erreur : BDD inaccessible."

    # ── Vérifier qu'Ollama répond avant d'envoyer le rapport ───
    try:
        ping = req_http.get("http://localhost:11434/api/tags", timeout=5)
        if ping.status_code != 200:
            print("  ❌ Ollama ne répond pas")
            return "Erreur : Ollama non disponible."
    except Exception:
        print("  ❌ Ollama non démarré")
        return "Erreur : Ollama non démarré."

    # ── Tronquer la conversation si trop longue ─────────────────
    MAX_CHARS = 3000
    if len(conversation_texte) > MAX_CHARS:
        conversation_texte = conversation_texte[:MAX_CHARS] + "\n[... tronqué ...]"
        print(f"  ⚠️ Conversation tronquée à {MAX_CHARS} caractères")

    try:
        resp = req_http.post(
            OLLAMA_URL,
            json={
                "model": OLLAMA_MODEL,
                "messages": [
                    {"role": "system", "content": SYSTEM_PROMPT_RAPPORT},
                    {"role": "user", "content": f"Conversation à analyser :\n\n{conversation_texte}"},
                ],
                "stream": False,
                "options": {
                    "temperature": 0.1,
                    "num_predict": 300,    # ← réduit de 500 à 300
                    "num_ctx":     2048,   # ← contexte limité
                },
            },
            timeout=180,               # ← augmenté de 60s à 180s
        )
        resp_json = resp.json()
        if "message" not in resp_json:
            err = resp_json.get("error", json.dumps(resp_json, ensure_ascii=False)[:200])
            print(f"  ❌ Ollama rapport inattendu : {err}")
            return f"Erreur Ollama : {err}"

        rapport = resp_json["message"].get("content", "").strip()
        if not rapport:
            print("  ⚠️ Ollama rapport vide")
            return "Ollama n'a pas retourné de rapport."

        print(f"  ✅ Rapport généré ({len(rapport)} caractères)")
        _sauvegarder_rapport(session_id, rapport)
        return rapport

    except req_http.exceptions.Timeout:
        print("  ❌ Ollama timeout (180s) — modèle trop lent, rapport ignoré")
        return "Erreur : timeout Ollama."
    except req_http.exceptions.ConnectionError:
        print("  ❌ Ollama non démarré — rapport impossible")
        return "Erreur : Ollama non démarré."
    except Exception as e:
        print(f"  ❌ generer_rapport_ollama : {e}")
        return f"Erreur génération rapport : {e}"

def lancer_rapport_en_arriere_plan(agent):
    """
    Lance la génération du rapport dans un thread séparé.
    """
    if not agent.historique:
        return

    lignes = [
        f"Date: {time.strftime('%Y-%m-%d %H:%M:%S')}",
        f"Session: {agent.session_id} | Camion: {agent.camion_id}",
        "=" * 50, ""
    ]
    for m in agent.historique:
        role = "Chauffeur" if m["role"] == "user" else "Agent"
        lignes.append(f"[{role}] {m['content']}\n")
    conversation_texte = "\n".join(lignes)

    def _run():
        generer_rapport_ollama(conversation_texte, agent.session_id)
        try:
            conn = connecter_bdd(); cur = conn.cursor()
            cur.execute(
                "SELECT rapport FROM conversations_appels WHERE session_id = %s",
                (agent.session_id,)
            )
            row = cur.fetchone(); conn.close()
            if row and row[0]:
                print(f"\n  {'='*50}")
                print(f"  📋 RAPPORT D'APPEL — session {agent.session_id}")
                print(f"  {'='*50}")
                for ligne in row[0].splitlines():
                    print(f"  {ligne}")
                print(f"  {'='*50}\n")
        except Exception as e:
            print(f"  ⚠️ Affichage rapport : {e}")

    threading.Thread(target=_run, daemon=True).start()
    print("  ⏳ Rapport en cours de génération (arrière-plan)...")


# ══════════════════════════════════════════════════════════════
#  INITIALISATION TABLES BDD
# ══════════════════════════════════════════════════════════════
def init_tables_bdd():
    """Crée les tables nécessaires si elles n'existent pas."""
    try:
        conn = connecter_bdd(); cur = conn.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS historique_appels (
                id SERIAL PRIMARY KEY,
                session_id VARCHAR(50),
                camion_id VARCHAR(100),
                etat_appel VARCHAR(20),
                mode_appel VARCHAR(20),
                duree_s FLOAT DEFAULT 0,
                duree_attente_s FLOAT DEFAULT 0,
                t_debut VARCHAR(20),
                t_decroche VARCHAR(20),
                t_fin VARCHAR(20),
                date_appel TIMESTAMP DEFAULT NOW()
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS conversations_appels (
                id SERIAL PRIMARY KEY,
                session_id VARCHAR(50) UNIQUE,
                camion_id VARCHAR(100),
                conversation_texte TEXT,
                fichier_audio VARCHAR(500),
                duree_s FLOAT DEFAULT 0,
                nb_tours INT DEFAULT 0,
                rapport TEXT,
                rapport_ts TIMESTAMP,
                prediction_pct INT,
                prediction_label VARCHAR(100),
                date_appel TIMESTAMP DEFAULT NOW()
            )
        """)
        # Ajouter les colonnes prediction si elles n'existent pas (migration)
        for col, col_type in [
            ("rapport", "TEXT"),
            ("rapport_ts", "TIMESTAMP"),
            ("prediction_pct", "INT"),
            ("prediction_label", "VARCHAR(100)"),
        ]:
            try:
                cur.execute(f"""
                    ALTER TABLE conversations_appels
                    ADD COLUMN IF NOT EXISTS {col} {col_type}
                """)
            except Exception:
                pass
        cur.execute("""
            CREATE TABLE IF NOT EXISTS messages_appels (
                id SERIAL PRIMARY KEY,
                session_id VARCHAR(50),
                tour INT,
                role VARCHAR(20),
                contenu TEXT,
                horodatage TIMESTAMP DEFAULT NOW()
            )
        """)
        conn.commit(); conn.close()
        print("  ✅ Tables BDD vérifiées/créées")
    except Exception as e:
        print(f"  ⚠️ Init tables BDD: {e}")


# ══════════════════════════════════════════════════════════════
#  TRACKING SESSION APPEL (porté de AppelCall.py)
# ══════════════════════════════════════════════════════════════
from dataclasses import dataclass, field, asdict


@dataclass
class _InfoSession:
    session_id: str = ""
    numero: str = ""
    matricule: str = ""
    t_debut: float = field(default_factory=time.time)
    t_fin: float = 0.0
    duree_s: float = 0.0
    termine: bool = False
    raison_fin: str = ""

    def cloturer(self, raison: str = "raccroche"):
        self.t_fin = time.time()
        self.duree_s = round(self.t_fin - self.t_debut, 1)
        self.termine = True
        self.raison_fin = raison

    def afficher(self):
        h = int(self.duree_s // 3600)
        m = int((self.duree_s % 3600) // 60)
        s = int(self.duree_s % 60)
        debut_fmt = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(self.t_debut))
        print(
            f"\n  ─── Bilan appel ──────────────────────────────\n"
            f"  Date début  : {debut_fmt}\n"
            f"  Durée       : {h:02d}h{m:02d}m{s:02d}s  ({self.duree_s:.1f}s)\n"
            f"  Numéro      : {self.numero}\n"
            f"  Matricule   : {self.matricule}\n"
            f"  Fin         : {self.raison_fin}\n"
            f"  ──────────────────────────────────────────────"
        )


_SESSION_APPEL = _InfoSession()


def demarrer_session_appel(session_id: str, numero: str, matricule: str):
    """Initialiser le tracking au début de chaque appel."""
    global _SESSION_APPEL
    _SESSION_APPEL = _InfoSession(
        session_id=session_id, numero=numero, matricule=matricule,
    )
    debut_fmt = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(_SESSION_APPEL.t_debut))
    print(f"\n  📞 Appel démarré — {debut_fmt}  (session {session_id})")


def log_session_appel(raison_fin: str = "raccroche"):
    """Clôture la session courante et sauvegarde en JSONL."""
    global _SESSION_APPEL
    if not _SESSION_APPEL.session_id:
        return
    _SESSION_APPEL.cloturer(raison_fin)
    _SESSION_APPEL.afficher()
    try:
        with open(SESSION_LOG_PATH, "a", encoding="utf-8") as f:
            f.write(json.dumps(asdict(_SESSION_APPEL), ensure_ascii=False) + "\n")
        print(f"  💾 Session → {SESSION_LOG_PATH}")
    except Exception as e:
        print(f"  ⚠️ Session log : {e}")


def surveiller_fin_appel(actif_flag, intervalle_s=4, timeout_s=3600):
    """Surveille la fin d'appel via ADB (IDLE=0). Met actif_flag[0]=False."""
    debut = time.time()
    ended_count = 0
    CONFIRME_N = 2
    while actif_flag[0]:
        time.sleep(intervalle_s)
        if time.time() - debut > timeout_s:
            print("\n  ⏰ Timeout session atteint")
            actif_flag[0] = False
            log_session_appel("timeout")
            break
        etat = get_call_state_adb()
        if etat == -1:
            ended_count = 0; continue
        if etat == 0:
            ended_count += 1
            print(f"\n  📵 Fin appel détectée ({ended_count}/{CONFIRME_N})...")
            if ended_count >= CONFIRME_N:
                actif_flag[0] = False
                log_session_appel("raccroche")
                break
        else:
            ended_count = 0


# ══════════════════════════════════════════════════════════════
#  WHISPER
# ══════════════════════════════════════════════════════════════
_whisper_model = None


def init_whisper():
    global _whisper_model
    print(f"\n  ⏳ Chargement Whisper '{WHISPER_MODEL}' sur {WHISPER_DEVICE}...")
    t0 = time.time()
    try:
        _whisper_model = WhisperModel(WHISPER_MODEL, device=WHISPER_DEVICE, compute_type=WHISPER_COMPUTE)
    except Exception:
        print("  ⚠️ CUDA échoué → CPU")
        _whisper_model = WhisperModel("small", device="cpu", compute_type="int8")
    print(f"  ✅ Whisper prêt en {time.time()-t0:.1f}s")


def transcrire_whisper(audio_np):
    if _whisper_model is None or len(audio_np) < 1600:
        return {"texte": "", "duree_inference_s": 0}
    t0 = time.time()
    segments, info = _whisper_model.transcribe(
        audio_np, language=WHISPER_LANGUAGE, beam_size=WHISPER_BEAM_SIZE,
        vad_filter=True, vad_parameters=dict(min_silence_duration_ms=500, speech_pad_ms=200),
        word_timestamps=True, condition_on_previous_text=True,
    )
    texte = " ".join(s.text.strip() for s in segments).strip()
    dt = time.time() - t0
    return {
        "texte": texte, "langue": info.language,
        "duree_audio_s": round(info.duration, 2),
        "duree_inference_s": round(dt, 3),
        "ratio_rt": round(info.duration / max(dt, 0.001), 2),
    }


def pcm_to_float32(pcm_bytes):
    n = len(pcm_bytes) // 2
    if n == 0: return np.array([], dtype=np.float32)
    return np.array(struct.unpack(f"<{n}h", pcm_bytes), dtype=np.float32) / 32768.0


def get_rms(pcm_bytes):
    n = len(pcm_bytes) // 2
    if n == 0: return 0.0
    return float(np.sqrt(np.mean(np.array(struct.unpack(f"<{n}h", pcm_bytes), dtype=np.float32)**2)))


def float32_vers_pcm16(w):
    return (np.clip(w, -1.0, 1.0) * 32767).astype(np.int16).tobytes()


# ══════════════════════════════════════════════════════════════
#  ADB — APPEL + ÉTAT
# ══════════════════════════════════════════════════════════════
def _run_adb(cmd, timeout_s=5):
    r = subprocess.run(cmd, capture_output=True, timeout=timeout_s)
    return r.stdout.decode("utf-8", errors="replace"), r.returncode


def lancer_appel_adb(numero):
    try:
        out, _ = _run_adb(["adb", "devices"])
        lignes = [l for l in out.strip().split("\n")[1:] if l.strip() and "device" in l]
        if not lignes: print("  ❌ Téléphone non détecté"); return False
        print(f"  📱 {lignes[0].split(chr(9))[0]}")
    except FileNotFoundError: print("  ❌ ADB non trouvé"); return False
    subprocess.run(["adb","shell","am","start","-a","android.intent.action.CALL","-d",f"tel:{numero}"],
                   capture_output=True, timeout=10)
    print(f"  ✅ Appel → {numero}"); return True


def raccrocher_adb():
    try: subprocess.run(["adb","shell","input","keyevent","KEYCODE_ENDCALL"], capture_output=True, timeout=5)
    except: pass


def get_call_state_adb():
    try:
        out, _ = _run_adb(["adb", "shell", "dumpsys", "telephony.registry"], 3)
        etats = re.findall(r"mCallState=(\d)", out)
        if not etats: return -1
        valeurs = [int(e) for e in etats]
        if 2 in valeurs: return 2
        if 1 in valeurs: return 1
        return 0
    except: return -1


def decrocher_adb() -> bool:
    """Decroche un appel entrant via ADB."""
    try:
        r1 = subprocess.run(
            ["adb", "shell", "input", "keyevent", "KEYCODE_CALL"],
            capture_output=True, timeout=5
        )
        if r1.returncode == 0:
            print("  ✅ Decroche via KEYCODE_CALL")
            return True

        r2 = subprocess.run(
            ["adb", "shell", "telecom", "accept-ringing-call"],
            capture_output=True, timeout=5
        )
        if r2.returncode == 0:
            print("  ✅ Decroche via telecom")
            return True

        subprocess.run(
            ["adb", "shell", "service", "call", "phone", "6"],
            capture_output=True, timeout=5
        )
        print("  ✅ Decroche via service call phone")
        return True

    except Exception as e:
        print(f"  ❌ Echec decroche ADB : {e}")
        return False


def get_caller_number_adb() -> str:
    """
    Récupère le numéro de l'appelant via ADB.
    Essaie 3 méthodes dans l'ordre :
      1. dumpsys telecom (patterns multiples)
      2. dumpsys telephony.registry (mCallIncomingNumber)
      3. Journal d'appels Android (content://call_log)
    """
    # ── Méthode 1 : dumpsys telecom ──────────────────────
    try:
        out, _ = _run_adb(["adb", "shell", "dumpsys", "telecom"], 8)
        patterns = [
            "handle=tel:",
            "incomingNumber=",
            "address=tel:",
            "number=",
            "Handle{",
            "mAddress=",
            "mHandle=tel:",
        ]
        lignes_tel = []
        for ligne in out.splitlines():
            ligne_s = ligne.strip()
            for pattern in patterns:
                if pattern in ligne_s:
                    # Extraire le numéro après le pattern
                    idx = ligne_s.index(pattern) + len(pattern)
                    numero = ""
                    for c in ligne_s[idx:]:
                        if c.isdigit() or c == '+':
                            numero += c
                        elif numero:
                            break
                    if len(numero) >= 8:
                        print(f"  📞 Numéro appelant (telecom) : {numero}")
                        return numero
                    lignes_tel.append(ligne_s[:120])

        # Debug : afficher les lignes avec "tel:" pour diagnostiquer
        for ligne in out.splitlines():
            if "tel:" in ligne.lower() or "number" in ligne.lower():
                print(f"  🔎 telecom debug: {ligne.strip()[:120]}")
    except Exception as e:
        print(f"  ⚠️ telecom: {e}")


    # ── Méthode 2 : dumpsys telephony.registry ───────────
    try:
        out2, _ = _run_adb(["adb", "shell", "dumpsys", "telephony.registry"], 5)
        for ligne in out2.splitlines():
            ligne_s = ligne.strip()
            # Patterns Android pour le numéro entrant
            for key in ["mCallIncomingNumber", "mIncomingNumber",
                        "incomingNumber", "mForegroundCallState"]:
                if key in ligne_s:
                    # Extraire tout ce qui ressemble à un numéro
                    import re
                    nums = re.findall(r'[\+]?\d{8,}', ligne_s)
                    if nums:
                        print(f"  📞 Numéro appelant (registry) : {nums[0]}")
                        return nums[0]
    except Exception as e:
        print(f"  ⚠️ registry: {e}")


    # ── Méthode 3 : Journal d'appels Android ─────────────
    #    Le dernier appel entrant (type=1) dans le call log
    #    ⚠️ Utiliser une seule commande shell (pas _run_adb)
    try:
        import re
        result = subprocess.run(
            ["adb", "shell",
             "content query --uri content://call_log/calls "
             "--projection number:type "
             "--where \"type=1\" "
             "--sort 'date DESC'"],
            capture_output=True, text=True, timeout=5
        )
        out3 = result.stdout
        for ligne in out3.splitlines():
            nums = re.findall(r'number=([\+\d]+)', ligne)
            if nums and len(nums[0]) >= 8:
                num = nums[0]
                # Ajouter le préfixe +216 si absent
                if not num.startswith('+') and len(num) == 8:
                    num = '+216' + num
                print(f"  📞 Numéro appelant (call_log) : {num}")
                return num
    except Exception as e:
        print(f"  ⚠️ call_log: {e}")


    print("  ⚠️ Numéro appelant non détecté (3 méthodes échouées)")
    return ""

# ══════════════════════════════════════════════════════════════
#  BLUETOOTH SCO
# ══════════════════════════════════════════════════════════════
def verifier_route_active_bluetooth():
    """Vérifie UNIQUEMENT l'état courant du routage Bluetooth."""
    try:
        out, _ = _run_adb(["adb", "shell", "dumpsys", "telecom"], 6)
        for ligne in out.splitlines():
            if "Current state:" in ligne:
                est_bt = "Bluetooth" in ligne and "Quiescent" not in ligne
                print(f"  📊 État actuel: {ligne.strip()}")
                return est_bt
        return False
    except Exception as e:
        print(f"  ⚠️ Vérification route: {e}")
        return False


def forcer_sco():
    """Force la connexion SCO (Synchronous Connection-Oriented) via ADB."""
    print("  🔵 Forçage SCO...")
    try:
        for cmd in [
            ["adb", "shell", "service", "call", "audio", "3", "i32", "3"],
            ["adb", "shell", "service", "call", "audio", "72", "i32", "1"],
            ["adb", "shell", "service", "call", "audio", "72", "i32", "1"],
        ]:
            out, _ = _run_adb(cmd)
            time.sleep(0.3)
        time.sleep(0.8)
    except Exception as e:
        print(f"  ⚠️ SCO: {e}")


def forcer_route_bt():
    """Force le routage audio vers Bluetooth via telecom."""
    try:
        subprocess.run(
            ["adb", "shell", "cmd", "telecom", "set-audio-route", "bluetooth"],
            capture_output=True, timeout=5
        )
        time.sleep(0.5)
    except Exception as e:
        print(f"  ⚠️ Force route BT: {e}")


def liberer_sco():
    """Libère la connexion SCO."""
    try:
        subprocess.run(
            ["adb", "shell", "service", "call", "audio", "72", "i32", "0"],
            capture_output=True, timeout=5
        )
    except Exception as e:
        print(f"  ⚠️ Libération SCO: {e}")


def basculer_audio_vers_desktop():
    """
    Solution la plus fiable pour Android 14 / MIUI.
    Utilise UIAutomator pour trouver et cliquer DESKTOP-24V22SD
    par son texte exact dans l'UI — sans coordonnées fixes.
    """
    print("  🤖 UIAutomator → recherche DESKTOP-24V22SD...")
    
    try:
        # ── Étape 1 : vérifier qu'un appel est actif ──────────
        out, _ = _run_adb(["adb", "shell", "dumpsys", "telephony.registry"], 5)
        if "mCallState=2" not in out:
            print("  ⚠️ Aucun appel actif")
            return False

        # ── Étape 2 : vérifier état COURANT seulement ─────────
        if verifier_route_active_bluetooth():
            print("  ✅ Déjà sur Bluetooth DESKTOP (état confirmé)")
            return True

        # ── Étape 3 : dump de l'UI actuelle ───────────────────
        subprocess.run(
            ["adb", "shell", "uiautomator", "dump", "/sdcard/ui.xml"],
            capture_output=True, timeout=10
        )
        time.sleep(0.3)

        xml_out, _ = _run_adb(["adb", "shell", "cat", "/sdcard/ui.xml"], 10)

        if not xml_out.strip():
            print("  ❌ UI dump vide")
            return False

        # ── Étape 4 : parser le XML et chercher DESKTOP ────────
        root_xml = ET.fromstring(xml_out)
        cible = None

        for node in root_xml.iter("node"):
            text = node.get("text", "")
            content = node.get("content-desc", "")
            valeur = text + " " + content

            if BT_DEVICE_NAME in valeur or "DESKTOP" in valeur:
                bounds = node.get("bounds", "")
                coords = re.findall(r"\d+", bounds)
                if len(coords) >= 4:
                    x = (int(coords[0]) + int(coords[2])) // 2
                    y = (int(coords[1]) + int(coords[3])) // 2
                    cible = (x, y, valeur.strip())
                    break

        # ── Étape 5 : si pas trouvé → ouvrir le menu audio ────
        if not cible:
            print("  ℹ️  DESKTOP non visible → ouverture menu audio...")
            for node in root_xml.iter("node"):
                text = node.get("text", "")
                content = node.get("content-desc", "")
                valeur = (text + " " + content).lower()

                if any(kw in valeur for kw in [
                    "bluetooth", "audio", "speaker", "phone",
                    "périphérique", "device", "son"
                ]):
                    bounds = node.get("bounds", "")
                    coords = re.findall(r"\d+", bounds)
                    if len(coords) >= 4:
                        x = (int(coords[0]) + int(coords[2])) // 2
                        y = (int(coords[1]) + int(coords[3])) // 2
                        print(f"  🖱️  Tap menu audio @ ({x},{y})")
                        subprocess.run(
                            ["adb", "shell", "input", "tap", str(x), str(y)],
                            capture_output=True, timeout=5
                        )
                        time.sleep(0.8)
                        break

            # Re-dump après ouverture du menu
            subprocess.run(
                ["adb", "shell", "uiautomator", "dump", "/sdcard/ui.xml"],
                capture_output=True, timeout=10
            )
            time.sleep(0.3)
            xml_out2, _ = _run_adb(["adb", "shell", "cat", "/sdcard/ui.xml"], 10)
            if xml_out2.strip():
                root_xml = ET.fromstring(xml_out2)
                for node in root_xml.iter("node"):
                    text = node.get("text", "")
                    content = node.get("content-desc", "")
                    valeur = text + " " + content
                    if BT_DEVICE_NAME in valeur or "DESKTOP" in valeur:
                        bounds = node.get("bounds", "")
                        coords = re.findall(r"\d+", bounds)
                        if len(coords) >= 4:
                            x = (int(coords[0]) + int(coords[2])) // 2
                            y = (int(coords[1]) + int(coords[3])) // 2
                            cible = (x, y, valeur.strip())
                            break

        # ── Étape 6 : cliquer sur la cible ─────────────────────
        if cible:
            x, y, desc = cible
            print(f"  ✅ Trouvé '{desc}' @ ({x},{y})")
            subprocess.run(
                ["adb", "shell", "input", "tap", str(x), str(y)],
                capture_output=True, timeout=5
            )
            time.sleep(1.2)
            return True
        else:
            print("  ❌ DESKTOP-24V22SD introuvable après recherche complète")
            return False

    except Exception as e:
        print(f"  ❌ UIAutomator: {e}")
        return False


def sequence_basculement():
    """
    Séquence complète de basculement audio vers DESKTOP-24V22SD.
    Essaie UIAutomator d'abord, puis fallback ADB si échoué.
    """
    print("\n  ═══ Basculement audio vers DESKTOP-24V22SD ═══")
    if basculer_audio_vers_desktop():
        forcer_sco()
        print("  ✅ Basculement audio réussi")
    else:
        print("  ⚠️ UIAutomator échoué → fallback ADB")
        forcer_route_bt()
        forcer_sco()
        print("  ⚠️ Basculement via fallback ADB")
    print("  ════════════════════════════════════════════\n")


# ══════════════════════════════════════════════════════════════
#  TTS — EDGE TTS
# ══════════════════════════════════════════════════════════════
_output_device_idx = None
_enregistrement_actif = True  # Flag pour pausher l'enregistrement pendant TTS
_enregistreur_global = None   # Référence vers l'EnregistreurWAV actif pour y injecter le TTS


def set_enregistreur_global(enreg):
    """Permet à api_agent.py de définir l'enregistreur global pour l'injection TTS."""
    global _enregistreur_global
    _enregistreur_global = enreg


def choisir_sortie_audio():
    global _output_device_idx
    for i, d in enumerate(sd.query_devices()):
        if d["max_output_channels"] > 0:
            if FORCE_OUTPUT_NAME_SUBSTR.lower() in d["name"].lower():
                _output_device_idx = i
                print(f"  ✅ Sortie: [{i}] {d['name']}"); return
    _output_device_idx = None


async def _tts_async(texte, fichier):
    await edge_tts.Communicate(texte, TTS_VOICE, rate=TTS_RATE, volume=TTS_VOLUME).save(fichier)


def parler(texte):
    global _enregistrement_actif, _enregistreur_global
    if not texte or not texte.strip(): return
    print(f"\n  🔊 Agent : {texte}")
    tmp = tempfile.NamedTemporaryFile(suffix=".mp3", delete=False); tmp_path = tmp.name; tmp.close()
    try:
        asyncio.run(_tts_async(texte, tmp_path))
        data, sr = sf.read(tmp_path, dtype="float32")
        if len(data.shape) > 1: data = data.mean(axis=1)
        target_sr = int(sd.query_devices(_output_device_idx)["default_samplerate"]) if _output_device_idx is not None else sr
        if sr != target_sr:
            g = gcd(int(sr), target_sr); data = resample_poly(data, target_sr//g, sr//g); sr = target_sr
        data = np.clip(data * TTS_VOLUME_FACTOR, -1.0, 1.0)
        # Fade-in doux (100ms) pour éviter le début coupé via Bluetooth
        fade_samples = min(int(sr * 0.1), len(data))
        if fade_samples > 0:
            data[:fade_samples] *= np.linspace(0, 1, fade_samples, dtype=np.float32)
        sil_d = np.zeros(int(sr * TTS_SILENCE_DEBUT_S), dtype=np.float32)
        sil_f = np.zeros(int(sr * TTS_SILENCE_FIN_S), dtype=np.float32)
        
        # Pausher l'enregistrement du microphone pendant que l'agent parle
        _enregistrement_actif = False

        # ── Injecter le TTS dans l'enregistreur pour sauvegarder la voix agent ──
        if _enregistreur_global is not None:
            # Rééchantillonner vers SAMPLE_RATE si nécessaire pour le WAV
            tts_data = data.copy()
            if sr != SAMPLE_RATE:
                g2 = gcd(int(sr), SAMPLE_RATE)
                tts_data = resample_poly(tts_data, SAMPLE_RATE // g2, int(sr) // g2)
            # Silence début
            sil_d_rec = np.zeros(int(SAMPLE_RATE * TTS_SILENCE_DEBUT_S), dtype=np.float32)
            # Silence fin
            sil_f_rec = np.zeros(int(SAMPLE_RATE * TTS_SILENCE_FIN_S), dtype=np.float32)
            tts_complet = np.concatenate([sil_d_rec, tts_data, sil_f_rec])
            tts_pcm = float32_vers_pcm16(tts_complet)
            _enregistreur_global.ajouter(tts_pcm)

        time.sleep(0.5)  # Laisser le CPU "souffler" après Ollama avant de jouer l'audio
        sd.play(np.concatenate([sil_d, data, sil_f]), samplerate=sr, device=_output_device_idx); sd.wait()
        _enregistrement_actif = True  # Reprendre l'enregistrement
    except Exception as e: print(f"  ❌ TTS: {e}")
    finally:
        try: os.unlink(tmp_path)
        except: pass


# ══════════════════════════════════════════════════════════════
#  OLLAMA — AGENT MÉTIER
# ══════════════════════════════════════════════════════════════
class AgentOllama:
    def __init__(self, camion_id):
        self.camion_id = camion_id
        self.historique = []
        self.tour = 0
        self.session_id = str(uuid.uuid4())[:8]
        self.t_debut = time.time()
        print(f"  ✅ Agent Ollama — camion {camion_id} — session {self.session_id}")


    def _sauvegarder_message_bdd(self, tour, role, contenu):
        """Sauvegarde chaque message individuellement dans messages_appels."""
        try:
            conn = connecter_bdd(); cur = conn.cursor()
            cur.execute("""INSERT INTO messages_appels
                (session_id, tour, role, contenu, horodatage)
                VALUES (%s,%s,%s,%s,NOW())""",
                (self.session_id, tour, role, contenu))
            conn.commit(); conn.close()
        except Exception as e:
            print(f"  ⚠️ Message BDD: {e}")


    def repondre(self, texte_asr):
        if not texte_asr: return "ما سمعتكش مليح، عاود بالله"
        self.tour += 1
        messages = [{"role": "system", "content": SYSTEM_PROMPT}
                   ] + self.historique + [{"role": "user", "content": texte_asr}]
        try:
            t0 = time.time()
            resp = req_http.post(OLLAMA_URL,
                json={"model": OLLAMA_MODEL, "messages": messages,
                      "stream": False, "options": {
                          "temperature": 0.2,
                          "num_predict": 60,      # ← réduit de 100 à 60 pour réponses plus rapides
                          "num_ctx": 2048,         # ← limiter le contexte pour accélérer
                      }},
                timeout=30)
            resp_json = resp.json()
            # Robuste : Ollama peut renvoyer {"error":"..."} ou un format inattendu
            if "message" not in resp_json:
                err_msg = resp_json.get("error", json.dumps(resp_json, ensure_ascii=False)[:200])
                print(f"  ❌ Ollama réponse inattendue : {err_msg}")
                return "عندي مشكل تقني، عاود بالله"
            rep = resp_json["message"].get("content", "").strip()
            if not rep:
                print(f"  ⚠️ Ollama réponse vide")
                return "ما فهمتكش، عاود بالله"
            dt = round(time.time()-t0, 2)
            print(f"  ⚡ Ollama ({dt}s) : {rep}")
            self.historique.append({"role": "user", "content": texte_asr})
            self.historique.append({"role": "assistant", "content": rep})
            if len(self.historique) > 10: self.historique = self.historique[-10:]
            # Sauvegarder chaque message dans la BDD en temps réel
            self._sauvegarder_message_bdd(self.tour, "chauffeur", texte_asr)
            self._sauvegarder_message_bdd(self.tour, "agent", rep)
            # Log diagnostic JSONL
            try:
                with open(OUTPUT_DIAG_LOG, "a", encoding="utf-8") as f:
                    f.write(json.dumps({"ts": time.strftime("%Y-%m-%d %H:%M:%S"),
                        "session_id": self.session_id, "tour": self.tour,
                        "camion_id": self.camion_id, "asr": texte_asr,
                        "reponse": rep, "duree_s": dt}, ensure_ascii=False)+"\n")
            except: pass
            return rep
        except req_http.exceptions.ConnectionError:
            print(f"  ❌ Ollama non démarré ! Lancer : ollama serve")
            return "عندي مشكل تقني، الخدمة مش متاحة"
        except req_http.exceptions.Timeout:
            print(f"  ❌ Ollama timeout (30s) — modèle trop lent")
            return "عندي مشكل تقني، عاود بالله"
        except Exception as e:
            print(f"  ❌ Ollama : {type(e).__name__}: {e}")
            return "عندي مشكل تقني"


    def sauvegarder(self, fichier_audio=None):
        """Sauvegarde conversation texte + audio dans fichier ET dans la BDD."""
        duree_totale = round(time.time() - self.t_debut, 1)

        # ── 1. Fichier texte conversation ──────────────────────
        conversation_texte = ""
        with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
            header = (f"Date: {time.strftime('%Y-%m-%d %H:%M:%S')}\n"
                      f"Session: {self.session_id} | Camion: {self.camion_id}\n"
                      f"Durée: {duree_totale:.0f}s\n{'='*50}\n\n")
            f.write(header)
            conversation_texte += header
            for m in self.historique:
                role = "Chauffeur" if m["role"] == "user" else "Agent"
                ligne = f"[{role}] {time.strftime('%H:%M:%S')}\n{m['content']}\n\n"
                f.write(ligne)
                conversation_texte += ligne
        print(f"  💾 Conversation texte → {OUTPUT_FILE}")

        # ── 2. Conversation complète dans la BDD ───────────────
        try:
            conn = connecter_bdd(); cur = conn.cursor()
            cur.execute("""
                INSERT INTO conversations_appels
                    (session_id, camion_id, conversation_texte, fichier_audio,
                     duree_s, nb_tours, date_appel)
                VALUES (%s, %s, %s, %s, %s, %s, NOW())
                ON CONFLICT (session_id) DO UPDATE SET
                    conversation_texte = EXCLUDED.conversation_texte,
                    fichier_audio = EXCLUDED.fichier_audio,
                    duree_s = EXCLUDED.duree_s,
                    nb_tours = EXCLUDED.nb_tours
            """, (
                self.session_id, self.camion_id,
                conversation_texte,
                fichier_audio or OUTPUT_WAV,
                duree_totale,
                self.tour
            ))
            conn.commit(); conn.close()
            print(f"  💾 Conversation BDD → session {self.session_id}")
        except Exception as e:
            print(f"  ⚠️ Conversation BDD: {e}")

        # ── 3. Session JSONL ───────────────────────────────────
        try:
            with open(SESSION_LOG_PATH, "a", encoding="utf-8") as f:
                f.write(json.dumps({"session_id": self.session_id,
                    "camion_id": self.camion_id, "tours": self.tour,
                    "duree_s": duree_totale,
                    "date": time.strftime("%Y-%m-%d %H:%M:%S"),
                    "fichier_audio": fichier_audio or OUTPUT_WAV,
                    "nb_messages": len(self.historique)}, ensure_ascii=False)+"\n")
            print(f"  💾 Session → {SESSION_LOG_PATH}")
        except Exception as e: print(f"  ⚠️ Session log: {e}")


# ══════════════════════════════════════════════════════════════
#  ENREGISTREUR WAV
# ══════════════════════════════════════════════════════════════
class EnregistreurWAV:
    def __init__(self, session_id: str = ""):
        self.frames = []
        self._lock = threading.Lock()
        self.session_id = session_id
    def ajouter(self, pcm):
        if not pcm:
            return
        with self._lock:
            self.frames.append(pcm)
    def sauvegarder(self):
        with self._lock:
            if not self.frames:
                print("  ⚠️ Aucun buffer audio capturé, WAV non créé")
                return None
            audio = b"".join(self.frames)

        if not audio:
            print("  ⚠️ Buffer audio vide, WAV non créé")
            return None

        # Créer un nom de fichier unique par appel
        from datetime import datetime
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        sid = self.session_id[:8] if self.session_id else "noSession"
        nom_fichier = f"appel_{ts}_{sid}.wav"

        # Sauvegarder dans le dossier dédié
        os.makedirs(OUTPUT_WAV_DIR, exist_ok=True)
        chemin = os.path.join(OUTPUT_WAV_DIR, nom_fichier)

        with wave.open(chemin, "wb") as wf:
            wf.setnchannels(1); wf.setsampwidth(2)
            wf.setframerate(SAMPLE_RATE); wf.writeframes(audio)
        print(f"  ✅ WAV: {chemin} ({len(audio)/(SAMPLE_RATE*2):.1f}s)")
        return chemin


# ══════════════════════════════════════════════════════════════
#  SURVEILLANCE APPEL — état + BDD (porté de AppelCall.py)
# ══════════════════════════════════════════════════════════════
class EtatAppel(enum.Enum):
    IDLE=0; RINGING=1; ACTIVE=2; MISSED=3; CANCELED=4; ENDED=5


class SurveilleAppel:
    POLL_S = 1.2; TIMEOUT_RING_S = 60.0


    def __init__(self, mode, camion_id="INCONNU", session_id=""):
        self.mode, self.camion_id, self.session_id = mode, camion_id, session_id
        self._t_debut = self._t_decroche = self._t_fin = None
        self._etat = EtatAppel.IDLE
        self._a_sonne = self._a_active = self._actif = False
        self._lock = threading.Lock()
        self.resultat_final = None


    def demarrer(self):
        self._actif = True; self._t_debut = time.time()
        threading.Thread(target=self._boucle, daemon=True).start()
        print(f"  📊 [Surveillance] démarré — mode={self.mode}")


    def arreter(self): self._actif = False


    def duree_en_cours(self):
        with self._lock:
            return round(time.time()-self._t_decroche, 1) if self._t_decroche else 0.0


    def _boucle(self):
        etat_prec = -1
        while self._actif:
            now = time.time()
            etat_brut = get_call_state_adb()
            with self._lock:
                if etat_prec != 1 and etat_brut == 1:
                    self._a_sonne = True; self._etat = EtatAppel.RINGING
                    _print_clean("  📊 🔔 RINGING")
                elif etat_brut == 2 and not self._a_active:
                    self._a_active = True; self._t_decroche = now
                    self._etat = EtatAppel.ACTIVE
                    _print_clean("  📊 ✅ ACTIVE")
                elif etat_prec not in (-1,0) and etat_brut == 0:
                    self._t_fin = now
                    self._etat = EtatAppel.ENDED if self._a_active else (
                        EtatAppel.MISSED if self._a_sonne and self.mode=="incoming" else EtatAppel.CANCELED)
                    self.resultat_final = self._resultat()
                    self._sauvegarder_bdd()
                    self._actif = False; break
                if self.mode=="outgoing" and not self._a_active and (now-self._t_debut)>self.TIMEOUT_RING_S:
                    self._t_fin = now; self._etat = EtatAppel.CANCELED
                    self.resultat_final = self._resultat()
                    self._sauvegarder_bdd(); self._actif = False; break
                etat_prec = etat_brut if etat_brut != -1 else etat_prec
            time.sleep(self.POLL_S)
        if self.resultat_final is None:
            with self._lock:
                self._t_fin = time.time()
                self._etat = EtatAppel.ENDED if self._a_active else EtatAppel.CANCELED
                self.resultat_final = self._resultat()
            self._sauvegarder_bdd()


    def _resultat(self):
        duree_s = round(self._t_fin-self._t_decroche, 1) if self._a_active and self._t_decroche and self._t_fin else 0.0
        duree_att = round((self._t_decroche or self._t_fin or time.time())-self._t_debut, 1) if self._t_debut else 0.0
        fmt = lambda t: time.strftime("%H:%M:%S", time.localtime(t)) if t else None
        return {"session_id": self.session_id, "camion_id": self.camion_id,
                "etat": self._etat.name.lower(), "mode": self.mode,
                "duree_s": duree_s, "duree_attente_s": duree_att,
                "t_debut": fmt(self._t_debut), "t_decroche": fmt(self._t_decroche),
                "t_fin": fmt(self._t_fin), "date": time.strftime("%Y-%m-%d")}


    def _sauvegarder_bdd(self):
        """Met à jour historique_appels avec les données de l'appel."""
        r = self.resultat_final
        if not r: return
        try:
            conn = connecter_bdd(); cur = conn.cursor()
            cur.execute("""
                UPDATE historique_appels
                SET
                    session_id      = %s,
                    etat_appel      = %s,
                    mode_appel      = %s,
                    duree_s         = %s,
                    duree_attente_s = %s,
                    t_debut         = %s,
                    t_decroche      = %s,
                    t_fin           = %s,
                    date_appel      = NOW()
                WHERE session_id = %s
                   OR (camion_id = %s AND statut = 'en_cours' AND session_id IS NULL)
            """, (
                r["session_id"],
                r["etat"], r["mode"],
                r["duree_s"], r["duree_attente_s"],
                r["t_debut"], r["t_decroche"], r["t_fin"],
                r["session_id"],
                r.get("camion_id"),
            ))

            if cur.rowcount == 0:
                cur.execute("""
                    INSERT INTO historique_appels
                        (session_id, camion_id, etat_appel, mode_appel,
                         duree_s, duree_attente_s, t_debut, t_decroche, t_fin, date_appel)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,NOW())
                    ON CONFLICT (session_id) DO UPDATE SET
                        etat_appel      = EXCLUDED.etat_appel,
                        duree_s         = EXCLUDED.duree_s,
                        duree_attente_s = EXCLUDED.duree_attente_s,
                        t_debut         = EXCLUDED.t_debut,
                        t_decroche      = EXCLUDED.t_decroche,
                        t_fin           = EXCLUDED.t_fin
                """, (
                    r["session_id"], r.get("camion_id"), r["etat"], r["mode"],
                    r["duree_s"], r["duree_attente_s"],
                    r["t_debut"], r["t_decroche"], r["t_fin"],
                ))
            conn.commit(); conn.close()
            _print_clean(f"  💾 historique_appels ← etat={r['etat']} durée={r['duree_s']}s")
        except Exception as e:
            _print_clean(f"  ⚠️ BDD: {e}")


def identifier_matricule(numero):
    try:
        num_net = "".join(c for c in numero if c.isdigit())[-8:]
        conn = connecter_bdd(); cur = conn.cursor()
        cur.execute("""SELECT \"SITECAMION\" FROM voyage_chauffeur
            WHERE REPLACE(REPLACE(\"SALTEL\",' ',''),'+','') LIKE %s LIMIT 1""", (f"%{num_net}",))
        row = cur.fetchone(); conn.close()
        return row[0] if row else "INCONNU"
    except: return "INCONNU"


def _parse_hhmm_num(value):
    try:
        n = int(value)
    except Exception:
        return None
    h = n // 100
    m = n % 100
    if h < 0 or h > 23 or m < 0 or m > 59:
        return None
    return h, m


def verifier_fenetre_appel_entrant(numero, marge_min=30):
    """
    Accepte l'appel entrant seulement si maintenant est dans:
      [VOYHRD - marge ; VOYHRF + marge]
    pour un trajet du jour associé au numéro entrant.
    """
    now = datetime.now()
    num_net = "".join(c for c in (numero or "") if c.isdigit())[-8:]
    if not num_net:
        return {"allowed": False, "camion_id": "INCONNU", "reason": "Numéro entrant introuvable"}

    try:
        conn = connecter_bdd(); cur = conn.cursor()
        cur.execute(
            """
            SELECT "SITECAMION", "VOYHRD", "VOYHRF"
            FROM voyage_chauffeur
            WHERE DATE("VOYDTD") = CURRENT_DATE
              AND REPLACE(REPLACE(COALESCE("SALTEL"::text,''), ' ', ''), '+', '') LIKE %s
              AND "VOYHRD" IS NOT NULL
              AND "VOYHRF" IS NOT NULL
            ORDER BY "VOYHRD" ASC
            """,
            (f"%{num_net}",),
        )
        rows = cur.fetchall()
        conn.close()
    except Exception as e:
        return {"allowed": False, "camion_id": "INCONNU", "reason": f"Erreur BDD: {e}"}

    if not rows:
        return {"allowed": False, "camion_id": "INCONNU", "reason": "Aucun trajet du jour pour ce chauffeur"}

    first_window_msg = None
    for camion_id, voyhrd, voyhrf in rows:
        dep = _parse_hhmm_num(voyhrd)
        fin = _parse_hhmm_num(voyhrf)
        if not dep or not fin:
            continue

        dep_dt = now.replace(hour=dep[0], minute=dep[1], second=0, microsecond=0)
        fin_dt = now.replace(hour=fin[0], minute=fin[1], second=0, microsecond=0)
        if fin_dt < dep_dt:
            fin_dt += timedelta(days=1)

        window_start = dep_dt - timedelta(minutes=marge_min)
        window_end = fin_dt + timedelta(minutes=marge_min)

        if first_window_msg is None:
            first_window_msg = (
                f"maintenant={now.strftime('%H:%M')} VOYHRD={dep_dt.strftime('%H:%M')} "
                f"VOYHRF={fin_dt.strftime('%H:%M')} fenêtre=[{window_start.strftime('%H:%M')}→{window_end.strftime('%H:%M')}]"
            )

        if window_start <= now <= window_end:
            return {
                "allowed": True,
                "camion_id": camion_id or "INCONNU",
                "reason": f"Appel autorisé: fenêtre=[{window_start.strftime('%H:%M')}→{window_end.strftime('%H:%M')}]",
            }

    return {
        "allowed": False,
        "camion_id": "INCONNU",
        "reason": f"Appel hors fenêtre VOYHRD/VOYHRF ± {marge_min}min : {first_window_msg or 'fenêtre indisponible'}",
    }


# ══════════════════════════════════════════════════════════════
#  OUVRIR MICRO
# ══════════════════════════════════════════════════════════════
def ouvrir_micro():
    p = pyaudio.PyAudio(); devs = []
    print("\n  ENTRÉE AUDIO\n")
    for i in range(p.get_device_count()):
        try: info = p.get_device_info_by_index(i)
        except: continue
        if info.get("maxInputChannels", 0) <= 0: continue
        nl = info["name"].lower()
        tag = " ✅" if FORCE_INPUT_NAME_SUBSTR.lower() in nl else ""
        print(f"    [{i}] {info['name']} ({int(info['defaultSampleRate'])}Hz){tag}")
        devs.append(i)
    if not devs: print("  ❌ Aucun micro"); return None, 0, None


    default = next((i for i in devs if FORCE_INPUT_NAME_SUBSTR.lower() in
                     p.get_device_info_by_index(i)["name"].lower()), devs[0])
    try:
        c = input(f"\n  Choix [{default}] : ").strip()
        idx = int(c) if c else default
    except: idx = default


    stream = None
    for r in [SAMPLE_RATE, int(p.get_device_info_by_index(idx)["defaultSampleRate"]), 44100, 48000]:
        try:
            cs = int(r * CHUNK_MS / 1000)
            stream = p.open(format=pyaudio.paInt16, channels=1, rate=r,
                            input=True, input_device_index=idx, frames_per_buffer=cs)
            print(f"  ✅ Stream: {r}Hz"); return stream, r, p
        except: continue
    print("  ❌ Micro impossible"); return None, 0, None


# ══════════════════════════════════════════════════════════════
#  BOUCLE ENREGISTREMENT CONTINU (parallèle à Whisper)
# ══════════════════════════════════════════════════════════════
def boucle_enregistrement_continu(stream, rate, enreg, actif):
    """Enregistre l'audio en continu dans un thread séparé, indépendamment de Whisper.
    Respecte le flag _enregistrement_actif pour pauser pendant la TTS de l'agent."""
    global _enregistrement_actif
    chunk_size = int(rate * CHUNK_MS / 1000)
    try:
        while actif[0]:
            try:
                raw = stream.read(chunk_size, exception_on_overflow=False)
                # Enregistrer seulement si l'enregistrement est actif (pas pendant TTS)
                if raw and enreg and _enregistrement_actif:
                    enreg.ajouter(raw)
            except Exception as e:
                if actif[0]:
                    time.sleep(0.01)
                continue
    except Exception as e:
        print(f"  ⚠️ Boucle enregistrement : {e}")


# ══════════════════════════════════════════════════════════════
#  BOUCLE ÉCOUTE VAD + WHISPER
# ══════════════════════════════════════════════════════════════
def boucle_ecoute(stream, rate, on_texte, actif, enreg=None):
    """Boucle VAD → segment → Whisper → callback on_texte(texte, result)."""
    chunk_size = int(rate * CHUNK_MS / 1000)
    sil_max = int(SILENCE_AFTER_SPEECH_S * 1000 / CHUNK_MS)
    buf, prebuf, rms_seg = [], [], []
    prebuf_max = int(800 / CHUNK_MS)
    sil_count, is_speaking, seg_n, pause = 0, False, 0, [False]
    read_errors = 0


    print(f"\n  {'═'*50}\n  🎙️ Écoute Whisper — Ctrl+C pour arrêter\n  {'═'*50}\n")


    while actif[0]:
        if pause[0]:
            try: stream.read(chunk_size, exception_on_overflow=False)
            except: pass
            time.sleep(0.01); continue
        try: raw = stream.read(chunk_size, exception_on_overflow=False)
        except Exception as e:
            read_errors += 1
            if read_errors <= 3 or read_errors % 20 == 0:
                print(f"\n  ⚠️ Lecture audio impossible ({read_errors}) : {e}")
            time.sleep(0.01)
            continue


        if enreg: enreg.ajouter(raw)
        rms = get_rms(raw)


        if _vad:
            try:
                is_speech = _vad.is_speech(raw, rate)
                if not is_speech and is_speaking and rms > VAD_RMS_FALLBACK: is_speech = True
            except: is_speech = rms > SILENCE_RMS_THRESHOLD
        else: is_speech = rms > SILENCE_RMS_THRESHOLD


        if is_speech:
            sil_count = 0
            if not is_speaking: buf.extend(prebuf); prebuf = []; rms_seg = []
            is_speaking = True; buf.append(raw); rms_seg.append(rms)
            bar = "█" * min(20, int(rms / 350))
            sys.stdout.write(f"\r  \033[92m[{bar:20}]\033[0m 🎙️ RMS:{rms:5.0f} dur:{len(buf)*CHUNK_MS/1000:.1f}s")
        else:
            prebuf.append(raw)
            if len(prebuf) > prebuf_max: prebuf.pop(0)
            sil_count += 1
            if is_speaking: buf.append(raw)
            sys.stdout.write(f"\r  \033[90m[{'░'*20}]\033[0m 💤 sil:{sil_count}/{sil_max} RMS:{rms:4.0f}")


            if is_speaking and sil_count >= sil_max:
                is_speaking = False; seg_n += 1
                duree = len(buf) * CHUNK_MS / 1000
                rms_moy = float(np.mean(rms_seg)) if rms_seg else 0
                pcm = b"".join(buf)
                audio_np = pcm_to_float32(pcm)
                buf, prebuf, rms_seg = [], [], []


                print(f"\n\n  ─── Segment #{seg_n} ({duree:.1f}s, RMS:{rms_moy:.0f}) ───")
                print(f"  ⏳ Whisper...")
                result = transcrire_whisper(audio_np)
                texte = result.get("texte", "")
                rt = result.get("ratio_rt", 0)


                if texte:
                    print(f"  ✅ {texte}")
                    print(f"  ⚡ {result['duree_inference_s']:.2f}s ({rt:.1f}x RT)")
                    pause[0] = True
                    on_texte(texte, result, pause)
                    pause[0] = False
                else:
                    print(f"  💤 Silence")
                print()
        sys.stdout.flush()


# ══════════════════════════════════════════════════════════════
#  MODE 1 : FICHIER WAV
# ══════════════════════════════════════════════════════════════
def mode_fichier():
    default = r"C:\Users\Admin\Downloads\conversation_appel.wav"
    path = input(f"\n  Fichier [{default}] : ").strip() or default
    if not os.path.exists(path): print(f"  ❌ Introuvable"); return
    print(f"  📁 Transcription...")
    result = transcrire_whisper(sf.read(path, dtype="float32")[0])
    print(f"\n  📝 {result.get('texte','')}")
    print(f"  🌐 {result.get('langue','?')} | ⚡ {result.get('duree_inference_s',0):.2f}s")


# ══════════════════════════════════════════════════════════════
#  MODE 2 : MICRO TEMPS RÉEL (sans appel)
# ══════════════════════════════════════════════════════════════
def mode_micro():
    stream, rate, p = ouvrir_micro()
    if not stream: return
    actif = [True]
    def on_texte(t, r, pause): print(f"  → Transcription : {t}")
    try: boucle_ecoute(stream, rate, on_texte, actif)
    except KeyboardInterrupt: pass
    finally: stream.stop_stream(); stream.close(); p.terminate()


# ══════════════════════════════════════════════════════════════
#  MODE 3 : APPEL TÉLÉPHONIQUE COMPLET
# ══════════════════════════════════════════════════════════════
def mode_appel():
    choisir_sortie_audio()
    stream, rate, p = ouvrir_micro()
    if not stream: return


    numero = input(f"\n  Numéro [{NUMERO_CHAUFFEUR}] : ").strip() or NUMERO_CHAUFFEUR


    # Identifier le camion via la BDD
    camion_id = identifier_matricule(numero)
    if camion_id == "INCONNU":
        camion_id = input(f"  Matricule camion (auto=INCONNU) : ").strip() or "INCONNU"
    else:
        print(f"  🚛 Camion identifié : {camion_id}")


    agent = AgentOllama(camion_id)
    enreg = EnregistreurWAV(agent.session_id)
    global _enregistreur_global
    _enregistreur_global = enreg  # Permettre à parler() d'injecter le TTS

    # Session tracking (porté de AppelCall.py)
    demarrer_session_appel(agent.session_id, numero, camion_id)

    # Surveillance état appel (RINGING → ACTIVE → ENDED) + BDD historique_appels
    surveillant = SurveilleAppel("outgoing", camion_id, agent.session_id)

    # ── Enregistrement dès la sonnerie ─────────────────────────
    chunk_size_rec = int(rate * CHUNK_MS / 1000)
    chunks_per_sec = int(1000 / CHUNK_MS)  # ~50 pour 20ms chunks
    print(f"  🎙️ Enregistrement activé (capture dès la sonnerie)")

    # Lancer l'appel
    launched = lancer_appel_adb(numero)
    if launched:
        surveillant.demarrer()
        # Attendre que l'appel soit décroché — tout en enregistrant
        print(f"  ⏳ Attente décrochage (max {DELAI_AVANT_CLIC_S}s)...")
        t_wait = time.time()
        chunk_count = 0
        while (time.time() - t_wait) < DELAI_AVANT_CLIC_S:
            try:
                raw = stream.read(chunk_size_rec, exception_on_overflow=False)
                enreg.ajouter(raw)
            except:
                time.sleep(0.01)
            chunk_count += 1
            if chunk_count % chunks_per_sec == 0:
                etat = get_call_state_adb()
                if etat == 2:
                    print(f"\n  ✅ Appel décroché !")
                    break
                sys.stdout.write(f"\r  ⏳ {int(time.time()-t_wait)}s...")
                sys.stdout.flush()
        print()
    else:
        print("  ⚠️ Échec lancement ADB — tentative continue")
        surveillant.demarrer()


    # Basculement audio → DESKTOP-24V22SD avec retry (enregistrement continu)
    for tentative in range(BT_FORCE_RETRIES):
        sequence_basculement()
        # Drainer le buffer audio pendant l'attente post-basculement
        t_drain = time.time()
        while time.time() - t_drain < 0.5:
            try:
                raw = stream.read(chunk_size_rec, exception_on_overflow=False)
                enreg.ajouter(raw)
            except:
                time.sleep(0.01)
        etat = get_call_state_adb()
        if etat == 2:
            print(f"  ✅ Basculement OK (tentative {tentative+1})")
            break
        print(f"  🔄 Retry basculement ({tentative+1}/{BT_FORCE_RETRIES})...")


    actif = [True]

    # Surveillance fin d'appel via ADB (porté de AppelCall.py)
    threading.Thread(
        target=surveiller_fin_appel, args=(actif,), daemon=True
    ).start()

    # Arrêt auto quand SurveilleAppel détecte fin
    def _surveiller_fin():
        while actif[0]:
            time.sleep(2)
            if not surveillant._actif:
                _print_clean("\n  📵 Fin d'appel détectée par SurveilleAppel")
                actif[0] = False; break
    threading.Thread(target=_surveiller_fin, daemon=True).start()


    # Chrono en direct
    t_debut = time.time()
    def _chrono():
        while actif[0]:
            time.sleep(10); d = time.time() - t_debut
            _print_clean(f"  ⏱️ [Appel] {int(d)//60:02d}:{int(d)%60:02d}")
    threading.Thread(target=_chrono, daemon=True).start()


    # Message d'accueil
    parler("أهلاً، أنا المساعد الآلي. كيفاش نعاونك؟")


    # Callback Whisper → Ollama → TTS
    def on_texte(texte, result, pause):
        print(f"\n  ─── Étape Ollama ───")
        rep = agent.repondre(texte)
        if rep: parler(rep)


    try:
        boucle_ecoute(stream, rate, on_texte, actif, enreg=enreg)  # Enregistrement micro ici
    except KeyboardInterrupt:
        print("\n\n  Arrêt manuel...")
    finally:
        actif[0] = False
        _enregistreur_global = None  # Nettoyer la référence globale
        surveillant.arreter()
        stream.stop_stream(); stream.close(); p.terminate()
        sd.stop(); raccrocher_adb(); liberer_sco()
        # Sauvegarder audio + conversation (texte + BDD)
        fichier_audio = enreg.sauvegarder()
        if not fichier_audio:
            print("  ⚠️ Aucun fichier audio généré. Vérifier le périphérique d'entrée et les erreurs de lecture ci-dessus.")
        if agent.historique:
            agent.sauvegarder(fichier_audio=fichier_audio)
            lancer_rapport_en_arriere_plan(agent)
        log_session_appel("raccroche")
        duree = time.time() - t_debut
        print(f"\n  ✅ Appel terminé — {int(duree)//60:02d}:{int(duree)%60:02d}")
        if surveillant.resultat_final:
            r = surveillant.resultat_final
            etat_upper = r['etat'].upper()
            emoji = {"ENDED":"✅","MISSED":"📵","CANCELED":"❌"}.get(etat_upper,"📞")
            duree_fmt = f"{int(r['duree_s'])//60:02d}:{int(r['duree_s'])%60:02d}"
            print(f"\n  {emoji} Appel {etat_upper}")
            print(f"     Durée       : {duree_fmt}")
            print(f"     Attente     : {r['duree_attente_s']}s")
            print(f"     Début       : {r['t_debut']}")
            print(f"     Décroché    : {r['t_decroche'] or '—'}")
            print(f"     Fin         : {r['t_fin']}")


    parler("بالسلامة!")


# ══════════════════════════════════════════════════════════════
#  MODE 4 : APPEL ENTRANT (chauffeur appelle)
# ══════════════════════════════════════════════════════════════
def mode_appel_entrant():
    choisir_sortie_audio()
    stream, rate, p = ouvrir_micro()
    if not stream: return

    print("\n  👂 Serveur appels entrants actif...")
    print("  📞 Decrochage automatique active\n")

    actif_global = [True]
    try:
        etat_prec = 0
        while actif_global[0]:
            time.sleep(1)
            etat = get_call_state_adb()

            if etat == 1 and etat_prec != 1:
                print("\n  📲 Appel entrant détecté — sonnerie en cours...")
                caller_number = get_caller_number_adb()
                check = verifier_fenetre_appel_entrant(caller_number, marge_min=30)
                if not check.get("allowed"):
                    print(f"  ⛔ {check.get('reason')}")
                    print("  📵 Appel rejeté (hors fenêtre de trajet)")
                    raccrocher_adb()
                    etat_prec = etat
                    continue
                print(f"  ✅ {check.get('reason')}")
                time.sleep(8)

                ok = decrocher_adb()
                if not ok:
                    print("  ❌ Impossible de décrocher — attente manuelle")

                print("  ⏳ Attente confirmation décrochage...")
                t_wait = time.time()
                while (time.time() - t_wait) < 15:
                    if get_call_state_adb() == 2:
                        print("  ✅ Appel actif !")
                        break
                    time.sleep(0.5)
                else:
                    print("  ⚠️ Délai dépassé — appel peut-être manqué")
                    etat_prec = etat
                    continue

            elif etat == 2 and etat_prec != 2:
                print("\n  🎙️ Traitement appel entrant...")

                caller_number = get_caller_number_adb()
                check = verifier_fenetre_appel_entrant(caller_number, marge_min=30)
                camion_id = check.get("camion_id") if check.get("allowed") else "ENTRANT"
                agent = AgentOllama(camion_id)
                enreg = EnregistreurWAV(agent.session_id)
                global _enregistreur_global
                _enregistreur_global = enreg  # Permettre à parler() d'injecter le TTS
                surv = SurveilleAppel("incoming", camion_id, agent.session_id)

                demarrer_session_appel(agent.session_id, caller_number or "entrant", camion_id)
                surv.demarrer()

                # Basculement BT avec enregistrement continu
                chunk_size_rec = int(rate * CHUNK_MS / 1000)
                print(f"  🎙️ Enregistrement activé (appel entrant — capture dès maintenant)")
                for tentative in range(BT_FORCE_RETRIES):
                    sequence_basculement()
                    t_drain = time.time()
                    while time.time() - t_drain < 0.5:
                        try:
                            raw = stream.read(chunk_size_rec, exception_on_overflow=False)
                            enreg.ajouter(raw)
                        except:
                            time.sleep(0.01)
                    if get_call_state_adb() == 2:
                        print(f"  ✅ Basculement OK ({tentative+1})")
                        break

                actif = [True]
                threading.Thread(
                    target=surveiller_fin_appel, args=(actif,), daemon=True
                ).start()

                def _surveiller_fin_e():
                    while actif[0]:
                        time.sleep(2)
                        if not surv._actif:
                            actif[0] = False
                            break
                threading.Thread(target=_surveiller_fin_e, daemon=True).start()

                parler("أهلاً، أنا المساعد الآلي. كيفاش نعاونك؟")

                def on_texte(texte, result, pause):
                    rep = agent.repondre(texte)
                    if rep:
                        parler(rep)

                try:
                    boucle_ecoute(stream, rate, on_texte, actif, enreg=enreg)  # Enregistrement micro ici
                except KeyboardInterrupt:
                    actif_global[0] = False

                actif[0] = False
                _enregistreur_global = None  # Nettoyer la référence globale
                surv.arreter()
                sd.stop()
                liberer_sco()

                fichier_audio = enreg.sauvegarder()
                if not fichier_audio:
                    print("  ⚠️ Aucun fichier audio généré pour l'appel entrant.")
                if agent.historique:
                    agent.sauvegarder(fichier_audio=fichier_audio)
                    lancer_rapport_en_arriere_plan(agent)

                log_session_appel("raccroche")

                if surv.resultat_final:
                    r = surv.resultat_final
                    print(f"  📊 Appel {r['etat'].upper()} | Durée: {r['duree_s']}s")

                parler("بالسلامة!")
                print("\n  👂 En attente du prochain appel...\n")

            etat_prec = etat if etat != -1 else etat_prec

    except KeyboardInterrupt:
        print("\n\n  Arrêt serveur...")
    finally:
        stream.stop_stream(); stream.close(); p.terminate()


# ══════════════════════════════════════════════════════════════
#  MODE 4 : BENCHMARK
# ══════════════════════════════════════════════════════════════
def mode_benchmark():
    print(f"\n  ⏱️ Benchmark '{WHISPER_MODEL}'")
    for dur in [3, 5, 10, 15]:
        audio = np.random.randn(SAMPLE_RATE * dur).astype(np.float32) * 0.01
        t0 = time.time()
        r = transcrire_whisper(audio)
        dt = time.time() - t0
        ratio = dur / max(dt, 0.001)
        s = "✅" if ratio > 1.5 else "🟡" if ratio > 0.8 else "❌"
        print(f"  {dur:2d}s → {dt:.2f}s ({ratio:.1f}x) {s}")
    print(f"\n  Ratio > 1.5x = temps réel OK")


# ══════════════════════════════════════════════════════════════
#  MAIN
# ══════════════════════════════════════════════════════════════
def main():
    print(f"\n{'═'*55}")
    print(f"  AGENT IA WHISPER — Dialecte Tunisien")
    print(f"  Modèle: {WHISPER_MODEL} | GPU: {WHISPER_DEVICE}")
    print(f"{'═'*55}")


    init_whisper()
    init_tables_bdd()


    print(f"""
  [1] Fichier WAV         — transcription fichier
  [2] Micro temps réel    — VAD + Whisper (sans appel)
  [3] Agent appelle       — ADB + BT + Whisper + Ollama + TTS
  [4] Chauffeur appelle   — attente appel entrant
  [5] Benchmark           — mesure vitesse
    """)
    choix = input("  Choix [1/2/3/4/5] : ").strip()


    if choix == "1": mode_fichier()
    elif choix == "2": mode_micro()
    elif choix == "3": mode_appel()
    elif choix == "4": mode_appel_entrant()
    elif choix == "5": mode_benchmark()
    else: print("  ❌ Choix invalide")


if __name__ == "__main__":
    main()
