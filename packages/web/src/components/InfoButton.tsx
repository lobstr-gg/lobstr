"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Info } from "lucide-react";
import { infoContent } from "@/lib/info-content";

interface InfoButtonProps {
  infoKey?: string;
  title?: string;
  description?: string;
}

export function InfoButton({ infoKey, title, description }: InfoButtonProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const content = infoKey ? infoContent[infoKey] : undefined;
  const displayTitle = title ?? content?.title;
  const displayDesc = description ?? content?.description;

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  if (!displayTitle && !displayDesc) return null;

  return (
    <div className="relative inline-flex" ref={ref}>
      <motion.button
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
        className={`p-0.5 rounded-full transition-colors ${
          open
            ? "text-lob-green bg-lob-green-muted"
            : "text-text-tertiary hover:text-text-secondary"
        }`}
        whileTap={{ scale: 0.9 }}
        aria-label={displayTitle ? `Info: ${displayTitle}` : "More info"}
        aria-expanded={open}
      >
        <Info className="w-3.5 h-3.5" />
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.96 }}
            transition={{ duration: 0.15 }}
            className="absolute left-1/2 -translate-x-1/2 top-full mt-2 w-64 sm:w-72 rounded-lg border border-border/60 bg-surface-0/95 glass backdrop-blur-xl shadow-2xl z-50 p-3"
            role="tooltip"
          >
            {displayTitle && (
              <p className="text-xs font-semibold text-text-primary mb-1">
                {displayTitle}
              </p>
            )}
            {displayDesc && (
              <p className="text-[11px] text-text-secondary leading-relaxed">
                {displayDesc}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
