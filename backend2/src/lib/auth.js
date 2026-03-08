import jwt from 'jsonwebtoken';

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

export const verifyAuth = (request) => {
  const authHeader = request.headers.get('authorization') || '';

  if (!authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.slice(7);

  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return null;
  }
};

export const unauthorizedResponse = (message = 'Non autorisé - Token invalide') =>
  Response.json({ success: false, message }, { status: 401 });

export const forbiddenResponse = (message = 'Accès interdit') =>
  Response.json({ success: false, message }, { status: 403 });

export const hasRole = (user, role) => normalizeRoles(user?.roles).includes(role);
