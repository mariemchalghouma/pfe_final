import pool from "@/config/database.js";
import { verifyAuth, unauthorizedResponse } from "@/lib/auth";

/**
 * GET /api/dashboard/stats
 * Returns today's KPI stats:
 *   - Unread notifications count
 *   - Fuel anomalies today
 *   - Calls today
 *   - Trips today (total, completed, in-progress)
 *   - Predictions > 60% (high-risk drivers)
 */
export async function GET(request) {
  const user = verifyAuth(request);
  if (!user) return unauthorizedResponse();

  try {
    const today = new Date().toISOString().split("T")[0];

    // ── 1. Unread notifications ──
    let unreadCount = 0;
    try {
      const unreadResult = await pool.query(
        `SELECT COUNT(*) AS count FROM notifications WHERE is_read = FALSE`
      );
      unreadCount = Number(unreadResult.rows[0]?.count || 0);
    } catch (_) {
      /* notifications table may not exist yet */
    }

    // ── 2. Fuel anomalies today ──
    let fuelAnomalies = 0;
    try {
      const fuelResult = await pool.query(`
        WITH tt AS (
          SELECT UPPER(TRIM(t.matricule)) AS matricule, t.date_transaction, t.num_ticket,
                 t.quantite
          FROM total t
          WHERE DATE(t.date_transaction) = CURRENT_DATE
            AND EXISTS (
              SELECT 1 FROM voyagetracking_ravitaillement r
              WHERE UPPER(TRIM(r.matricule_camion)) = UPPER(TRIM(t.matricule))
                AND DATE(COALESCE(r.date_trans, r."date")) = CURRENT_DATE
            )
        )
        SELECT COUNT(*) AS count FROM tt
      `);
      fuelAnomalies = Number(fuelResult.rows[0]?.count || 0);
    } catch (_) {
      /* fallback: count from carburant ecart data */
    }

    // ── 3. Calls today ──
    let callsToday = 0;
    try {
      const callsResult = await pool.query(`
        SELECT COUNT(*) AS count
        FROM historique_appels
        WHERE DATE(COALESCE(date_appel, ts_detection)) = CURRENT_DATE
      `);
      callsToday = Number(callsResult.rows[0]?.count || 0);
    } catch (_) {}

    // ── 4. Trips today (from voyage_chauffeur) ──
    let tripsTotal = 0;
    let tripsCompleted = 0;
    let tripsInProgress = 0;
    try {
      // Count distinct voyages (camion + voycle) for today
      const tripsResult = await pool.query(`
        SELECT
          COUNT(DISTINCT ("PLAMOTI" || '-' || "VOYCLE")) AS total,
          COUNT(DISTINCT CASE
            WHEN "VOYHRF" IS NOT NULL AND "VOYHRF" > 0
              AND (("VOYHRF" / 100) * 60 + ("VOYHRF" % 100)) <=
                  (EXTRACT(HOUR FROM NOW()) * 60 + EXTRACT(MINUTE FROM NOW()))
            THEN "PLAMOTI" || '-' || "VOYCLE"
          END) AS completed
        FROM voyage_chauffeur
        WHERE DATE("VOYDTD") = CURRENT_DATE
          AND "PLAMOTI" IS NOT NULL
      `);
      tripsTotal = Number(tripsResult.rows[0]?.total || 0);
      tripsCompleted = Number(tripsResult.rows[0]?.completed || 0);
      tripsInProgress = Math.max(0, tripsTotal - tripsCompleted);
    } catch (_) {}

    // ── 5. Predictions > 60% (from conversations_appels today) ──
    let predictions = [];
    try {
      const predResult = await pool.query(`
        SELECT
          c.session_id,
          c.prediction_pct,
          c.prediction_label,
          h.camion_id,
          h.nom_chauffeur,
          h.numero_tel,
          h.type_nc,
          h.mode_appel,
          h.duree_s,
          h.date_appel
        FROM conversations_appels c
        JOIN historique_appels h ON h.session_id = c.session_id
        WHERE c.prediction_pct >= 60
          AND DATE(COALESCE(h.date_appel, h.ts_detection)) = CURRENT_DATE
        ORDER BY c.prediction_pct DESC
      `);

      // Group by driver (nom_chauffeur) and take the highest prediction
      const driverMap = new Map();
      predResult.rows.forEach((row) => {
        const key = (row.nom_chauffeur || row.camion_id || "").toUpperCase().trim();
        if (!driverMap.has(key)) {
          driverMap.set(key, {
            nom_chauffeur: row.nom_chauffeur || "—",
            camion_id: row.camion_id || "—",
            numero_tel: row.numero_tel || "—",
            prediction_pct: Number(row.prediction_pct),
            prediction_label: row.prediction_label || "",
            nb_appels: 0,
            ecart_moy: 0,
            predictions: [],
          });
        }
        const entry = driverMap.get(key);
        entry.nb_appels++;
        entry.predictions.push(Number(row.prediction_pct));
        if (Number(row.prediction_pct) > entry.prediction_pct) {
          entry.prediction_pct = Number(row.prediction_pct);
          entry.prediction_label = row.prediction_label || "";
        }
      });

      predictions = Array.from(driverMap.values()).map((d) => {
        const avg =
          d.predictions.length > 0
            ? d.predictions.reduce((s, v) => s + v, 0) / d.predictions.length
            : 0;
        // Ecart moyen = average deviation from 100%
        const ecartMoy =
          d.predictions.length > 0
            ? d.predictions.reduce((s, v) => s + Math.abs(100 - v), 0) /
              d.predictions.length
            : 0;
        return {
          nom_chauffeur: d.nom_chauffeur,
          camion_id: d.camion_id,
          numero_tel: d.numero_tel,
          prediction_pct: d.prediction_pct,
          prediction_label: d.prediction_label,
          nb_appels: d.nb_appels,
          ecart_moy: Math.round(ecartMoy * 10) / 10,
        };
      });
    } catch (e) {
      console.warn("Dashboard predictions query error:", e.message);
    }

    // ── 6. Latest reclamations (most recent from reclamation_carburant) ──
    let latestReclamations = [];
    try {
      const recResult = await pool.query(`
        SELECT
          r.id,
          r.matricule,
          TO_CHAR(r.date_transaction, 'YYYY-MM-DD') AS date_transaction,
          r.num_ticket,
          r.commentaire,
          COALESCE(r.soumis_par, '') AS soumis_par,
          COALESCE(r.chauffeur, '') AS chauffeur,
          r.created_at,
          COALESCE(a.statut, 'CONFIRMEE') AS statut_anomalie
        FROM reclamation_carburant r
        LEFT JOIN anomalie_carburant a ON (
          UPPER(TRIM(a.matricule)) = UPPER(TRIM(r.matricule))
          AND a.date_transaction = r.date_transaction
          AND COALESCE(NULLIF(TRIM(a.num_ticket), ''), '') = COALESCE(NULLIF(TRIM(r.num_ticket), ''), '')
        )
        ORDER BY r.created_at DESC
        LIMIT 6
      `);
      latestReclamations = recResult.rows.map((row) => ({
        id: row.id,
        matricule: row.matricule,
        dateTransaction: row.date_transaction,
        numTicket: row.num_ticket || "—",
        commentaire: row.commentaire || "",
        soumisPar: row.soumis_par || "",
        chauffeur: row.chauffeur || "",
        createdAt: row.created_at,
        statutAnomalie: row.statut_anomalie,
      }));
    } catch (e) {
      console.warn("Dashboard reclamations query error:", e.message);
    }

    return Response.json({
      success: true,
      data: {
        unreadNotifications: unreadCount,
        fuelAnomalies,
        callsToday,
        tripsTotal,
        tripsCompleted,
        tripsInProgress,
        predictions,
        predictionsCount: predictions.length,
        latestReclamations,
      },
    });
  } catch (error) {
    console.error("Error dashboard stats:", error);
    return Response.json(
      {
        success: false,
        message: "Erreur lors du chargement des statistiques du dashboard",
      },
      { status: 500 }
    );
  }
}
