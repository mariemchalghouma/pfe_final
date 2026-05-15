import pool from "../config/database.js";

export const getOuvertures = async ({ date, dateStart, dateEnd, camion }) => {
  try {
    const RAYON_PAR_DEFAUT_METRES = 10;
    const DUREE_MAX_MINUTES = 60;
    const start = dateStart || date || new Date().toISOString().split("T")[0];
    const end = dateEnd || date || start;

    let query = `
      SELECT
          o.ctid AS row_ctid,
          o.etat AS db_etat,
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
          planning.voycle AS voycle,
          planning.chauffeur_nom,
          planning.chauffeur_tel,
          planning.destination_code,
          (planning.voycle IS NOT NULL) AS voyage_planifie,
          nearest.poi_id,
          nearest.poi_code,
          nearest.poi_groupe,
          nearest.poi_description,
          nearest.distance_m,
          planned.poi_id AS planned_poi_id,
          planned.poi_code AS planned_poi_code,
          planned.poi_groupe AS planned_poi_groupe,
          planned.poi_description AS planned_poi_description,
          planned.rayon_m AS planned_poi_rayon_m,
          planned.distance_m AS planned_distance_m
      FROM voyagetracking_port_ouvert o
      LEFT JOIN LATERAL (
        SELECT
            v."VOYCLE" AS voycle,
            v."SALNOM" AS chauffeur_nom,
            v."SALTEL" AS chauffeur_tel,
            v."OTDCODE" AS destination_code
        FROM voyage_chauffeur v
        WHERE v."PLAMOTI" IS NOT NULL
          AND UPPER(REPLACE(v."PLAMOTI"::text, ' ', '')) = UPPER(REPLACE(o.camion::text, ' ', ''))
          AND DATE(COALESCE(v."CDATE", v."VOYDTD")) = DATE(o.date_ouverture)
        ORDER BY COALESCE(v."CDATE", v."VOYDTD") DESC, v."VOYCLE" DESC
        LIMIT 1
      ) AS planning ON TRUE
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
      LEFT JOIN LATERAL (
        SELECT
            p.id AS poi_id,
            p.code AS poi_code,
            p.groupe AS poi_groupe,
            p.description AS poi_description,
            COALESCE(NULLIF(p.rayon, 0), ${RAYON_PAR_DEFAUT_METRES})::numeric AS rayon_m,
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
        WHERE o.lat IS NOT NULL
          AND o.lng IS NOT NULL
          AND planning.destination_code IS NOT NULL
          AND UPPER(REPLACE(p.code::text, ' ', '')) = UPPER(REPLACE(planning.destination_code::text, ' ', ''))
        LIMIT 1
      ) AS planned ON TRUE
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

    query += " ORDER BY o.date_ouverture DESC";

    const result = await pool.query(query, params);

    const ouvertures = result.rows.map((row) => {
      const distancePoiMetres =
        row.distance_m !== null ? Number(row.distance_m) : null;
      const distancePoiProgrammeMetres =
        row.planned_distance_m !== null ? Number(row.planned_distance_m) : null;
      const rayonPoiProgrammeMetres =
        row.planned_poi_rayon_m !== null
          ? Number(row.planned_poi_rayon_m)
          : RAYON_PAR_DEFAUT_METRES;
      const dureeMinutes =
        row.duree_minutes !== null ? Number(row.duree_minutes) : null;
      const voyagePlanifie = Boolean(row.voyage_planifie);
      const hasPoiProgramme = Boolean(row.planned_poi_id);
      const calculatedStatut =
        voyagePlanifie &&
          hasPoiProgramme &&
          distancePoiProgrammeMetres !== null &&
          distancePoiProgrammeMetres <= rayonPoiProgrammeMetres &&
          dureeMinutes !== null &&
          dureeMinutes <= DUREE_MAX_MINUTES
          ? "conforme"
          : "non_conforme";

      const statut = row.db_etat || calculatedStatut;
      const needsUpdate = !row.db_etat;

      return {
        needsUpdate,
        row_ctid: row.row_ctid,
        etat: statut,
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
        poiProgramme: row.planned_poi_code || null,
        groupePoiProgramme: row.planned_poi_groupe || null,
        adressePoiProgramme: row.planned_poi_description || null,
        distancePoiProgrammeMetres,
        seuilConformiteMetres: rayonPoiProgrammeMetres,
        seuilConformiteParDefautMetres: RAYON_PAR_DEFAUT_METRES,
        dureeMinutes,
        seuilDureeMinutes: DUREE_MAX_MINUTES,
        duree: row.duration || null,
        gpsSystem: row.gps_system,
        camion: row.camion,
        voycle: row.voycle || null,
        chauffeurNom: row.chauffeur_nom || null,
        chauffeurTel: row.chauffeur_tel || null,
        destinationCode: row.destination_code || null,
        voyagePlanifie,
        tempOuv: row.temp_ouv ? Number(row.temp_ouv) : null,
        tempVar: row.temp_var ? Number(row.temp_var) : null,
        tempFar: row.temp_fer ? Number(row.temp_fer) : null,
        statut,
      };
    });

    return Response.json({ success: true, data: ouvertures });
  } catch (error) {
    console.error("Error getOuvertures:", error);
    return Response.json(
      {
        success: false,
        message: "Erreur lors de la récupération des ouvertures de porte",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 },
    );
  }
};

export const getCamionsWithOuvertures = async () => {
  try {
    const result = await pool.query(
      `SELECT DISTINCT camion
       FROM voyagetracking_port_ouvert
       WHERE camion IS NOT NULL
       ORDER BY camion`,
    );

    return Response.json({
      success: true,
      data: result.rows.map((row) => row.camion),
    });
  } catch (error) {
    console.error("Error getCamionsWithOuvertures:", error);
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
