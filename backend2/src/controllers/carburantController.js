import pool from '../config/database.js';

const toNum = (v) => (v != null ? Number(v) : null);

const getEtatMoteurFromCon = (con) => {
  if (con == null) return 'inconnu';

  if (typeof con === 'number') {
    if (Number.isNaN(con)) return 'inconnu';
    return con > 0 ? 'en_route' : 'arrete';
  }

  const asNumber = Number(con);
  if (!Number.isNaN(asNumber)) {
    return asNumber > 0 ? 'en_route' : 'arrete';
  }

  const normalized = String(con).trim().toLowerCase();
  if (!normalized) return 'inconnu';

  if (
    normalized === 'en_route' || normalized === 'enroute' || normalized === 'route' ||
    normalized === 'moving' || normalized === 'driving' || normalized === 'on' ||
    normalized === 'true' || normalized === 'start'
  ) {
    return 'en_route';
  }

  if (
    normalized === 'arrete' || normalized === 'arret' || normalized === 'stop' ||
    normalized === 'stopped' || normalized === 'off' || normalized === 'false'
  ) {
    return 'arrete';
  }

  return 'inconnu';
};

/* ═══════════════════════════════════════════════════════════════════
   1. getEcartCarburant
      Recherche les ravitaillements d'un camion sur une plage de dates.
      Joint : "total" (mesure GPS) ↔ voyagetracking_ravitaillement (déclaré)
      Chauffeur : voyage_chauffeur via PLAMOTI / CDATE
   ═══════════════════════════════════════════════════════════════════ */
export const getEcartCarburant = async ({ camion, dateStart, dateEnd } = {}) => {
  try {
    if (!camion || !dateStart || !dateEnd) {
      return Response.json({ success: true, data: [], stats: null, chauffeur: null });
    }

    /* ── 1) Ravitaillements LEFT JOIN total ── */
    const query = `
      SELECT
        COALESCE(r.date_trans, r."date"::timestamp) AS date_ravit,
        r.matricule_camion                          AS camion,
        r.lieu,
        COALESCE(r.qtt, 0)::numeric                AS qtt_declaree,
        r.type,
        r.consm_moy,
        r.capacite,
        r.latitude                                  AS lat_ravit,
        r.longitude                                 AS lng_ravit,
        COALESCE(t.qtt_carburant, 0)::numeric       AS qtt_gps,
        COALESCE(t.prix_carburant, 0)::numeric       AS prix,
        t.lat                                       AS lat_gps,
        t.lng                                       AS lng_gps
      FROM voyagetracking_ravitaillement r
      LEFT JOIN "total" t
        ON UPPER(TRIM(t.camion))  = UPPER(TRIM(r.matricule_camion))
        AND DATE(t."date")        = DATE(COALESCE(r.date_trans, r."date"))
        AND UPPER(TRIM(COALESCE(t.lieu, ''))) = UPPER(TRIM(COALESCE(r.lieu, '')))
      WHERE UPPER(TRIM(r.matricule_camion)) = UPPER(TRIM($1))
        AND DATE(COALESCE(r.date_trans, r."date")) >= $2
        AND DATE(COALESCE(r.date_trans, r."date")) <= $3
      ORDER BY COALESCE(r.date_trans, r."date"::timestamp) ASC
    `;
    const result = await pool.query(query, [camion, dateStart, dateEnd]);

    /* ── 2) Format rows ── */
    const rows = result.rows.map((row) => {
      const d = row.date_ravit ? new Date(row.date_ravit) : null;
      const qttGps      = toNum(row.qtt_gps) || 0;
      const qttDeclaree = toNum(row.qtt_declaree) || 0;
      const ecart       = Math.round((qttGps - qttDeclaree) * 10) / 10;

      let statut = 'conforme';
      if (Math.abs(ecart) > 5)      statut = 'fraude';
      else if (Math.abs(ecart) > 2) statut = 'suspect';

      return {
        date:     d ? d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—',
        dateISO:  d ? d.toISOString().split('T')[0] : null,
        heure:    d ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : '—',
        camion:   row.camion || camion,
        qttGps,
        qttDeclaree,
        ecart,
        lieu:       row.lieu || '—',
        prix:       toNum(row.prix) || 0,
        type:       row.type || '—',
        capacite:   toNum(row.capacite) || null,
        consm_moy:  row.consm_moy || '—',
        statut,
        latGps:   toNum(row.lat_gps),
        lngGps:   toNum(row.lng_gps),
        latRavit: toNum(row.lat_ravit),
        lngRavit: toNum(row.lng_ravit),
      };
    });

    /* ── 4) KPI stats ── */
    const totalGps      = rows.reduce((s, r) => s + r.qttGps, 0);
    const totalDeclaree = rows.reduce((s, r) => s + r.qttDeclaree, 0);
    const totalPrix     = rows.reduce((s, r) => s + r.prix, 0);
    const ecartGlobal   = Math.round((totalGps - totalDeclaree) * 10) / 10;
    const alertes       = rows.filter(r => r.statut !== 'conforme').length;

    const stats = {
      totalGps:           Math.round(totalGps * 10) / 10,
      totalDeclaree:      Math.round(totalDeclaree * 10) / 10,
      nbRavitaillements:  rows.length,
      totalPrix:          Math.round(totalPrix * 100) / 100,
      ecartGlobal,
      alertes,
      type:     rows[0]?.type || '—',
      capacite: rows[0]?.capacite || null,
    };

    return Response.json({
      success: true,
      data: rows,
      stats,
      meta: { camion, dateStart, dateEnd },
    });
  } catch (error) {
    console.error('Error getEcartCarburant:', error);
    return Response.json(
      { success: false, message: 'Erreur lors du calcul', error: process.env.NODE_ENV === 'development' ? error.message : undefined },
      { status: 500 },
    );
  }
};

