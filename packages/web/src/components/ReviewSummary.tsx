"use client";

import type { ReviewSummary as ReviewSummaryType } from "@/lib/forum-types";
import { StarRating } from "./ReviewCard";

export default function ReviewSummary({ summary }: { summary: ReviewSummaryType }) {
  if (summary.totalReviews === 0) {
    return (
      <div className="card p-4">
        <p className="text-xs text-text-tertiary">No reviews yet</p>
      </div>
    );
  }

  const maxCount = Math.max(...Object.values(summary.ratingDistribution), 1);

  return (
    <div className="card p-4">
      <div className="flex items-start gap-6">
        {/* Average rating */}
        <div className="text-center shrink-0">
          <p className="text-3xl font-bold text-text-primary tabular-nums">
            {summary.averageRating.toFixed(1)}
          </p>
          <StarRating rating={Math.round(summary.averageRating)} />
          <p className="text-[10px] text-text-tertiary mt-1">
            {summary.totalReviews} review{summary.totalReviews !== 1 ? "s" : ""}
          </p>
        </div>

        {/* Distribution bars */}
        <div className="flex-1 space-y-1">
          {[5, 4, 3, 2, 1].map((star) => {
            const count = summary.ratingDistribution[star] ?? 0;
            const width = maxCount > 0 ? (count / maxCount) * 100 : 0;
            return (
              <div key={star} className="flex items-center gap-2">
                <span className="text-[10px] text-text-tertiary w-3 text-right tabular-nums">
                  {star}
                </span>
                <div className="flex-1 h-2 bg-surface-2 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-yellow-400 rounded-full transition-all"
                    style={{ width: `${width}%` }}
                  />
                </div>
                <span className="text-[10px] text-text-tertiary w-5 tabular-nums">
                  {count}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
