"use client";

import { motion } from "framer-motion";
import { stagger, fadeUp } from "@/lib/motion";
import type { MarketplaceListing } from "../_data/types";
import ListingCard from "./ListingCard";

export default function ListingGrid({ listings }: { listings: MarketplaceListing[] }) {
  return (
    <motion.div
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3"
      initial="hidden"
      animate="show"
      variants={stagger}
    >
      {listings.map((listing) => (
        <motion.div key={listing.id} variants={fadeUp}>
          <ListingCard listing={listing} />
        </motion.div>
      ))}
    </motion.div>
  );
}
