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
    const result = await pool.query('SELECT * FROM poi ORDER BY code ASC');
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

    const oldDataResult = await pool.query('SELECT * FROM poi WHERE id = $1', [id]);
    if (oldDataResult.rows.length === 0) {
      return Response.json({ success: false, message: 'POI non trouvé' }, { status: 404 });
    }

    const oldPoi = oldDataResult.rows[0];

    const result = canSaveRayon
      ? await pool.query(
        'UPDATE poi SET code = $1, groupe = $2, type = $3, lat = $4, lng = $5, description = $6, rayon = $7 WHERE id = $8 RETURNING *',
        [code, groupe, type, lat, lng, description, rayon, id]
      )
      : await pool.query(
        'UPDATE poi SET code = $1, groupe = $2, type = $3, lat = $4, lng = $5, description = $6 WHERE id = $7 RETURNING *',
        [code, groupe, type, lat, lng, description, id]
      );

    const updatedPoi = result.rows[0];

    const changes = [];
    if (oldPoi.code !== updatedPoi.code) changes.push(`Code: ${oldPoi.code} -> ${updatedPoi.code}`);
    if (oldPoi.groupe !== updatedPoi.groupe)
      changes.push(`Groupe: ${oldPoi.groupe} -> ${updatedPoi.groupe}`);
    if (oldPoi.description !== updatedPoi.description) changes.push('Description modifiée');
    if (oldPoi.lat !== updatedPoi.lat || oldPoi.lng !== updatedPoi.lng) {
      changes.push(`Coords: (${oldPoi.lat}, ${oldPoi.lng}) -> (${updatedPoi.lat}, ${updatedPoi.lng})`);
    }
    if (canSaveRayon && oldPoi.rayon !== updatedPoi.rayon) {
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
    const poiResult = await pool.query('SELECT code FROM poi WHERE id = $1', [id]);
    if (poiResult.rows.length === 0) {
      return Response.json({ success: false, message: 'POI non trouvé' }, { status: 404 });
    }

    const poiCode = poiResult.rows[0].code;

    await pool.query('DELETE FROM poi WHERE id = $1 RETURNING id', [id]);

    await pool.query(
      'INSERT INTO poi_historique (poi_id, poi_code, action, details) VALUES ($1, $2, $3, $4)',
      [id, poiCode, 'DELETE', `POI supprimé : ${poiCode}`]
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
