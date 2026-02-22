"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { stagger, fadeUp, ease } from "@/lib/motion";
import { useForum } from "@/lib/forum-context";
import { MOD_LOG, getUserByAddress, timeAgo } from "@/lib/forum-data";
import ModBadge from "@/components/forum/ModBadge";
import ForumBreadcrumb from "@/components/forum/ForumBreadcrumb";
import EmptyState from "@/components/forum/EmptyState";
import dynamic from "next/dynamic";

const SybilPrefilter = dynamic(() => import("@/components/forum/SybilPrefilter"), {
  ssr: false,
  loading: () => (
    <div className="card p-8 text-center">
      <p className="text-xs text-text-tertiary">Loading...</p>
    </div>
  ),
});

const REASON_COLORS: Record<string, string> = {
  scam: "text-lob-red",
  spam: "text-amber-400",
  harassment: "text-orange-400",
  impersonation: "text-purple-400",
  other: "text-text-secondary",
};

interface ReportEntry {
  id: string;
  reporter: string;
  targetType: string;
  targetId: string;
  reason: string;
  description: string;
  evidence: {
    postId?: string;
    listingId?: string;
    targetAddress?: string;
    txHashes: string[];
    timestamps: number[];
    capturedAt: number;
  };
  status: string;
  createdAt: number;
}

