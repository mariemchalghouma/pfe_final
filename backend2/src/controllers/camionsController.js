import pool from "../config/database.js";
import { calculateDistance } from "./arretController.js";

export const getCamions = async () => {
  try {
    const result = await pool.query(`
      WITH camions_source AS (
          SELECT DISTINCT ON ("PLAMOTI")
              "PLAMOTI" AS camion,
              "SALNOM" AS chauffeur,
              "SALTEL" AS phone
          FROM voyage_chauffeur
          WHERE "PLAMOTI" IS NOT NULL
          ORDER BY "PLAMOTI"
      ),
      gps_latest AS (
          SELECT DISTINCT ON (UPPER(TRIM(h.camion::text)))
              UPPER(TRIM(h.camion::text)) AS camion_norm,
              h.gps_timestamp,
              h.latitude,
              h.longitude,
              h.speed,
              h.odometer,
              h.ignition
          FROM local_histo_gps_all h
          WHERE h.camion IS NOT NULL
          ORDER BY UPPER(TRIM(h.camion::text)), h.gps_timestamp DESC
      ),
      ravit_latest AS (
          SELECT DISTINCT ON (UPPER(TRIM(r.matricule_camion::text)))
              UPPER(TRIM(r.matricule_camion::text)) AS camion_norm,
              r.qtt AS carburant
          FROM voyagetracking_ravitaillement r
          WHERE r.matricule_camion IS NOT NULL
          ORDER BY UPPER(TRIM(r.matricule_camion::text)), COALESCE(r.date_trans, r.date) DESC NULLS LAST
      )
      SELECT
          v.camion,
          v.chauffeur,
          v.phone,
          g.gps_timestamp AS derniere_maj,
          g.latitude AS lat,
          g.longitude AS lng,
          g.speed AS vitesse,
          g.odometer AS kilometrage,
          g.ignition,
          r.carburant
      FROM camions_source v
      LEFT JOIN gps_latest g
          ON g.camion_norm = UPPER(TRIM(v.camion::text))
      LEFT JOIN ravit_latest r
          ON r.camion_norm = UPPER(TRIM(v.camion::text))
      WHERE g.gps_timestamp IS NOT NULL
      ORDER BY v.camion
    `);

    const camions = result.rows.map((row, index) => {
      const vitesse = row.vitesse != null ? Number(row.vitesse) : 0;
      let statut = "arrete";
      if (vitesse > 0) statut = "en_route";

      return {
        id: index + 1,
        plaque: row.camion,
        chauffeur: row.chauffeur || "—",
        telephone: row.phone || "—",
        localisation:
          row.lat != null && row.lng != null
            ? `${Number(row.lat).toFixed(4)}, ${Number(row.lng).toFixed(4)}`
            : "—",
        vitesse,
        statut,
        lat: row.lat != null ? Number(row.lat) : null,
        lng: row.lng != null ? Number(row.lng) : null,
        kilometrage: row.kilometrage != null ? Number(row.kilometrage) : 0,
        carburant: row.carburant != null ? Number(row.carburant) : null,
        derniereMaj: row.derniere_maj
          ? new Date(row.derniere_maj)
              .toISOString()
              .replace("T", " ")
              .slice(0, 16)
          : "—",
        ignition: row.ignition,
      };
    });

    return Response.json({ success: true, data: camions });
  } catch (error) {
    console.error("Error getCamions:", error);
    return Response.json(
      {
        success: false,
        message: "Erreur lors de la récupération des camions",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 },
    );
  }
};

