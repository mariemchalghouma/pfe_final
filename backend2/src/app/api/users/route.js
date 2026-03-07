import { verifyAuth, unauthorizedResponse } from '@/lib/auth';
import { getUsers, createUser } from '@/controllers/userController';

export async function GET(request) {
    const user = verifyAuth(request);
    if (!user) return unauthorizedResponse();
    return getUsers();
}

export async function POST(request) {
    const user = verifyAuth(request);
    if (!user) return unauthorizedResponse();
    return createUser(request);
}
