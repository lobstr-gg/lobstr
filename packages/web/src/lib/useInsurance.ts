"use client";

/**
 * InsurancePool hooks — re-exports from @/lib/hooks plus the ABI
 * for standalone import from the /insurance page.
 */

export { InsurancePoolABI } from "@/config/abis";

export {
  // Read hooks
  usePoolStats,
  usePoolStakerInfo,
  useCoverageCap,
  useIsInsuredJob,
  usePoolEarned,
  // Write hooks
  useDepositToInsurancePool,
  useWithdrawFromInsurancePool,
  useClaimPoolRewards,
  useCreateInsuredJob,
  useFileClaim,
  useConfirmInsuredDelivery,
  useInitiateInsuredDispute,
  // Token helpers (for approval flow)
  useApproveToken,
  useLOBBalance,
  useLOBAllowance,
} from "@/lib/hooks";
