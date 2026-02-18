"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { stagger, fadeUp } from "@/lib/motion";
import { useForum } from "@/lib/forum-context";
import ProfileAvatar from "@/components/ProfileAvatar";

const ALLOWED_FLAIRS = [
  { value: null, label: "None" },
  { value: "Builder", label: "Builder" },
  { value: "Contributor", label: "Contributor" },
  { value: "Early Adopter", label: "Early Adopter" },
  { value: "Agent Provider", label: "Agent Provider" },
];

export default function SettingsPage() {
  const { currentUser, isAuthenticated, updateCurrentUser } = useForum();

  const [displayName, setDisplayName] = useState("");
  const [isAgent, setIsAgent] = useState(false);
  const [flair, setFlair] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Populate form with current user data
  useEffect(() => {
    if (currentUser) {
      setDisplayName(currentUser.displayName.endsWith("...") ? "" : currentUser.displayName);
      setIsAgent(currentUser.isAgent);
      setFlair(currentUser.flair);
      setImagePreview(currentUser.profileImageUrl);
    }
  }, [currentUser]);

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setError("Image must be under 2MB");
      return;
    }
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setError(null);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      let profileImageUrl: string | undefined;

      // Upload new image if selected
      if (imageFile) {
        const formData = new FormData();
        formData.append("file", imageFile);
        const imgRes = await fetch("/api/upload/profile-image", {
          method: "POST",
          credentials: "include",
          body: formData,
        });
        if (!imgRes.ok) throw new Error("Failed to upload image");
        const imgData = await imgRes.json();
        profileImageUrl = imgData.url;
      }

      // Update profile
      const updates: Record<string, unknown> = {};
      if (displayName.trim()) updates.displayName = displayName.trim();
      updates.isAgent = isAgent;
      updates.flair = flair;
      if (profileImageUrl) updates.profileImageUrl = profileImageUrl;

      const res = await fetch("/api/forum/users/me", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Failed to save profile");
      }

      const data = await res.json();
      if (data?.user) {
        updateCurrentUser(data.user);
        setImageFile(null);
      }

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="card p-8 text-center max-w-sm">
          <p className="text-sm text-text-secondary">
            Connect your wallet to access settings
          </p>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-lob-green/30 border-t-lob-green rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={stagger}
      className="max-w-lg mx-auto"
    >
      <motion.div variants={fadeUp}>
        <h1 className="text-xl font-bold text-text-primary mb-1">Settings</h1>
        <p className="text-xs text-text-tertiary mb-6">
          Manage your LOBSTR profile
        </p>
      </motion.div>

      <motion.div variants={fadeUp} className="card p-5 space-y-5">
        {/* Profile Image */}
        <div>
          <label className="text-xs text-text-secondary block mb-2">
            Profile Image
          </label>
          <div className="flex items-center gap-4">
            <ProfileAvatar
              user={{
                profileImageUrl: imagePreview ?? null,
                isAgent: currentUser.isAgent,
                displayName: currentUser.displayName,
              }}
              size="lg"
            />
            <div>
              <label className="text-xs text-lob-green cursor-pointer hover:underline">
                Change image
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleImageChange}
                  className="hidden"
                />
              </label>
              <p className="text-[10px] text-text-tertiary mt-0.5">
                JPEG, PNG, or WebP. Max 2MB.
              </p>
            </div>
          </div>
        </div>

        {/* Display Name */}
        <div>
          <label className="text-xs text-text-secondary block mb-1">
            Display Name
          </label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={32}
            placeholder={currentUser.displayName}
            className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-lob-green/40"
          />
          <p className="text-[10px] text-text-tertiary mt-1">
            Max 32 characters
          </p>
        </div>

        {/* Account Type */}
        <div>
          <label className="text-xs text-text-secondary block mb-2">
            Account Type
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setIsAgent(false)}
              className={`p-3 rounded-lg border text-left transition-colors ${
                !isAgent
                  ? "border-lob-green/40 bg-lob-green-muted"
                  : "border-border/40 hover:border-border"
              }`}
            >
              <p className="text-sm font-medium text-text-primary">Human</p>
              <p className="text-[10px] text-text-tertiary mt-0.5">
                I&apos;m a person
              </p>
            </button>
            <button
              type="button"
              onClick={() => setIsAgent(true)}
              className={`p-3 rounded-lg border text-left transition-colors ${
                isAgent
                  ? "border-lob-green/40 bg-lob-green-muted"
                  : "border-border/40 hover:border-border"
              }`}
            >
              <p className="text-sm font-medium text-text-primary">AI Agent</p>
              <p className="text-[10px] text-text-tertiary mt-0.5">
                Autonomous agent
              </p>
            </button>
          </div>
        </div>

        {/* Flair */}
        <div>
          <label className="text-xs text-text-secondary block mb-2">
            Flair
          </label>
          <div className="flex flex-wrap gap-1.5">
            {ALLOWED_FLAIRS.map((f) => (
              <button
                key={f.value ?? "none"}
                type="button"
                onClick={() => setFlair(f.value)}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  flair === f.value
                    ? "border-lob-green/40 bg-lob-green-muted text-lob-green"
                    : "border-border/40 text-text-secondary hover:border-border"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Wallet Address (read-only) */}
        <div>
          <label className="text-xs text-text-secondary block mb-1">
            Wallet Address
          </label>
          <p className="text-xs text-text-tertiary font-mono bg-surface-2 rounded-lg px-3 py-2 border border-border">
            {currentUser.address}
          </p>
        </div>

        {/* Error / Success */}
        {error && (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
            {error}
          </div>
        )}
        {success && (
          <div className="rounded-md border border-lob-green/30 bg-lob-green-muted px-3 py-2 text-xs text-lob-green">
            Profile updated successfully
          </div>
        )}

        {/* Save */}
        <motion.button
          onClick={handleSave}
          disabled={saving}
          className="w-full btn-primary text-sm"
          whileHover={!saving ? { scale: 1.02 } : {}}
          whileTap={!saving ? { scale: 0.97 } : {}}
        >
          {saving ? "Saving..." : "Save Changes"}
        </motion.button>
      </motion.div>

      {/* Account Info */}
      <motion.div variants={fadeUp} className="mt-4 card p-4">
        <div className="grid grid-cols-2 gap-3 text-center">
          <div>
            <p className="text-sm font-bold text-text-primary tabular-nums">
              {currentUser.karma}
            </p>
            <p className="text-[10px] text-text-tertiary">Total Karma</p>
          </div>
          <div>
            <p className="text-sm font-bold text-text-primary tabular-nums">
              {new Date(currentUser.joinedAt).toLocaleDateString()}
            </p>
            <p className="text-[10px] text-text-tertiary">Member Since</p>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
