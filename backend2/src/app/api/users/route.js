import { verifyAuth, unauthorizedResponse, forbiddenResponse, hasRole } from '@/lib/auth';
import { getUsers, createUser } from '@/controllers/userController';

export async function GET(request) {
    const user = verifyAuth(request);
    if (!user) return unauthorizedResponse();
    if (!hasRole(user, 'admin')) return forbiddenResponse('Accès réservé aux administrateurs');
    return getUsers();
}

export async function POST(request) {
    const user = verifyAuth(request);
    if (!user) return unauthorizedResponse();
    if (!hasRole(user, 'admin')) return forbiddenResponse('Accès réservé aux administrateurs');
    return createUser(request);
}
