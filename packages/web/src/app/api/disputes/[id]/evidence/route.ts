import { NextRequest, NextResponse } from "next/server";
import { getStorage } from "firebase-admin/storage";
import { requireAuth } from "@/lib/forum-auth";
import { getDb } from "@/lib/firebase-admin";
import { verifyDisputeAccess } from "@/lib/dispute-access";

/**
 * GET /api/disputes/[id]/evidence
 *
 * Returns evidence files for a dispute. Access restricted to:
 * - Assigned arbitrators (verified on-chain via DisputeArbitration.getDispute())
 * - Dispute parties (buyer/seller from the on-chain dispute record)
 *
 * Files are returned with time-limited signed URLs (24h) generated via
 * Firebase Admin SDK. No client SDK can access Storage directly.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // 1. Require authentication
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const { id: disputeId } = await params;

  if (!disputeId || !/^[a-zA-Z0-9_-]{1,64}$/.test(disputeId)) {
    return NextResponse.json(
      { error: "Invalid dispute ID" },
      { status: 400 }
    );
  }

  // 2. Verify on-chain that the user is an arbitrator or dispute party
  const accessCheck = await verifyDisputeAccess(auth.address, disputeId);
  if (accessCheck) {
    return NextResponse.json(
      { error: accessCheck.error },
      { status: accessCheck.status }
    );
  }

  // 3. Fetch evidence file metadata from Firestore
  const db = getDb();
  const filesSnap = await db
    .collection("evidence")
    .doc(disputeId)
    .collection("files")
    .orderBy("uploadedAt", "desc")
    .get();

  if (filesSnap.empty) {
    return NextResponse.json({ files: [] });
  }

  // 4. Generate time-limited signed URLs via Admin SDK
  const bucket = getStorage().bucket();
  const files = [];

  for (const doc of filesSnap.docs) {
    const data = doc.data();
    const fileRef = bucket.file(data.path);

    const [signedUrl] = await fileRef.getSignedUrl({
      action: "read",
      expires: Date.now() + 24 * 60 * 60 * 1000, // 24h
    });

    files.push({
      id: doc.id,
      name: data.name,
      size: data.size,
      type: data.type,
      uploadedBy: data.uploadedBy,
      uploadedAt: data.uploadedAt,
      url: signedUrl,
    });
  }

  return NextResponse.json({ files });
}
