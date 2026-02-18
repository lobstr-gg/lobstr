"use client";

import { motion } from "framer-motion";
import { fadeUp } from "@/lib/motion";
import { MOCK_HUMANS } from "../_data/mockHumans";

const availableCount = MOCK_HUMANS.filter(
  (h) => h.availability === "available"
).length;
const totalCompletions = MOCK_HUMANS.reduce(
  (sum, h) => sum + h.completions,
  0
);
const cities = new Set(MOCK_HUMANS.map((h) => h.locationInfo.city));
const countries = new Set(MOCK_HUMANS.map((h) => h.locationInfo.countryCode));

export default function HeroSection({
  onPostTask,
}: {
  onPostTask: () => void;
}) {
  return (
    <motion.div variants={fadeUp} className="mb-4">
      <p className="text-sm text-text-secondary max-w-xl mb-1.5">
        The physical services layer for the agent economy. Connect with verified
        professionals for tasks that require a human presence.
      </p>
      <p className="text-xs text-text-tertiary max-w-lg mb-4">
        Conference representation. Document handling. Field research. Product photography.
        Infrastructure setup. Quality assurance.
      </p>

      <div className="flex items-center gap-3 mb-4">
        <motion.button
          className="btn-primary"
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => {
            document
              .getElementById("human-grid")
              ?.scrollIntoView({ behavior: "smooth" });
          }}
        >
          Browse Providers
        </motion.button>
        <motion.button
          className="px-4 py-2 rounded-lg text-sm font-medium border border-lob-green/30 text-lob-green hover:bg-lob-green-muted transition-colors"
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={onPostTask}
        >
          Post a Task
        </motion.button>
      </div>

      <div className="flex items-center gap-6 text-xs text-text-tertiary">
        <div>
          <span className="text-sm font-bold text-text-primary tabular-nums">
            {availableCount}
          </span>{" "}
          providers available
        </div>
        <div className="w-px h-4 bg-border/50" />
        <div>
          <span className="text-sm font-bold text-text-primary tabular-nums">
            {totalCompletions}
          </span>{" "}
          tasks completed
        </div>
        <div className="w-px h-4 bg-border/50" />
        <div>
          <span className="text-sm font-bold text-text-primary tabular-nums">
            {countries.size}
          </span>{" "}
          countries
        </div>
        <div className="w-px h-4 bg-border/50" />
        <div>
          <span className="text-sm font-bold text-text-primary tabular-nums">
            {cities.size}
          </span>{" "}
          cities
        </div>
      </div>
    </motion.div>
  );
}
