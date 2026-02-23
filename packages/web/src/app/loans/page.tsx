"use client";

import { useState, useMemo } from "react";
import { useAccount } from "wagmi";
import { formatEther, parseEther, type Address } from "viem";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { motion, AnimatePresence } from "framer-motion";
import { stagger, fadeUp, ease } from "@/lib/motion";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import {
  useLoan,
  useBorrowerProfile,
  useMaxBorrow,
  useInterestRate,
  useOutstandingAmount,
  useActiveLoanIds,
  useRequestLoan,
  useCancelLoan,
  useFundLoan,
  useRepayLoan,
  useLiquidateLoan,
  useApproveToken,
} from "@/lib/useLoan";
import { getContracts, CHAIN } from "@/config/contracts";
import {
  Banknote,
  Shield,
  ArrowRight,
  Clock,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  Wallet,
  FileText,
  Coins,
  Percent,
  Timer,
  XCircle,
  Zap,
  Lock,
  DollarSign,
  Loader2,
} from "lucide-react";

/* ──── Constants ──── */

const LOAN_TERMS = [
  { label: "7 days", value: 7, enumVal: 0 },
  { label: "14 days", value: 14, enumVal: 1 },
  { label: "30 days", value: 30, enumVal: 2 },
  { label: "90 days", value: 90, enumVal: 3 },
] as const;

const TIER_CONFIG = [
  {
    name: "Silver",
    maxBorrow: "500",
    apr: "8%",
    aprNum: 8,
    collateral: "50%",
    collateralNum: 50,
    color: "#848E9C",
    icon: Shield,
    desc: "Entry-level borrowing for established protocol participants",
  },
  {
    name: "Gold",
    maxBorrow: "5,000",
    apr: "5%",
    aprNum: 5,
    collateral: "25%",
    collateralNum: 25,
    color: "#F0B90B",
    icon: Shield,
    desc: "Reduced rates and collateral for trusted borrowers",
  },
  {
    name: "Platinum",
    maxBorrow: "25,000",
    apr: "3%",
    aprNum: 3,
    collateral: "0%",
    collateralNum: 0,
    color: "#58B059",
    icon: Shield,
    desc: "Reputation-backed lending with zero collateral requirement",
  },
];

type LoanStatus = "active" | "requested" | "repaid" | "liquidated" | "cancelled";

