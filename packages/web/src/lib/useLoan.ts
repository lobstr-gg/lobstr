"use client";

import { useReadContract, useWriteContract } from "wagmi";
import { type Address } from "viem";
import { getContracts, CHAIN } from "@/config/contracts";
import { LOBTokenABI } from "@/config/abis";

function useContracts() {
  return getContracts(CHAIN.id);
}

/* ──── LoanEngine ABI ──── */

export const LoanEngineABI = [
  {
    "type": "constructor",
    "inputs": [
      { "name": "_lobToken", "type": "address", "internalType": "address" },
      { "name": "_reputationSystem", "type": "address", "internalType": "address" },
      { "name": "_stakingManager", "type": "address", "internalType": "address" },
      { "name": "_sybilGuard", "type": "address", "internalType": "address" },
      { "name": "_treasury", "type": "address", "internalType": "address" }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "BPS_DENOMINATOR",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "DAYS_PER_YEAR",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "DEFAULTS_BEFORE_RESTRICTION",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "DEFAULT_ADMIN_ROLE",
    "inputs": [],
    "outputs": [{ "name": "", "type": "bytes32", "internalType": "bytes32" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "GOLD_COLLATERAL_BPS",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "GOLD_INTEREST_BPS",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "GOLD_MAX_BORROW",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "GRACE_PERIOD",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "MAX_ACTIVE_LOANS",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "PLATINUM_COLLATERAL_BPS",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "PLATINUM_INTEREST_BPS",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "PLATINUM_MAX_BORROW",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "PROTOCOL_FEE_BPS",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "REQUEST_EXPIRY",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "SILVER_COLLATERAL_BPS",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "SILVER_INTEREST_BPS",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "SILVER_MAX_BORROW",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "cancelLoan",
    "inputs": [{ "name": "loanId", "type": "uint256", "internalType": "uint256" }],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "cleanupExpiredRequest",
    "inputs": [{ "name": "loanId", "type": "uint256", "internalType": "uint256" }],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "fundLoan",
    "inputs": [{ "name": "loanId", "type": "uint256", "internalType": "uint256" }],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "getActiveLoanIds",
    "inputs": [{ "name": "borrower", "type": "address", "internalType": "address" }],
    "outputs": [{ "name": "", "type": "uint256[]", "internalType": "uint256[]" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getBorrowerProfile",
    "inputs": [{ "name": "borrower", "type": "address", "internalType": "address" }],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct ILoanEngine.BorrowerProfile",
        "components": [
          { "name": "activeLoans", "type": "uint256", "internalType": "uint256" },
          { "name": "totalBorrowed", "type": "uint256", "internalType": "uint256" },
          { "name": "totalRepaid", "type": "uint256", "internalType": "uint256" },
          { "name": "defaults", "type": "uint256", "internalType": "uint256" },
          { "name": "restricted", "type": "bool", "internalType": "bool" }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getCollateralRequired",
    "inputs": [
      { "name": "principal", "type": "uint256", "internalType": "uint256" },
      { "name": "borrower", "type": "address", "internalType": "address" }
    ],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getInterestRate",
    "inputs": [{ "name": "borrower", "type": "address", "internalType": "address" }],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getLoan",
    "inputs": [{ "name": "loanId", "type": "uint256", "internalType": "uint256" }],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct ILoanEngine.Loan",
        "components": [
          { "name": "id", "type": "uint256", "internalType": "uint256" },
          { "name": "borrower", "type": "address", "internalType": "address" },
          { "name": "lender", "type": "address", "internalType": "address" },
          { "name": "principal", "type": "uint256", "internalType": "uint256" },
          { "name": "interestAmount", "type": "uint256", "internalType": "uint256" },
          { "name": "protocolFee", "type": "uint256", "internalType": "uint256" },
          { "name": "collateralAmount", "type": "uint256", "internalType": "uint256" },
          { "name": "totalRepaid", "type": "uint256", "internalType": "uint256" },
          { "name": "status", "type": "uint8", "internalType": "enum ILoanEngine.LoanStatus" },
          { "name": "term", "type": "uint8", "internalType": "enum ILoanEngine.LoanTerm" },
          { "name": "requestedAt", "type": "uint256", "internalType": "uint256" },
          { "name": "fundedAt", "type": "uint256", "internalType": "uint256" },
          { "name": "dueDate", "type": "uint256", "internalType": "uint256" }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getMaxBorrow",
    "inputs": [{ "name": "borrower", "type": "address", "internalType": "address" }],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getOutstandingAmount",
    "inputs": [{ "name": "loanId", "type": "uint256", "internalType": "uint256" }],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getRoleAdmin",
    "inputs": [{ "name": "role", "type": "bytes32", "internalType": "bytes32" }],
    "outputs": [{ "name": "", "type": "bytes32", "internalType": "bytes32" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getTermDuration",
    "inputs": [{ "name": "term", "type": "uint8", "internalType": "enum ILoanEngine.LoanTerm" }],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "pure"
  },
  {
    "type": "function",
    "name": "grantRole",
    "inputs": [
      { "name": "role", "type": "bytes32", "internalType": "bytes32" },
      { "name": "account", "type": "address", "internalType": "address" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "hasRole",
    "inputs": [
      { "name": "role", "type": "bytes32", "internalType": "bytes32" },
      { "name": "account", "type": "address", "internalType": "address" }
    ],
    "outputs": [{ "name": "", "type": "bool", "internalType": "bool" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "liftRestriction",
    "inputs": [{ "name": "borrower", "type": "address", "internalType": "address" }],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "liquidate",
    "inputs": [{ "name": "loanId", "type": "uint256", "internalType": "uint256" }],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "lobToken",
    "inputs": [],
    "outputs": [{ "name": "", "type": "address", "internalType": "contract IERC20" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "pause",
    "inputs": [],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "paused",
    "inputs": [],
    "outputs": [{ "name": "", "type": "bool", "internalType": "bool" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "renounceRole",
    "inputs": [
      { "name": "role", "type": "bytes32", "internalType": "bytes32" },
      { "name": "account", "type": "address", "internalType": "address" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "repay",
    "inputs": [
      { "name": "loanId", "type": "uint256", "internalType": "uint256" },
      { "name": "amount", "type": "uint256", "internalType": "uint256" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "reputationSystem",
    "inputs": [],
    "outputs": [{ "name": "", "type": "address", "internalType": "contract IReputationSystem" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "requestLoan",
    "inputs": [
      { "name": "principal", "type": "uint256", "internalType": "uint256" },
      { "name": "term", "type": "uint8", "internalType": "enum ILoanEngine.LoanTerm" }
    ],
    "outputs": [{ "name": "loanId", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "revokeRole",
    "inputs": [
      { "name": "role", "type": "bytes32", "internalType": "bytes32" },
      { "name": "account", "type": "address", "internalType": "address" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "stakingManager",
    "inputs": [],
    "outputs": [{ "name": "", "type": "address", "internalType": "contract IStakingManager" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "supportsInterface",
    "inputs": [{ "name": "interfaceId", "type": "bytes4", "internalType": "bytes4" }],
    "outputs": [{ "name": "", "type": "bool", "internalType": "bool" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "sybilGuard",
    "inputs": [],
    "outputs": [{ "name": "", "type": "address", "internalType": "contract ISybilGuard" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "treasury",
    "inputs": [],
    "outputs": [{ "name": "", "type": "address", "internalType": "address" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "unpause",
    "inputs": [],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "event",
    "name": "BorrowerRestricted",
    "inputs": [
      { "name": "borrower", "type": "address", "indexed": true, "internalType": "address" },
      { "name": "defaults", "type": "uint256", "indexed": false, "internalType": "uint256" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "LoanCancelled",
    "inputs": [
      { "name": "loanId", "type": "uint256", "indexed": true, "internalType": "uint256" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "LoanDefaulted",
    "inputs": [
      { "name": "loanId", "type": "uint256", "indexed": true, "internalType": "uint256" },
      { "name": "borrower", "type": "address", "indexed": true, "internalType": "address" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "LoanFunded",
    "inputs": [
      { "name": "loanId", "type": "uint256", "indexed": true, "internalType": "uint256" },
      { "name": "lender", "type": "address", "indexed": true, "internalType": "address" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "LoanLiquidated",
    "inputs": [
      { "name": "loanId", "type": "uint256", "indexed": true, "internalType": "uint256" },
      { "name": "collateralSeized", "type": "uint256", "indexed": false, "internalType": "uint256" },
      { "name": "stakeSlashed", "type": "uint256", "indexed": false, "internalType": "uint256" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "LoanRepaid",
    "inputs": [
      { "name": "loanId", "type": "uint256", "indexed": true, "internalType": "uint256" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "LoanRequested",
    "inputs": [
      { "name": "loanId", "type": "uint256", "indexed": true, "internalType": "uint256" },
      { "name": "borrower", "type": "address", "indexed": true, "internalType": "address" },
      { "name": "principal", "type": "uint256", "indexed": false, "internalType": "uint256" },
      { "name": "term", "type": "uint8", "indexed": false, "internalType": "enum ILoanEngine.LoanTerm" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Paused",
    "inputs": [
      { "name": "account", "type": "address", "indexed": false, "internalType": "address" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "RepaymentMade",
    "inputs": [
      { "name": "loanId", "type": "uint256", "indexed": true, "internalType": "uint256" },
      { "name": "amount", "type": "uint256", "indexed": false, "internalType": "uint256" },
      { "name": "remaining", "type": "uint256", "indexed": false, "internalType": "uint256" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "RoleAdminChanged",
    "inputs": [
      { "name": "role", "type": "bytes32", "indexed": true, "internalType": "bytes32" },
      { "name": "previousAdminRole", "type": "bytes32", "indexed": true, "internalType": "bytes32" },
      { "name": "newAdminRole", "type": "bytes32", "indexed": true, "internalType": "bytes32" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "RoleGranted",
    "inputs": [
      { "name": "role", "type": "bytes32", "indexed": true, "internalType": "bytes32" },
      { "name": "account", "type": "address", "indexed": true, "internalType": "address" },
      { "name": "sender", "type": "address", "indexed": true, "internalType": "address" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "RoleRevoked",
    "inputs": [
      { "name": "role", "type": "bytes32", "indexed": true, "internalType": "bytes32" },
      { "name": "account", "type": "address", "indexed": true, "internalType": "address" },
      { "name": "sender", "type": "address", "indexed": true, "internalType": "address" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Unpaused",
    "inputs": [
      { "name": "account", "type": "address", "indexed": false, "internalType": "address" }
    ],
    "anonymous": false
  }
] as const;

/* ──── Read Hooks ──── */

export function useLoan(loanId?: bigint) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.loanEngine,
    abi: LoanEngineABI,
    functionName: "getLoan",
    args: loanId !== undefined ? [loanId] : undefined,
    query: { enabled: loanId !== undefined && !!contracts },
  });
}

export function useBorrowerProfile(address?: `0x${string}`) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.loanEngine,
    abi: LoanEngineABI,
    functionName: "getBorrowerProfile",
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!contracts },
  });
}

export function useMaxBorrow(address?: `0x${string}`) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.loanEngine,
    abi: LoanEngineABI,
    functionName: "getMaxBorrow",
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!contracts },
  });
}

export function useInterestRate(address?: `0x${string}`) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.loanEngine,
    abi: LoanEngineABI,
    functionName: "getInterestRate",
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!contracts },
  });
}

export function useCollateralRequired(principal?: bigint, borrower?: `0x${string}`) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.loanEngine,
    abi: LoanEngineABI,
    functionName: "getCollateralRequired",
    args: principal !== undefined && borrower ? [principal, borrower] : undefined,
    query: { enabled: principal !== undefined && !!borrower && !!contracts },
  });
}

export function useOutstandingAmount(loanId?: bigint) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.loanEngine,
    abi: LoanEngineABI,
    functionName: "getOutstandingAmount",
    args: loanId !== undefined ? [loanId] : undefined,
    query: { enabled: loanId !== undefined && !!contracts },
  });
}

export function useActiveLoanIds(address?: `0x${string}`) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.loanEngine,
    abi: LoanEngineABI,
    functionName: "getActiveLoanIds",
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!contracts },
  });
}

export function useTermDuration(term?: number) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.loanEngine,
    abi: LoanEngineABI,
    functionName: "getTermDuration",
    args: term !== undefined ? [term] : undefined,
    query: { enabled: term !== undefined && !!contracts },
  });
}

/* ──── Write Hooks ──── */

export function useRequestLoan() {
  const contracts = useContracts();
  const { writeContractAsync, isPending, isError, error, reset } = useWriteContract();
  const fn = async (principal: bigint, term: number) => {
    if (!contracts) throw new Error("Contracts not loaded");
    return writeContractAsync({
      address: contracts.loanEngine as Address,
      abi: LoanEngineABI,
      functionName: "requestLoan",
      args: [principal, term],
    });
  };
  return { fn, isPending, isError, error, reset };
}

export function useCancelLoan() {
  const contracts = useContracts();
  const { writeContract } = useWriteContract();
  return (loanId: bigint) => {
    writeContract({
      address: contracts?.loanEngine as Address,
      abi: LoanEngineABI,
      functionName: "cancelLoan",
      args: [loanId],
    });
  };
}

export function useFundLoan() {
  const contracts = useContracts();
  const { writeContractAsync, isPending, isError, error, reset } = useWriteContract();
  const fn = async (loanId: bigint) => {
    if (!contracts) throw new Error("Contracts not loaded");
    return writeContractAsync({
      address: contracts.loanEngine as Address,
      abi: LoanEngineABI,
      functionName: "fundLoan",
      args: [loanId],
    });
  };
  return { fn, isPending, isError, error, reset };
}

export function useRepayLoan() {
  const contracts = useContracts();
  const { writeContractAsync, isPending, isError, error, reset } = useWriteContract();
  const fn = async (loanId: bigint, amount: bigint) => {
    if (!contracts) throw new Error("Contracts not loaded");
    return writeContractAsync({
      address: contracts.loanEngine as Address,
      abi: LoanEngineABI,
      functionName: "repay",
      args: [loanId, amount],
    });
  };
  return { fn, isPending, isError, error, reset };
}

export function useLiquidateLoan() {
  const contracts = useContracts();
  const { writeContract } = useWriteContract();
  return (loanId: bigint) => {
    writeContract({
      address: contracts?.loanEngine as Address,
      abi: LoanEngineABI,
      functionName: "liquidate",
      args: [loanId],
    });
  };
}

/* ──── Token Approval (for collateral deposits) ──── */

export function useApproveToken() {
  const { writeContractAsync } = useWriteContract();
  const contracts = useContracts();

  return async (token: `0x${string}`, spender: `0x${string}`, amount: bigint) => {
    if (!contracts) throw new Error("Contracts not loaded");
    return writeContractAsync({
      address: token,
      abi: LOBTokenABI,
      functionName: "approve",
      args: [spender, amount],
    });
  };
}
