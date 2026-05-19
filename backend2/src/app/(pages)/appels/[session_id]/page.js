"use client"
import React, { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

import { getConversation, audioUrl, validerConversation } from '../../../../lib/api'
import MapModal from '@/components/map/MapModal'

const STORAGE_KEY = 'appels_sessions_lues'

// ── Helper: color from prediction percentage ──
function getPredictionColor(pct) {
  if (pct == null) return { bg: '#f1f5f9', fill: '#94a3b8', text: '#64748b', glow: 'transparent' }
  if (pct <= 30) return { bg: '#ecfdf5', fill: '#10b981', text: '#065f46', glow: 'rgba(16,185,129,0.25)' }
  if (pct <= 50) return { bg: '#fefce8', fill: '#eab308', text: '#854d0e', glow: 'rgba(234,179,8,0.25)' }
  if (pct <= 70) return { bg: '#fff7ed', fill: '#f97316', text: '#9a3412', glow: 'rgba(249,115,22,0.25)' }
  return { bg: '#fef2f2', fill: '#ef4444', text: '#991b1b', glow: 'rgba(239,68,68,0.3)' }
}

// ── Helper: parse rapport into sections ──
function parseRapport(rapport) {
  if (!rapport) return []
  const sections = []
  const lines = rapport.split('\n')
  let currentSection = null

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    // Match numbered sections like "1. RÉSUMÉ :" or "6. PRÉDICTION NON-CONFORMITÉ :"
    const sectionMatch = trimmed.match(/^(\d+)\.\s*([^:]+):\s*(.*)$/i)
    if (sectionMatch) {
      if (currentSection) sections.push(currentSection)
      currentSection = {
        num: sectionMatch[1],
        title: sectionMatch[2].trim(),
        content: sectionMatch[3].trim(),
      }
    } else if (currentSection) {
      currentSection.content += (currentSection.content ? '\n' : '') + trimmed
    }
  }
  if (currentSection) sections.push(currentSection)
  return sections
}

// ── Section icon mapping ──
function getSectionIcon(title) {
  const t = title.toLowerCase()
  if (t.includes('résum')) return '📋'
  if (t.includes('problème') || t.includes('probleme')) return '⚠️'
  if (t.includes('cause')) return '🔍'
  if (t.includes('réponse') || t.includes('reponse')) return '🤖'
  if (t.includes('statut')) return '📊'
  if (t.includes('prédiction') || t.includes('prediction') || t.includes('conformit')) return '🎯'
  if (t.includes('mot')) return '🏷️'
  if (t.includes('recommand')) return '💡'
  return '📝'
}

