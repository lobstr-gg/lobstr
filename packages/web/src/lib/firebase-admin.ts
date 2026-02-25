import "server-only";
import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import type { Bucket } from "@google-cloud/storage";

let app: App;
let db: Firestore;
let bucket: Bucket;

const STORAGE_BUCKET =
  process.env.FIREBASE_STORAGE_BUCKET || "lobstr-8ec05.firebasestorage.app";

function initialize() {
  if (getApps().length > 0) {
    app = getApps()[0];
  } else {
    // In Firebase hosting, credentials are auto-provisioned (no env var needed).
    // For local dev, read from FIREBASE_SERVICE_ACCOUNT_KEY.
    const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

    if (serviceAccountKey) {
      const serviceAccount = JSON.parse(serviceAccountKey);
      app = initializeApp({
        credential: cert(serviceAccount),
        storageBucket: STORAGE_BUCKET,
      });
    } else {
      // Auto-provisioned in Firebase hosting / uses ADC locally
      app = initializeApp({ storageBucket: STORAGE_BUCKET });
    }
  }

  db = getFirestore(app);
  bucket = getStorage(app).bucket();
}

export function getDb(): Firestore {
  if (!db) initialize();
  return db;
}

export function getBucket(): Bucket {
  if (!bucket) initialize();
  return bucket;
}
