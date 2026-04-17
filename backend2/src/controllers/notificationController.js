import pool from "../config/database.js";

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
 * Récupérer toutes les notifications de l'utilisateur
 */
export const getNotifications = async (userId) => {
  try {
    const notifications = [];

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

    // Récupérer tous les arrêts (derniers 500, triés par date décroissante)
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
        const stopDate = new Date(row.beginstoptime);
        const timeStr = stopDate.toLocaleTimeString("fr-FR", {
          hour: "2-digit",
          minute: "2-digit",
        });
        const dateStr = stopDate.toLocaleDateString("fr-FR", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        });

        notifications.push({
          id: `stop-${row.camion}-${row.beginstoptime}-${row.endstoptime}`,
          type: "Arrêt",
          title: "Arrêt non conforme",
          message: `${row.camion} arrêté hors zone POI à ${row.address || "localisation inconnue"}`,
          time: timeStr,
          date: dateStr,
          timestamp: stopDate,
          icon: "FiAlertTriangle",
          color: "text-orange-600",
          bgColor: "bg-orange-50",
          isNew: true,
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

        notifications.push({
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
          isNew: true,
        });
      }
    });

    // Dédupliquer les notifications (éviter les doublons)
    const seenIds = new Set();
    const uniqueNotifications = notifications.filter((notif) => {
      if (seenIds.has(notif.id)) {
        return false;
      }
      seenIds.add(notif.id);
      return true;
    });

    // Trier par timestamp décroissant (plus récents en premier)
    uniqueNotifications.sort((a, b) => b.timestamp - a.timestamp);

    return Response.json(
      {
        success: true,
        data: uniqueNotifications,
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
    // Logique pour mettre à jour la notification en base de données
    // Pour maintenant, on retourne un succès
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
    // Logique pour mettre à jour toutes les notifications en base de données
    // Pour maintenant, on retourne un succès
    return Response.json(
      {
        success: true,
        data: {
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
