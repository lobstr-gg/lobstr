"use client";

import { useState, useRef, type FormEvent, type KeyboardEvent } from "react";
import { Send, Loader2 } from "lucide-react";

interface ChatInputProps {
  onSend: (text: string) => void;
  isLoading: boolean;
}

export function ChatInput({ onSend, isLoading }: ChatInputProps) {
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function autoResize() {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 72)}px`;
  }

  function submit(e?: FormEvent) {
    e?.preventDefault();
    const text = input.trim();
    if (!text || isLoading) return;
    onSend(text);
    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <form onSubmit={submit} className="flex items-end gap-2 border-t border-border/40 p-3">
      <textarea
        ref={textareaRef}
        value={input}
        onChange={(e) => {
          setInput(e.target.value);
          autoResize();
        }}
        onKeyDown={onKeyDown}
        placeholder="Ask about LOBSTR..."
        rows={1}
        className="flex-1 resize-none rounded-lg border border-border/60 bg-surface-2 px-3 py-2 text-[13px] text-text-primary placeholder-text-tertiary focus:border-lob-green focus:outline-none transition-colors"
      />
      <button
        type="submit"
        disabled={!input.trim() || isLoading}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-lob-green text-black transition-all hover:bg-lob-green-light disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
      >
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Send className="h-4 w-4" />
        )}
      </button>
    </form>
  );
}
