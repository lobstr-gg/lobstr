import { NextRequest, NextResponse } from "next/server";
import { getStorage } from "firebase-admin/storage";
import { requireAuth } from "@/lib/forum-auth";
import { getDb } from "@/lib/firebase-admin";
import {
  validateFile,
  validateFileCount,
  sanitizeFilename,
} from "@/lib/file-validation";
import {
  recordUploadViolation,
  isWalletBanned,
  extractClientIp,
  isExecutableFilename,
} from "@/lib/upload-security";
import { randomUUID } from "crypto";
import { rateLimit, getIPKey, checkBodySize } from "@/lib/rate-limit";

const MAX_PRODUCT_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB per image
const MAX_PRODUCT_IMAGES = 5;

export async function POST(request: NextRequest) {
  const limited = rateLimit(`product-img:${getIPKey(request)}`, 60_000, 10);
  if (limited) return limited;

  const tooLarge = await checkBodySize(request, MAX_PRODUCT_IMAGES * MAX_PRODUCT_IMAGE_SIZE);
  if (tooLarge) return tooLarge;

  // Auth
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const ip = extractClientIp(request);

  if (await isWalletBanned(auth.address)) {
    return NextResponse.json(
      { error: "Your wallet has been banned from uploading files" },
      { status: 403 }
    );
  }

  // Parse form data
  const formData = await request.formData();
  const productRef = (formData.get("productRef") as string) || "draft";

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

  // Validate all files before uploading
  for (const file of files) {
    if (isExecutableFilename(file.name)) {
      await recordUploadViolation(ip, auth.address, {
        type: "executable_upload",
        filename: file.name,
        detail: `Attempted to upload executable file: ${file.name}`,
      });
      return NextResponse.json({ error: "File type not allowed" }, { status: 400 });
    }

    if (file.size > MAX_PRODUCT_IMAGE_SIZE) {
      return NextResponse.json(
        { error: `File "${file.name}" exceeds 10MB limit` },
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

    // Only allow images for product listings
    if (!result.detectedType?.startsWith("image/")) {
      return NextResponse.json(
        { error: `File "${file.name}": only images allowed for product listings` },
        { status: 400 }
      );
    }
  }

  // Upload all validated files
  const bucket = getStorage().bucket();
  const db = getDb();
  const uploadedFiles: { name: string; path: string; size: number; type: string; url: string }[] = [];

  for (const file of files) {
    const buffer = new Uint8Array(await file.arrayBuffer());
    const result = validateFile(buffer, file.name, file.size);

    const safeName = sanitizeFilename(file.name);
    const uuid = randomUUID();
    const storagePath = `product-images/${auth.address}/${productRef}/${uuid}-${safeName}`;

    const fileRef = bucket.file(storagePath);
    await fileRef.save(Buffer.from(buffer), {
      metadata: {
        contentType: result.detectedType,
        metadata: {
          uploadedBy: auth.address,
          productRef,
          originalName: file.name,
          uploadIp: ip,
        },
      },
    });

    // Product images are public (for marketplace browsing)
    await fileRef.makePublic();
    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;

    uploadedFiles.push({
      name: file.name,
      path: storagePath,
      size: file.size,
      type: result.detectedType!,
      url: publicUrl,
    });
  }

  // Log to Firestore
  const imagesRef = db.collection("product-images").doc(auth.address).collection("uploads");
  for (const f of uploadedFiles) {
    await imagesRef.add({
      name: f.name,
      path: f.path,
      size: f.size,
      type: f.type,
      url: f.url,
      productRef,
      uploadedAt: Date.now(),
      ip,
    });
  }

  return NextResponse.json({ files: uploadedFiles }, { status: 201 });
}
