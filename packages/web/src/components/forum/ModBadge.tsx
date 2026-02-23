"use client";

import { motion } from "framer-motion";
import type { ModTier } from "@/lib/forum-types";

const TIER_STYLES: Record<ModTier, { bg: string; text: string; border: string }> = {
  Community: { bg: "bg-lob-green-muted", text: "text-lob-green", border: "border-lob-green/20" },
  Senior: { bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-400/20" },
  Lead: { bg: "bg-purple-500/10", text: "text-purple-300", border: "border-purple-400/20" },
};

export default function ModBadge({ tier }: { tier: ModTier }) {
  const styles = TIER_STYLES[tier];

  if (tier === "Lead") {
    return (
      <motion.span
        className={`inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded border ${styles.border}`}
        style={{
          background: "linear-gradient(135deg, rgba(168,85,247,0.15), rgba(88,176,89,0.15))",
        }}
        animate={{
          backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"],
        }}
        transition={{ duration: 3, repeat: Infinity }}
      >
        <span className="bg-gradient-to-r from-purple-400 to-lob-green bg-clip-text text-transparent">
          {tier} Mod
        </span>
      </motion.span>
    );
  }

  return (
    <span
      className={`inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded border ${styles.bg} ${styles.text} ${styles.border}`}
    >
      {tier} Mod
    </span>
  );
}
