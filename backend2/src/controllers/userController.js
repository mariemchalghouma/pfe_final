import pool from '../config/database.js';

export const getUsers = async () => {
    try {
        const result = await pool.query(`
      SELECT id, email, name, first_name, last_name, identifiant, phone, roles, status, created_at 
      FROM users 
      ORDER BY created_at DESC
    `);
        return Response.json({ success: true, data: result.rows });
    } catch (error) {
        console.error('Error in getUsers:', error);
        return Response.json(
            { success: false, message: 'Erreur lors de la récupération des utilisateurs' },
            { status: 500 }
        );
    }
};

export const getUserById = async (id) => {
    try {
        const result = await pool.query(
            'SELECT id, email, name, first_name, last_name, identifiant, phone, roles, status, created_at FROM users WHERE id = $1',
            [id]
        );

        if (result.rows.length === 0) {
            return Response.json(
                { success: false, message: 'Utilisateur non trouvé' },
                { status: 404 }
            );
        }

        return Response.json({ success: true, data: result.rows[0] });
    } catch (error) {
        console.error('Error in getUserById:', error);
        return Response.json(
            { success: false, message: 'Erreur lors de la récupération de l\'utilisateur' },
            { status: 500 }
        );
    }
};

export const createUser = async (req) => {
    try {
        const { email, password, first_name, last_name, identifiant, phone, roles, status } = await req.json();

        // Check if user already exists
        const checkUser = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
        if (checkUser.rows.length > 0) {
            return Response.json(
                { success: false, message: 'Cet email est déjà utilisé' },
                { status: 400 }
            );
        }

        const name = `${first_name} ${last_name}`.trim();
        const result = await pool.query(
            `INSERT INTO users (email, password, name, first_name, last_name, identifiant, phone, roles, status) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
       RETURNING id, email, name, first_name, last_name, identifiant, phone, roles, status, created_at`,
            [email, password, name, first_name, last_name, identifiant, phone, JSON.stringify(roles || []), status || 'Actif']
        );

        return Response.json({ success: true, data: result.rows[0] });
    } catch (error) {
        console.error('Error in createUser:', error);
        return Response.json(
            { success: false, message: 'Erreur lors de la création de l\'utilisateur' },
            { status: 500 }
        );
    }
};

export const updateUser = async (id, req) => {
    try {
        const { email, first_name, last_name, identifiant, phone, roles, status, password } = await req.json();

        const name = `${first_name} ${last_name}`.trim();

        let query = `
      UPDATE users 
      SET email = $1, name = $2, first_name = $3, last_name = $4, identifiant = $5, phone = $6, roles = $7, status = $8
    `;
        let params = [email, name, first_name, last_name, identifiant, phone, JSON.stringify(roles || []), status, id];

        if (password) {
            query += `, password = $${params.length}`;
            params.splice(params.length - 1, 0, password);
        }

        query += ` WHERE id = $${params.length} RETURNING id, email, name, first_name, last_name, identifiant, phone, roles, status, created_at`;

        const result = await pool.query(query, params);

        if (result.rows.length === 0) {
            return Response.json(
                { success: false, message: 'Utilisateur non trouvé' },
                { status: 404 }
            );
        }

        return Response.json({ success: true, data: result.rows[0] });
    } catch (error) {
        console.error('Error in updateUser:', error);
        return Response.json(
            { success: false, message: 'Erreur lors de la mise à jour de l\'utilisateur' },
            { status: 500 }
        );
    }
};

export const deleteUser = async (id) => {
    try {
        const result = await pool.query('DELETE FROM users WHERE id = $1 RETURNING id', [id]);

        if (result.rows.length === 0) {
            return Response.json(
                { success: false, message: 'Utilisateur non trouvé' },
                { status: 404 }
            );
        }

        return Response.json({ success: true, message: 'Utilisateur supprimé avec succès' });
    } catch (error) {
        console.error('Error in deleteUser:', error);
        return Response.json(
            { success: false, message: 'Erreur lors de la suppression de l\'utilisateur' },
            { status: 500 }
        );
    }
};