export const getCamionsTempsReel = async (date) => {
  try {
    const targetDate = date || new Date().toISOString().split("T")[0];
    const endDateObj = new Date(`${targetDate}T00:00:00Z`);
    endDateObj.setUTCDate(endDateObj.getUTCDate() - 6);
    const startDate = endDateObj.toISOString().split("T")[0];

    const result = await pool.query(
      `
      WITH voyage_lines AS (
        SELECT
          UPPER(TRIM(v."PLAMOTI"::text)) AS camion_norm,
          DATE(v."VOYDTD")::text          AS voyage_date,
          v."PLAMOTI"                    AS camion,
          v."SALNOM"                     AS chauffeur,
          v."SALTEL"                     AS telephone,
          v."VOYCLE"                     AS voycle,
          v."VOYHRD"                     AS heure_dep,
          v."VOYHRF"                     AS heure_fin,
          v."OTDCODE"                    AS otdcode
        FROM voyage_chauffeur v
        WHERE v."PLAMOTI" IS NOT NULL
          AND DATE(v."VOYDTD") BETWEEN $1 AND $2
      ),
      voyage_7d AS (
        SELECT
          camion_norm,
          voyage_date,
          camion,
          MAX(chauffeur) AS chauffeur,
          MAX(telephone) AS telephone,
          voycle,
          MIN(heure_dep) AS heure_dep,
          MAX(heure_fin) AS heure_fin,
          COUNT(*)       AS nb_destinations,
          ARRAY_AGG(DISTINCT otdcode) FILTER (WHERE otdcode IS NOT NULL) AS otdcodes
        FROM voyage_lines
        GROUP BY camion_norm, voyage_date, camion, voycle
      ),
      gps_7d AS (
        SELECT
          UPPER(TRIM(h.camion::text)) AS camion_norm,
          DATE(h.gps_timestamp)::text AS gps_date,
          h.gps_timestamp,
          h.latitude,
          h.longitude,
          h.speed,
          h.ignition,
          ROW_NUMBER() OVER (
            PARTITION BY UPPER(TRIM(h.camion::text)), DATE(h.gps_timestamp)
            ORDER BY h.gps_timestamp DESC
          ) AS rn_day,
          COUNT(*) OVER (
            PARTITION BY UPPER(TRIM(h.camion::text))
          ) AS points_7j
        FROM local_histo_gps_all h
        WHERE h.camion IS NOT NULL
          AND DATE(h.gps_timestamp) BETWEEN $1 AND $2
      ),
      gps_latest_by_day AS (
        SELECT *
        FROM gps_7d
        WHERE rn_day = 1
      )
      SELECT
        v.voyage_date,
        v.camion,
        COALESCE(v.chauffeur, '—') AS chauffeur,
        COALESCE(v.telephone::text, '—') AS telephone,
        v.voycle,
        v.heure_dep,
        v.heure_fin,
        v.nb_destinations,
        v.otdcodes,
        g.gps_date,
        g.gps_timestamp,
        g.latitude,
        g.longitude,
        g.speed,
        g.ignition,
        g.points_7j,
        s.beginstoptime,
        s.endstoptime,
        s.stopduration,
        s.address AS stop_address,
        s.latitude AS stop_lat,
        s.longitude AS stop_lng,
        s.etat AS stop_etat
      FROM voyage_7d v
      LEFT JOIN gps_latest_by_day g
        ON g.camion_norm = v.camion_norm
       AND g.gps_date = v.voyage_date
      LEFT JOIN voyage_tracking_stops s
        ON REPLACE(s.camion, ' ', '') = REPLACE(v.camion, ' ', '')
       AND g.gps_timestamp BETWEEN s.beginstoptime AND s.endstoptime
      ORDER BY v.voyage_date DESC, v.camion, v.voycle DESC
    `,
      [startDate, targetDate],
    );

    // Récupérer les POI pour le calcul de conformité
    const poiResult = await pool.query(`
      SELECT code, description AS nom, lat, lng, rayon, groupe FROM poi
    `);

    const DEFAULT_RAYON_METRES = 10;
    const normalizeGroup = (value) =>
      (value || "").toString().toLowerCase().replace(/\s+/g, " ").trim();
    const isPointNoirGroup = (value) => {
      const group = normalizeGroup(value);
      return group.includes("point") && group.includes("noir");
    };

    const parsedPois = (poiResult.rows || [])
      .map((poi) => ({
        ...poi,
        latNum: Number(poi.lat),
        lngNum: Number(poi.lng),
        rayonNum:
          poi.rayon !== null && poi.rayon !== undefined
            ? Number(poi.rayon)
            : null,
      }))
      .filter((poi) => Number.isFinite(poi.latNum) && Number.isFinite(poi.lngNum));

    const pois = parsedPois;
    const pointNoirPois = parsedPois.filter((poi) => isPointNoirGroup(poi.groupe));

    const findPointNoirMatch = (lat, lng) => {
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      let match = null;
      pointNoirPois.forEach((poi) => {
        const dist = calculateDistance(lat, lng, poi.latNum, poi.lngNum);
        const rayon =
          poi.rayonNum !== null && !Number.isNaN(poi.rayonNum)
            ? poi.rayonNum
            : DEFAULT_RAYON_METRES;
        if (dist <= rayon && (!match || dist < match.dist)) {
          match = { poi, dist, rayon };
        }
      });
      return match;
    };

    const toHour = (val) => {
      if (val === null || val === undefined) return null;
      const num = Number(val);
      if (Number.isNaN(num)) return null;
      const h = String(Math.floor(num / 100)).padStart(2, "0");
      const m = String(num % 100).padStart(2, "0");
      return `${h}:${m}`;
    };

    const normalize = (val) =>
      (val || "").toString().replace(/\s+/g, "").toUpperCase();

    const data = result.rows.map((row, index) => {
      const speed = row.speed != null ? Number(row.speed) : 0;
      const status = speed > 0 ? "en_route" : "arrete";
      const gpsLat = row.latitude != null ? parseFloat(row.latitude) : null;
      const gpsLng = row.longitude != null ? parseFloat(row.longitude) : null;
      const hasStopRecord = row.beginstoptime != null;

      // Calcul de conformité quand le camion est arrêté (speed == 0)
      let arret = null;
      if (speed === 0 && gpsLat && gpsLng) {
        // Utiliser la position du stop si disponible, sinon la position GPS
        const refLat =
          hasStopRecord && row.stop_lat ? parseFloat(row.stop_lat) : gpsLat;
        const refLng =
          hasStopRecord && row.stop_lng ? parseFloat(row.stop_lng) : gpsLng;

        // Trouver le POI le plus proche
        let minDistance = Infinity;
        let nearestPoi = null;

        pois.forEach((poi) => {
          const dist = calculateDistance(
            refLat,
            refLng,
            parseFloat(poi.lat),
            parseFloat(poi.lng),
          );
          if (dist < minDistance) {
            minDistance = dist;
            nearestPoi = poi;
          }
        });

        // Vérifier si le POI le plus proche correspond à un OTDCODE planifié
        const otdcodes = row.otdcodes || [];
        const poiCode = nearestPoi ? normalize(nearestPoi.code) : null;
        const isPlanned =
          poiCode && otdcodes.some((code) => normalize(code) === poiCode);

        // Conforme = distance ≤ 10m ET arrêt planifié
        const isConformeCalculated = minDistance <= 10 && isPlanned;
        const isConforme = row.stop_etat ? (row.stop_etat === "conforme") : isConformeCalculated;

        arret = {
          debut: hasStopRecord
            ? new Date(row.beginstoptime)
                .toISOString()
                .replace("T", " ")
                .slice(0, 16)
            : null,
          fin:
            hasStopRecord && row.endstoptime
              ? new Date(row.endstoptime)
                  .toISOString()
                  .replace("T", " ")
                  .slice(0, 16)
              : null,
          duree:
            hasStopRecord && row.stopduration
              ? `${row.stopduration.hours || 0}h ${row.stopduration.minutes || 0}min`
              : null,
          adresse: hasStopRecord && row.stop_address ? row.stop_address : null,
          status: isConforme ? "conforme" : "non_conforme",
          poiProche: nearestPoi
            ? `${nearestPoi.code} - ${nearestPoi.nom}`
            : null,
          distance: minDistance !== Infinity ? Math.round(minDistance) : null,
        };
      }

      return {
        id: index + 1,
        dateTrajet: row.voyage_date,
        datePointGps: row.gps_date || null,
        camion: row.camion,
        chauffeur: row.chauffeur || "—",
        telephone: row.telephone || "—",
        voycle: row.voycle || null,
        heureDep: toHour(row.heure_dep),
        heureFin: toHour(row.heure_fin),
        nbDestinations:
          row.nb_destinations != null ? Number(row.nb_destinations) : 0,
        lat: row.latitude != null ? Number(row.latitude) : null,
        lng: row.longitude != null ? Number(row.longitude) : null,
        vitesse: speed,
        ignition: row.ignition,
        statut: status,
        pointsToday: row.points_7j != null ? Number(row.points_7j) : 0,
        points7j: row.points_7j != null ? Number(row.points_7j) : 0,
        derniereMaj: row.gps_timestamp
          ? new Date(row.gps_timestamp)
              .toISOString()
              .replace("T", " ")
              .slice(0, 16)
          : "—",
        arret,
      };
    });

    return Response.json({
      success: true,
      data,
      date: targetDate,
      range: { startDate, endDate: targetDate },
    });
  } catch (error) {
    console.error("Error getCamionsTempsReel:", error);
    return Response.json(
      {
        success: false,
        message: "Erreur lors de la récupération du temps réel",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 },
    );
  }
};

