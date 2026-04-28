import pool from "../config/database.js";

const toNum = (v) => (v != null ? Number(v) : null);

const getEtatMoteurFromCon = (con) => {
  if (con == null) return "inconnu";

  if (typeof con === "number") {
    if (Number.isNaN(con)) return "inconnu";
    return con > 0 ? "en_route" : "arrete";
  }

  const asNumber = Number(con);
  if (!Number.isNaN(asNumber)) {
    return asNumber > 0 ? "en_route" : "arrete";
  }

  const normalized = String(con).trim().toLowerCase();
  if (!normalized) return "inconnu";

  if (
    normalized === "en_route" ||
    normalized === "enroute" ||
    normalized === "route" ||
    normalized === "moving" ||
    normalized === "driving" ||
    normalized === "on" ||
    normalized === "true" ||
    normalized === "start"
  ) {
    return "en_route";
  }

  if (
    normalized === "arrete" ||
    normalized === "arret" ||
    normalized === "stop" ||
    normalized === "stopped" ||
    normalized === "off" ||
    normalized === "false"
  ) {
    return "arrete";
  }

  return "inconnu";
};

/* ═══════════════════════════════════════════════════════════════════
   1. getEcartCarburant
      Recherche les ravitaillements d'un camion sur une plage de dates.
      Joint : "total" (mesure GPS) ↔ voyagetracking_ravitaillement (déclaré)
      Chauffeur : voyage_chauffeur via PLAMOTI / CDATE
   ═══════════════════════════════════════════════════════════════════ */
