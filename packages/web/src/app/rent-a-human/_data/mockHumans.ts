import type { HumanProvider } from "./types";

// Providers are loaded from ServiceRegistry + StakingManager on-chain data.
// This array is the local cache — empty until real providers register.
export const MOCK_HUMANS: HumanProvider[] = [];
