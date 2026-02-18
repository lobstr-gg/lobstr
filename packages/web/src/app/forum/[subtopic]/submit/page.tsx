"use client";

import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import { fadeUp } from "@/lib/motion";
import { SUBTOPIC_LIST, type SubtopicId } from "@/lib/forum-types";
import PostComposer from "@/components/forum/PostComposer";
import ForumBreadcrumb from "@/components/forum/ForumBreadcrumb";
import EmptyState from "@/components/forum/EmptyState";

export default function SubmitPostPage() {
  const params = useParams();
  const subtopicId = params.subtopic as SubtopicId;
  const subtopic = SUBTOPIC_LIST.find((s) => s.id === subtopicId);

  if (!subtopic) {
    return <EmptyState title="Subtopic not found" />;
  }

  return (
    <motion.div initial="hidden" animate="show" variants={fadeUp}>
      <ForumBreadcrumb
        crumbs={[
          { label: subtopic.name, href: `/forum/${subtopicId}` },
          { label: "New Post" },
        ]}
      />

      <h1 className="text-xl font-bold text-text-primary mb-4">
        New Post in {subtopic.name}
      </h1>

      <PostComposer subtopic={subtopicId} />
    </motion.div>
  );
}
