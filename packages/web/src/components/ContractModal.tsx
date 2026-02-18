"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";

interface ContractModalProps {
  name: string;
  fileName: string;
  source: string;
  isOpen: boolean;
  onClose: () => void;
}

export default function ContractModal({ name, fileName, source, isOpen, onClose }: ContractModalProps) {
  const [copied, setCopied] = useState(false);
  const lines = source.split("\n");

  const copy = () => {
    navigator.clipboard.writeText(source);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            className="fixed inset-4 md:inset-8 lg:inset-12 z-50 flex flex-col rounded-xl border border-border/60 bg-black/95 backdrop-blur-xl overflow-hidden shadow-2xl"
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-border/40 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-lob-green" />
                <div>
                  <h2 className="text-sm font-bold text-text-primary">{name}</h2>
                  <p className="text-[10px] text-text-tertiary font-mono">{fileName}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-text-tertiary tabular-nums">
                  {lines.length} lines
                </span>
                <button
                  onClick={copy}
                  className="px-2.5 py-1 rounded text-[10px] font-medium text-text-secondary border border-border/40 hover:text-text-primary hover:border-border transition-colors"
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
                <button
                  onClick={onClose}
                  className="px-2.5 py-1 rounded text-[10px] font-medium text-text-secondary border border-border/40 hover:text-lob-red hover:border-lob-red/30 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>

            {/* Source code */}
            <div className="flex-1 overflow-auto">
              <pre className="text-xs leading-5 p-0">
                <code>
                  {lines.map((line, i) => (
                    <div
                      key={i}
                      className="flex hover:bg-surface-2/50 transition-colors"
                    >
                      <span className="w-12 shrink-0 text-right pr-4 text-text-tertiary/50 select-none tabular-nums text-[11px]">
                        {i + 1}
                      </span>
                      <span className="flex-1 pr-6 text-text-secondary whitespace-pre font-mono">
                        {colorize(line)}
                      </span>
                    </div>
                  ))}
                </code>
              </pre>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/** Basic Solidity syntax highlighting */
function colorize(line: string): React.ReactNode {
  // Comments
  if (line.trimStart().startsWith("//") || line.trimStart().startsWith("*") || line.trimStart().startsWith("/*") || line.trimStart().startsWith("*/")) {
    return <span className="text-text-tertiary/60 italic">{line}</span>;
  }

  // Keywords
  const keywords = /\b(pragma|solidity|import|contract|is|function|external|internal|public|private|view|pure|returns|return|require|emit|event|struct|enum|mapping|if|else|for|while|constructor|modifier|using|memory|storage|calldata|constant|immutable|override|virtual|abstract|interface|library|address|uint256|uint8|bool|string|bytes|bytes32|bytes4)\b/g;

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  const text = line;
  const combined = new RegExp(
    '("(?:[^"\\\\]|\\\\.)*")|' +                // strings
    "(\\b(?:true|false)\\b)|" +                   // booleans
    "(\\b\\d[\\d_]*(?:\\s*(?:ether|days|hours|minutes|seconds))?\\b)|" + // numbers + units
    keywords.source,
    "g"
  );

  while ((match = combined.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    if (match[1]) {
      // String
      parts.push(<span key={match.index} className="text-amber-400">{match[0]}</span>);
    } else if (match[2]) {
      // Boolean
      parts.push(<span key={match.index} className="text-purple-400">{match[0]}</span>);
    } else if (match[3]) {
      // Number
      parts.push(<span key={match.index} className="text-cyan-400">{match[0]}</span>);
    } else {
      // Keyword
      parts.push(<span key={match.index} className="text-lob-green">{match[0]}</span>);
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? <>{parts}</> : line;
}
