import jwt from 'jsonwebtoken';
import pool from '../config/database.js';

const normalizeRoles = (roles) => {
  if (Array.isArray(roles)) return roles;
  if (typeof roles === 'string') {
    try {
      const parsed = JSON.parse(roles);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

const isUserActive = (status) => String(status || '').trim().toLowerCase() === 'actif';

export const login = async (req) => {
  try {
    const { identifiant, email, password } = await req.json();
    const loginValue = (identifiant || email || '').trim();

    if (!loginValue || !password) {
      return Response.json(
        { success: false, message: 'Identifiant et mot de passe requis' },
        { status: 400 }
      );
    }

    const result = await pool.query('SELECT * FROM users WHERE LOWER(identifiant) = LOWER($1)', [loginValue]);

    if (result.rows.length === 0) {
      return Response.json(
        { success: false, message: 'Identifiant ou mot de passe invalide' },
        { status: 401 }
      );
    }

    const user = result.rows[0];

    if (!isUserActive(user.status)) {
      return Response.json(
        { success: false, message: 'Votre compte est inactif. Contactez un administrateur.' },
        { status: 403 }
      );
    }

    const roles = normalizeRoles(user.roles);
    const isMatch = password == user.password;

    if (!isMatch) {
      return Response.json(
        { success: false, message: 'Identifiant ou mot de passe invalide' },
        { status: 401 }
      );
    }

    const token = jwt.sign({ id: user.id, identifiant: user.identifiant, roles, status: user.status }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRE || '2d',
    });

    return Response.json({
      success: true,
      data: {
        user: { id: user.id, identifiant: user.identifiant, name: user.name, roles, status: user.status },
        token,
      },
    });
  } catch (error) {
    console.error('Error in login:', error);
    return Response.json(
      { success: false, message: 'Erreur lors de la connexion' },
      { status: 500 }
    );
  }
};

export const getMe = async (user) => {
  try {
    const result = await pool.query('SELECT id, identifiant, name, roles, status, created_at FROM users WHERE id = $1', [
      user.id,
    ]);

    if (result.rows.length === 0) {
      return Response.json(
        { success: false, message: 'Utilisateur non trouvé' },
        { status: 404 }
      );
    }

    const dbUser = result.rows[0];

    if (!isUserActive(dbUser.status)) {
      return Response.json(
        { success: false, message: 'Votre compte est inactif. Contactez un administrateur.' },
        { status: 403 }
      );
    }

    return Response.json({
      success: true,
      data: {
        ...dbUser,
        roles: normalizeRoles(dbUser.roles),
      },
    });
  } catch (error) {
    console.error('Error in getMe:', error);
    return Response.json(
      { success: false, message: 'Erreur lors de la récupération du profil' },
      { status: 500 }
    );
  }
};
