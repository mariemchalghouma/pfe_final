import pool from '../config/database.js';
import { buildPoiSnapshot, insertPoiHistory } from './poiController.js';

export const getGroups = async () => {
    try {
        const result = await pool.query('SELECT * FROM poi_groupes ORDER BY nom ASC');
        return Response.json({ success: true, data: result.rows });
    } catch (error) {
        console.error('Error getGroups:', error);
        return Response.json(
            {
                success: false,
                message: 'Erreur lors de la récupération des groupes',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined,
            },
            { status: 500 }
        );
    }
};

export const createGroup = async (request) => {
    try {
        const { nom, description, couleur } = await request.json();

        const result = await pool.query(
            'INSERT INTO poi_groupes (nom, description, couleur) VALUES ($1, $2, $3) RETURNING *',
            [nom, description, couleur]
        );

        return Response.json({ success: true, data: result.rows[0] }, { status: 201 });
    } catch (error) {
        console.error('Error createGroup:', error);
        return Response.json(
            {
                success: false,
                message: 'Erreur lors de la création du groupe',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined,
            },
            { status: 500 }
        );
    }
};

export const updateGroup = async (id, request) => {
    try {
        const { nom, description, couleur } = await request.json();

        const result = await pool.query(
            'UPDATE poi_groupes SET nom = $1, description = $2, couleur = $3 WHERE id = $4 RETURNING *',
            [nom, description, couleur, id]
        );

        if (result.rows.length === 0) {
            return Response.json({ success: false, message: 'Groupe non trouvé' }, { status: 404 });
        }

        return Response.json({ success: true, data: result.rows[0] });
    } catch (error) {
        console.error('Error updateGroup:', error);
        return Response.json(
            {
                success: false,
                message: 'Erreur lors de la mise à jour du groupe',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined,
            },
            { status: 500 }
        );
    }
};

export const deleteGroup = async (id) => {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const groupResult = await client.query('SELECT id, nom FROM poi_groupes WHERE id = $1', [id]);
        if (groupResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return Response.json({ success: false, message: 'Groupe non trouvé' }, { status: 404 });
        }

        const group = groupResult.rows[0];
        const poisResult = await client.query('DELETE FROM poi WHERE groupe = $1 RETURNING *', [group.nom]);

        for (const poi of poisResult.rows) {
            await insertPoiHistory({
                db: client,
                poiId: poi.id,
                poiCode: poi.code,
                action: 'DELETE',
                details: `POI supprimé (groupe ${group.nom})`,
                oldData: buildPoiSnapshot(poi),
                newData: null,
            });
        }

        await client.query('DELETE FROM poi_groupes WHERE id = $1', [id]);
        await client.query('COMMIT');

        return Response.json({
            success: true,
            message: 'Groupe supprimé avec succès',
            deletedPois: poisResult.rows.length,
        });
    } catch (error) {
        try {
            await client.query('ROLLBACK');
        } catch (rollbackError) {
            console.error('Error rollback deleteGroup:', rollbackError);
        }

        console.error('Error deleteGroup:', error);
        return Response.json(
            {
                success: false,
                message: 'Erreur lors de la suppression du groupe',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined,
            },
            { status: 500 }
        );
    } finally {
        client.release();
    }
};
