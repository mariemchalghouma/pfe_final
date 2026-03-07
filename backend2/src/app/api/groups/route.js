import { verifyAuth, unauthorizedResponse } from '@/lib/auth';
import { getGroups, createGroup } from '@/controllers/groupController';

export async function GET(request) {
    const user = verifyAuth(request);
    if (!user) return unauthorizedResponse();
    return getGroups();
}

export async function POST(request) {
    const user = verifyAuth(request);
    if (!user) return unauthorizedResponse();
    return createGroup(request);
}
