"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ease } from "@/lib/motion";
import type { Comment } from "@/lib/forum-types";
import { timeAgo } from "@/lib/forum-data";
import VoteButton from "./VoteButton";
import UserCard from "./UserCard";
import CommentComposer from "./CommentComposer";

const MAX_DEPTH = 6;

export default function CommentNode({ comment }: { comment: Comment }) {
  const [collapsed, setCollapsed] = useState(false);
  const [showReply, setShowReply] = useState(false);

  return (
    <div className={`${comment.depth > 0 ? "pl-4" : ""}`}>
      <div className="flex gap-2">
        {/* Collapse line */}
        {comment.depth > 0 && (
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="w-px bg-border/40 hover:bg-lob-green/40 transition-colors shrink-0 self-stretch"
            aria-label={collapsed ? "Expand" : "Collapse"}
          />
        )}

        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center gap-2 mb-1">
            <UserCard address={comment.author} />
            <span className="text-[10px] text-text-tertiary">
              {timeAgo(comment.createdAt)}
            </span>
            {comment.depth === 0 && (
              <button
                onClick={() => setCollapsed(!collapsed)}
                className="text-[10px] text-text-tertiary hover:text-text-secondary"
              >
                [{collapsed ? "+" : "-"}]
              </button>
            )}
          </div>

          <AnimatePresence>
            {!collapsed && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2, ease }}
              >
                {/* Body */}
                <p className="text-sm text-text-secondary leading-relaxed mb-1.5">
                  {comment.body}
                </p>

                {/* Actions */}
                <div className="flex items-center gap-3 mb-2">
                  <VoteButton
                    id={comment.id}
                    score={comment.score}
                    orientation="horizontal"
                  />
                  <button
                    onClick={() => setShowReply(!showReply)}
                    className="text-[10px] text-text-tertiary hover:text-text-secondary transition-colors"
                  >
                    Reply
                  </button>
                </div>

                {/* Reply composer */}
                <AnimatePresence>
                  {showReply && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mb-2"
                    >
                      <CommentComposer
                        onCancel={() => setShowReply(false)}
                        onSubmit={() => {
                          setShowReply(false);
                        }}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Children */}
                {comment.depth < MAX_DEPTH &&
                  comment.children.map((child) => (
                    <CommentNode key={child.id} comment={child} />
                  ))}
                {comment.depth >= MAX_DEPTH && comment.children.length > 0 && (
                  <p className="text-[10px] text-lob-green ml-4 mt-1">
                    Continue thread ({comment.children.length} more)
                  </p>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
