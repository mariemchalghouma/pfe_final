import pool from '../config/database.js';

export const getOuvertures = async ({ date, dateStart, dateEnd, camion }) => {
  try {
    const DISTANCE_MAX_METRES = 5;
    const DUREE_MAX_MINUTES = 30;
    const start = dateStart || date || new Date().toISOString().split('T')[0];
    const end = dateEnd || date || start;

    let query = `
      SELECT
          o.date_ouverture,
          o.date_fermeture,
          o.assetname,
          o.adress,
          o.lat,
          o.lng,
          o.poistop,
          o.duration,
          CASE
              WHEN o.date_ouverture IS NOT NULL AND o.date_fermeture IS NOT NULL
                  THEN ROUND((EXTRACT(EPOCH FROM (o.date_fermeture - o.date_ouverture)) / 60.0)::numeric, 2)
              ELSE NULL
          END AS duree_minutes,
          o.gps_system,
          o.camion,
          o.temp_ouv,
          o.temp_var,
          o.temp_fer,
          nearest.poi_id,
          nearest.poi_code,
          nearest.poi_groupe,
          nearest.poi_description,
          nearest.distance_m
      FROM voyagetracking_port_ouvert o
      LEFT JOIN LATERAL (
        SELECT
            p.id AS poi_id,
            p.code AS poi_code,
            p.groupe AS poi_groupe,
            p.description AS poi_description,
            ROUND((
                6371000 * 2 * ASIN(
                    SQRT(
                        POWER(SIN(RADIANS(((o.lat)::double precision - (p.lat)::double precision) / 2)), 2)
                        + COS(RADIANS((o.lat)::double precision))
                        * COS(RADIANS((p.lat)::double precision))
                        * POWER(SIN(RADIANS(((o.lng)::double precision - (p.lng)::double precision) / 2)), 2)
                    )
                )
            )::numeric, 2) AS distance_m
        FROM poi p
        WHERE o.lat IS NOT NULL AND o.lng IS NOT NULL
        ORDER BY distance_m ASC
        LIMIT 1
      ) AS nearest ON TRUE
      WHERE 1=1
    `;

    const params = [];
    let paramIndex = 1;

    query += `
      AND DATE(o.date_ouverture) BETWEEN $${paramIndex} AND $${paramIndex + 1}
      AND o.date_fermeture IS NOT NULL
      AND DATE(o.date_fermeture) BETWEEN $${paramIndex} AND $${paramIndex + 1}
    `;
    params.push(start, end);
    paramIndex += 2;

    if (camion) {
      query += ` AND o.camion = $${paramIndex}`;
      params.push(camion);
      paramIndex++;
    }

    query += ' ORDER BY o.date_ouverture DESC';

    const result = await pool.query(query, params);

    const ouvertures = result.rows.map((row) => {
      const distancePoiMetres = row.distance_m !== null ? Number(row.distance_m) : null;
      const dureeMinutes = row.duree_minutes !== null ? Number(row.duree_minutes) : null;
      const statut =
        distancePoiMetres !== null &&
          distancePoiMetres <= DISTANCE_MAX_METRES &&
          dureeMinutes !== null &&
          dureeMinutes <= DUREE_MAX_MINUTES
          ? 'conforme'
          : 'non_conforme';

      return {
        dateOuverture: row.date_ouverture,
        dateFermeture: row.date_fermeture,
        assetName: row.assetname,
        localisation: row.adress || `${row.lat}, ${row.lng}`,
        lat: row.lat ? Number(row.lat) : null,
        lng: row.lng ? Number(row.lng) : null,
        poiStop: row.poistop,
        poiProche: row.poi_code || null,
        groupePoiProche: row.poi_groupe || null,
        adressePoiProche: row.poi_description || null,
        distancePoiMetres,
        seuilConformiteMetres: DISTANCE_MAX_METRES,
        dureeMinutes,
        seuilDureeMinutes: DUREE_MAX_MINUTES,
        duree: row.duration || null,
        gpsSystem: row.gps_system,
        camion: row.camion,
        tempOuv: row.temp_ouv ? Number(row.temp_ouv) : null,
        tempVar: row.temp_var ? Number(row.temp_var) : null,
        tempFar: row.temp_fer ? Number(row.temp_fer) : null,
        statut,
      };
    });

    return Response.json({ success: true, data: ouvertures });
  } catch (error) {
    console.error('Error getOuvertures:', error);
    return Response.json(
      {
        success: false,
        message: 'Erreur lors de la récupération des ouvertures de porte',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      },
      { status: 500 }
    );
  }
};

export const getCamionsWithOuvertures = async () => {
  try {
    const result = await pool.query(
      `SELECT DISTINCT camion
       FROM voyagetracking_port_ouvert
       WHERE camion IS NOT NULL
       ORDER BY camion`
    );

    return Response.json({
      success: true,
      data: result.rows.map((row) => row.camion),
    });
  } catch (error) {
    console.error('Error getCamionsWithOuvertures:', error);
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
