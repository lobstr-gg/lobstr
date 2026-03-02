"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { stagger, fadeUp, ease } from "@/lib/motion";
import { Package, Search, ShoppingCart, Gavel, Loader2 } from "lucide-react";
import { useAccount } from "wagmi";
import { formatEther } from "viem";
import { getContracts, CHAIN } from "@/config/contracts";
import {
  PRODUCT_CATEGORIES,
  CATEGORY_LABELS,
  CONDITION_LABELS,
  LISTING_TYPE_LABELS,
  type ProductCategory,
} from "@/config/product-categories";

export default function ProductsPage() {
  const router = useRouter();
  const { address } = useAccount();
  const contracts = getContracts(CHAIN.id);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<ProductCategory | "all">("all");
  const [conditionFilter, setConditionFilter] = useState<number | null>(null);
  const [listingTypeFilter, setListingTypeFilter] = useState<number | null>(null);

  // Products will be loaded from the indexer GraphQL API.
  // For now, this page shows the UI structure.
  const isLoading = false;
  const products: Array<{
    id: bigint;
    listingId: bigint;
    seller: string;
    listingType: number;
    condition: number;
    productCategory: string;
    imageURI: string;
    price: bigint;
    quantity: number;
    sold: number;
    active: boolean;
    title: string;
    description: string;
    settlementToken: string;
  }> = [];

  const filtered = useMemo(() => {
    let result = products.filter((p) => p.active);

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          p.productCategory.toLowerCase().includes(q)
      );
    }

    if (categoryFilter !== "all") {
      result = result.filter((p) => p.productCategory === categoryFilter);
    }

    if (conditionFilter !== null) {
      result = result.filter((p) => p.condition === conditionFilter);
    }

    if (listingTypeFilter !== null) {
      result = result.filter((p) => p.listingType === listingTypeFilter);
    }

    return result;
  }, [products, search, categoryFilter, conditionFilter, listingTypeFilter]);

  return (
    <motion.div initial="hidden" animate="show" variants={stagger}>
      {/* Header */}
      <motion.div variants={fadeUp} className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-text-primary flex items-center gap-2">
            <Package className="w-5 h-5" />
            Products
          </h1>
          <p className="text-xs text-text-tertiary mt-0.5">
            Buy and sell physical goods with escrow protection
          </p>
        </div>
        <div className="flex items-center gap-2">
          {address && (
            <Link href="/products/dashboard" className="text-xs text-text-secondary hover:text-text-primary transition-colors px-2 py-1.5">
              Seller Dashboard
            </Link>
          )}
          <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
            <Link href="/products/sell" className="btn-primary whitespace-nowrap text-sm">
              Sell a Product
            </Link>
          </motion.div>
        </div>
      </motion.div>

      {/* Filters */}
      <motion.div variants={fadeUp} className="flex flex-wrap items-center gap-2 mb-4">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-tertiary" />
          <input
            type="text"
            placeholder="Search products..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded bg-surface-2 border border-border/50 text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-lob-green/30"
          />
        </div>

        {/* Category */}
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value as ProductCategory | "all")}
          className="text-xs px-2 py-1.5 rounded bg-surface-2 border border-border/50 text-text-secondary"
        >
          <option value="all">All Categories</option>
          {PRODUCT_CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>{CATEGORY_LABELS[cat]}</option>
          ))}
        </select>

        {/* Condition */}
        <select
          value={conditionFilter ?? ""}
          onChange={(e) => setConditionFilter(e.target.value === "" ? null : Number(e.target.value))}
          className="text-xs px-2 py-1.5 rounded bg-surface-2 border border-border/50 text-text-secondary"
        >
          <option value="">All Conditions</option>
          {Object.entries(CONDITION_LABELS).map(([val, label]) => (
            <option key={val} value={val}>{label}</option>
          ))}
        </select>

        {/* Listing Type */}
        <select
          value={listingTypeFilter ?? ""}
          onChange={(e) => setListingTypeFilter(e.target.value === "" ? null : Number(e.target.value))}
          className="text-xs px-2 py-1.5 rounded bg-surface-2 border border-border/50 text-text-secondary"
        >
          <option value="">All Types</option>
          <option value="0">Fixed Price</option>
          <option value="1">Auction</option>
        </select>

        <span className="text-[10px] text-text-tertiary tabular-nums ml-auto">
          {filtered.length} product{filtered.length !== 1 ? "s" : ""}
        </span>
      </motion.div>

      {/* Category chips */}
      <motion.div variants={fadeUp} className="flex flex-wrap gap-1.5 mb-6">
        <button
          onClick={() => setCategoryFilter("all")}
          className={`text-[10px] px-2.5 py-1 rounded-full border transition-colors ${
            categoryFilter === "all"
              ? "border-lob-green/40 bg-lob-green/10 text-lob-green"
              : "border-border/50 text-text-tertiary hover:text-text-secondary"
          }`}
        >
          All
        </button>
        {PRODUCT_CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setCategoryFilter(cat)}
            className={`text-[10px] px-2.5 py-1 rounded-full border transition-colors ${
              categoryFilter === cat
                ? "border-lob-green/40 bg-lob-green/10 text-lob-green"
                : "border-border/50 text-text-tertiary hover:text-text-secondary"
            }`}
          >
            {CATEGORY_LABELS[cat]}
          </button>
        ))}
      </motion.div>

      {/* Products grid */}
      <AnimatePresence mode="wait">
        {isLoading ? (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center justify-center py-16"
          >
            <Loader2 className="w-5 h-5 animate-spin text-text-tertiary" />
            <span className="ml-2 text-sm text-text-tertiary">Loading products...</span>
          </motion.div>
        ) : filtered.length === 0 ? (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="card px-4 py-20 text-center"
          >
            <motion.div
              className="w-14 h-14 rounded-full border border-border mx-auto mb-5 flex items-center justify-center"
              animate={{
                borderColor: ["rgba(30,36,49,1)", "rgba(88,176,89,0.3)", "rgba(30,36,49,1)"],
              }}
              transition={{ duration: 3, repeat: Infinity }}
            >
              <Package className="w-5 h-5 text-text-tertiary" />
            </motion.div>
            <p className="text-sm text-text-secondary mb-5">
              {products.length === 0
                ? "No products listed yet. Be the first to sell."
                : "No products match your filters."}
            </p>
            <div className="flex items-center justify-center gap-3">
              <Link
                href="/products/sell"
                className="btn-primary text-xs"
              >
                List a Product
              </Link>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="grid"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3"
          >
            {filtered.map((product, i) => (
              <motion.div
                key={product.id.toString()}
                className="card p-4 relative overflow-hidden group cursor-pointer"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 + i * 0.04, ease }}
                whileHover={{ borderColor: "rgba(88,176,89,0.15)" }}
                onClick={() => router.push(`/products/${product.id}`)}
              >
                <motion.div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-lob-green/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                {/* Image placeholder */}
                <div className="w-full aspect-square rounded bg-surface-3 mb-3 flex items-center justify-center">
                  <Package className="w-8 h-8 text-text-tertiary" />
                </div>

                {/* Title & seller */}
                <h3 className="text-sm font-medium text-text-primary truncate group-hover:text-lob-green transition-colors">
                  {product.title}
                </h3>
                <p className="text-[10px] text-text-tertiary mt-0.5 truncate">
                  by {product.seller.slice(0, 6)}...{product.seller.slice(-4)}
                </p>

                {/* Tags */}
                <div className="flex items-center gap-1.5 mt-2">
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-2 border border-border/50 text-text-secondary">
                    {CONDITION_LABELS[product.condition]}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-2 border border-border/50 text-text-secondary">
                    {LISTING_TYPE_LABELS[product.listingType]}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-2 border border-border/50 text-text-secondary">
                    {CATEGORY_LABELS[product.productCategory as ProductCategory] ?? product.productCategory}
                  </span>
                </div>

                {/* Price & stock */}
                <div className="flex items-center justify-between mt-3 pt-2 border-t border-border/20">
                  <span className="text-sm font-semibold text-lob-green tabular-nums">
                    {parseFloat(formatEther(product.price)).toLocaleString()} LOB
                  </span>
                  <span className="text-[10px] text-text-tertiary">
                    {product.quantity - product.sold} left
                  </span>
                </div>

                {/* Action */}
                <div className="mt-2">
                  {product.listingType === 0 ? (
                    <button className="btn-primary w-full text-xs py-1.5 inline-flex items-center justify-center gap-1.5">
                      <ShoppingCart className="w-3 h-3" />
                      Buy Now
                    </button>
                  ) : (
                    <button className="btn-primary w-full text-xs py-1.5 inline-flex items-center justify-center gap-1.5">
                      <Gavel className="w-3 h-3" />
                      Place Bid
                    </button>
                  )}
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
