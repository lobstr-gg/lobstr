import { NextRequest, NextResponse } from "next/server";
import { getStorage } from "firebase-admin/storage";
import { requireAuth } from "@/lib/forum-auth";
import { validateFile, sanitizeFilename } from "@/lib/file-validation";
import { isWalletBanned, extractClientIp } from "@/lib/upload-security";
import { rateLimit, getIPKey, checkBodySize } from "@/lib/rate-limit";
import { updateUser } from "@/lib/firestore-store";
import { randomUUID } from "crypto";

const MAX_PROFILE_IMAGE_SIZE = 2 * 1024 * 1024; // 2MB
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

// POST /api/upload/profile-image — upload a profile picture
export async function POST(request: NextRequest) {
  const limited = rateLimit(`profile-img:${getIPKey(request)}`, 60_000, 5);
  if (limited) return limited;

  const tooLarge = await checkBodySize(request, MAX_PROFILE_IMAGE_SIZE + 1024);
  if (tooLarge) return tooLarge;

  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  if (await isWalletBanned(auth.address)) {
    return NextResponse.json(
      { error: "Your wallet has been banned from uploading files" },
      { status: 403 }
    );
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file || !(file instanceof File)) {
    return NextResponse.json(
      { error: "No file provided" },
      { status: 400 }
    );
  }

  if (file.size > MAX_PROFILE_IMAGE_SIZE) {
    return NextResponse.json(
      { error: "Profile image must be under 2MB" },
      { status: 400 }
    );
  }

  const buffer = new Uint8Array(await file.arrayBuffer());
  const result = validateFile(buffer, file.name, file.size);

  if (!result.valid) {
    return NextResponse.json(
      { error: result.error || "Invalid file" },
      { status: 400 }
    );
  }

  if (!ALLOWED_IMAGE_TYPES.includes(result.detectedType || "")) {
    return NextResponse.json(
      { error: "Only JPEG, PNG, and WebP images are allowed" },
      { status: 400 }
    );
  }

  // Upload to Firebase Storage
  const bucket = getStorage().bucket();
  const safeName = sanitizeFilename(file.name);
  const uuid = randomUUID();
  const storagePath = `profile-images/${auth.address}/${uuid}-${safeName}`;

  const fileRef = bucket.file(storagePath);
  await fileRef.save(Buffer.from(buffer), {
    metadata: {
      contentType: result.detectedType,
      metadata: {
        uploadedBy: auth.address,
        uploadIp: extractClientIp(request),
      },
    },
  });

  // Make publicly readable
  await fileRef.makePublic();
  const publicUrl = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;

  // Update user profile with new image URL
  await updateUser(auth.address, { profileImageUrl: publicUrl });

  return NextResponse.json({ url: publicUrl }, { status: 200 });
}
