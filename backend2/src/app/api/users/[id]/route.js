import { verifyAuth, unauthorizedResponse } from '@/lib/auth';
import { getUserById, updateUser, deleteUser } from '@/controllers/userController';

export async function GET(request, { params }) {
    const user = verifyAuth(request);
    if (!user) return unauthorizedResponse();
    const { id } = await params;
    return getUserById(id);
}

export async function PUT(request, { params }) {
    const user = verifyAuth(request);
    if (!user) return unauthorizedResponse();
    const { id } = await params;
    return updateUser(id, request);
}

export async function DELETE(request, { params }) {
    const user = verifyAuth(request);
    if (!user) return unauthorizedResponse();
    const { id } = await params;
    return deleteUser(id);
}
