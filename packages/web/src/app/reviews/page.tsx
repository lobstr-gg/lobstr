"use client";

import { useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { stagger, fadeUp, ease } from "@/lib/motion";
import { useAccount } from "wagmi";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell } from "recharts";
import {
  useAverageRating,
  useRatingStats,
  useSubmitReview,
  useReviewByJobAndReviewer,
  useReviewHistory,
  type ReviewEvent,
} from "@/lib/useReviews";
import {
  Star,
  Search,
  MessageSquare,
  TrendingUp,
  User,
  ArrowRight,
  Send,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

// ── Helpers ──────────────────────────────────────

function truncateAddress(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

// ── Stars Component ──────────────────────────────

function Stars({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className="shrink-0"
          style={{
            width: size,
            height: size,
            fill: i <= rating ? "#F0B90B" : "transparent",
            color: i <= rating ? "#F0B90B" : "#5E6673",
          }}
        />
      ))}
    </div>
  );
}

function InteractiveStars({
  rating,
  onSelect,
  size = 20,
}: {
  rating: number;
  onSelect: (r: number) => void;
  size?: number;
}) {
  const [hovered, setHovered] = useState(0);
  const display = hovered || rating;

  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          onClick={() => onSelect(i)}
          onMouseEnter={() => setHovered(i)}
          onMouseLeave={() => setHovered(0)}
          className="transition-transform hover:scale-110"
        >
          <Star
            className="shrink-0"
            style={{
              width: size,
              height: size,
              fill: i <= display ? "#F0B90B" : "transparent",
              color: i <= display ? "#F0B90B" : "#5E6673",
              transition: "fill 0.15s, color 0.15s",
            }}
          />
        </button>
      ))}
    </div>
  );
}

// ── Review Card (for event-based reviews) ────────

function ReviewEventCard({
  review,
  index,
}: {
  review: ReviewEvent;
  index: number;
}) {
  return (
    <motion.div
      className="card p-4 relative overflow-hidden group"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.05 + index * 0.03, ease }}
      whileHover={{ y: -2, borderColor: "rgba(88,176,89,0.15)" }}
    >
      <motion.div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-lob-green/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

      {/* Header: reviewer -> subject */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-xs min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <div className="w-5 h-5 rounded-full bg-surface-2 border border-border/50 flex items-center justify-center shrink-0">
              <User className="w-2.5 h-2.5 text-text-tertiary" />
            </div>
            <Link
              href={`/profile/${review.reviewer}`}
              className="text-text-secondary hover:text-lob-green transition-colors font-mono truncate"
            >
              {truncateAddress(review.reviewer)}
            </Link>
          </div>
          <ArrowRight className="w-3 h-3 text-text-tertiary shrink-0" />
          <Link
            href={`/profile/${review.subject}`}
            className="text-text-primary hover:text-lob-green transition-colors font-mono font-medium truncate"
          >
            {truncateAddress(review.subject)}
          </Link>
        </div>
        <span className="text-[10px] text-text-tertiary tabular-nums shrink-0 ml-2">
          Review #{review.reviewId.toString()}
        </span>
      </div>

      {/* Rating + Job ID */}
      <div className="flex items-center gap-3 mb-2">
        <Stars rating={review.rating} />
        <span className="text-[10px] text-text-tertiary tabular-nums">
          Job #{review.jobId.toString()}
        </span>
      </div>

      {/* Metadata URI */}
      {review.metadataURI && (
        <p className="text-xs text-text-secondary leading-relaxed truncate">
          {review.metadataURI}
        </p>
      )}
    </motion.div>
  );
}

// ── Submit Review Form ──────────────────────────

