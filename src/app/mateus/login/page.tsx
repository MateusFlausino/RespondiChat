import Login from "@/components/login";
import { authenticated } from "@/lib/auth";
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function MateusLoginPage() {
  if (await authenticated()) redirect("/");
  return <Login person={{ name: "Mateus", username: "mateus" }} configured={
    !!process.env.MATEUS_PASSWORD_HASH && !!process.env.SESSION_SECRET &&
    !!process.env.DATABASE_URL && !!process.env.APP_URL &&
    (process.env.ADMIN_USERNAME || "admin") !== "mateus"
  } />;
}
