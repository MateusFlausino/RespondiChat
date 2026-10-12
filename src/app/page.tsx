import { redirect } from "next/navigation";
import Dashboard from "@/components/dashboard";
import { sessionUsername, demoEnabled } from "@/lib/auth";
import { instagramForUser } from "@/lib/panel-users";
import { demoData } from "@/lib/demo";
export const dynamic = "force-dynamic";
export default async function Home() {
  if (demoEnabled()) return <Dashboard initial={demoData()} demo />;
  const username = await sessionUsername();
  if (!username) redirect("/login");
  return <Dashboard demo={false} profileUsername={instagramForUser(username)} displayName={username === "mateus" ? "Mateus" : "Michelle"} />;
}
