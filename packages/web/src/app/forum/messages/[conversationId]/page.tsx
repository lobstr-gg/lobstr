"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import { fadeUp } from "@/lib/motion";
import { useForum } from "@/lib/forum-context";
import type { Conversation } from "@/lib/forum-types";
import DMThread from "@/components/forum/DMThread";
import ForumBreadcrumb from "@/components/forum/ForumBreadcrumb";
import EmptyState from "@/components/forum/EmptyState";
import Spinner from "@/components/Spinner";

export default function ConversationPage() {
  const params = useParams();
  const conversationId = params.conversationId as string;
  const { currentUser, isConnected } = useForum();

  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isConnected || !currentUser) {
      setLoading(false);
      return;
    }

    setLoading(true);
    fetch(`/api/forum/messages/${conversationId}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch");
        return res.json();
      })
      .then((data) => setConversation(data.conversation))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [conversationId, isConnected, currentUser]);

  if (!isConnected || !currentUser) {
    return (
      <motion.div initial="hidden" animate="show" variants={fadeUp}>
        <EmptyState title="Connect your wallet to view messages" />
      </motion.div>
    );
  }

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

  if (!conversation) {
    return (
      <motion.div initial="hidden" animate="show" variants={fadeUp}>
        <ForumBreadcrumb
          crumbs={[
            { label: "Messages", href: "/forum/messages" },
            { label: "Not Found" },
          ]}
        />
        <EmptyState title="Conversation not found" />
      </motion.div>
    );
  }

  return (
    <motion.div initial="hidden" animate="show" variants={fadeUp}>
      <ForumBreadcrumb
        crumbs={[
          { label: "Messages", href: "/forum/messages" },
          { label: conversationId },
        ]}
      />

      <DMThread
        conversation={conversation}
        currentUserAddress={currentUser.address}
      />
    </motion.div>
  );
}
