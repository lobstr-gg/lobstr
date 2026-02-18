import { createPublicClient, http } from "viem";
import { getContracts, CHAIN } from "@/config/contracts";
import { DisputeArbitrationABI } from "@/config/abis";

/**
 * Verify that a user has access to dispute evidence.
 * Reads the dispute on-chain and checks if the user is a buyer, seller, or assigned arbitrator.
 *
 * @returns null if access is granted, or an error string if denied.
 */
export async function verifyDisputeAccess(
  userAddress: string,
  disputeId: string
): Promise<{ error: string; status: number } | null> {
  const contracts = getContracts(CHAIN.id);
  if (!contracts?.disputeArbitration) {
    return { error: "Contract configuration missing", status: 500 };
  }

  const client = createPublicClient({
    chain: CHAIN,
    transport: http(),
  });

  try {
    const dispute = (await client.readContract({
      address: contracts.disputeArbitration,
      abi: DisputeArbitrationABI,
      functionName: "getDispute",
      args: [BigInt(disputeId)],
    })) as any;

    if (!dispute || !dispute.id || dispute.id === 0n) {
      return { error: "Dispute not found on-chain", status: 404 };
    }

    const userAddr = userAddress.toLowerCase();
    const isBuyer = dispute.buyer?.toLowerCase() === userAddr;
    const isSeller = dispute.seller?.toLowerCase() === userAddr;
    const arbitrators: string[] = dispute.arbitrators || [];
    const isArbitrator = arbitrators.some(
      (a: string) => a.toLowerCase() === userAddr
    );

    if (!isBuyer && !isSeller && !isArbitrator) {
      return {
        error:
          "Access denied. Only assigned arbitrators and dispute parties can access this resource.",
        status: 403,
      };
    }

    return null; // Access granted
  } catch {
    return {
      error: "Unable to verify dispute access on-chain. Access denied.",
      status: 403,
    };
  }
}

/**
 * Verify that a user is the seller for a specific job.
 * Reads the job on-chain via EscrowEngine.
 */
export async function verifyJobSeller(
  userAddress: string,
  jobId: string
): Promise<{ error: string; status: number } | null> {
  const contracts = getContracts(CHAIN.id);
  if (!contracts?.escrowEngine) {
    return { error: "Contract configuration missing", status: 500 };
  }

  const client = createPublicClient({
    chain: CHAIN,
    transport: http(),
  });

  try {
    const { EscrowEngineABI } = await import("@/config/abis");
    const job = (await client.readContract({
      address: contracts.escrowEngine,
      abi: EscrowEngineABI,
      functionName: "getJob",
      args: [BigInt(jobId)],
    })) as any;

    if (!job || !job.id || job.id === 0n) {
      return { error: "Job not found on-chain", status: 404 };
    }

    if (job.seller?.toLowerCase() !== userAddress.toLowerCase()) {
      return {
        error: "Access denied. Only the job seller can upload deliveries.",
        status: 403,
      };
    }

    return null; // Access granted
  } catch {
    return {
      error: "Unable to verify job access on-chain. Access denied.",
      status: 403,
    };
  }
}
