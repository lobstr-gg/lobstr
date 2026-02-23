"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import { motion } from "framer-motion";
import { ease } from "@/lib/motion";

interface GraphNode {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  type: "agent" | "human" | "contract";
  label: string;
  reputation?: number;
  size: number;
}

interface GraphEdge {
  source: string;
  target: string;
  value: number;
  active: boolean;
  pulseProgress: number;
}

const NODE_COLORS = {
  agent: "#58B059",
  human: "#3B82F6",
  contract: "#F59E0B",
};

function generateNodes(count: number, width: number, height: number): GraphNode[] {
  const nodes: GraphNode[] = [];
  const names = [
    "Sentinel", "Arbiter", "Steward", "DataBot", "CodeAgent",
    "Scraper-7", "Writer-3", "ResearchAI", "TxBot", "Auditor",
    "Alice.eth", "Bob.eth", "Charlie.base", "Dave.eth", "Eve.base",
    "ServiceReg", "Escrow", "StakeMgr",
  ];

  for (let i = 0; i < count; i++) {
    const type: GraphNode["type"] =
      i < count * 0.5 ? "agent" : i < count * 0.8 ? "human" : "contract";
    const rep = type === "contract" ? 100 : 20 + Math.random() * 80;

    nodes.push({
      id: `node-${i}`,
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      type,
      label: names[i % names.length],
      reputation: rep,
      size: type === "contract" ? 6 : 3 + (rep / 100) * 4,
    });
  }

  return nodes;
}

function generateEdges(nodes: GraphNode[], density: number): GraphEdge[] {
  const edges: GraphEdge[] = [];
  const count = Math.floor(nodes.length * density);

  for (let i = 0; i < count; i++) {
    const src = nodes[Math.floor(Math.random() * nodes.length)];
    const tgt = nodes[Math.floor(Math.random() * nodes.length)];
    if (src.id === tgt.id) continue;
    if (edges.some((e) => e.source === src.id && e.target === tgt.id)) continue;

    edges.push({
      source: src.id,
      target: tgt.id,
      value: Math.random() * 1000,
      active: Math.random() > 0.4,
      pulseProgress: 0,
    });
  }

  return edges;
}

interface NetworkGraphProps {
  nodeCount?: number;
  className?: string;
}

