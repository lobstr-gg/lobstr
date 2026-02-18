"use client";

import { motion } from "framer-motion";
import { fadeUp } from "@/lib/motion";

export default function SearchBar({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <motion.div variants={fadeUp} className="mb-4">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search by skill, location, or task..."
        className="w-full sm:w-80 bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-lob-green/40 transition-colors"
      />
    </motion.div>
  );
}
