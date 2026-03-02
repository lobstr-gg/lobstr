"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { stagger, fadeUp, ease } from "@/lib/motion";
import { ArrowLeft, Package, Loader2, Upload, X, ImageIcon } from "lucide-react";
import { useAccount } from "wagmi";
import { getContracts, CHAIN } from "@/config/contracts";
import { PRODUCT_CATEGORIES, CATEGORY_LABELS, CONDITION_LABELS } from "@/config/product-categories";
import { useCreateProduct } from "@/lib/useProducts";

type UploadedImage = { name: string; url: string; size: number };

export default function SellProductPage() {
  const router = useRouter();
  const { address } = useAccount();
  const contracts = getContracts(CHAIN.id);
  const createProduct = useCreateProduct();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [listingId, setListingId] = useState("");
  const [condition, setCondition] = useState(0);
  const [category, setCategory] = useState("electronics");
  const [shippingInfoURI, setShippingInfoURI] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [requiresTracking, setRequiresTracking] = useState(true);
  const [listingType, setListingType] = useState(0);
  const [txStatus, setTxStatus] = useState<string | null>(null);

  // Image upload state
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const imageURI = uploadedImages.length > 0
    ? uploadedImages.map((img) => img.url).join(",")
    : "";

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // Check total count
    if (uploadedImages.length + files.length > 5) {
      setUploadError("Maximum 5 images per product");
      return;
    }

    // Validate sizes client-side
    for (const file of Array.from(files)) {
      if (file.size > 10 * 1024 * 1024) {
        setUploadError(`"${file.name}" exceeds 10MB limit`);
        return;
      }
      if (!file.type.startsWith("image/")) {
        setUploadError(`"${file.name}" is not an image`);
        return;
      }
    }

    setIsUploading(true);
    setUploadError(null);

    try {
      const formData = new FormData();
      formData.append("productRef", listingId || "draft");
      for (const file of Array.from(files)) {
        formData.append("files", file);
      }

      const res = await fetch("/api/upload/product-image", {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        setUploadError(data.error || "Upload failed");
        return;
      }

      const data = await res.json();
      setUploadedImages((prev) => [
        ...prev,
        ...data.files.map((f: { name: string; url: string; size: number }) => ({
          name: f.name,
          url: f.url,
          size: f.size,
        })),
      ]);
    } catch {
      setUploadError("Upload failed. Check your connection.");
    } finally {
      setIsUploading(false);
      // Reset input so same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeImage = (index: number) => {
    setUploadedImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!address || !contracts || !listingId) return;
    if (uploadedImages.length === 0) {
      setUploadError("Upload at least one product image");
      return;
    }

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

        {/* Product Images Upload */}
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1">
            Product Images * <span className="text-text-tertiary font-normal">({uploadedImages.length}/5)</span>
          </label>

          {/* Upload area */}
          <div
            className="border-2 border-dashed border-border/50 rounded-lg p-4 text-center hover:border-lob-green/30 transition-colors cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="hidden"
              onChange={handleImageUpload}
              disabled={isUploading || uploadedImages.length >= 5}
            />
            {isUploading ? (
              <div className="flex items-center justify-center gap-2 py-2">
                <Loader2 className="w-4 h-4 animate-spin text-lob-green" />
                <span className="text-xs text-text-secondary">Uploading...</span>
              </div>
            ) : (
              <div className="py-2">
                <Upload className="w-5 h-5 text-text-tertiary mx-auto mb-1.5" />
                <p className="text-xs text-text-secondary">Click to upload product images</p>
                <p className="text-[10px] text-text-tertiary mt-0.5">JPG, PNG, or WebP. Max 10MB each, up to 5 images.</p>
              </div>
            )}
          </div>

          {/* Upload error */}
          {uploadError && (
            <p className="text-[10px] text-red-400 mt-1">{uploadError}</p>
          )}

          {/* Image previews */}
          <AnimatePresence>
            {uploadedImages.length > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="flex flex-wrap gap-2 mt-3"
              >
                {uploadedImages.map((img, i) => (
                  <motion.div
                    key={img.url}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    className="relative w-20 h-20 rounded-lg overflow-hidden border border-border/50 group"
                  >
                    <Image
                      src={img.url}
                      alt={img.name}
                      fill
                      className="object-cover"
                      sizes="80px"
                    />
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); removeImage(i); }}
                      className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/70 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3 h-3" />
                    </button>
                    {i === 0 && (
                      <span className="absolute bottom-0 left-0 right-0 bg-lob-green/90 text-black text-[8px] font-bold text-center py-0.5">
                        Cover
                      </span>
                    )}
                  </motion.div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Shipping Info URI */}
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1">Shipping Info</label>
          <input
            type="text"
            value={shippingInfoURI}
            onChange={(e) => setShippingInfoURI(e.target.value)}
            placeholder="Dimensions, weight, ships-from location"
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
          disabled={createProduct.isPending || !listingId || uploadedImages.length === 0}
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
