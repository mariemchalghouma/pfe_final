import pool from "../config/database.js";

let poiHasRayonColumn = null;
let poiHasPolygonColumn = null;
let poiHistoryHasOldDataColumn = null;
let poiHistoryHasNewDataColumn = null;

const hasRayonColumn = async () => {
  if (poiHasRayonColumn !== null) return poiHasRayonColumn;

  const result = await pool.query(`
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'poi'
      AND column_name = 'rayon'
    LIMIT 1
  `);

  poiHasRayonColumn = result.rows.length > 0;
  return poiHasRayonColumn;
};

const hasPolygonColumn = async () => {
  if (poiHasPolygonColumn !== null) return poiHasPolygonColumn;

  const result = await pool.query(`
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'poi'
      AND column_name = 'polygon'
    LIMIT 1
  `);

  poiHasPolygonColumn = result.rows.length > 0;
  return poiHasPolygonColumn;
};

const hasPoiHistoryOldDataColumn = async () => {
  if (poiHistoryHasOldDataColumn !== null) return poiHistoryHasOldDataColumn;

  const result = await pool.query(`
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'poi_historique'
      AND column_name = 'old_data'
    LIMIT 1
  `);

  poiHistoryHasOldDataColumn = result.rows.length > 0;
  return poiHistoryHasOldDataColumn;
};

const hasPoiHistoryNewDataColumn = async () => {
  if (poiHistoryHasNewDataColumn !== null) return poiHistoryHasNewDataColumn;

  const result = await pool.query(`
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'poi_historique'
      AND column_name = 'new_data'
    LIMIT 1
  `);

  poiHistoryHasNewDataColumn = result.rows.length > 0;
  return poiHistoryHasNewDataColumn;
};

const buildPoiSnapshot = (poi) => {
  if (!poi) return null;

  return {
    id: poi.id,
    code: poi.code,
    groupe: poi.groupe,
    type: poi.type,
    lat: poi.lat,
    lng: poi.lng,
    description: poi.description,
    rayon: poi.rayon ?? null,
    polygon: poi.polygon ?? null,
  };
};

const insertPoiHistory = async ({
  poiId,
  poiCode,
  action,
  details,
  oldData = null,
  newData = null,
}) => {
  const hasOldData = await hasPoiHistoryOldDataColumn();
  const hasNewData = await hasPoiHistoryNewDataColumn();

  if (hasOldData && hasNewData) {
    await pool.query(
      "INSERT INTO poi_historique (poi_id, poi_code, action, details, old_data, new_data) VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb)",
      [
        poiId,
        poiCode,
        action,
        details,
        oldData ? JSON.stringify(oldData) : null,
        newData ? JSON.stringify(newData) : null,
      ],
    );
    return;
  }

  await pool.query(
    "INSERT INTO poi_historique (poi_id, poi_code, action, details) VALUES ($1, $2, $3, $4)",
    [poiId, poiCode, action, details],
  );
};

const normalizePolygon = (polygon) => {
  if (!Array.isArray(polygon)) return null;

  const normalized = polygon
    .map((point) => {
      const lat = Number(point?.lat ?? point?.[0]);
      const lng = Number(point?.lng ?? point?.[1]);
      if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
      return { lat, lng };
    })
    .filter(Boolean);

  return normalized.length >= 3 ? normalized : null;
};

const normalizeRayon = (rayon) => {
  if (rayon === null || rayon === undefined || rayon === "") return null;

  const parsed = Number(String(rayon).replace(",", ".").trim());
  if (Number.isNaN(parsed)) return null;

  // The current DB column is integer, so store the radius in meters as int.
  return Math.max(0, Math.round(parsed));
};

