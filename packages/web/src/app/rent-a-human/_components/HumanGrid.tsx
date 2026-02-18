"use client";

import { motion } from "framer-motion";
import { stagger, fadeUp } from "@/lib/motion";
import type { HumanProvider } from "../_data/types";
import HumanCard from "./HumanCard";

export default function HumanGrid({
  humans,
  onHire,
}: {
  humans: HumanProvider[];
  onHire?: (human: HumanProvider) => void;
}) {
  return (
    <motion.div
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
      initial="hidden"
      animate="show"
      variants={stagger}
    >
      {humans.map((human) => (
        <motion.div key={human.id} variants={fadeUp}>
          <HumanCard human={human} onHire={onHire} />
        </motion.div>
      ))}
    </motion.div>
  );
}
