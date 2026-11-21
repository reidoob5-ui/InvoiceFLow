import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentSession } from "@/lib/auth/session";
import { getAdminHash, require2fa } from "@/lib/admin/vault";
import { unlockState } from "@/lib/admin/vault-pure";
import UnlockFlow from "./unlock-flow";

export const dynamic = "force-dynamic";

export default async function AdminUnlockPage() {
  const current = await getCurrentSession();
  const admin = await getAdminHash();
  if (!current) return <UnlockFlow loggedIn={false} email="" twoFactorEnabled={false} twoFactorRequired={false} hasPassword={!!admin.hash} envManaged={admin.source === "env"} />;
  if (!current.user.isPlatformAdmin) notFound();
  if (unlockState(current.session) === "unlocked") redirect("/admin");
  const user = await prisma.user.findUnique({ where: { id: current.user.id }, select: { twoFactorEnabled: true } });
  return <UnlockFlow loggedIn email={current.user.email} twoFactorEnabled={!!user?.twoFactorEnabled} twoFactorRequired={require2fa()} hasPassword={!!admin.hash} envManaged={admin.source === "env"} />;
}
