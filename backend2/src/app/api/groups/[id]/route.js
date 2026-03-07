import { verifyAuth, unauthorizedResponse } from '@/lib/auth';
import { updateGroup, deleteGroup } from '@/controllers/groupController';

export async function PUT(request, context) {
    const user = verifyAuth(request);
    if (!user) return unauthorizedResponse();

    const { id } = await context.params;
    return updateGroup(id, request);
}

export async function DELETE(request, context) {
    const user = verifyAuth(request);
    if (!user) return unauthorizedResponse();

    const { id } = await context.params;
    return deleteGroup(id);
}
