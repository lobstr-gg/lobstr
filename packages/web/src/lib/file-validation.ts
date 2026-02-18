/** File validation for evidence and delivery uploads */

export const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB
export const MAX_FILES_PER_REQUEST = 5;

export type AllowedMimeType =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "application/pdf"
  | "application/zip";

const MAGIC_BYTES: Record<AllowedMimeType, { bytes: number[]; offset?: number }[]> = {
  "image/jpeg": [{ bytes: [0xff, 0xd8, 0xff] }],
  "image/png": [{ bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] }],
  "image/webp": [
    { bytes: [0x52, 0x49, 0x46, 0x46] }, // RIFF
    { bytes: [0x57, 0x45, 0x42, 0x50], offset: 8 }, // WEBP at offset 8
  ],
  "application/pdf": [{ bytes: [0x25, 0x50, 0x44, 0x46] }], // %PDF
  "application/zip": [{ bytes: [0x50, 0x4b, 0x03, 0x04] }], // PK..
};

const EXTENSION_TO_MIME: Record<string, AllowedMimeType> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
  ".zip": "application/zip",
};

export interface ValidationResult {
  valid: boolean;
  error?: string;
  detectedType?: AllowedMimeType;
}

function getExtension(filename: string): string {
  const idx = filename.lastIndexOf(".");
  return idx >= 0 ? filename.slice(idx).toLowerCase() : "";
}

function matchesMagicBytes(
  buffer: Uint8Array,
  patterns: { bytes: number[]; offset?: number }[]
): boolean {
  for (const pattern of patterns) {
    const offset = pattern.offset ?? 0;
    if (buffer.length < offset + pattern.bytes.length) return false;
    const matches = pattern.bytes.every(
      (b, i) => buffer[offset + i] === b
    );
    if (!matches) return false;
  }
  return true;
}

export function validateFile(
  buffer: Uint8Array,
  filename: string,
  fileSize: number
): ValidationResult {
  // Size check
  if (fileSize > MAX_FILE_SIZE) {
    return { valid: false, error: `File exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit` };
  }

  if (fileSize === 0) {
    return { valid: false, error: "Empty file" };
  }

  // Extension check
  const ext = getExtension(filename);
  const expectedMime = EXTENSION_TO_MIME[ext];
  if (!expectedMime) {
    return {
      valid: false,
      error: `Unsupported file type: ${ext || "unknown"}. Allowed: JPEG, PNG, WebP, PDF, ZIP`,
    };
  }

  // Magic byte validation
  const patterns = MAGIC_BYTES[expectedMime];
  if (!matchesMagicBytes(buffer, patterns)) {
    return {
      valid: false,
      error: `File content does not match ${ext} format (magic byte mismatch)`,
    };
  }

  // ZIP bomb check: reject ZIPs smaller than 100 bytes (likely malformed)
  if (expectedMime === "application/zip" && fileSize < 100) {
    return { valid: false, error: "ZIP file too small, likely malformed" };
  }

  return { valid: true, detectedType: expectedMime };
}

export function validateFileCount(count: number): ValidationResult {
  if (count === 0) {
    return { valid: false, error: "No files provided" };
  }
  if (count > MAX_FILES_PER_REQUEST) {
    return {
      valid: false,
      error: `Maximum ${MAX_FILES_PER_REQUEST} files per request`,
    };
  }
  return { valid: true };
}

/** Reject dangerous filenames (path traversal, etc.) */
export function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/\.{2,}/g, ".")
    .slice(0, 200);
}
