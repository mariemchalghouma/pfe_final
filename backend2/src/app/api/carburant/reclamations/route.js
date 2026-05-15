import { submitReclamation } from "@/controllers/carburantController";

export async function POST(request) {
  try {
    const body = await request.json();
    const { matricule, dateTransaction, numTicket, commentaire, soumisPar, chauffeur } = body;

    if (!matricule || !dateTransaction || !commentaire) {
      return Response.json(
        {
          success: false,
          message:
            "Paramètres manquants (matricule, dateTransaction, commentaire)",
        },
        { status: 400 },
      );
    }

    const result = await submitReclamation({
      matricule,
      dateTransaction,
      numTicket,
      commentaire,
      soumisPar,
      chauffeur,
    });

    return Response.json(result, {
      status: result.success ? 200 : 500,
    });
  } catch (error) {
    console.error("Error POST /api/carburant/reclamations:", error);
    return Response.json(
      { success: false, message: "Erreur serveur" },
      { status: 500 },
    );
  }
}
