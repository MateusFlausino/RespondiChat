import { cookies } from "next/headers";
import { apiError, requireAdmin } from "@/lib/auth";
export async function POST(request: Request) {
  try {
    await requireAdmin(request);
    (await cookies()).delete("respondi_session");
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
