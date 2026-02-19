import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isModerator } from "@/lib/forum-auth";
import { rateLimit, getIPKey } from "@/lib/rate-limit";
import {
  getPostById,
  updatePost,
  deletePost,
  nextId,
  createModLogEntry,
  getUserWarningCount,
  incrementUserWarning,
} from "@/lib/firestore-store";
import type { ModLogEntry } from "@/lib/forum-types";

// Minimum warnings required before escalation to ban
const MIN_WARNINGS_BEFORE_BAN = 2;

// POST /api/forum/mod/action — take a moderation action (mod-only)
export async function POST(request: NextRequest) {
  const limited = rateLimit(`mod-action:${getIPKey(request)}`, 60_000, 30);
  if (limited) return limited;

  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  if (!(await isModerator(auth.address))) {
    return NextResponse.json(
      { error: "Moderator access required" },
      { status: 403 }
    );
  }

  const body = await request.json();
  const { targetId, action, reason, targetAddress } = body;

  if (!targetId || !action) {
    return NextResponse.json(
      { error: "Missing required fields: targetId, action" },
      { status: 400 }
    );
  }

  const validActions = ["remove", "lock", "pin", "warn", "ban", "ip_ban", "ip_unban"] as const;
  if (!validActions.includes(action)) {
    return NextResponse.json(
      { error: `Invalid action. Must be one of: ${validActions.join(", ")}` },
      { status: 400 }
    );
  }

  // Enforce warning escalation before bans
  if ((action === "ban" || action === "ip_ban") && targetAddress) {
    const warningCount = await getUserWarningCount(targetAddress);
    if (warningCount < MIN_WARNINGS_BEFORE_BAN) {
      return NextResponse.json(
        {
          error: `Cannot ban user with only ${warningCount} warning(s). At least ${MIN_WARNINGS_BEFORE_BAN} warnings are required before a ban. Issue a warning first.`,
          warningCount,
          requiredWarnings: MIN_WARNINGS_BEFORE_BAN,
        },
        { status: 400 }
      );
    }
  }

  const post = await getPostById(targetId);

  // Apply action to post if applicable
  if (post) {
    switch (action) {
      case "remove":
        await deletePost(targetId);
        break;
      case "lock":
        await updatePost(targetId, { isLocked: !post.isLocked });
        break;
      case "pin":
        await updatePost(targetId, { isPinned: !post.isPinned });
        break;
    }
  }

  // Track warnings on the user record
  let newWarningCount: number | undefined;
  if (action === "warn" && targetAddress) {
    newWarningCount = await incrementUserWarning(targetAddress);
  }

  // Log the action
  const entry: ModLogEntry = {
    id: await nextId("modLog"),
    action: action as ModLogEntry["action"],
    moderator: auth.address,
    target: post?.title || targetId,
    reason: reason || "",
    createdAt: Date.now(),
  };

  await createModLogEntry(entry);

  return NextResponse.json(
    {
      entry,
      ...(newWarningCount !== undefined && { warningCount: newWarningCount }),
    },
    { status: 201 }
  );
}
