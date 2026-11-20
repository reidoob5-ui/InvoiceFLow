import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/session";
import { can } from "@/lib/permissions";
import FiscalPanel from "./fiscal-panel";

export const dynamic = "force-dynamic";

export default async function FiscalPage() {
  const current = await getCurrentSession();
  if (!current) redirect("/login");
  if (!current.membership) redirect("/onboarding");
  if (!can(current.membership.role, "fiscal:read")) redirect("/dashboard");
  return <FiscalPanel canWrite={can(current.membership.role, "fiscal:write")} />;
}
