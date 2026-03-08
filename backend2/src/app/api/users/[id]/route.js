import { verifyAuth, unauthorizedResponse, forbiddenResponse, hasRole } from '@/lib/auth';
import { getUserById, updateUser, deleteUser } from '@/controllers/userController';

export async function GET(request, { params }) {
    const user = verifyAuth(request);
    if (!user) return unauthorizedResponse();
    if (!hasRole(user, 'admin')) return forbiddenResponse('Accès réservé aux administrateurs');
    const { id } = await params;
    return getUserById(id);
}

export async function PUT(request, { params }) {
    const user = verifyAuth(request);
    if (!user) return unauthorizedResponse();
    if (!hasRole(user, 'admin')) return forbiddenResponse('Accès réservé aux administrateurs');
    const { id } = await params;
    return updateUser(id, request);
}

export async function DELETE(request, { params }) {
    const user = verifyAuth(request);
    if (!user) return unauthorizedResponse();
    if (!hasRole(user, 'admin')) return forbiddenResponse('Accès réservé aux administrateurs');
    const { id } = await params;
    return deleteUser(id);
}
