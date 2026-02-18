"use client";

import { motion } from "framer-motion";

export default function EmptyState({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="card px-4 py-16 text-center">
      <motion.div
        className="w-12 h-12 rounded-full border border-border mx-auto mb-4 flex items-center justify-center"
        animate={{
          borderColor: [
            "rgba(30,36,49,1)",
            "rgba(0,214,114,0.3)",
            "rgba(30,36,49,1)",
          ],
        }}
        transition={{ duration: 3, repeat: Infinity }}
      >
        <motion.span
          className="block w-2 h-2 rounded-full bg-lob-green/40"
          animate={{ scale: [1, 1.4, 1], opacity: [0.4, 0.8, 0.4] }}
          transition={{ duration: 2, repeat: Infinity }}
        />
      </motion.div>
      <p className="text-sm text-text-secondary">{title}</p>
      {subtitle && (
        <p className="text-xs text-text-tertiary mt-1">{subtitle}</p>
      )}
    </div>
  );
}
