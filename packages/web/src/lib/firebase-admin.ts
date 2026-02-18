import "server-only";
import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

let app: App;
let db: Firestore;

function initialize() {
  if (getApps().length > 0) {
    app = getApps()[0];
  } else {
    // In Firebase hosting, credentials are auto-provisioned (no env var needed).
    // For local dev, read from FIREBASE_SERVICE_ACCOUNT_KEY.
    const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

    if (serviceAccountKey) {
      const serviceAccount = JSON.parse(serviceAccountKey);
      app = initializeApp({ credential: cert(serviceAccount) });
    } else {
      // Auto-provisioned in Firebase hosting / uses ADC locally
      app = initializeApp();
    }
  }

  db = getFirestore(app);
}

export function getDb(): Firestore {
  if (!db) initialize();
  return db;
}
