"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { ease } from "@/lib/motion";
import type { HumanProvider } from "../_data/types";

const TIER_COLORS: Record<string, string> = {
  Bronze: "#CD7F32",
  Silver: "#C0C0C0",
  Gold: "#FFD700",
  Platinum: "#E5E4E2",
};

const AVAILABILITY_DOT: Record<string, string> = {
  available: "bg-green-400",
  busy: "bg-yellow-400",
  offline: "bg-gray-500",
};

function countryFlag(countryCode: string): string {
  return countryCode
    .toUpperCase()
    .split("")
    .map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
    .join("");
}

export default function HumanCard({ human, onHire }: { human: HumanProvider; onHire?: (human: HumanProvider) => void }) {
  const tierColor = TIER_COLORS[human.reputationTier] ?? "#848E9C";
  const lowestRate = Math.min(
    human.hourlyRate,
    ...Object.values(human.flatRates)
  );
  const rateLabel =
    lowestRate === human.hourlyRate
      ? `${lowestRate} LOB/hr`
      : `${lowestRate} LOB/task`;

  return (
    <motion.div
      className="card p-4 flex flex-col group"
      whileHover={{ y: -3, borderColor: "rgba(0,214,114,0.15)" }}
      transition={{ duration: 0.2, ease }}
    >
      {/* Provider row */}
      <div className="flex items-center gap-2 mb-3">
        {human.profileImageUrl ? (
          <Image
            src={human.profileImageUrl}
            alt={human.name}
            width={28}
            height={28}
            className="w-7 h-7 rounded-full object-cover border border-blue-400/20"
          />
        ) : (
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-400/20">
            {human.avatar.slice(0, 2)}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-text-primary truncate">
            {human.name}
          </p>
          <p className="text-[10px] text-text-tertiary">
            {countryFlag(human.locationInfo.countryCode)}{" "}
            {human.location} &middot; {human.timezone}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className={`w-1.5 h-1.5 rounded-full ${AVAILABILITY_DOT[human.availability]}`}
          />
          <span className="text-[10px] text-text-tertiary capitalize">
            {human.availability}
          </span>
        </div>
      </div>

      {/* Reputation tier */}
      <div className="flex items-center gap-2 mb-2">
        <span
          className="text-[10px] font-medium px-1.5 py-0.5 rounded"
          style={{
            color: tierColor,
            backgroundColor: `${tierColor}15`,
            border: `1px solid ${tierColor}30`,
          }}
        >
          {human.reputationTier}
        </span>
        {human.verified && (
          <span className="text-[10px] text-lob-green font-medium">&#10003; Verified</span>
        )}
      </div>

      {/* Bio */}
      <p className="text-xs text-text-tertiary line-clamp-2 mb-3 flex-1">
        {human.bio}
      </p>

      {/* Skills */}
      <div className="flex flex-wrap gap-1 mb-3">
        {human.skills.slice(0, 3).map((skill) => (
          <span
            key={skill}
            className="text-[10px] text-text-tertiary bg-surface-2 px-1.5 py-0.5 rounded"
          >
            {skill}
          </span>
        ))}
        {human.skills.length > 3 && (
          <span className="text-[10px] text-text-tertiary">
            +{human.skills.length - 3}
          </span>
        )}
      </div>

      {/* Stats footer */}
      <div className="flex items-center justify-between pt-3 border-t border-border/30 mb-3">
        <div>
          <span className="text-sm font-bold tabular-nums text-lob-green">
            {rateLabel}
          </span>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-text-tertiary">
          <span>
            {human.rating.toFixed(1)} ★
          </span>
          <span>{human.completions} jobs</span>
          <span>{human.responseTime}</span>
        </div>
      </div>

      {/* CTA */}
      <motion.button
        className={`w-full py-2 rounded-lg text-xs font-medium border transition-colors ${
          human.availability === "offline"
            ? "border-border/30 text-text-tertiary hover:bg-surface-2"
            : "border-lob-green/30 text-lob-green hover:bg-lob-green-muted"
        }`}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.97 }}
        onClick={() => onHire?.(human)}
      >
        {human.availability === "available"
          ? "Send Job Offer"
          : human.availability === "busy"
          ? "Queue Job Offer"
          : "Message When Online"}
      </motion.button>
    </motion.div>
  );
}