export const getEcartCarburant = async ({
  camion,
  date,
  dateStart,
  dateEnd,
  chauffeur,
  categorie,
  site,
} = {}) => {
  try {
    const today = new Date();
    const defaultEnd = today.toISOString().split("T")[0];
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const defaultStart = weekAgo.toISOString().split("T")[0];

    const start = dateStart || date || defaultStart;
    const end = dateEnd || start || defaultEnd;

    const filters = {
      camion: camion || null,
    };

    const query = `
      WITH tt AS (
        SELECT
          t.num_ticket,
          t.matricule,
          t.client,
          t.nom_carte,
          t.code_chauffeur,
          t.type_carte,
          t.produit,
          t.quantite,
          t.kilometres,
          t.montant,
          t.prix_unitaire,
          t.lieu,
          t.date_transaction,
          t.heure,
          (
            t.date_transaction::date +
            COALESCE(
              CASE
                WHEN NULLIF(TRIM(t.heure::text), '') IS NULL THEN NULL
                WHEN TRIM(t.heure::text) ~ '^[0-9]{1,2}:[0-9]{2}(:[0-9]{2})?$' THEN t.heure::time
                ELSE NULL
              END,
              time '00:00'
            )
          ) AS ts
        FROM total t
        WHERE t.date_transaction::date >= $1::date
          AND t.date_transaction::date <= $2::date
          AND ($3::text IS NULL OR UPPER(TRIM(t.matricule)) = UPPER(TRIM($3::text)))
      )
      SELECT
        tt.ts,
        tt.date_transaction,
        tt.heure,
        tt.matricule,
        tt.type_carte,
        tt.num_ticket,
        tt.produit,
        tt.quantite,
        tt.kilometres,
        tt.montant,
        tt.lieu AS lieu_station,
        COALESCE(vr.chauffeur, tt.nom_carte, tt.client, '—') AS chauffeur,
        vr.qtt AS qtt_gps,
        vr.kms AS kms_gps,
        vr.system_source,
        vr.latitude,
        vr.longitude,
        vr.lieu AS lieu_gps,
        vr.prod AS produit_gps,
        vr.no_ticket AS ticket_gps,
        vr.date_trans AS gps_ts
      FROM tt
      LEFT JOIN LATERAL (
        SELECT
          r.*,
          ABS(EXTRACT(EPOCH FROM (COALESCE(r.date_trans, r."date"::timestamp) - tt.ts))) AS time_gap,
          ABS(COALESCE(r.qtt, 0)::numeric - COALESCE(tt.quantite, 0)::numeric) AS qty_gap,
          CASE
            WHEN tt.num_ticket IS NOT NULL
             AND NULLIF(TRIM(tt.num_ticket::text), '') IS NOT NULL
             AND r.no_ticket IS NOT NULL
             AND NULLIF(TRIM(r.no_ticket::text), '') IS NOT NULL
             AND TRIM(tt.num_ticket::text) = TRIM(r.no_ticket::text)
            THEN 0 ELSE 1
          END AS ticket_rank
        FROM voyagetracking_ravitaillement r
        WHERE UPPER(TRIM(r.matricule_camion)) = UPPER(TRIM(tt.matricule))
          AND DATE(COALESCE(r.date_trans, r."date"::timestamp)) >= (tt.date_transaction::date - INTERVAL '1 day')
          AND DATE(COALESCE(r.date_trans, r."date"::timestamp)) <= (tt.date_transaction::date + INTERVAL '1 day')
        ORDER BY ticket_rank ASC, time_gap ASC, qty_gap ASC
        LIMIT 1
      ) vr ON TRUE
      ORDER BY tt.ts ASC
    `;

    const result = await pool.query(query, [start, end, filters.camion]);

    const rows = result.rows.map((row) => {
      const qteGps = toNum(row.qtt_gps) || 0;
      const qteRav = toNum(row.quantite) || 0;
      const ecart = Math.round((qteRav - qteGps) * 10) / 10;
      const km = toNum(row.kilometres) || toNum(row.kms_gps) || 0;
      const conf =
        qteRav > 0
          ? Math.max(0, Math.min(100, 100 - (Math.abs(ecart) / qteRav) * 100))
          : 0;
      const conformite = `${Math.round(conf)}%`;

      return {
        date: row.ts
          ? new Date(row.ts).toISOString().slice(0, 16).replace("T", " ")
          : "—",
        camion: row.matricule || "—",
        type: row.type_carte || "—",
        chauffeur: row.chauffeur || "—",
        lieu: row.lieu_station || row.lieu_gps || "—",
        qteGps,
        qteRav,
        ecart,
        km,
        vitesse: "--",
        conformite,
        alert: Math.abs(ecart) >= 10,
        categorie: row.produit || row.produit_gps || "—",
        site: row.lieu_station || row.lieu_gps || "—",
        noTicket: row.num_ticket || row.ticket_gps || "—",
        latitude: toNum(row.latitude),
        longitude: toNum(row.longitude),
      };
    });

    const norm = (v) =>
      String(v || "")
        .trim()
        .toLowerCase();
    const filteredRows = rows.filter((r) => {
      if (chauffeur && norm(r.chauffeur) !== norm(chauffeur)) return false;
      if (categorie && norm(r.categorie) !== norm(categorie)) return false;
      if (site && norm(r.site) !== norm(site)) return false;
      return true;
    });

    const totalRav = filteredRows.reduce((sum, r) => sum + r.qteRav, 0);
    const totalGps = filteredRows.reduce((sum, r) => sum + r.qteGps, 0);
    const ecartTotal = filteredRows.reduce(
      (sum, r) => sum + Math.abs(r.ecart),
      0,
    );
    const alertesVol = filteredRows.filter(
      (r) => Math.abs(r.ecart) >= 10,
    ).length;
    const reclamations = filteredRows.filter(
      (r) => Math.abs(r.ecart) >= 15,
    ).length;
    const conformes = filteredRows.filter((r) => Math.abs(r.ecart) <= 5).length;
    const tauxConformite =
      filteredRows.length > 0
        ? Math.round((conformes / filteredRows.length) * 100)
        : 0;

    const unique = (arr) =>
      Array.from(new Set(arr.filter(Boolean))).sort((a, b) =>
        String(a).localeCompare(String(b), "fr"),
      );

    const filtersData = {
      camions: unique(rows.map((r) => r.camion)),
      chauffeurs: unique(rows.map((r) => r.chauffeur)),
      categories: unique(rows.map((r) => r.categorie)),
      sites: unique(rows.map((r) => r.site)),
    };

    return {
      success: true,
      data: filteredRows,
      stats: {
        ecartTotal: Math.round(ecartTotal * 10) / 10,
        tauxConformite,
        alertesVol,
        reclamations,
        totalRav: Math.round(totalRav * 10) / 10,
        totalGps: Math.round(totalGps * 10) / 10,
        transactions: filteredRows.length,
      },
      filters: filtersData,
      meta: { dateStart: start, dateEnd: end },
    };
  } catch (error) {
    console.error("Error getEcartCarburant:", error);
    return {
      success: false,
      message: "Erreur lors du calcul",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
      data: [],
      stats: { total: 0, alerts: 0, ok: 0 },
    };
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
export const getNiveauCarburant = async (
  camion,
  { date, dateStart, dateEnd },
) => {
  try {
    const start = dateStart || date || new Date().toISOString().split("T")[0];
    const end = dateEnd || date || start;

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
    ravitResult.rows.forEach((r) => {
      if (r.date_ravit) ravitHours.add(new Date(r.date_ravit).getHours());
    });

    /* ── Construire les données de niveau (fuel réel) ── */
    const capacite = toNum(ravitResult.rows[0]?.capacite) || 300;
    const mesurePoints = mesureResult.rows;

    const niveauData = mesurePoints.map((pt) => {
      const ts = new Date(pt.gps_dt);
      const heure = `${String(ts.getHours()).padStart(2, "0")}:${String(ts.getMinutes()).padStart(2, "0")}`;
      const fuel = toNum(pt.fuel) || 0;
      const etatMoteur = getEtatMoteurFromCon(pt.con);

      return {
        heure,
        niveau: Math.round(fuel * 10) / 10,
        latitude: Number(pt.latitude),
        longitude: Number(pt.longitude),
        con: toNum(pt.con),
        conRaw: pt.con,
        etatMoteur,
        speed: 0, // pas de vitesse dans mesure – on garde la clé pour le front
        timestamp: pt.gps_dt,
        ravitaillement: ravitHours.has(ts.getHours()),
      };
    });

    return Response.json({
      success: true,
      data: {
        camion,
        dateStart: start,
        dateEnd: end,
        capacite,
        niveauData,
        ravitaillements: ravitResult.rows.map((r) => ({
          date: r.date_ravit,
          quantite: Number(r.qtt) || 0,
          lieu: r.lieu || "—",
        })),
        stats: {
          nbPleins: ravitResult.rows.length,
        },
      },
    });
  } catch (error) {
    console.error("Error getNiveauCarburant:", error);
    return Response.json(
      {
        success: false,
        message: "Erreur",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 },
    );
  }
};