export const getPOIs = async () => {
  try {
    const canSaveRayon = await hasRayonColumn();
    const canSavePolygon = await hasPolygonColumn();
    const rayonCol = canSaveRayon ? "rayon" : "NULL as rayon";
    const polygonCol = canSavePolygon ? "polygon" : "NULL as polygon";

    const result = await pool.query(`
      SELECT id, code, groupe, type, lat, lng, description, ${rayonCol}, ${polygonCol}
      FROM poi
      ORDER BY code ASC
    `);

    return Response.json({ success: true, data: result.rows });
  } catch (error) {
    console.error("Error getPOIs:", error);
    return Response.json(
      {
        success: false,
        message: "Erreur lors de la récupération des POI",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 },
    );
  }
};

export const getPOIHistory = async () => {
  try {
    const result = await pool.query(
      "SELECT * FROM poi_historique ORDER BY created_at DESC LIMIT 100",
    );
    return Response.json({ success: true, data: result.rows });
  } catch (error) {
    console.error("Error getPOIHistory:", error);
    return Response.json(
      {
        success: false,
        message: "Erreur lors de la récupération de l'historique",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 },
    );
  }
};

export const createPOI = async (request) => {
  try {
    const { code, groupe, type, lat, lng, description, rayon, polygon } =
      await request.json();
    const canSaveRayon = await hasRayonColumn();
    const canSavePolygon = await hasPolygonColumn();
    const normalizedPolygon = normalizePolygon(polygon);
    const normalizedRayon = normalizeRayon(rayon);

    let result;
    if (canSaveRayon && canSavePolygon) {
      result = await pool.query(
        "INSERT INTO poi (code, groupe, type, lat, lng, description, rayon, polygon) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb) RETURNING *",
        [
          code,
          groupe,
          type || "Point",
          lat,
          lng,
          description,
          normalizedRayon,
          normalizedPolygon ? JSON.stringify(normalizedPolygon) : null,
        ],
      );
    } else if (canSavePolygon) {
      result = await pool.query(
        "INSERT INTO poi (code, groupe, type, lat, lng, description, polygon) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb) RETURNING *",
        [
          code,
          groupe,
          type || "Point",
          lat,
          lng,
          description,
          normalizedPolygon ? JSON.stringify(normalizedPolygon) : null,
        ],
      );
    } else if (canSaveRayon) {
      result = await pool.query(
        "INSERT INTO poi (code, groupe, type, lat, lng, description, rayon) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *",
        [code, groupe, type || "Point", lat, lng, description, normalizedRayon],
      );
    } else {
      result = await pool.query(
        "INSERT INTO poi (code, groupe, type, lat, lng, description) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *",
        [code, groupe, type || "Point", lat, lng, description],
      );
    }

    const newPoi = result.rows[0];

    await insertPoiHistory({
      poiId: newPoi.id,
      poiCode: newPoi.code,
      action: "CREATE",
      details: `Nouveau POI créé : ${newPoi.code} (${newPoi.groupe})`,
      oldData: null,
      newData: buildPoiSnapshot(newPoi),
    });

    return Response.json({ success: true, data: newPoi }, { status: 201 });
  } catch (error) {
    console.error("Error createPOI:", error);
    return Response.json(
      {
        success: false,
        message: "Erreur lors de la création du POI",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 },
    );
  }
};

