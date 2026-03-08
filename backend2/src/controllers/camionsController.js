import pool from '../config/database.js';
import { calculateDistance } from './arretController.js';

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
      let statut = 'arrete';
      if (vitesse > 0) statut = 'en_route';

      return {
        id: index + 1,
        plaque: row.camion,
        chauffeur: row.chauffeur || '—',
        telephone: row.phone || '—',
        localisation:
          row.lat != null && row.lng != null
            ? `${Number(row.lat).toFixed(4)}, ${Number(row.lng).toFixed(4)}`
            : '—',
        vitesse,
        statut,
        lat: row.lat != null ? Number(row.lat) : null,
        lng: row.lng != null ? Number(row.lng) : null,
        kilometrage: row.kilometrage != null ? Number(row.kilometrage) : 0,
        carburant: row.carburant != null ? Number(row.carburant) : null,
        derniereMaj: row.derniere_maj
          ? new Date(row.derniere_maj).toISOString().replace('T', ' ').slice(0, 16)
          : '—',
        ignition: row.ignition,
      };
    });

    return Response.json({ success: true, data: camions });
  } catch (error) {
    console.error('Error getCamions:', error);
    return Response.json(
      {
        success: false,
        message: 'Erreur lors de la récupération des camions',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      },
      { status: 500 }
    );
  }
};

export const getCamionsTempsReel = async (date) => {
  try {
    const targetDate = date || new Date().toISOString().split('T')[0];

    const result = await pool.query(`
      WITH gps_today AS (
          SELECT
              UPPER(TRIM(h.camion::text)) AS camion_norm,
              h.camion AS camion_display,
              h.gps_timestamp,
              h.latitude,
              h.longitude,
              h.speed,
              h.ignition,
              ROW_NUMBER() OVER (
                  PARTITION BY UPPER(TRIM(h.camion::text))
                  ORDER BY h.gps_timestamp DESC
              ) AS rn,
              COUNT(*) OVER (
                  PARTITION BY UPPER(TRIM(h.camion::text))
              ) AS points_today
          FROM local_histo_gps_all h
          WHERE h.camion IS NOT NULL
            AND DATE(h.gps_timestamp) = $1
      ),
      gps_latest AS (
          SELECT *
          FROM gps_today
          WHERE rn = 1
      ),
      voyage_today AS (
          SELECT DISTINCT ON (UPPER(TRIM(v."PLAMOTI"::text)))
              UPPER(TRIM(v."PLAMOTI"::text)) AS camion_norm,
              v."PLAMOTI" AS camion,
              v."SALNOM" AS chauffeur,
              v."VOYCLE" AS voycle,
              v."VOYHRD" AS heure_dep,
              v."VOYHRF" AS heure_fin
          FROM voyage_chauffeur v
          WHERE v."PLAMOTI" IS NOT NULL
            AND DATE(v."CDATE") = $1
          ORDER BY UPPER(TRIM(v."PLAMOTI"::text)), v."CDATE" DESC, v."VOYCLE" DESC
      )
      SELECT
          COALESCE(v.camion, g.camion_display) AS camion,
          COALESCE(v.chauffeur, '—') AS chauffeur,
          v.voycle,
          v.heure_dep,
          v.heure_fin,
          g.gps_timestamp,
          g.latitude,
          g.longitude,
          g.speed,
          g.ignition,
          g.points_today
      FROM gps_latest g
      LEFT JOIN voyage_today v
          ON v.camion_norm = g.camion_norm
      ORDER BY COALESCE(v.camion, g.camion_display)
    `, [targetDate]);

    const toHour = (val) => {
      if (val === null || val === undefined) return null;
      const num = Number(val);
      if (Number.isNaN(num)) return null;
      const h = String(Math.floor(num / 100)).padStart(2, '0');
      const m = String(num % 100).padStart(2, '0');
      return `${h}:${m}`;
    };

    const data = result.rows.map((row, index) => {
      const speed = row.speed != null ? Number(row.speed) : 0;
      const status = speed > 0 ? 'en_route' : 'arrete';
      return {
        id: index + 1,
        camion: row.camion,
        chauffeur: row.chauffeur || '—',
        voycle: row.voycle || null,
        heureDep: toHour(row.heure_dep),
        heureFin: toHour(row.heure_fin),
        lat: row.latitude != null ? Number(row.latitude) : null,
        lng: row.longitude != null ? Number(row.longitude) : null,
        vitesse: speed,
        ignition: row.ignition,
        statut: status,
        pointsToday: row.points_today != null ? Number(row.points_today) : 0,
        derniereMaj: row.gps_timestamp
          ? new Date(row.gps_timestamp).toISOString().replace('T', ' ').slice(0, 16)
          : '—',
      };
    });

    return Response.json({ success: true, data, date: targetDate });
  } catch (error) {
    console.error('Error getCamionsTempsReel:', error);
    return Response.json(
      {
        success: false,
        message: 'Erreur lors de la récupération du temps réel',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      },
      { status: 500 }
    );
  }
};

