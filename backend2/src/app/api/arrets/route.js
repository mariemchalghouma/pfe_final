import { getStops } from "@/controllers/arretController";
import { verifyAuth, unauthorizedResponse } from "@/lib/auth";

export async function GET(request) {
  const user = verifyAuth(request);
  if (!user) return unauthorizedResponse();

  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");
  const dateStart = searchParams.get("dateStart");
  const dateEnd = searchParams.get("dateEnd");
  const limit = searchParams.get("limit")
    ? parseInt(searchParams.get("limit"), 10)
    : undefined;
  const offset = searchParams.get("offset")
    ? parseInt(searchParams.get("offset"), 10)
    : undefined;

  return getStops({ date, dateStart, dateEnd, limit, offset });
}
