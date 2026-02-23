"use client";

import { motion } from "framer-motion";
import { MessageSquare, Plus, Search, type LucideIcon } from "lucide-react";

interface EmptyStateProps {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  actionLabel?: string;
  onAction?: () => void;
}

export default function EmptyState({
  title,
  subtitle,
  icon: Icon = MessageSquare,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <div className="card px-6 py-14 sm:py-20 text-center">
      <motion.div
        className="w-14 h-14 rounded-2xl border border-border bg-surface-2/60 mx-auto mb-5 flex items-center justify-center"
        animate={{
          borderColor: [
            "rgba(30,36,49,1)",
            "rgba(88,176,89,0.25)",
            "rgba(30,36,49,1)",
          ],
        }}
        transition={{ duration: 4, repeat: Infinity }}
      >
        <Icon className="w-6 h-6 text-text-tertiary" />
      </motion.div>
      <p className="text-sm font-medium text-text-secondary mb-1">{title}</p>
      {subtitle && (
        <p className="text-xs text-text-tertiary max-w-xs mx-auto leading-relaxed">
          {subtitle}
        </p>
      )}
      {actionLabel && onAction && (
        <motion.button
          className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg border border-lob-green/20 text-lob-green bg-lob-green/5 hover:bg-lob-green/10 transition-colors"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={onAction}
        >
          <Plus className="w-3.5 h-3.5" />
          {actionLabel}
        </motion.button>
      )}
    </div>
  );
}
