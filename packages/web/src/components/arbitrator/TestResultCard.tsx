"use client";

import { ExternalLink } from "lucide-react";
import { getExplorerUrl } from "@/config/contracts";

interface TestResultCardProps {
  passed: boolean;
  scores: {
    mc: number;
    analysis: number;
    rulingCorrect: boolean;
  };
  txHash?: string | null;
}

export function TestResultCard({ passed, scores, txHash }: TestResultCardProps) {
  return (
    <div
      className={`rounded-lg border p-6 ${
        passed
          ? "border-green-500/30 bg-green-500/5"
          : "border-red-500/30 bg-red-500/5"
      }`}
    >
      <div className="mb-4 flex items-center gap-3">
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-full text-lg ${
            passed ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
          }`}
        >
          {passed ? "\u2713" : "\u2717"}
        </div>
        <div>
          <h3
            className={`text-lg font-bold ${
              passed ? "text-green-400" : "text-red-400"
            }`}
          >
            {passed ? "Test Passed" : "Test Failed"}
          </h3>
          <p className="text-sm text-white/50">
            {passed
              ? "You are now certified to arbitrate disputes."
              : "Review the feedback below and try again."}
          </p>
        </div>
      </div>

      <div className="space-y-3">
        <ScoreRow
          label="Multiple Choice"
          score={scores.mc}
          threshold={80}
          suffix="%"
        />
        <ScoreRow
          label="Evidence Analysis"
          score={scores.analysis}
          threshold={70}
          suffix="%"
        />
        <div className="flex items-center justify-between rounded-md bg-black/20 px-3 py-2">
          <span className="text-sm text-white/60">Mock Ruling</span>
          <span
            className={`text-sm font-medium ${
              scores.rulingCorrect ? "text-green-400" : "text-red-400"
            }`}
          >
            {scores.rulingCorrect ? "Correct" : "Incorrect"}
          </span>
        </div>
      </div>

      {passed && txHash && txHash !== "already-certified" && (
        <div className="mt-4 flex items-center gap-2 rounded-md bg-black/20 px-3 py-2">
          <span className="text-sm text-white/60">Certification TX:</span>
          <a
            href={getExplorerUrl("tx", txHash)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-sm text-orange-400 hover:text-orange-300"
          >
            {txHash.slice(0, 10)}...{txHash.slice(-8)}
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      )}
    </div>
  );
}

function ScoreRow({
  label,
  score,
  threshold,
  suffix,
}: {
  label: string;
  score: number;
  threshold: number;
  suffix: string;
}) {
  const passed = score >= threshold;
  return (
    <div className="flex items-center justify-between rounded-md bg-black/20 px-3 py-2">
      <span className="text-sm text-white/60">{label}</span>
      <div className="flex items-center gap-2">
        <span
          className={`text-sm font-medium ${
            passed ? "text-green-400" : "text-red-400"
          }`}
        >
          {score}
          {suffix}
        </span>
        <span className="text-xs text-white/30">(min {threshold}{suffix})</span>
      </div>
    </div>
  );
}
