import pool from '../config/database.js';

let poiHasRayonColumn = null;

const hasRayonColumn = async () => {
  if (poiHasRayonColumn !== null) return poiHasRayonColumn;
  const result = await pool.query(
    `SELECT 1
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'poi'
       AND column_name = 'rayon'
     LIMIT 1`
  );
  poiHasRayonColumn = result.rows.length > 0;
  return poiHasRayonColumn;
};

export const getPOIs = async () => {
  try {
    const canSaveRayon = await hasRayonColumn();
    const rayonCol = canSaveRayon ? 'rayon' : 'NULL as rayon';

    const result = await pool.query(`
      SELECT id, code, groupe, type, lat, lng, description, ${rayonCol}
      FROM poi
      UNION ALL
      SELECT (id + 1000000) as id, code_client as code, group_id as groupe, type_point as type, lat, lng, nom_client as description, 10 as rayon
      FROM magasin_aziza
      ORDER BY code ASC
    `);
    return Response.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error getPOIs:', error);
    return Response.json(
      {
        success: false,
        message: 'Erreur lors de la récupération des POI',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      },
      { status: 500 }
    );
  }
};

export const getPOIHistory = async () => {
  try {
    const result = await pool.query('SELECT * FROM poi_historique ORDER BY created_at DESC LIMIT 100');
    return Response.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error getPOIHistory:', error);
    return Response.json(
      {
        success: false,
        message: "Erreur lors de la récupération de l'historique",
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      },
      { status: 500 }
    );
  }
};

export const createPOI = async (request) => {
  try {
    const { code, groupe, type, lat, lng, description, rayon } = await request.json();
    const canSaveRayon = await hasRayonColumn();

    const result = canSaveRayon
      ? await pool.query(
        'INSERT INTO poi (code, groupe, type, lat, lng, description, rayon) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
        [code, groupe, type || 'Point', lat, lng, description, rayon]
      )
      : await pool.query(
        'INSERT INTO poi (code, groupe, type, lat, lng, description) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
        [code, groupe, type || 'Point', lat, lng, description]
      );

    const newPoi = result.rows[0];

    await pool.query(
      'INSERT INTO poi_historique (poi_id, poi_code, action, details) VALUES ($1, $2, $3, $4)',
      [newPoi.id, newPoi.code, 'CREATE', `Nouveau POI créé : ${newPoi.code} (${newPoi.groupe})`]
    );

    return Response.json({ success: true, data: newPoi }, { status: 201 });
  } catch (error) {
    console.error('Error createPOI:', error);
    return Response.json(
      {
        success: false,
        message: 'Erreur lors de la création du POI',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      },
      { status: 500 }
    );
  }
};

export const updatePOI = async (id, request) => {
  try {
    const { code, groupe, type, lat, lng, description, rayon } = await request.json();
    const canSaveRayon = await hasRayonColumn();

    const isAziza = id >= 1000000;
    const realId = isAziza ? id - 1000000 : id;
    const tableName = isAziza ? 'magasin_aziza' : 'poi';

    const oldDataResult = await pool.query(`SELECT * FROM ${tableName} WHERE id = $1`, [realId]);
    if (oldDataResult.rows.length === 0) {
      return Response.json({ success: false, message: 'POI non trouvé' }, { status: 404 });
    }

    const oldPoi = oldDataResult.rows[0];
    let updatedPoi;

    if (isAziza) {
      const result = await pool.query(
        'UPDATE magasin_aziza SET code_client = $1, group_id = $2, type_point = $3, lat = $4, lng = $5, nom_client = $6 WHERE id = $7 RETURNING *',
        [code, groupe, type, lat, lng, description, realId]
      );
      const row = result.rows[0];
      updatedPoi = {
        id: row.id + 1000000,
        code: row.code_client,
        groupe: row.group_id,
        type: row.type_point,
        lat: row.lat,
        lng: row.lng,
        description: row.nom_client
      };
    } else {
      const result = canSaveRayon
        ? await pool.query(
          'UPDATE poi SET code = $1, groupe = $2, type = $3, lat = $4, lng = $5, description = $6, rayon = $7 WHERE id = $8 RETURNING *',
          [code, groupe, type, lat, lng, description, rayon, realId]
        )
        : await pool.query(
          'UPDATE poi SET code = $1, groupe = $2, type = $3, lat = $4, lng = $5, description = $6 WHERE id = $7 RETURNING *',
          [code, groupe, type, lat, lng, description, realId]
        );
      updatedPoi = result.rows[0];
    }

    const changes = [];
    const oldCode = isAziza ? oldPoi.code_client : oldPoi.code;
    const oldGroupe = isAziza ? oldPoi.group_id : oldPoi.groupe;
    const oldDescription = isAziza ? oldPoi.nom_client : oldPoi.description;

    if (oldCode !== updatedPoi.code) changes.push(`Code: ${oldCode} -> ${updatedPoi.code}`);
    if (oldGroupe !== updatedPoi.groupe)
      changes.push(`Groupe: ${oldGroupe} -> ${updatedPoi.groupe}`);
    if (oldDescription !== updatedPoi.description) changes.push('Description modifiée');
    if (oldPoi.lat !== updatedPoi.lat || oldPoi.lng !== updatedPoi.lng) {
      changes.push(`Coords: (${oldPoi.lat}, ${oldPoi.lng}) -> (${updatedPoi.lat}, ${updatedPoi.lng})`);
    }
    if (!isAziza && canSaveRayon && oldPoi.rayon !== updatedPoi.rayon) {
      changes.push(`Rayon: ${oldPoi.rayon ?? '-'} -> ${updatedPoi.rayon ?? '-'}`);
    }

    await pool.query(
      'INSERT INTO poi_historique (poi_id, poi_code, action, details) VALUES ($1, $2, $3, $4)',
      [id, updatedPoi.code, 'UPDATE', changes.length > 0 ? changes.join(', ') : 'Modification générale']
    );

    return Response.json({ success: true, data: updatedPoi });
  } catch (error) {
    console.error('Error updatePOI:', error);
    return Response.json(
      {
        success: false,
        message: 'Erreur lors de la mise à jour du POI',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      },
      { status: 500 }
    );
  }
};

export const deletePOI = async (id) => {
  try {
    const isAziza = id >= 1000000;
    const realId = isAziza ? id - 1000000 : id;
    const tableName = isAziza ? 'magasin_aziza' : 'poi';

    const poiResult = await pool.query(`SELECT ${isAziza ? 'code_client as code' : 'code'} FROM ${tableName} WHERE id = $1`, [realId]);
    if (poiResult.rows.length === 0) {
      return Response.json({ success: false, message: 'POI non trouvé' }, { status: 404 });
    }

    const poiCode = poiResult.rows[0].code;

    await pool.query(`DELETE FROM ${tableName} WHERE id = $1`, [realId]);

    await pool.query(
      'INSERT INTO poi_historique (poi_id, poi_code, action, details) VALUES ($1, $2, $3, $4)',
      [id, poiCode, 'DELETE', `POI supprimé : ${poiCode} (${isAziza ? 'Magasin Aziza' : 'POI standard'})`]
    );

    return Response.json({ success: true, message: 'POI supprimé avec succès' });
  } catch (error) {
    console.error('Error deletePOI:', error);
    return Response.json(
      {
        success: false,
        message: 'Erreur lors de la suppression du POI',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      },
      { status: 500 }
    );
  }
};
