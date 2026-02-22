"use client";

import { useState, useRef } from "react";
import { motion } from "framer-motion";

interface EvidenceUploadProps {
  disputeId: string;
  onSuccess: () => void;
}

export default function EvidenceUpload({ disputeId, onSuccess }: EvidenceUploadProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      setFiles((prev) => [...prev, ...newFiles].slice(0, 5));
    }
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    if (files.length === 0) return;
    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("disputeId", disputeId);
      files.forEach((f) => formData.append("files", f));

      const res = await fetch("/api/upload/evidence", {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Upload failed");
      }

      setUploaded(true);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  if (uploaded) {
    return (
      <div className="card p-5 text-center">
        <div className="w-10 h-10 rounded-full bg-lob-green/10 flex items-center justify-center mx-auto mb-3">
          <span className="text-lob-green text-lg">{"\u2713"}</span>
        </div>
        <p className="text-sm text-text-secondary">Evidence Uploaded</p>
      </div>
    );
  }

  return (
    <div className="card p-5">
      <h3 className="text-sm font-semibold text-text-primary mb-1">Upload Evidence</h3>
      <p className="text-xs text-text-tertiary mb-4">
        Upload files to support your case (max 5 files).
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
        className="text-xs px-3 py-1.5 rounded border border-dashed border-border hover:border-lob-green/40 text-text-secondary hover:text-lob-green transition-colors"
        disabled={files.length >= 5}
      >
        + Add Files (max 5)
      </button>

      {files.length > 0 && (
        <div className="mt-2 space-y-1">
          {files.map((file, i) => (
            <div key={`${file.name}-${i}`} className="flex items-center gap-2 text-xs">
              <span className="text-text-secondary truncate flex-1">{file.name}</span>
              <span className="text-text-tertiary">{(file.size / 1024).toFixed(0)}KB</span>
              <button onClick={() => removeFile(i)} className="text-red-400 hover:text-red-300">x</button>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded p-2 mt-3">
          {error}
        </div>
      )}

      <motion.button
        className="btn-primary w-full text-xs mt-4"
        whileTap={{ scale: 0.97 }}
        onClick={handleUpload}
        disabled={files.length === 0 || uploading}
      >
        {uploading ? "Uploading..." : "Upload Evidence"}
      </motion.button>
    </div>
  );
}
