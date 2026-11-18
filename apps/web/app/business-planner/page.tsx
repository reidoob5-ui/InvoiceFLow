import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/session";
import { can } from "@/lib/permissions";
import BusinessPlannerClient from "./planner-client";

export default async function BusinessPlannerPage() {
  const current = await getCurrentSession();
  if (!current) redirect("/login");
  if (!current.membership) redirect("/onboarding");
  if (!can(current.membership.role, "reports:read")) redirect("/dashboard");
  return <BusinessPlannerClient />;
}
