import { getCamionsTempsReel } from '@/controllers/camionsController';
import { verifyAuth, unauthorizedResponse } from '@/lib/auth';

export async function GET(request) {
  const user = verifyAuth(request);
  if (!user) return unauthorizedResponse();

  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date');
  return getCamionsTempsReel(date);
}
