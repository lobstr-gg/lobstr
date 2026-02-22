import { type Address } from "viem";
import { baseSepolia, base } from "viem/chains";

export const CHAIN = base;

// Base Sepolia — deployed 2026-02-17, block 37781528
export const USDC: Record<number, Address> = {
  [baseSepolia.id]: "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as Address,
  [base.id]: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address,
};

export const FACILITATOR_URL =
  process.env.NEXT_PUBLIC_FACILITATOR_URL ?? "https://x402.lobstr.gg";

export const CONTRACTS = {
  [baseSepolia.id]: {
    lobToken: "0x6024B53f6f8afD433dc434D95be42A45Ed9b4a59" as Address,
    stakingManager: "0x0c8390c6ef1a7Dd07Cc2bE9C0C06D49FC5439c58" as Address,
    reputationSystem: "0xbbBd9c388b6bdCA4772bC5297f4E72d76d5fE21C" as Address,
    serviceRegistry: "0xa309769426C90f27Cc32E62BdBF6313E35c5c660" as Address,
    disputeArbitration: "0x0060D7828ace2B594Bb5e56F80d7757BC473cf72" as Address,
    escrowEngine: "0x072EdB0526027A48f6A2aC5CeE3A5375142Bedc0" as Address,
    groth16Verifier: "0xAe44baaf546145f6474BCdd004d46b3Eca29AE68" as Address,
    airdropClaimV2: "0x91B4b01173C74cb16EE2997f8449FdEE254F81e2" as Address,
    treasuryGovernor: "0x0000000000000000000000000000000000000000" as Address, // TODO: set after deploy
    sybilGuard: "0x0000000000000000000000000000000000000000" as Address, // TODO: set after deploy
    x402EscrowBridge: "0x0000000000000000000000000000000000000000" as Address, // TODO: set after deploy
  },
  [base.id]: {
    lobToken: "0x7FaeC2536E2Afee56AcA568C475927F1E2521B37" as Address,
    stakingManager: "0x0c5bC27a3C3Eb7a836302320755f6B1645C49291" as Address,
    reputationSystem: "0xc1374611FB7c6637e30a274073e7dCFf758C76FC" as Address,
    serviceRegistry: "0xa127B684935f1D24C7236ba1FbB3FF140F4eD3C3" as Address,
    disputeArbitration: "0x00Ad7d299F4BF3aE8372f756b86B4dAf63eC3FAa" as Address,
    escrowEngine: "0xBB57d0D0aB24122A87c9a28acdc242927e6189E0" as Address,
    groth16Verifier: "0xfc0563332c3d0969a706E1d55f3d576F1A4c0F04" as Address,
    airdropClaimV2: "0x349790d7f56110765Fccd86790B584c423c0BaA9" as Address,
    treasuryGovernor: "0x9576dcf9909ec192FC136A12De293Efab911517f" as Address,
    sybilGuard: "0xF43E6698cAAf3BFf422137F20541Cd24dfB3ff07" as Address,
    x402EscrowBridge: "0x68c27140D25976ac8F041Ed8a53b70Be11c9f4B0" as Address,
  },
} as const;

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;

/** Returns false for zero address or undefined */
export function isValidContract(address: Address | undefined): boolean {
  return !!address && address !== ZERO_ADDRESS;
}

export function getContracts(chainId: number) {
  const contracts = CONTRACTS[chainId as keyof typeof CONTRACTS];
  if (!contracts) return undefined;

  // Guard: if mainnet addresses are all zero, return undefined
  if (
    chainId === base.id &&
    contracts.lobToken === ZERO_ADDRESS
  ) {
    return undefined;
  }

  return contracts;
}
