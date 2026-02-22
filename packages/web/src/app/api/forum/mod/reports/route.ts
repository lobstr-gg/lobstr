import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isModerator } from "@/lib/forum-auth";
import { rateLimit, getIPKey } from "@/lib/rate-limit";
import { getReports, updateReportStatus, createModLogEntry, nextId } from "@/lib/firestore-store";
import type { ModLogEntry } from "@/lib/forum-types";

// GET /api/forum/mod/reports — fetch pending reports (mod-only)
export async function GET(request: NextRequest) {
  const limited = rateLimit(`mod-reports:${getIPKey(request)}`, 60_000, 30);
  if (limited) return limited;

  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  if (!(await isModerator(auth.address))) {
    return NextResponse.json(
      { error: "Moderator access required" },
      { status: 403 }
    );
  }

  const reports = await getReports("pending");
  return NextResponse.json({ reports });
}

// PATCH /api/forum/mod/reports — update report status (mod-only)
export async function PATCH(request: NextRequest) {
  const limited = rateLimit(`mod-report-update:${getIPKey(request)}`, 60_000, 30);
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
  const { id, status } = body;

  if (!id || !status) {
    return NextResponse.json(
      { error: "Missing required fields: id, status" },
      { status: 400 }
    );
  }

  const validStatuses = ["reviewed", "actioned", "dismissed"];
  if (!validStatuses.includes(status)) {
    return NextResponse.json(
      { error: "Invalid status" },
      { status: 400 }
    );
  }

  await updateReportStatus(id, status);

  // Audit log
  const entry: ModLogEntry = {
    id: await nextId("modLog"),
    action: "report_update",
    moderator: auth.address,
    target: id,
    reason: `Report status set to ${status}`,
    createdAt: Date.now(),
  };
  await createModLogEntry(entry);

  return NextResponse.json({ ok: true });
}