export const updatePOI = async (id, request) => {
  try {
    const { code, groupe, type, lat, lng, description, rayon, polygon } =
      await request.json();
    const canSaveRayon = await hasRayonColumn();
    const canSavePolygon = await hasPolygonColumn();
    const normalizedPolygon = normalizePolygon(polygon);
    const normalizedRayon = normalizeRayon(rayon);

    const oldDataResult = await pool.query("SELECT * FROM poi WHERE id = $1", [
      id,
    ]);
    if (oldDataResult.rows.length === 0) {
      return Response.json(
        { success: false, message: "POI non trouvé" },
        { status: 404 },
      );
    }

    const oldPoi = oldDataResult.rows[0];
    let result;

    if (canSaveRayon && canSavePolygon) {
      result = await pool.query(
        "UPDATE poi SET code = $1, groupe = $2, type = $3, lat = $4, lng = $5, description = $6, rayon = $7, polygon = $8::jsonb WHERE id = $9 RETURNING *",
        [
          code,
          groupe,
          type,
          lat,
          lng,
          description,
          normalizedRayon,
          normalizedPolygon ? JSON.stringify(normalizedPolygon) : null,
          id,
        ],
      );
    } else if (canSavePolygon) {
      result = await pool.query(
        "UPDATE poi SET code = $1, groupe = $2, type = $3, lat = $4, lng = $5, description = $6, polygon = $7::jsonb WHERE id = $8 RETURNING *",
        [
          code,
          groupe,
          type,
          lat,
          lng,
          description,
          normalizedPolygon ? JSON.stringify(normalizedPolygon) : null,
          id,
        ],
      );
    } else if (canSaveRayon) {
      result = await pool.query(
        "UPDATE poi SET code = $1, groupe = $2, type = $3, lat = $4, lng = $5, description = $6, rayon = $7 WHERE id = $8 RETURNING *",
        [code, groupe, type, lat, lng, description, normalizedRayon, id],
      );
    } else {
      result = await pool.query(
        "UPDATE poi SET code = $1, groupe = $2, type = $3, lat = $4, lng = $5, description = $6 WHERE id = $7 RETURNING *",
        [code, groupe, type, lat, lng, description, id],
      );
    }

    const updatedPoi = result.rows[0];
    const changes = [];

    if (oldPoi.code !== updatedPoi.code)
      changes.push(`Code: ${oldPoi.code} -> ${updatedPoi.code}`);
    if (oldPoi.groupe !== updatedPoi.groupe)
      changes.push(`Groupe: ${oldPoi.groupe} -> ${updatedPoi.groupe}`);
    if (oldPoi.description !== updatedPoi.description)
      changes.push("Description modifiée");
    if (oldPoi.lat !== updatedPoi.lat || oldPoi.lng !== updatedPoi.lng) {
      changes.push(
        `Coords: (${oldPoi.lat}, ${oldPoi.lng}) -> (${updatedPoi.lat}, ${updatedPoi.lng})`,
      );
    }
    if (canSaveRayon && oldPoi.rayon !== updatedPoi.rayon) {
      changes.push(
        `Rayon: ${oldPoi.rayon ?? "-"} -> ${updatedPoi.rayon ?? "-"}`,
      );
    }
    if (canSavePolygon) {
      const oldPolygon = JSON.stringify(oldPoi.polygon ?? null);
      const newPolygon = JSON.stringify(updatedPoi.polygon ?? null);
      if (oldPolygon !== newPolygon) {
        changes.push("Polygone modifié");
      }
    }

    await insertPoiHistory({
      poiId: id,
      poiCode: updatedPoi.code,
      action: "UPDATE",
      details:
        changes.length > 0 ? changes.join(", ") : "Modification générale",
      oldData: buildPoiSnapshot(oldPoi),
      newData: buildPoiSnapshot(updatedPoi),
    });

    return Response.json({ success: true, data: updatedPoi });
  } catch (error) {
    console.error("Error updatePOI:", error);
    return Response.json(
      {
        success: false,
        message: "Erreur lors de la mise à jour du POI",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 },
    );
  }
};

export const deletePOI = async (id) => {
  try {
    const poiResult = await pool.query("SELECT * FROM poi WHERE id = $1", [id]);
    if (poiResult.rows.length === 0) {
      return Response.json(
        { success: false, message: "POI non trouvé" },
        { status: 404 },
      );
    }

    const deletedPoi = poiResult.rows[0];
    const poiCode = deletedPoi.code;

    await pool.query("DELETE FROM poi WHERE id = $1", [id]);

    await insertPoiHistory({
      poiId: id,
      poiCode,
      action: "DELETE",
      details: `POI supprimé : ${poiCode}`,
      oldData: buildPoiSnapshot(deletedPoi),
      newData: null,
    });

    return Response.json({
      success: true,
      message: "POI supprimé avec succès",
    });
  } catch (error) {
    console.error("Error deletePOI:", error);
    return Response.json(
      {
        success: false,
        message: "Erreur lors de la suppression du POI",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 },
    );
  }
};
