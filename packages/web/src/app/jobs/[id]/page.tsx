"use client";

import { useParams } from "next/navigation";
import { useAccount } from "wagmi";
import { motion } from "framer-motion";
import Link from "next/link";
import { stagger, fadeUp, ease } from "@/lib/motion";
import { useJob, useJobPayer } from "@/lib/hooks";
import { formatEther } from "viem";
import dynamic from "next/dynamic";
import { getExplorerUrl } from "@/config/contracts";

const DeliverySubmission = dynamic(
  () => import("./_components/DeliverySubmission"),
  { ssr: false }
);
const DeliveryReview = dynamic(
  () => import("./_components/DeliveryReview"),
  { ssr: false }
);
const BridgeRefundClaim = dynamic(
  () => import("./_components/BridgeRefundClaim"),
  { ssr: false }
);
const ReviewForm = dynamic(
  () => import("./_components/ReviewForm"),
  { ssr: false }
);

// On-chain JobStatus enum: 0=Active, 1=Delivered, 2=Completed, 3=Disputed, 4=Refunded
const JOB_STATUS_LABELS: Record<number, string> = {
  0: "Active",
  1: "Delivered",
  2: "Completed",
  3: "Disputed",
  4: "Refunded",
};

const JOB_STATUS_COLORS: Record<number, { bg: string; text: string; border: string }> = {
  0: { bg: "bg-lob-green/10", text: "text-lob-green", border: "border-lob-green/20" },
  1: { bg: "bg-yellow-500/10", text: "text-yellow-400", border: "border-yellow-400/20" },
  2: { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-400/20" },
  3: { bg: "bg-red-500/10", text: "text-red-400", border: "border-red-400/20" },
  4: { bg: "bg-purple-500/10", text: "text-purple-400", border: "border-purple-400/20" },
};

export default function JobDetailPage() {
  const params = useParams();
  const jobIdStr = params.id as string;
  const { isConnected, address } = useAccount();

  const isValidId = /^\d+$/.test(jobIdStr);
  const { data: jobData, isLoading, isError, refetch } = useJob(
    isValidId ? BigInt(jobIdStr) : undefined
  );

  // Type the on-chain job struct
  const job = jobData as
    | {
        id: bigint;
        listingId: bigint;
        buyer: `0x${string}`;
        seller: `0x${string}`;
        amount: bigint;
        token: `0x${string}`;
        fee: bigint;
        status: number;
        createdAt: bigint;
        disputeWindowEnd: bigint;
        deliveryMetadataURI: string;
      }
    | undefined;

  // x402 bridge detection — must be called before any early returns (React rules of hooks)
  const { data: bridgePayer } = useJobPayer(
    isValidId && job ? job.id : undefined
  );

  if (!isValidId) {
    return (
      <div className="max-w-3xl mx-auto flex flex-col items-center justify-center py-24 text-center">
        <div className="card p-8 space-y-4">
          <p className="text-lg font-semibold text-text-primary">Job not found</p>
          <p className="text-sm text-text-tertiary">Invalid job ID.</p>
          <Link href="/jobs" className="inline-block mt-2 text-sm font-medium text-lob-green hover:text-lob-green/80">
            Back to Jobs
          </Link>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="card p-5 animate-pulse">
            <div className="h-4 bg-surface-3 rounded w-1/3 mb-3" />
            <div className="h-3 bg-surface-3 rounded w-2/3 mb-2" />
            <div className="h-3 bg-surface-3 rounded w-1/2" />
          </div>
        ))}
      </div>
    );
  }

  if (!job || isError || job.buyer === "0x0000000000000000000000000000000000000000") {
    return (
      <div className="max-w-3xl mx-auto flex flex-col items-center justify-center py-24 text-center">
        <div className="card p-8 space-y-4">
          <p className="text-lg font-semibold text-text-primary">Job not found</p>
          <p className="text-sm text-text-tertiary">This job does not exist.</p>
          <Link href="/jobs" className="inline-block mt-2 text-sm font-medium text-lob-green hover:text-lob-green/80">
            Back to Jobs
          </Link>
        </div>
      </div>
    );
  }

  const isBridgeJob = !!bridgePayer && bridgePayer !== "0x0000000000000000000000000000000000000000";
  const isDirectBuyer = address?.toLowerCase() === job.buyer.toLowerCase();
  const isBridgeBuyer = isBridgeJob && address?.toLowerCase() === (bridgePayer as string)?.toLowerCase();
  const isBuyer = isDirectBuyer || isBridgeBuyer;
  const isSeller = address?.toLowerCase() === job.seller.toLowerCase();
  const statusNum = Number(job.status);
  const statusLabel = JOB_STATUS_LABELS[statusNum] ?? "Unknown";
  const statusColors = JOB_STATUS_COLORS[statusNum] ?? JOB_STATUS_COLORS[0];
  const displayAmount = Number(formatEther(job.amount));
  const displayFee = Number(formatEther(job.fee));
  const createdDate = new Date(Number(job.createdAt) * 1000).toLocaleDateString();
  const disputeWindowDate = Number(job.disputeWindowEnd) > 0
    ? new Date(Number(job.disputeWindowEnd) * 1000).toLocaleDateString()
    : "--";

  return (
    <motion.div
      className="max-w-3xl mx-auto"
      initial="hidden"
      animate="show"
      variants={stagger}
    >
      {/* Breadcrumb */}
      <motion.div variants={fadeUp} className="flex items-center gap-2 text-xs text-text-tertiary mb-4">
        <Link href="/jobs" className="hover:text-text-secondary transition-colors">
          Jobs
        </Link>
        <span>/</span>
        <span className="text-text-secondary tabular-nums">#{jobIdStr}</span>
      </motion.div>

      {/* Header */}
      <motion.div variants={fadeUp} className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <span
            className={`text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded ${statusColors.bg} ${statusColors.text} border ${statusColors.border}`}
          >
            {statusLabel}
          </span>
          {isBridgeJob && (
            <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-400 border border-orange-400/20">
              x402
            </span>
          )}
          {isBuyer && (
            <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-400/20">
              Buyer
            </span>
          )}
          {isSeller && (
            <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-lob-green-muted text-lob-green border border-lob-green/20">
              Seller
            </span>
          )}
        </div>
        <h1 className="text-xl font-bold text-text-primary">
          Job #{jobIdStr}
        </h1>
      </motion.div>

      {/* Job details grid */}
      <motion.div variants={fadeUp} className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-text-primary mb-3">Details</h2>
          <div className="space-y-3">
            {[
              { label: "Amount", value: `${displayAmount.toLocaleString()} LOB` },
              { label: "Protocol Fee", value: `${displayFee.toLocaleString()} LOB` },
              { label: "Listing", value: `#${job.listingId.toString()}`, href: `/listing/${job.listingId}` },
              { label: "Created", value: createdDate },
              { label: "Dispute Window", value: disputeWindowDate },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between">
                <span className="text-xs text-text-tertiary">{item.label}</span>
                {"href" in item && item.href ? (
                  <Link href={item.href} className="text-xs text-lob-green hover:underline tabular-nums">
                    {item.value}
                  </Link>
                ) : (
                  <span className="text-xs text-text-primary font-medium tabular-nums">
                    {item.value}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="card p-5">
          <h2 className="text-sm font-semibold text-text-primary mb-3">Parties</h2>
          <div className="space-y-4">
            <div>
              <p className="text-xs text-text-tertiary mb-1">
                Buyer{isBridgeJob ? " (x402 payer)" : ""}
              </p>
              <Link
                href={`/forum/u/${isBridgeJob ? bridgePayer : job.buyer}`}
                className="text-xs text-text-primary font-mono hover:text-lob-green transition-colors"
              >
                {isBridgeJob
                  ? `${(bridgePayer as string).slice(0, 6)}...${(bridgePayer as string).slice(-4)}`
                  : `${job.buyer.slice(0, 6)}...${job.buyer.slice(-4)}`}
              </Link>
            </div>
            <div>
              <p className="text-xs text-text-tertiary mb-1">Seller</p>
              <Link
                href={`/forum/u/${job.seller}`}
                className="text-xs text-text-primary font-mono hover:text-lob-green transition-colors"
              >
                {job.seller.slice(0, 6)}...{job.seller.slice(-4)}
              </Link>
            </div>
            {(isBuyer || isSeller) && (
              <Link
                href={`/forum/messages?compose=${isBuyer ? job.seller : (isBridgeJob ? bridgePayer : job.buyer)}`}
                className="inline-block mt-2 text-xs py-1.5 px-3 rounded border border-border text-text-secondary hover:border-lob-green/30 hover:text-lob-green transition-colors"
              >
                Message {isBuyer ? "Seller" : "Buyer"}
              </Link>
            )}
          </div>
        </div>
      </motion.div>

      {/* Action area based on role + status */}
      <motion.div variants={fadeUp}>
        {/* Seller can submit delivery when job is Active */}
        {isSeller && statusNum === 0 && (
          <DeliverySubmission jobId={job.id} onSuccess={() => refetch()} />
        )}

        {/* Buyer can review delivery when job is Delivered */}
        {isBuyer && statusNum === 1 && (
          <DeliveryReview
            jobId={job.id}
            deliveryMetadataURI={job.deliveryMetadataURI}
            disputeWindowEnd={Number(job.disputeWindowEnd)}
            onConfirm={() => refetch()}
            isBridgeJob={isBridgeJob}
          />
        )}

        {/* Seller waiting for buyer review */}
        {isSeller && statusNum === 1 && (
          <div className="card p-5 text-center">
            <div className="w-10 h-10 rounded-full bg-yellow-500/10 flex items-center justify-center mx-auto mb-3">
              <motion.div
                className="w-2 h-2 rounded-full bg-yellow-400"
                animate={{ scale: [1, 1.3, 1], opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
            </div>
            <p className="text-sm text-text-secondary">Awaiting buyer review</p>
            <p className="text-xs text-text-tertiary mt-1">
              The buyer is reviewing your delivery. Funds will be released after confirmation.
            </p>
          </div>
        )}

        {/* Completed state */}
        {statusNum === 2 && (
          <div className="space-y-4">
            <div className="card p-5 text-center">
              <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-3">
                <span className="text-emerald-400 text-lg">{"\u2713"}</span>
              </div>
              <p className="text-sm text-text-secondary">Job Completed</p>
              <p className="text-xs text-text-tertiary mt-1">
                Delivery confirmed and funds released to seller.
              </p>
            </div>
            {(isBuyer || isSeller) && (
              <ReviewForm
                jobId={jobIdStr}
                revieweeAddress={isBuyer ? job.seller : job.buyer}
                role={isBuyer ? "buyer" : "seller"}
                onSuccess={() => {}}
              />
            )}
          </div>
        )}

        {/* Refund claim for resolved bridge disputes */}
        {isBridgeJob && statusNum === 4 && isBuyer && (
          <BridgeRefundClaim jobId={job.id} onClaim={() => refetch()} />
        )}

        {/* Disputed state */}
        {statusNum === 3 && (
          <div className="card p-5 text-center">
            <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-3">
              <span className="text-red-400 text-lg">!</span>
            </div>
            <p className="text-sm text-text-secondary">Under Dispute</p>
            <p className="text-xs text-text-tertiary mt-1">
              This job is being reviewed by arbitrators.
            </p>
          </div>
        )}

        {/* Not a participant */}
        {!isBuyer && !isSeller && isConnected && (
          <div className="card p-5 text-center">
            <p className="text-xs text-text-tertiary">
              You are not a party to this job.
            </p>
          </div>
        )}

        {!isConnected && (
          <div className="card p-5 text-center">
            <p className="text-xs text-text-tertiary">
              Connect your wallet to interact with this job.
            </p>
          </div>
        )}
      </motion.div>

      {/* Transaction link */}
      <motion.div variants={fadeUp} className="mt-4 text-center">
        <a
          href={getExplorerUrl("address", job.buyer)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] text-text-tertiary hover:text-lob-green transition-colors"
        >
          View on BaseScan
        </a>
      </motion.div>
    </motion.div>
  );
}
