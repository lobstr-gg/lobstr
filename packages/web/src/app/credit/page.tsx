"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { formatEther, parseEther, type Address } from "viem";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { motion, AnimatePresence } from "framer-motion";
import { stagger, fadeUp, ease } from "@/lib/motion";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import {
  useCreditLine,
  useCreditDraw,
  useActiveDrawIds,
  useAvailableCredit,
  usePoolUtilization,
  useOpenCreditLine,
  useCloseCreditLine,
  useDrawCreditAndCreateEscrow,
  useRepayDraw,
  useCreditConfirmDelivery,
  useCreditInitiateDispute,
  useCreditClaimEscrowRefund,
  useLiquidateDraw,
  useDepositToCreditPool,
  useWithdrawFromCreditPool,
  useStakeTier,
  useLOBBalance,
  useApproveToken,
} from "@/lib/hooks";
import { InfoButton } from "@/components/InfoButton";
import { getContracts, CHAIN } from "@/config/contracts";
import {
  CreditCard,
  CheckCircle2,
  AlertTriangle,
  Wallet,
  Zap,
  Lock,
  Loader2,
  Shield,
  BarChart3,
  ArrowDownCircle,
  ArrowUpCircle,
  FileWarning,
  Banknote,
} from "lucide-react";

/* ──── Types ──── */

interface CreditLineData {
  agent: Address;
  creditLimit: bigint;
  totalDrawn: bigint;
  totalRepaid: bigint;
  interestRateBps: bigint;
  collateralDeposited: bigint;
  status: number;
  openedAt: bigint;
  defaults: bigint;
  activeDraws: bigint;
}

interface CreditDrawData {
  id: bigint;
  creditLineId: bigint;
  agent: Address;
  amount: bigint;
  interestAccrued: bigint;
  protocolFee: bigint;
  escrowJobId: bigint;
  drawnAt: bigint;
  repaidAt: bigint;
  liquidated: boolean;
  refundCredit: bigint;
}

/* ──── Constants ──── */

// CreditLineStatus enum: 0=None, 1=Active, 2=Frozen, 3=Closed
const STATUS_LABELS: Record<number, string> = {
  0: "None",
  1: "Active",
  2: "Frozen",
  3: "Closed",
};

