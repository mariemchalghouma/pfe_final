import { verifyAuth, unauthorizedResponse } from "@/lib/auth";
import { updateStopEtat } from "@/controllers/arretController";

export async function POST(request) {
  const user = verifyAuth(request);
  if (!user) return unauthorizedResponse();

  return updateStopEtat(request);
}
