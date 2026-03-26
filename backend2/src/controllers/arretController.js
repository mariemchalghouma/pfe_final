import pool from "../config/database.js";

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
} = {}) => {
  try {
    const start = dateStart || date || new Date().toISOString().split("T")[0];
    const end = dateEnd || date || start;

    const poiResult = await pool.query(`
      SELECT code, description as nom, lat, lng, rayon FROM poi
      UNION ALL
      SELECT code_client as code, nom_client as nom, lat, lng, 10 as rayon FROM magasin_aziza
    `);
    const pois = poiResult.rows;

    // Récupérer les données de planification voyage_chauffeur pour la période
    const voyageResult = await pool.query(
      `
     
      SELECT "PLAMOTI", "VOYDTD", "VOYCLE", "SALNOM", "SALTEL", "RGILIBL", "SITSIRETEDI","OTDCODE"
 
      FROM voyage_chauffeur
      WHERE DATE("VOYDTD") BETWEEN $1 AND $2
    `,
      [start, end],
    );
    const voyages = voyageResult.rows;

    const query = `
      SELECT
          s.camion,
          s.beginstoptime,
          s.endstoptime,
          s.stopduration,
          s.latitude AS lat,
          s.longitude AS lng,
          s.address,
          s.systemgps,
          AVG(g.latitude) AS avg_lat,
          AVG(g.longitude) AS avg_lng
      FROM voyage_tracking_stops s
      LEFT JOIN local_histo_gps_all g ON
          REPLACE(g.camion, ' ', '') = REPLACE(s.camion, ' ', '') AND
          g.gps_timestamp BETWEEN s.beginstoptime AND s.endstoptime
      WHERE DATE(s.beginstoptime) BETWEEN $1 AND $2
        AND s.endstoptime IS NOT NULL
        AND DATE(s.endstoptime) BETWEEN $1 AND $2
      GROUP BY s.camion, s.beginstoptime, s.endstoptime, s.stopduration, s.latitude, s.longitude, s.address, s.created_date, s.systemgps
      ORDER BY s.beginstoptime DESC
    `;

    const result = await pool.query(query, [start, end]);

    const normalize = (val) =>
      (val || "").toString().replace(/\s+/g, "").toUpperCase();

    const arrets = result.rows.map((row, index) => {
      const refLat = row.avg_lat
        ? parseFloat(row.avg_lat)
        : parseFloat(row.lat);
      const refLng = row.avg_lng
        ? parseFloat(row.avg_lng)
        : parseFloat(row.lng);
      const stopDate = row.beginstoptime
        ? new Date(row.beginstoptime).toISOString().split("T")[0]
        : null;

      let minDistance = Infinity;
      let nearestPoi = null;

      if (refLat && refLng) {
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
      }

      // Vérifier si l'arrêt était planifié (Matching Voyage Chauffeur)
      const stopCamionNorm = normalize(row.camion);
      const matchedVoyage = voyages.find((v) => {
        const voyageCamionNorm = normalize(v.PLAMOTI);
        const voyageDate = v.VOYDTD
          ? new Date(v.VOYDTD).toISOString().split("T")[0]
          : null;
        const voyagePoiNorm = normalize(v.OTDCODE);
        const poiNorm = nearestPoi ? normalize(nearestPoi.code) : null;

        return (
          voyageCamionNorm === stopCamionNorm &&
          voyageDate === stopDate &&
          voyagePoiNorm === poiNorm
        );
      });

      // Conformité : POI trouvé + Proximité <= rayon du POI ET Planifié
      const poiRayon = nearestPoi?.rayon ?? rayon;
      const isConforme =
        nearestPoi && minDistance <= poiRayon && !!matchedVoyage;

      let destinationName = "-";
      if (matchedVoyage && matchedVoyage.OTDCODE) {
        const destPoi = pois.find(
          (p) => normalize(p.code) === normalize(matchedVoyage.OTDCODE),
        );
        destinationName = destPoi
          ? `${destPoi.code} - ${destPoi.nom}`
          : matchedVoyage.OTDCODE;
      }

      return {
        id: index + 1,
        camion: row.camion || "Inconnu",
        date: row.beginstoptime
          ? new Date(row.beginstoptime)
              .toISOString()
              .replace("T", " ")
              .substring(0, 16)
          : "-",
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
        distance: minDistance === Infinity ? null : Math.round(minDistance),
        action: isConforme ? null : "ajouter_poi",
      };
    });

    return Response.json({ success: true, data: arrets, meta: { rayon } });
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
