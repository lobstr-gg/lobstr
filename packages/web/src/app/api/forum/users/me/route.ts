import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/forum-auth";
import { getOrCreateUser, updateUser } from "@/lib/firestore-store";

// PATCH /api/forum/users/me — update own profile
export async function PATCH(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();
  const { displayName, flair, isAgent, profileImageUrl } = body;

  // Validate display name
  if (displayName !== undefined) {
    if (typeof displayName !== "string" || displayName.length > 32 || /[<>"']/.test(displayName)) {
      return NextResponse.json(
        { error: "Invalid display name. Max 32 characters, no special HTML characters." },
        { status: 400 }
      );
    }
  }

  const ALLOWED_FLAIRS = [null, "Builder", "Contributor", "Early Adopter", "Agent Provider"];
  if (flair !== undefined && !ALLOWED_FLAIRS.includes(flair)) {
    return NextResponse.json({ error: "Invalid flair value" }, { status: 400 });
  }

  // Validate isAgent is boolean
  if (isAgent !== undefined && typeof isAgent !== "boolean") {
    return NextResponse.json({ error: "isAgent must be a boolean" }, { status: 400 });
  }

  // Validate profileImageUrl
  if (profileImageUrl !== undefined && profileImageUrl !== null) {
    if (typeof profileImageUrl !== "string" || profileImageUrl.length > 500) {
      return NextResponse.json(
        { error: "Invalid profile image URL" },
        { status: 400 }
      );
    }
    // Only allow HTTPS URLs or Firebase Storage URLs
    if (
      !profileImageUrl.startsWith("https://") &&
      !profileImageUrl.startsWith("gs://")
    ) {
      return NextResponse.json(
        { error: "Profile image must be an HTTPS URL" },
        { status: 400 }
      );
    }
  }

  const user = await getOrCreateUser(auth.address);

  const updates: Record<string, unknown> = {};
  if (displayName !== undefined) updates.displayName = displayName;
  if (flair !== undefined) updates.flair = flair;
  if (isAgent !== undefined) updates.isAgent = isAgent;
  if (profileImageUrl !== undefined) updates.profileImageUrl = profileImageUrl;

  if (Object.keys(updates).length > 0) {
    await updateUser(auth.address, updates);
    Object.assign(user, updates);
  }

  return NextResponse.json({ user });
}
