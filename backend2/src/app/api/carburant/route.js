import { getEcartCarburant } from '@/controllers/carburantController';

export async function GET(request) {
  const { searchParams } = new URL(request.url);

  const camion    = searchParams.get('camion');
  const dateStart = searchParams.get('dateStart');
  const dateEnd   = searchParams.get('dateEnd');

  return await getEcartCarburant({ camion, dateStart, dateEnd });
}
