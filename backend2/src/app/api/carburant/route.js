import { getEcartCarburant } from "@/controllers/carburantController";

export async function GET(request) {
  const { searchParams } = new URL(request.url);

  const camion = searchParams.get("camion");
  const dateStart = searchParams.get("dateStart");
  const dateEnd = searchParams.get("dateEnd");
  const chauffeur = searchParams.get("chauffeur");
  const categorie = searchParams.get("categorie");
  const site = searchParams.get("site");

  const result = await getEcartCarburant({
    camion,
    dateStart,
    dateEnd,
    chauffeur,
    categorie,
    site,
  });

  if (result instanceof Response) {
    return result;
  }

  return Response.json(result, {
    status: result?.success === false ? 500 : 200,
  });
}
