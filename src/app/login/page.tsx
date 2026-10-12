import Login from "@/components/login";
import { authenticated } from "@/lib/auth";
import { redirect } from "next/navigation";
import { panelUsers } from "@/lib/panel-users";
export const dynamic = "force-dynamic";
export default async function LoginPage() {
  if (await authenticated()) redirect("/");
  return (
    <Login
      configured={
        panelUsers().length > 0 &&
        !!process.env.SESSION_SECRET &&
        !!process.env.DATABASE_URL &&
        !!process.env.APP_URL
      }
    />
  );
}
