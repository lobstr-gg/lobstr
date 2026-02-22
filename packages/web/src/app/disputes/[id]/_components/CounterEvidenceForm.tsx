"use client";

import { useState, useRef } from "react";
import { motion } from "framer-motion";
import { useSubmitCounterEvidence } from "@/lib/hooks";

interface CounterEvidenceFormProps {
  disputeId: bigint;
  counterEvidenceDeadline: number; // unix seconds
  onSuccess: () => void;
}

export default function CounterEvidenceForm({ disputeId, counterEvidenceDeadline, onSuccess }: CounterEvidenceFormProps) {
  const submitCounterEvidence = useSubmitCounterEvidence();
  const [files, setFiles] = useState<File[]>([]);
  const [note, setNote] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const now = Math.floor(Date.now() / 1000);
  const expired = counterEvidenceDeadline > 0 && now > counterEvidenceDeadline;
  const timeRemaining = counterEvidenceDeadline - now;
  const hoursRemaining = Math.max(0, Math.floor(timeRemaining / 3600));
  const minsRemaining = Math.max(0, Math.floor((timeRemaining % 3600) / 60));

  if (expired) {
    return (
      <div className="card p-5 text-center">
        <p className="text-xs text-text-tertiary">Counter-evidence deadline has passed.</p>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="card p-5 text-center">
        <div className="w-10 h-10 rounded-full bg-lob-green/10 flex items-center justify-center mx-auto mb-3">
          <span className="text-lob-green text-lg">{"\u2713"}</span>
        </div>
        <p className="text-sm text-text-secondary">Counter-Evidence Submitted</p>
        <p className="text-xs text-text-tertiary mt-1">The dispute will advance to voting.</p>
      </div>
    );
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles((prev) => [...prev, ...Array.from(e.target.files!)].slice(0, 5));
    }
  };

  const handleSubmit = async () => {
    setUploading(true);
    setError(null);

    try {
      let evidenceURI = "";

      // Upload files if any
      if (files.length > 0) {
        const formData = new FormData();
        formData.append("disputeId", disputeId.toString());
        files.forEach((f) => formData.append("files", f));

        const uploadRes = await fetch("/api/upload/evidence", {
          method: "POST",
          credentials: "include",
          body: formData,
        });

        if (!uploadRes.ok) {
          const data = await uploadRes.json();
          throw new Error(data.error || "Upload failed");
        }

        const uploadData = await uploadRes.json();
        evidenceURI = JSON.stringify({
          files: uploadData.files.map((f: { name: string; path: string }) => ({
            name: f.name,
            path: f.path,
          })),
          note: note.trim(),
          uploadedAt: Date.now(),
        });
      } else {
        evidenceURI = JSON.stringify({
          note: note.trim(),
          uploadedAt: Date.now(),
        });
      }

      // Submit on-chain
      await submitCounterEvidence(disputeId, evidenceURI);
      setSubmitted(true);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="card p-5">
      <h3 className="text-sm font-semibold text-text-primary mb-1">Submit Counter-Evidence</h3>
      <p className="text-xs text-yellow-400 mb-4">
        {hoursRemaining}h {minsRemaining}m remaining
      </p>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={handleFileChange}
        className="hidden"
        accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.txt,.md,.json,.csv,.zip"
      />
      <button
        onClick={() => fileInputRef.current?.click()}
        className="text-xs px-3 py-1.5 rounded border border-dashed border-border hover:border-lob-green/40 text-text-secondary hover:text-lob-green transition-colors mb-3"
        disabled={files.length >= 5}
      >
        + Add Files (max 5)
      </button>

      {files.length > 0 && (
        <div className="mb-3 space-y-1">
          {files.map((file, i) => (
            <div key={`${file.name}-${i}`} className="flex items-center gap-2 text-xs">
              <span className="text-text-secondary truncate flex-1">{file.name}</span>
              <span className="text-text-tertiary">{(file.size / 1024).toFixed(0)}KB</span>
              <button
                onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
                className="text-red-400 hover:text-red-300"
              >
                x
              </button>
            </div>
          ))}
        </div>
      )}

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Describe your counter-evidence..."
        className="w-full bg-surface-2 border border-border rounded p-2 text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-lob-green/40 resize-none mb-3"
        rows={3}
        maxLength={2000}
      />

      {error && (
        <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded p-2 mb-3">
          {error}
        </div>
      )}

      <motion.button
        className="btn-primary w-full text-xs"
        whileTap={{ scale: 0.97 }}
        onClick={handleSubmit}
        disabled={uploading}
      >
        {uploading ? "Submitting..." : "Submit Counter-Evidence"}
      </motion.button>
    </div>
  );
}