const STATUS_COLORS: Record<number, { bg: string; text: string; border: string }> = {
  0: { bg: "bg-gray-500/10", text: "text-gray-400", border: "border-gray-400/20" },
  1: { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-400/20" },
  2: { bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-400/20" },
  3: { bg: "bg-red-500/10", text: "text-red-400", border: "border-red-400/20" },
};

const TIER_CONFIG = [
  {
    name: "Silver",
    creditLimit: "500",
    apr: "8%",
    aprBps: 800,
    collateral: "50%",
    collateralBps: 5000,
    color: "#848E9C",
    desc: "Entry-level credit for established agents",
  },
  {
    name: "Gold",
    creditLimit: "5,000",
    apr: "5%",
    aprBps: 500,
    collateral: "25%",
    collateralBps: 2500,
    color: "#F0B90B",
    desc: "Reduced rates and collateral for trusted agents",
  },
  {
    name: "Platinum",
    creditLimit: "25,000",
    apr: "3%",
    aprBps: 300,
    collateral: "0%",
    collateralBps: 0,
    color: "#58B059",
    desc: "Reputation-backed credit with zero collateral",
  },
];

const REPAYMENT_DEADLINE_DAYS = 30;
const GRACE_PERIOD_HOURS = 48;
const MAX_DRAWS = 5;
const PROTOCOL_FEE_BPS = 50; // 0.5%

/* ──── Helpers ──── */

const fmtLob = (val: bigint) => {
  const raw = formatEther(val);
  const num = parseFloat(raw);
  return num.toLocaleString("en-US", { maximumFractionDigits: 2 });
};

const fmtDate = (ts: bigint) => {
  if (ts === BigInt(0)) return "--";
  return new Date(Number(ts) * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const getDueDate = (drawnAt: bigint) => {
  if (drawnAt === BigInt(0)) return "--";
  const dueTs = Number(drawnAt) + REPAYMENT_DEADLINE_DAYS * 86400;
  return new Date(dueTs * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const isOverdue = (drawnAt: bigint) => {
  if (drawnAt === BigInt(0)) return false;
  const dueTs = Number(drawnAt) + REPAYMENT_DEADLINE_DAYS * 86400 + GRACE_PERIOD_HOURS * 3600;
  return Date.now() / 1000 > dueTs;
};

const getDrawStatus = (draw: CreditDrawData) => {
  if (draw.liquidated) return { label: "Liquidated", color: "text-red-400", bg: "bg-red-500/10" };
  if (draw.repaidAt > BigInt(0)) return { label: "Repaid", color: "text-emerald-400", bg: "bg-emerald-500/10" };
  if (isOverdue(draw.drawnAt)) return { label: "Overdue", color: "text-amber-400", bg: "bg-amber-500/10" };
  return { label: "Active", color: "text-blue-400", bg: "bg-blue-500/10" };
};

/* ──── Active Draw Row Component ──── */

function DrawRow({
  drawId,
  address,
}: {
  drawId: bigint;
  address: Address;
}) {
  const { data: drawData } = useCreditDraw(drawId);
  const repay = useRepayDraw();
  const confirmDelivery = useCreditConfirmDelivery();
  const claimRefund = useCreditClaimEscrowRefund();
  const liquidate = useLiquidateDraw();
  const [disputeURI, setDisputeURI] = useState("");
  const [showDispute, setShowDispute] = useState(false);
  const dispute = useCreditInitiateDispute();

  const draw = drawData as CreditDrawData | undefined;
  if (!draw) {
    return (
      <div className="rounded-lg border border-border/30 bg-surface-1/20 px-4 py-3 animate-pulse">
        <div className="h-4 bg-surface-2 rounded w-1/3" />
      </div>
    );
  }

  const status = getDrawStatus(draw);
  const isActive = draw.repaidAt === BigInt(0) && !draw.liquidated;

  return (
    <motion.div
      className="rounded-lg border border-border/30 bg-surface-1/20 p-4"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold text-text-primary tabular-nums">Draw #{draw.id.toString()}</span>
          <span className={`text-[10px] font-medium px-2 py-0.5 rounded ${status.bg} ${status.color}`}>
            {status.label}
          </span>
        </div>
        <span className="text-[10px] text-text-tertiary">
          Escrow Job #{draw.escrowJobId.toString()}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
        <div>
          <p className="text-[10px] text-text-tertiary uppercase tracking-wider">Amount</p>
          <p className="text-sm font-bold text-text-primary tabular-nums">{fmtLob(draw.amount)} LOB</p>
        </div>
        <div>
          <p className="text-[10px] text-text-tertiary uppercase tracking-wider">Interest</p>
          <p className="text-sm font-bold text-text-primary tabular-nums">{fmtLob(draw.interestAccrued)} LOB</p>
        </div>
        <div>
          <p className="text-[10px] text-text-tertiary uppercase tracking-wider">Protocol Fee</p>
          <p className="text-sm font-bold text-text-primary tabular-nums">{fmtLob(draw.protocolFee)} LOB</p>
        </div>
        <div>
          <p className="text-[10px] text-text-tertiary uppercase tracking-wider">Due Date</p>
          <p className={`text-sm font-bold tabular-nums ${isOverdue(draw.drawnAt) ? "text-red-400" : "text-text-primary"}`}>
            {getDueDate(draw.drawnAt)}
          </p>
        </div>
      </div>

      {draw.refundCredit > BigInt(0) && (
        <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 mb-3">
          <p className="text-[10px] text-emerald-400">
            Refund Credit: {fmtLob(draw.refundCredit)} LOB (deducted from repayment)
          </p>
        </div>
      )}

      {isActive && (
        <div className="flex flex-wrap gap-2 pt-2 border-t border-border/30">
          <motion.button
            className="btn-primary text-[10px] px-3 py-1.5 disabled:opacity-50"
            whileTap={{ scale: 0.97 }}
            disabled={repay.isPending}
            onClick={async () => {
              repay.reset();
              try {
                await repay.fn(draw.id);
              } catch { /* handled by hook */ }
            }}
          >
            {repay.isPending ? (
              <span className="flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Repaying...</span>
            ) : "Repay Draw"}
          </motion.button>
          <motion.button
            className="btn-secondary text-[10px] px-3 py-1.5"
            whileTap={{ scale: 0.97 }}
            onClick={() => confirmDelivery(draw.escrowJobId)}
          >
            Confirm Delivery
          </motion.button>
          <motion.button
            className="btn-secondary text-[10px] px-3 py-1.5"
            whileTap={{ scale: 0.97 }}
            onClick={async () => {
              claimRefund.reset();
              try {
                await claimRefund.fn(draw.escrowJobId);
              } catch { /* handled by hook */ }
            }}
            disabled={claimRefund.isPending}
          >
            {claimRefund.isPending ? "Claiming..." : "Claim Refund"}
          </motion.button>
          <motion.button
            className="text-[10px] px-3 py-1.5 text-amber-400 border border-amber-400/20 rounded-md hover:bg-amber-500/10 transition-colors"
            whileTap={{ scale: 0.97 }}
            onClick={() => setShowDispute(!showDispute)}
          >
            Dispute
          </motion.button>
          {isOverdue(draw.drawnAt) && (
            <motion.button
              className="text-[10px] px-3 py-1.5 text-red-400 border border-red-400/20 rounded-md hover:bg-red-500/10 transition-colors disabled:opacity-50"
              whileTap={{ scale: 0.97 }}
              disabled={liquidate.isPending}
              onClick={async () => {
                liquidate.reset();
                try {
                  await liquidate.fn(draw.id);
                } catch { /* handled by hook */ }
              }}
            >
              {liquidate.isPending ? "Liquidating..." : "Liquidate"}
            </motion.button>
          )}
        </div>
      )}

      {/* Dispute form */}
      <AnimatePresence>
        {showDispute && isActive && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="pt-3 mt-3 border-t border-border/30 space-y-2">
              <input
                type="text"
                value={disputeURI}
                onChange={(e) => setDisputeURI(e.target.value)}
                placeholder="Evidence URI (e.g. ipfs://...)"
                className="input-field text-xs w-full"
              />
              <motion.button
                className="btn-primary text-[10px] px-3 py-1.5 disabled:opacity-50"
                whileTap={{ scale: 0.97 }}
                disabled={dispute.isPending || !disputeURI}
                onClick={async () => {
                  dispute.reset();
                  try {
                    await dispute.fn(draw.escrowJobId, disputeURI);
                    setShowDispute(false);
                    setDisputeURI("");
                  } catch { /* handled by hook */ }
                }}
              >
                {dispute.isPending ? (
                  <span className="flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Submitting...</span>
                ) : "Submit Dispute"}
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {repay.isError && (
        <p className="text-[10px] text-red-400 mt-2">Repayment failed. Check your LOB balance and try again.</p>
      )}
    </motion.div>
  );
}

/* ──── Pool Utilization Radial Chart ──── */
function PoolUtilizationChart({ utilization, poolTotal, poolOutstanding }: { utilization: number; poolTotal: bigint; poolOutstanding: bigint }) {
  const data = [
    { name: "Utilized", value: utilization },
    { name: "Available", value: Math.max(0, 100 - utilization) },
  ];
  const gaugeColor = utilization > 80 ? "#EF4444" : utilization > 50 ? "#F0B90B" : "#58B059";

  return (
    <motion.div
      className="card p-4"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease }}
    >
      <h4 className="text-[10px] font-semibold text-text-primary uppercase tracking-wider mb-2">
        Pool Utilization
      </h4>
      <div className="flex items-center gap-4">
        <div className="w-[90px] h-[90px] relative">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={28}
                outerRadius={40}
                startAngle={90}
                endAngle={-270}
                dataKey="value"
                stroke="none"
              >
                <Cell fill={gaugeColor} />
                <Cell fill="#1E2431" />
              </Pie>
              <Tooltip
                contentStyle={{ background: "#1E2431", border: "1px solid #2A3142", borderRadius: "8px", fontSize: "10px" }}
                itemStyle={{ color: "#EAECEF" }}
                formatter={(value: number | undefined) => `${value ?? 0}%`}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-sm font-bold tabular-nums" style={{ color: gaugeColor }}>
              {utilization}%
            </span>
          </div>
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: gaugeColor }} />
            <span className="text-[10px] text-text-secondary">Outstanding</span>
            <span className="text-[10px] text-text-tertiary tabular-nums">{fmtLob(poolOutstanding)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-surface-2" />
            <span className="text-[10px] text-text-secondary">Available</span>
            <span className="text-[10px] text-text-tertiary tabular-nums">{fmtLob(poolTotal > poolOutstanding ? poolTotal - poolOutstanding : BigInt(0))}</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/* ──── Credit Line Health Gauge ──── */
function CreditLineHealth({ creditLine, availableCredit }: { creditLine: CreditLineData; availableCredit: bigint | undefined }) {
  const limit = creditLine.creditLimit;
  const drawn = creditLine.totalDrawn - creditLine.totalRepaid;
  const drawnPositive = drawn > BigInt(0) ? drawn : BigInt(0);
  const available = availableCredit ?? (limit > drawnPositive ? limit - drawnPositive : BigInt(0));
  const drawnNum = Number(formatEther(drawnPositive));
  const limitNum = Number(formatEther(limit));
  const pct = limitNum > 0 ? Math.min(100, (drawnNum / limitNum) * 100) : 0;

  const data = [
    { name: "Drawn", value: Math.max(1, pct) },
    { name: "Available", value: Math.max(1, 100 - pct) },
  ];

  const healthColor = pct > 80 ? "#EF4444" : pct > 50 ? "#F0B90B" : "#58B059";

  return (
    <motion.div
      className="card p-4"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.05, ease }}
    >
      <h4 className="text-[10px] font-semibold text-text-primary uppercase tracking-wider mb-2">
        Credit Line Health
      </h4>
      <div className="flex items-center gap-4">
        <div className="w-[90px] h-[90px] relative">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={28}
                outerRadius={40}
                startAngle={90}
                endAngle={-270}
                dataKey="value"
                stroke="none"
              >
                <Cell fill={healthColor} />
                <Cell fill="#1E2431" />
              </Pie>
              <Tooltip
                contentStyle={{ background: "#1E2431", border: "1px solid #2A3142", borderRadius: "8px", fontSize: "10px" }}
                itemStyle={{ color: "#EAECEF" }}
                formatter={(value: number | undefined) => `${(value ?? 0).toFixed(0)}%`}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-sm font-bold tabular-nums" style={{ color: healthColor }}>
              {pct.toFixed(0)}%
            </span>
          </div>
        </div>
        <div className="space-y-1.5 flex-1 min-w-0">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-text-tertiary">Drawn</span>
              <span className="text-[10px] text-text-secondary tabular-nums">{fmtLob(drawnPositive)} LOB</span>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-text-tertiary">Available</span>
              <span className="text-[10px] text-lob-green tabular-nums">{fmtLob(available)} LOB</span>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-text-tertiary">Limit</span>
              <span className="text-[10px] text-text-secondary tabular-nums">{fmtLob(limit)} LOB</span>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/* ──── Main Page ──── */

export default function CreditFacilityPage() {
  const { isConnected, address } = useAccount();
  const contracts = getContracts(CHAIN.id);

  // Read hooks
  const { data: creditLineData } = useCreditLine(address);
  const { data: drawIdsData } = useActiveDrawIds(address);
  const { data: availableCreditData } = useAvailableCredit(address);
  const { data: poolData } = usePoolUtilization();
  const { data: tierNum } = useStakeTier(address);
  const { data: lobBalance } = useLOBBalance(address);

  // Write hooks
  const openLine = useOpenCreditLine();
  const closeLine = useCloseCreditLine();
  const drawCredit = useDrawCreditAndCreateEscrow();
  const depositPool = useDepositToCreditPool();
  const withdrawPool = useWithdrawFromCreditPool();
  const approveToken = useApproveToken();

  // Form state
  const [drawListingId, setDrawListingId] = useState("");
  const [drawSeller, setDrawSeller] = useState("");
  const [drawAmount, setDrawAmount] = useState("");
  const [poolDepositAmt, setPoolDepositAmt] = useState("");
  const [poolWithdrawAmt, setPoolWithdrawAmt] = useState("");

  // Derived
  const creditLine = creditLineData as CreditLineData | undefined;
  const drawIds = (drawIdsData as bigint[]) ?? [];
  const availableCredit = availableCreditData as bigint | undefined;
  const currentTier = tierNum !== undefined ? Number(tierNum) : 0;

  const TIER_NAMES = ["None", "Bronze", "Silver", "Gold", "Platinum"];
  const tierName = TIER_NAMES[currentTier] ?? "None";
  const hasActiveLine = creditLine && creditLine.status === 1;
  const hasFrozenLine = creditLine && creditLine.status === 2;
  const hasNoLine = !creditLine || creditLine.status === 0 || creditLine.status === 3;

  // Pool utilization
  const poolTotal = poolData ? (poolData as [bigint, bigint, bigint])[0] : BigInt(0);
  const poolOutstanding = poolData ? (poolData as [bigint, bigint, bigint])[1] : BigInt(0);
  const poolAvailable = poolData ? (poolData as [bigint, bigint, bigint])[2] : BigInt(0);
  const utilizationPct = poolTotal > BigInt(0)
    ? Number((poolOutstanding * BigInt(100)) / poolTotal)
    : 0;

  const lobBalanceFmt = lobBalance !== undefined ? fmtLob(lobBalance as bigint) : "--";

  // Credit tier eligibility: need Silver (tier 2) or higher
  const canOpenLine = currentTier >= 2;

  // Handle approve + open credit line
  const handleOpenCreditLine = async () => {
    if (!contracts || !address) return;
    openLine.reset();
    try {
      // If collateral is needed, approve first
      if (currentTier < 4) {
        // Estimate collateral: we need to let the contract handle this,
        // but for UX we approve a generous amount
        const maxCollateral = parseEther("12500"); // max possible for Gold
        await approveToken(contracts.lobToken, contracts.x402CreditFacility, maxCollateral);
      }
      await openLine.fn();
    } catch {
      // Error handled by hook
    }
  };

  if (!isConnected) {
    return (
      <motion.div
        className="flex flex-col items-center justify-center min-h-[50vh] gap-4"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <motion.div
          className="w-16 h-16 rounded-full border border-border flex items-center justify-center"
          animate={{
            borderColor: ["rgba(30,36,49,1)", "rgba(88,176,89,0.4)", "rgba(30,36,49,1)"],
            boxShadow: [
              "0 0 0 rgba(88,176,89,0)",
              "0 0 30px rgba(88,176,89,0.08)",
              "0 0 0 rgba(88,176,89,0)",
            ],
          }}
          transition={{ duration: 3, repeat: Infinity }}
        >
          <CreditCard className="w-6 h-6 text-lob-green/60" />
        </motion.div>
        <h1 className="text-xl font-bold text-text-primary">Credit Facility</h1>
        <p className="text-sm text-text-secondary">Connect your wallet to manage your credit line.</p>
        <ConnectButton />
      </motion.div>
    );
  }

  return (
    <motion.div initial="hidden" animate="show" variants={stagger}>
      {/* Header */}
      <motion.div variants={fadeUp} className="mb-6">
        <h1 className="text-xl font-bold text-text-primary flex items-center gap-1.5">
          X402 Credit Facility
          <InfoButton infoKey="credit.header" />
        </h1>
        <p className="text-xs text-text-tertiary mt-0.5">
          Borrow against your staking reputation to fund escrow jobs on credit. Tier-based limits, interest, and collateral.
        </p>
      </motion.div>

      {/* ── Section 5: Stats Cards ── */}
      <motion.div variants={fadeUp} className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
        {[
          {
            label: "Available Credit",
            value: availableCredit !== undefined ? `${fmtLob(availableCredit)} LOB` : "--",
            icon: Wallet,
            color: "#58B059",
          },
          {
            label: "Total Drawn",
            value: creditLine ? `${fmtLob(creditLine.totalDrawn)} LOB` : "--",
            icon: ArrowDownCircle,
            color: "#3B82F6",
          },
          {
            label: "Total Repaid",
            value: creditLine ? `${fmtLob(creditLine.totalRepaid)} LOB` : "--",
            icon: ArrowUpCircle,
            color: "#10B981",
          },
          {
            label: "Collateral",
            value: creditLine ? `${fmtLob(creditLine.collateralDeposited)} LOB` : "--",
            icon: Lock,
            color: "#F59E0B",
          },
          {
            label: "Defaults",
            value: creditLine ? creditLine.defaults.toString() : "0",
            icon: FileWarning,
            color: "#EF4444",
          },
        ].map((stat, i) => {
          const Icon = stat.icon;
          return (
            <motion.div
              key={stat.label}
              className="card p-3 relative overflow-hidden group"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.05 + i * 0.06, ease }}
              whileHover={{ y: -2 }}
            >
              <motion.div
                className="absolute top-0 left-0 right-0 h-px opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ background: `linear-gradient(to right, transparent, ${stat.color}30, transparent)` }}
              />
              <div className="flex items-center gap-2 mb-2">
                <div
                  className="w-6 h-6 rounded-md flex items-center justify-center"
                  style={{ backgroundColor: `${stat.color}15` }}
                >
                  <Icon className="w-3 h-3" style={{ color: stat.color }} />
                </div>
                <p className="text-[9px] text-text-tertiary uppercase tracking-wider">{stat.label}</p>
              </div>
              <p className="text-sm font-bold text-text-primary tabular-nums">{stat.value}</p>
            </motion.div>
          );
        })}
      </motion.div>

      {/* ── Visual Gauges ── */}
      <motion.div variants={fadeUp} className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
        <PoolUtilizationChart utilization={utilizationPct} poolTotal={poolTotal} poolOutstanding={poolOutstanding} />
        {hasActiveLine && creditLine && (
          <CreditLineHealth creditLine={creditLine} availableCredit={availableCredit} />
        )}
      </motion.div>

      {/* ── Section 1: Credit Line Management ── */}
      <motion.div variants={fadeUp} className="card p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-lob-green" />
            Credit Line
            <InfoButton infoKey="credit.facility" />
          </h2>
          {creditLine && creditLine.status > 0 && (
            <span
              className={`text-[10px] font-medium px-2 py-0.5 rounded border ${STATUS_COLORS[creditLine.status]?.bg} ${STATUS_COLORS[creditLine.status]?.text} ${STATUS_COLORS[creditLine.status]?.border}`}
            >
              {STATUS_LABELS[creditLine.status]}
            </span>
          )}
        </div>

        {/* Tier eligibility info */}
        {!canOpenLine && hasNoLine && (
          <div className="rounded-lg border border-amber-500/15 bg-amber-500/[0.03] p-4 mb-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs font-semibold text-text-primary mb-1">Tier Required</p>
                <p className="text-[10px] text-text-secondary leading-relaxed">
                  You need at least <span className="text-text-primary font-semibold">Silver tier (1,000 LOB staked)</span> to
                  open a credit line. Your current tier: <span className="font-semibold">{tierName}</span>.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Active credit line details */}
        {hasActiveLine && creditLine && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
              <div>
                <p className="text-[10px] text-text-tertiary uppercase tracking-wider">Credit Limit</p>
                <p className="text-sm font-bold text-text-primary mt-0.5 tabular-nums">
                  {fmtLob(creditLine.creditLimit)} LOB
                </p>
              </div>
              <div>
                <p className="text-[10px] text-text-tertiary uppercase tracking-wider">Interest Rate</p>
                <p className="text-sm font-bold text-text-primary mt-0.5 tabular-nums">
                  {(Number(creditLine.interestRateBps) / 100).toFixed(1)}%
                </p>
              </div>
              <div>
                <p className="text-[10px] text-text-tertiary uppercase tracking-wider">Active Draws</p>
                <p className="text-sm font-bold text-text-primary mt-0.5 tabular-nums">
                  {creditLine.activeDraws.toString()} / {MAX_DRAWS}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-text-tertiary uppercase tracking-wider">Opened</p>
                <p className="text-sm font-bold text-text-primary mt-0.5">
                  {fmtDate(creditLine.openedAt)}
                </p>
              </div>
            </div>

            {/* Close credit line */}
            {creditLine.activeDraws === BigInt(0) && (
              <div className="pt-3 border-t border-border/30">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium text-text-primary">Close Credit Line</p>
                    <p className="text-[10px] text-text-tertiary">
                      Returns your collateral ({fmtLob(creditLine.collateralDeposited)} LOB). Requires no active draws.
                    </p>
                  </div>
                  <motion.button
                    className="btn-secondary text-xs disabled:opacity-50 flex items-center gap-1.5"
                    whileTap={closeLine.isPending ? undefined : { scale: 0.97 }}
                    disabled={closeLine.isPending}
                    onClick={async () => {
                      closeLine.reset();
                      try { await closeLine.fn(); } catch { /* handled */ }
                    }}
                  >
                    {closeLine.isPending ? (
                      <><Loader2 className="w-3 h-3 animate-spin" /> Closing...</>
                    ) : "Close Credit Line"}
                  </motion.button>
                </div>
                {closeLine.isError && (
                  <p className="text-[10px] text-red-400 mt-2">Failed to close. Ensure you have no active draws.</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Frozen credit line */}
        {hasFrozenLine && creditLine && (
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0" />
              <div>
                <p className="text-xs font-semibold text-amber-400 mb-1">Credit Line Frozen</p>
                <p className="text-[10px] text-text-secondary leading-relaxed">
                  Your credit line has been frozen due to {creditLine.defaults.toString()} default(s).
                  An admin must lift the freeze before you can draw again. Existing draws must still be repaid.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* No credit line -- open button */}
        {hasNoLine && canOpenLine && (
          <div className="space-y-4">
            <div className="rounded-lg border border-lob-green/15 bg-lob-green/[0.03] p-4">
              <div className="flex items-start gap-3">
                <Zap className="w-4 h-4 text-lob-green mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-text-primary mb-1">Open a Credit Line</p>
                  <p className="text-[10px] text-text-secondary leading-relaxed">
                    Based on your <span className="font-semibold text-text-primary">{tierName}</span> tier,
                    you&apos;ll receive a credit limit determined by your staking tier.
                    {currentTier < 4 && " Collateral will be auto-deposited from your LOB balance."}
                  </p>
                </div>
              </div>
            </div>

            <motion.button
              className="btn-primary w-full disabled:opacity-50"
              whileHover={{ boxShadow: "inset 0 1px 0 rgba(88,176,89,0.12), 0 4px 16px rgba(88,176,89,0.08)" }}
              whileTap={openLine.isPending ? undefined : { scale: 0.97 }}
              disabled={openLine.isPending}
              onClick={handleOpenCreditLine}
            >
              {openLine.isPending ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Opening Credit Line...
                </span>
              ) : "Open Credit Line"}
            </motion.button>
            {openLine.isError && (
              <p className="text-xs text-red-400">
                {openLine.error?.message?.includes("User rejected")
                  ? "Transaction rejected in wallet"
                  : "Failed to open credit line. Ensure you have sufficient LOB for collateral."}
              </p>
            )}
          </div>
        )}
      </motion.div>

      {/* ── Section 2: Active Draws ── */}
      <motion.div variants={fadeUp} className="card p-5 mb-6">
        <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2 mb-4">
          <Banknote className="w-4 h-4 text-blue-400" />
          Active Draws
          {drawIds.length > 0 && (
            <span className="text-[10px] text-text-tertiary font-normal ml-1">
              ({drawIds.length} draw{drawIds.length !== 1 ? "s" : ""})
            </span>
          )}
        </h2>

        {drawIds.length === 0 ? (
          <div className="rounded-lg border border-border/30 bg-surface-1/20 p-6 text-center">
            <Banknote className="w-6 h-6 text-text-tertiary mx-auto mb-2" />
            <p className="text-xs text-text-secondary">No active draws</p>
            <p className="text-[10px] text-text-tertiary mt-0.5">
              Draw credit below to create escrow-backed jobs on credit.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {drawIds.map((drawId) => (
              <DrawRow key={drawId.toString()} drawId={drawId} address={address!} />
            ))}
          </div>
        )}

        <div className="mt-3 pt-3 border-t border-border/30">
          <p className="text-[10px] text-text-tertiary">
            Repayment = principal - refundCredit + interest + 0.5% protocol fee.
            Due {REPAYMENT_DEADLINE_DAYS} days from draw with {GRACE_PERIOD_HOURS}hr grace period.
          </p>
        </div>
      </motion.div>

      {/* ── Section 3: Draw Credit ── */}
      {hasActiveLine && creditLine && creditLine.activeDraws < BigInt(MAX_DRAWS) && (
        <motion.div variants={fadeUp} className="card p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
              <ArrowDownCircle className="w-4 h-4 text-lob-green" />
              Draw Credit
            </h2>
            <span className="text-[10px] text-text-tertiary tabular-nums">
              Available: {availableCredit !== undefined ? `${fmtLob(availableCredit)} LOB` : "--"}
            </span>
          </div>

          <div className="rounded-lg border border-border/30 bg-surface-1/20 p-4 mb-4">
            <p className="text-[10px] text-text-secondary leading-relaxed">
              Drawing credit creates an escrow job automatically funded by the credit pool.
              The seller receives payment, and you repay the draw within {REPAYMENT_DEADLINE_DAYS} days.
              Max {MAX_DRAWS} draws per credit line.
            </p>
          </div>

          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[10px] text-text-tertiary uppercase tracking-wider mb-1">
                  Listing ID
                </label>
                <input
                  type="number"
                  value={drawListingId}
                  onChange={(e) => setDrawListingId(e.target.value)}
                  placeholder="e.g. 42"
                  className="input-field tabular-nums w-full"
                />
              </div>
              <div>
                <label className="block text-[10px] text-text-tertiary uppercase tracking-wider mb-1">
                  Seller Address
                </label>
                <input
                  type="text"
                  value={drawSeller}
                  onChange={(e) => setDrawSeller(e.target.value)}
                  placeholder="0x..."
                  className="input-field font-mono w-full"
                />
              </div>
              <div>
                <label className="block text-[10px] text-text-tertiary uppercase tracking-wider mb-1">
                  Amount (LOB)
                </label>
                <input
                  type="number"
                  value={drawAmount}
                  onChange={(e) => setDrawAmount(e.target.value)}
                  placeholder="e.g. 100"
                  className="input-field tabular-nums w-full"
                />
              </div>
            </div>

            <motion.button
              className="btn-primary w-full disabled:opacity-50"
              whileHover={drawCredit.isPending ? undefined : { boxShadow: "inset 0 1px 0 rgba(88,176,89,0.12), 0 4px 16px rgba(88,176,89,0.08)" }}
              whileTap={drawCredit.isPending ? undefined : { scale: 0.97 }}
              disabled={drawCredit.isPending || !drawListingId || !drawSeller || !drawAmount}
              onClick={async () => {
                drawCredit.reset();
                try {
                  await drawCredit.fn(
                    BigInt(drawListingId),
                    drawSeller as `0x${string}`,
                    parseEther(drawAmount),
                  );
                  setDrawListingId("");
                  setDrawSeller("");
                  setDrawAmount("");
                } catch {
                  // Error handled by hook
                }
              }}
            >
              {drawCredit.isPending ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Creating Draw...
                </span>
              ) : "Draw Credit & Create Escrow"}
            </motion.button>
            {drawCredit.isError && (
              <p className="text-xs text-red-400">
                {drawCredit.error?.message?.includes("User rejected")
                  ? "Transaction rejected in wallet"
                  : "Draw failed. Check available credit and inputs."}
              </p>
            )}
          </div>
        </motion.div>
      )}

      {/* ── Section 4: Pool Stats ── */}
      <motion.div variants={fadeUp} className="card p-5 mb-6">
        <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2 mb-4">
          <BarChart3 className="w-4 h-4 text-purple-400" />
          Credit Pool
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          <div className="rounded-lg border border-border/40 bg-surface-1/30 p-4">
            <p className="text-[10px] text-text-tertiary uppercase tracking-wider">Total Pool</p>
            <p className="text-lg font-bold text-text-primary mt-0.5 tabular-nums">{fmtLob(poolTotal)} LOB</p>
          </div>
          <div className="rounded-lg border border-border/40 bg-surface-1/30 p-4">
            <p className="text-[10px] text-text-tertiary uppercase tracking-wider">Outstanding</p>
            <p className="text-lg font-bold text-blue-400 mt-0.5 tabular-nums">{fmtLob(poolOutstanding)} LOB</p>
          </div>
          <div className="rounded-lg border border-border/40 bg-surface-1/30 p-4">
            <p className="text-[10px] text-text-tertiary uppercase tracking-wider">Available</p>
            <p className="text-lg font-bold text-lob-green mt-0.5 tabular-nums">{fmtLob(poolAvailable)} LOB</p>
          </div>
        </div>

        {/* Utilization bar */}
        <div className="mb-4">
          <div className="flex justify-between items-center mb-1">
            <span className="text-[10px] text-text-tertiary">Pool Utilization</span>
            <span className="text-[10px] text-text-tertiary tabular-nums">{utilizationPct}%</span>
          </div>
          <div className="h-2 rounded-full bg-surface-2 overflow-hidden">
            <motion.div
              className="h-full rounded-full"
              style={{
                background: utilizationPct > 80
                  ? "linear-gradient(to right, #F59E0B, #EF4444)"
                  : utilizationPct > 50
                    ? "linear-gradient(to right, #58B059, #F59E0B)"
                    : "#58B059",
              }}
              initial={{ width: 0 }}
              animate={{ width: `${Math.max(0, Math.min(100, utilizationPct))}%` }}
              transition={{ duration: 0.8, ease }}
            />
          </div>
        </div>

        {/* Deposit / Withdraw (visible to all for transparency) */}
        <div className="pt-4 border-t border-border/30">
          <p className="text-[10px] text-text-tertiary uppercase tracking-wider mb-3">Pool Management (POOL_MANAGER_ROLE)</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <div className="flex gap-2">
                <input
                  type="number"
                  value={poolDepositAmt}
                  onChange={(e) => setPoolDepositAmt(e.target.value)}
                  placeholder="Deposit amount"
                  className="input-field flex-1 tabular-nums text-xs"
                />
                <motion.button
                  className="btn-primary text-xs px-3 disabled:opacity-50"
                  whileTap={{ scale: 0.97 }}
                  disabled={depositPool.isPending || !poolDepositAmt}
                  onClick={async () => {
                    depositPool.reset();
                    try {
                      if (contracts) {
                        await approveToken(contracts.lobToken, contracts.x402CreditFacility, parseEther(poolDepositAmt));
                      }
                      await depositPool.fn(parseEther(poolDepositAmt));
                      setPoolDepositAmt("");
                    } catch { /* handled */ }
                  }}
                >
                  {depositPool.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Deposit"}
                </motion.button>
              </div>
              {depositPool.isError && <p className="text-[10px] text-red-400">Deposit failed.</p>}
            </div>
            <div className="space-y-2">
              <div className="flex gap-2">
                <input
                  type="number"
                  value={poolWithdrawAmt}
                  onChange={(e) => setPoolWithdrawAmt(e.target.value)}
                  placeholder="Withdraw amount"
                  className="input-field flex-1 tabular-nums text-xs"
                />
                <motion.button
                  className="btn-secondary text-xs px-3 disabled:opacity-50"
                  whileTap={{ scale: 0.97 }}
                  disabled={withdrawPool.isPending || !poolWithdrawAmt}
                  onClick={async () => {
                    withdrawPool.reset();
                    try {
                      await withdrawPool.fn(parseEther(poolWithdrawAmt));
                      setPoolWithdrawAmt("");
                    } catch { /* handled */ }
                  }}
                >
                  {withdrawPool.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Withdraw"}
                </motion.button>
              </div>
              {withdrawPool.isError && <p className="text-[10px] text-red-400">Withdraw failed.</p>}
            </div>
          </div>
        </div>
      </motion.div>

      {/* ── Tier Reference Table ── */}
      <motion.div variants={fadeUp} className="card overflow-hidden mb-6">
        <div className="px-5 py-3 border-b border-border">
          <h3 className="text-[10px] sm:text-xs font-semibold text-text-primary uppercase tracking-wider flex items-center gap-2">
            <Shield className="w-3.5 h-3.5 text-text-tertiary" />
            Credit Tiers
          </h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-0 divide-y sm:divide-y-0 sm:divide-x divide-border/30">
          {TIER_CONFIG.map((tier, i) => (
            <motion.div
              key={tier.name}
              className="p-4 relative overflow-hidden group"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: i * 0.08, ease }}
              whileHover={{ backgroundColor: `${tier.color}05` }}
            >
              <motion.div
                className="absolute top-0 left-0 right-0 h-px opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ background: `linear-gradient(to right, transparent, ${tier.color}30, transparent)` }}
              />
              <div className="flex items-center gap-2 mb-3">
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: `${tier.color}15` }}
                >
                  <Shield className="w-3.5 h-3.5" style={{ color: tier.color }} />
                </div>
                <p className="text-sm font-bold" style={{ color: tier.color }}>{tier.name}</p>
              </div>
              <div className="space-y-1.5 text-[10px]">
                <div className="flex justify-between">
                  <span className="text-text-tertiary">Credit Limit</span>
                  <span className="text-text-secondary font-medium tabular-nums">{tier.creditLimit} LOB</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-tertiary">Interest Rate</span>
                  <span className="text-text-secondary font-medium tabular-nums">{tier.apr}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-tertiary">Collateral</span>
                  <span className="text-text-secondary font-medium tabular-nums">{tier.collateral}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-tertiary">Repayment</span>
                  <span className="text-text-secondary font-medium tabular-nums">{REPAYMENT_DEADLINE_DAYS}d + {GRACE_PERIOD_HOURS}hr grace</span>
                </div>
              </div>
              <p className="text-[9px] text-text-tertiary mt-3 leading-relaxed">{tier.desc}</p>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* ── How It Works ── */}
      <motion.div variants={fadeUp} className="card p-5">
        <h3 className="text-[10px] sm:text-xs font-semibold text-text-primary mb-4 uppercase tracking-wider flex items-center gap-1.5">
          How It Works
          <InfoButton infoKey="credit.mechanics" />
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          {[
            {
              step: 1,
              title: "Open Credit Line",
              desc: "Stake LOB to qualify, then open a credit line. Collateral is auto-deposited based on your tier.",
              icon: CreditCard,
              color: "#58B059",
            },
            {
              step: 2,
              title: "Draw Credit",
              desc: "Draw funds from the credit pool to create escrow jobs. Up to 5 draws per credit line.",
              icon: ArrowDownCircle,
              color: "#3B82F6",
            },
            {
              step: 3,
              title: "Service Delivered",
              desc: "Seller delivers the service. Confirm delivery, dispute, or claim refund through the escrow.",
              icon: CheckCircle2,
              color: "#A855F7",
            },
            {
              step: 4,
              title: "Repay Draw",
              desc: "Repay within 30 days (+ 48hr grace). Refund credits reduce your repayment amount.",
              icon: ArrowUpCircle,
              color: "#F59E0B",
            },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <motion.div
                key={item.step}
                className="flex items-start gap-3"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: item.step * 0.1 }}
              >
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: `${item.color}15` }}
                >
                  <Icon className="w-4 h-4" style={{ color: item.color }} />
                </div>
                <div>
                  <p className="text-xs font-semibold text-text-primary">{item.title}</p>
                  <p className="text-[10px] text-text-tertiary leading-relaxed">{item.desc}</p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </motion.div>
    </motion.div>
  );
}
