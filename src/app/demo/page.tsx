import Dashboard from "@/components/dashboard";
import { demoData } from "@/lib/demo";
export const dynamic = "force-dynamic";
export default function Demo() {
  const data = demoData();
  data.config.appUrl = process.env.APP_URL || "http://localhost:3000";
  return <Dashboard initial={data} demo />;
}
