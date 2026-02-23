"use client";

import { motion } from "framer-motion";
import { useMemo, useState, useRef, useEffect } from "react";
import { ease } from "@/lib/motion";

interface DayData {
  date: string; // YYYY-MM-DD
  count: number;
  jobsCreated?: number;
  lobSettled?: number;
}

interface TransactionHeatmapProps {
  data?: DayData[];
  weeks?: number;
}

const DAYS_OF_WEEK = ["", "Mon", "", "Wed", "", "Fri", ""];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function getIntensityColor(count: number, max: number): string {
  if (count === 0) return "rgba(30,36,49,0.6)";
  const ratio = count / max;
  if (ratio < 0.25) return "rgba(88,176,89,0.15)";
  if (ratio < 0.5) return "rgba(88,176,89,0.3)";
  if (ratio < 0.75) return "rgba(88,176,89,0.55)";
  return "rgba(88,176,89,0.85)";
}

function generateMockData(weeks: number): DayData[] {
  const data: DayData[] = [];
  const now = new Date();
  const totalDays = weeks * 7;

  for (let i = totalDays - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split("T")[0];

    const dayOfWeek = d.getDay();
    const weekMultiplier = Math.max(0.2, (totalDays - i) / totalDays);
    const weekendFactor = dayOfWeek === 0 || dayOfWeek === 6 ? 0.4 : 1;
    const noise = Math.random();
    const base = Math.floor(noise * 50 * weekMultiplier * weekendFactor);

    data.push({
      date: dateStr,
      count: base,
      jobsCreated: Math.floor(base * 0.6),
      lobSettled: base * Math.floor(Math.random() * 200 + 50),
    });
  }

  return data;
}

