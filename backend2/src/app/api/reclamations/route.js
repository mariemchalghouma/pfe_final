import { getReclamations } from "@/controllers/carburantController";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const matricule = searchParams.get("matricule") || undefined;
    const dateStart = searchParams.get("dateStart") || undefined;
    const dateEnd = searchParams.get("dateEnd") || undefined;

    const result = await getReclamations({ matricule, dateStart, dateEnd });

    return Response.json(result, {
      status: result.success ? 200 : 500,
    });
  } catch (error) {
    console.error("Error GET /api/reclamations:", error);
    return Response.json(
      { success: false, message: "Erreur serveur" },
      { status: 500 },
    );
  }
}
