"use client";

import { motion } from "framer-motion";
import { useMemo } from "react";

interface ReputationData {
  deliverySpeed: number;    // 0-100
  completionRate: number;   // 0-100
  disputeWinRate: number;   // 0-100
  responseTime: number;     // 0-100
  jobVolume: number;        // 0-100
  stakeAmount: number;      // 0-100
}

interface ReputationRadarProps {
  data: ReputationData;
  size?: number;
  color?: string;
  compareData?: ReputationData;
  compareColor?: string;
  showLabels?: boolean;
  animated?: boolean;
}

const AXES = [
  { key: "deliverySpeed", label: "Speed" },
  { key: "completionRate", label: "Completion" },
  { key: "disputeWinRate", label: "Disputes" },
  { key: "responseTime", label: "Response" },
  { key: "jobVolume", label: "Volume" },
  { key: "stakeAmount", label: "Stake" },
] as const;

function polarToCartesian(
  cx: number,
  cy: number,
  r: number,
  angleRad: number
): { x: number; y: number } {
  return {
    x: cx + r * Math.cos(angleRad - Math.PI / 2),
    y: cy + r * Math.sin(angleRad - Math.PI / 2),
  };
}

function buildPolygonPoints(
  cx: number,
  cy: number,
  maxR: number,
  data: ReputationData
): string {
  return AXES.map((axis, i) => {
    const angle = (2 * Math.PI * i) / AXES.length;
    const value = data[axis.key] / 100;
    const r = maxR * value;
    const { x, y } = polarToCartesian(cx, cy, r, angle);
    return `${x},${y}`;
  }).join(" ");
}

export default function ReputationRadar({
  data,
  size = 220,
  color = "#58B059",
  compareData,
  compareColor = "#3B82F6",
  showLabels = true,
  animated = true,
}: ReputationRadarProps) {
  const cx = size / 2;
  const cy = size / 2;
  const maxR = size * 0.38;
  const labelR = size * 0.48;
  const rings = [0.25, 0.5, 0.75, 1.0];

  const points = useMemo(() => buildPolygonPoints(cx, cy, maxR, data), [cx, cy, maxR, data]);
  const comparePoints = useMemo(
    () => compareData ? buildPolygonPoints(cx, cy, maxR, compareData) : null,
    [cx, cy, maxR, compareData]
  );

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="overflow-visible"
      >
        {/* Background rings */}
        {rings.map((scale) => (
          <polygon
            key={scale}
            points={AXES.map((_, i) => {
              const angle = (2 * Math.PI * i) / AXES.length;
              const { x, y } = polarToCartesian(cx, cy, maxR * scale, angle);
              return `${x},${y}`;
            }).join(" ")}
            fill="none"
            stroke="rgba(30,36,49,0.8)"
            strokeWidth={1}
          />
        ))}

        {/* Axis lines */}
        {AXES.map((_, i) => {
          const angle = (2 * Math.PI * i) / AXES.length;
          const { x, y } = polarToCartesian(cx, cy, maxR, angle);
          return (
            <line
              key={i}
              x1={cx}
              y1={cy}
              x2={x}
              y2={y}
              stroke="rgba(30,36,49,0.6)"
              strokeWidth={1}
            />
          );
        })}

        {/* Compare data polygon */}
        {comparePoints && (
          <motion.polygon
            points={comparePoints}
            fill={`${compareColor}15`}
            stroke={compareColor}
            strokeWidth={1.5}
            strokeLinejoin="round"
            initial={animated ? { opacity: 0 } : undefined}
            animate={animated ? { opacity: 1 } : undefined}
            transition={{ duration: 0.8, delay: 0.3 }}
          />
        )}

        {/* Main data polygon */}
        <motion.polygon
          points={points}
          fill={`${color}20`}
          stroke={color}
          strokeWidth={2}
          strokeLinejoin="round"
          initial={animated ? { opacity: 0, scale: 0.3 } : undefined}
          animate={animated ? { opacity: 1, scale: 1 } : undefined}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          style={{ transformOrigin: `${cx}px ${cy}px` }}
        />

        {/* Data points */}
        {AXES.map((axis, i) => {
          const angle = (2 * Math.PI * i) / AXES.length;
          const value = data[axis.key] / 100;
          const r = maxR * value;
          const { x, y } = polarToCartesian(cx, cy, r, angle);
          return (
            <motion.circle
              key={axis.key}
              cx={x}
              cy={y}
              r={3}
              fill={color}
              initial={animated ? { opacity: 0, r: 0 } : undefined}
              animate={animated ? { opacity: 1, r: 3 } : undefined}
              transition={{ duration: 0.4, delay: 0.5 + i * 0.08 }}
            />
          );
        })}

        {/* Labels */}
        {showLabels &&
          AXES.map((axis, i) => {
            const angle = (2 * Math.PI * i) / AXES.length;
            const { x, y } = polarToCartesian(cx, cy, labelR, angle);
            return (
              <motion.text
                key={axis.key}
                x={x}
                y={y}
                textAnchor="middle"
                dominantBaseline="central"
                className="fill-text-tertiary text-[9px] font-medium"
                initial={animated ? { opacity: 0 } : undefined}
                animate={animated ? { opacity: 1 } : undefined}
                transition={{ duration: 0.4, delay: 0.3 + i * 0.05 }}
              >
                {axis.label}
              </motion.text>
            );
          })}
      </svg>

      {/* Center glow */}
      <motion.div
        className="absolute rounded-full pointer-events-none"
        style={{
          left: cx - 4,
          top: cy - 4,
          width: 8,
          height: 8,
          background: color,
          boxShadow: `0 0 12px ${color}60`,
        }}
        animate={{
          boxShadow: [
            `0 0 8px ${color}40`,
            `0 0 16px ${color}60`,
            `0 0 8px ${color}40`,
          ],
        }}
        transition={{ duration: 2, repeat: Infinity }}
      />
    </div>
  );
}