function ReviewQueue({ isAuthenticated }: { isAuthenticated: boolean }) {
  const [reports, setReports] = useState<ReportEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated) return;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/forum/mod/reports", {
          credentials: "include",
        });
        if (res.ok) {
          const data = await res.json();
          setReports(data.reports ?? []);
        }
      } catch {
        // Ignore
      } finally {
        setLoading(false);
      }
    })();
  }, [isAuthenticated]);

  const handleAction = async (
    reportId: string,
    newStatus: "reviewed" | "actioned" | "dismissed"
  ) => {
    try {
      const res = await fetch("/api/forum/mod/reports", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: reportId, status: newStatus }),
      });
      if (res.ok) {
        setReports((prev) => prev.filter((r) => r.id !== reportId));
      }
    } catch {
      // Ignore
    }
  };

  if (loading) {
    return (
      <div className="card p-8 text-center">
        <p className="text-xs text-text-tertiary">Loading reports...</p>
      </div>
    );
  }

  if (reports.length === 0) {
    return (
      <div className="card p-8 text-center">
        <p className="text-sm text-text-secondary">No items in the review queue</p>
        <p className="text-xs text-text-tertiary mt-1">
          Flagged posts and reports will appear here
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-text-tertiary mb-2">
        {reports.length} pending report{reports.length !== 1 ? "s" : ""}
      </p>
      {reports.map((report, i) => (
        <motion.div
          key={report.id}
          className="p-3 rounded border border-border/30 space-y-2"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.03, ease }}
        >
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`text-xs font-medium uppercase ${
                REASON_COLORS[report.reason] ?? "text-text-secondary"
              }`}
            >
              {report.reason}
            </span>
            <span className="text-[10px] text-text-tertiary">
              {report.targetType} &middot; {report.targetId}
            </span>
            <span className="text-[10px] text-text-tertiary ml-auto">
              {timeAgo(report.createdAt)}
            </span>
          </div>
          <p className="text-xs text-text-secondary">{report.description}</p>
          {report.evidence?.targetAddress && (
            <p className="text-[10px] font-mono text-text-tertiary">
              Target: {report.evidence.targetAddress.slice(0, 10)}...
            </p>
          )}
          {report.evidence?.txHashes?.length > 0 && (
            <div className="flex gap-1 flex-wrap">
              {report.evidence.txHashes.map((hash) => (
                <a
                  key={hash}
                  href={`https://basescan.org/tx/${hash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] font-mono text-lob-green hover:underline"
                >
                  {hash.slice(0, 10)}...
                </a>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2 pt-1">
            <motion.button
              onClick={() => handleAction(report.id, "reviewed")}
              className="px-2 py-1 rounded text-[10px] font-medium text-text-secondary border border-border hover:bg-surface-3 transition-colors"
              whileTap={{ scale: 0.95 }}
            >
              Review
            </motion.button>
            <motion.button
              onClick={() => handleAction(report.id, "dismissed")}
              className="px-2 py-1 rounded text-[10px] font-medium text-text-tertiary border border-border hover:bg-surface-3 transition-colors"
              whileTap={{ scale: 0.95 }}
            >
              Dismiss
            </motion.button>
            <motion.button
              onClick={() => handleAction(report.id, "actioned")}
              className="px-2 py-1 rounded text-[10px] font-medium text-lob-red border border-lob-red/30 hover:bg-lob-red/10 transition-colors"
              whileTap={{ scale: 0.95 }}
            >
              Escalate to SybilGuard
            </motion.button>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

const ACTION_COLORS: Record<string, string> = {
  remove: "text-lob-red",
  lock: "text-amber-400",
  pin: "text-lob-green",
  warn: "text-amber-400",
  ban: "text-lob-red",
  ip_ban: "text-lob-red",
  ip_unban: "text-lob-green",
};

interface BannedIpRow {
  ip: string;
  reason?: string;
  bannedBy?: string;
  bannedAt?: number;
  scope?: string;
}

export default function ModDashboardPage() {
  const { currentUser, isConnected, isAuthenticated } = useForum();
  const [activeTab, setActiveTab] = useState<"queue" | "log" | "ip_bans" | "sybil" | "apply">("log");

  // IP bans state
  const [bannedIps, setBannedIps] = useState<BannedIpRow[]>([]);
  const [ipLoading, setIpLoading] = useState(false);
  const [banIp, setBanIp] = useState("");
  const [banReason, setBanReason] = useState("");
  const [banSubmitting, setBanSubmitting] = useState(false);
  const [banError, setBanError] = useState("");
  const [banSuccess, setBanSuccess] = useState("");

  // Mod application state
  const [applyTier, setApplyTier] = useState("community");
  const [applyReason, setApplyReason] = useState("");
  const [applySubmitting, setApplySubmitting] = useState(false);
  const [applyError, setApplyError] = useState("");
  const [applySuccess, setApplySuccess] = useState(false);

  const fetchBannedIps = useCallback(async () => {
    if (!isAuthenticated) return;
    setIpLoading(true);
    try {
      const res = await fetch("/api/mod/ip-bans", {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setBannedIps(data.bans ?? []);
      }
    } catch {
      // Ignore fetch errors
    } finally {
      setIpLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (activeTab === "ip_bans" && isAuthenticated) {
      fetchBannedIps();
    }
  }, [activeTab, isAuthenticated, fetchBannedIps]);

  const handleBanIp = async () => {
    if (!banIp.trim() || !isAuthenticated) return;
    setBanSubmitting(true);
    setBanError("");
    setBanSuccess("");

    try {
      const res = await fetch("/api/mod/ip-ban", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ip: banIp.trim(), reason: banReason.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        setBanError(data.error || "Failed to ban IP");
      } else {
        setBanSuccess(`Banned ${banIp.trim()}`);
        setBanIp("");
        setBanReason("");
        fetchBannedIps();
      }
    } catch {
      setBanError("Network error");
    } finally {
      setBanSubmitting(false);
    }
  };

  const handleUnbanIp = async (ip: string) => {
    if (!isAuthenticated) return;
    try {
      const res = await fetch("/api/mod/ip-ban", {
        method: "DELETE",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ip, reason: "Unbanned via mod dashboard" }),
      });

      if (res.ok) {
        fetchBannedIps();
      }
    } catch {
      // Ignore
    }
  };

  const handleApply = async () => {
    if (!applyReason.trim() || applySubmitting || !isAuthenticated) return;
    setApplySubmitting(true);
    setApplyError("");

    try {
      const res = await fetch("/api/forum/mod/apply", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier: applyTier, reason: applyReason.trim() }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed to submit application (${res.status})`);
      }

      setApplySuccess(true);
      setApplyReason("");
    } catch (err) {
      setApplyError(err instanceof Error ? err.message : "Failed to submit application");
    } finally {
      setApplySubmitting(false);
    }
  };

  if (!isConnected) {
    return (
      <motion.div initial="hidden" animate="show" variants={fadeUp}>
        <ForumBreadcrumb crumbs={[{ label: "Mod Dashboard" }]} />
        <EmptyState
          title="Connect your wallet"
          subtitle="Moderator features require a connected wallet"
        />
      </motion.div>
    );
  }

  const TABS = [
    { value: "queue" as const, label: "Review Queue" },
    { value: "log" as const, label: "Mod Log" },
    { value: "ip_bans" as const, label: "IP Bans" },
    { value: "sybil" as const, label: "Sybil Prefilter" },
    { value: "apply" as const, label: "Apply" },
  ];

  return (
    <motion.div initial="hidden" animate="show" variants={stagger}>
      <ForumBreadcrumb crumbs={[{ label: "Mod Dashboard" }]} />

      <motion.div
        variants={fadeUp}
        className="flex items-center justify-between mb-4"
      >
        <h1 className="text-xl font-bold text-text-primary">
          Mod Dashboard
        </h1>
        {currentUser?.modTier && <ModBadge tier={currentUser.modTier} />}
      </motion.div>

      {/* Tabs */}
      <motion.div variants={fadeUp} className="flex gap-1 mb-6">
        {TABS.map((tab) => (
          <motion.button
            key={tab.value}
            onClick={() => setActiveTab(tab.value)}
            className={`rounded px-4 py-1.5 text-xs font-medium transition-colors relative overflow-hidden ${
              activeTab === tab.value
                ? "text-lob-green border border-lob-green/30"
                : "bg-surface-2 text-text-secondary border border-transparent hover:text-text-primary"
            }`}
            whileTap={{ scale: 0.95 }}
          >
            {activeTab === tab.value && (
              <motion.div
                layoutId="mod-tab"
                className="absolute inset-0 bg-lob-green-muted rounded -z-10"
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              />
            )}
            {tab.label}
          </motion.button>
        ))}
      </motion.div>

      {/* Queue */}
      {activeTab === "queue" && (
        <motion.div variants={fadeUp}>
          <ReviewQueue isAuthenticated={!!isAuthenticated} />
        </motion.div>
      )}

      {/* Mod Log */}
      {activeTab === "log" && (
        <motion.div variants={fadeUp} className="space-y-2">
          {MOD_LOG.map((entry, i) => {
            const mod = getUserByAddress(entry.moderator);
            return (
              <motion.div
                key={entry.id}
                className="p-3 rounded border border-border/30 flex items-start gap-3"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03, ease }}
              >
                <span
                  className={`text-xs font-medium uppercase ${
                    ACTION_COLORS[entry.action] ?? "text-text-secondary"
                  }`}
                >
                  {entry.action.replace("_", " ")}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-text-primary">{entry.target}</p>
                  <p className="text-xs text-text-tertiary mt-0.5">
                    {entry.reason}
                  </p>
                  <div className="flex items-center gap-2 mt-1 text-[10px] text-text-tertiary">
                    <span>by {mod?.displayName ?? entry.moderator}</span>
                    <span>{timeAgo(entry.createdAt)}</span>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      )}

      {/* IP Bans */}
      {activeTab === "ip_bans" && (
        <motion.div variants={fadeUp} className="space-y-4">
          {/* Ban form */}
          <div className="card p-4 space-y-3">
            <h2 className="text-sm font-semibold text-text-primary">
              Ban an IP Address
            </h2>
            <p className="text-xs text-text-tertiary">
              Platform-wide IP ban. The IP will be blocked from accessing all pages and API routes.
            </p>

            <div className="flex gap-2">
              <input
                type="text"
                placeholder="IP address (e.g. 192.168.1.1)"
                value={banIp}
                onChange={(e) => setBanIp(e.target.value)}
                className="flex-1 bg-surface-2 border border-border rounded px-3 py-2 text-sm text-text-secondary focus:border-lob-green/40 focus:outline-none font-mono"
              />
              <input
                type="text"
                placeholder="Reason"
                value={banReason}
                onChange={(e) => setBanReason(e.target.value)}
                className="flex-1 bg-surface-2 border border-border rounded px-3 py-2 text-sm text-text-secondary focus:border-lob-green/40 focus:outline-none"
              />
              <motion.button
                onClick={handleBanIp}
                disabled={banSubmitting || !banIp.trim()}
                className="px-4 py-2 rounded text-xs font-medium bg-lob-red/20 text-lob-red border border-lob-red/30 hover:bg-lob-red/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                whileTap={{ scale: 0.95 }}
              >
                {banSubmitting ? "Banning..." : "Ban IP"}
              </motion.button>
            </div>

            {banError && (
              <p className="text-xs text-lob-red">{banError}</p>
            )}
            {banSuccess && (
              <p className="text-xs text-lob-green">{banSuccess}</p>
            )}
          </div>

          {/* Active bans list */}
          <div className="card p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-text-primary">
                Active IP Bans
              </h2>
              <span className="text-[10px] text-text-tertiary tabular-nums">
                {bannedIps.length} banned
              </span>
            </div>

            {ipLoading ? (
              <p className="text-xs text-text-tertiary py-4 text-center">Loading...</p>
            ) : bannedIps.length === 0 ? (
              <p className="text-xs text-text-tertiary py-4 text-center">
                No active IP bans
              </p>
            ) : (
              <div className="space-y-1.5">
                {bannedIps.map((ban, i) => (
                  <motion.div
                    key={ban.ip}
                    className="flex items-center gap-3 p-2.5 rounded border border-border/30 bg-surface-2"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.02, ease }}
                  >
                    <span className="text-xs font-mono text-lob-red w-36 shrink-0">
                      {ban.ip}
                    </span>
                    <span className="text-xs text-text-tertiary flex-1 truncate">
                      {ban.reason || "No reason"}
                    </span>
                    <span className="text-[10px] text-text-tertiary shrink-0">
                      {ban.bannedAt
                        ? new Date(ban.bannedAt).toLocaleDateString()
                        : "—"}
                    </span>
                    <motion.button
                      onClick={() => handleUnbanIp(ban.ip)}
                      className="px-2 py-1 rounded text-[10px] font-medium text-lob-green border border-lob-green/30 hover:bg-lob-green-muted transition-colors shrink-0"
                      whileTap={{ scale: 0.95 }}
                    >
                      Unban
                    </motion.button>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* Sybil Prefilter */}
      {activeTab === "sybil" && (
        <motion.div variants={fadeUp}>
          <SybilPrefilter />
        </motion.div>
      )}

      {/* Apply */}
      {activeTab === "apply" && (
        <motion.div variants={fadeUp}>
          <div className="card p-6 space-y-4">
            <h2 className="text-sm font-semibold text-text-primary">
              Apply to Become a Moderator
            </h2>
            <p className="text-xs text-text-secondary leading-relaxed">
              Forum moderators help maintain community quality by reviewing
              posts, removing spam, and enforcing guidelines. Moderators are
              compensated weekly from the protocol treasury.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {[
                { tier: "Community", stake: "1,000 LOB", rate: "500 LOB/week" },
                { tier: "Senior", stake: "10,000 LOB", rate: "2,000 LOB/week" },
                { tier: "Lead", stake: "50,000 LOB", rate: "5,000 LOB/week" },
              ].map((t) => (
                <div
                  key={t.tier}
                  className="p-3 rounded border border-border/50 bg-surface-2"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-text-primary">
                      {t.tier}
                    </span>
                    <span className="text-xs text-lob-green tabular-nums">
                      {t.rate}
                    </span>
                  </div>
                  <p className="text-[10px] text-text-tertiary">
                    Stake: {t.stake}
                  </p>
                </div>
              ))}
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] text-text-tertiary uppercase tracking-wider block mb-1.5">
                  Desired Tier
                </label>
                <select
                  value={applyTier}
                  onChange={(e) => setApplyTier(e.target.value)}
                  className="bg-surface-2 border border-border rounded px-3 py-2 text-sm text-text-secondary focus:border-lob-green/40 focus:outline-none w-full"
                >
                  <option value="community">Community Mod (1,000 LOB stake)</option>
                  <option value="senior">Senior Mod (10,000 LOB stake)</option>
                  <option value="lead">Lead Mod (50,000 LOB stake)</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] text-text-tertiary uppercase tracking-wider block mb-1.5">
                  Why do you want to moderate?
                </label>
                <textarea
                  rows={4}
                  value={applyReason}
                  onChange={(e) => setApplyReason(e.target.value)}
                  className="input-field w-full text-sm resize-none"
                  placeholder="Tell us about your experience and motivation..."
                />
              </div>

              <motion.button
                className="btn-primary w-full"
                whileTap={{ scale: 0.97 }}
                disabled={applySubmitting || !applyReason.trim()}
                onClick={handleApply}
              >
                {applySubmitting ? "Submitting..." : "Submit Application"}
              </motion.button>

              {applyError && (
                <p className="text-xs text-lob-red">{applyError}</p>
              )}
              {applySuccess && (
                <p className="text-xs text-lob-green">
                  Application submitted! We&apos;ll review it shortly.
                </p>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
