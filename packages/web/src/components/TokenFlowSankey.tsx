"use client";

import { motion } from "framer-motion";
import { useMemo } from "react";
import { ease } from "@/lib/motion";

interface FlowData {
  lobStaked?: number | null;
  treasuryLob?: number | null;
  airdropClaimed?: number | null;
  totalSeized?: number | null;
  protocolFees?: number | null;
}

interface TokenFlowSankeyProps {
  data: FlowData;
  isLoading?: boolean;
}

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

const TOTAL_SUPPLY = 1_000_000_000;

interface FlowNode {
  id: string;
  label: string;
  value: number;
  color: string;
  x: number;
  y: number;
  height: number;
}

interface FlowLink {
  source: string;
  target: string;
  value: number;
  color: string;
}

export default function TokenFlowSankey({
  data,
  isLoading = false,
}: TokenFlowSankeyProps) {
  const flows = useMemo(() => {
    const staked = data.lobStaked ?? 0;
    const treasury = data.treasuryLob ?? 0;
    const airdrop = data.airdropClaimed ?? 0;
    const seized = data.totalSeized ?? 0;
    const circulating = Math.max(0, TOTAL_SUPPLY - staked - treasury);

    const nodes = [
      { id: "staked", label: "Staked", value: staked, color: "#58B059" },
      { id: "treasury", label: "Treasury", value: treasury, color: "#3B82F6" },
      { id: "airdrop", label: "Airdrop", value: airdrop, color: "#F59E0B" },
      { id: "circulating", label: "Circulating", value: circulating, color: "#6366F1" },
      ...(seized > 0
        ? [{ id: "seized", label: "Seized", value: seized, color: "#EF4444" }]
        : []),
    ] as FlowNode[];

    return {
      nodes: [
        { id: "supply", label: "Total Supply", value: TOTAL_SUPPLY, color: "#848E9C" },
        ...nodes,
      ] as FlowNode[],
      links: [
        { source: "supply", target: "staked", value: staked, color: "#58B059" },
        { source: "supply", target: "treasury", value: treasury, color: "#3B82F6" },
        { source: "supply", target: "airdrop", value: airdrop, color: "#F59E0B" },
        { source: "supply", target: "circulating", value: circulating, color: "#6366F1" },
        ...(seized > 0
          ? [{ source: "circulating", target: "seized", value: seized, color: "#EF4444" }]
          : []),
      ] as FlowLink[],
      destinations: nodes,
    };
  }, [data]);

  if (isLoading) {
    return (
      <div className="card p-5">
        <div className="h-4 bg-surface-3 rounded w-1/3 mb-4 animate-pulse" />
        <div className="h-[200px] bg-surface-2 rounded animate-pulse" />
      </div>
    );
  }

  const svgWidth = 600;
  const svgHeight = 280;
  const nodeWidth = 18;
  const leftX = 40;
  const midX = 240;
  const rightX = 440;

  const destinations = flows.nodes.filter(
    (n) => n.id !== "supply" && n.id !== "seized"
  );
  const seizedNode = flows.nodes.find((n) => n.id === "seized");

  const totalDestValue = destinations.reduce((s, n) => s + n.value, 0);
  let yOffset = 20;
  const destPositions: Record<string, { y: number; h: number }> = {};

  for (const dest of destinations) {
    const h = Math.max(16, (dest.value / totalDestValue) * (svgHeight - 60));
    destPositions[dest.id] = { y: yOffset, h };
    yOffset += h + 8;
  }

  return (
    <motion.div
      className="card p-4 sm:p-5"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease }}
    >
      <h3 className="text-[10px] sm:text-xs font-semibold text-text-primary uppercase tracking-wider mb-3 sm:mb-4">
        Token Flow
      </h3>

      {/* ── Mobile: stacked bar + card layout ── */}
      <div className="sm:hidden space-y-3">
        {/* Supply header */}
        <div className="flex items-center justify-between px-1">
          <span className="text-[10px] text-text-tertiary uppercase tracking-wider">Total Supply</span>
          <span className="text-xs font-bold text-text-primary tabular-nums">1B LOB</span>
        </div>

        {/* Stacked horizontal bar */}
        <div className="h-3 rounded-full overflow-hidden flex bg-surface-3">
          {flows.destinations.map((node, i) => {
            const pct = (node.value / TOTAL_SUPPLY) * 100;
            if (pct < 0.5) return null;
            return (
              <motion.div
                key={node.id}
                className="h-full"
                style={{ backgroundColor: `${node.color}80` }}
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.8, delay: 0.2 + i * 0.1, ease }}
              />
            );
          })}
        </div>

        {/* Breakdown cards */}
        <div className="grid grid-cols-2 gap-2">
          {flows.destinations.map((node, i) => (
            <motion.div
              key={node.id}
              className="rounded-lg border border-border/30 bg-surface-1/50 px-3 py-2"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.4 + i * 0.08 }}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: node.color }}
                />
                <span className="text-[10px] text-text-secondary font-medium">
                  {node.label}
                </span>
              </div>
              <span className="text-xs font-bold tabular-nums" style={{ color: node.color }}>
                {formatCompact(node.value)} LOB
              </span>
              <span className="text-[9px] text-text-tertiary ml-1 tabular-nums">
                {((node.value / TOTAL_SUPPLY) * 100).toFixed(1)}%
              </span>
            </motion.div>
          ))}
        </div>
      </div>

      {/* ── Desktop: SVG Sankey ── */}
      <svg
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        className="w-full h-auto hidden sm:block"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          {flows.links.map((link, i) => (
            <linearGradient
              key={`grad-${i}`}
              id={`flow-grad-${i}`}
              x1="0%"
              y1="0%"
              x2="100%"
              y2="0%"
            >
              <stop offset="0%" stopColor={`${link.color}40`} />
              <stop offset="100%" stopColor={`${link.color}20`} />
            </linearGradient>
          ))}
        </defs>

        {/* Supply node (left) */}
        <motion.rect
          x={leftX}
          y={20}
          width={nodeWidth}
          height={svgHeight - 40}
          rx={4}
          fill="#848E9C20"
          stroke="#848E9C40"
          strokeWidth={1}
          initial={{ scaleY: 0 }}
          animate={{ scaleY: 1 }}
          transition={{ duration: 0.6, ease }}
          style={{ transformOrigin: `${leftX + nodeWidth / 2}px ${svgHeight / 2}px` }}
        />
        <text
          x={leftX + nodeWidth / 2}
          y={12}
          textAnchor="middle"
          className="fill-text-tertiary text-[9px] font-medium"
        >
          1B LOB
        </text>

        {/* Flow paths */}
        {flows.links
          .filter((l) => l.target !== "seized")
          .map((link, i) => {
            const dest = destPositions[link.target];
            if (!dest) return null;

            const srcY1 = 20 + dest.y * ((svgHeight - 40) / yOffset);
            const srcY2 = srcY1 + dest.h * ((svgHeight - 40) / yOffset);
            const dstY1 = dest.y;
            const dstY2 = dest.y + dest.h;

            const path = `
              M ${leftX + nodeWidth} ${srcY1}
              C ${leftX + nodeWidth + 80} ${srcY1}, ${midX - 80} ${dstY1}, ${midX} ${dstY1}
              L ${midX} ${dstY2}
              C ${midX - 80} ${dstY2}, ${leftX + nodeWidth + 80} ${srcY2}, ${leftX + nodeWidth} ${srcY2}
              Z
            `;

            return (
              <motion.path
                key={`flow-${i}`}
                d={path}
                fill={`url(#flow-grad-${i})`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.8, delay: 0.3 + i * 0.15, ease }}
              />
            );
          })}

        {/* Destination nodes */}
        {destinations.map((dest, i) => {
          const pos = destPositions[dest.id];
          if (!pos) return null;

          return (
            <g key={dest.id}>
              <motion.rect
                x={midX}
                y={pos.y}
                width={nodeWidth}
                height={pos.h}
                rx={3}
                fill={`${dest.color}30`}
                stroke={`${dest.color}50`}
                strokeWidth={1}
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 0.5, delay: 0.5 + i * 0.1, ease }}
                style={{ transformOrigin: `${midX}px ${pos.y + pos.h / 2}px` }}
              />
              <motion.text
                x={midX + nodeWidth + 8}
                y={pos.y + pos.h / 2 - 5}
                className="fill-text-secondary text-[10px] font-medium"
                dominantBaseline="central"
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, delay: 0.7 + i * 0.1 }}
              >
                {dest.label}
              </motion.text>
              <motion.text
                x={midX + nodeWidth + 8}
                y={pos.y + pos.h / 2 + 9}
                className="fill-text-tertiary text-[9px] font-medium"
                dominantBaseline="central"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.4, delay: 0.8 + i * 0.1 }}
              >
                {formatCompact(dest.value)} LOB
              </motion.text>

              {/* Traveling particle */}
              <motion.circle
                r={2}
                fill={dest.color}
                initial={{ cx: leftX + nodeWidth, cy: pos.y + pos.h / 2, opacity: 0 }}
                animate={{
                  cx: [leftX + nodeWidth, midX],
                  cy: pos.y + pos.h / 2,
                  opacity: [0, 1, 1, 0],
                }}
                transition={{
                  duration: 2,
                  delay: 1.5 + i * 0.8,
                  repeat: Infinity,
                  repeatDelay: 4,
                }}
              />
            </g>
          );
        })}

        {/* Seized flow (from circulating) */}
        {seizedNode && seizedNode.value > 0 && (() => {
          const circPos = destPositions["circulating"];
          if (!circPos) return null;

          const seizedH = Math.max(12, 30);
          const seizedY = circPos.y + circPos.h / 2 - seizedH / 2;

          return (
            <g>
              <motion.path
                d={`
                  M ${midX + nodeWidth} ${circPos.y + circPos.h / 2 - 6}
                  C ${midX + nodeWidth + 60} ${circPos.y + circPos.h / 2 - 6}, ${rightX - 60} ${seizedY}, ${rightX} ${seizedY}
                  L ${rightX} ${seizedY + seizedH}
                  C ${rightX - 60} ${seizedY + seizedH}, ${midX + nodeWidth + 60} ${circPos.y + circPos.h / 2 + 6}, ${midX + nodeWidth} ${circPos.y + circPos.h / 2 + 6}
                  Z
                `}
                fill="rgba(239,68,68,0.1)"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.8, delay: 1.2, ease }}
              />
              <motion.rect
                x={rightX}
                y={seizedY}
                width={nodeWidth}
                height={seizedH}
                rx={3}
                fill="rgba(239,68,68,0.2)"
                stroke="rgba(239,68,68,0.4)"
                strokeWidth={1}
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 0.5, delay: 1.3, ease }}
                style={{ transformOrigin: `${rightX}px ${seizedY + seizedH / 2}px` }}
              />
              <motion.text
                x={rightX + nodeWidth + 8}
                y={seizedY + seizedH / 2 - 5}
                className="fill-red-400 text-[10px] font-medium"
                dominantBaseline="central"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.5 }}
              >
                Seized
              </motion.text>
              <motion.text
                x={rightX + nodeWidth + 8}
                y={seizedY + seizedH / 2 + 9}
                className="fill-text-tertiary text-[9px]"
                dominantBaseline="central"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.6 }}
              >
                {formatCompact(seizedNode.value)} LOB
              </motion.text>
            </g>
          );
        })()}
      </svg>
    </motion.div>
  );
}
