import { getOuvertures } from '@/controllers/ouverturesController';
import { verifyAuth, unauthorizedResponse } from '@/lib/auth';

export async function GET(request) {
  const user = verifyAuth(request);
  if (!user) return unauthorizedResponse();

  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date');
  const dateStart = searchParams.get('dateStart');
  const dateEnd = searchParams.get('dateEnd');
  const camion = searchParams.get('camion');
  return getOuvertures({ date, dateStart, dateEnd, camion });
}

