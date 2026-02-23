"use client";

import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { motion } from "framer-motion";
import { formatUnits } from "viem";
import { stagger, fadeUp, ease } from "@/lib/motion";
import {
  AreaChart,
  Area,
  XAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import {
  Lock,
  Unlock,
  Clock,
  Calendar,
  User,
  Coins,
  CheckCircle2,
  ArrowRight,
  Info,
  Loader2,
} from "lucide-react";
import {
  useVestedAmount,
  useReleasable,
  useVestingReleased,
  useVestingBeneficiary,
  useVestingStart,
  useVestingDuration,
  useVestingCliffEnd,
  useTotalAllocation,
  useReleaseVested,
} from "@/lib/useVesting";
import { useState } from "react";

/* ── Formatting helpers ── */
const fmtNum = (n: number) => n.toLocaleString("en-US");
const fmtLob = (raw: bigint | undefined) =>
  raw != null ? parseFloat(formatUnits(raw, 18)) : null;
const fmtLobStr = (raw: bigint | undefined) => {
  const v = fmtLob(raw);
  return v != null ? fmtNum(Math.round(v)) : "--";
};
const pctOf = (part: number, total: number) =>
  total > 0 ? Math.round((part / total) * 100) : 0;

const tsToDate = (ts: bigint | undefined) =>
  ts != null ? new Date(Number(ts) * 1000) : null;

const fmtDate = (d: Date | null) =>
  d != null
    ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "--";

const monthsBetween = (a: Date, b: Date) => {
  const diff = b.getTime() - a.getTime();
  return Math.max(0, Math.round(diff / (1000 * 60 * 60 * 24 * 30)));
};

/* ──── Vesting Schedule Area Chart ──── */
function VestingScheduleChart({
  totalAlloc,
  cliffMonths,
  durationMonths,
  elapsedMonths,
}: {
  totalAlloc: number;
  cliffMonths: number;
  durationMonths: number;
  elapsedMonths: number;
}) {
  // Build data points: one per month
  const data = [];
  for (let m = 0; m <= durationMonths; m++) {
    let vested = 0;
    if (m >= cliffMonths && durationMonths > 0) {
      vested = (totalAlloc * m) / durationMonths;
    }
    data.push({
      month: m,
      label: m % 6 === 0 ? `${m}mo` : "",
      vested: Math.round(vested),
    });
  }

  return (
    <div style={{ height: 160 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="vestingGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#58B059" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#58B059" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="label"
            tick={{ fill: "#5E6673", fontSize: 9 }}
            axisLine={false}
            tickLine={false}
            interval={0}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#1E2431",
              border: "1px solid #2A3142",
              borderRadius: 8,
              fontSize: 11,
              color: "#EAECEF",
            }}
            formatter={(value?: number) => [
              `${(value ?? 0).toLocaleString()} LOB`,
              "Vested",
            ]}
            labelFormatter={(label, payload) => {
              const point = payload?.[0]?.payload as { month?: number } | undefined;
              return point?.month != null ? `Month ${point.month}` : String(label);
            }}
          />
          {/* Cliff marker */}
          {cliffMonths > 0 && cliffMonths < durationMonths && (
            <ReferenceLine
              x={data[cliffMonths]?.label || ""}
              stroke="#EF4444"
              strokeDasharray="3 3"
              strokeOpacity={0.5}
              label={{
                value: "Cliff",
                position: "top",
                fill: "#EF4444",
                fontSize: 9,
              }}
            />
          )}
          {/* Current position marker */}
          {elapsedMonths > 0 && elapsedMonths < durationMonths && (
            <ReferenceLine
              x={data[elapsedMonths]?.label || ""}
              stroke="#58B059"
              strokeDasharray="3 3"
              strokeOpacity={0.7}
              label={{
                value: "Now",
                position: "top",
                fill: "#58B059",
                fontSize: 9,
              }}
            />
          )}
          <Area
            type="stepAfter"
            dataKey="vested"
            stroke="#58B059"
            strokeWidth={2}
            fill="url(#vestingGrad)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function VestingPage() {
  const { isConnected, address } = useAccount();
  const [releaseTxPending, setReleaseTxPending] = useState(false);

  // On-chain reads
  const vestedAmountQuery = useVestedAmount();
  const releasableQuery = useReleasable();
  const releasedQuery = useVestingReleased();
  const beneficiaryQuery = useVestingBeneficiary();
  const startQuery = useVestingStart();
  const durationQuery = useVestingDuration();
  const cliffEndQuery = useVestingCliffEnd();
  const totalAllocQuery = useTotalAllocation();

  // Write hook
  const { release, isPending: isReleasePending } = useReleaseVested();

  // Raw values
  const vestedRaw = vestedAmountQuery.data as bigint | undefined;
  const releasableRaw = releasableQuery.data as bigint | undefined;
  const releasedRaw = releasedQuery.data as bigint | undefined;
  const beneficiaryAddr = beneficiaryQuery.data as string | undefined;
  const startTs = startQuery.data as bigint | undefined;
  const durationSec = durationQuery.data as bigint | undefined;
  const cliffEndTs = cliffEndQuery.data as bigint | undefined;
  const totalAllocRaw = totalAllocQuery.data as bigint | undefined;

  // Derived
  const totalAllocNum = fmtLob(totalAllocRaw) ?? 150_000_000; // fallback for mock display
  const vestedNum = fmtLob(vestedRaw) ?? 0;
  const releasedNum = fmtLob(releasedRaw) ?? 0;
  const releasableNum = fmtLob(releasableRaw) ?? 0;

  const startDate = tsToDate(startTs);
  const cliffDate = tsToDate(cliffEndTs);
  const endDate =
    startTs != null && durationSec != null
      ? new Date((Number(startTs) + Number(durationSec)) * 1000)
      : null;

  const now = new Date();
  const durationMonths =
    startDate && endDate ? monthsBetween(startDate, endDate) : 36;
  const cliffMonths = startDate && cliffDate ? monthsBetween(startDate, cliffDate) : 6;
  const elapsedMonths = startDate ? monthsBetween(startDate, now) : 0;
  const monthsRemaining = Math.max(0, durationMonths - elapsedMonths);

  const vestedPct = pctOf(vestedNum, totalAllocNum);
  const releasedPct = pctOf(releasedNum, totalAllocNum);
  const timeElapsedPct = durationMonths > 0 ? Math.min(100, Math.round((elapsedMonths / durationMonths) * 100)) : 0;

  const isBeneficiary =
    isConnected &&
    !!beneficiaryAddr &&
    address?.toLowerCase() === beneficiaryAddr.toLowerCase();

  const hasOnChainData = totalAllocRaw != null;
  const hasReleasable = releasableRaw != null && releasableRaw > 0n;
  const releasing = isReleasePending || releaseTxPending;

  const handleRelease = async () => {
    try {
      setReleaseTxPending(true);
      await release();
    } catch (err) {
      console.error("Release failed:", err);
    } finally {
      setReleaseTxPending(false);
    }
  };

  // Build milestone data from on-chain values
  const MILESTONES = [
    {
      label: "Start",
      date: fmtDate(startDate),
      position: 0,
      passed: startDate ? now >= startDate : false,
    },
    {
      label: `Cliff (${cliffMonths}mo)`,
      date: fmtDate(cliffDate),
      position: durationMonths > 0 ? Math.round((cliffMonths / durationMonths) * 100) : 17,
      passed: cliffDate ? now >= cliffDate : false,
    },
    {
      label: "25% Vested",
      date: startDate && durationSec
        ? fmtDate(new Date((Number(startTs!) + Number(durationSec) * 0.25) * 1000))
        : "--",
      position: 25,
      passed: vestedPct >= 25,
    },
    {
      label: `${vestedPct}% (Now)`,
      date: fmtDate(now),
      position: Math.min(vestedPct, 100),
      passed: true,
      current: true,
    },
    {
      label: "75% Vested",
      date: startDate && durationSec
        ? fmtDate(new Date((Number(startTs!) + Number(durationSec) * 0.75) * 1000))
        : "--",
      position: 75,
      passed: vestedPct >= 75,
    },
    {
      label: "Fully Vested",
      date: fmtDate(endDate),
      position: 100,
      passed: vestedPct >= 100,
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
          <Lock className="w-6 h-6 text-lob-green/60" />
        </motion.div>
        <h1 className="text-xl font-bold text-text-primary">Team Vesting</h1>
        <p className="text-sm text-text-secondary">Connect your wallet to view the vesting schedule.</p>
        <ConnectButton />
      </motion.div>
    );
  }

  return (
    <motion.div initial="hidden" animate="show" variants={stagger}>
      {/* Header */}
      <motion.div variants={fadeUp} className="mb-6">
        <h1 className="text-xl font-bold text-text-primary">Team Vesting</h1>
        <p className="text-xs text-text-tertiary mt-0.5">
          Token vesting schedule and claims
        </p>
      </motion.div>

      {/* Read-only notice if not beneficiary */}
      {!isBeneficiary && (
        <motion.div variants={fadeUp} className="mb-4">
          <div className="rounded-lg border border-blue-500/15 bg-blue-500/[0.03] p-4">
            <div className="flex items-start gap-3">
              <Info className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs font-semibold text-text-primary mb-1">Read-Only View</p>
                <p className="text-[10px] text-text-secondary leading-relaxed">
                  Your connected wallet is not the vesting beneficiary. You can view the schedule
                  but cannot release tokens.
                  {beneficiaryAddr && (
                    <>
                      {" "}The beneficiary is{" "}
                      <span className="font-mono text-text-tertiary">
                        {beneficiaryAddr.slice(0, 6)}...{beneficiaryAddr.slice(-4)}
                      </span>.
                    </>
                  )}
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Vesting Timeline Visualization */}
      <motion.div variants={fadeUp} className="card p-5 mb-6">
        <h3 className="text-[10px] sm:text-xs font-semibold text-text-primary uppercase tracking-wider mb-5">
          Vesting Timeline
        </h3>

        {/* Timeline bar */}
        <div className="relative mb-8">
          {/* Background bar */}
          <div className="h-3 rounded-full bg-surface-2 overflow-hidden relative">
            {/* Cliff zone */}
            <div
              className="absolute top-0 left-0 h-full bg-red-500/10"
              style={{ width: `${durationMonths > 0 ? Math.round((cliffMonths / durationMonths) * 100) : 17}%` }}
            />
            {/* Vested portion */}
            <motion.div
              className="absolute top-0 left-0 h-full rounded-full bg-lob-green"
              initial={{ width: 0 }}
              animate={{ width: `${vestedPct}%` }}
              transition={{ duration: 1.2, ease }}
            />
            {/* Released portion (lighter, stacked) */}
            <motion.div
              className="absolute top-0 left-0 h-full rounded-full bg-lob-green/60"
              initial={{ width: 0 }}
              animate={{ width: `${releasedPct}%` }}
              transition={{ duration: 1, delay: 0.2, ease }}
            />
          </div>

          {/* Current position indicator */}
          <motion.div
            className="absolute -top-1"
            style={{ left: `${vestedPct}%` }}
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.8, duration: 0.3, ease }}
          >
            <motion.div
              className="w-5 h-5 rounded-full border-2 border-lob-green bg-surface-0 -ml-2.5"
              animate={{
                boxShadow: [
                  "0 0 0 rgba(88,176,89,0)",
                  "0 0 12px rgba(88,176,89,0.4)",
                  "0 0 0 rgba(88,176,89,0)",
                ],
              }}
              transition={{ duration: 2, repeat: Infinity }}
            />
          </motion.div>

          {/* Milestone markers */}
          {MILESTONES.map((m) => (
            <div
              key={m.label}
              className="absolute"
              style={{ left: `${m.position}%`, top: "20px" }}
            >
              <div className="relative -ml-0.5">
                <div
                  className={`w-1 h-2 ${
                    m.passed ? "bg-lob-green/60" : "bg-surface-2"
                  }`}
                />
                <div className={`mt-1 ${m.position > 80 ? "-ml-20 text-right" : m.position > 20 ? "-ml-10 text-center" : "text-left"}`}>
                  <p className={`text-[8px] font-medium whitespace-nowrap ${
                    m.current ? "text-lob-green" : m.passed ? "text-text-secondary" : "text-text-tertiary"
                  }`}>
                    {m.label}
                  </p>
                  <p className="text-[7px] text-text-tertiary whitespace-nowrap">{m.date}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Timeline legend */}
        <div className="flex flex-wrap gap-4 mt-16 pt-4 border-t border-border/30">
          <div className="flex items-center gap-2">
            <div className="w-3 h-2 rounded-sm bg-red-500/10 border border-red-500/20" />
            <span className="text-[10px] text-text-tertiary">Cliff Period</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-2 rounded-sm bg-lob-green/60" />
            <span className="text-[10px] text-text-tertiary">Released</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-2 rounded-sm bg-lob-green" />
            <span className="text-[10px] text-text-tertiary">Vested (Claimable)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-2 rounded-sm bg-surface-2" />
            <span className="text-[10px] text-text-tertiary">Unvested</span>
          </div>
        </div>
      </motion.div>

      {/* Vesting Release Schedule Chart */}
      <motion.div variants={fadeUp} className="card p-5 mb-6">
        <h3 className="text-[10px] sm:text-xs font-semibold text-text-primary uppercase tracking-wider mb-3">
          Release Schedule
        </h3>
        <VestingScheduleChart
          totalAlloc={totalAllocNum}
          cliffMonths={cliffMonths}
          durationMonths={durationMonths}
          elapsedMonths={elapsedMonths}
        />
        <div className="flex flex-wrap gap-4 mt-3 pt-2 border-t border-border/30">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-1.5 rounded-sm bg-lob-green" />
            <span className="text-[9px] text-text-tertiary">Cumulative Vested</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 rounded-sm bg-red-500/50" style={{ borderTop: "1px dashed" }} />
            <span className="text-[9px] text-text-tertiary">Cliff</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 rounded-sm bg-lob-green/50" style={{ borderTop: "1px dashed" }} />
            <span className="text-[9px] text-text-tertiary">Current Position</span>
          </div>
        </div>
      </motion.div>

      {/* Status Card */}
      <motion.div variants={fadeUp} className="card p-5 mb-6">
        <h3 className="text-[10px] sm:text-xs font-semibold text-text-primary uppercase tracking-wider mb-4">
          Vesting Status
        </h3>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-5">
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <User className="w-3 h-3 text-text-tertiary" />
              <p className="text-[10px] text-text-tertiary uppercase tracking-wider">Beneficiary</p>
            </div>
            <p className="text-xs font-mono text-text-primary">
              {beneficiaryAddr
                ? `${beneficiaryAddr.slice(0, 6)}...${beneficiaryAddr.slice(-4)}`
                : "--"}
            </p>
          </div>
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <Coins className="w-3 h-3 text-text-tertiary" />
              <p className="text-[10px] text-text-tertiary uppercase tracking-wider">Total Allocation</p>
            </div>
            <p className="text-sm font-bold text-text-primary tabular-nums">
              {fmtLobStr(totalAllocRaw)} LOB
            </p>
          </div>
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <CheckCircle2 className="w-3 h-3 text-lob-green" />
              <p className="text-[10px] text-text-tertiary uppercase tracking-wider">Vested So Far</p>
            </div>
            <p className="text-sm font-bold text-lob-green tabular-nums">
              {fmtLobStr(vestedRaw)} LOB
            </p>
          </div>
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <Unlock className="w-3 h-3 text-text-tertiary" />
              <p className="text-[10px] text-text-tertiary uppercase tracking-wider">Already Released</p>
            </div>
            <p className="text-sm font-bold text-text-primary tabular-nums">
              {fmtLobStr(releasedRaw)} LOB
            </p>
          </div>
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <ArrowRight className="w-3 h-3 text-lob-green" />
              <p className="text-[10px] text-text-tertiary uppercase tracking-wider">Releasable Now</p>
            </div>
            <p className="text-sm font-bold text-lob-green tabular-nums">
              {fmtLobStr(releasableRaw)} LOB
            </p>
          </div>
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <Clock className="w-3 h-3 text-text-tertiary" />
              <p className="text-[10px] text-text-tertiary uppercase tracking-wider">Time Remaining</p>
            </div>
            <p className="text-sm font-bold text-text-primary tabular-nums">
              {monthsRemaining} months
            </p>
          </div>
        </div>

        {/* Release button */}
        {isBeneficiary && hasReleasable && (
          <motion.button
            className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            whileHover={!releasing ? { boxShadow: "inset 0 1px 0 rgba(88,176,89,0.12), 0 4px 16px rgba(88,176,89,0.08)" } : {}}
            whileTap={!releasing ? { scale: 0.97 } : {}}
            onClick={handleRelease}
            disabled={releasing}
          >
            {releasing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Unlock className="w-4 h-4" />
            )}
            {releasing ? "Releasing..." : `Release ${fmtLobStr(releasableRaw)} LOB`}
          </motion.button>
        )}

        {isBeneficiary && !hasReleasable && (
          <div className="rounded-lg border border-border/40 bg-surface-1/30 p-3 text-center">
            <p className="text-xs text-text-tertiary">
              No tokens available to release right now. Check back as more tokens vest.
            </p>
          </div>
        )}
      </motion.div>

      {/* Progress Metrics */}
      <motion.div variants={fadeUp} className="card p-5 mb-6">
        <h3 className="text-[10px] sm:text-xs font-semibold text-text-primary uppercase tracking-wider mb-4">
          Progress
        </h3>

        <div className="space-y-4">
          {/* % Vested */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-text-secondary">Vested</span>
              <span className="text-xs font-bold text-lob-green tabular-nums">{vestedPct}%</span>
            </div>
            <div className="h-2 rounded-full bg-surface-2 overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-lob-green"
                initial={{ width: 0 }}
                animate={{ width: `${vestedPct}%` }}
                transition={{ duration: 1, ease }}
              />
            </div>
            <p className="text-[10px] text-text-tertiary mt-1 tabular-nums">
              {fmtLobStr(vestedRaw)} / {fmtLobStr(totalAllocRaw)} LOB
            </p>
          </div>

          {/* % Released */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-text-secondary">Released</span>
              <span className="text-xs font-bold text-text-primary tabular-nums">{releasedPct}%</span>
            </div>
            <div className="h-2 rounded-full bg-surface-2 overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-blue-500"
                initial={{ width: 0 }}
                animate={{ width: `${releasedPct}%` }}
                transition={{ duration: 1, delay: 0.2, ease }}
              />
            </div>
            <p className="text-[10px] text-text-tertiary mt-1 tabular-nums">
              {fmtLobStr(releasedRaw)} / {fmtLobStr(totalAllocRaw)} LOB
            </p>
          </div>

          {/* Time elapsed */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-text-secondary">Time Elapsed</span>
              <span className="text-xs font-bold text-text-primary tabular-nums">{timeElapsedPct}%</span>
            </div>
            <div className="h-2 rounded-full bg-surface-2 overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-purple-500"
                initial={{ width: 0 }}
                animate={{ width: `${timeElapsedPct}%` }}
                transition={{ duration: 1, delay: 0.4, ease }}
              />
            </div>
            <p className="text-[10px] text-text-tertiary mt-1 tabular-nums">
              {elapsedMonths} / {durationMonths} months
            </p>
          </div>
        </div>
      </motion.div>

      {/* Key Dates & Next Milestone */}
      <motion.div variants={fadeUp} className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        {/* Key Dates */}
        <div className="card p-5">
          <h3 className="text-[10px] sm:text-xs font-semibold text-text-primary uppercase tracking-wider mb-4">
            Key Dates
          </h3>
          <div className="space-y-3">
            {[
              {
                label: "Vesting Start",
                date: fmtDate(startDate),
                icon: Calendar,
                passed: startDate ? now >= startDate : false,
              },
              {
                label: "Cliff End",
                date: fmtDate(cliffDate),
                icon: Lock,
                passed: cliffDate ? now >= cliffDate : false,
              },
              {
                label: "Vesting End",
                date: fmtDate(endDate),
                icon: Unlock,
                passed: endDate ? now >= endDate : false,
              },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.label} className="flex items-center gap-3">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                    item.passed ? "bg-lob-green-muted" : "bg-surface-2"
                  }`}>
                    <Icon className={`w-3.5 h-3.5 ${
                      item.passed ? "text-lob-green" : "text-text-tertiary"
                    }`} />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-medium text-text-primary">{item.label}</p>
                    <p className="text-[10px] text-text-tertiary tabular-nums">{item.date}</p>
                  </div>
                  {item.passed && (
                    <CheckCircle2 className="w-4 h-4 text-lob-green" />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Next Milestone */}
        <div className="card p-5">
          <h3 className="text-[10px] sm:text-xs font-semibold text-text-primary uppercase tracking-wider mb-4">
            Next Milestone
          </h3>
          <div className="rounded-lg border border-lob-green/15 bg-lob-green/[0.03] p-4">
            <div className="flex items-center gap-2 mb-2">
              <motion.div
                className="w-2.5 h-2.5 rounded-full bg-lob-green"
                animate={{
                  boxShadow: [
                    "0 0 0 rgba(88,176,89,0)",
                    "0 0 10px rgba(88,176,89,0.4)",
                    "0 0 0 rgba(88,176,89,0)",
                  ],
                }}
                transition={{ duration: 2, repeat: Infinity }}
              />
              <span className="text-xs font-semibold text-text-primary">
                {vestedPct < 75 ? "75% Vested" : vestedPct < 100 ? "Fully Vested" : "Complete"}
              </span>
            </div>
            <p className="text-lg font-bold text-text-primary tabular-nums mb-1">
              {fmtNum(Math.round(totalAllocNum * (vestedPct < 75 ? 0.75 : 1)))} LOB
            </p>
            <p className="text-[10px] text-text-tertiary">
              {endDate
                ? `Fully vested by ${fmtDate(endDate)}`
                : "Schedule loading..."}
            </p>
          </div>

          <div className="mt-4 space-y-2">
            <p className="text-[10px] text-text-tertiary uppercase tracking-wider">Vesting Rate</p>
            <p className="text-xs text-text-secondary">
              ~{fmtNum(Math.round(totalAllocNum / Math.max(durationMonths, 1)))} LOB per month
            </p>
            <p className="text-xs text-text-secondary">
              ~{fmtNum(Math.round(totalAllocNum / Math.max(durationMonths, 1) / 30))} LOB per day
            </p>
          </div>
        </div>
      </motion.div>

      {/* How Vesting Works */}
      <motion.div variants={fadeUp} className="card p-5">
        <h3 className="text-[10px] sm:text-xs font-semibold text-text-primary uppercase tracking-wider mb-4">
          How Team Vesting Works
        </h3>
        <div className="rounded-lg border border-border/40 bg-surface-1/30 p-4 mb-4">
          <p className="text-[10px] text-text-secondary leading-relaxed">
            The <span className="font-mono text-text-tertiary">TeamVesting</span> contract implements a standard
            {durationMonths > 0 ? ` ${Math.round(durationMonths / 12)}-year` : ""} linear vesting schedule with a {cliffMonths}-month cliff. No tokens can be released before the cliff date.
            After the cliff, tokens vest linearly per-second. The beneficiary can call{" "}
            <span className="font-mono text-text-tertiary">release()</span> at any time to withdraw vested tokens
            that have not yet been claimed. The contract is non-upgradeable and immutable.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            {
              step: 1,
              title: `${cliffMonths}-Month Cliff`,
              desc: `No tokens vest during the first ${cliffMonths} months. This ensures long-term alignment.`,
              icon: Lock,
              color: "#EF4444",
            },
            {
              step: 2,
              title: "Linear Vesting",
              desc: `After the cliff, tokens vest linearly per-second over the remaining ${Math.max(0, durationMonths - cliffMonths)} months.`,
              icon: Clock,
              color: "#3B82F6",
            },
            {
              step: 3,
              title: "Claim Anytime",
              desc: "Call release() to withdraw any vested-but-unclaimed tokens at any time.",
              icon: Unlock,
              color: "#58B059",
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
