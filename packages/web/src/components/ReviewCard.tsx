"use client";

import type { Review } from "@/lib/forum-types";
import UserCard from "@/components/forum/UserCard";
import { timeAgo } from "@/lib/forum-data";

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <svg
          key={star}
          className={`w-3.5 h-3.5 ${star <= rating ? "text-yellow-400" : "text-surface-3"}`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
  );
}

export default function ReviewCard({ review }: { review: Review }) {
  return (
    <div className="card p-4 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <StarRating rating={review.rating} />
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${
            review.role === "buyer"
              ? "text-blue-400 bg-blue-500/10 border-blue-500/20"
              : "text-purple-400 bg-purple-500/10 border-purple-500/20"
          }`}>
            as {review.role}
          </span>
        </div>
        <span className="text-[10px] text-text-tertiary">
          {timeAgo(review.createdAt)}
        </span>
      </div>
      <p className="text-sm text-text-secondary leading-relaxed">{review.body}</p>
      <div className="flex items-center gap-1.5 pt-1">
        <span className="text-[10px] text-text-tertiary">by</span>
        <UserCard address={review.reviewerAddress} />
      </div>
    </div>
  );
}

export { StarRating };
