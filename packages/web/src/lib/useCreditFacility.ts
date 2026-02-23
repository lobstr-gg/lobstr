"use client";

/**
 * X402CreditFacility hook re-exports.
 *
 * All hooks live in @/lib/hooks (backed by X402CreditFacilityABI in @/config/abis).
 * This module groups them for convenient single-import usage on the credit page.
 */

// ── READ hooks ──
export {
  /** getCreditLine(agent) -> CreditLine struct */
  useCreditLine,
  /** getDraw(drawId) -> CreditDraw struct */
  useCreditDraw as useDraw,
  /** getActiveDrawIds(agent) -> uint256[] */
  useActiveDrawIds,
  /** getAvailableCredit(agent) -> uint256 */
  useAvailableCredit,
  /** getPoolUtilization() -> (total, outstanding, available) */
  usePoolUtilization,
} from "@/lib/hooks";

// ── WRITE hooks ──
export {
  /** openCreditLine() */
  useOpenCreditLine,
  /** closeCreditLine() */
  useCloseCreditLine,
  /** drawCreditAndCreateEscrow(listingId, seller, amount) */
  useDrawCreditAndCreateEscrow as useDrawCredit,
  /** repayDraw(drawId) */
  useRepayDraw,
  /** claimEscrowRefund(escrowJobId) */
  useCreditClaimEscrowRefund as useClaimEscrowRefund,
  /** liquidateDraw(drawId) */
  useLiquidateDraw,
  /** depositToPool(amount) -- requires POOL_MANAGER_ROLE */
  useDepositToCreditPool as useDepositToPool,
  /** withdrawFromPool(amount) -- requires POOL_MANAGER_ROLE */
  useWithdrawFromCreditPool as useWithdrawFromPool,
  /** confirmDelivery(escrowJobId) */
  useCreditConfirmDelivery as useConfirmCreditDelivery,
  /** initiateDispute(escrowJobId, evidenceURI) */
  useCreditInitiateDispute as useInitiateCreditDispute,
} from "@/lib/hooks";
