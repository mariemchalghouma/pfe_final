import pool from "../config/database.js";

/* ═══════════════════════════════════════════════════════════════════
   Table notifications — auto-create si inexistante
   ═══════════════════════════════════════════════════════════════════ */
let _notifTableReady = false;
const ensureNotificationsTable = async () => {
  if (_notifTableReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY,
      notif_key VARCHAR(255) UNIQUE NOT NULL,
      type VARCHAR(50) NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      is_read BOOLEAN DEFAULT FALSE,
      notif_timestamp TIMESTAMP NOT NULL,
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Migration : supprimer les colonnes icon/color/bg_color si elles existent
  try {
    await pool.query(`ALTER TABLE notifications DROP COLUMN IF EXISTS icon`);
    await pool.query(`ALTER TABLE notifications DROP COLUMN IF EXISTS color`);
    await pool.query(`ALTER TABLE notifications DROP COLUMN IF EXISTS bg_color`);
  } catch (_) { /* ignore */ }
  _notifTableReady = true;
};

/**
 * Fonction pour calculer la distance entre deux points GPS (Haversine)
 */
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  if (!lat1 || !lon1 || !lat2 || !lon2) return Infinity;
  const R = 6371000; // Rayon de la Terre en mètres
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

/**
 * Upsert une liste de notifications générées dans la table notifications.
 * On insère seulement les nouvelles (ON CONFLICT DO NOTHING) pour garder le is_read.
 */
const upsertNotifications = async (notifications) => {
  if (!notifications.length) return;

  for (const notif of notifications) {
    try {
      await pool.query(
        `INSERT INTO notifications (notif_key, type, title, message, notif_timestamp, metadata)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (notif_key) DO UPDATE SET
           title = EXCLUDED.title,
           message = EXCLUDED.message,
           metadata = EXCLUDED.metadata`,
        [
          notif.id,
          notif.type,
          notif.title,
          notif.message,
          notif.timestamp,
          JSON.stringify(notif.metadata || {}),
        ],
      );
    } catch (err) {
      // Ignore individual insert errors
      console.warn("Erreur upsert notification:", notif.id, err.message);
    }
  }
};

/**
 * Récupérer toutes les notifications de l'utilisateur
 */
export const getNotifications = async (userId) => {
  try {
    await ensureNotificationsTable();

    const generated = [];

    // ========== NOTIFICATIONS D'ARRÊTS NON CONFORMES ==========
    // Récupérer les POI pour la comparaison de conformité
    const poiResult = await pool.query(`
      SELECT code, description as nom, lat, lng, rayon FROM poi
    `);
    const pois = poiResult.rows;

    // Récupérer tous les voyages planifiés (sans limitation de date)
    const voyageResult = await pool.query(
      `
      SELECT "PLAMOTI", "VOYDTD", "VOYCLE", "SALNOM", "SALTEL", "OTDCODE"
      FROM voyage_chauffeur
      ORDER BY "VOYDTD" DESC
      LIMIT 500
    `,
    );
    const voyages = voyageResult.rows;

    // Créer un map des voyages par camion et date
    const voyagesByMotifDate = new Map();
    voyages.forEach((voyage) => {
      const key = (voyage.PLAMOTI || "").toString().toUpperCase().trim();
      const date = new Date(voyage.VOYDTD).toISOString().split("T")[0];
      const dateKey = `${key}|${date}`;
      if (!voyagesByMotifDate.has(dateKey)) voyagesByMotifDate.set(dateKey, []);
      voyagesByMotifDate.get(dateKey).push(voyage);
    });

    // Créer un map des POI par code
    const poiByCode = new Map();
    pois.forEach((poi) => {
      poiByCode.set((poi.code || "").toString().toUpperCase().trim(), poi);
    });

    // Récupérer tous les arrêts (derniers 100, triés par date décroissante)
    const arretResult = await pool.query(
      `
      SELECT
          s.camion,
          s.beginstoptime,
          s.endstoptime,
          s.stopduration,
          s.latitude AS lat,
          s.longitude AS lng,
          s.address
      FROM voyage_tracking_stops s
      LEFT JOIN LATERAL (
          SELECT
              AVG(g.latitude) AS avg_lat,
              AVG(g.longitude) AS avg_lng
          FROM local_histo_gps_all g
          WHERE REPLACE(UPPER(TRIM(g.camion)), ' ', '') = REPLACE(UPPER(TRIM(s.camion)), ' ', '')
            AND g.gps_timestamp BETWEEN s.beginstoptime AND s.endstoptime
      ) gps ON TRUE
      WHERE s.endstoptime IS NOT NULL
      ORDER BY s.beginstoptime DESC
      LIMIT 100
    `,
    );

    // Traiter les arrêts pour identifier les non-conformes
    arretResult.rows.forEach((row) => {
      const camionNorm = (row.camion || "").toString().toUpperCase().trim();
      const refLat = row.lat ? Number(row.lat) : null;
      const refLng = row.lng ? Number(row.lng) : null;
      const stopDate = new Date(row.beginstoptime).toISOString().split("T")[0];

      const dateKey = `${camionNorm}|${stopDate}`;
      const possibleVoyages = voyagesByMotifDate.get(dateKey) || [];

      let matchedVoyage = null;
      if (possibleVoyages.length > 0) {
        matchedVoyage = possibleVoyages[0];
      }

      const plannedPoi = matchedVoyage?.OTDCODE
        ? poiByCode.get(
            (matchedVoyage.OTDCODE || "").toString().toUpperCase().trim(),
          )
        : null;

      const plannedDistance =
        plannedPoi && refLat && refLng
          ? calculateDistance(
              refLat,
              refLng,
              Number(plannedPoi.lat),
              Number(plannedPoi.lng),
            )
          : Infinity;

      const plannedRayon = plannedPoi?.rayon ? Number(plannedPoi.rayon) : 10;

      // Vérifier la non-conformité
      const isNonConforme =
        !matchedVoyage || !plannedPoi || plannedDistance > plannedRayon;

      if (isNonConforme && row.beginstoptime) {
        const stopDateObj = new Date(row.beginstoptime);
        const timeStr = stopDateObj.toLocaleTimeString("fr-FR", {
          hour: "2-digit",
          minute: "2-digit",
        });
        const dateStr = stopDateObj.toLocaleDateString("fr-FR", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        });

        generated.push({
          id: `stop-${row.camion}-${row.beginstoptime}-${row.endstoptime}`,
          type: "Arrêt",
          title: "Arrêt non conforme",
          message: `${row.camion} arrêté hors zone POI à ${row.address || "localisation inconnue"}`,
          time: timeStr,
          date: dateStr,
          timestamp: stopDateObj,
          icon: "FiAlertTriangle",
          color: "text-orange-600",
          bgColor: "bg-orange-50",
          metadata: {},
        });
      }
    });

    // ========== NOTIFICATIONS D'OUVERTURES SUSPECTES ==========
    const DUREE_OUVERTURE_MAX = 60; // minutes

    const ouvertureResult = await pool.query(
      `
      SELECT
          o.date_ouverture,
          o.date_fermeture,
          o.assetname,
          o.adress,
          o.lat,
          o.lng,
          o.camion,
          o.duration,
          ROUND((EXTRACT(EPOCH FROM (o.date_fermeture - o.date_ouverture)) / 60.0)::numeric, 2) AS duree_minutes,
          planning.voycle
      FROM voyagetracking_port_ouvert o
      LEFT JOIN LATERAL (
        SELECT
            v."VOYCLE" AS voycle
        FROM voyage_chauffeur v
        WHERE UPPER(REPLACE(v."PLAMOTI"::text, ' ', '')) = UPPER(REPLACE(o.camion::text, ' ', ''))
          AND DATE(COALESCE(v."CDATE", v."VOYDTD")) = DATE(o.date_ouverture)
        LIMIT 1
      ) AS planning ON TRUE
      WHERE o.date_fermeture IS NOT NULL
      ORDER BY o.date_ouverture DESC
      LIMIT 100
    `,
    );

    ouvertureResult.rows.forEach((row) => {
      const dureeMin = Number(row.duree_minutes) || 0;
      const isPlanned = row.voycle !== null;

      // Ouverture suspecte si non planifiée OU durée > max
      if (!isPlanned || dureeMin > DUREE_OUVERTURE_MAX) {
        const doorDate = new Date(row.date_ouverture);
        const timeStr = doorDate.toLocaleTimeString("fr-FR", {
          hour: "2-digit",
          minute: "2-digit",
        });
        const dateStr = doorDate.toLocaleDateString("fr-FR", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        });

        generated.push({
          id: `door-${row.camion}-${row.date_ouverture}-${row.date_fermeture}`,
          type: "Porte",
          title: "Ouverture porte suspecte",
          message: `${row.camion} ouverture ${dureeMin}min à ${row.adress || "localisation inconnue"}`,
          time: timeStr,
          date: dateStr,
          timestamp: doorDate,
          icon: "FiUnlock",
          color: "text-amber-600",
          bgColor: "bg-amber-50",
          metadata: {},
        });
      }
    });

    // ========== NOTIFICATIONS D'APPELS IA (historique_appels) ==========
    try {
      const appelResult = await pool.query(`
        SELECT
          h.id,
          h.session_id,
          h.camion_id,
          h.nom_chauffeur,
          h.numero_tel,
          h.type_nc,
          h.statut,
          h.etat_appel,
          h.mode_appel,
          h.duree_s,
          h.ts_detection,
          h.date_appel,
          c.prediction_pct,
          c.prediction_label
        FROM historique_appels h
        LEFT JOIN conversations_appels c ON c.session_id = h.session_id
        WHERE h.date_appel >= CURRENT_DATE
          AND h.statut IN ('nouveau', 'en_cours', 'appel_termine')
        ORDER BY COALESCE(h.date_appel, h.ts_detection) DESC
        LIMIT 50
      `);

      appelResult.rows.forEach((row) => {
        const appelDate = new Date(row.date_appel || row.ts_detection);
        const timeStr = appelDate.toLocaleTimeString("fr-FR", {
          hour: "2-digit",
          minute: "2-digit",
        });
        const dateStr = appelDate.toLocaleDateString("fr-FR", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        });

        // Déterminer l'icône, couleur et message selon le type_nc
        let icon, color, bgColor, title, message;
        const camion = row.camion_id || "Camion";
        const chauffeur = row.nom_chauffeur || "";
        const duree = row.duree_s ? `${Math.round(row.duree_s)}s` : "";
        const direction = row.mode_appel === "incoming" ? "📲 Entrant" : "📞 Sortant";
        const statut = row.statut === "appel_termine" ? "Terminé" : row.statut === "en_cours" ? "En cours" : "Nouveau";
        const prediction = row.prediction_pct ? ` — ${row.prediction_pct}% ${row.prediction_label || ""}` : "";

        switch (row.type_nc) {
          case "arret_non_prevu":
            icon = "FiPhoneCall";
            color = "text-orange-600";
            bgColor = "bg-orange-50";
            title = "Appel — Arrêt non prévu";
            message = `${camion} ${chauffeur ? "(" + chauffeur + ")" : ""} arrêt NC — ${direction} ${duree}${prediction}`;
            break;

          case "arret_et_porte_ouverte":
            icon = "FiPhoneCall";
            color = "text-red-600";
            bgColor = "bg-red-50";
            title = "Appel — Arrêt + Porte ouverte";
            message = `${camion} ${chauffeur ? "(" + chauffeur + ")" : ""} arrêt + porte — ${direction} ${duree}${prediction}`;
            break;

          case "chute_carburant":
            icon = "FiPhoneCall";
            color = "text-blue-600";
            bgColor = "bg-blue-50";
            title = "Appel — Chute carburant";
            message = `${camion} ${chauffeur ? "(" + chauffeur + ")" : ""} chute carburant — ${direction} ${duree}${prediction}`;
            break;

          case "arret_et_chute_carburant":
            icon = "FiPhoneCall";
            color = "text-purple-600";
            bgColor = "bg-purple-50";
            title = "Appel — Arrêt + Chute carburant";
            message = `${camion} ${chauffeur ? "(" + chauffeur + ")" : ""} arrêt + carburant — ${direction} ${duree}${prediction}`;
            break;

          case "appel_entrant":
            icon = "FiPhoneIncoming";
            color = "text-green-600";
            bgColor = "bg-green-50";
            title = "Appel entrant chauffeur";
            message = `${camion} ${chauffeur ? "(" + chauffeur + ")" : ""} a appelé — ${duree}${prediction}`;
            break;

          default:
            icon = "FiPhone";
            color = "text-gray-600";
            bgColor = "bg-gray-50";
            title = `Appel — ${row.type_nc || "NC"}`;
            message = `${camion} ${chauffeur ? "(" + chauffeur + ")" : ""} — ${direction} ${duree}`;
            break;
        }

        // Badge de statut
        if (statut === "En cours") {
          title = `🔴 ${title} (en cours)`;
        }

        generated.push({
          id: `call-${row.id}-${row.session_id}`,
          type: "Appel",
          title,
          message,
          time: timeStr,
          date: dateStr,
          timestamp: appelDate,
          icon,
          color,
          bgColor,
          metadata: {
            sessionId: row.session_id,
            typeNc: row.type_nc,
            statutAppel: statut,
          },
        });
      });
    } catch (appelErr) {
      console.error("Erreur notifications appels:", appelErr);
    }

    // ========== NOTIFICATIONS DE RÉCLAMATIONS CARBURANT ==========
    try {
      const reclamationResult = await pool.query(`
        SELECT
          r.id,
          r.matricule,
          TO_CHAR(r.date_transaction, 'YYYY-MM-DD') AS date_transaction,
          r.num_ticket,
          r.commentaire,
          COALESCE(r.soumis_par, '') AS soumis_par,
          r.created_at,
          COALESCE(a.statut, 'CONFIRMEE') AS statut_anomalie
        FROM reclamation_carburant r
        LEFT JOIN anomalie_carburant a ON (
          UPPER(TRIM(a.matricule)) = UPPER(TRIM(r.matricule))
          AND a.date_transaction = r.date_transaction
          AND COALESCE(NULLIF(TRIM(a.num_ticket), ''), '') = COALESCE(NULLIF(TRIM(r.num_ticket), ''), '')
        )
        ORDER BY r.created_at DESC
        LIMIT 30
      `);

      reclamationResult.rows.forEach((row) => {
        const recDate = new Date(row.created_at);
        const timeStr = recDate.toLocaleTimeString("fr-FR", {
          hour: "2-digit",
          minute: "2-digit",
        });
        const dateStr = recDate.toLocaleDateString("fr-FR", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        });

        const soumisPar = row.soumis_par ? ` par ${row.soumis_par}` : "";
        const ticket = row.num_ticket ? ` — Ticket #${row.num_ticket}` : "";
        const statut = row.statut_anomalie;

        let color, bgColor;
        switch (statut) {
          case "CONFIRMEE":
            color = "text-red-600";
            bgColor = "bg-red-50";
            break;
          case "REJETEE":
            color = "text-slate-600";
            bgColor = "bg-slate-50";
            break;
          default:
            color = "text-amber-600";
            bgColor = "bg-amber-50";
            break;
        }

        generated.push({
          id: `reclamation-${row.id}`,
          type: "Réclamation",
          title: `Réclamation carburant — ${row.matricule}`,
          message: `Réclamation soumise${soumisPar}${ticket} : ${row.commentaire || "sans commentaire"}`,
          time: timeStr,
          date: dateStr,
          timestamp: recDate,
          icon: "FiFileText",
          color,
          bgColor,
          metadata: {
            matricule: row.matricule,
            statutReclamation: statut,
          },
        });
      });
    } catch (recErr) {
      console.error("Erreur notifications réclamations:", recErr);
    }

    // ========== DÉDUPLIQUER les notifications générées ==========
    const seenIds = new Set();
    const uniqueGenerated = generated.filter((notif) => {
      if (seenIds.has(notif.id)) return false;
      seenIds.add(notif.id);
      return true;
    });

    // ========== PERSISTER EN BASE (upsert) ==========
    await upsertNotifications(uniqueGenerated);

    // ========== LIRE DEPUIS LA BASE (avec is_read) ==========
    const dbResult = await pool.query(`
      SELECT
        notif_key,
        type,
        title,
        message,
        is_read,
        notif_timestamp,
        metadata,
        created_at
      FROM notifications
      ORDER BY notif_timestamp DESC
      LIMIT 200
    `);

    const data = dbResult.rows.map((row) => {
      const ts = new Date(row.notif_timestamp);
      const meta = row.metadata || {};
      return {
        id: row.notif_key,
        type: row.type,
        title: row.title,
        message: row.message,
        isNew: !row.is_read,
        time: ts.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
        date: ts.toLocaleDateString("fr-FR", { year: "numeric", month: "2-digit", day: "2-digit" }),
        timestamp: ts,
        // Metadata supplémentaires
        sessionId: meta.sessionId || null,
        typeNc: meta.typeNc || null,
        statutAppel: meta.statutAppel || null,
        matricule: meta.matricule || null,
        statutReclamation: meta.statutReclamation || null,
      };
    });

    return Response.json(
      {
        success: true,
        data,
        message: "Notifications récupérées avec succès",
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("Error fetching notifications:", error);
    return Response.json(
      {
        success: false,
        message: "Erreur lors de la récupération des notifications",
      },
      { status: 500 },
    );
  }
};

/**
 * Marquer une notification comme lue
 */
export const markNotificationAsRead = async (notificationId, userId) => {
  try {
    await ensureNotificationsTable();

    await pool.query(
      `UPDATE notifications SET is_read = TRUE WHERE notif_key = $1`,
      [notificationId],
    );

    return Response.json(
      {
        success: true,
        data: { id: notificationId, isNew: false },
        message: "Notification marquée comme lue",
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("Error marking notification as read:", error);
    return Response.json(
      {
        success: false,
        message: "Erreur lors de la mise à jour de la notification",
      },
      { status: 500 },
    );
  }
};

/**
 * Marquer toutes les notifications comme lues
 */
export const markAllNotificationsAsRead = async (userId) => {
  try {
    await ensureNotificationsTable();

    const result = await pool.query(
      `UPDATE notifications SET is_read = TRUE WHERE is_read = FALSE`,
    );

    return Response.json(
      {
        success: true,
        data: {
          updated: result.rowCount,
          message: "Toutes les notifications ont été marquées comme lues",
        },
        message: "Notifications mises à jour",
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("Error marking all notifications as read:", error);
    return Response.json(
      {
        success: false,
        message: "Erreur lors de la mise à jour des notifications",
      },
      { status: 500 },
    );
  }
};
