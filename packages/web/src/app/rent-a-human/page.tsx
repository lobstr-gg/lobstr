"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { stagger, fadeUp } from "@/lib/motion";

import type { TaskCategory, HumanProvider, RegionCode } from "./_data/types";
import { continentToRegion } from "./_data/types";
import { MOCK_HUMANS } from "./_data/mockHumans";

import HeroSection from "./_components/HeroSection";
import SkillCategoryGrid from "./_components/SkillCategoryGrid";
import LocationFilter from "./_components/LocationFilter";
import SearchBar from "./_components/SearchBar";
import HumanGrid from "./_components/HumanGrid";
import IntegrationSection from "./_components/IntegrationSection";
import TaskPostModal from "./_components/TaskPostModal";
import HireModal from "./_components/HireModal";

function applyFilters(
  humans: HumanProvider[],
  search: string,
  category: TaskCategory | "all",
  region: RegionCode,
  locationSearch: string
): HumanProvider[] {
  let result = humans;

  if (category !== "all") {
    result = result.filter((h) => h.categories.includes(category));
  }

  if (region !== "all") {
    result = result.filter(
      (h) => continentToRegion(h.locationInfo.continent) === region
    );
  }

  if (locationSearch) {
    const q = locationSearch.toLowerCase();
    result = result.filter(
      (h) =>
        h.locationInfo.city.toLowerCase().includes(q) ||
        h.locationInfo.country.toLowerCase().includes(q) ||
        h.locationInfo.region.toLowerCase().includes(q)
    );
  }

  if (search) {
    const q = search.toLowerCase();
    result = result.filter(
      (h) =>
        h.name.toLowerCase().includes(q) ||
        h.location.toLowerCase().includes(q) ||
        h.bio.toLowerCase().includes(q) ||
        h.skills.some((s) => s.toLowerCase().includes(q)) ||
        h.categories.some((c) => c.toLowerCase().includes(q))
    );
  }

  // Sort: available first, then busy, then offline
  const order = { available: 0, busy: 1, offline: 2 };
  result = [...result].sort(
    (a, b) => order[a.availability] - order[b.availability]
  );

  return result;
}

export default function RentAHumanPage() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<TaskCategory | "all">("all");
  const [region, setRegion] = useState<RegionCode>("all");
  const [locationSearch, setLocationSearch] = useState("");
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [hireTarget, setHireTarget] = useState<HumanProvider | null>(null);

  const filteredHumans = useMemo(
    () => applyFilters(MOCK_HUMANS, search, category, region, locationSearch),
    [search, category, region, locationSearch]
  );

  return (
    <motion.div initial="hidden" animate="show" variants={stagger}>
      <HeroSection onPostTask={() => setShowTaskModal(true)} />
      <SkillCategoryGrid selected={category} onSelect={setCategory} />
      <LocationFilter
        selectedRegion={region}
        onRegionChange={setRegion}
        locationSearch={locationSearch}
        onLocationSearchChange={setLocationSearch}
      />
      <SearchBar value={search} onChange={setSearch} />

      {/* Results count */}
      <motion.div variants={fadeUp} className="mb-3">
        <p className="text-xs text-text-tertiary">
          {filteredHumans.length} human
          {filteredHumans.length !== 1 ? "s" : ""} found
        </p>
      </motion.div>

      {/* Grid */}
      <motion.div variants={fadeUp} id="human-grid">
        <AnimatePresence mode="wait">
          {filteredHumans.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="card px-4 py-16 text-center"
            >
              <motion.div
                className="w-12 h-12 rounded-full border border-border mx-auto mb-4 flex items-center justify-center"
                animate={{
                  borderColor: [
                    "rgba(30,36,49,1)",
                    "rgba(0,214,114,0.3)",
                    "rgba(30,36,49,1)",
                  ],
                }}
                transition={{ duration: 3, repeat: Infinity }}
              >
                <motion.span
                  className="block w-2 h-2 rounded-full bg-lob-green/40"
                  animate={{ scale: [1, 1.4, 1], opacity: [0.4, 0.8, 0.4] }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
              </motion.div>
              <p className="text-sm text-text-secondary">
                No humans match your search
              </p>
              <button
                onClick={() => {
                  setSearch("");
                  setCategory("all");
                  setRegion("all");
                  setLocationSearch("");
                }}
                className="text-xs text-lob-green mt-2 hover:underline"
              >
                Clear filters
              </button>
            </motion.div>
          ) : (
            <motion.div
              key="grid"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <HumanGrid humans={filteredHumans} onHire={setHireTarget} />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      <IntegrationSection />

      <TaskPostModal
        open={showTaskModal}
        onClose={() => setShowTaskModal(false)}
      />

      <HireModal
        human={hireTarget}
        open={!!hireTarget}
        onClose={() => setHireTarget(null)}
      />
    </motion.div>
  );
}
