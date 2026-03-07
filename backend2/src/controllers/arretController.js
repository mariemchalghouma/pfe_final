import pool from '../config/database.js';

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
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
};

/**
 * Récupérer tous les arrêts de la table voyage_tracking_stops
 * Logique de conformité :
 * 1. Calcul de la position moyenne réelle du camion (local_histo_gps_all) durant l'arrêt
 * 2. Comparaison avec la liste des POI (0-10 mètres)
 */
export const getStops = async () => {
  try {
    const poiResult = await pool.query('SELECT code, lat, lng FROM poi');
    const pois = poiResult.rows;

    const query = `
      SELECT
          s.camion,
          s.beginstoptime,
          s.endstoptime,
          s.stopduration,
          s.latitude AS lat,
          s.longitude AS lng,
          s.address,
          AVG(g.latitude) AS avg_lat,
          AVG(g.longitude) AS avg_lng
      FROM voyage_tracking_stops s
      LEFT JOIN local_histo_gps_all g ON
          REPLACE(g.camion, ' ', '') = REPLACE(s.camion, ' ', '') AND
          g.gps_timestamp BETWEEN s.beginstoptime AND s.endstoptime
      GROUP BY s.camion, s.beginstoptime, s.endstoptime, s.stopduration, s.latitude, s.longitude, s.address, s.created_date
      ORDER BY s.beginstoptime DESC
    `;

    const result = await pool.query(query);

    const arrets = result.rows.map((row, index) => {
      const refLat = row.avg_lat ? parseFloat(row.avg_lat) : parseFloat(row.lat);
      const refLng = row.avg_lng ? parseFloat(row.avg_lng) : parseFloat(row.lng);

      let minDistance = Infinity;
      let nearestPoi = null;

      if (refLat && refLng) {
        pois.forEach((poi) => {
          const dist = calculateDistance(refLat, refLng, parseFloat(poi.lat), parseFloat(poi.lng));
          if (dist < minDistance) {
            minDistance = dist;
            nearestPoi = poi.code;
          }
        });
      }
      const isConforme = minDistance <= 10;

      return {
        id: index + 1,
        camion: row.camion || 'Inconnu',
        date: row.beginstoptime
          ? new Date(row.beginstoptime).toISOString().replace('T', ' ').substring(0, 16)
          : '-',
        duree: row.stopduration
          ? `${row.stopduration.hours || 0}h ${row.stopduration.minutes || 0}min`
          : '-',
        poiGps: row.address || '-',
        poiPlanning: nearestPoi || (isConforme ? 'Site Validé' : '-'),
        nVoyage: '-',
        status: isConforme ? 'conforme' : 'non_conforme',
        lat: refLat,
        lng: refLng,
        distance: minDistance === Infinity ? null : Math.round(minDistance),
        action: isConforme ? null : 'ajouter_poi',
      };
    });

    return Response.json({ success: true, data: arrets });
  } catch (error) {
    console.error('Error getStops:', error);
    return Response.json(
      {
        success: false,
        message: 'Erreur lors de la récupération des arrêts',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      },
      { status: 500 }
    );
  }
};
