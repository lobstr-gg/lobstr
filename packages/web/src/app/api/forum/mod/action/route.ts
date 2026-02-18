import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isModerator } from "@/lib/forum-auth";
import {
  getPostById,
  updatePost,
  deletePost,
  nextId,
  createModLogEntry,
} from "@/lib/firestore-store";
import type { ModLogEntry } from "@/lib/forum-types";

// POST /api/forum/mod/action — take a moderation action (mod-only)
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  if (!(await isModerator(auth.address))) {
    return NextResponse.json(
      { error: "Moderator access required" },
      { status: 403 }
    );
  }

  const body = await request.json();
  const { targetId, action, reason } = body;

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

  return NextResponse.json({ entry }, { status: 201 });
}
