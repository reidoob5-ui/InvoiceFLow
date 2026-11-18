import { redirect } from "next/navigation";
import RegisterForm from "./register-form";

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const params = await searchParams;
  const allowed = ["free", "pro", "business"];
  if (!params.plan || !allowed.includes(params.plan)) redirect("/plans");
  return <RegisterForm selectedPlanKey={params.plan}/>;
}
