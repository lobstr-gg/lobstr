import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/forum-auth";
import { isWalletBanned } from "@/lib/upload-security";
import { getOrCreateUser, updateUser, isUsernameTaken } from "@/lib/firestore-store";

const RESERVED_USERNAMES = new Set([
  "admin", "mod", "moderator", "lobstr", "system", "support", "help",
  "official", "staff", "root", "null", "undefined",
]);

const USERNAME_REGEX = /^[a-z0-9_]+$/;

// PATCH /api/forum/users/me — update own profile
export async function PATCH(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  if (await isWalletBanned(auth.address)) {
    return NextResponse.json(
      { error: "Your wallet has been banned from this platform" },
      { status: 403 }
    );
  }

  const body = await request.json();
  const { displayName, flair, isAgent, profileImageUrl, username, bio, socialLinks } = body;

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

  // Validate username
  if (username !== undefined) {
    if (username === null) {
      // Allow clearing username
    } else {
      if (typeof username !== "string") {
        return NextResponse.json({ error: "Username must be a string" }, { status: 400 });
      }
      const normalized = username.toLowerCase();
      if (normalized.length < 3 || normalized.length > 20) {
        return NextResponse.json(
          { error: "Username must be between 3 and 20 characters" },
          { status: 400 }
        );
      }
      if (!USERNAME_REGEX.test(normalized)) {
        return NextResponse.json(
          { error: "Username can only contain lowercase letters, numbers, and underscores" },
          { status: 400 }
        );
      }
      if (RESERVED_USERNAMES.has(normalized)) {
        return NextResponse.json(
          { error: "This username is reserved" },
          { status: 400 }
        );
      }
      if (await isUsernameTaken(normalized, auth.address)) {
        return NextResponse.json(
          { error: "This username is already taken" },
          { status: 409 }
        );
      }
    }
  }

  // Validate bio
  if (bio !== undefined && bio !== null) {
    if (typeof bio !== "string" || bio.length > 280) {
      return NextResponse.json(
        { error: "Bio must be 280 characters or less" },
        { status: 400 }
      );
    }
  }

  // Validate socialLinks
  if (socialLinks !== undefined && socialLinks !== null) {
    if (typeof socialLinks !== "object") {
      return NextResponse.json({ error: "Invalid social links" }, { status: 400 });
    }
    const { twitter, github, website } = socialLinks;
    if (twitter !== undefined && twitter !== null) {
      if (typeof twitter !== "string" || twitter.length > 50 || /[<>"']/.test(twitter)) {
        return NextResponse.json({ error: "Invalid Twitter handle" }, { status: 400 });
      }
    }
    if (github !== undefined && github !== null) {
      if (typeof github !== "string" || github.length > 50 || /[<>"']/.test(github)) {
        return NextResponse.json({ error: "Invalid GitHub handle" }, { status: 400 });
      }
    }
    if (website !== undefined && website !== null) {
      if (typeof website !== "string" || website.length > 200 || !website.startsWith("https://")) {
        return NextResponse.json(
          { error: "Website must be a valid HTTPS URL (max 200 chars)" },
          { status: 400 }
        );
      }
    }
  }

  const user = await getOrCreateUser(auth.address);

  const updates: Record<string, unknown> = {};
  if (displayName !== undefined) updates.displayName = displayName;
  if (flair !== undefined) updates.flair = flair;
  if (isAgent !== undefined) updates.isAgent = isAgent;
  if (profileImageUrl !== undefined) updates.profileImageUrl = profileImageUrl;
  if (username !== undefined) updates.username = username === null ? null : username.toLowerCase();
  if (bio !== undefined) updates.bio = bio;
  if (socialLinks !== undefined) updates.socialLinks = socialLinks;

  if (Object.keys(updates).length > 0) {
    await updateUser(auth.address, updates);
    Object.assign(user, updates);
  }

  return NextResponse.json({ user });
}
