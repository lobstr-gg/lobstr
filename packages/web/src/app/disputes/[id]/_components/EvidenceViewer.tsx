"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

interface EvidenceFile {
  id: string;
  name: string;
  size: number;
  type: string;
  uploadedBy: string;
  uploadedAt: number;
  url: string;
}

interface EvidenceViewerProps {
  disputeId: string;
}

export default function EvidenceViewer({ disputeId }: EvidenceViewerProps) {
  const [files, setFiles] = useState<EvidenceFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchEvidence() {
      try {
        const res = await fetch(`/api/disputes/${disputeId}/evidence`, {
          credentials: "include",
        });
        if (!res.ok) {
          if (res.status === 403) {
            setError("Access denied");
            return;
          }
          throw new Error("Failed to fetch evidence");
        }
        const data = await res.json();
        setFiles(data.files || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load evidence");
      } finally {
        setLoading(false);
      }
    }
    fetchEvidence();
  }, [disputeId]);

  if (loading) {
    return (
      <div className="card p-5">
        <h3 className="text-sm font-semibold text-text-primary mb-3">Evidence</h3>
        <div className="animate-pulse space-y-2">
          <div className="h-3 bg-surface-3 rounded w-2/3" />
          <div className="h-3 bg-surface-3 rounded w-1/2" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card p-5">
        <h3 className="text-sm font-semibold text-text-primary mb-3">Evidence</h3>
        <p className="text-xs text-text-tertiary">{error}</p>
      </div>
    );
  }

  const isImage = (type: string) => type.startsWith("image/");

  return (
    <div className="card p-5">
      <h3 className="text-sm font-semibold text-text-primary mb-3">
        Evidence ({files.length} file{files.length !== 1 ? "s" : ""})
      </h3>

      {files.length === 0 ? (
        <p className="text-xs text-text-tertiary">No evidence submitted yet.</p>
      ) : (
        <div className="space-y-3">
          {files.map((file) => (
            <motion.div
              key={file.id}
              className="border border-border rounded-lg p-3"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
            >
              {isImage(file.type) && (
                <img
                  src={file.url}
                  alt={file.name}
                  className="max-h-48 rounded mb-2 object-contain"
                />
              )}
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs text-text-primary font-medium truncate">{file.name}</p>
                  <p className="text-[10px] text-text-tertiary">
                    {file.uploadedBy.slice(0, 6)}...{file.uploadedBy.slice(-4)} &middot; {(file.size / 1024).toFixed(0)}KB
                  </p>
                </div>
                <a
                  href={file.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-lob-green hover:underline shrink-0"
                >
                  Download
                </a>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
