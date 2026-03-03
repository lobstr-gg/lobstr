import { NextRequest, NextResponse } from "next/server";
import { getStorage } from "firebase-admin/storage";
import { requireAuth } from "@/lib/forum-auth";
import { getDb } from "@/lib/firebase-admin";
import {
  validateFile,
  validateFileCount,
  sanitizeFilename,
  MAX_FILE_SIZE,
} from "@/lib/file-validation";
import {
  recordUploadViolation,
  isWalletBanned,
  extractClientIp,
  isExecutableFilename,
} from "@/lib/upload-security";
import { randomUUID } from "crypto";
import { rateLimit, getIPKey, checkBodySize } from "@/lib/rate-limit";

const MAX_EVIDENCE_IMAGES = 5;

/**
 * Upload damage evidence photos for a product dispute.
 * Files are stored privately — only accessible via signed URLs (24h expiry).
 * Scoped to the authenticated wallet + jobId. Does NOT require a dispute to
 * exist yet (the dispute is created on-chain after evidence is uploaded).
 *
 * Arbitrators access evidence via the existing /api/upload/evidence route
 * once the dispute is created and they're assigned to the panel.
 */
export async function POST(request: NextRequest) {
  const limited = rateLimit(`dmg-evidence:${getIPKey(request)}`, 60_000, 10);
  if (limited) return limited;

  const tooLarge = await checkBodySize(request, MAX_EVIDENCE_IMAGES * MAX_FILE_SIZE);
  if (tooLarge) return tooLarge;

  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const ip = extractClientIp(request);

  if (await isWalletBanned(auth.address)) {
    return NextResponse.json(
      { error: "Your wallet has been banned from uploading files" },
      { status: 403 }
    );
  }

  const formData = await request.formData();
  const jobId = formData.get("jobId") as string | null;

  if (!jobId || !/^\d{1,20}$/.test(jobId)) {
    return NextResponse.json(
      { error: "Invalid or missing jobId" },
      { status: 400 }
    );
  }

  const files: File[] = [];
  for (const [key, value] of formData.entries()) {
    if (key === "files" && value instanceof File) {
      files.push(value);
    }
  }

  if (files.length === 0) {
    return NextResponse.json({ error: "No files provided" }, { status: 400 });
  }

  const countCheck = validateFileCount(files.length);
  if (!countCheck.valid) {
    return NextResponse.json({ error: countCheck.error }, { status: 400 });
  }

  // Validate all files
  for (const file of files) {
    if (isExecutableFilename(file.name)) {
      await recordUploadViolation(ip, auth.address, {
        type: "executable_upload",
        filename: file.name,
        detail: `Attempted to upload executable file: ${file.name}`,
      });
      return NextResponse.json({ error: "File type not allowed" }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File "${file.name}" exceeds 25MB limit` },
        { status: 400 }
      );
    }

    const buffer = new Uint8Array(await file.arrayBuffer());
    const result = validateFile(buffer, file.name, file.size);

    if (!result.valid) {
      const isMagicByteMismatch = result.error?.includes("magic byte");
      await recordUploadViolation(ip, auth.address, {
        type: isMagicByteMismatch ? "magic_byte_mismatch" : "validation_failure",
        filename: file.name,
        detail: result.error || "Unknown validation failure",
      });
      return NextResponse.json(
        { error: `File "${file.name}": ${result.error}` },
        { status: 400 }
      );
    }
  }

  // Upload — private storage, signed URLs only
  const bucket = getStorage().bucket();
  const db = getDb();
  const uploadedFiles: { name: string; path: string; size: number; type: string; url: string }[] = [];

  for (const file of files) {
    const buffer = new Uint8Array(await file.arrayBuffer());
    const result = validateFile(buffer, file.name, file.size);

    const safeName = sanitizeFilename(file.name);
    const uuid = randomUUID();
    const storagePath = `damage-evidence/${auth.address}/${jobId}/${uuid}-${safeName}`;

    const fileRef = bucket.file(storagePath);
    await fileRef.save(Buffer.from(buffer), {
      metadata: {
        contentType: result.detectedType,
        metadata: {
          uploadedBy: auth.address,
          jobId,
          originalName: file.name,
          uploadIp: ip,
        },
      },
    });

    // Private — signed URL with 7-day expiry (covers dispute + return window)
    const [signedUrl] = await fileRef.getSignedUrl({
      action: "read",
      expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
    });

    uploadedFiles.push({
      name: file.name,
      path: storagePath,
      size: file.size,
      type: result.detectedType!,
      url: signedUrl,
    });
  }

  // Log to Firestore
  const evidenceRef = db.collection("damage-evidence").doc(jobId).collection("files");
  for (const f of uploadedFiles) {
    await evidenceRef.add({
      name: f.name,
      path: f.path,
      size: f.size,
      type: f.type,
      uploadedBy: auth.address,
      uploadedAt: Date.now(),
      ip,
    });
  }

  return NextResponse.json({ files: uploadedFiles }, { status: 201 });
}