export default function TransactionHeatmap({
  data: externalData,
  weeks = 26,
}: TransactionHeatmapProps) {
  const [hoveredDay, setHoveredDay] = useState<DayData | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  // Measure container width to compute cell sizes
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const data = useMemo(
    () => externalData ?? generateMockData(weeks),
    [externalData, weeks]
  );

  const maxCount = useMemo(
    () => Math.max(1, ...data.map((d) => d.count)),
    [data]
  );

  const grid = useMemo(() => {
    const g: DayData[][] = [];
    let week: DayData[] = [];

    const firstDate = new Date(data[0]?.date ?? new Date());
    const firstDay = firstDate.getDay();
    for (let i = 0; i < firstDay; i++) {
      week.push({ date: "", count: 0 });
    }

    for (const d of data) {
      week.push(d);
      if (week.length === 7) {
        g.push(week);
        week = [];
      }
    }
    if (week.length > 0) {
      while (week.length < 7) {
        week.push({ date: "", count: 0 });
      }
      g.push(week);
    }

    return g;
  }, [data]);

  const labelWidth = 28;
  const isMobile = containerWidth > 0 && containerWidth < 640;

  // On mobile, trim to ~13 weeks (3 months) so cells are larger and no scroll needed
  const mobileWeeks = 13;
  const visibleGrid = useMemo(
    () => (isMobile ? grid.slice(-mobileWeeks) : grid),
    [grid, isMobile]
  );
  const numWeeks = visibleGrid.length;

  const monthLabels = useMemo(() => {
    const labels: { month: string; col: number }[] = [];
    let lastMonth = -1;

    visibleGrid.forEach((week, colIdx) => {
      for (const day of week) {
        if (!day.date) continue;
        const m = new Date(day.date).getMonth();
        if (m !== lastMonth) {
          labels.push({ month: MONTHS[m], col: colIdx });
          lastMonth = m;
        }
        break;
      }
    });

    return labels;
  }, [visibleGrid]);

  // Mobile: larger cells, no horizontal scroll
  const mobileCellSize = isMobile && containerWidth > 0
    ? Math.floor((containerWidth - labelWidth - 16) / numWeeks) - 2
    : 10;
  const mobileCellGap = 2;

  // Desktop: compute gap so cells stretch to fill. Use CSS grid with 1fr columns.
  // We just need a gap value for the CSS grid; cells auto-fill via 1fr.
  const desktopGap = containerWidth > 0 ? Math.max(2, Math.min(4, Math.floor((containerWidth - labelWidth) / numWeeks * 0.15))) : 3;

  return (
    <motion.div
      className="card p-4 sm:p-5"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease }}
      ref={containerRef}
    >
      <div className="flex items-center justify-between mb-3 sm:mb-4">
        <h3 className="text-[10px] sm:text-xs font-semibold text-text-primary uppercase tracking-wider">
          Protocol Activity
        </h3>
        <div className="flex items-center gap-1 sm:gap-1.5 text-[8px] sm:text-[9px] text-text-tertiary">
          <span>Less</span>
          {[0, 0.25, 0.5, 0.75, 1].map((level) => (
            <div
              key={level}
              className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-[2px]"
              style={{ backgroundColor: getIntensityColor(level * maxCount, maxCount) }}
            />
          ))}
          <span>More</span>
        </div>
      </div>

      {/* Heatmap grid */}
      <div>
        <div style={{ width: "100%" }}>
          {/* Month labels row */}
          <div
            className="grid mb-1"
            style={{
              gridTemplateColumns: `${labelWidth}px repeat(${numWeeks}, 1fr)`,
              gap: isMobile ? mobileCellGap : desktopGap,
            }}
          >
            <div /> {/* label spacer */}
            {visibleGrid.map((_, colIdx) => {
              const ml = monthLabels.find((m) => m.col === colIdx);
              return (
                <div key={colIdx} className="text-[8px] sm:text-[9px] text-text-tertiary truncate">
                  {ml?.month ?? ""}
                </div>
              );
            })}
          </div>

          {/* Grid rows (one per day of week) */}
          {DAYS_OF_WEEK.map((dayLabel, rowIdx) => (
            <div
              key={rowIdx}
              className="grid"
              style={{
                gridTemplateColumns: `${labelWidth}px repeat(${numWeeks}, 1fr)`,
                gap: isMobile ? mobileCellGap : desktopGap,
                marginBottom: isMobile ? mobileCellGap : desktopGap,
              }}
            >
              {/* Day label */}
              <div className="text-[8px] sm:text-[9px] text-text-tertiary flex items-center">
                {dayLabel}
              </div>
              {/* Cells for this row across all weeks */}
              {visibleGrid.map((week, colIdx) => {
                const day = week[rowIdx];
                return (
                  <motion.div
                    key={`${colIdx}-${rowIdx}`}
                    className="rounded-[2px] sm:rounded-[3px] cursor-default aspect-square"
                    style={{
                      backgroundColor: day.date
                        ? getIntensityColor(day.count, maxCount)
                        : "transparent",
                    }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: day.date ? 1 : 0 }}
                    transition={{
                      duration: 0.15,
                      delay: (colIdx * 7 + rowIdx) * 0.001,
                    }}
                    whileHover={day.date ? { scale: 1.2 } : undefined}
                    onMouseEnter={(e) => {
                      if (!day.date) return;
                      const rect = e.currentTarget.getBoundingClientRect();
                      setHoveredDay(day);
                      setTooltipPos({
                        x: rect.left + rect.width / 2,
                        y: rect.top - 8,
                      });
                    }}
                    onMouseLeave={() => setHoveredDay(null)}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Tooltip */}
      {hoveredDay && (
        <div
          className="fixed z-50 pointer-events-none"
          style={{
            left: tooltipPos.x,
            top: tooltipPos.y,
            transform: "translate(-50%, -100%)",
          }}
        >
          <div className="rounded-md border border-border/60 bg-surface-0/95 glass px-3 py-2 shadow-lg">
            <p className="text-[10px] text-text-secondary font-medium">
              {new Date(hoveredDay.date).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </p>
            <p className="text-[10px] tabular-nums text-lob-green">
              {hoveredDay.count} transactions
            </p>
            {hoveredDay.jobsCreated != null && (
              <p className="text-[9px] text-text-tertiary tabular-nums">
                {hoveredDay.jobsCreated} jobs created
              </p>
            )}
            {hoveredDay.lobSettled != null && hoveredDay.lobSettled > 0 && (
              <p className="text-[9px] text-text-tertiary tabular-nums">
                {hoveredDay.lobSettled.toLocaleString()} LOB settled
              </p>
            )}
          </div>
        </div>
      )}

      {/* Summary stats */}
      {(() => {
        const totalTxns = data.reduce((sum, d) => sum + d.count, 0);
        const totalJobs = data.reduce((sum, d) => sum + (d.jobsCreated ?? 0), 0);
        const totalLob = data.reduce((sum, d) => sum + (d.lobSettled ?? 0), 0);
        const activeDays = data.filter((d) => d.count > 0).length;
        const avgPerDay = activeDays > 0 ? Math.round(totalTxns / activeDays) : 0;

        // Busiest day of week
        const dayTotals = [0, 0, 0, 0, 0, 0, 0];
        const dayCounts = [0, 0, 0, 0, 0, 0, 0];
        for (const d of data) {
          if (!d.date || d.count === 0) continue;
          const dow = new Date(d.date).getDay();
          dayTotals[dow] += d.count;
          dayCounts[dow]++;
        }
        const dayAvgs = dayTotals.map((t, i) => dayCounts[i] > 0 ? t / dayCounts[i] : 0);
        const busiestDow = dayAvgs.indexOf(Math.max(...dayAvgs));
        const DOW_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

        // Current streak (consecutive days with activity from today backwards)
        let streak = 0;
        for (let i = data.length - 1; i >= 0; i--) {
          if (data[i].count > 0) streak++;
          else break;
        }

        const stats = [
          { label: "Total Txns", value: totalTxns.toLocaleString(), highlight: false },
          { label: "Peak Day", value: `${maxCount} txns`, highlight: true },
          { label: "Active Days", value: `${activeDays} / ${data.length}`, highlight: false },
          { label: "Jobs Created", value: totalJobs.toLocaleString(), highlight: false },
          { label: "LOB Settled", value: totalLob > 1_000_000 ? `${(totalLob / 1_000_000).toFixed(1)}M` : totalLob.toLocaleString(), highlight: true },
          { label: "Avg / Day", value: `${avgPerDay} txns`, highlight: false },
          { label: "Busiest Day", value: DOW_NAMES[busiestDow], highlight: false },
          { label: "Current Streak", value: `${streak}d`, highlight: streak >= 7 },
        ];

        return (
          <div className="grid grid-cols-2 sm:grid-cols-8 gap-3 sm:gap-4 mt-3 sm:mt-4 pt-3 border-t border-border/30">
            {stats.map((s) => (
              <div key={s.label} className="text-center">
                <span className="text-[8px] sm:text-[9px] text-text-tertiary uppercase tracking-wider block mb-0.5">
                  {s.label}
                </span>
                <p className={`text-[11px] sm:text-sm font-bold tabular-nums ${s.highlight ? "text-lob-green" : "text-text-primary"}`}>
                  {s.value}
                </p>
              </div>
            ))}
          </div>
        );
      })()}
    </motion.div>
  );
}
