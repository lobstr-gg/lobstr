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
import { verifyDisputeAccess } from "@/lib/dispute-access";
import { rateLimit, getIPKey, checkBodySize } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  const limited = rateLimit(`upload:${getIPKey(request)}`, 60_000, 10);
  if (limited) return limited;

  const tooLarge = await checkBodySize(request, 25 * 1024 * 1024);
  if (tooLarge) return tooLarge;

  // 1. Auth check
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const ip = extractClientIp(request);

  // 2. Check if wallet is platform-banned
  if (await isWalletBanned(auth.address)) {
    return NextResponse.json(
      { error: "Your wallet has been banned from uploading files" },
      { status: 403 }
    );
  }

  // 3. Parse form data
  const formData = await request.formData();
  const disputeId = formData.get("disputeId") as string | null;

  if (!disputeId || !/^[a-zA-Z0-9_-]{1,64}$/.test(disputeId)) {
    return NextResponse.json(
      { error: "Invalid or missing disputeId" },
      { status: 400 }
    );
  }

  // On-chain access check: verify user is buyer, seller, or assigned arbitrator
  const accessCheck = await verifyDisputeAccess(auth.address, disputeId);
  if (accessCheck) {
    return NextResponse.json(
      { error: accessCheck.error },
      { status: accessCheck.status }
    );
  }

  const files: File[] = [];
  for (const [key, value] of formData.entries()) {
    if (key === "files" && value instanceof File) {
      files.push(value);
    }
  }

  const countCheck = validateFileCount(files.length);
  if (!countCheck.valid) {
    return NextResponse.json({ error: countCheck.error }, { status: 400 });
  }

  // 4. Pre-validate all files BEFORE uploading any (detect malicious intent early)
  for (const file of files) {
    // Check for executable filenames — immediate ban
    if (isExecutableFilename(file.name)) {
      const { banned } = await recordUploadViolation(ip, auth.address, {
        type: "executable_upload",
        filename: file.name,
        detail: `Attempted to upload executable file: ${file.name}`,
      });
      return NextResponse.json(
        { error: banned ? "Access denied" : "File type not allowed" },
        { status: banned ? 403 : 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      await recordUploadViolation(ip, auth.address, {
        type: "validation_failure",
        filename: file.name,
        detail: `File exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit (${file.size} bytes)`,
      });
      return NextResponse.json(
        { error: `File "${file.name}" exceeds 25MB limit` },
        { status: 400 }
      );
    }

    const buffer = new Uint8Array(await file.arrayBuffer());
    const result = validateFile(buffer, file.name, file.size);

    if (!result.valid) {
      // Determine violation severity
      const isMagicByteMismatch = result.error?.includes("magic byte");
      const violationType = isMagicByteMismatch
        ? ("magic_byte_mismatch" as const)
        : ("validation_failure" as const);

      const { banned } = await recordUploadViolation(ip, auth.address, {
        type: violationType,
        filename: file.name,
        detail: result.error || "Unknown validation failure",
      });

      return NextResponse.json(
        { error: banned ? "Access denied" : `File "${file.name}": ${result.error}` },
        { status: banned ? 403 : 400 }
      );
    }
  }

  // 5. All files validated — proceed with upload
  const bucket = getStorage().bucket();
  const db = getDb();
  const uploadedFiles: { name: string; path: string; size: number; type: string; url: string }[] = [];

  for (const file of files) {
    const buffer = new Uint8Array(await file.arrayBuffer());
    const result = validateFile(buffer, file.name, file.size);

    const safeName = sanitizeFilename(file.name);
    const uuid = randomUUID();
    const storagePath = `evidence/${disputeId}/${uuid}-${safeName}`;

    const fileRef = bucket.file(storagePath);
    await fileRef.save(Buffer.from(buffer), {
      metadata: {
        contentType: result.detectedType,
        metadata: {
          uploadedBy: auth.address,
          disputeId,
          originalName: file.name,
          uploadIp: ip,
        },
      },
    });

    const [signedUrl] = await fileRef.getSignedUrl({
      action: "read",
      expires: Date.now() + 24 * 60 * 60 * 1000, // 24h
    });

    uploadedFiles.push({
      name: file.name,
      path: storagePath,
      size: file.size,
      type: result.detectedType!,
      url: signedUrl,
    });
  }

  // 6. Log metadata to Firestore
  const evidenceRef = db.collection("evidence").doc(disputeId).collection("files");
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
