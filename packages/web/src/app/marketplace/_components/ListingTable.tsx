"use client";

import type { MockListing } from "../_data/types";
import ListingRow from "./ListingRow";

export default function ListingTable({ listings }: { listings: MockListing[] }) {
  return (
    <div className="card overflow-hidden">
      {/* Desktop table header — hidden on mobile */}
      <div className="hidden sm:grid grid-cols-12 gap-4 px-4 py-2.5 text-xs font-medium text-text-tertiary uppercase tracking-wider border-b border-border">
        <div className="col-span-4">Service</div>
        <div className="col-span-2">Category</div>
        <div className="col-span-2 text-right">Price</div>
        <div className="col-span-2 text-right">Reputation</div>
        <div className="col-span-2 text-right">Delivery</div>
      </div>

      {listings.map((listing, i) => (
        <ListingRow key={listing.id} listing={listing} index={i} />
      ))}
    </div>
  );
}
