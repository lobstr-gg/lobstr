"use client";

import { motion } from "framer-motion";
import { fadeUp, ease } from "@/lib/motion";
import { LOCATION_REGIONS, type RegionCode } from "../_data/types";

export default function LocationFilter({
  selectedRegion,
  onRegionChange,
  locationSearch,
  onLocationSearchChange,
}: {
  selectedRegion: RegionCode;
  onRegionChange: (region: RegionCode) => void;
  locationSearch: string;
  onLocationSearchChange: (value: string) => void;
}) {
  return (
    <motion.div variants={fadeUp} className="mb-4">
      <p className="text-[10px] text-text-tertiary uppercase tracking-widest font-semibold mb-2">
        Filter by Region
      </p>
      <div className="flex flex-wrap gap-2 mb-3">
        {LOCATION_REGIONS.map(({ label, code }) => {
          const isActive = selectedRegion === code;
          return (
            <motion.button
              key={code}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                isActive
                  ? "border-lob-green/40 text-lob-green bg-lob-green-muted"
                  : "border-border/40 text-text-secondary hover:text-text-primary hover:border-border"
              }`}
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.97 }}
              transition={{ duration: 0.2, ease }}
              onClick={() => onRegionChange(code)}
            >
              {label}
            </motion.button>
          );
        })}
      </div>
      <input
        type="text"
        value={locationSearch}
        onChange={(e) => onLocationSearchChange(e.target.value)}
        placeholder="Search by city or country..."
        className="w-full max-w-xs bg-surface-2 border border-border/40 rounded-lg px-3 py-1.5 text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-lob-green/40 transition-colors"
      />
    </motion.div>
  );
}
