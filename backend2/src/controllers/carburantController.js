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

const isAnomalie = (statut) => statut && statut !== "normal";

const formatDateKey = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const buildDateRange = (start, end) => {
  const dates = [];
  const cursor = new Date(`${start}T00:00:00`);
  const last = new Date(`${end}T00:00:00`);

  while (cursor <= last) {
    dates.push(formatDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
};

/* ═══════════════════════════════════════════════════════════════════
   Table anomalie_carburant — auto-create si inexistante
   ═══════════════════════════════════════════════════════════════════ */
let _anomalieTableReady = false;
const ensureAnomalieTable = async () => {
  if (_anomalieTableReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS anomalie_carburant (
      id SERIAL PRIMARY KEY,
      matricule VARCHAR(100) NOT NULL,
      date_transaction DATE NOT NULL,
      num_ticket VARCHAR(100) NOT NULL DEFAULT '',
      statut VARCHAR(20) NOT NULL DEFAULT 'EN_ATTENTE',
      commentaire TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(matricule, date_transaction, num_ticket)
    )
  `);
  _anomalieTableReady = true;
};

/* ═══════════════════════════════════════════════════════════════════
   Table reclamation_carburant — auto-create si inexistante
   ═══════════════════════════════════════════════════════════════════ */
let _reclamationTableReady = false;
const ensureReclamationTable = async () => {
  if (_reclamationTableReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS reclamation_carburant (
      id SERIAL PRIMARY KEY,
      matricule VARCHAR(100) NOT NULL,
      date_transaction DATE NOT NULL,
      num_ticket VARCHAR(100) NOT NULL DEFAULT '',
      commentaire TEXT NOT NULL,
      soumis_par VARCHAR(200) DEFAULT '',
      chauffeur VARCHAR(200) DEFAULT '',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(matricule, date_transaction, num_ticket)
    )
  `);

  // Migrations — ajouter les colonnes si elles n'existent pas
  try {
    await pool.query(`
      ALTER TABLE reclamation_carburant
      ADD COLUMN IF NOT EXISTS soumis_par VARCHAR(200) DEFAULT ''
    `);
    await pool.query(`
      ALTER TABLE reclamation_carburant
      ADD COLUMN IF NOT EXISTS chauffeur VARCHAR(200) DEFAULT ''
    `);
  } catch (_) { /* colonnes déjà existantes */ }

  _reclamationTableReady = true;
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
      WITH common_matricules AS (
        SELECT DISTINCT UPPER(TRIM(t.matricule)) as matricule
        FROM total t
        WHERE DATE(t.date_transaction) >= $1::date
          AND DATE(t.date_transaction) <= $2::date
          AND EXISTS (
            SELECT 1 FROM voyagetracking_ravitaillement r
            WHERE UPPER(TRIM(r.matricule_camion)) = UPPER(TRIM(t.matricule))
              AND DATE(COALESCE(r.date_trans, r."date")) >= $1::date
              AND DATE(COALESCE(r.date_trans, r."date")) <= $2::date
          )
          AND ($3::text IS NULL OR UPPER(TRIM(t.matricule)) = UPPER(TRIM($3::text)))
      ),
      tt AS (
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
          t.kilometres_avant,
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
        WHERE DATE(t.date_transaction) >= $1::date
          AND DATE(t.date_transaction) <= $2::date
          AND UPPER(TRIM(t.matricule)) IN (SELECT matricule FROM common_matricules)
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
        tt.kilometres_avant,
        tt.montant,
        tt.lieu AS lieu_station,
        COALESCE(vr.chauffeur, tt.code_chauffeur, tt.nom_carte, '—') AS chauffeur,
        vr.qtt AS qtt_gps,
        vr.kms AS kms_gps,
        vr.system_source,
        vr.latitude,
        vr.longitude,
        vr.lieu AS lieu_gps,
        vr.prod AS produit_gps,
     
        vr.no_ticket AS ticket_gps,
        vr.date_trans AS gps_ts,
        vr.type AS type_camion_gps,
        vr.capacite AS capacite_gps,
        vr.consm_moy,
        co.categorie AS categorie_camion,
        co.obj AS objectif_camion
      FROM tt
      INNER JOIN voyagetracking_ravitaillement vr ON (
        UPPER(TRIM(vr.matricule_camion)) = UPPER(TRIM(tt.matricule))
        AND DATE(COALESCE(vr.date_trans, vr."date")) = DATE(tt.ts)
      )
      LEFT JOIN camion_objectif co ON UPPER(TRIM(co.matricule)) = UPPER(TRIM(tt.matricule))
      ORDER BY tt.ts ASC, ABS(EXTRACT(EPOCH FROM (COALESCE(vr.date_trans, vr."date"::timestamp) - tt.ts))) ASC
 
    `;

    const result = await pool.query(query, [start, end, filters.camion]);

    // Grouper par transaction et prendre le meilleur match (plus proche temporellement)
    const transactionMap = new Map();

    result.rows.forEach((row) => {
      const key = `${row.matricule}-${row.date_transaction}-${row.num_ticket}`;
      if (!transactionMap.has(key) || row.qtt_gps != null) {
        transactionMap.set(key, row);
      }
    });

    const rows = Array.from(transactionMap.values()).map((row) => {
      const qteGps = toNum(row.qtt_gps) || 0;
      const qteRav = toNum(row.quantite) || 0;
      const ecart = Math.round((qteRav - qteGps) * 10) / 10;
      const km =
        row.kilometres != null && row.kilometres_avant != null
          ? toNum(row.kilometres) - toNum(row.kilometres_avant)
          : toNum(row.kilometres) || toNum(row.kms_gps) || 0;
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
        conformite,
        alert: Math.abs(ecart) >= 10,
        dateRaw: row.date_transaction
          ? new Date(row.date_transaction).toISOString().split("T")[0]
          : null,
        categorie: row.produit || row.produit_gps || "—",
        site: row.lieu_station || row.lieu_gps || "—",
        noTicket: row.num_ticket || row.ticket_gps || "—",
        latitude: toNum(row.latitude),
        longitude: toNum(row.longitude),
        type_camion_gps: row.type_camion_gps || row.categorie_camion || "NPR",
        capacite_gps: toNum(row.capacite_gps) || 250,
        objectif_camion:
          toNum(row.objectif_camion) || toNum(row.consm_moy) || 16,
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

    // -------- INTEGRATION API MACHINE LEARNING --------
    try {
      if (filteredRows.length > 0) {
        const mlPayload = filteredRows.map((r) => {
          const dt = new Date(r.date !== "—" ? r.date : Date.now());
          return {
            kilometrage: r.km || 100,
            type_camion: r.type_camion_gps,
            objectif_camion: r.objectif_camion,
            capacite: r.capacite_gps,
            heure_depart: 8,
            jour_semaine: dt.getDay(),
            conditions_meteo: "ensoleillé", // Reconnu par le modèle
            weathercode_raw: 1,
            type_trajet: "route_principale", // Reconnu par le modèle ('autoroute', 'route_principale', 'route_secondaire')
            latitude: r.latitude || 36.8,
            longitude: r.longitude || 10.1,
            mois: dt.getMonth() + 1,
            heure_transaction: dt.getHours(),
            quantite_station: r.qteRav,
            quantite_gps: r.qteGps,
          };
        });

        // Appel à l'API FastAPI (Port 8000)
        const mlResponse = await fetch("http://127.0.0.1:8000/predict_batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(mlPayload),
        });

        if (mlResponse.ok) {
          const mlData = await mlResponse.json();
          mlData.forEach((res, i) => {
            filteredRows[i].statut = res.statut; // Injection du statut ML
            filteredRows[i].ml_details = res.details; // Injection des détails pour l'infobulle
          });
        }
      }
    } catch (e) {
      console.warn("API ML injoignable, on utilise la logique basique.");
    }
    // ---------------------------------------------------

    // -------- MERGE PERSISTED ANOMALY DECISIONS --------
    try {
      await ensureAnomalieTable();
      const persistedResult = await pool.query(
        `SELECT UPPER(TRIM(matricule)) AS matricule,
                TO_CHAR(date_transaction::date, 'YYYY-MM-DD') AS date_key,
                COALESCE(NULLIF(TRIM(num_ticket), ''), '') AS num_ticket_key,
                statut AS statut_decision, commentaire
         FROM anomalie_carburant
         WHERE date_transaction::date >= $1::date AND date_transaction::date <= $2::date`,
        [start, end],
      );

      const decisionMap = new Map();
      const decisionDateMap = new Map();
      persistedResult.rows.forEach((row) => {
        const d = row.date_key || "";
        const ticket = String(row.num_ticket_key || "").trim();
        const exactKey = `${row.matricule}-${d}-${ticket}`;
        const dateOnlyKey = `${row.matricule}-${d}`;

        decisionMap.set(exactKey, {
          statut: row.statut_decision,
          commentaire: row.commentaire,
        });

        if (!decisionDateMap.has(dateOnlyKey)) {
          decisionDateMap.set(dateOnlyKey, {
            statut: row.statut_decision,
            commentaire: row.commentaire,
          });
        }
      });

      filteredRows.forEach((row) => {
        const isAnomaly = row.statut && row.statut !== "normal";
        if (isAnomaly) {
          const dateStr = row.dateRaw || "";
          const ticket =
            row.noTicket && row.noTicket !== "—" && row.noTicket !== "-"
              ? String(row.noTicket).trim()
              : "";
          const matriculeKey = String(row.camion).trim().toUpperCase();
          const exactKey = `${matriculeKey}-${dateStr}-${ticket}`;
          const dateOnlyKey = `${matriculeKey}-${dateStr}`;
          const decision =
            decisionMap.get(exactKey) || decisionDateMap.get(dateOnlyKey);
          if (decision) {
            row.statut_decision = decision.statut;
            row.commentaire_decision = decision.commentaire;
          } else {
            row.statut_decision = "EN_ATTENTE";
          }
          row.ml_statut = row.statut;
        } else {
          row.statut_decision = null;
        }
      });
    } catch (e) {
      console.warn("Erreur lecture anomalie_carburant:", e.message);
      filteredRows.forEach((row) => {
        if (row.statut && row.statut !== "normal") {
          row.statut_decision = "EN_ATTENTE";
          row.ml_statut = row.statut;
        }
      });
    }
    // ---------------------------------------------------

    const totalRav = filteredRows.reduce((sum, r) => sum + r.qteRav, 0);
    const totalGps = filteredRows.reduce((sum, r) => sum + r.qteGps, 0);
    const ecartTotal = filteredRows.reduce(
      (sum, r) => sum + Math.abs(r.ecart),
      0,
    );
    const anomaliesDetectees = filteredRows.filter((r) =>
      isAnomalie(r.statut),
    ).length;
    const tauxFraudeDetecte =
      filteredRows.length > 0
        ? Math.round((anomaliesDetectees / filteredRows.length) * 100)
        : 0;

    const camionsCritiques = new Map();
    filteredRows.forEach((row) => {
      if (row.statut !== "anomalie_critique") return;
      const camionKey = String(row.camion || "")
        .trim()
        .toUpperCase();
      if (!camionKey) return;
      camionsCritiques.set(
        camionKey,
        (camionsCritiques.get(camionKey) || 0) + 1,
      );
    });
    const camionsARisque = Array.from(camionsCritiques.values()).filter(
      (count) => count >= 2,
    ).length;

    const riskDays = buildDateRange(start, end);
    const dailyRiskMap = new Map(riskDays.map((day) => [day, 0]));
    filteredRows.forEach((row) => {
      const dateKey = row.dateRaw || null;
      if (!dateKey || !dailyRiskMap.has(dateKey)) return;
      dailyRiskMap.set(
        dateKey,
        dailyRiskMap.get(dateKey) + Math.abs(row.ecart),
      );
    });

    const risqueGaspillageSerie = riskDays.map((day) => ({
      date: day,
      value: Math.round((dailyRiskMap.get(day) || 0) * 10) / 10,
    }));
    const risqueGaspillageMoyen =
      riskDays.length > 0
        ? Math.round((ecartTotal / riskDays.length) * 10) / 10
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
        gaspillageTotal: Math.round(ecartTotal * 10) / 10,
        tauxFraudeDetecte,
        fraudesDetectees: anomaliesDetectees,
        camionsARisque,
        risqueGaspillageMoyen,
        risqueGaspillageSerie,
        ecartTotal: Math.round(ecartTotal * 10) / 10,
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
      SELECT DISTINCT ON (date_trunc('minute', m.gps_dt))
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
      ORDER BY date_trunc('minute', m.gps_dt), m.gps_dt ASC
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

/* ═══════════════════════════════════════════════════════════════════
   4. updateAnomalieStatut
      Persiste la décision utilisateur (EN_ATTENTE / CONFIRMEE / REJETEE)
   ═══════════════════════════════════════════════════════════════════ */
export const updateAnomalieStatut = async ({
  matricule,
  dateTransaction,
  numTicket,
  statut,
  commentaire,
}) => {
  try {
    await ensureAnomalieTable();

    // Normalize numTicket: treat placeholder '—' or '-' as empty string
    const normalizeTicket = (t) => {
      if (t == null) return "";
      const s = String(t).trim();
      return s === "—" || s === "-" ? "" : s;
    };
    const nt = normalizeTicket(numTicket);

    const result = await pool.query(
      `INSERT INTO anomalie_carburant (matricule, date_transaction, num_ticket, statut, commentaire, updated_at)
       VALUES (UPPER(TRIM($1)), $2::date, $3, $4, $5, NOW())
       ON CONFLICT (matricule, date_transaction, num_ticket)
       DO UPDATE SET statut = $4, commentaire = COALESCE($5, anomalie_carburant.commentaire), updated_at = NOW()
       RETURNING *`,
      [matricule, dateTransaction, nt, statut, commentaire || ""],
    );

    return { success: true, data: result.rows[0] };
  } catch (error) {
    console.error("Error updateAnomalieStatut:", error);
    return {
      success: false,
      message: error.message,
    };
  }
};

/* ═══════════════════════════════════════════════════════════════════
   5. submitReclamation
      Enregistre une réclamation pour une anomalie confirmée
   ═══════════════════════════════════════════════════════════════════ */
export const submitReclamation = async ({
  matricule,
  dateTransaction,
  numTicket,
  commentaire,
  soumisPar,
  chauffeur,
}) => {
  try {
    await ensureReclamationTable();
    await ensureAnomalieTable();

    // Normalize numTicket: treat placeholder '—' or '-' as empty string
    const normalizeTicketR = (t) => {
      if (t == null) return "";
      const s = String(t).trim();
      return s === "—" || s === "-" ? "" : s;
    };
    const ntR = normalizeTicketR(numTicket);

    // Enregistrer la réclamation
    const nomSoumis = (soumisPar || "").trim();
    const nomChauffeur = (chauffeur || "").trim();
    const reclamationResult = await pool.query(
      `INSERT INTO reclamation_carburant (matricule, date_transaction, num_ticket, commentaire, soumis_par, chauffeur)
       VALUES (UPPER(TRIM($1)), $2::date, $3, $4, $5, $6)
       ON CONFLICT (matricule, date_transaction, num_ticket)
       DO UPDATE SET commentaire = $4, soumis_par = $5, chauffeur = $6
       RETURNING *`,
      [matricule, dateTransaction, ntR, commentaire || "", nomSoumis, nomChauffeur],
    );

    // Mettre à jour le statut de l'anomalie à CONFIRMEE (utiliser INSERT...ON CONFLICT comme Rejeter)
    console.log("submitReclamation - Inserting/Updating anomalie with key:", {
      matricule,
      dateTransaction,
      numTicket: ntR,
      statut: "CONFIRMEE",
    });

    const anomalieResult = await pool.query(
      `INSERT INTO anomalie_carburant (matricule, date_transaction, num_ticket, statut, commentaire, updated_at)
       VALUES (UPPER(TRIM($1)), $2::date, $3, 'CONFIRMEE', $4, NOW())
       ON CONFLICT (matricule, date_transaction, num_ticket)
       DO UPDATE SET statut = 'CONFIRMEE', commentaire = COALESCE($4, anomalie_carburant.commentaire), updated_at = NOW()
       RETURNING *`,
      [matricule, dateTransaction, ntR, commentaire || ""],
    );

    console.log("submitReclamation - Anomalie upsert result:", {
      rowCount: anomalieResult.rowCount,
      statut: anomalieResult.rows[0]?.statut,
    });

    return { success: true, data: reclamationResult.rows[0] };
  } catch (error) {
    console.error("Error submitReclamation:", error);
    return {
      success: false,
      message: error.message,
    };
  }
};

/* ═══════════════════════════════════════════════════════════════════
   6. getReclamations
      Liste toutes les réclamations avec le statut anomalie associé
   ═══════════════════════════════════════════════════════════════════ */
export const getReclamations = async ({
  matricule,
  dateStart,
  dateEnd,
} = {}) => {
  try {
    await ensureReclamationTable();
    await ensureAnomalieTable();

    let paramIndex = 1;
    const conditions = [];
    const params = [];

    if (dateStart) {
      conditions.push(`r.date_transaction::date >= $${paramIndex}::date`);
      params.push(dateStart);
      paramIndex++;
    }

    if (dateEnd) {
      conditions.push(`r.date_transaction::date <= $${paramIndex}::date`);
      params.push(dateEnd);
      paramIndex++;
    }

    if (matricule) {
      conditions.push(`UPPER(TRIM(r.matricule)) = UPPER(TRIM($${paramIndex}))`);
      params.push(matricule);
      paramIndex++;
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const query = `
      SELECT
        r.id,
        r.matricule,
        TO_CHAR(r.date_transaction, 'YYYY-MM-DD') AS date_transaction,
        r.num_ticket,
        r.commentaire,
        COALESCE(r.soumis_par, '') AS soumis_par,
        COALESCE(r.chauffeur, '') AS chauffeur,
        r.created_at,
        COALESCE(a.statut, 'CONFIRMEE') AS statut_anomalie,
        a.commentaire AS commentaire_anomalie,
        a.updated_at AS anomalie_updated_at
      FROM reclamation_carburant r
      LEFT JOIN anomalie_carburant a ON (
        UPPER(TRIM(a.matricule)) = UPPER(TRIM(r.matricule))
        AND a.date_transaction = r.date_transaction
        AND COALESCE(NULLIF(TRIM(a.num_ticket), ''), '') = COALESCE(NULLIF(TRIM(r.num_ticket), ''), '')
      )
      ${whereClause}
      ORDER BY r.created_at DESC
    `;

    const result = await pool.query(query, params);

    const data = result.rows.map((row) => ({
      id: row.id,
      matricule: row.matricule,
      dateTransaction: row.date_transaction,
      numTicket: row.num_ticket || "—",
      commentaire: row.commentaire || "",
      soumisPar: row.soumis_par || "",
      chauffeur: row.chauffeur || "",
      createdAt: row.created_at,
      statutAnomalie: row.statut_anomalie,
      commentaireAnomalie: row.commentaire_anomalie || "",
      anomalieUpdatedAt: row.anomalie_updated_at,
    }));

    // Stats
    const total = data.length;
    const confirmees = data.filter(
      (d) => d.statutAnomalie === "CONFIRMEE",
    ).length;
    const enAttente = data.filter(
      (d) => d.statutAnomalie === "EN_ATTENTE",
    ).length;
    const rejetees = data.filter((d) => d.statutAnomalie === "REJETEE").length;
    const matricules = [...new Set(data.map((d) => d.matricule))].sort();

    return {
      success: true,
      data,
      stats: { total, confirmees, enAttente, rejetees },
      filters: { matricules },
      meta: { dateStart: dateStart || null, dateEnd: dateEnd || null },
    };
  } catch (error) {
    console.error("Error getReclamations:", error);
    return {
      success: false,
      message: error.message,
      data: [],
      stats: { total: 0, confirmees: 0, enAttente: 0, rejetees: 0 },
    };
  }
};
