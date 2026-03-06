import { getEcartCarburantByCamion } from '@/controllers/carburantController';

export async function GET(request, { params }) {
  const { camion } = await params;
  const { searchParams } = new URL(request.url);

  const period = searchParams.get('period') || 'day';
  const date = searchParams.get('date');
  const dateStart = searchParams.get('dateStart');
  const dateEnd = searchParams.get('dateEnd');

  return await getEcartCarburantByCamion(camion, {
    period,
    date,
    dateStart,
    dateEnd,
  });
}
