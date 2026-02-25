import { validateEnv } from "@/lib/env-validation";

export function register() {
  validateEnv();
}
