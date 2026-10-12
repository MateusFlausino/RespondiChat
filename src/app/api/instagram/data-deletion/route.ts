import { appUrl } from "@/lib/auth";
import { deleteConnection, platformSignedRequest } from "@/lib/deletion";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const value = form.get("signed_request");
    const parsed =
      typeof value === "string" ? platformSignedRequest(value) : null;
    if (!parsed) return new Response("Forbidden", { status: 403 });
    const code = await deleteConnection(parsed.user_id);
    return Response.json({
      url: `${appUrl()}/deletion-status?code=${code}`,
      confirmation_code: code,
    });
  } catch {
    return new Response("Try again", { status: 503 });
  }
}
