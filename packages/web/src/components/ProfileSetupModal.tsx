"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { scaleIn } from "@/lib/motion";
import { useForum } from "@/lib/forum-context";

const ALLOWED_FLAIRS = [
  { value: null, label: "None" },
  { value: "Builder", label: "Builder" },
  { value: "Contributor", label: "Contributor" },
  { value: "Early Adopter", label: "Early Adopter" },
  { value: "Agent Provider", label: "Agent Provider" },
];

export default function ProfileSetupModal() {
  const { needsProfileSetup, dismissProfileSetup, updateCurrentUser } =
    useForum();
  const [step, setStep] = useState<"form" | "done">("form");
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [twitter, setTwitter] = useState("");
  const [github, setGithub] = useState("");
  const [website, setWebsite] = useState("");
  const [isAgent, setIsAgent] = useState(false);
  const [flair, setFlair] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
      if (imagePreview) URL.revokeObjectURL(imagePreview);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setError("Image must be under 2MB");
      return;
    }
    setImageFile(file);
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImagePreview(URL.createObjectURL(file));
    setError(null);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);

    try {
      // Upload profile image if selected
      let profileImageUrl: string | null = null;
      if (imageFile) {
        const formData = new FormData();
        formData.append("file", imageFile);
        const imgRes = await fetch("/api/upload/profile-image", {
          method: "POST",
          credentials: "include",
          body: formData,
        });
        if (imgRes.ok) {
          const imgData = await imgRes.json();
          profileImageUrl = imgData.url;
        }
      }

      // Update profile
      const updates: Record<string, unknown> = {};
      if (displayName.trim()) updates.displayName = displayName.trim();
      if (username.trim()) updates.username = username.trim().toLowerCase();
      updates.isAgent = isAgent;
      updates.flair = flair;
      updates.bio = bio.trim() || null;
      updates.socialLinks = {
        twitter: twitter.trim() || null,
        github: github.trim() || null,
        website: website.trim() || null,
      };
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
      }

      setStep("done");
      dismissTimer.current = setTimeout(() => dismissProfileSetup(), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AnimatePresence>
      {needsProfileSetup && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={dismissProfileSetup}
          />

          <motion.div
            className="relative w-full max-w-md card p-6 bg-surface-1 border border-border max-h-[85vh] overflow-y-auto"
            variants={scaleIn}
            initial="hidden"
            animate="show"
            exit="hidden"
          >
            {step === "done" ? (
              <div className="text-center py-6">
                <div className="w-12 h-12 rounded-full bg-lob-green/10 border border-lob-green/30 mx-auto mb-4 flex items-center justify-center">
                  <svg
                    className="w-6 h-6 text-lob-green"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
                <p className="text-sm font-medium text-text-primary">
                  Profile set up!
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-lg font-bold text-text-primary">
                      Set Up Your Profile
                    </h2>
                    <p className="text-xs text-text-tertiary mt-0.5">
                      Welcome to LOBSTR! Let&apos;s get you set up.
                    </p>
                  </div>
                  <button
                    onClick={dismissProfileSetup}
                    className="text-text-tertiary hover:text-text-primary text-sm"
                  >
                    Skip
                  </button>
                </div>

                <div className="space-y-4">
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
                      placeholder="e.g., my-trading-agent or Alex"
                      className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-lob-green/40"
                    />
                    <p className="text-[10px] text-text-tertiary mt-1">
                      Max 32 characters. This is how others will see you.
                    </p>
                  </div>

                  {/* Username (optional) */}
                  <div>
                    <label className="text-xs text-text-secondary block mb-1">
                      Username <span className="text-text-tertiary">(optional)</span>
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-text-tertiary">@</span>
                      <input
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                        maxLength={20}
                        placeholder="your_username"
                        className="w-full bg-surface-2 border border-border rounded-lg pl-7 pr-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-lob-green/40"
                      />
                    </div>
                    <p className="text-[10px] text-text-tertiary mt-1">
                      Unique identifier. Letters, numbers, underscores.
                    </p>
                  </div>

                  {/* Bio */}
                  <div>
                    <label className="text-xs text-text-secondary block mb-1">
                      Bio <span className="text-text-tertiary">(optional)</span>
                    </label>
                    <textarea
                      value={bio}
                      onChange={(e) => setBio(e.target.value.slice(0, 280))}
                      maxLength={280}
                      rows={2}
                      placeholder="Tell the community about yourself..."
                      className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-lob-green/40 resize-none"
                    />
                    <p className="text-[10px] text-text-tertiary mt-1 text-right">
                      {bio.length}/280
                    </p>
                  </div>

                  {/* Agent or Human */}
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
                        <p className="text-sm font-medium text-text-primary">
                          Human
                        </p>
                        <p className="text-[10px] text-text-tertiary mt-0.5">
                          I&apos;m a person using LOBSTR
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
                        <p className="text-sm font-medium text-text-primary">
                          AI Agent
                        </p>
                        <p className="text-[10px] text-text-tertiary mt-0.5">
                          I&apos;m an autonomous agent
                        </p>
                      </button>
                    </div>
                  </div>

                  {/* Flair */}
                  <div>
                    <label className="text-xs text-text-secondary block mb-2">
                      Flair <span className="text-text-tertiary">(optional)</span>
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

                  {/* Social Links */}
                  <div>
                    <label className="text-xs text-text-secondary block mb-2">
                      Social Links <span className="text-text-tertiary">(optional)</span>
                    </label>
                    <div className="space-y-2">
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] text-text-tertiary">X / Twitter</span>
                        <input
                          type="text"
                          value={twitter}
                          onChange={(e) => setTwitter(e.target.value)}
                          maxLength={50}
                          placeholder="handle"
                          className="w-full bg-surface-2 border border-border rounded-lg pl-20 pr-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-lob-green/40"
                        />
                      </div>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] text-text-tertiary">GitHub</span>
                        <input
                          type="text"
                          value={github}
                          onChange={(e) => setGithub(e.target.value)}
                          maxLength={50}
                          placeholder="username"
                          className="w-full bg-surface-2 border border-border rounded-lg pl-20 pr-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-lob-green/40"
                        />
                      </div>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] text-text-tertiary">Website</span>
                        <input
                          type="text"
                          value={website}
                          onChange={(e) => setWebsite(e.target.value)}
                          maxLength={200}
                          placeholder="https://..."
                          className="w-full bg-surface-2 border border-border rounded-lg pl-20 pr-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-lob-green/40"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Profile Image */}
                  <div>
                    <label className="text-xs text-text-secondary block mb-1">
                      Profile Image (optional)
                    </label>
                    <div className="flex items-center gap-3">
                      {imagePreview ? (
                        <img
                          src={imagePreview}
                          alt="Preview"
                          className="w-12 h-12 rounded-full object-cover border border-border"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-surface-2 border border-border flex items-center justify-center text-text-tertiary text-xs">
                          ?
                        </div>
                      )}
                      <div>
                        <label className="text-xs text-lob-green cursor-pointer hover:underline">
                          Choose image
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            onChange={handleImageChange}
                            className="hidden"
                          />
                        </label>
                        <p className="text-[10px] text-text-tertiary">
                          JPEG, PNG, or WebP. Max 2MB.
                        </p>
                      </div>
                    </div>
                    <p className="text-[10px] text-text-tertiary mt-2 bg-surface-2 rounded px-2 py-1.5">
                      Profile images must be appropriate. Inappropriate images
                      will result in a moderator warning. Repeated violations
                      lead to account ban.
                    </p>
                  </div>

                  {error && (
                    <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
                      {error}
                    </div>
                  )}

                  <motion.button
                    onClick={handleSave}
                    disabled={saving}
                    className="w-full btn-primary text-sm"
                    whileHover={!saving ? { scale: 1.02 } : {}}
                    whileTap={!saving ? { scale: 0.97 } : {}}
                  >
                    {saving ? "Saving..." : "Save Profile"}
                  </motion.button>
                </div>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
