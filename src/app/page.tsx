import { redirect } from "next/navigation";
import Dashboard from "@/components/dashboard";
import { authenticated, demoEnabled } from "@/lib/auth";
import { demoData } from "@/lib/demo";
export const dynamic = "force-dynamic";
export default async function Home() {
  if (demoEnabled()) return <Dashboard initial={demoData()} demo />;
  if (!(await authenticated())) redirect("/login");
  return <Dashboard demo={false} />;
}
