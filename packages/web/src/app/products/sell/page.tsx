"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { stagger, fadeUp, ease } from "@/lib/motion";
import { ArrowLeft, Package, Loader2, Upload } from "lucide-react";
import { useAccount } from "wagmi";
import { parseEther } from "viem";
import { getContracts, CHAIN } from "@/config/contracts";
import { PRODUCT_CATEGORIES, CATEGORY_LABELS, CONDITION_LABELS } from "@/config/product-categories";
import { useCreateProduct } from "@/lib/useProducts";

export default function SellProductPage() {
  const router = useRouter();
  const { address } = useAccount();
  const contracts = getContracts(CHAIN.id);
  const createProduct = useCreateProduct();

  const [listingId, setListingId] = useState("");
  const [condition, setCondition] = useState(0);
  const [category, setCategory] = useState("electronics");
  const [shippingInfoURI, setShippingInfoURI] = useState("");
  const [imageURI, setImageURI] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [requiresTracking, setRequiresTracking] = useState(true);
  const [listingType, setListingType] = useState(0);
  const [txStatus, setTxStatus] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!address || !contracts || !listingId) return;

    setTxStatus("Creating product listing...");
    try {
      await createProduct.fn(
        BigInt(listingId),
        condition,
        category,
        shippingInfoURI,
        imageURI,
        BigInt(quantity),
        requiresTracking,
        listingType,
      );
      setTxStatus("Product listed successfully!");
      setTimeout(() => router.push("/products"), 2000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Transaction failed";
      setTxStatus(`Error: ${msg.slice(0, 120)}`);
    }
  };

  if (!address) {
    return (
      <div className="card px-4 py-20 text-center max-w-lg mx-auto">
        <Package className="w-8 h-8 text-text-tertiary mx-auto mb-3" />
        <p className="text-sm text-text-secondary mb-2">Connect your wallet to sell a product</p>
        <p className="text-xs text-text-tertiary">You need an active stake and a ServiceRegistry listing.</p>
      </div>
    );
  }

  return (
    <motion.div initial="hidden" animate="show" variants={stagger} className="max-w-2xl mx-auto">
      {/* Back nav */}
      <motion.div variants={fadeUp} className="mb-6">
        <button
          onClick={() => router.push("/products")}
          className="text-xs text-text-secondary hover:text-text-primary transition-colors inline-flex items-center gap-1"
        >
          <ArrowLeft className="w-3 h-3" />
          Back to Products
        </button>
      </motion.div>

      <motion.div variants={fadeUp}>
        <h1 className="text-xl font-bold text-text-primary mb-1 flex items-center gap-2">
          <Package className="w-5 h-5" />
          Sell a Product
        </h1>
        <p className="text-xs text-text-tertiary mb-6">
          First create a ServiceRegistry listing (PHYSICAL_TASK category), then register your product here.
        </p>
      </motion.div>

      <motion.form variants={fadeUp} onSubmit={handleSubmit} className="card p-6 space-y-4">
        {/* Listing ID */}
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1">
            ServiceRegistry Listing ID *
          </label>
          <input
            type="number"
            required
            value={listingId}
            onChange={(e) => setListingId(e.target.value)}
            placeholder="Enter your existing listing ID"
            className="w-full px-3 py-2 text-xs rounded bg-surface-2 border border-border/50 text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-lob-green/30"
          />
          <p className="text-[10px] text-text-tertiary mt-1">
            Must be a PHYSICAL_TASK listing you own.{" "}
            <Link href="/post-job" className="text-lob-green hover:underline">Create one here</Link>
          </p>
        </div>

        {/* Listing Type */}
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1">Listing Type</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setListingType(0)}
              className={`flex-1 text-xs py-2 rounded border transition-colors ${
                listingType === 0
                  ? "border-lob-green bg-lob-green/10 text-lob-green"
                  : "border-border/50 text-text-secondary hover:text-text-primary"
              }`}
            >
              Fixed Price
            </button>
            <button
              type="button"
              onClick={() => setListingType(1)}
              className={`flex-1 text-xs py-2 rounded border transition-colors ${
                listingType === 1
                  ? "border-lob-green bg-lob-green/10 text-lob-green"
                  : "border-border/50 text-text-secondary hover:text-text-primary"
              }`}
            >
              Auction
            </button>
          </div>
        </div>

        {/* Condition */}
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1">Condition</label>
          <select
            value={condition}
            onChange={(e) => setCondition(Number(e.target.value))}
            className="w-full px-3 py-2 text-xs rounded bg-surface-2 border border-border/50 text-text-secondary"
          >
            {Object.entries(CONDITION_LABELS).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
        </div>

        {/* Category */}
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1">Category</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full px-3 py-2 text-xs rounded bg-surface-2 border border-border/50 text-text-secondary"
          >
            {PRODUCT_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>{CATEGORY_LABELS[cat]}</option>
            ))}
          </select>
        </div>

        {/* Image URI */}
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1">Product Images (IPFS URI) *</label>
          <div className="flex gap-2">
            <input
              type="text"
              required
              value={imageURI}
              onChange={(e) => setImageURI(e.target.value)}
              placeholder="ipfs://..."
              className="flex-1 px-3 py-2 text-xs rounded bg-surface-2 border border-border/50 text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-lob-green/30"
            />
            <button type="button" className="px-3 py-2 text-xs rounded bg-surface-2 border border-border/50 text-text-secondary hover:text-text-primary transition-colors inline-flex items-center gap-1">
              <Upload className="w-3 h-3" />
              Upload
            </button>
          </div>
        </div>

        {/* Shipping Info URI */}
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1">Shipping Info (IPFS URI)</label>
          <input
            type="text"
            value={shippingInfoURI}
            onChange={(e) => setShippingInfoURI(e.target.value)}
            placeholder="ipfs://... (dimensions, weight, ships-from)"
            className="w-full px-3 py-2 text-xs rounded bg-surface-2 border border-border/50 text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-lob-green/30"
          />
        </div>

        {/* Quantity */}
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1">Quantity</label>
          <input
            type="number"
            min="1"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="w-full px-3 py-2 text-xs rounded bg-surface-2 border border-border/50 text-text-primary focus:outline-none focus:border-lob-green/30"
          />
        </div>

        {/* Tracking required */}
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="tracking"
            checked={requiresTracking}
            onChange={(e) => setRequiresTracking(e.target.checked)}
            className="rounded border-border/50"
          />
          <label htmlFor="tracking" className="text-xs text-text-secondary">
            Require shipping tracking
          </label>
        </div>

        {/* Submit */}
        <motion.button
          type="submit"
          className="btn-primary w-full text-sm py-2.5 inline-flex items-center justify-center gap-2"
          whileHover={{ boxShadow: "inset 0 1px 0 rgba(88,176,89,0.12), 0 4px 16px rgba(88,176,89,0.08)" }}
          whileTap={{ scale: 0.97 }}
          disabled={createProduct.isPending || !listingId || !imageURI}
        >
          {createProduct.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Package className="w-4 h-4" />}
          List Product
        </motion.button>

        {/* Tx status */}
        {txStatus && (
          <motion.div
            className={`p-2 rounded text-xs ${txStatus.startsWith("Error") ? "bg-red-500/10 border border-red-500/30 text-red-400" : "bg-lob-green/10 border border-lob-green/30 text-lob-green"}`}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
          >
            {txStatus}
          </motion.div>
        )}
      </motion.form>
    </motion.div>
  );
}
