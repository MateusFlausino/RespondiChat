import Login from "@/components/login";
import { authenticated } from "@/lib/auth";
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function LoginPage() {
  if (await authenticated()) redirect("/");
  return (
    <Login
      configured={
        !!process.env.ADMIN_PASSWORD_HASH &&
        !!process.env.SESSION_SECRET &&
        !!process.env.DATABASE_URL &&
        !!process.env.APP_URL
      }
    />
  );
}
