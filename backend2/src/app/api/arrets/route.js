import { getStops } from '@/controllers/arretController';
import { verifyAuth, unauthorizedResponse } from '@/lib/auth';

export async function GET(request) {
  const user = verifyAuth(request);
  if (!user) return unauthorizedResponse();

  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date');
  const dateStart = searchParams.get('dateStart');
  const dateEnd = searchParams.get('dateEnd');

  return getStops({ date, dateStart, dateEnd });
}
