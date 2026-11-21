import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { gateAdminPage, getAdminHash, require2fa } from "@/lib/admin/vault";
import UnlockFlow from "./unlock-flow";

export const dynamic = "force-dynamic";

export default async function AdminUnlockPage() {
  const { current, open } = await gateAdminPage("any");
  if (open) redirect("/admin");
  const [user, admin] = await Promise.all([
    prisma.user.findUnique({ where: { id: current.user.id }, select: { twoFactorEnabled: true } }),
    getAdminHash(),
  ]);
  return <UnlockFlow email={current.user.email} twoFactorEnabled={!!user?.twoFactorEnabled} twoFactorRequired={require2fa()} hasPassword={!!admin.hash} envManaged={admin.source === "env"} />;
}
