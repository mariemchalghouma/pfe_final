import pool from '../config/database.js';

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
    try {
        const result = await pool.query('DELETE FROM poi_groupes WHERE id = $1 RETURNING id', [id]);

        if (result.rows.length === 0) {
            return Response.json({ success: false, message: 'Groupe non trouvé' }, { status: 404 });
        }

        return Response.json({ success: true, message: 'Groupe supprimé avec succès' });
    } catch (error) {
        console.error('Error deleteGroup:', error);
        return Response.json(
            {
                success: false,
                message: 'Erreur lors de la suppression du groupe',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined,
            },
            { status: 500 }
        );
    }
};
