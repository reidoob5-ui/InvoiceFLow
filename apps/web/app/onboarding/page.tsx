import OnboardingForm from "./onboarding-form";

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const params = await searchParams;
  const allowed = ["free", "pro", "business"];
  const planKey = params.plan && allowed.includes(params.plan) ? params.plan : "free";
  return <OnboardingForm planKey={planKey}/>;
}
