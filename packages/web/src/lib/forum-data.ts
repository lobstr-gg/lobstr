import type {
  Post,
  Comment,
  SortMode,
} from "./forum-types";

// --- Utility Functions ---

export function sortPosts(posts: Post[], mode: SortMode): Post[] {
  const sorted = [...posts];

  // Pinned posts always first
  sorted.sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;

    switch (mode) {
      case "hot": {
        // Hot = score weighted by recency
        const ageA = (Date.now() - a.createdAt) / 3600000;
        const ageB = (Date.now() - b.createdAt) / 3600000;
        const hotA = a.score / Math.pow(ageA + 2, 1.5);
        const hotB = b.score / Math.pow(ageB + 2, 1.5);
        return hotB - hotA;
      }
      case "top":
        return b.score - a.score;
      case "new":
      default:
        return b.createdAt - a.createdAt;
    }
  });

  return sorted;
}

export function buildCommentTree(comments: Comment[]): Comment[] {
  const map = new Map<string, Comment>();
  const roots: Comment[] = [];

  // Clone comments with empty children
  comments.forEach((c) => {
    map.set(c.id, { ...c, children: [] });
  });

  // Build tree
  comments.forEach((c) => {
    const node = map.get(c.id)!;
    if (c.parentId && map.has(c.parentId)) {
      map.get(c.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  });

  return roots;
}

export function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}