function SubmitReviewForm({ onSuccess }: { onSuccess?: () => void }) {
  const { address } = useAccount();
  const { fn: submitReview, isPending, isError, error, reset } = useSubmitReview();

  const [jobIdInput, setJobIdInput] = useState("");
  const [rating, setRating] = useState(0);
  const [metadataURI, setMetadataURI] = useState("");
  const [txSuccess, setTxSuccess] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);

  // Check if user already reviewed this job
  const jobIdBigInt = jobIdInput ? BigInt(jobIdInput) : undefined;
  const existingReview = useReviewByJobAndReviewer(
    jobIdBigInt,
    address as `0x${string}` | undefined
  );
  const alreadyReviewed =
    existingReview.data &&
    typeof existingReview.data === "object" &&
    "id" in (existingReview.data as Record<string, unknown>) &&
    (existingReview.data as { id: bigint }).id > 0n;

  const canSubmit =
    !!address && !!jobIdInput && rating >= 1 && rating <= 5 && !isPending && !alreadyReviewed;

  const handleSubmit = useCallback(async () => {
    if (!canSubmit || !jobIdBigInt) return;
    setTxError(null);
    setTxSuccess(false);
    reset();

    try {
      await submitReview(jobIdBigInt, rating, metadataURI);
      setTxSuccess(true);
      setJobIdInput("");
      setRating(0);
      setMetadataURI("");
      onSuccess?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Transaction failed";
      setTxError(msg.includes("user rejected") ? "Transaction rejected" : msg);
    }
  }, [canSubmit, jobIdBigInt, rating, metadataURI, submitReview, reset, onSuccess]);

  if (!address) {
    return (
      <div className="card p-6 text-center">
        <div className="w-10 h-10 rounded-full border border-border mx-auto mb-3 flex items-center justify-center">
          <User className="w-4 h-4 text-text-tertiary" />
        </div>
        <p className="text-sm text-text-secondary mb-1">Connect your wallet to submit reviews</p>
        <p className="text-[10px] text-text-tertiary">
          Reviews are tied to completed escrow jobs
        </p>
      </div>
    );
  }

  return (
    <div className="card p-5">
      <h3 className="text-[10px] sm:text-xs font-semibold text-text-primary uppercase tracking-wider mb-4">
        Submit Review
      </h3>

      <div className="space-y-4">
        {/* Job ID */}
        <div>
          <label className="text-[10px] text-text-tertiary uppercase tracking-wider mb-1.5 block">
            Job ID
          </label>
          <input
            type="number"
            min="0"
            value={jobIdInput}
            onChange={(e) => {
              setJobIdInput(e.target.value);
              setTxSuccess(false);
              setTxError(null);
            }}
            placeholder="Enter completed job ID..."
            className="w-full bg-surface-1 border border-border rounded-lg px-3 py-2.5 text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-lob-green/40 transition-colors tabular-nums"
          />
          {alreadyReviewed && (
            <p className="text-[10px] text-amber-400 mt-1 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              You already reviewed this job
            </p>
          )}
        </div>

        {/* Rating */}
        <div>
          <label className="text-[10px] text-text-tertiary uppercase tracking-wider mb-1.5 block">
            Rating
          </label>
          <div className="flex items-center gap-3">
            <InteractiveStars rating={rating} onSelect={setRating} />
            {rating > 0 && (
              <span className="text-xs text-text-secondary tabular-nums">
                {rating}/5
              </span>
            )}
          </div>
        </div>

        {/* Metadata URI */}
        <div>
          <label className="text-[10px] text-text-tertiary uppercase tracking-wider mb-1.5 block">
            Metadata URI (optional)
          </label>
          <input
            type="text"
            value={metadataURI}
            onChange={(e) => setMetadataURI(e.target.value)}
            placeholder="ipfs://... or https://..."
            className="w-full bg-surface-1 border border-border rounded-lg px-3 py-2.5 text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-lob-green/40 transition-colors"
          />
        </div>

        {/* Submit Button */}
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="w-full flex items-center justify-center gap-2 bg-lob-green/10 border border-lob-green/30 text-lob-green rounded-lg py-2.5 text-xs font-medium hover:bg-lob-green/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isPending ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Submitting...
            </>
          ) : (
            <>
              <Send className="w-3.5 h-3.5" />
              Submit Review
            </>
          )}
        </button>

        {/* Feedback */}
        <AnimatePresence>
          {txSuccess && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="flex items-center gap-2 text-xs text-lob-green"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Review submitted on-chain!
            </motion.div>
          )}
          {(txError || isError) && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="flex items-start gap-2 text-xs text-red-400"
            >
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span className="break-all">
                {txError || error?.message || "Transaction failed"}
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ── My Rating Stats Card ────────────────────────

function MyRatingCard({ address }: { address: `0x${string}` }) {
  const avgRating = useAverageRating(address);
  const stats = useRatingStats(address);

  const avgData = avgRating.data as [bigint, bigint] | undefined;
  const numerator = avgData?.[0] ?? 0n;
  const denominator = avgData?.[1] ?? 0n;
  const avg = denominator > 0n ? Number(numerator) / Number(denominator) : 0;

  const statsData = stats.data as { totalRatings: bigint; sumRatings: bigint } | undefined;
  const totalRatings = Number(statsData?.totalRatings ?? 0n);

  return (
    <motion.div
      className="card p-5 relative overflow-hidden group"
      variants={fadeUp}
      whileHover={{ y: -2 }}
    >
      <motion.div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-lob-green/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

      <h3 className="text-[10px] sm:text-xs font-semibold text-text-primary uppercase tracking-wider mb-3">
        My Reputation
      </h3>

      <div className="flex items-center gap-4 mb-3">
        <div>
          <p className="text-2xl font-bold text-text-primary tabular-nums">
            {denominator > 0n ? avg.toFixed(1) : "--"}
          </p>
          <p className="text-[9px] text-text-tertiary uppercase tracking-wider">
            Avg Rating
          </p>
        </div>
        <div>
          <Stars rating={Math.round(avg)} size={16} />
        </div>
      </div>

      <div className="flex items-center gap-4 text-xs text-text-secondary">
        <div className="flex items-center gap-1.5">
          <MessageSquare className="w-3 h-3 text-text-tertiary" />
          <span className="tabular-nums">{totalRatings}</span>
          <span className="text-text-tertiary">
            review{totalRatings !== 1 ? "s" : ""}
          </span>
        </div>
        {denominator > 0n && (
          <div className="flex items-center gap-1.5 text-text-tertiary">
            <span className="tabular-nums text-[10px]">
              ({numerator.toString()}/{denominator.toString()})
            </span>
          </div>
        )}
      </div>

      {(avgRating.isLoading || stats.isLoading) && (
        <div className="absolute inset-0 bg-surface-0/60 flex items-center justify-center">
          <Loader2 className="w-4 h-4 text-text-tertiary animate-spin" />
        </div>
      )}
    </motion.div>
  );
}

// ── Tab Button ──────────────────────────────────

function TabButton({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-2 text-xs font-medium rounded-lg transition-colors relative ${
        active
          ? "bg-lob-green/10 text-lob-green border border-lob-green/30"
          : "text-text-tertiary hover:text-text-secondary hover:bg-surface-1"
      }`}
    >
      {label}
      {count !== undefined && count > 0 && (
        <span
          className={`ml-1.5 text-[10px] tabular-nums ${
            active ? "text-lob-green/70" : "text-text-tertiary"
          }`}
        >
          ({count})
        </span>
      )}
    </button>
  );
}

// ── Main Page ────────────────────────────────────

export default function ReviewsPage() {
  const { address, isConnected } = useAccount();
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"received" | "given" | "submit">(
    "received"
  );

  // Fetch review history via events
  const reviewHistory = useReviewHistory(address as `0x${string}` | undefined);
  const given = reviewHistory.data?.given ?? [];
  const received = reviewHistory.data?.received ?? [];

  // On-chain stats for connected user
  const avgRating = useAverageRating(address as `0x${string}` | undefined);
  const ratingStats = useRatingStats(address as `0x${string}` | undefined);

  const avgData = avgRating.data as [bigint, bigint] | undefined;
  const numerator = avgData?.[0] ?? 0n;
  const denominator = avgData?.[1] ?? 0n;
  const avg = denominator > 0n ? Number(numerator) / Number(denominator) : 0;

  const statsData = ratingStats.data as
    | { totalRatings: bigint; sumRatings: bigint }
    | undefined;
  const totalOnChain = Number(statsData?.totalRatings ?? 0n);

  // Current tab reviews
  const currentReviews = activeTab === "given" ? given : received;

  const filteredReviews = useMemo(() => {
    if (!search) return currentReviews;
    const q = search.toLowerCase();
    return currentReviews.filter(
      (r) =>
        r.reviewer.toLowerCase().includes(q) ||
        r.subject.toLowerCase().includes(q) ||
        r.metadataURI.toLowerCase().includes(q) ||
        r.jobId.toString().includes(q) ||
        r.reviewId.toString().includes(q)
    );
  }, [search, currentReviews]);

  // Stats
  const STATS = [
    {
      label: "Reviews Received",
      value: isConnected ? String(totalOnChain || received.length) : "--",
      icon: MessageSquare,
      color: "#58B059",
    },
    {
      label: "Avg Rating",
      value: isConnected && denominator > 0n ? avg.toFixed(1) : "--",
      icon: Star,
      color: "#F0B90B",
    },
    {
      label: "Reviews Given",
      value: isConnected ? String(given.length) : "--",
      icon: Send,
      color: "#3B82F6",
    },
    {
      label: "Top Score",
      value:
        isConnected && denominator > 0n
          ? `${numerator.toString()}/${denominator.toString()}`
          : "--",
      icon: TrendingUp,
      color: "#A855F7",
    },
  ];

  return (
    <motion.div initial="hidden" animate="show" variants={stagger}>
      {/* Header */}
      <motion.div variants={fadeUp} className="mb-6">
        <h1 className="text-xl font-bold text-text-primary">Reviews</h1>
        <p className="text-xs text-text-tertiary mt-0.5">
          Trust through transparency &mdash; on-chain reputation
        </p>
      </motion.div>

      {/* Stats Banner */}
      <motion.div
        variants={fadeUp}
        className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6"
      >
        {STATS.map((stat, i) => {
          const Icon = stat.icon;
          return (
            <motion.div
              key={stat.label}
              className="card p-4 relative overflow-hidden group"
              initial={{ opacity: 0, y: 12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.4, delay: 0.1 + i * 0.05, ease }}
              whileHover={{ y: -2 }}
            >
              <motion.div
                className="absolute top-0 left-0 right-0 h-px opacity-0 group-hover:opacity-100 transition-opacity"
                style={{
                  background: `linear-gradient(to right, transparent, ${stat.color}30, transparent)`,
                }}
              />
              <Icon
                className="w-4 h-4 mb-2"
                style={{ color: stat.color }}
              />
              <p className="text-lg sm:text-xl font-bold text-text-primary tabular-nums">
                {stat.value}
              </p>
              <p className="text-[9px] text-text-tertiary uppercase tracking-wider mt-0.5">
                {stat.label}
              </p>
            </motion.div>
          );
        })}
      </motion.div>

      {/* My Rating Card (connected only) */}
      {isConnected && address && (
        <motion.div variants={fadeUp} className="mb-6">
          <MyRatingCard address={address as `0x${string}`} />
        </motion.div>
      )}

      {/* Tabs */}
      <motion.div variants={fadeUp} className="flex items-center gap-2 mb-4">
        <TabButton
          active={activeTab === "received"}
          label="Reviews of Me"
          count={received.length}
          onClick={() => setActiveTab("received")}
        />
        <TabButton
          active={activeTab === "given"}
          label="My Reviews"
          count={given.length}
          onClick={() => setActiveTab("given")}
        />
        <TabButton
          active={activeTab === "submit"}
          label="Submit Review"
          onClick={() => setActiveTab("submit")}
        />
      </motion.div>

      {/* Submit Tab */}
      <AnimatePresence mode="wait">
        {activeTab === "submit" && (
          <motion.div
            key="submit"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="mb-6"
          >
            <SubmitReviewForm
              onSuccess={() => {
                reviewHistory.refetch();
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Search Bar (for review tabs) */}
      {activeTab !== "submit" && (
        <>
          <motion.div variants={fadeUp} className="mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-tertiary" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by address, job ID, or keyword..."
                className="w-full bg-surface-1 border border-border rounded-lg pl-9 pr-3 py-2.5 text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-lob-green/40 transition-colors"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-text-tertiary hover:text-text-secondary"
                >
                  Clear
                </button>
              )}
            </div>
          </motion.div>

          {/* Results Count */}
          <motion.div variants={fadeUp} className="mb-3">
            <p className="text-xs text-text-tertiary">
              {filteredReviews.length} review
              {filteredReviews.length !== 1 ? "s" : ""} found
            </p>
          </motion.div>

          {/* Reviews Feed */}
          <AnimatePresence mode="wait">
            {!isConnected ? (
              <motion.div
                key="connect"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="card px-4 py-16 text-center"
              >
                <div className="w-10 h-10 rounded-full border border-border mx-auto mb-3 flex items-center justify-center">
                  <User className="w-4 h-4 text-text-tertiary" />
                </div>
                <p className="text-sm text-text-secondary">
                  Connect your wallet to view your reviews
                </p>
              </motion.div>
            ) : reviewHistory.isLoading ? (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="card px-4 py-16 text-center"
              >
                <Loader2 className="w-6 h-6 text-text-tertiary animate-spin mx-auto mb-3" />
                <p className="text-sm text-text-secondary">
                  Scanning on-chain reviews...
                </p>
              </motion.div>
            ) : filteredReviews.length === 0 ? (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="card px-4 py-16 text-center"
              >
                <motion.div
                  className="w-12 h-12 rounded-full border border-border mx-auto mb-4 flex items-center justify-center"
                  animate={{
                    borderColor: [
                      "rgba(30,36,49,1)",
                      "rgba(88,176,89,0.3)",
                      "rgba(30,36,49,1)",
                    ],
                  }}
                  transition={{ duration: 3, repeat: Infinity }}
                >
                  <motion.span
                    className="block w-2 h-2 rounded-full bg-lob-green/40"
                    animate={{
                      scale: [1, 1.4, 1],
                      opacity: [0.4, 0.8, 0.4],
                    }}
                    transition={{ duration: 2, repeat: Infinity }}
                  />
                </motion.div>
                <p className="text-sm text-text-secondary">
                  {search
                    ? "No reviews match your search"
                    : activeTab === "given"
                      ? "You haven't submitted any reviews yet"
                      : "No reviews received yet"}
                </p>
                {search && (
                  <button
                    onClick={() => setSearch("")}
                    className="text-xs text-lob-green mt-2 hover:underline"
                  >
                    Clear search
                  </button>
                )}
              </motion.div>
            ) : (
              <motion.div
                key="feed"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-3"
              >
                {filteredReviews.map((review, i) => (
                  <ReviewEventCard
                    key={`${review.reviewId}-${review.transactionHash}`}
                    review={review}
                    index={i}
                  />
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Rating Distribution (recharts bar chart) */}
          {isConnected && received.length > 0 && activeTab === "received" && (
            <motion.div variants={fadeUp} className="mt-8">
              <div className="card p-5">
                <h3 className="text-[10px] sm:text-xs font-semibold text-text-primary uppercase tracking-wider mb-4">
                  Rating Distribution
                </h3>
                {(() => {
                  const RATING_COLORS = ["#EF4444", "#F97316", "#F0B90B", "#84CC16", "#58B059"];
                  const chartData = [1, 2, 3, 4, 5].map((ratingVal) => ({
                    name: `${ratingVal}`,
                    count: received.filter((r) => r.rating === ratingVal).length,
                    fill: RATING_COLORS[ratingVal - 1],
                  }));
                  return (
                    <div className="h-[140px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                          <XAxis
                            dataKey="name"
                            tick={{ fontSize: 11, fill: "#848E9C" }}
                            axisLine={false}
                            tickLine={false}
                            label={{ value: "Stars", position: "insideBottom", offset: -2, style: { fontSize: 9, fill: "#5E6673" } }}
                          />
                          <YAxis
                            tick={{ fontSize: 10, fill: "#5E6673" }}
                            axisLine={false}
                            tickLine={false}
                            allowDecimals={false}
                          />
                          <Tooltip
                            contentStyle={{ background: "#1E2431", border: "1px solid #2A3142", borderRadius: "8px", fontSize: "10px" }}
                            itemStyle={{ color: "#EAECEF" }}
                            formatter={(value: number | undefined) => [`${value ?? 0} review${(value ?? 0) !== 1 ? "s" : ""}`, "Count"]}
                            labelFormatter={(label) => `${label} Star${Number(label) !== 1 ? "s" : ""}`}
                          />
                          <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                            {chartData.map((entry, idx) => (
                              <Cell key={idx} fill={entry.fill} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  );
                })()}
              </div>
            </motion.div>
          )}
        </>
      )}
    </motion.div>
  );
}