export default function SessionPage() {
  const params = useParams()
  const session_id = params?.session_id
  const invalidSession = !session_id || session_id === 'null'
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isMarkedRead, setIsMarkedRead] = useState(false)
  const [fuelData, setFuelData] = useState(null)
  const [isMapOpen, setIsMapOpen] = useState(false)
  const [mapPositions, setMapPositions] = useState([])
  const router = useRouter()

  // Charger le statut "lue" depuis localStorage
  useEffect(() => {
    if (invalidSession) return
    try {
      const lues = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
      if (lues.includes(session_id)) setIsMarkedRead(true)
    } catch { }
  }, [session_id])

  useEffect(() => {
    if (invalidSession) return
    async function load() {
      setLoading(true)
      try {
        const d = await getConversation(session_id)
        setData(d)
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [session_id])

  const s = {
    page: {
      minHeight: '100vh',
      padding: '24px 28px 48px',
      background:
        'radial-gradient(1200px 500px at 5% -10%, #eaf6ff 0%, rgba(234,246,255,0) 60%), radial-gradient(900px 480px at 110% 5%, #fff0e6 0%, rgba(255,240,230,0) 55%), #f7f8fb',
      fontFamily: '"Space Grotesk", "Segoe UI", sans-serif',
      color: '#1b1f2a',
    },
    header: { display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 16, alignItems: 'center', marginBottom: 22 },
    headerTitle: { margin: '0 0 6px', fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em' },
    metaRow: { display: 'flex', flexWrap: 'wrap', gap: 10, fontSize: 13, color: '#5a6272' },
    backButton: {
      border: 'none', background: '#fff', color: '#1b1f2a', padding: '10px 14px', borderRadius: 12,
      boxShadow: '0 6px 20px rgba(30,40,60,0.08)', cursor: 'pointer', transition: 'transform 0.2s ease',
    },
    tags: { display: 'flex', flexWrap: 'wrap', gap: 8 },
    tag: { background: '#e9f7ef', color: '#2c7a4b', border: '1px solid #c9eed8', padding: '6px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600 },
    tagAlt: { background: '#fff4e6', color: '#9b5d10', border: '1px solid #ffd8ad' },
    grid: { display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 20 },
    column: { display: 'flex', flexDirection: 'column', gap: 16 },
    card: {
      background: '#fff', borderRadius: 16, padding: '16px 18px',
      boxShadow: '0 12px 30px rgba(30,40,60,0.08)', border: '1px solid rgba(27,31,42,0.05)',
    },
    cardTitle: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, fontSize: 15, fontWeight: 700 },
    audioPlayer: { width: '100%' },
    statsRow: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px,1fr))', gap: 12 },
    stat: { background: '#f7f8fb', borderRadius: 14, padding: 12, border: '1px solid rgba(27,31,42,0.06)' },
    statLabel: { fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#7a8194', marginBottom: 6 },
    statValue: { fontSize: 16, fontWeight: 700, color: '#1b1f2a' },
    transcript: { display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 420, overflow: 'auto' },
    message: { padding: '12px 14px', borderRadius: 14, background: '#f4f6fb', border: '1px solid rgba(27,31,42,0.06)' },
    messageAgent: { background: '#eef7ff', border: '1px solid #cfe8ff' },
    messageMeta: { fontSize: 11, color: '#6b7280', marginBottom: 6 },
    messageRole: { fontWeight: 700, textTransform: 'capitalize', color: '#1b1f2a' },
    messageBody: { fontSize: 14, lineHeight: 1.5 },
    detailGrid: { display: 'grid', gap: 10 },
    detailRow: { display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13, color: '#5a6272' },
    detailValue: { color: '#1b1f2a', fontWeight: 600, textAlign: 'right' },
    empty: { fontSize: 13, color: '#7a8194' },
    validationButton: {
      border: '1px solid #bfe6d1', background: '#ecfdf3', color: '#0f7b43', padding: '10px 14px',
      borderRadius: 12, fontSize: 14, fontWeight: 600, cursor: 'pointer',
    },
    validationMessage: { marginTop: 10, fontSize: 12, color: '#5a6272' },
    modalOverlay: {
      position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.35)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16,
    },
    modal: {
      width: 'min(520px,95vw)', background: '#fff', borderRadius: 16, padding: '20px 22px',
      boxShadow: '0 18px 40px rgba(15,23,42,0.2)', border: '1px solid rgba(27,31,42,0.08)',
    },
    modalText: { fontSize: 14, color: '#1b1f2a', lineHeight: 1.5, marginBottom: 16 },
    modalActions: { display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' },
    modalButton: {
      borderRadius: 12, padding: '10px 14px', fontSize: 13, fontWeight: 600,
      border: '1px solid #e2e8f0', background: '#fff', color: '#1b1f2a', cursor: 'pointer',
    },
    modalButtonReject: { borderColor: '#ffd1d1', color: '#d94848', background: '#fff5f5' },
    modalButtonConfirm: { borderColor: '#fdba74', background: '#f97316', color: '#fff' },
  }

  const conv = data?.conversation || {}
  const messages = data?.messages || []
  const predictionPct = conv.prediction_pct
  const predictionLabel = conv.prediction_label
  const predColor = getPredictionColor(predictionPct)
  const rapportSections = useMemo(() => parseRapport(conv.rapport), [conv.rapport])

  const parseToMs = (value) => {
    if (value == null) return null
    if (value instanceof Date) {
      const ms = value.getTime()
      return Number.isFinite(ms) ? ms : null
    }
    const raw = String(value).trim()
    if (!raw) return null

    // Support formats like:
    // - 2026-05-07T11:31:00.000Z (ISO)
    // - 2026-05-07 11:31:00+01   (common DB display)
    const normalized = raw
      .replace(' ', 'T')
      .replace(/([+-]\d{2})$/, '$1:00')

    const ms = Date.parse(normalized)
    return Number.isFinite(ms) ? ms : null
  }

  const fuelSeries = useMemo(() => {
    if (!fuelData?.length) return null
    const callTimeMs = parseToMs(conv.date_appel)
    const filtered = fuelData
      .map((row) => {
        const ts = parseToMs(row.timestamp)
        return { ...row, ts }
      })
      .filter((row) => row.ts != null && (callTimeMs != null ? row.ts <= callTimeMs : true))

    filtered.sort((a, b) => a.ts - b.ts)

    // Deduplicate identical timestamps (keep the last value for that timestamp)
    const unique = []
    for (const row of filtered) {
      const last = unique[unique.length - 1]
      if (last && last.ts === row.ts) {
        unique[unique.length - 1] = row
      } else {
        unique.push(row)
      }
    }

    return unique
  }, [fuelData, conv.date_appel])

  const formatTime = (value) => {
    const ms = Number(value)
    if (!Number.isFinite(ms)) return ''
    return new Date(ms).toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  }

  const openFuelPointMap = (point) => {
    const lat = Number(point?.latitude)
    const lng = Number(point?.longitude)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return

    const timeLabel = point?.ts != null ? formatTime(point.ts) : (point?.heure || '')
    const niveauLabel = point?.niveau != null ? `${point.niveau} L` : '--'
    const label = conv.camion_id || 'Camion'

    setMapPositions([
      {
        id: point?.ts != null ? `fuel-${label}-${point.ts}` : undefined,
        lat,
        lng,
        label,
        status: point?.etatMoteur,
        info: `${timeLabel} · Niveau: ${niveauLabel}`,
      },
    ])
    setIsMapOpen(true)
  }

  // Decide if we should show the fuel curve based on detected call type
  const _convType = (conv.type_nc || conv.type || '').toString().toLowerCase().trim()
  const showFuel = fuelSeries && (_convType === 'chute_carburant' || _convType === 'arret_et_chute_carburant')

  const handleFuelChartClick = (e) => {
    const point = e?.activePayload?.[0]?.payload
    if (!point) return
    openFuelPointMap(point)
  }

  const FuelDot = ({ cx, cy, payload }) => {
    if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null
    const lat = Number(payload?.latitude)
    const lng = Number(payload?.longitude)
    const clickable = Number.isFinite(lat) && Number.isFinite(lng)

    return (
      <circle
        cx={cx}
        cy={cy}
        r={4}
        fill="#f97316"
        stroke="#fff"
        strokeWidth={2}
        style={{ cursor: clickable ? 'pointer' : 'default' }}
        onClick={(evt) => {
          evt?.stopPropagation?.()
          if (!clickable) return
          openFuelPointMap(payload)
        }}
      />
    )
  }

  useEffect(() => {
    // Only load fuel curve for relevant call types (avoid showing/charging for arrets/portes)
    const convType = (conv.type_nc || conv.type || '').toString().toLowerCase().trim()
    const allowed = convType === 'chute_carburant' || convType === 'arret_et_chute_carburant'
    if (!allowed) return
    if (!conv.camion_id || !conv.date_appel) return
    async function loadFuel() {
      try {
        const d = new Date(conv.date_appel).toISOString().split('T')[0]
        const res = await fetch(`/api/carburant/${conv.camion_id}/niveau?date=${d}`)
        const result = await res.json()
        if (result.success && result.data?.niveauData?.length > 0) {
          // Filter to show roughly +/- 2 hours around the call time for better zoom if possible, 
          // or just show the whole day. We'll show the whole day for context.
          setFuelData(result.data.niveauData)
        }
      } catch (e) {
        console.error("Erreur chargement courbe carburant:", e)
      }
    }
    loadFuel()
  }, [conv.camion_id, conv.date_appel, conv.type_nc, conv.type])

  const audioSrc = useMemo(() => {
    if (!conv.fichier_audio) return null
    if (conv.fichier_audio.startsWith('http')) return conv.fichier_audio
    return `${audioUrl}?session_id=${session_id}`
  }, [conv.fichier_audio, session_id])

  const durationLabel = useMemo(() => {
    if (conv.duree_s === null || conv.duree_s === undefined) return '--'
    const total = Math.max(0, Math.round(Number(conv.duree_s)))
    return `${Math.floor(total / 60)}m ${String(total % 60).padStart(2, '0')}s`
  }, [conv.duree_s])

  const dateLabel = useMemo(() => {
    if (!conv.date_appel) return '--'
    try {
      return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(conv.date_appel))
    } catch { return String(conv.date_appel) }
  }, [conv.date_appel])

  const audioFileName = useMemo(() => {
    if (!conv.fichier_audio) return '--'
    return conv.fichier_audio.split('\\').pop()
  }, [conv.fichier_audio])

  const handleMarquerLue = async () => {
    if (!session_id) return
    // 1. localStorage — feedback visuel instantané
    try {
      const lues = new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'))
      lues.add(session_id)
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...lues]))
      setIsMarkedRead(true)
    } catch { }
    // 2. API — mettre etat='conforme' dans les tables source (BDD)
    try {
      const res = await validerConversation(session_id)
      console.log('Validation BDD:', res)
    } catch (e) {
      console.error('Erreur validation BDD:', e)
    }
  }

  if (invalidSession) return <div style={s.page}>Session manquante.</div>
  if (loading) return <div style={s.page}>Chargement…</div>
  if (!data) return <div style={s.page}>Aucune conversation trouvée pour {session_id}</div>

  // ── Prediction gauge arc (SVG) ──
  const gaugeSize = 160
  const gaugeStroke = 14
  const gaugeRadius = (gaugeSize - gaugeStroke) / 2
  const gaugeCirc = Math.PI * gaugeRadius
  const gaugePct = predictionPct != null ? Math.min(100, Math.max(0, predictionPct)) : 0
  const gaugeDash = (gaugePct / 100) * gaugeCirc

  return (
    <>
      <div style={s.page}>
        <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap');
        @keyframes gaugeAnim { from { stroke-dasharray: 0 ${gaugeCirc}; } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .rapport-section { animation: fadeIn 0.4s ease both; }
      `}</style>


        <div style={s.header}>
          <button onClick={() => router.back()} style={s.backButton}>← Retour</button>
          <div>
            <h1 style={s.headerTitle}>Session {session_id}</h1>
            <div style={s.metaRow}>
              <span>Camion: {conv.camion_id || '--'}</span>
              <span>Date: {dateLabel}</span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={s.tags}>
              <span style={s.tag}>{durationLabel}</span>
              <span style={{ ...s.tag, ...s.tagAlt }}>{conv.nb_tours ?? 0} tours</span>
            </div>
            {!isMarkedRead ? (
              <button type="button" onClick={handleMarquerLue}
                style={{
                  border: 'none',
                  background: 'linear-gradient(135deg, #10b981, #059669)',
                  color: '#fff',
                  padding: '10px 20px',
                  borderRadius: 12,
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: '0 4px 14px rgba(16,185,129,0.3)',
                  transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                }}>
                ✅ Marquer comme lue
              </button>
            ) : (
              <span style={{
                background: '#ecfdf5', color: '#065f46', padding: '10px 20px',
                borderRadius: 12, fontSize: 14, fontWeight: 700, border: '1px solid #a7f3d0',
              }}>✅ Marquée comme lue</span>
            )}
          </div>
        </div>

        <div style={s.grid}>
          {/* ── LEFT COLUMN ── */}
          <div style={s.column}>
            <div style={s.card}>
              <div style={s.cardTitle}>🎧 Enregistrement audio</div>
              {audioSrc ? <audio style={s.audioPlayer} controls src={audioSrc} /> :
                <div style={s.empty}>Aucun fichier audio disponible.</div>}
            </div>

            <div style={s.statsRow}>
              <div style={s.stat}><div style={s.statLabel}>Duree</div><div style={s.statValue}>{durationLabel}</div></div>
              <div style={s.stat}><div style={s.statLabel}>Tours</div><div style={s.statValue}>{conv.nb_tours ?? 0}</div></div>
              <div style={s.stat}><div style={s.statLabel}>Session</div><div style={s.statValue}>{session_id}</div></div>
            </div>

            <div style={s.card}>
              <div style={s.cardTitle}>💬 Transcription</div>
              <div style={s.transcript}>
                {messages.length ? messages.map((m, i) => (
                  <div key={`${m.horodatage}-${i}`}
                    style={m.role === 'agent' ? { ...s.message, ...s.messageAgent } : s.message}>
                    <div style={s.messageMeta}>
                      <span style={s.messageRole}>{m.role}</span>
                      {m.horodatage ? ` • ${m.horodatage}` : ''}
                    </div>
                    <div style={s.messageBody}>{m.contenu}</div>
                  </div>
                )) : <div style={s.empty}>Aucun message pour cette session.</div>}
              </div>
            </div>

            {/* ── FUEL CURVE CARD (CORDE DE NIVEAU) ── */}
            {showFuel && (
              <div style={s.card}>
                <div style={{ ...s.cardTitle, justifyContent: 'space-between' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    📉 Courbe de niveau (Carburant)
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 400, color: '#64748b' }}>Axe X: gps_dt</span>
                </div>
                <div style={{ width: '100%', height: 240, marginTop: 16 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={fuelSeries} margin={{ top: 5, right: 5, left: -20, bottom: 5 }} onClick={handleFuelChartClick}>
                      <defs>
                        <linearGradient id="fuelFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#f97316" stopOpacity={0.28} />
                          <stop offset="100%" stopColor="#f97316" stopOpacity={0.03} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis
                        dataKey="ts"
                        type="number"
                        scale="time"
                        domain={['dataMin', 'dataMax']}
                        tick={{ fontSize: 11, fill: '#64748b' }}
                        tickMargin={8}
                        minTickGap={30}
                        tickCount={6}
                        interval="preserveStartEnd"
                        tickFormatter={formatTime}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: '#64748b' }}
                        axisLine={false}
                        tickLine={false}
                        domain={['auto', 'auto']}
                        tickFormatter={(v) => `${v} L`}
                      />
                      <Tooltip
                        contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 8px 24px rgba(15,23,42,0.1)' }}
                        labelStyle={{ fontWeight: 700, color: '#1b1f2a', marginBottom: 4 }}
                        labelFormatter={formatTime}
                        formatter={(val) => [`${val} L`, 'Niveau']}
                      />
                      <Area
                        type="monotone"
                        dataKey="niveau"
                        stroke="#f97316"
                        strokeWidth={3}
                        fill="url(#fuelFill)"
                        dot={<FuelDot />}
                        activeDot={{ r: 6, fill: '#f97316', stroke: '#fff', strokeWidth: 2 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>

          {/* ── RIGHT COLUMN ── */}
          <div style={s.column}>
            {/* ── PREDICTION CARD ── */}
            <div style={{
              ...s.card,
              background: predColor.bg,
              border: `1px solid ${predColor.fill}22`,
              boxShadow: `0 12px 30px ${predColor.glow}`,
            }}>
              <div style={s.cardTitle}>🎯 Prédiction Non-Conformité</div>
              {predictionPct != null ? (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                    {/* Gauge SVG */}
                    <div style={{ position: 'relative', width: gaugeSize, height: gaugeSize / 2 + 20, flexShrink: 0 }}>
                      <svg width={gaugeSize} height={gaugeSize / 2 + 10} viewBox={`0 0 ${gaugeSize} ${gaugeSize / 2 + 10}`}>
                        {/* Background arc */}
                        <path
                          d={`M ${gaugeStroke / 2} ${gaugeSize / 2} A ${gaugeRadius} ${gaugeRadius} 0 0 1 ${gaugeSize - gaugeStroke / 2} ${gaugeSize / 2}`}
                          fill="none" stroke="#e2e8f0" strokeWidth={gaugeStroke} strokeLinecap="round"
                        />
                        {/* Filled arc */}
                        <path
                          d={`M ${gaugeStroke / 2} ${gaugeSize / 2} A ${gaugeRadius} ${gaugeRadius} 0 0 1 ${gaugeSize - gaugeStroke / 2} ${gaugeSize / 2}`}
                          fill="none" stroke={predColor.fill} strokeWidth={gaugeStroke} strokeLinecap="round"
                          strokeDasharray={`${gaugeDash} ${gaugeCirc}`}
                          style={{ animation: 'gaugeAnim 1.2s ease-out', transition: 'stroke-dasharray 0.8s ease' }}
                        />
                      </svg>
                      {/* Percentage text */}
                      <div style={{
                        position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)',
                        fontSize: 32, fontWeight: 800, color: predColor.fill, letterSpacing: '-0.02em',
                      }}>
                        {gaugePct}%
                      </div>
                    </div>
                    {/* Label */}
                    <div style={{ flex: 1 }}>
                      <div style={{
                        fontSize: 15, fontWeight: 700, color: predColor.text, marginBottom: 6,
                      }}>
                        {predictionLabel || 'Analyse en cours'}
                      </div>
                      <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.5 }}>
                        Probabilité que ce cas soit réellement non-conforme, basée sur l'analyse IA de la conversation.
                      </div>
                    </div>
                  </div>

                  {/* ── Cause identifiée (from rapport) ── */}
                  {(() => {
                    const causeSection = rapportSections.find(sec =>
                      sec.title.toLowerCase().includes('cause')
                    )
                    const problemeSection = rapportSections.find(sec =>
                      sec.title.toLowerCase().includes('problème') || sec.title.toLowerCase().includes('probleme')
                    )
                    if (!causeSection && !problemeSection) return null
                    return (
                      <div style={{
                        marginTop: 14,
                        padding: '10px 14px',
                        background: 'rgba(255,255,255,0.65)',
                        borderRadius: 12,
                        border: `1px solid ${predColor.fill}18`,
                      }}>
                        {problemeSection && (
                          <div style={{ marginBottom: causeSection ? 8 : 0 }}>
                            <div style={{
                              fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                              letterSpacing: '0.08em', color: '#7a8194', marginBottom: 3,
                            }}>
                              ⚠️ Problème signalé
                            </div>
                            <div style={{
                              fontSize: 13, fontWeight: 600, color: '#1b1f2a', lineHeight: 1.4,
                            }}>
                              {problemeSection.content}
                            </div>
                          </div>
                        )}
                        {causeSection && (
                          <div>
                            <div style={{
                              fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                              letterSpacing: '0.08em', color: '#7a8194', marginBottom: 3,
                            }}>
                              🔍 Cause identifiée
                            </div>
                            <div style={{
                              fontSize: 13, fontWeight: 600, color: predColor.text, lineHeight: 1.4,
                            }}>
                              {causeSection.content}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })()}
                </div>
              ) : (
                <div style={s.empty}>Prédiction non disponible — le rapport n'a pas encore été généré.</div>
              )}
            </div>

            {/* ── DETAILS CARD ── */}
            <div style={s.card}>
              <div style={s.cardTitle}>📄 Details</div>
              <div style={s.detailGrid}>
                {[
                  ['Camion', conv.camion_id || '--'],
                  ['Session', session_id],
                  ['Date', dateLabel],
                  ['Fichier audio', audioFileName],
                  ['Duree', durationLabel],
                ].map(([label, value]) => (
                  <div key={label} style={s.detailRow}>
                    <span>{label}</span><span style={s.detailValue}>{value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* ── RAPPORT CARD (enhanced) ── */}
            <div style={s.card}>
              <div style={s.cardTitle}>📋 Rapport d'analyse</div>
              {rapportSections.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {rapportSections.map((sec, i) => {
                    const isPrediction = sec.title.toLowerCase().includes('prédiction') || sec.title.toLowerCase().includes('prediction')
                    return (
                      <div key={i} className="rapport-section" style={{
                        background: isPrediction ? predColor.bg : '#f8f9fc',
                        borderRadius: 12, padding: '10px 12px',
                        border: `1px solid ${isPrediction ? predColor.fill + '33' : 'rgba(27,31,42,0.06)'}`,
                        animationDelay: `${i * 0.06}s`,
                      }}>
                        <div style={{
                          fontSize: 12, fontWeight: 700, color: isPrediction ? predColor.text : '#64748b',
                          marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6,
                        }}>
                          <span>{getSectionIcon(sec.title)}</span>
                          <span style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}>{sec.title}</span>
                        </div>
                        <div style={{
                          fontSize: 13, lineHeight: 1.5,
                          color: isPrediction ? predColor.text : '#2b2f3a',
                          fontWeight: isPrediction ? 600 : 400,
                          whiteSpace: 'pre-wrap',
                        }}>
                          {sec.content}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : conv.rapport ? (
                <div style={{
                  whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.5, color: '#2b2f3a',
                  background: '#f8f5ff', borderRadius: 12, padding: 12, border: '1px solid rgba(27,31,42,0.05)',
                }}>{conv.rapport}</div>
              ) : (
                <div style={s.empty}>Aucun rapport disponible.</div>
              )}
            </div>

          </div>
        </div>
      </div>

      <MapModal
        isOpen={isMapOpen}
        onClose={() => setIsMapOpen(false)}
        positions={mapPositions}
        title={
          mapPositions.length === 1
            ? `Position : ${mapPositions[0].label}`
            : 'Localisation sur la carte'
        }
      />
    </>
  )
}
