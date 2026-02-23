"use client";

import { motion } from "framer-motion";
import type { UIMessage } from "ai";
import { useMemo, type ReactNode } from "react";

/** Lightweight markdown → React for chat messages.
 *  Supports: **bold**, *italic*, `inline code`, ```code blocks```,
 *  [links](url), unordered lists (- item), numbered lists (1. item)
 */
function parseMarkdown(raw: string): ReactNode {
  // Split code blocks first
  const codeBlockRe = /```(\w*)\n?([\s\S]*?)```/g;
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = codeBlockRe.exec(raw)) !== null) {
    if (match.index > lastIndex) {
      parts.push(...parseBlocks(raw.slice(lastIndex, match.index)));
    }
    parts.push(
      <pre
        key={`cb-${match.index}`}
        className="my-1.5 rounded-md bg-black/30 border border-white/[0.06] px-2.5 py-2 text-[11px] leading-relaxed overflow-x-auto"
      >
        <code>{match[2].trim()}</code>
      </pre>
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < raw.length) {
    parts.push(...parseBlocks(raw.slice(lastIndex)));
  }

  return parts.length === 1 ? parts[0] : <>{parts}</>;
}

/** Parse block-level elements: lists, paragraphs */
function parseBlocks(text: string): ReactNode[] {
  const lines = text.split("\n");
  const result: ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Unordered list
    if (/^\s*[-*]\s+/.test(line)) {
      const items: ReactNode[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(
          <li key={`ul-${i}`}>{parseInline(lines[i].replace(/^\s*[-*]\s+/, ""))}</li>
        );
        i++;
      }
      result.push(
        <ul key={`ul-${i}`} className="my-1 ml-3 list-disc space-y-0.5 text-[12px]">
          {items}
        </ul>
      );
      continue;
    }

    // Ordered list
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: ReactNode[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        items.push(
          <li key={`ol-${i}`}>{parseInline(lines[i].replace(/^\s*\d+[.)]\s+/, ""))}</li>
        );
        i++;
      }
      result.push(
        <ol key={`ol-${i}`} className="my-1 ml-3 list-decimal space-y-0.5 text-[12px]">
          {items}
        </ol>
      );
      continue;
    }

    // Regular line → inline parse
    if (line.trim()) {
      result.push(
        <span key={`p-${i}`}>
          {parseInline(line)}
          {i < lines.length - 1 && lines[i + 1]?.trim() ? "\n" : ""}
        </span>
      );
    } else if (i > 0 && i < lines.length - 1) {
      result.push(<br key={`br-${i}`} />);
    }
    i++;
  }

  return result;
}

/** Parse inline markdown: bold, italic, inline code, links */
function parseInline(text: string): ReactNode {
  // Regex that matches inline patterns in order of priority
  const inlineRe =
    /(\*\*(.+?)\*\*)|(\*(.+?)\*)|(`([^`]+?)`)|(\[([^\]]+)\]\(([^)]+)\))/g;

  const nodes: ReactNode[] = [];
  let lastIdx = 0;
  let m: RegExpExecArray | null;

  while ((m = inlineRe.exec(text)) !== null) {
    // Push preceding text
    if (m.index > lastIdx) {
      nodes.push(text.slice(lastIdx, m.index));
    }

    if (m[1]) {
      // **bold**
      nodes.push(
        <strong key={`b-${m.index}`} className="font-semibold">
          {m[2]}
        </strong>
      );
    } else if (m[3]) {
      // *italic*
      nodes.push(
        <em key={`i-${m.index}`} className="italic">
          {m[4]}
        </em>
      );
    } else if (m[5]) {
      // `inline code`
      nodes.push(
        <code
          key={`c-${m.index}`}
          className="rounded bg-black/30 border border-white/[0.06] px-1 py-0.5 text-[11px] font-mono text-lob-green"
        >
          {m[6]}
        </code>
      );
    } else if (m[7]) {
      // [text](url)
      nodes.push(
        <a
          key={`a-${m.index}`}
          href={m[9]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-lob-green underline underline-offset-2 hover:text-lob-green/80 transition-colors"
        >
          {m[8]}
        </a>
      );
    }

    lastIdx = m.index + m[0].length;
  }

  // Remaining text
  if (lastIdx < text.length) {
    nodes.push(text.slice(lastIdx));
  }

  return nodes.length === 1 ? nodes[0] : <>{nodes}</>;
}

export function ChatMessage({ message }: { message: UIMessage }) {
  const isUser = message.role === "user";

  const text = message.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");

  const rendered = useMemo(() => {
    if (!text) return null;
    // Only parse markdown for assistant messages
    return isUser ? text : parseMarkdown(text);
  }, [text, isUser]);

  if (!rendered) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={`flex ${isUser ? "justify-end" : "justify-start"}`}
    >
      <div
        className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-[13px] leading-relaxed ${
          isUser
            ? "bg-lob-green text-black rounded-br-sm"
            : "bg-surface-2 text-text-primary rounded-bl-sm"
        }`}
      >
        <div className="whitespace-pre-wrap break-words">{rendered}</div>
      </div>
    </motion.div>
  );
}
