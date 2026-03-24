import { getStops } from "@/controllers/arretController";
import { verifyAuth, unauthorizedResponse } from "@/lib/auth";

export async function GET(request) {
  const user = verifyAuth(request);
  if (!user) return unauthorizedResponse();

  const { searchParams } = new URL(request.url);
<<<<<<< HEAD
  const date = searchParams.get("date");
  const dateStart = searchParams.get("dateStart");
  const dateEnd = searchParams.get("dateEnd");
  const rayon = searchParams.get("rayon")
    ? Number(searchParams.get("rayon"))
    : 10;

  return getStops({ date, dateStart, dateEnd, rayon });
=======
  const date = searchParams.get('date');
  const dateStart = searchParams.get('dateStart');
  const dateEnd = searchParams.get('dateEnd');
  const site = searchParams.get('site');

  return getStops({ date, dateStart, dateEnd, site });
>>>>>>> 0b95825 (UI camions: side panel + gantt updates)
}
