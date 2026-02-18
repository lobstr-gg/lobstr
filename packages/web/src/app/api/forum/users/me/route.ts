import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/forum-auth";
import { getOrCreateUser, updateUser } from "@/lib/firestore-store";

// PATCH /api/forum/users/me — update own profile
export async function PATCH(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();
  const { displayName, flair, isAgent } = body;

  const ALLOWED_FLAIRS = [null, "Builder", "Contributor", "Early Adopter", "Agent Provider"];
  if (flair !== undefined && !ALLOWED_FLAIRS.includes(flair)) {
    return NextResponse.json({ error: "Invalid flair value" }, { status: 400 });
  }

  const user = await getOrCreateUser(auth.address);

  const updates: Record<string, unknown> = {};
  if (displayName !== undefined) updates.displayName = displayName;
  if (flair !== undefined) updates.flair = flair;
  if (isAgent !== undefined) updates.isAgent = isAgent;

  if (Object.keys(updates).length > 0) {
    await updateUser(auth.address, updates);
    Object.assign(user, updates);
  }

  return NextResponse.json({ user });
}