export default function NetworkGraph({
  nodeCount = 18,
  className = "",
}: NetworkGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const nodesRef = useRef<GraphNode[]>([]);
  const edgesRef = useRef<GraphEdge[]>([]);
  const animFrameRef = useRef<number>(0);
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [dimensions, setDimensions] = useState({ width: 600, height: 300 });

  // Initialize
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const { width, height } = container.getBoundingClientRect();
    setDimensions({ width, height });
    nodesRef.current = generateNodes(nodeCount, width, height);
    edgesRef.current = generateEdges(nodesRef.current, 1.5);
  }, [nodeCount]);

  // Animation loop
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { width, height } = dimensions;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, width, height);

    const nodes = nodesRef.current;
    const edges = edgesRef.current;

    // Gentle force simulation
    for (const node of nodes) {
      // Drift
      node.x += node.vx;
      node.y += node.vy;

      // Bounce off edges
      if (node.x < 20 || node.x > width - 20) node.vx *= -1;
      if (node.y < 20 || node.y > height - 20) node.vy *= -1;

      // Clamp
      node.x = Math.max(20, Math.min(width - 20, node.x));
      node.y = Math.max(20, Math.min(height - 20, node.y));

      // Slight random perturbation
      node.vx += (Math.random() - 0.5) * 0.02;
      node.vy += (Math.random() - 0.5) * 0.02;
      node.vx *= 0.99;
      node.vy *= 0.99;
    }

    // Repulsion between nodes
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[j].x - nodes[i].x;
        const dy = nodes[j].y - nodes[i].y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        if (dist < 60) {
          const force = (60 - dist) * 0.005;
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          nodes[i].vx -= fx;
          nodes[i].vy -= fy;
          nodes[j].vx += fx;
          nodes[j].vy += fy;
        }
      }
    }

    // Draw edges
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));

    for (const edge of edges) {
      const src = nodeMap.get(edge.source);
      const tgt = nodeMap.get(edge.target);
      if (!src || !tgt) continue;

      ctx.beginPath();
      ctx.moveTo(src.x, src.y);
      ctx.lineTo(tgt.x, tgt.y);
      ctx.strokeStyle = edge.active
        ? "rgba(88,176,89,0.08)"
        : "rgba(30,36,49,0.3)";
      ctx.lineWidth = 0.5;
      ctx.stroke();

      // Pulse particle along active edges
      if (edge.active) {
        edge.pulseProgress += 0.003 + Math.random() * 0.002;
        if (edge.pulseProgress > 1) {
          edge.pulseProgress = 0;
          // Randomly toggle activity
          if (Math.random() > 0.7) edge.active = false;
        }

        const px = src.x + (tgt.x - src.x) * edge.pulseProgress;
        const py = src.y + (tgt.y - src.y) * edge.pulseProgress;

        ctx.beginPath();
        ctx.arc(px, py, 1.5, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(88,176,89,0.6)";
        ctx.fill();
      } else {
        // Randomly activate
        if (Math.random() > 0.998) {
          edge.active = true;
          edge.pulseProgress = 0;
        }
      }
    }

    // Draw nodes
    for (const node of nodes) {
      const color = NODE_COLORS[node.type];

      // Glow
      const gradient = ctx.createRadialGradient(
        node.x, node.y, 0,
        node.x, node.y, node.size * 3
      );
      gradient.addColorStop(0, `${color}20`);
      gradient.addColorStop(1, "transparent");
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.size * 3, 0, Math.PI * 2);
      ctx.fillStyle = gradient;
      ctx.fill();

      // Node body
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.size, 0, Math.PI * 2);
      ctx.fillStyle = `${color}CC`;
      ctx.fill();

      // Border
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.size, 0, Math.PI * 2);
      ctx.strokeStyle = `${color}40`;
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }

    animFrameRef.current = requestAnimationFrame(draw);
  }, [dimensions]);

  useEffect(() => {
    animFrameRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [draw]);

  // Handle mouse hover for tooltips
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      let found: GraphNode | null = null;
      for (const node of nodesRef.current) {
        const dx = node.x - mx;
        const dy = node.y - my;
        if (Math.sqrt(dx * dx + dy * dy) < node.size + 8) {
          found = node;
          break;
        }
      }

      setHoveredNode(found);
    },
    []
  );

  // Resize observer
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setDimensions({ width, height });
    });

    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  return (
    <motion.div
      ref={containerRef}
      className={`relative overflow-hidden rounded-lg border border-border bg-surface-0 ${className}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 1, ease }}
      style={{ minHeight: 300 }}
    >
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: "100%" }}
        className="absolute inset-0"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoveredNode(null)}
      />

      {/* Overlay gradient */}
      <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-black/40 via-transparent to-black/20" />

      {/* Legend */}
      <div className="absolute bottom-3 left-3 flex items-center gap-3">
        {[
          { type: "agent", label: "Agents", color: NODE_COLORS.agent },
          { type: "human", label: "Humans", color: NODE_COLORS.human },
          { type: "contract", label: "Contracts", color: NODE_COLORS.contract },
        ].map((item) => (
          <div key={item.type} className="flex items-center gap-1.5">
            <div
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: item.color }}
            />
            <span className="text-[9px] text-text-tertiary">{item.label}</span>
          </div>
        ))}
      </div>

      {/* Live indicator */}
      <div className="absolute top-3 right-3 flex items-center gap-1.5">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-lob-green opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-lob-green" />
        </span>
        <span className="text-[9px] text-text-tertiary font-medium">Live</span>
      </div>

      {/* Hover tooltip */}
      {hoveredNode && (
        <div className="absolute top-3 left-3 rounded-md border border-border/60 bg-surface-0/95 glass px-3 py-2 shadow-lg pointer-events-none">
          <p className="text-[10px] font-medium text-text-primary">
            {hoveredNode.label}
          </p>
          <p className="text-[9px] text-text-tertiary capitalize">
            {hoveredNode.type}
          </p>
          {hoveredNode.reputation != null && (
            <p className="text-[9px] tabular-nums" style={{ color: NODE_COLORS[hoveredNode.type] }}>
              Rep: {Math.round(hoveredNode.reputation)}
            </p>
          )}
        </div>
      )}
    </motion.div>
  );
}
