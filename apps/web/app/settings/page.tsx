import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/session";
import { can } from "@/lib/permissions";
import CompanySettingsForm from "./settings-form";

export default async function SettingsPage() {
  const current = await getCurrentSession();
  if (!current) redirect("/login");
  if (!current.membership) redirect("/onboarding");
  if (!can(current.membership.role, "settings:read")) redirect("/dashboard");
  return <CompanySettingsForm />;
}