/* ═══ Gantt data — one row per VOYAGE (camion + voycle) on a given date ═══ */
export const getCamionsGantt = async (date) => {
  try {
    const targetDate = date || new Date().toISOString().split("T")[0];

    // 1) All client deliveries for the date — each row = 1 client
    const voyageResult = await pool.query(
      `
      SELECT "PLAMOTI", "VOYCLE", "SALNOM", "RGILIBL", "SITSIRETEDI",
             "OTDCODE", "PLATOUORDRE", "VOYHRD", "VOYHRF"
      FROM voyage_chauffeur
      WHERE DATE("VOYDTD") = $1 AND "PLAMOTI" IS NOT NULL
      ORDER BY "PLAMOTI", "VOYCLE", "PLATOUORDRE"
    `,
      [targetDate],
    );

    if (voyageResult.rows.length === 0) {
      return Response.json({ success: true, data: [], date: targetDate });
    }

    // 2) Stops
    const stopsResult = await pool.query(
      `
      SELECT DISTINCT
        camion, beginstoptime, endstoptime, stopduration,
        latitude, longitude, address,
        latitude AS avg_lat, longitude AS avg_lng, etat AS db_etat
      FROM voyage_tracking_stops
      WHERE DATE(beginstoptime) = $1
      ORDER BY camion, beginstoptime ASC
    `,
      [targetDate],
    );

    // 3) POI pour le calcul de conformité
    const poiResult = await pool.query(`
      SELECT code, description AS nom, lat, lng, rayon, groupe FROM poi
    `);

    const DEFAULT_RAYON_METRES = 10;
    const normalizeGroup = (value) =>
      (value || "").toString().toLowerCase().replace(/\s+/g, " ").trim();
    const isPointNoirGroup = (value) => {
      const group = normalizeGroup(value);
      return group.includes("point") && group.includes("noir");
    };

    const parsedPois = (poiResult.rows || [])
      .map((poi) => ({
        ...poi,
        latNum: Number(poi.lat),
        lngNum: Number(poi.lng),
        rayonNum:
          poi.rayon !== null && poi.rayon !== undefined
            ? Number(poi.rayon)
            : null,
      }))
      .filter((poi) => Number.isFinite(poi.latNum) && Number.isFinite(poi.lngNum));

    const pois = parsedPois;
    const pointNoirPois = parsedPois.filter((poi) => isPointNoirGroup(poi.groupe));

    const findPointNoirMatch = (lat, lng) => {
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      let match = null;
      pointNoirPois.forEach((poi) => {
        const dist = calculateDistance(lat, lng, poi.latNum, poi.lngNum);
        const rayon =
          poi.rayonNum !== null && !Number.isNaN(poi.rayonNum)
            ? poi.rayonNum
            : DEFAULT_RAYON_METRES;
        if (dist <= rayon && (!match || dist < match.dist)) {
          match = { poi, dist, rayon };
        }
      });
      return match;
    };

    // 4) Ravitaillements
    const ravitResult = await pool.query(
      `
      SELECT matricule_camion, COALESCE(date_trans, "date"::timestamp) AS ravit_time,
             latitude, longitude, lieu
      FROM voyagetracking_ravitaillement
      WHERE DATE(COALESCE(date_trans, "date")) = $1
      ORDER BY COALESCE(date_trans, "date"::timestamp)
    `,
      [targetDate],
    );

    // 5) Ouvertures de porte
    const ouverturesResult = await pool.query(
      `
      SELECT camion, date_ouverture, date_fermeture, adress, lat, lng, duration,
             temp_ouv, temp_var, temp_fer, etat AS db_etat
      FROM voyagetracking_port_ouvert
      WHERE DATE(date_ouverture) = $1
        AND date_fermeture IS NOT NULL
      ORDER BY date_ouverture ASC
    `,
      [targetDate],
    );

    // 6) Latest GPS position per camion (for real-time tracking + ETA)
    const gpsLatestResult = await pool.query(
      `
      SELECT DISTINCT ON (UPPER(TRIM(camion::text)))
        UPPER(TRIM(camion::text)) AS camion_norm,
        latitude, longitude, speed, gps_timestamp
      FROM local_histo_gps_all
      WHERE DATE(gps_timestamp) = $1
        AND latitude IS NOT NULL AND longitude IS NOT NULL
      ORDER BY UPPER(TRIM(camion::text)), gps_timestamp DESC
    `,
      [targetDate],
    );

    // 7) Appels
    // historique_appels schema (Postgres) uses: camion_id, ts_detection/date_appel, mode_appel, type_nc...
    // (Older code expected camion/start_time/direction; keep mapping compatible with the UI.)
    let appelsResult = { rows: [] };
    try {
      appelsResult = await pool.query(
        `
        SELECT
          session_id,
          camion_id,
          source_table,
          source_id,
          type_nc,
          mode_appel,
          COALESCE(date_appel, ts_detection) AS call_time
        FROM historique_appels
        WHERE DATE(COALESCE(date_appel, ts_detection)) = $1
          AND session_id IS NOT NULL
        `,
        [targetDate],
      );
    } catch (err) {
      console.warn("historique_appels table query error:", err.message);
    }

    // === Build lookup maps ===
    const normKey = (raw) => (raw || "").replace(/\s+/g, "").toUpperCase();

    // Stops map
    const stopsMap = {};
    stopsResult.rows.forEach((s) => {
      const key = normKey(s.camion);
      if (!stopsMap[key]) stopsMap[key] = [];
      stopsMap[key].push(s);
    });

    // Ravitaillements map
    const ravitMap = {};
    ravitResult.rows.forEach((r) => {
      const key = normKey(r.matricule_camion);
      if (!ravitMap[key]) ravitMap[key] = [];
      ravitMap[key].push({
        time: new Date(r.ravit_time),
        lat: r.latitude ? parseFloat(r.latitude) : null,
        lng: r.longitude ? parseFloat(r.longitude) : null,
        lieu: r.lieu,
      });
    });

    // Ouvertures map
    const ouverturesMap = {};
    ouverturesResult.rows.forEach((o) => {
      const key = normKey(o.camion);
      if (!ouverturesMap[key]) ouverturesMap[key] = [];
      ouverturesMap[key].push({
        start: new Date(o.date_ouverture),
        end: new Date(o.date_fermeture),
        adresse: o.adress || null,
        lat: o.lat ? parseFloat(o.lat) : null,
        lng: o.lng ? parseFloat(o.lng) : null,
        duration: o.duration || null,
        tempOuv: o.temp_ouv ? Number(o.temp_ouv) : null,
        tempVar: o.temp_var ? Number(o.temp_var) : null,
        tempFer: o.temp_fer ? Number(o.temp_fer) : null,
        db_etat: o.db_etat,
      });
    });

    // GPS latest map
    const gpsLatestMap = {};
    gpsLatestResult.rows.forEach((g) => {
      gpsLatestMap[normKey(g.camion_norm)] = {
        lat: parseFloat(g.latitude),
        lng: parseFloat(g.longitude),
        speed: g.speed ? Number(g.speed) : 0,
        timestamp: new Date(g.gps_timestamp),
      };
    });

    // Appels map
    const appelsMap = {};
    const formatTypeNc = (rawTypeNc) => {
      const t = (rawTypeNc || "").toString().toLowerCase();
      if (!t) return "Inconnu";
      if (t === "arret_non_prevu") return "Arrêt non prévu";
      if (t === "chute_carburant") return "Chute de carburant";
      if (t === "arret_et_chute_carburant") return "Arrêt et chute de carburant";
      if (t === "arret_et_porte_ouverte") return "Arrêt et porte ouverte";
      if (t === "porte_ouverte") return "Porte ouverte";
      if (t === "manuel") return "Manuel";
      // Fallback readable label
      const pretty = t.replace(/_/g, " ");
      return pretty.charAt(0).toUpperCase() + pretty.slice(1);
    };

    appelsResult.rows.forEach((a) => {
      let resolvedCamion = a.camion_id;

      // Fallback: extract camion from source_id when it contains "CAMION|timestamp"
      if (!resolvedCamion && a.source_id && String(a.source_id).includes("|")) {
        resolvedCamion = String(a.source_id).split("|")[0];
      }

      if (!resolvedCamion) return;

      const key = normKey(resolvedCamion);
      if (!appelsMap[key]) appelsMap[key] = [];

      const mode = (a.mode_appel || "").toString().toLowerCase();
      const direction = mode.startsWith("in") || a.type_nc === "appel_entrant"
        ? "entrant"
        : "sortant";

      let typeLabel = "Inconnu";
      if (direction === "sortant") {
        typeLabel = formatTypeNc(a.type_nc);

        // Fallback heuristics when type_nc is missing
        if (typeLabel === "Inconnu") {
          if (a.source_table === "voyage_tracking_stops") {
            typeLabel = "Arrêt non prévu";
          } else if (
            a.source_table === "niveau_carburant" ||
            a.source_table === "voyagetracking_ravitaillement"
          ) {
            typeLabel = "Chute de carburant";
          }
        }
      } else {
        typeLabel = "Appel entrant";
      }

      if (!a.call_time) return;

      appelsMap[key].push({
        sessionId: a.session_id,
        time: new Date(a.call_time).toISOString(),
        direction, // "entrant" or "sortant"
        type: typeLabel,
      });
    });

    // Helper: convert VOYHRD/VOYHRF numeric (e.g. 700 → Date)
    const numToTime = (num) => {
      const h = String(Math.floor(num / 100)).padStart(2, "0");
      const m = String(num % 100).padStart(2, "0");
      return new Date(`${targetDate}T${h}:${m}:00`);
    };

    const numToTimeStr = (num) => {
      if (!num) return null;
      const h = String(Math.floor(num / 100)).padStart(2, "0");
      const m = String(num % 100).padStart(2, "0");
      return `${h}:${m}`;
    };

    // Helper: classify a stop via POI + OTDCODE matching (like arretController)
    const classifyStop = (stop, otdcodes) => {
      const refLat = stop.avg_lat
        ? parseFloat(stop.avg_lat)
        : parseFloat(stop.latitude);
      const refLng = stop.avg_lng
        ? parseFloat(stop.avg_lng)
        : parseFloat(stop.longitude);

      // Find nearest POI
      let minDistance = Infinity;
      let nearestPoi = null;
      if (Number.isFinite(refLat) && Number.isFinite(refLng)) {
        pois.forEach((poi) => {
          const dist = calculateDistance(
            refLat,
            refLng,
            poi.latNum,
            poi.lngNum,
          );
          if (dist < minDistance) {
            minDistance = dist;
            nearestPoi = poi;
          }
        });
      }

      // Check if the nearest POI matches a planned OTDCODE
      const normalize = (val) =>
        (val || "").toString().replace(/\s+/g, "").toUpperCase();
      const poiCode = nearestPoi ? normalize(nearestPoi.code) : null;
      const isPlanned =
        poiCode && (otdcodes || []).some((code) => normalize(code) === poiCode);

      // Conforme = distance ≤ 10m AND planned
      const isConformeCalculated = minDistance <= 10 && isPlanned;
      const isConforme = stop.db_etat
        ? stop.db_etat === "conforme"
        : isConformeCalculated;

      const pointNoirMatch = findPointNoirMatch(refLat, refLng);

      return {
        type: isConforme ? "stop_conforme" : "stop_non_conforme",
        poiName: nearestPoi ? `${nearestPoi.code} - ${nearestPoi.nom}` : null,
        distance: minDistance !== Infinity ? Math.round(minDistance) : null,
        conforme: isConforme,
        isPointNoir: Boolean(pointNoirMatch),
        pointNoirPoi: pointNoirMatch
          ? `${pointNoirMatch.poi.code} - ${pointNoirMatch.poi.nom}`
          : null,
      };
    };

    // Group voyages by camion + voycle
    const voyageGroups = {};
    voyageResult.rows.forEach((v) => {
      const groupKey = `${v.PLAMOTI}__${v.VOYCLE}`;
      if (!voyageGroups[groupKey]) {
        voyageGroups[groupKey] = {
          camion: v.PLAMOTI,
          chauffeur: v.SALNOM || "—",
          voycle: v.VOYCLE,
          heureDep: Number(v.VOYHRD) || null,
          heureFin: Number(v.VOYHRF) || null,
          otdcodes: [],
          clients: [],
        };
      }
      if (v.OTDCODE) voyageGroups[groupKey].otdcodes.push(v.OTDCODE);
      // Update dep/fin with min/max across all clients in this voyage
      const hrd = Number(v.VOYHRD);
      const hrf = Number(v.VOYHRF);
      if (
        hrd &&
        (!voyageGroups[groupKey].heureDep ||
          hrd < voyageGroups[groupKey].heureDep)
      ) {
        voyageGroups[groupKey].heureDep = hrd;
      }
      if (
        hrf &&
        (!voyageGroups[groupKey].heureFin ||
          hrf > voyageGroups[groupKey].heureFin)
      ) {
        voyageGroups[groupKey].heureFin = hrf;
      }
      voyageGroups[groupKey].clients.push({
        ordre: Number(v.PLATOUORDRE) || 0,
        client: v.SITSIRETEDI || "—",
        region: v.RGILIBL || "—",
        code: v.OTDCODE || "—",
      });
    });

    // Build Gantt data
    const ganttData = Object.values(voyageGroups).map((vg) => {
      const camionKey = normKey(vg.camion);
      const stops = stopsMap[camionKey] || [];
      const ravits = ravitMap[camionKey] || [];
      const ouvertures = ouverturesMap[camionKey] || [];
      const appels = appelsMap[camionKey] || [];
      const otdcodes = [...new Set(vg.otdcodes)]; // unique OTDCODE list

      // Trip window: VOYHRD → VOYHRF
      const tripStart = vg.heureDep ? numToTime(vg.heureDep) : null;
      const tripEnd = vg.heureFin ? numToTime(vg.heureFin) : null;

      if (!tripStart || !tripEnd) {
        return {
          id: `${vg.camion}-${vg.voycle}`,
          camion: vg.camion,
          chauffeur: vg.chauffeur,
          voycle: vg.voycle,
          heureDep: numToTimeStr(vg.heureDep),
          heureFin: numToTimeStr(vg.heureFin),
          clients: vg.clients,
          nbClients: vg.clients.length,
          segments: [],
          hasData: false,
        };
      }

      // Collect ALL events within the trip window [tripStart, tripEnd]
      const events = [];

      // Filter calls that happened during this trip
      const tripAppels = appels.filter((a) => {
        const callTime = new Date(a.time);
        return callTime >= tripStart && callTime <= tripEnd;
      });

      // ── Process Stops ──within trip window
      stops.forEach((stop) => {
        const sStart = new Date(stop.beginstoptime);
        const durationMin = Number(stop.stopduration) || 0;
        const sEnd = new Date(
          stop.endstoptime || sStart.getTime() + durationMin * 60000,
        );

        // Only include stops that overlap with the trip window
        if (sEnd <= tripStart || sStart >= tripEnd) return;

        const clampedStart = sStart < tripStart ? tripStart : sStart;
        const clampedEnd = sEnd > tripEnd ? tripEnd : sEnd;

        const classification = classifyStop(stop, otdcodes);
        events.push({
          type: classification.type,
          start: clampedStart,
          end: clampedEnd,
          duration: Math.round((clampedEnd - clampedStart) / 60000),
          address: stop.address || "—",
          lat: stop.avg_lat
            ? Number(stop.avg_lat)
            : stop.latitude
              ? Number(stop.latitude)
              : null,
          lng: stop.avg_lng
            ? Number(stop.avg_lng)
            : stop.longitude
              ? Number(stop.longitude)
              : null,
          poiName: classification.poiName,
          distance: classification.distance,
          conforme: classification.conforme,
          isPointNoir: classification.isPointNoir,
          pointNoirPoi: classification.pointNoirPoi,
        });
      });

      // — Ravitaillements within trip window
      ravits.forEach((r) => {
        if (r.time < tripStart || r.time >= tripEnd) return;
        const rEnd = new Date(r.time.getTime() + 15 * 60000); // 15 min default duration
        events.push({
          type: "ravitaillement",
          start: r.time,
          end: rEnd > tripEnd ? tripEnd : rEnd,
          duration: 15,
          address: r.lieu || "—",
          lat: r.lat,
          lng: r.lng,
          poiName: r.lieu || "Station carburant",
          distance: null,
          conforme: true,
        });
      });

      // — Ouvertures de porte within trip window
      ouvertures.forEach((o) => {
        if (o.end <= tripStart || o.start >= tripEnd) return;
        const clampedStart = o.start < tripStart ? tripStart : o.start;
        const clampedEnd = o.end > tripEnd ? tripEnd : o.end;

        let isConforme = false;
        let nearestPoi = null;
        let minDistance = Infinity;

        if (o.db_etat) {
          isConforme = o.db_etat === "conforme";
        } else {
          if (o.lat && o.lng) {
            pois.forEach((poi) => {
              const dist = calculateDistance(
                o.lat, o.lng,
                poi.latNum, poi.lngNum,
              );
              if (dist < minDistance) {
                minDistance = dist;
                nearestPoi = poi;
              }
            });
          }
          const poiCode = nearestPoi ? normKey(nearestPoi.code) : null;
          const isPlanned = poiCode && otdcodes.some((code) => normKey(code) === poiCode);
          isConforme = minDistance <= 10 && isPlanned;
        }

        const pointNoirMatch = findPointNoirMatch(o.lat, o.lng);

        events.push({
          type: "ouverture_porte",
          start: clampedStart,
          end: clampedEnd,
          duration: Math.round((clampedEnd - clampedStart) / 60000),
          address: o.adresse || "—",
          lat: o.lat,
          lng: o.lng,
          poiName: nearestPoi ? `${nearestPoi.code} - ${nearestPoi.nom}` : null,
          distance: minDistance !== Infinity ? Math.round(minDistance) : null,
          conforme: isConforme,
          isPointNoir: Boolean(pointNoirMatch),
          pointNoirPoi: pointNoirMatch
            ? `${pointNoirMatch.poi.code} - ${pointNoirMatch.poi.nom}`
            : null,
          tempOuv: o.tempOuv,
          tempVar: o.tempVar,
          tempFer: o.tempFer,
        });
      });

      // Sort all events by start time
      events.sort((a, b) => a.start - b.start);

      // Build final segments: fill gaps with 'driving'
      const segments = [];
      let cursor = tripStart;
      const now = new Date();

      events.forEach((evt) => {
        if (evt.start > cursor) {
          const gapStart = cursor;
          const gapEnd = evt.start;
          
          if (now > gapStart && now < gapEnd) {
            segments.push({
              type: "driving",
              start: gapStart.toISOString(),
              end: now.toISOString(),
              duration: Math.round((now - gapStart) / 60000),
            });
            segments.push({
              type: "planned_driving",
              start: now.toISOString(),
              end: gapEnd.toISOString(),
              duration: Math.round((gapEnd - now) / 60000),
            });
          } else if (now <= gapStart) {
            segments.push({
              type: "planned_driving",
              start: gapStart.toISOString(),
              end: gapEnd.toISOString(),
              duration: Math.round((gapEnd - gapStart) / 60000),
            });
          } else {
            segments.push({
              type: "driving",
              start: gapStart.toISOString(),
              end: gapEnd.toISOString(),
              duration: Math.round((gapEnd - gapStart) / 60000),
            });
          }
        }
        segments.push({
          ...evt,
          start: evt.start.toISOString(),
          end: evt.end.toISOString(),
        });
        if (evt.end > cursor) cursor = evt.end;
      });

      // Fill remaining time until tripEnd with driving
      if (cursor < tripEnd) {
        if (now > cursor && now < tripEnd) {
          segments.push({
            type: "driving",
            start: cursor.toISOString(),
            end: now.toISOString(),
            duration: Math.round((now - cursor) / 60000),
          });
          segments.push({
            type: "planned_driving",
            start: now.toISOString(),
            end: tripEnd.toISOString(),
            duration: Math.round((tripEnd - now) / 60000),
          });
        } else if (now <= cursor) {
          segments.push({
            type: "planned_driving",
            start: cursor.toISOString(),
            end: tripEnd.toISOString(),
            duration: Math.round((tripEnd - cursor) / 60000),
          });
        } else {
          segments.push({
            type: "driving",
            start: cursor.toISOString(),
            end: tripEnd.toISOString(),
            duration: Math.round((tripEnd - cursor) / 60000),
          });
        }
      }

      const totalMinutes = Math.round((tripEnd - tripStart) / 60000);
      const drivingMinutes = segments
        .filter((s) => s.type === "driving")
        .reduce((sum, s) => sum + (s.duration || 0), 0);

      // ── POI progress: planned destinations with visited/remaining ──
      const normalizeCode = (val) =>
        (val || "").toString().replace(/\s+/g, "").toUpperCase();

      const plannedPois = vg.clients
        .sort((a, b) => a.ordre - b.ordre)
        .map((client) => {
          const poiMatch = pois.find(
            (p) => normalizeCode(p.code) === normalizeCode(client.code),
          );
          return {
            ordre: client.ordre,
            code: client.code,
            client: client.client, // Keep original SITSIRETEDI
            poiName: poiMatch ? poiMatch.nom : null,
            region: client.region,
            poi: poiMatch
              ? {
                  code: poiMatch.code,
                  nom: poiMatch.nom,
                  lat: poiMatch.latNum,
                  lng: poiMatch.lngNum,
                }
              : null,
            visited: false,
            arrivalTime: null,
            arrivalAddress: null,
          };
        });

      // Mark visited POIs only when a conform stop validates the planned POI.
      // Restrict to stops that overlap the current trip window to avoid false positives.
      const tripStops = stops
        .map((stop) => {
          const sStart = new Date(stop.beginstoptime);
          if (Number.isNaN(sStart.getTime())) return null;
          const durationMin = Number(stop.stopduration) || 0;
          const sEnd = new Date(
            stop.endstoptime || sStart.getTime() + durationMin * 60000,
          );
          if (Number.isNaN(sEnd.getTime())) return null;
          if (sEnd <= tripStart || sStart >= tripEnd) return null;

          const classification = classifyStop(stop, otdcodes);
          const poiCode = classification.poiName
            ? normalizeCode(classification.poiName.split(" - ")[0])
            : null;

          return {
            stop,
            sStart,
            classification,
            poiCode,
          };
        })
        .filter(Boolean);

      plannedPois.forEach((pp) => {
        if (!pp.poi) return;

        let best = null; // { sStart: Date, stop }

        const plannedCode = normalizeCode(pp.code);

        tripStops.forEach((item) => {
          if (!item.classification?.conforme) return;
          if (!item.poiCode || item.poiCode !== plannedCode) return;

          if (!best || item.sStart < best.sStart) {
            best = { sStart: item.sStart, stop: item.stop };
          }
        });

        if (best) {
          pp.visited = true;
          pp.arrivalTime = best.sStart.toISOString();
          pp.arrivalAddress = best.stop.address || null;
        }
      });

      // Next unvisited POI + ETA
      const nextPoiItem = plannedPois.find((pp) => !pp.visited && pp.poi);
      let nextPoi = null;
      const gpsPos = gpsLatestMap[camionKey];

      if (nextPoiItem && gpsPos) {
        const distKm =
          calculateDistance(
            gpsPos.lat,
            gpsPos.lng,
            nextPoiItem.poi.lat,
            nextPoiItem.poi.lng,
          ) / 1000;
        const avgSpeed = gpsPos.speed > 5 ? gpsPos.speed : 40;
        const hoursToArrive = distKm / avgSpeed;
        const etaDate = new Date(
          gpsPos.timestamp.getTime() + hoursToArrive * 3600000,
        );
        nextPoi = {
          code: nextPoiItem.code,
          nom: nextPoiItem.poi.nom,
          lat: nextPoiItem.poi.lat,
          lng: nextPoiItem.poi.lng,
          distanceKm: Math.round(distKm * 10) / 10,
          eta: etaDate.toISOString(),
          etaFormatted: `${String(etaDate.getHours()).padStart(2, "0")}:${String(etaDate.getMinutes()).padStart(2, "0")}`,
        };
      } else if (nextPoiItem) {
        nextPoi = {
          code: nextPoiItem.code,
          nom: nextPoiItem.poi?.nom || nextPoiItem.code,
          lat: nextPoiItem.poi?.lat,
          lng: nextPoiItem.poi?.lng,
          distanceKm: null,
          eta: null,
          etaFormatted: null,
        };
      }

      const visitedCount = plannedPois.filter((pp) => pp.visited).length;

      return {
        id: `${vg.camion}-${vg.voycle}`,
        camion: vg.camion,
        chauffeur: vg.chauffeur,
        voycle: vg.voycle,
        heureDep: numToTimeStr(vg.heureDep),
        heureFin: numToTimeStr(vg.heureFin),
        dureeTrajet: `${Math.floor(totalMinutes / 60)}h${totalMinutes % 60 > 0 ? String(totalMinutes % 60).padStart(2, "0") : ""}`,
        clients: plannedPois,
        nbClients: vg.clients.length,
        segments,
        hasData: true,
        movingPct:
          totalMinutes > 0
            ? Math.round((drivingMinutes / totalMinutes) * 100)
            : 0,
        nbStopsConforme: segments.filter((s) => s.type === "stop_conforme")
          .length,
        nbStopsNonConforme: segments.filter(
          (s) => s.type === "stop_non_conforme",
        ).length,
        nbRavitaillements: segments.filter((s) => s.type === "ravitaillement")
          .length,
        nbOuverturesPorte: segments.filter((s) => s.type === "ouverture_porte")
          .length,
        plannedPois,
        nextPoi,
        poiProgress: { visited: visitedCount, total: plannedPois.length },
        appels: tripAppels,
        currentPosition: gpsPos
          ? { lat: gpsPos.lat, lng: gpsPos.lng, speed: gpsPos.speed }
          : null,
      };
    });

    return Response.json({ success: true, data: ganttData, date: targetDate });
  } catch (error) {
    console.error("Error getCamionsGantt:", error);
    return Response.json(
      {
        success: false,
        message: "Erreur Gantt",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 },
    );
  }
};

export const getCamionTrajet = async (camion, date) => {
  try {
    const params = [camion];
    let query = `
      SELECT latitude, longitude, gps_timestamp
      FROM local_histo_gps_all
      WHERE camion = $1
    `;

    if (date) {
      query += " AND DATE(gps_timestamp) = $2";
      params.push(date);
    }

    query += " ORDER BY gps_timestamp ASC";

    const result = await pool.query(query, params);

    const trajet = result.rows
      .filter((item) => item.latitude != null && item.longitude != null)
      .map((item) => [Number(item.latitude), Number(item.longitude)])
      .filter(
        (pt, i, arr) =>
          i === 0 || pt[0] !== arr[i - 1][0] || pt[1] !== arr[i - 1][1],
      );

    return Response.json({ success: true, data: trajet });
  } catch (error) {
    console.error("Error getCamionTrajet:", error);
    return Response.json(
      {
        success: false,
        message: "Erreur lors de la récupération du trajet",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 },
    );
  }
};
