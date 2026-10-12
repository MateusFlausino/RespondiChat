import { deleteConnection, platformSignedRequest } from "@/lib/deletion";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const value = form.get("signed_request");
    const parsed =
      typeof value === "string" ? platformSignedRequest(value) : null;
    if (!parsed) return new Response("Forbidden", { status: 403 });
    await deleteConnection(parsed.user_id);
    return Response.json({ success: true });
  } catch {
    return new Response("Try again", { status: 503 });
  }
}
