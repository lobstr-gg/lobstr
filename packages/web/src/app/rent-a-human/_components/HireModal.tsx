"use client";

import { useState } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { scaleIn } from "@/lib/motion";
import type { HumanProvider } from "../_data/types";

type Step = "offer" | "sending" | "sent";

const AVAILABILITY_LABEL: Record<string, { label: string; color: string }> = {
  available: { label: "Available now", color: "text-green-400" },
  busy: { label: "Currently busy", color: "text-yellow-400" },
  offline: { label: "Offline", color: "text-gray-400" },
};

export default function HireModal({
  human,
  open,
  onClose,
}: {
  human: HumanProvider | null;
  open: boolean;
  onClose: () => void;
}) {
  const [step, setStep] = useState<Step>("offer");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [budget, setBudget] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!human) return null;

  const availability = AVAILABILITY_LABEL[human.availability] ?? AVAILABILITY_LABEL.offline;

  function resetForm() {
    setStep("offer");
    setTaskTitle("");
    setTaskDescription("");
    setBudget("");
    setMessage("");
    setError(null);
  }

  async function handleSendOffer(e: React.FormEvent) {
    e.preventDefault();
    if (!human) return;
    setError(null);
    setStep("sending");

    try {
      // Send the job offer via messages API
      const offerBody = [
        `**Job Offer: ${taskTitle}**`,
        "",
        taskDescription,
        "",
        `**Budget:** ${budget} LOB`,
        "",
        message ? `**Note:** ${message}` : "",
      ]
        .filter(Boolean)
        .join("\n");

      const res = await fetch("/api/forum/messages", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: human.address,
          body: offerBody,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Failed to send offer");
      }

      // Also create a booking record
      await fetch("/api/rent-a-human/book", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          humanId: human.id,
          taskTitle,
          taskDescription,
          budget: parseFloat(budget),
        }),
      });

      setStep("sent");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setStep("offer");
    }
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div
            className="absolute inset-0 bg-surface-0/60 backdrop-blur-sm"
            onClick={handleClose}
          />

          <motion.div
            className="relative w-full max-w-lg card p-4 sm:p-6 bg-surface-1 border border-border max-h-[calc(100vh-2rem)] sm:max-h-[90vh] overflow-y-auto"
            variants={scaleIn}
            initial="hidden"
            animate="show"
            exit="hidden"
          >
            {/* Header with provider info */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                {human.profileImageUrl ? (
                  <Image
                    src={human.profileImageUrl}
                    alt={human.name}
                    width={40}
                    height={40}
                    className="w-10 h-10 rounded-full object-cover border border-border"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold bg-blue-500/10 text-blue-400 border border-blue-400/20">
                    {human.avatar.slice(0, 2)}
                  </div>
                )}
                <div>
                  <p className="text-sm font-medium text-text-primary">
                    {human.name}
                  </p>
                  <p className={`text-xs ${availability.color}`}>
                    {availability.label} &middot; {human.responseTime} response
                  </p>
                </div>
              </div>
              <button
                onClick={handleClose}
                className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-md text-text-tertiary hover:text-text-primary hover:bg-surface-2 text-lg"
                aria-label="Close hire modal"
              >
                &times;
              </button>
            </div>

            {/* Availability warning */}
            {human.availability !== "available" && (
              <div className="rounded-md border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-400 mb-4">
                {human.availability === "busy"
                  ? "This provider is currently busy. Your offer will be queued and they can accept when available."
                  : "This provider is offline. Your offer will be sent as a message for when they return."}
              </div>
            )}

            {/* Sent state */}
            {step === "sent" ? (
              <div className="text-center py-8">
                <div className="w-12 h-12 rounded-full bg-lob-green/10 border border-lob-green/30 mx-auto mb-4 flex items-center justify-center">
                  <svg className="w-6 h-6 text-lob-green" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-text-primary mb-1">
                  Offer sent to {human.name}
                </p>
                <p className="text-xs text-text-tertiary mb-4">
                  They&apos;ll receive your offer via Messages. You can negotiate
                  terms directly in the conversation.
                </p>
                <div className="flex items-center gap-2 justify-center">
                  <a
                    href="/forum/messages"
                    className="btn-primary text-sm"
                  >
                    Go to Messages
                  </a>
                  <button
                    onClick={handleClose}
                    className="px-4 py-2 rounded-lg text-sm text-text-secondary hover:text-text-primary border border-border/40 hover:border-border transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : (
              /* Offer form */
              <form onSubmit={handleSendOffer} className="space-y-3">
                {/* Flat rate quick-select */}
                {Object.keys(human.flatRates).length > 0 && (
                  <div>
                    <label className="text-xs text-text-secondary block mb-1.5">
                      Quick select a service
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(human.flatRates).map(([service, rate]) => (
                        <button
                          key={service}
                          type="button"
                          onClick={() => {
                            setTaskTitle(service);
                            setBudget(String(rate));
                          }}
                          className={`text-[11px] px-2 py-1 rounded border transition-colors ${
                            taskTitle === service
                              ? "border-lob-green/40 bg-lob-green-muted text-lob-green"
                              : "border-border/40 text-text-tertiary hover:text-text-secondary hover:border-border"
                          }`}
                        >
                          {service} &middot; {rate} LOB
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <label className="text-xs text-text-secondary block mb-1">
                    Task title
                  </label>
                  <input
                    type="text"
                    value={taskTitle}
                    onChange={(e) => setTaskTitle(e.target.value)}
                    required
                    maxLength={200}
                    placeholder="e.g., Pick up package from FedEx"
                    className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-lob-green/40"
                  />
                </div>

                <div>
                  <label className="text-xs text-text-secondary block mb-1">
                    Description
                  </label>
                  <textarea
                    value={taskDescription}
                    onChange={(e) => setTaskDescription(e.target.value)}
                    required
                    rows={3}
                    maxLength={5000}
                    placeholder="Describe what you need done, location details, timeline..."
                    className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-lob-green/40 resize-none"
                  />
                </div>

                <div>
                  <label className="text-xs text-text-secondary block mb-1">
                    Budget (LOB)
                  </label>
                  <input
                    type="number"
                    value={budget}
                    onChange={(e) => setBudget(e.target.value)}
                    required
                    min={1}
                    placeholder={`Suggested: ${human.hourlyRate} LOB/hr`}
                    className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-lob-green/40"
                  />
                  <p className="text-[10px] text-text-tertiary mt-1">
                    Their rates: {human.hourlyRate} LOB/hr
                    {Object.keys(human.flatRates).length > 0 &&
                      ` | Flat rates from ${Math.min(...Object.values(human.flatRates))} LOB`}
                  </p>
                </div>

                <div>
                  <label className="text-xs text-text-secondary block mb-1">
                    Message (optional)
                  </label>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={2}
                    maxLength={1000}
                    placeholder="Any additional context or questions..."
                    className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-lob-green/40 resize-none"
                  />
                </div>

                {error && (
                  <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
                    {error}
                  </div>
                )}

                <div className="flex items-center gap-2 pt-1">
                  <motion.button
                    type="submit"
                    className="flex-1 btn-primary text-sm"
                    disabled={step === "sending"}
                    whileHover={step !== "sending" ? { scale: 1.02 } : {}}
                    whileTap={step !== "sending" ? { scale: 0.97 } : {}}
                  >
                    {step === "sending" ? "Sending..." : "Send Job Offer"}
                  </motion.button>
                  <button
                    type="button"
                    onClick={handleClose}
                    className="px-4 py-2 rounded-lg text-sm text-text-secondary hover:text-text-primary border border-border/40 hover:border-border transition-colors"
                  >
                    Cancel
                  </button>
                </div>

                <p className="text-[10px] text-text-tertiary text-center">
                  The provider can accept, decline, or counter your offer via Messages.
                  Funds are held in escrow only after both parties agree.
                </p>
              </form>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
