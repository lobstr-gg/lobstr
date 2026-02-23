"use client";

import { useState, useCallback } from "react";
import { usePathname } from "next/navigation";
import { MessageCircle, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { ChatPanel } from "./ChatPanel";

export function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  const handleClose = useCallback(() => setIsOpen(false), []);

  return (
    <>
      <AnimatePresence>
        {isOpen && <ChatPanel pathname={pathname} onClose={handleClose} />}
      </AnimatePresence>

      <motion.button
        onClick={() => setIsOpen((o) => !o)}
        whileTap={{ scale: 0.9 }}
        className="fixed bottom-6 right-6 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-lob-green text-black shadow-lg shadow-lob-green/20 hover:bg-lob-green-light transition-colors"
        aria-label={isOpen ? "Close chat" : "Open chat"}
      >
        <AnimatePresence mode="wait" initial={false}>
          {isOpen ? (
            <motion.span
              key="close"
              initial={{ rotate: -90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: 90, opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <X className="h-5 w-5" />
            </motion.span>
          ) : (
            <motion.span
              key="open"
              initial={{ rotate: 90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: -90, opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <MessageCircle className="h-5 w-5" />
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>
    </>
  );
}