/* ═══ Gantt data — one row per CLIENT delivery on a given date ═══ */
export const getCamionsGantt = async (date) => {
  try {
    const targetDate = date || new Date().toISOString().split('T')[0];

    // 1) All client deliveries for the date — each row = 1 client
    const voyageResult = await pool.query(`
      SELECT "PLAMOTI", "VOYCLE", "SALNOM", "RGILIBL", "SITSIRETEDI",
             "OTDCODE", "PLATOUORDRE", "VOYHRD", "VOYHRF"
      FROM voyage_chauffeur
      WHERE DATE("CDATE") = $1 AND "PLAMOTI" IS NOT NULL
      ORDER BY "PLAMOTI", "VOYCLE", "PLATOUORDRE"
    `, [targetDate]);

    if (voyageResult.rows.length === 0) {
      return Response.json({ success: true, data: [], date: targetDate });
    }

    // 2) Stops with GPS average position (same technique as arretController)
    const stopsResult = await pool.query(`
      SELECT
        s.camion, s.beginstoptime, s.endstoptime, s.stopduration,
        s.latitude, s.longitude, s.address,
        AVG(g.latitude) AS avg_lat, AVG(g.longitude) AS avg_lng
      FROM voyage_tracking_stops s
      LEFT JOIN local_histo_gps_all g ON
        REPLACE(g.camion, ' ', '') = REPLACE(s.camion, ' ', '') AND
        g.gps_timestamp BETWEEN s.beginstoptime AND s.endstoptime
      WHERE DATE(s.beginstoptime) = $1
      GROUP BY s.camion, s.beginstoptime, s.endstoptime, s.stopduration,
               s.latitude, s.longitude, s.address
      ORDER BY s.camion, s.beginstoptime ASC
    `, [targetDate]);

    // 3) GPS activity window per camion
    const gpsResult = await pool.query(`
      SELECT camion,
        MIN(gps_timestamp) AS first_seen, MAX(gps_timestamp) AS last_seen,
        SUM(CASE WHEN speed > 0 THEN 1 ELSE 0 END) AS moving_points,
        COUNT(*) AS total_points
      FROM local_histo_gps_all
      WHERE DATE(gps_timestamp) = $1
      GROUP BY camion
    `, [targetDate]);

    // 4) POIs for stop classification
    const poiResult = await pool.query('SELECT nom, groupe, type, lat, lng, rayon FROM poi');
    const pois = poiResult.rows.map(p => ({
      nom: p.nom, groupe: (p.groupe || '').toLowerCase(), type: (p.type || '').toLowerCase(),
      lat: parseFloat(p.lat), lng: parseFloat(p.lng), rayon: parseFloat(p.rayon) || 200,
    }));

    // 5) Ravitaillements on the date
    const ravitResult = await pool.query(`
      SELECT matricule_camion, COALESCE(date_trans, "date"::timestamp) AS ravit_time,
             latitude, longitude, lieu
      FROM voyagetracking_ravitaillement
      WHERE DATE(COALESCE(date_trans, "date")) = $1
      ORDER BY COALESCE(date_trans, "date"::timestamp)
    `, [targetDate]);

    const ravitMap = {};
    ravitResult.rows.forEach(r => {
      const key = (r.matricule_camion || '').replace(/\s+/g, '').toUpperCase();
      if (!ravitMap[key]) ravitMap[key] = [];
      ravitMap[key].push({
        time: new Date(r.ravit_time), lat: parseFloat(r.latitude),
        lng: parseFloat(r.longitude), lieu: r.lieu,
      });
    });

    // Helper: classify a stop via POI + ravitaillement matching
    const classifyStop = (stop, camionKey) => {
      const refLat = stop.avg_lat ? parseFloat(stop.avg_lat) : parseFloat(stop.latitude);
      const refLng = stop.avg_lng ? parseFloat(stop.avg_lng) : parseFloat(stop.longitude);
      const stopStart = new Date(stop.beginstoptime);

      const ravits = ravitMap[camionKey] || [];
      const isRavit = ravits.some(r => Math.abs(r.time - stopStart) < 3600000);
      if (isRavit) return { type: 'ravitaillement', poiName: 'Station carburant', distance: null, conforme: true };

      let bestDist = Infinity; let bestPoi = null;
      pois.forEach(poi => {
        const dist = calculateDistance(refLat, refLng, poi.lat, poi.lng);
        if (dist < bestDist) { bestDist = dist; bestPoi = poi; }
      });

      if (bestPoi && bestDist <= bestPoi.rayon) {
        const g = bestPoi.groupe;
        let segType = 'client';
        if (g.includes('depot') || g.includes('dépôt') || g.includes('base') || g.includes('entrepot') || g.includes('entrepôt')) segType = 'depot';
        else if (g.includes('station') || g.includes('carburant') || g.includes('fuel')) segType = 'ravitaillement';
        return { type: segType, poiName: bestPoi.nom, distance: Math.round(bestDist), conforme: true };
      }

      const durationMin = Number(stop.stopduration) || 0;
      return {
        type: durationMin > 30 ? 'stop_long' : 'stop',
        poiName: bestPoi ? bestPoi.nom : null,
        distance: bestDist !== Infinity ? Math.round(bestDist) : null,
        conforme: false,
      };
    };

    // Normalize camion key — strip ALL whitespace for consistent matching
    const normKey = (raw) => (raw || '').replace(/\s+/g, '').toUpperCase();

    // Build index maps (keys normalised)
    const gpsMap = {};
    gpsResult.rows.forEach(r => { gpsMap[normKey(r.camion)] = r; });

    const stopsMap = {};
    stopsResult.rows.forEach(s => {
      const key = normKey(s.camion);
      if (!stopsMap[key]) stopsMap[key] = [];
      stopsMap[key].push(s);
    });

    // Collect all voyage hours per camion — used as fallback when no GPS/stops
    const camionVoyageHours = {};
    voyageResult.rows.forEach(v => {
      const key = normKey(v.PLAMOTI);
      if (!camionVoyageHours[key]) camionVoyageHours[key] = { deps: [], fins: [] };
      if (v.VOYHRD) camionVoyageHours[key].deps.push(Number(v.VOYHRD));
      if (v.VOYHRF) camionVoyageHours[key].fins.push(Number(v.VOYHRF));
    });

    // Helper: convert VOYHRD/VOYHRF numeric (e.g. 700 → "07:00") to Date
    const numToTime = (num) => {
      const h = String(Math.floor(num / 100)).padStart(2, '0');
      const m = String(num % 100).padStart(2, '0');
      return new Date(`${targetDate}T${h}:${m}:00`);
    };

    // Helper: build stop segments from a sorted array of stops
    const buildStopSegments = (sortedStops, camionKey, cursor) => {
      const segs = [];
      let cur = cursor;
      sortedStops.forEach(stop => {
        const stopStart = new Date(stop.beginstoptime);
        const durationMin = Number(stop.stopduration) || 0;
        const stopEnd = new Date(stop.endstoptime || stopStart.getTime() + durationMin * 60000);
        const classification = classifyStop(stop, camionKey);

        if (stopStart > cur) {
          segs.push({ type: 'driving', start: cur.toISOString(), end: stopStart.toISOString() });
        }

        segs.push({
          type: classification.type, start: stopStart.toISOString(), end: stopEnd.toISOString(),
          duration: durationMin, address: stop.address || '—',
          lat: stop.avg_lat ? Number(stop.avg_lat) : (stop.latitude ? Number(stop.latitude) : null),
          lng: stop.avg_lng ? Number(stop.avg_lng) : (stop.longitude ? Number(stop.longitude) : null),
          poiName: classification.poiName, distance: classification.distance, conforme: classification.conforme,
        });
        cur = stopEnd > cur ? stopEnd : cur;
      });
      return { segs, cursor: cur };
    };

    // Compute & cache segments per unique camion
    const segmentsCache = {};
    const computeSegments = (camionKey) => {
      if (segmentsCache[camionKey]) return segmentsCache[camionKey];

      const gps = gpsMap[camionKey];
      const stops = stopsMap[camionKey] || [];
      const dayStart = new Date(`${targetDate}T00:00:00`);
      const dayEnd   = new Date(`${targetDate}T23:59:59`);

      /* ── CASE A: no GPS, no stops → use voyage hours as minimal "planned" bar ── */
      if (!gps && stops.length === 0) {
        const hours = camionVoyageHours[camionKey];
        if (hours && hours.deps.length > 0) {
          const depTime = numToTime(Math.min(...hours.deps));
          const finTime = hours.fins.length > 0
            ? numToTime(Math.max(...hours.fins))
            : new Date(depTime.getTime() + 8 * 3600000);

          const segments = [];
          if (depTime > dayStart) segments.push({ type: 'inactive', start: dayStart.toISOString(), end: depTime.toISOString() });
          segments.push({ type: 'driving', start: depTime.toISOString(), end: finTime.toISOString() });
          if (finTime < dayEnd) segments.push({ type: 'inactive', start: finTime.toISOString(), end: dayEnd.toISOString() });

          const res = { segments, hasData: true, firstSeen: depTime.toISOString(), lastSeen: finTime.toISOString(), movingPct: 100 };
          segmentsCache[camionKey] = res;
          return res;
        }
        // No hours at all — truly no data
        const res = { segments: [], hasData: false, firstSeen: null, lastSeen: null, movingPct: 0 };
        segmentsCache[camionKey] = res;
        return res;
      }

      /* ── CASE B: no GPS but stops exist → build from stops + voyage hours window ── */
      if (!gps) {
        const sortedStops = [...stops].sort((a, b) => new Date(a.beginstoptime) - new Date(b.beginstoptime));
        let activityStart = new Date(sortedStops[0].beginstoptime);
        const lastStopRaw = sortedStops[sortedStops.length - 1];
        let activityEnd = new Date(lastStopRaw.endstoptime || new Date(lastStopRaw.beginstoptime).getTime() + (Number(lastStopRaw.stopduration)||0)*60000);

        // Extend window with voyage hours if available
        const hours = camionVoyageHours[camionKey];
        if (hours?.deps?.length) {
          const depTime = numToTime(Math.min(...hours.deps));
          if (depTime < activityStart) activityStart = depTime;
        }
        if (hours?.fins?.length) {
          const finTime = numToTime(Math.max(...hours.fins));
          if (finTime > activityEnd) activityEnd = finTime;
        }

        const segments = [];
        if (activityStart > dayStart) segments.push({ type: 'inactive', start: dayStart.toISOString(), end: activityStart.toISOString() });

        const { segs, cursor } = buildStopSegments(sortedStops, camionKey, activityStart);
        segments.push(...segs);

        if (cursor < activityEnd) segments.push({ type: 'driving', start: cursor.toISOString(), end: activityEnd.toISOString() });
        if (activityEnd < dayEnd) segments.push({ type: 'inactive', start: activityEnd.toISOString(), end: dayEnd.toISOString() });

        const res = { segments, hasData: true, firstSeen: activityStart.toISOString(), lastSeen: activityEnd.toISOString(), movingPct: 50 };
        segmentsCache[camionKey] = res;
        return res;
      }

      /* ── CASE C: GPS exists → full precision (original logic) ── */
      const segments = [];
      const firstSeen = new Date(gps.first_seen);
      const lastSeen = new Date(gps.last_seen);
      const sortedStops = [...stops].sort((a, b) => new Date(a.beginstoptime) - new Date(b.beginstoptime));

      if (firstSeen > dayStart) {
        segments.push({ type: 'inactive', start: dayStart.toISOString(), end: firstSeen.toISOString() });
      }

      const { segs, cursor } = buildStopSegments(sortedStops, camionKey, firstSeen);
      segments.push(...segs);

      if (cursor < lastSeen) {
        segments.push({ type: 'driving', start: cursor.toISOString(), end: lastSeen.toISOString() });
      }
      if (lastSeen < dayEnd) {
        segments.push({ type: 'inactive', start: lastSeen.toISOString(), end: dayEnd.toISOString() });
      }

      const res = {
        segments, hasData: true,
        firstSeen: gps.first_seen, lastSeen: gps.last_seen,
        movingPct: gps.total_points > 0 ? Math.round((gps.moving_points / gps.total_points) * 100) : 0,
      };
      segmentsCache[camionKey] = res;
      return res;
    };

    // Output: one row per VOYAGE (PLAMOTI + VOYCLE), clients grouped inside
    const voyageGroups = {};
    voyageResult.rows.forEach(v => {
      const groupKey = `${v.PLAMOTI}__${v.VOYCLE}`;
      if (!voyageGroups[groupKey]) {
        voyageGroups[groupKey] = {
          camion: v.PLAMOTI,
          chauffeur: v.SALNOM || '—',
          voycle: v.VOYCLE,
          heureDep: v.VOYHRD ? `${String(Math.floor(v.VOYHRD / 100)).padStart(2, '0')}:${String(v.VOYHRD % 100).padStart(2, '0')}` : null,
          heureFin: v.VOYHRF ? `${String(Math.floor(v.VOYHRF / 100)).padStart(2, '0')}:${String(v.VOYHRF % 100).padStart(2, '0')}` : null,
          clients: [],
        };
      }
      voyageGroups[groupKey].clients.push({
        ordre: Number(v.PLATOUORDRE) || 0,
        client: v.SITSIRETEDI || '—',
        region: v.RGILIBL || '—',
        code: v.OTDCODE || '—',
      });
    });

    const ganttData = Object.values(voyageGroups).map(vg => {
      const key = normKey(vg.camion);
      const camionData = computeSegments(key);

      return {
        id: `${vg.camion}-${vg.voycle}`,
        camion: vg.camion,
        chauffeur: vg.chauffeur,
        voycle: vg.voycle,
        heureDep: vg.heureDep,
        heureFin: vg.heureFin,
        clients: vg.clients,
        nbClients: vg.clients.length,
        segments: camionData.segments,
        hasData: camionData.hasData,
        firstSeen: camionData.firstSeen,
        lastSeen: camionData.lastSeen,
        movingPct: camionData.movingPct,
      };
    });

    return Response.json({ success: true, data: ganttData, date: targetDate });
  } catch (error) {
    console.error('Error getCamionsGantt:', error);
    return Response.json({ success: false, message: 'Erreur Gantt', error: process.env.NODE_ENV === 'development' ? error.message : undefined }, { status: 500 });
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
      query += ' AND DATE(gps_timestamp) = $2';
      params.push(date);
    }

    query += ' ORDER BY gps_timestamp ASC';

    const result = await pool.query(query, params);

    const trajet = result.rows
      .filter((item) => item.latitude != null && item.longitude != null)
      .map((item) => [Number(item.latitude), Number(item.longitude)]);

    return Response.json({ success: true, data: trajet });
  } catch (error) {
    console.error('Error getCamionTrajet:', error);
    return Response.json(
      {
        success: false,
        message: 'Erreur lors de la récupération du trajet',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      },
      { status: 500 }
    );
  }
};
