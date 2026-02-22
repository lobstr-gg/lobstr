"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { stagger, fadeUp, ease } from "@/lib/motion";
import { timeAgo } from "@/lib/forum-data";
import { useForum } from "@/lib/forum-context";
import { FORUM_POSTS, FORUM_COMMENTS } from "@/lib/forum-data";
import type { ForumUser, Post, Review, ReviewSummary as ReviewSummaryType } from "@/lib/forum-types";
import ModBadge from "@/components/forum/ModBadge";
import PostCard from "@/components/forum/PostCard";
import ForumBreadcrumb from "@/components/forum/ForumBreadcrumb";
import EmptyState from "@/components/forum/EmptyState";
import Spinner from "@/components/Spinner";
import ProfileAvatar from "@/components/ProfileAvatar";
import ReputationCard from "@/components/ReputationCard";
import ReviewCard from "@/components/ReviewCard";
import ReviewSummaryComponent from "@/components/ReviewSummary";

type FriendshipStatus = "none" | "pending_sent" | "pending_received" | "friends";
type ProfileTab = "posts" | "comments" | "reviews" | "friends";

export default function UserProfilePage() {
  const params = useParams();
  const paramAddress = params.address as string;
  const { currentUser } = useForum();

  const [user, setUser] = useState<ForumUser | null>(null);
  const [userPosts, setUserPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isBlocked, setIsBlocked] = useState(false);
  const [blockLoading, setBlockLoading] = useState(false);
  const [friendshipStatus, setFriendshipStatus] = useState<FriendshipStatus>("none");
  const [friendLoading, setFriendLoading] = useState(false);
  const [friendCount, setFriendCount] = useState(0);
  const [friends, setFriends] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<ProfileTab>("posts");
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewSummary, setReviewSummary] = useState<ReviewSummaryType | null>(null);
  const [reviewsLoading, setReviewsLoading] = useState(false);

  // Resolve actual address from user data (supports @username URLs)
  const address = user?.address || (paramAddress.startsWith("@") ? "" : paramAddress);
  const isOwnProfile = currentUser?.address === address;

  const handleBlock = useCallback(async () => {
    setBlockLoading(true);
    try {
      if (isBlocked) {
        await fetch("/api/forum/users/block", {
          method: "DELETE",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address }),
        });
        setIsBlocked(false);
      } else {
        if (!confirm(`Block ${user?.displayName ?? address}?`)) {
          setBlockLoading(false);
          return;
        }
        await fetch("/api/forum/users/block", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address }),
        });
        setIsBlocked(true);
        setFriendshipStatus("none");
      }
    } finally {
      setBlockLoading(false);
    }
  }, [address, isBlocked, user?.displayName]);

  const handleFriendAction = useCallback(async () => {
    if (!currentUser) return;
    setFriendLoading(true);
    try {
      if (friendshipStatus === "none") {
        const res = await fetch("/api/forum/users/friends", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address }),
        });
        if (res.ok) setFriendshipStatus("pending_sent");
      } else if (friendshipStatus === "pending_received") {
        const requestId = `${address}_${currentUser.address}`;
        const res = await fetch(`/api/forum/users/friends/requests/${requestId}`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "accept" }),
        });
        if (res.ok) {
          setFriendshipStatus("friends");
          setFriendCount((c) => c + 1);
        }
      } else if (friendshipStatus === "friends") {
        if (!confirm(`Remove ${user?.displayName ?? address} as friend?`)) {
          setFriendLoading(false);
          return;
        }
        const res = await fetch("/api/forum/users/friends", {
          method: "DELETE",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address }),
        });
        if (res.ok) {
          setFriendshipStatus("none");
          setFriendCount((c) => Math.max(0, c - 1));
        }
      }
    } finally {
      setFriendLoading(false);
    }
  }, [address, currentUser, friendshipStatus, user?.displayName]);

  const handleDeclineFriend = useCallback(async () => {
    if (!currentUser) return;
    setFriendLoading(true);
    try {
      const requestId = `${address}_${currentUser.address}`;
      const res = await fetch(`/api/forum/users/friends/requests/${requestId}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "decline" }),
      });
      if (res.ok) setFriendshipStatus("none");
    } finally {
      setFriendLoading(false);
    }
  }, [address, currentUser]);

  const userComments = FORUM_COMMENTS.filter((c) => c.author === address);

  // Fetch user profile (supports @username params)
  useEffect(() => {
    setLoading(true);
    fetch(`/api/forum/users/${encodeURIComponent(paramAddress)}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch");
        return res.json();
      })
      .then((data) => {
        setUser(data.user);
        setFriendCount(data.friendCount ?? 0);
        const resolvedAddr = data.user?.address;
        setUserPosts(data.posts ?? FORUM_POSTS.filter((p) => p.author === resolvedAddr));
        if (data.reviewSummary) setReviewSummary(data.reviewSummary);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [paramAddress]);

  // Fetch reviews when tab is active
  useEffect(() => {
    if (activeTab !== "reviews") return;
    setReviewsLoading(true);
    fetch(`/api/forum/reviews?address=${address}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) {
          setReviews(d.reviews ?? []);
          if (d.summary) setReviewSummary(d.summary);
        }
      })
      .catch(() => {})
      .finally(() => setReviewsLoading(false));
  }, [address, activeTab]);

  // Fetch friendship status and friends list
  useEffect(() => {
    if (!currentUser || isOwnProfile) {
      if (currentUser && isOwnProfile) {
        fetch("/api/forum/users/friends", { credentials: "include" })
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => { if (d?.friends) setFriends(d.friends); })
          .catch(() => {});
      }
      return;
    }

    fetch("/api/forum/users/friends", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.friends?.includes(address)) {
          setFriendshipStatus("friends");
          setFriends(d.friends);
          return;
        }
        return fetch("/api/forum/users/friends/requests", { credentials: "include" })
          .then((r) => (r.ok ? r.json() : null))
          .then((rd) => {
            if (rd?.requests?.some((r: { from: string }) => r.from === address)) {
              setFriendshipStatus("pending_received");
            }
          });
      })
      .catch(() => {});
  }, [currentUser, address, isOwnProfile]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="card px-4 py-8 text-center">
        <p className="text-sm text-red-400">Failed to load data</p>
        <button
          onClick={() => window.location.reload()}
          className="text-xs text-lob-green mt-2 hover:underline"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!user) {
    return (
      <motion.div initial="hidden" animate="show" variants={fadeUp}>
        <ForumBreadcrumb crumbs={[{ label: "User Not Found" }]} />
        <EmptyState title="User not found" />
      </motion.div>
    );
  }

  const TABS: { id: ProfileTab; label: string; count?: number }[] = [
    { id: "posts", label: "Posts", count: userPosts.length },
    { id: "comments", label: "Comments", count: userComments.length },
    { id: "reviews", label: "Reviews", count: reviewSummary?.totalReviews ?? 0 },
    { id: "friends", label: "Friends", count: friendCount },
  ];

  return (
    <motion.div initial="hidden" animate="show" variants={stagger}>
      <ForumBreadcrumb crumbs={[{ label: user.username ? `@${user.username}` : user.displayName }]} />

      {/* Profile card */}
      <motion.div variants={fadeUp} className="card p-5 mb-4">
        <div className="flex items-start gap-4">
          <ProfileAvatar user={user} size="lg" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-bold text-text-primary">
                {user.displayName}
              </h1>
              {user.modTier && <ModBadge tier={user.modTier} />}
              {user.isAgent && (
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-lob-green-muted text-lob-green border border-lob-green/20">
                  Agent
                </span>
              )}
            </div>
            {user.username && (
              <p className="text-xs text-lob-green mt-0.5">@{user.username}</p>
            )}
            <p className="text-xs text-text-tertiary font-mono mt-0.5 truncate">
              {address}
            </p>
            {user.bio && (
              <p className="text-sm text-text-secondary mt-2 leading-relaxed">{user.bio}</p>
            )}
            <div className="flex items-center gap-3 mt-2">
              {user.flair && (
                <span className="text-xs text-text-secondary">{user.flair}</span>
              )}
              <span className="text-[10px] text-text-tertiary">
                Joined {timeAgo(user.joinedAt)}
              </span>
            </div>
            {/* Social links */}
            {user.socialLinks && (user.socialLinks.twitter || user.socialLinks.github || user.socialLinks.website) && (
              <div className="flex items-center gap-3 mt-2">
                {user.socialLinks.twitter && (
                  <a
                    href={`https://x.com/${user.socialLinks.twitter}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-text-tertiary hover:text-text-primary transition-colors"
                    title={`@${user.socialLinks.twitter}`}
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                  </a>
                )}
                {user.socialLinks.github && (
                  <a
                    href={`https://github.com/${user.socialLinks.github}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-text-tertiary hover:text-text-primary transition-colors"
                    title={user.socialLinks.github}
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/></svg>
                  </a>
                )}
                {user.socialLinks.website && (
                  <a
                    href={user.socialLinks.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-text-tertiary hover:text-text-primary transition-colors"
                    title={user.socialLinks.website}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
                  </a>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 self-start shrink-0">
            {isOwnProfile && (
              <Link
                href="/settings"
                className="text-xs px-2.5 py-1 rounded border border-border/30 text-text-secondary hover:text-lob-green hover:border-lob-green/30 transition-colors"
              >
                Edit Profile
              </Link>
            )}
            {currentUser && !isOwnProfile && (
              <>
                <Link
                  href={`/forum/messages?compose=${address}`}
                  className="text-xs px-2.5 py-1 rounded border border-border/30 text-text-secondary hover:text-lob-green hover:border-lob-green/30 transition-colors"
                >
                  Message
                </Link>
                {friendshipStatus === "pending_received" ? (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={handleFriendAction}
                      disabled={friendLoading}
                      className="text-xs px-2.5 py-1 rounded border border-lob-green/30 text-lob-green hover:bg-lob-green/10 transition-colors"
                    >
                      {friendLoading ? "..." : "Accept"}
                    </button>
                    <button
                      onClick={handleDeclineFriend}
                      disabled={friendLoading}
                      className="text-xs px-2.5 py-1 rounded border border-border/30 text-text-tertiary hover:text-red-400 hover:border-red-500/30 transition-colors"
                    >
                      Decline
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={handleFriendAction}
                    disabled={friendLoading || friendshipStatus === "pending_sent"}
                    className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                      friendshipStatus === "friends"
                        ? "border-lob-green/30 text-lob-green hover:bg-lob-green/10"
                        : friendshipStatus === "pending_sent"
                        ? "border-border/30 text-text-tertiary cursor-not-allowed"
                        : "border-border/30 text-text-secondary hover:text-lob-green hover:border-lob-green/30"
                    }`}
                  >
                    {friendLoading
                      ? "..."
                      : friendshipStatus === "friends"
                      ? "Unfriend"
                      : friendshipStatus === "pending_sent"
                      ? "Pending..."
                      : "Add Friend"}
                  </button>
                )}
                <button
                  onClick={handleBlock}
                  disabled={blockLoading}
                  className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                    isBlocked
                      ? "border-red-500/30 text-red-400 hover:bg-red-500/10"
                      : "border-border/30 text-text-tertiary hover:text-red-400 hover:border-red-500/30"
                  }`}
                >
                  {blockLoading ? "..." : isBlocked ? "Unblock" : "Block"}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-border/30">
          <div className="text-center">
            <p className="text-lg font-bold text-lob-green tabular-nums">
              {user.postKarma}
            </p>
            <p className="text-[10px] text-text-tertiary">Post Karma</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-lob-green tabular-nums">
              {user.commentKarma}
            </p>
            <p className="text-[10px] text-text-tertiary">Comment Karma</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-text-primary tabular-nums">
              {userPosts.length}
            </p>
            <p className="text-[10px] text-text-tertiary">Posts</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-text-primary tabular-nums">
              {friendCount}
            </p>
            <p className="text-[10px] text-text-tertiary">Friends</p>
          </div>
        </div>
      </motion.div>

      {/* On-chain reputation */}
      <motion.div variants={fadeUp} className="mb-4">
        <ReputationCard address={address} />
      </motion.div>

      {/* Tabs */}
      <motion.div variants={fadeUp} className="flex gap-1 mb-4 border-b border-border/30">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? "border-lob-green text-lob-green"
                : "border-transparent text-text-tertiary hover:text-text-secondary"
            }`}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span className="ml-1 tabular-nums">({tab.count})</span>
            )}
          </button>
        ))}
      </motion.div>

      {/* Tab content */}
      {activeTab === "posts" && (
        <motion.div variants={fadeUp}>
          <div className="space-y-2">
            {userPosts.length === 0 ? (
              <EmptyState title="No posts yet" />
            ) : (
              userPosts.map((post) => <PostCard key={post.id} post={post} />)
            )}
          </div>
        </motion.div>
      )}

      {activeTab === "comments" && (
        <motion.div variants={fadeUp}>
          <div className="space-y-2">
            {userComments.length === 0 ? (
              <EmptyState title="No comments yet" />
            ) : (
              userComments.slice(0, 10).map((comment, i) => (
                <motion.div
                  key={comment.id}
                  className="p-3 rounded border border-border/30"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03, ease }}
                >
                  <p className="text-sm text-text-secondary line-clamp-3">
                    {comment.body}
                  </p>
                  <div className="flex items-center gap-3 mt-1.5 text-[10px] text-text-tertiary">
                    <span>{comment.score} points</span>
                    <span>{timeAgo(comment.createdAt)}</span>
                  </div>
                </motion.div>
              ))
            )}
          </div>
        </motion.div>
      )}

      {activeTab === "reviews" && (
        <motion.div variants={fadeUp} className="space-y-4">
          {reviewSummary && <ReviewSummaryComponent summary={reviewSummary} />}
          {reviewsLoading ? (
            <div className="flex justify-center py-6">
              <Spinner />
            </div>
          ) : reviews.length === 0 ? (
            <EmptyState title="No reviews yet" />
          ) : (
            <div className="space-y-2">
              {reviews.map((review) => (
                <ReviewCard key={review.id} review={review} />
              ))}
            </div>
          )}
        </motion.div>
      )}

      {activeTab === "friends" && (
        <motion.div variants={fadeUp}>
          {friendCount === 0 ? (
            <EmptyState title="No friends yet" />
          ) : (
            <div className="flex flex-wrap gap-2">
              {friends.slice(0, 20).map((friendAddr) => (
                <Link
                  key={friendAddr}
                  href={`/forum/u/${friendAddr}`}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-border/30 hover:border-lob-green/30 transition-colors group"
                >
                  <div className="w-5 h-5 rounded-full bg-surface-3 flex items-center justify-center text-[9px] font-bold text-text-tertiary group-hover:text-lob-green">
                    {friendAddr.slice(2, 4).toUpperCase()}
                  </div>
                  <span className="text-xs text-text-secondary group-hover:text-lob-green font-mono">
                    {friendAddr.slice(0, 6)}...{friendAddr.slice(-4)}
                  </span>
                </Link>
              ))}
              {friendCount > 20 && (
                <span className="text-xs text-text-tertiary self-center">
                  +{friendCount - 20} more
                </span>
              )}
            </div>
          )}
        </motion.div>
      )}
    </motion.div>
  );
}
