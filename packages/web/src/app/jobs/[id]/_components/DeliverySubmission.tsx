"use client";

import { useState, useRef } from "react";
import { motion } from "framer-motion";
import { useSubmitDelivery } from "@/lib/hooks";

interface DeliverySubmissionProps {
  jobId: bigint;
  onSuccess: () => void;
}

export default function DeliverySubmission({ jobId, onSuccess }: DeliverySubmissionProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [note, setNote] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<"upload" | "submit" | "done">("upload");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const submitDelivery = useSubmitDelivery();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      setFiles((prev) => [...prev, ...newFiles].slice(0, 5));
    }
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    setUploading(true);
    setError(null);

    try {
      // Step 1: Upload files to Firebase Storage
      let metadataURI = "";

      if (files.length > 0) {
        const formData = new FormData();
        formData.append("jobId", jobId.toString());
        files.forEach((f) => formData.append("files", f));

        const uploadRes = await fetch("/api/upload/delivery", {
          method: "POST",
          credentials: "include",
          body: formData,
        });

        if (!uploadRes.ok) {
          const data = await uploadRes.json();
          throw new Error(data.error || "Upload failed");
        }

        const uploadData = await uploadRes.json();
        // Create a metadata URI from uploaded file paths
        metadataURI = JSON.stringify({
          files: uploadData.files.map((f: { name: string; path: string; url: string }) => ({
            name: f.name,
            path: f.path,
          })),
          note,
          uploadedAt: Date.now(),
        });
      } else {
        metadataURI = JSON.stringify({ note, uploadedAt: Date.now() });
      }

      setStep("submit");

      // Step 2: Call submitDelivery on-chain
      await submitDelivery(jobId, metadataURI);

      setStep("done");
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed");
      setStep("upload");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="card p-5">
      <h3 className="text-sm font-semibold text-text-primary mb-3">
        Submit Delivery
      </h3>
      <p className="text-xs text-text-tertiary mb-4">
        Upload proof of work and submit delivery for buyer review.
      </p>

      {/* File upload */}
      <div className="mb-4">
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
          className="text-xs px-3 py-1.5 rounded border border-dashed border-border hover:border-lob-green/40 text-text-secondary hover:text-lob-green transition-colors"
          disabled={files.length >= 5}
        >
          + Add Files (max 5)
        </button>

        {files.length > 0 && (
          <div className="mt-2 space-y-1">
            {files.map((file, i) => (
              <div
                key={`${file.name}-${i}`}
                className="flex items-center gap-2 text-xs"
              >
                <span className="text-text-secondary truncate flex-1">
                  {file.name}
                </span>
                <span className="text-text-tertiary">
                  {(file.size / 1024).toFixed(0)}KB
                </span>
                <button
                  onClick={() => removeFile(i)}
                  className="text-red-400 hover:text-red-300"
                >
                  x
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Delivery note */}
      <div className="mb-4">
        <label className="text-xs text-text-tertiary block mb-1">
          Delivery Note (optional)
        </label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Describe the completed work..."
          className="w-full bg-surface-2 border border-border rounded p-2 text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-lob-green/40 resize-none"
          rows={3}
          maxLength={500}
        />
      </div>

      {error && (
        <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded p-2 mb-3">
          {error}
        </div>
      )}

      <motion.button
        className="btn-primary w-full text-xs"
        whileTap={{ scale: 0.97 }}
        onClick={handleSubmit}
        disabled={uploading || step === "done"}
      >
        {uploading
          ? step === "submit"
            ? "Submitting on-chain..."
            : "Uploading files..."
          : step === "done"
          ? "Delivery Submitted"
          : "Submit Delivery"}
      </motion.button>
    </div>
  );
}
