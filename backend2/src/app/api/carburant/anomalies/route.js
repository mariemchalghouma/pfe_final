import { updateAnomalieStatut } from "@/controllers/carburantController";

export async function POST(request) {
  try {
    const body = await request.json();
    const { matricule, dateTransaction, numTicket, statut, commentaire } = body;

    if (!matricule || !dateTransaction || !statut) {
      return Response.json(
        { success: false, message: "Paramètres manquants (matricule, dateTransaction, statut)" },
        { status: 400 },
      );
    }

    if (!["EN_ATTENTE", "CONFIRMEE", "REJETEE"].includes(statut)) {
      return Response.json(
        { success: false, message: "Statut invalide. Valeurs acceptées: EN_ATTENTE, CONFIRMEE, REJETEE" },
        { status: 400 },
      );
    }

    const result = await updateAnomalieStatut({
      matricule,
      dateTransaction,
      numTicket,
      statut,
      commentaire,
    });

    return Response.json(result, {
      status: result.success ? 200 : 500,
    });
  } catch (error) {
    console.error("Error POST /api/carburant/anomalies:", error);
    return Response.json(
      { success: false, message: "Erreur serveur" },
      { status: 500 },
    );
  }
}