/* ═══════════════════════════════════════════════════════════════════
   2. getEcartCarburantByCamion  (alias – route [camion])
   ═══════════════════════════════════════════════════════════════════ */
export const getEcartCarburantByCamion = async (camion, params = {}) => {
  return getEcartCarburant({ camion, ...params });
};

/* ═══════════════════════════════════════════════════════════════════
   3. getNiveauCarburant
      Courbe de niveau réservoir pour un camion sur une journée / plage.
      Sources : mesure (fuel + GPS) + voyagetracking_ravitaillement + voyage_chauffeur
   ═══════════════════════════════════════════════════════════════════ */
export const getNiveauCarburant = async (camion, { date, dateStart, dateEnd }) => {
  try {
    const start = dateStart || date || new Date().toISOString().split('T')[0];
    const end   = dateEnd   || date || start;

    /* ── Points GPS + niveau réel (table mesure) ── */
    const mesureQuery = `
      SELECT DISTINCT ON (date_trunc('hour', m.gps_dt))
        m.gps_dt,
        m.fuel,
        m.latitude,
        m.longitude,
        m.con
      FROM mesures m
      WHERE UPPER(TRIM(m.camion::text)) = UPPER(TRIM($1))
        AND DATE(m.gps_dt) >= $2
        AND DATE(m.gps_dt) <= $3
        AND m.latitude IS NOT NULL AND m.longitude IS NOT NULL
      ORDER BY date_trunc('hour', m.gps_dt), m.gps_dt ASC
    `;
    const mesureResult = await pool.query(mesureQuery, [camion, start, end]);

    /* ── Ravitaillements (pour repérer les pleins sur le graphe) ── */
    const ravitQuery = `
      SELECT
        COALESCE(r.date_trans, r."date"::timestamp) AS date_ravit,
        r.qtt, r.lieu, r.capacite
      FROM voyagetracking_ravitaillement r
      WHERE UPPER(TRIM(r.matricule_camion)) = UPPER(TRIM($1))
        AND DATE(COALESCE(r.date_trans, r."date")) >= $2
        AND DATE(COALESCE(r.date_trans, r."date")) <= $3
      ORDER BY COALESCE(r.date_trans, r."date"::timestamp) ASC
    `;
    const ravitResult = await pool.query(ravitQuery, [camion, start, end]);

    /* ── Build ravitaillement lookup (by hour) ── */
    const ravitHours = new Set();
    ravitResult.rows.forEach(r => {
      if (r.date_ravit) ravitHours.add(new Date(r.date_ravit).getHours());
    });

    /* ── Construire les données de niveau (fuel réel) ── */
    const capacite = toNum(ravitResult.rows[0]?.capacite) || 300;
    const mesurePoints = mesureResult.rows;

    const niveauData = mesurePoints.map((pt) => {
      const ts    = new Date(pt.gps_dt);
      const heure = `${String(ts.getHours()).padStart(2, '0')}:${String(ts.getMinutes()).padStart(2, '0')}`;
      const fuel  = toNum(pt.fuel) || 0;
      const etatMoteur = getEtatMoteurFromCon(pt.con);

      return {
        heure,
        niveau:    Math.round(fuel * 10) / 10,
        latitude:  Number(pt.latitude),
        longitude: Number(pt.longitude),
        con:       toNum(pt.con),
        conRaw:    pt.con,
        etatMoteur,
        speed:     0,   // pas de vitesse dans mesure – on garde la clé pour le front
        timestamp: pt.gps_dt,
        ravitaillement: ravitHours.has(ts.getHours()),
      };
    });

    return Response.json({
      success: true,
      data: {
        camion,
        dateStart: start,
        dateEnd:   end,
        capacite,
        niveauData,
        ravitaillements: ravitResult.rows.map(r => ({
          date:     r.date_ravit,
          quantite: Number(r.qtt) || 0,
          lieu:     r.lieu || '—',
        })),
        stats: {
          nbPleins: ravitResult.rows.length,
        },
      },
    });
  } catch (error) {
    console.error('Error getNiveauCarburant:', error);
    return Response.json(
      { success: false, message: 'Erreur', error: process.env.NODE_ENV === 'development' ? error.message : undefined },
      { status: 500 },
    );
  }
};
