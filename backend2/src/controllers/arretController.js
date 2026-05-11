import pool from "../config/database.js";

const stopsResponseCache = new Map();
const STOPS_CACHE_TTL_MS = 60_000;

/**
 * Calcule la distance entre deux points GPS en mètres (Formule Haversine)
 */
export const calculateDistance = (lat1, lon1, lat2, lon2) => {
  if (!lat1 || !lon1 || !lat2 || !lon2) return Infinity;

  const R = 6371000;
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

const pad2 = (value) => String(value).padStart(2, "0");

const toLocalDateKey = (value) => {
  if (!value) return null;

  if (typeof value === "string") {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
};

const formatLocalDateTime = (value) => {
  if (!value) return "-";

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return `${toLocalDateKey(date)} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
};

/**
 * Récupérer tous les arrêts de la table voyage_tracking_stops
 * Logique de conformité :
 * 1. Calcul de la position moyenne réelle du camion (local_histo_gps_all) durant l'arrêt
 * 2. Comparaison avec la liste des POI (rayon configurable, défaut 10 mètres)
 */
export const getStops = async ({
  date,
  dateStart,
  dateEnd,
  rayon = 10,
  limit = 500,
  offset = 0,
} = {}) => {
  try {
    const start = dateStart || date || new Date().toISOString().split("T")[0];
    const end = dateEnd || date || start;
    const dayRange = Math.floor(
      (new Date(end) - new Date(start)) / (1000 * 60 * 60 * 24),
    );
    const cacheTTL =
      dayRange > 7 ? 5 * 60_000 : dayRange > 1 ? 3 * 60_000 : 60_000;
    const cacheKey = `${start}|${end}|${rayon}|${limit}|${offset}`;
    const cachedEntry = stopsResponseCache.get(cacheKey);
    if (cachedEntry && cachedEntry.expiresAt > Date.now()) {
      return Response.json(cachedEntry.payload);
    }

    const normalize = (val) =>
      (val || "").toString().replace(/\s+/g, "").toUpperCase();

    const query = `
      WITH dedup_stops AS (
        SELECT DISTINCT ON (
            s.address,
            s.beginstoptime,
            s.endstoptime,
            s.stopduration,
            s.camion,
            s.latitude,
            s.longitude,
            s.systemgps,
            s.created_date
        )
            s.ctid::text AS ctid,
            s.camion,
            s.beginstoptime,
            s.endstoptime,
            s.stopduration,
            s.latitude AS lat,
            s.longitude AS lng,
            s.address,
            s.systemgps,
            s.created_date
        FROM voyage_tracking_stops s
        WHERE s.beginstoptime >= $1::date
          AND s.beginstoptime < ($2::date + INTERVAL '1 day')
        ORDER BY
            s.address,
            s.beginstoptime,
            s.endstoptime,
            s.stopduration,
            s.camion,
            s.latitude,
            s.longitude,
            s.systemgps,
            s.created_date,
            s.ctid
      ),
      page_stops AS (
        SELECT *
        FROM dedup_stops
        ORDER BY beginstoptime DESC, ctid
        LIMIT $3 OFFSET $4
      )
      SELECT
          p.ctid,
          p.camion,
          p.beginstoptime,
          p.endstoptime,
          p.stopduration,
          p.lat,
          p.lng,
          p.address,
          p.systemgps,
          gps.avg_lat,
          gps.avg_lng
      FROM page_stops p
      LEFT JOIN LATERAL (
          SELECT
              AVG(g.latitude) AS avg_lat,
              AVG(g.longitude) AS avg_lng
          FROM local_histo_gps_all g
          WHERE REPLACE(UPPER(TRIM(g.camion)), ' ', '') = REPLACE(UPPER(TRIM(p.camion)), ' ', '')
            AND g.gps_timestamp BETWEEN p.beginstoptime AND p.endstoptime
      ) gps ON TRUE
      ORDER BY p.beginstoptime DESC, p.ctid
    `;

    const [poiResult, voyageResult, result] = await Promise.all([
      pool.query(`
        SELECT code, description as nom, lat, lng, rayon FROM poi
      `),
      pool.query(
        `
        SELECT "PLAMOTI", "VOYDTD", "VOYCLE", "SALNOM", "SALTEL", "RGILIBL", "SITSIRETEDI", "OTDCODE"
        FROM voyage_chauffeur
        WHERE "VOYDTD" >= $1::date
          AND "VOYDTD" < ($2::date + INTERVAL '1 day')
      `,
        [start, end],
      ),
      pool.query(query, [start, end, limit, offset]),
    ]);

    const parsedPois = poiResult.rows
      .map((poi) => ({
        ...poi,
        latNum: Number(poi.lat),
        lngNum: Number(poi.lng),
      }))
      .filter(
        (poi) => Number.isFinite(poi.latNum) && Number.isFinite(poi.lngNum),
      );

    const poiByCode = new Map(
      parsedPois.map((poi) => [normalize(poi.code), poi]),
    );

    const voyagesByCamionDate = new Map();
    voyageResult.rows.forEach((voyage) => {
      const key = `${normalize(voyage.PLAMOTI)}|${toLocalDateKey(voyage.VOYDTD)}`;
      if (!voyagesByCamionDate.has(key)) voyagesByCamionDate.set(key, []);
      voyagesByCamionDate.get(key).push(voyage);
    });

    const arrets = result.rows.map((row) => {
      // Utiliser ctid (row ID interne PostgreSQL) pour une vraie clé unique
      const stableId = row.ctid;
      const avgLat = row.avg_lat != null ? Number(row.avg_lat) : NaN;
      const avgLng = row.avg_lng != null ? Number(row.avg_lng) : NaN;
      const rowLat = row.lat != null ? Number(row.lat) : NaN;
      const rowLng = row.lng != null ? Number(row.lng) : NaN;
      const refLat = Number.isFinite(avgLat) ? avgLat : rowLat;
      const refLng = Number.isFinite(avgLng) ? avgLng : rowLng;
      const hasRefCoords = Number.isFinite(refLat) && Number.isFinite(refLng);
      const stopDate = toLocalDateKey(row.beginstoptime);

      let minDistance = Infinity;
      let nearestPoi = null;

      if (hasRefCoords) {
        parsedPois.forEach((poi) => {
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

      // Vérifier si l'arrêt était planifié (camion + date)
      // Si plusieurs voyages le même jour pour le même camion, matcher par POI programmé le plus proche
      const stopCamionNorm = normalize(row.camion);
      const voyageLookupKey = `${stopCamionNorm}|${stopDate}`;
      const possibleVoyages = voyagesByCamionDate.get(voyageLookupKey) || [];

      let matchedVoyage = null;
      if (possibleVoyages.length > 0) {
        if (possibleVoyages.length === 1) {
          matchedVoyage = possibleVoyages[0];
        } else {
          // Plusieurs voyages le même jour: matcher par POI programmé le plus proche
          // Avec seuil maximal pour éviter matcher dist trop lointaines
          let bestVoyage = null;
          let bestDistance = Infinity;
          const MAX_MATCHING_DISTANCE = 5000; // 5km max pour matcher une destination programmée

          possibleVoyages.forEach((voyage) => {
            if (voyage.OTDCODE) {
              const destinationPoi = poiByCode.get(normalize(voyage.OTDCODE));
              if (destinationPoi && hasRefCoords) {
                const distToPoi = calculateDistance(
                  refLat,
                  refLng,
                  destinationPoi.latNum,
                  destinationPoi.lngNum,
                );
                // Matcher uniquement si distance raisonnable, pas juste le "moins mauvais"
                if (
                  distToPoi < bestDistance &&
                  distToPoi < MAX_MATCHING_DISTANCE
                ) {
                  bestDistance = distToPoi;
                  bestVoyage = voyage;
                }
              }
            }
          });

          // Si aucun POI planifié n'est suffisamment proche, ne pas forcer un voyage arbitraire
          matchedVoyage = bestVoyage;
        }
      }

      // POI programmé via OTDCODE (destination prévue)
      const plannedPoi = matchedVoyage?.OTDCODE
        ? poiByCode.get(normalize(matchedVoyage.OTDCODE))
        : null;

      const plannedDistance =
        plannedPoi && hasRefCoords
          ? calculateDistance(
              refLat,
              refLng,
              plannedPoi.latNum,
              plannedPoi.lngNum,
            )
          : Infinity;

      const plannedPoiRayon =
        plannedPoi?.rayon !== null && plannedPoi?.rayon !== undefined
          ? parseFloat(plannedPoi.rayon)
          : rayon;

      const nearestDistanceMeters =
        minDistance === Infinity ? null : Math.round(minDistance);
      const plannedDistanceMeters =
        plannedDistance === Infinity ? null : Math.round(plannedDistance);
      const plannedRayonMeters = Number.isFinite(plannedPoiRayon)
        ? Math.round(plannedPoiRayon)
        : null;

      // Conformité finale: planification trouvée + OTDCODE lié à un POI + distance dans le rayon du POI programmé
      const isConforme =
        !!matchedVoyage &&
        !!plannedPoi &&
        plannedDistance !== Infinity &&
        plannedDistance <= plannedPoiRayon;

      let destinationName = "-";
      if (matchedVoyage && matchedVoyage.OTDCODE) {
        const destPoi = plannedPoi;
        destinationName = destPoi
          ? `${destPoi.code} - ${destPoi.nom}`
          : matchedVoyage.OTDCODE;
      }

      return {
        id: stableId,
        camion: row.camion || "Inconnu",
        date: formatLocalDateTime(row.beginstoptime),
        duree: row.stopduration
          ? `${row.stopduration.hours || 0}h ${row.stopduration.minutes || 0}min`
          : "-",
        poiGps: row.address || "-",
        poiPlanning: nearestPoi
          ? `${nearestPoi.code} - ${nearestPoi.nom}`
          : isConforme
            ? "Site Validé"
            : "-",
        systemgps: row.systemgps || "-",
        voycle: matchedVoyage ? matchedVoyage.VOYCLE : "-",
        chauffeur_nom: matchedVoyage ? matchedVoyage.SALNOM : "-",
        chauffeur_tel: matchedVoyage ? matchedVoyage.SALTEL : "-",
        nVoyage: "-",
        destination_programmee: destinationName,
        status: isConforme ? "conforme" : "non_conforme",
        lat: refLat,
        lng: refLng,
        distance: nearestDistanceMeters,
        distance_poi_proche: nearestDistanceMeters,
        distance_poi_programme: plannedDistanceMeters,
        rayon_poi_programme: plannedRayonMeters,
        action: isConforme ? null : "ajouter_poi",
      };
    });

    const payload = {
      success: true,
      data: arrets,
      meta: { rayon, limit, offset, hasMore: arrets.length === limit },
    };
    stopsResponseCache.set(cacheKey, {
      payload,
      expiresAt: Date.now() + cacheTTL,
    });

    return Response.json(payload);
  } catch (error) {
    console.error("Error getStops:", error);
    return Response.json(
      {
        success: false,
        message: "Erreur lors de la récupération des arrêts",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 },
    );
  }
};
