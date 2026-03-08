export const ROLE_TO_PATHS = {
  admin: ['/dashboard', '/temps-reel', '/camions', '/suivi-arret', '/ouverture-porte', '/carburant', '/gestion-poi', '/administration', '/parametres'],
  poi: ['/gestion-poi', '/camions', '/temps-reel'],
  arrets: ['/suivi-arret', '/camions', '/temps-reel'],
  portes: ['/ouverture-porte', '/camions', '/temps-reel'],
  carburant: ['/carburant', '/camions', '/temps-reel'],
};

export const DEFAULT_ROLE_PATH_PRIORITY = [
  '/temps-reel',
  '/gestion-poi',
  '/suivi-arret',
  '/ouverture-porte',
  '/carburant',
  '/camions',
  '/dashboard',
  '/administration',
  '/parametres',
];

export const normalizeRoles = (roles) => {
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

export const isActiveUser = (user) => {
  const status = String(user?.status || '').trim().toLowerCase();
  return status === 'actif';
};

export const hasRole = (user, role) => normalizeRoles(user?.roles).includes(role);

export const isAdminUser = (user) => hasRole(user, 'admin');

const allAllowedPathsForUser = (user) => {
  if (isAdminUser(user)) return ROLE_TO_PATHS.admin;

  const roles = normalizeRoles(user?.roles);
  const pathSet = new Set();

  for (const role of roles) {
    const paths = ROLE_TO_PATHS[role] || [];
    for (const path of paths) {
      pathSet.add(path);
    }
  }

  return Array.from(pathSet);
};

export const canAccessPath = (user, pathname = '') => {
  if (!pathname || pathname === '/') return true;

  const allowedPaths = allAllowedPathsForUser(user);

  return allowedPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`));
};

export const getDefaultAuthorizedPath = (user) => {
  if (isAdminUser(user)) return '/dashboard';

  const allowedPaths = new Set(allAllowedPathsForUser(user));
  for (const path of DEFAULT_ROLE_PATH_PRIORITY) {
    if (allowedPaths.has(path)) return path;
  }

  return '/login';
};