const STATUS_COLORS: Record<LoanStatus, { bg: string; text: string; border: string }> = {
  requested: { bg: "bg-yellow-500/10", text: "text-yellow-400", border: "border-yellow-400/20" },
  active: { bg: "bg-blue-500/10", text: "text-blue-400", border: "border-blue-400/20" },
  repaid: { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-400/20" },
  liquidated: { bg: "bg-red-500/10", text: "text-red-400", border: "border-red-400/20" },
  cancelled: { bg: "bg-gray-500/10", text: "text-gray-400", border: "border-gray-400/20" },
};

const LOAN_STATUS_MAP: Record<number, LoanStatus> = {
  0: "requested",
  1: "active",
  2: "repaid",
  3: "liquidated",
  4: "cancelled",
};

// Tier names from StakingManager enum (None=0, Bronze=1, Silver=2, Gold=3, Platinum=4)
const TIER_NAMES = ["None", "Bronze", "Silver", "Gold", "Platinum"];

// Format a bigint LOB value for display
const fmtLob = (val: bigint) => {
  const raw = formatEther(val);
  const num = parseFloat(raw);
  return num.toLocaleString("en-US", { maximumFractionDigits: 2 });
};

/* ──── How It Works Flow ──── */
function LoanFlow() {
  const steps = [
    { icon: FileText, label: "Request", desc: "Submit loan amount, term, and post collateral", color: "#F59E0B" },
    { icon: Wallet, label: "Fund", desc: "A lender fills your request within 7 days", color: "#3B82F6" },
    { icon: Coins, label: "Repay", desc: "Pay back principal + interest before due date", color: "#A855F7" },
    { icon: CheckCircle2, label: "Complete", desc: "Collateral returned, reputation preserved", color: "#58B059" },
  ];

  return (
    <div className="card p-3 sm:p-5">
      <h3 className="text-[10px] sm:text-xs font-semibold text-text-primary uppercase tracking-wider mb-5">
        How It Works
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 sm:gap-3">
        {steps.map((step, i) => {
          const Icon = step.icon;
          return (
            <motion.div
              key={step.label}
              className="flex sm:flex-col items-start sm:items-center gap-3 sm:gap-2 text-center relative"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.15 + i * 0.1, ease }}
            >
              {/* Connector arrow (desktop) */}
              {i < steps.length - 1 && (
                <motion.div
                  className="hidden sm:block absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 z-10"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 0.3 }}
                  transition={{ delay: 0.5 + i * 0.15 }}
                >
                  <ArrowRight className="w-3 h-3 text-text-tertiary" />
                </motion.div>
              )}

              <motion.div
                className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: `${step.color}15`, border: `1px solid ${step.color}25` }}
                whileHover={{ scale: 1.1 }}
                animate={{
                  boxShadow: [
                    `0 0 0 0 ${step.color}00`,
                    `0 0 12px 0 ${step.color}15`,
                    `0 0 0 0 ${step.color}00`,
                  ],
                }}
                transition={{ duration: 3, delay: i * 0.5, repeat: Infinity }}
              >
                <Icon className="w-4 h-4 sm:w-5 sm:h-5" style={{ color: step.color }} />
              </motion.div>
              <div className="sm:text-center text-left">
                <p className="text-xs font-semibold text-text-primary">{step.label}</p>
                <p className="text-[10px] text-text-tertiary leading-tight mt-0.5">{step.desc}</p>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

/* ──── Loan Tier Cards ──── */
function LoanTierCards() {
  return (
    <div className="card p-3 sm:p-5">
      <h3 className="text-[10px] sm:text-xs font-semibold text-text-primary uppercase tracking-wider mb-4">
        Borrowing Tiers
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {TIER_CONFIG.map((tier, i) => {
          const Icon = tier.icon;
          return (
            <motion.div
              key={tier.name}
              className="rounded-lg border border-border/60 p-4 hover:border-opacity-100 transition-colors relative overflow-hidden group"
              style={{ borderColor: `${tier.color}20` }}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.2 + i * 0.1, ease }}
              whileHover={{ y: -2, borderColor: `${tier.color}40` }}
            >
              <motion.div
                className="absolute top-0 left-0 right-0 h-px opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ background: `linear-gradient(to right, transparent, ${tier.color}30, transparent)` }}
              />
              <div className="flex items-center gap-2 mb-3">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: `${tier.color}15` }}
                >
                  <Icon className="w-4 h-4" style={{ color: tier.color }} />
                </div>
                <div>
                  <p className="text-sm font-bold" style={{ color: tier.color }}>{tier.name}</p>
                  <p className="text-[9px] text-text-tertiary">{tier.desc}</p>
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-[10px] text-text-tertiary">Max Borrow</span>
                  <span className="text-[10px] text-text-secondary font-medium tabular-nums">{tier.maxBorrow} LOB</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[10px] text-text-tertiary">Interest Rate</span>
                  <span className="text-[10px] text-text-secondary font-medium tabular-nums">{tier.apr} APR</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[10px] text-text-tertiary">Collateral</span>
                  <span className="text-[10px] font-medium tabular-nums" style={{ color: tier.color }}>
                    {tier.collateralNum === 0 ? "None" : tier.collateral}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[10px] text-text-tertiary">Protocol Fee</span>
                  <span className="text-[10px] text-text-secondary font-medium tabular-nums">0.5%</span>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

/* ──── Single Loan Card ──── */
function LoanCard({ loanId, userAddress }: { loanId: bigint; userAddress: Address }) {
  const { data: loan } = useLoan(loanId);
  const { data: outstanding } = useOutstandingAmount(loanId);
  const cancelLoan = useCancelLoan();
  const { fn: repayLoan, isPending: repayPending, reset: repayReset } = useRepayLoan();
  const { fn: fundLoan, isPending: fundPending, reset: fundReset } = useFundLoan();
  const liquidateLoan = useLiquidateLoan();
  const approveToken = useApproveToken();
  const contracts = getContracts(CHAIN.id);

  const [repayAmount, setRepayAmount] = useState("");
  const [txStep, setTxStep] = useState<"idle" | "approving" | "executing">("idle");

  if (!loan) {
    return (
      <div className="card p-4 animate-pulse">
        <div className="h-4 bg-surface-2 rounded w-1/3 mb-2" />
        <div className="h-3 bg-surface-2 rounded w-2/3" />
      </div>
    );
  }

  const status = LOAN_STATUS_MAP[loan.status] ?? "requested";
  const colors = STATUS_COLORS[status];
  const isBorrower = loan.borrower.toLowerCase() === userAddress.toLowerCase();
  const isActive = status === "active";
  const isRequested = status === "requested";
  const outstandingAmt = outstanding ?? BigInt(0);
  const totalDue = loan.principal + loan.interestAmount;
  const repaidPct = totalDue > 0 ? Number((loan.totalRepaid * BigInt(100)) / totalDue) : 0;

  // Check if loan is overdue (past dueDate + grace period)
  const now = BigInt(Math.floor(Date.now() / 1000));
  const isOverdue = isActive && loan.dueDate > 0 && now > loan.dueDate + BigInt(48 * 3600);

  // Date formatting
  const dueStr = loan.dueDate > 0
    ? new Date(Number(loan.dueDate) * 1000).toLocaleDateString()
    : null;

  const handleRepay = async () => {
    if (!repayAmount || !contracts) return;
    repayReset();
    setTxStep("approving");
    try {
      const amt = parseEther(repayAmount);
      await approveToken(contracts.lobToken, contracts.loanEngine, amt);
      setTxStep("executing");
      await repayLoan(loanId, amt);
      setRepayAmount("");
      setTxStep("idle");
    } catch {
      setTxStep("idle");
    }
  };

  const handleFund = async () => {
    if (!contracts) return;
    fundReset();
    setTxStep("approving");
    try {
      // Lender needs to approve the principal amount
      await approveToken(contracts.lobToken, contracts.loanEngine, loan.principal);
      setTxStep("executing");
      await fundLoan(loanId);
      setTxStep("idle");
    } catch {
      setTxStep("idle");
    }
  };

  return (
    <motion.div
      className="card p-4 hover:border-lob-green/20 transition-colors"
      whileHover={{ y: -2 }}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-text-primary tabular-nums">
            Loan #{loan.id.toString()}
          </span>
          <span className={`text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded ${colors.bg} ${colors.text} border ${colors.border}`}>
            {status}
          </span>
          {isOverdue && (
            <span className="text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-400/20">
              OVERDUE
            </span>
          )}
        </div>
        {dueStr && (
          <span className="text-xs text-text-tertiary flex items-center gap-1">
            <Clock className="w-3 h-3" /> Due {dueStr}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-4 text-xs text-text-tertiary">
        <span className="tabular-nums">{fmtLob(loan.principal)} LOB principal</span>
        <span className="tabular-nums">{fmtLob(loan.interestAmount)} LOB interest</span>
        {loan.collateralAmount > 0 && (
          <span className="tabular-nums">{fmtLob(loan.collateralAmount)} LOB collateral</span>
        )}
        <span className="tabular-nums">{LOAN_TERMS[loan.term]?.label ?? "?"} term</span>
        {!isBorrower && (
          <span className="text-[10px] text-text-tertiary font-mono">
            Borrower: {loan.borrower.slice(0, 6)}...{loan.borrower.slice(-4)}
          </span>
        )}
      </div>

      {/* Repayment progress for active loans */}
      {isActive && (
        <div className="mt-3">
          <div className="flex justify-between items-center mb-1">
            <span className="text-[10px] text-text-tertiary">Repayment progress</span>
            <span className="text-[10px] text-text-secondary tabular-nums">
              {fmtLob(loan.totalRepaid)} / {fmtLob(totalDue)} LOB
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-lob-green"
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(100, repaidPct)}%` }}
              transition={{ duration: 0.8, ease }}
            />
          </div>
          <p className="text-[10px] text-text-tertiary mt-1 tabular-nums">
            {fmtLob(outstandingAmt)} LOB remaining
          </p>
        </div>
      )}

      {/* Action buttons */}
      <div className="mt-3 space-y-2">
        {/* Borrower: Cancel button on requested loans */}
        {isRequested && isBorrower && (
          <motion.button
            className="btn-secondary text-xs w-full"
            whileTap={{ scale: 0.97 }}
            onClick={() => cancelLoan(loanId)}
          >
            Cancel Request
          </motion.button>
        )}

        {/* Lender: Fund button on requested loans (non-borrower) */}
        {isRequested && !isBorrower && (
          <motion.button
            className="btn-primary text-xs w-full disabled:opacity-50"
            whileTap={fundPending ? undefined : { scale: 0.97 }}
            disabled={fundPending || txStep !== "idle"}
            onClick={handleFund}
          >
            {txStep === "approving" ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="w-3 h-3 animate-spin" /> Approving...
              </span>
            ) : txStep === "executing" ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="w-3 h-3 animate-spin" /> Funding...
              </span>
            ) : (
              <span className="flex items-center justify-center gap-1">
                <DollarSign className="w-3 h-3" /> Fund Loan ({fmtLob(loan.principal)} LOB)
              </span>
            )}
          </motion.button>
        )}

        {/* Borrower: Repay button on active loans */}
        {isActive && isBorrower && (
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="number"
              value={repayAmount}
              onChange={(e) => setRepayAmount(e.target.value)}
              placeholder={`Repay up to ${fmtLob(outstandingAmt)} LOB`}
              className="input-field flex-1 tabular-nums text-xs"
            />
            <div className="flex gap-1">
              <motion.button
                className="text-[10px] text-lob-green hover:text-lob-green-light px-2 py-1"
                onClick={() => setRepayAmount(formatEther(outstandingAmt))}
              >
                MAX
              </motion.button>
              <motion.button
                className="btn-primary text-xs disabled:opacity-50"
                whileTap={repayPending ? undefined : { scale: 0.97 }}
                disabled={repayPending || !repayAmount || txStep !== "idle"}
                onClick={handleRepay}
              >
                {txStep === "approving" ? (
                  <span className="flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" /> Approving...
                  </span>
                ) : txStep === "executing" ? (
                  <span className="flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" /> Repaying...
                  </span>
                ) : "Repay"}
              </motion.button>
            </div>
          </div>
        )}

        {/* Anyone: Liquidate button on overdue loans */}
        {isOverdue && (
          <motion.button
            className="text-xs w-full rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-red-400 hover:bg-red-500/10 transition-colors"
            whileTap={{ scale: 0.97 }}
            onClick={() => liquidateLoan(loanId)}
          >
            <span className="flex items-center justify-center gap-1">
              <AlertTriangle className="w-3 h-3" /> Liquidate (Grace Period Expired)
            </span>
          </motion.button>
        )}
      </div>
    </motion.div>
  );
}

/* ──── Loan Status Distribution Chart ──── */
const DONUT_COLORS: Record<string, string> = {
  active: "#3B82F6",
  requested: "#F0B90B",
  repaid: "#58B059",
  liquidated: "#EF4444",
  cancelled: "#5E6673",
};

function LoanStatusDonut({ loanIds, address }: { loanIds: bigint[]; address: Address }) {
  // We compute a summary from how many loans exist -- for display,
  // we show based on the count of ids (all are active/requested from the contract view)
  // But for a meaningful distribution we use sample data + real count
  const total = loanIds.length;
  if (total === 0) return null;

  // Since useActiveLoanIds returns active loan IDs, show them as active
  const data = [
    { name: "Active", value: total, color: DONUT_COLORS.active },
  ];

  return (
    <motion.div
      className="card p-4"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease }}
    >
      <h4 className="text-[10px] font-semibold text-text-primary uppercase tracking-wider mb-2">
        Loan Status
      </h4>
      <div className="flex items-center gap-3">
        <div className="w-[80px] h-[80px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={22}
                outerRadius={36}
                dataKey="value"
                stroke="none"
              >
                {data.map((entry, idx) => (
                  <Cell key={idx} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ background: "#1E2431", border: "1px solid #2A3142", borderRadius: "8px", fontSize: "10px" }}
                itemStyle={{ color: "#EAECEF" }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="space-y-1">
          {data.map((d) => (
            <div key={d.name} className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
              <span className="text-[10px] text-text-secondary">{d.name}</span>
              <span className="text-[10px] text-text-tertiary tabular-nums ml-auto">{d.value}</span>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

/* ──── Interest Rate Gauge ──── */
function InterestRateGauge({ currentRate, tierName }: { currentRate: string; tierName: string | null }) {
  const maxRate = 10; // 10% max APR
  const numRate = parseFloat(currentRate) || 0;
  const pct = Math.min(100, (numRate / maxRate) * 100);
  const barColor = numRate <= 3 ? "#58B059" : numRate <= 5 ? "#F0B90B" : "#EF4444";

  return (
    <motion.div
      className="card p-4"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.1, ease }}
    >
      <h4 className="text-[10px] font-semibold text-text-primary uppercase tracking-wider mb-2">
        Interest Rate
      </h4>
      <div className="flex items-baseline gap-1 mb-2">
        <span className="text-lg font-bold tabular-nums" style={{ color: barColor }}>
          {currentRate}
        </span>
        <span className="text-[10px] text-text-tertiary">APR</span>
      </div>
      <div className="h-2 rounded-full bg-surface-2 overflow-hidden relative">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: barColor }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease }}
        />
      </div>
      <div className="flex justify-between mt-1">
        <span className="text-[9px] text-text-tertiary">0%</span>
        <span className="text-[9px] text-text-tertiary">{maxRate}% max</span>
      </div>
    </motion.div>
  );
}

/* ──── Active Loans List ──── */
function ActiveLoansList({ address }: { address: Address }) {
  const { data: loanIds } = useActiveLoanIds(address);

  const ids = loanIds ?? [];

  if (ids.length === 0) {
    return (
      <div className="card text-center py-12 px-4">
        <motion.div
          className="w-12 h-12 rounded-xl border border-border/60 mx-auto mb-4 flex items-center justify-center"
          animate={{
            borderColor: [
              "rgba(30,36,49,0.6)",
              "rgba(88,176,89,0.2)",
              "rgba(30,36,49,0.6)",
            ],
          }}
          transition={{ duration: 4, repeat: Infinity }}
        >
          <Banknote className="w-5 h-5 text-text-tertiary" />
        </motion.div>
        <p className="text-sm font-medium text-text-secondary">No active loans</p>
        <p className="text-xs text-text-tertiary mt-1 max-w-xs mx-auto">
          Request a loan above to get started. Lenders on the protocol can fund your request within 7 days.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {ids.map((id) => (
        <LoanCard key={id.toString()} loanId={BigInt(id)} userAddress={address} />
      ))}
    </div>
  );
}

/* ──── Request Loan Form ──── */
function RequestLoanForm({ userTier, address }: { userTier: string | null; address: Address }) {
  const [amount, setAmount] = useState("");
  const [selectedTerm, setSelectedTerm] = useState<number>(2); // ThirtyDays enum
  const [showConfirm, setShowConfirm] = useState(false);
  const [txStep, setTxStep] = useState<"idle" | "approving" | "executing">("idle");

  const contracts = getContracts(CHAIN.id);
  const { fn: requestLoan, isPending: requestPending, isError: requestError, error: requestErrorObj, reset: requestReset } = useRequestLoan();
  const approveToken = useApproveToken();

  const tierConfig = TIER_CONFIG.find((t) => t.name === userTier);
  const maxBorrow = tierConfig ? parseFloat(tierConfig.maxBorrow.replace(/,/g, "")) : 0;
  const aprNum = tierConfig?.aprNum ?? 0;
  const collateralPct = tierConfig?.collateralNum ?? 0;
  const termDays = LOAN_TERMS[selectedTerm]?.value ?? 30;

  const parsedAmount = parseFloat(amount) || 0;
  const exceedsMax = parsedAmount > maxBorrow;

  // Simple interest prorated by term: principal * rate * (days / 365)
  const interestAmount = (parsedAmount * aprNum * termDays) / (100 * 365);
  const protocolFee = parsedAmount * 0.005;
  const collateralRequired = (parsedAmount * collateralPct) / 100;
  const totalRepayment = parsedAmount + interestAmount + protocolFee;

  const canSubmit = parsedAmount > 0 && !exceedsMax && userTier !== null;

  const handleRequestLoan = async () => {
    if (!contracts || !canSubmit) return;
    requestReset();
    setTxStep("idle");

    try {
      // If collateral required, approve LOB first
      if (collateralRequired > 0) {
        setTxStep("approving");
        const collateralWei = parseEther(collateralRequired.toString());
        await approveToken(contracts.lobToken, contracts.loanEngine, collateralWei);
      }

      setTxStep("executing");
      const principalWei = parseEther(parsedAmount.toString());
      await requestLoan(principalWei, selectedTerm);

      setShowConfirm(false);
      setAmount("");
      setTxStep("idle");
    } catch {
      setTxStep("idle");
    }
  };

  return (
    <div className="card p-3 sm:p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[10px] sm:text-xs font-semibold text-text-primary uppercase tracking-wider">
          Request a Loan
        </h3>
        {userTier && (
          <span
            className="text-[10px] font-medium px-2 py-0.5 rounded"
            style={{
              color: tierConfig?.color,
              backgroundColor: `${tierConfig?.color}15`,
              border: `1px solid ${tierConfig?.color}25`,
            }}
          >
            {userTier} Tier
          </span>
        )}
      </div>

      {!userTier ? (
        <div className="rounded-lg border border-border/40 bg-surface-1/30 p-4 text-center">
          <AlertTriangle className="w-5 h-5 text-lob-yellow mx-auto mb-2" />
          <p className="text-xs text-text-secondary">
            Silver+ reputation tier required to borrow.
          </p>
          <p className="text-[10px] text-text-tertiary mt-1">
            Complete jobs and build reputation to unlock borrowing.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Amount input */}
          <div>
            <label className="block text-[10px] font-medium text-text-tertiary uppercase tracking-wider mb-1.5">
              Borrow Amount (LOB)
            </label>
            <div className="relative">
              <input
                type="number"
                value={amount}
                onChange={(e) => { setAmount(e.target.value); setShowConfirm(false); }}
                placeholder={`Max ${tierConfig?.maxBorrow} LOB`}
                className="input-field w-full tabular-nums pr-16"
              />
              <button
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-lob-green hover:text-lob-green-light transition-colors"
                onClick={() => setAmount(String(maxBorrow))}
              >
                MAX
              </button>
            </div>
            {exceedsMax && (
              <p className="text-[10px] text-red-400 mt-1 flex items-center gap-1">
                <XCircle className="w-3 h-3" />
                Exceeds {userTier} tier max of {tierConfig?.maxBorrow} LOB
              </p>
            )}
          </div>

          {/* Term selector */}
          <div>
            <label className="block text-[10px] font-medium text-text-tertiary uppercase tracking-wider mb-1.5">
              Loan Term
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {LOAN_TERMS.map((term) => (
                <motion.button
                  key={term.enumVal}
                  className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                    selectedTerm === term.enumVal
                      ? "border-lob-green/40 bg-lob-green/[0.06] text-lob-green"
                      : "border-border bg-surface-2 text-text-secondary hover:border-border-hover"
                  }`}
                  onClick={() => { setSelectedTerm(term.enumVal); setShowConfirm(false); }}
                  whileTap={{ scale: 0.97 }}
                >
                  {term.label}
                </motion.button>
              ))}
            </div>
          </div>

          {/* Calculated preview */}
          {parsedAmount > 0 && !exceedsMax && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="rounded-lg border border-border/40 bg-surface-1/30 p-4 space-y-2"
            >
              <p className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mb-2">
                Loan Preview
              </p>
              <div className="flex justify-between">
                <span className="text-[10px] text-text-tertiary flex items-center gap-1">
                  <Coins className="w-3 h-3" /> Principal
                </span>
                <span className="text-xs text-text-primary font-medium tabular-nums">
                  {parsedAmount.toLocaleString()} LOB
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[10px] text-text-tertiary flex items-center gap-1">
                  <Percent className="w-3 h-3" /> Interest ({aprNum}% APR x {termDays}d)
                </span>
                <span className="text-xs text-text-secondary font-medium tabular-nums">
                  {interestAmount.toFixed(2)} LOB
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[10px] text-text-tertiary flex items-center gap-1">
                  <Banknote className="w-3 h-3" /> Protocol Fee (0.5%)
                </span>
                <span className="text-xs text-text-secondary font-medium tabular-nums">
                  {protocolFee.toFixed(2)} LOB
                </span>
              </div>
              {collateralRequired > 0 && (
                <div className="flex justify-between">
                  <span className="text-[10px] text-text-tertiary flex items-center gap-1">
                    <Lock className="w-3 h-3" /> Collateral ({collateralPct}%)
                  </span>
                  <span className="text-xs text-lob-yellow font-medium tabular-nums">
                    {collateralRequired.toLocaleString()} LOB
                  </span>
                </div>
              )}
              <div className="border-t border-border/30 pt-2 mt-2 flex justify-between">
                <span className="text-[10px] text-text-primary font-semibold">Total Repayment</span>
                <span className="text-xs text-lob-green font-bold tabular-nums">
                  {totalRepayment.toFixed(2)} LOB
                </span>
              </div>
              {collateralRequired > 0 && (
                <p className="text-[10px] text-text-tertiary">
                  Collateral of {collateralRequired.toLocaleString()} LOB will be locked on request and returned upon full repayment.
                </p>
              )}
              {collateralRequired === 0 && (
                <p className="text-[10px] text-lob-green/70">
                  Platinum tier: no collateral required. Loan is fully reputation-backed.
                </p>
              )}
            </motion.div>
          )}

          {/* Submit */}
          <AnimatePresence>
            {!showConfirm ? (
              <motion.button
                key="request"
                className="btn-primary w-full disabled:opacity-50"
                disabled={!canSubmit}
                onClick={() => setShowConfirm(true)}
                whileHover={canSubmit ? { boxShadow: "inset 0 1px 0 rgba(88,176,89,0.12), 0 4px 16px rgba(88,176,89,0.08)" } : undefined}
                whileTap={canSubmit ? { scale: 0.97 } : undefined}
              >
                Request Loan
              </motion.button>
            ) : (
              <motion.div
                key="confirm"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="space-y-2"
              >
                <div className="rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2">
                  <p className="text-[10px] text-amber-400 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                    {collateralRequired > 0
                      ? `This will lock ${collateralRequired.toLocaleString()} LOB as collateral. Failure to repay means liquidation.`
                      : `This loan is reputation-backed. Default will result in -200 rep and borrowing restriction.`}
                  </p>
                </div>
                <div className="flex gap-2">
                  <motion.button
                    className="btn-primary flex-1 disabled:opacity-50"
                    whileTap={requestPending ? undefined : { scale: 0.97 }}
                    disabled={requestPending || txStep !== "idle"}
                    onClick={handleRequestLoan}
                  >
                    {txStep === "approving" ? (
                      <span className="flex items-center justify-center gap-2">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Approving Collateral...
                      </span>
                    ) : txStep === "executing" ? (
                      <span className="flex items-center justify-center gap-2">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Requesting Loan...
                      </span>
                    ) : "Confirm Request"}
                  </motion.button>
                  <motion.button
                    className="btn-secondary"
                    whileTap={{ scale: 0.97 }}
                    onClick={() => setShowConfirm(false)}
                  >
                    Cancel
                  </motion.button>
                </div>
                {requestError && (
                  <p className="text-[10px] text-red-400 mt-1">
                    {requestErrorObj?.message?.includes("User rejected")
                      ? "Transaction rejected in wallet"
                      : "Request failed. Please try again."}
                  </p>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

/* ──── Main Page ──── */
export default function LoansPage() {
  const { isConnected, address } = useAccount();
  const contracts = getContracts(CHAIN.id);

  // Contract reads
  const { data: borrowerProfile } = useBorrowerProfile(address);
  const { data: maxBorrowRaw } = useMaxBorrow(address);
  const { data: interestRateRaw } = useInterestRate(address);
  const { data: loanIds } = useActiveLoanIds(address);

  // Derive tier name from StakingManager tier
  // Reputation tier for loan eligibility: Silver=2, Gold=3, Platinum=4
  // But we map from the reputation tier, not staking tier. The LoanEngine checks reputation.
  // For display, we use a heuristic: if maxBorrow > 0, user is eligible
  const hasContracts = !!contracts;

  // Compute user tier from contract data (maxBorrow tells us the tier)
  const userTier = useMemo(() => {
    if (!hasContracts) return "Silver"; // fallback for mock display
    if (maxBorrowRaw === undefined) return null;
    const mb = maxBorrowRaw as bigint;
    if (mb >= parseEther("25000")) return "Platinum";
    if (mb >= parseEther("5000")) return "Gold";
    if (mb >= parseEther("500")) return "Silver";
    return null;
  }, [hasContracts, maxBorrowRaw]);

  // Formatted values
  const maxBorrow = useMemo(() => {
    if (!hasContracts) return "500"; // fallback
    if (maxBorrowRaw === undefined) return "0";
    return fmtLob(maxBorrowRaw as bigint);
  }, [hasContracts, maxBorrowRaw]);

  const interestRate = useMemo(() => {
    if (!hasContracts) return "8%"; // fallback
    if (interestRateRaw === undefined) return "--";
    const bps = Number(interestRateRaw as bigint);
    return `${(bps / 100).toFixed(0)}%`;
  }, [hasContracts, interestRateRaw]);

  const activeLoansCount = useMemo(() => {
    if (!hasContracts) return 0;
    if (borrowerProfile) return Number((borrowerProfile as any).activeLoans ?? 0);
    return loanIds ? (loanIds as bigint[]).length : 0;
  }, [hasContracts, borrowerProfile, loanIds]);

  const defaultCount = useMemo(() => {
    if (!hasContracts) return 0;
    if (borrowerProfile) return Number((borrowerProfile as any).defaults ?? 0);
    return 0;
  }, [hasContracts, borrowerProfile]);

  const totalBorrowed = useMemo(() => {
    if (!hasContracts) return "0";
    if (borrowerProfile) return fmtLob((borrowerProfile as any).totalBorrowed ?? BigInt(0));
    return "0";
  }, [hasContracts, borrowerProfile]);

  const totalRepaid = useMemo(() => {
    if (!hasContracts) return "0";
    if (borrowerProfile) return fmtLob((borrowerProfile as any).totalRepaid ?? BigInt(0));
    return "0";
  }, [hasContracts, borrowerProfile]);

  const isRestricted = useMemo(() => {
    if (!hasContracts) return false;
    if (borrowerProfile) return (borrowerProfile as any).restricted ?? false;
    return false;
  }, [hasContracts, borrowerProfile]);

  const STATS = [
    {
      label: "Reputation Tier",
      value: userTier ?? "Below Silver",
      highlight: userTier !== null,
      icon: Shield,
      color: TIER_CONFIG.find((t) => t.name === userTier)?.color ?? "#5E6673",
    },
    {
      label: "Max Borrow",
      value: userTier ? `${maxBorrow}` : "0",
      sub: "LOB",
      highlight: false,
      icon: Banknote,
      color: "#3B82F6",
    },
    {
      label: "Interest Rate",
      value: userTier ? interestRate : "--",
      sub: "APR",
      highlight: false,
      icon: Percent,
      color: "#A855F7",
    },
    {
      label: "Active Loans",
      value: String(activeLoansCount),
      sub: "/ 3 max",
      highlight: false,
      icon: TrendingUp,
      color: "#58B059",
    },
  ];

  if (!isConnected) {
    return (
      <motion.div
        className="flex flex-col items-center justify-center min-h-[50vh] gap-4"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <motion.div
          className="w-16 h-16 rounded-lg border border-border flex items-center justify-center"
          animate={{
            borderColor: [
              "rgba(30,36,49,1)",
              "rgba(88,176,89,0.3)",
              "rgba(30,36,49,1)",
            ],
          }}
          transition={{ duration: 3, repeat: Infinity }}
        >
          <Banknote className="w-6 h-6 text-lob-green/60" />
        </motion.div>
        <h1 className="text-xl font-bold text-text-primary">Loans</h1>
        <p className="text-sm text-text-secondary">Connect your wallet to access reputation-based lending.</p>
        <ConnectButton />
      </motion.div>
    );
  }

  return (
    <motion.div initial="hidden" animate="show" variants={stagger}>
      {/* Header */}
      <motion.div variants={fadeUp} className="mb-6">
        <h1 className="text-xl font-bold text-text-primary">Loans</h1>
        <p className="text-xs text-text-tertiary mt-0.5">
          Reputation-based lending powered by the LoanEngine contract
        </p>
      </motion.div>

      {/* Stats grid */}
      <motion.div variants={fadeUp} className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {STATS.map((stat, i) => {
          const Icon = stat.icon;
          return (
            <motion.div
              key={stat.label}
              className="card p-4 relative overflow-hidden group"
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.1 + i * 0.06, ease }}
              whileHover={{ y: -2, borderColor: "rgba(88,176,89,0.2)" }}
            >
              <motion.div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-lob-green/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <Icon className="w-4 h-4 mb-2" style={{ color: stat.color }} />
              <p className="text-[10px] text-text-tertiary uppercase tracking-wider">{stat.label}</p>
              <div className="flex items-baseline gap-1 mt-1">
                <p className={`text-xl font-bold tabular-nums ${stat.highlight ? "text-lob-green" : "text-text-primary"}`}>
                  {stat.value}
                </p>
                {"sub" in stat && stat.sub && <span className="text-xs text-text-tertiary">{stat.sub}</span>}
              </div>
            </motion.div>
          );
        })}
      </motion.div>

      {/* Loan Visualizations */}
      <motion.div variants={fadeUp} className="grid grid-cols-2 gap-3 mb-6">
        {loanIds && (loanIds as bigint[]).length > 0 && (
          <LoanStatusDonut loanIds={loanIds as bigint[]} address={address!} />
        )}
        <InterestRateGauge currentRate={interestRate} tierName={userTier} />
      </motion.div>

      {/* How It Works */}
      <motion.div variants={fadeUp} className="mb-6">
        <LoanFlow />
      </motion.div>

      {/* Loan Tier Cards */}
      <motion.div variants={fadeUp} className="mb-6">
        <LoanTierCards />
      </motion.div>

      {/* Request Loan + Active Loans in 2-col layout */}
      <motion.div variants={fadeUp} className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <RequestLoanForm userTier={userTier} address={address!} />
        <div>
          <h3 className="text-[10px] sm:text-xs font-semibold text-text-primary uppercase tracking-wider mb-3">
            Your Loans
          </h3>
          <ActiveLoansList address={address!} />
        </div>
      </motion.div>

      {/* Borrower profile info */}
      <motion.div variants={fadeUp} className="mb-6">
        <div className="card p-3 sm:p-5">
          <h3 className="text-[10px] sm:text-xs font-semibold text-text-primary uppercase tracking-wider mb-4">
            Borrower Profile
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            <div>
              <p className="text-[10px] text-text-tertiary uppercase tracking-wider">Total Borrowed</p>
              <p className="text-sm font-bold text-text-primary mt-0.5 tabular-nums">{totalBorrowed} LOB</p>
            </div>
            <div>
              <p className="text-[10px] text-text-tertiary uppercase tracking-wider">Total Repaid</p>
              <p className="text-sm font-bold text-text-primary mt-0.5 tabular-nums">{totalRepaid} LOB</p>
            </div>
            <div>
              <p className="text-[10px] text-text-tertiary uppercase tracking-wider">Active Loans</p>
              <p className="text-sm font-bold text-text-primary mt-0.5 tabular-nums">{activeLoansCount} / 3</p>
            </div>
            <div>
              <p className="text-[10px] text-text-tertiary uppercase tracking-wider">Defaults</p>
              <p className={`text-sm font-bold mt-0.5 tabular-nums ${defaultCount > 0 ? "text-red-400" : "text-text-primary"}`}>
                {defaultCount}
                {defaultCount >= 2 && (
                  <span className="text-[10px] text-red-400 ml-1">RESTRICTED</span>
                )}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-text-tertiary uppercase tracking-wider">Status</p>
              <p className="text-sm font-bold mt-0.5 flex items-center gap-1">
                {isRestricted || defaultCount >= 2 ? (
                  <span className="text-red-400 flex items-center gap-1">
                    <XCircle className="w-3.5 h-3.5" /> Restricted
                  </span>
                ) : (
                  <span className="text-lob-green flex items-center gap-1">
                    <Zap className="w-3.5 h-3.5" /> Good Standing
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Key Mechanics Footer */}
      <motion.div variants={fadeUp} className="mt-8">
        <div className="card p-3 sm:p-5">
          <h3 className="text-[10px] sm:text-xs font-semibold text-text-primary uppercase tracking-wider mb-4">
            Key Mechanics
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              {
                title: "Reputation-Gated",
                desc: "Silver+ reputation tier required. Higher tiers unlock larger loans, lower rates, and reduced collateral.",
                icon: Shield,
                color: "#848E9C",
              },
              {
                title: "Grace Period",
                desc: "48-hour grace period after due date before liquidation. Repay during grace to avoid penalties.",
                icon: Timer,
                color: "#F59E0B",
              },
              {
                title: "Liquidation",
                desc: "Collateral seized, stake slashed, and -200 reputation. 2 defaults = permanently restricted from borrowing.",
                icon: AlertTriangle,
                color: "#EF4444",
              },
              {
                title: "Protocol Fee",
                desc: "0.5% fee on principal goes to treasury. Interest goes to the lender. Max 3 active loans per borrower.",
                icon: TrendingUp,
                color: "#58B059",
              },
            ].map((item, i) => {
              const Icon = item.icon;
              return (
                <motion.div
                  key={item.title}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 + i * 0.08 }}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <Icon className="w-3.5 h-3.5" style={{ color: item.color }} />
                    <p className="text-xs font-semibold text-text-primary">{item.title}</p>
                  </div>
                  <p className="text-[10px] text-text-tertiary leading-relaxed">{item.desc}</p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
