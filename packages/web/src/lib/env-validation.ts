const REQUIRED_ENV_VARS = [
  "FIREBASE_SERVICE_ACCOUNT_KEY",
  "NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID",
];

const REQUIRED_SECRET_VARS = [
  "AIRDROP_APPROVAL_SIGNER_KEY",
  "AIRDROP_ATTEST_SIGNER_KEY",
];

export function validateEnv() {
  const missing = REQUIRED_ENV_VARS.filter((v) => !process.env[v]);
  if (missing.length > 0) {
    console.warn(
      `Warning: Missing environment variables: ${missing.join(", ")}`,
    );
  }
  const missingSecrets = REQUIRED_SECRET_VARS.filter((v) => !process.env[v]);
  if (missingSecrets.length > 0) {
    console.warn(
      `Warning: Missing secret variables: ${missingSecrets.join(", ")}`,
    );
  }
}
