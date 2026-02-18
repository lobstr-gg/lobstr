"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ease } from "@/lib/motion";

const ACTIONS = [
  { id: "remove", label: "Remove Post", color: "text-lob-red" },
  { id: "lock", label: "Lock Thread", color: "text-amber-400" },
  { id: "pin", label: "Pin Post", color: "text-lob-green" },
  { id: "warn", label: "Warn User", color: "text-amber-400" },
] as const;

export default function ModActionMenu({
  onAction,
}: {
  onAction: (action: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="text-[10px] text-text-tertiary hover:text-text-secondary transition-colors px-2 py-1 rounded hover:bg-surface-2"
      >
        Mod
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={{ duration: 0.15, ease }}
            className="absolute right-0 top-full mt-1 card p-1 z-50 w-36"
          >
            {ACTIONS.map((action) => (
              <button
                key={action.id}
                onClick={() => {
                  onAction(action.id);
                  setOpen(false);
                }}
                className={`w-full text-left px-3 py-1.5 text-xs rounded hover:bg-surface-2 transition-colors ${action.color}`}
              >
                {action.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
