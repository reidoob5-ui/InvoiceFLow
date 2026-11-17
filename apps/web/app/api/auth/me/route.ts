import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ user: null }, { status: 401 });
  return NextResponse.json({
    user: { id: user.id, name: user.name, email: user.email },
    organizations: user.memberships.map(({ organization, role }) => ({
      id: organization.id, name: organization.name, slug: organization.slug, role,
    })),
  });
}
