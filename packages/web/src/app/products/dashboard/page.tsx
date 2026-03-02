"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { stagger, fadeUp, ease } from "@/lib/motion";
import { ArrowLeft, Package, Truck, CheckCircle, AlertTriangle, Loader2, Upload, X, Camera } from "lucide-react";
import { useAccount } from "wagmi";
import { getContracts, CHAIN } from "@/config/contracts";
import { SHIPPING_STATUS_LABELS } from "@/config/product-categories";
import { useShipProduct, useConfirmReceipt, usePendingWithdrawal, useWithdrawBid, useReportDamaged, useRequestReturn } from "@/lib/useProducts";
import { formatEther } from "viem";

export default function ProductDashboardPage() {
  const router = useRouter();
  const { address } = useAccount();
  const contracts = getContracts(CHAIN.id);
  const evidenceInputRef = useRef<HTMLInputElement>(null);

  const shipProduct = useShipProduct();
  const confirmReceipt = useConfirmReceipt();
  const withdrawBid = useWithdrawBid();
  const reportDamaged = useReportDamaged();
  const requestReturn = useRequestReturn();
  const { data: pendingWithdrawal } = usePendingWithdrawal(address);

  const [activeTab, setActiveTab] = useState<"listings" | "orders" | "purchases">("listings");
  const [shipJobId, setShipJobId] = useState("");
  const [carrier, setCarrier] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [txStatus, setTxStatus] = useState<string | null>(null);

  // Damage report state
  const [damageJobId, setDamageJobId] = useState("");
  const [evidenceFiles, setEvidenceFiles] = useState<{ name: string; url: string }[]>([]);
  const [isUploadingEvidence, setIsUploadingEvidence] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Return state
  const [returnJobId, setReturnJobId] = useState("");
  const [returnReason, setReturnReason] = useState("");

  const handleShip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shipJobId || !carrier || !trackingNumber) return;

    setTxStatus("Adding shipping info...");
    try {
      await shipProduct.fn(BigInt(shipJobId), carrier, trackingNumber);
      setTxStatus("Shipping tracked!");
      setShipJobId("");
      setCarrier("");
      setTrackingNumber("");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Transaction failed";
      setTxStatus(`Error: ${msg.slice(0, 100)}`);
    }
  };

  const handleWithdraw = async () => {
    setTxStatus("Withdrawing bid refund...");
    try {
      await withdrawBid.fn(contracts?.lobToken as `0x${string}`);
      setTxStatus("Withdrawal complete!");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Transaction failed";
      setTxStatus(`Error: ${msg.slice(0, 100)}`);
    }
  };

  const handleEvidenceUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploadingEvidence(true);
    setUploadError(null);

    try {
      const formData = new FormData();
      formData.append("jobId", damageJobId || "0");
      for (const file of Array.from(files)) {
        if (file.size > 25 * 1024 * 1024) {
          setUploadError(`"${file.name}" exceeds 25MB limit`);
          setIsUploadingEvidence(false);
          return;
        }
        formData.append("files", file);
      }

      const res = await fetch("/api/upload/damage-evidence", {
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
      setEvidenceFiles((prev) => [
        ...prev,
        ...data.files.map((f: { name: string; url: string }) => ({
          name: f.name,
          url: f.url,
        })),
      ]);
    } catch {
      setUploadError("Upload failed.");
    } finally {
      setIsUploadingEvidence(false);
      if (evidenceInputRef.current) evidenceInputRef.current.value = "";
    }
  };

  const handleReportDamage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!damageJobId || evidenceFiles.length === 0) return;

    const evidenceURI = evidenceFiles.map((f) => f.url).join(",");
    setTxStatus("Reporting damaged item...");
    try {
      await reportDamaged.fn(BigInt(damageJobId), evidenceURI);
      setTxStatus("Damage report submitted! Dispute initiated.");
      setDamageJobId("");
      setEvidenceFiles([]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Transaction failed";
      setTxStatus(`Error: ${msg.slice(0, 100)}`);
    }
  };

  const handleReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!returnJobId || !returnReason) return;

    setTxStatus("Requesting return...");
    try {
      await requestReturn.fn(BigInt(returnJobId), returnReason);
      setTxStatus("Return requested!");
      setReturnJobId("");
      setReturnReason("");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Transaction failed";
      setTxStatus(`Error: ${msg.slice(0, 100)}`);
    }
  };

  if (!address) {
    return (
      <div className="card px-4 py-20 text-center max-w-lg mx-auto">
        <Package className="w-8 h-8 text-text-tertiary mx-auto mb-3" />
        <p className="text-sm text-text-secondary">Connect your wallet to view your dashboard</p>
      </div>
    );
  }

  const TABS = [
    { id: "listings" as const, label: "My Listings" },
    { id: "orders" as const, label: "Orders to Ship" },
    { id: "purchases" as const, label: "My Purchases" },
  ];

  return (
    <motion.div initial="hidden" animate="show" variants={stagger} className="max-w-4xl mx-auto">
      <motion.div variants={fadeUp} className="mb-6">
        <button
          onClick={() => router.push("/products")}
          className="text-xs text-text-secondary hover:text-text-primary transition-colors inline-flex items-center gap-1"
        >
          <ArrowLeft className="w-3 h-3" />
          Back to Products
        </button>
      </motion.div>

      <motion.div variants={fadeUp} className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-text-primary flex items-center gap-2">
            <Package className="w-5 h-5" />
            Seller Dashboard
          </h1>
          <p className="text-xs text-text-tertiary mt-0.5">
            Manage your product listings, orders, and purchases
          </p>
        </div>
        <Link href="/products/sell" className="btn-primary text-xs">
          List New Product
        </Link>
      </motion.div>

      {/* Pending withdrawal banner */}
      {pendingWithdrawal && pendingWithdrawal > 0n && (
        <motion.div variants={fadeUp} className="card p-4 mb-4 border-lob-green/30">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-text-primary">Pending Bid Refund</p>
              <p className="text-[10px] text-text-tertiary">
                You have {parseFloat(formatEther(pendingWithdrawal)).toLocaleString()} tokens to withdraw
              </p>
            </div>
            <motion.button
              className="btn-primary text-xs px-3 py-1.5"
              whileTap={{ scale: 0.97 }}
              onClick={handleWithdraw}
              disabled={withdrawBid.isPending}
            >
              {withdrawBid.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Withdraw"}
            </motion.button>
          </div>
        </motion.div>
      )}

      {/* Tabs */}
      <motion.div variants={fadeUp} className="flex gap-0.5 mb-6 border-b border-border">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="relative px-4 py-2 text-sm font-medium -mb-px"
          >
            <motion.span
              animate={{ color: activeTab === tab.id ? "#EAECEF" : "#5E6673" }}
              className="relative z-10"
            >
              {tab.label}
            </motion.span>
            {activeTab === tab.id && (
              <motion.div
                layoutId="dashboard-tab"
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-lob-green"
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              />
            )}
          </button>
        ))}
      </motion.div>

      {/* Listings tab */}
      {activeTab === "listings" && (
        <motion.div key="listings" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="card px-4 py-12 text-center">
          <Package className="w-6 h-6 text-text-tertiary mx-auto mb-2" />
          <p className="text-sm text-text-secondary">Your product listings will appear here</p>
          <p className="text-xs text-text-tertiary mt-1">Data loaded from the on-chain indexer</p>
        </motion.div>
      )}

      {/* Orders tab */}
      {activeTab === "orders" && (
        <motion.div key="orders" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
          <div className="card p-5">
            <h3 className="text-xs font-semibold text-text-primary mb-3 flex items-center gap-1.5">
              <Truck className="w-3 h-3" />
              Add Shipping Tracking
            </h3>
            <form onSubmit={handleShip} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input type="number" required value={shipJobId} onChange={(e) => setShipJobId(e.target.value)} placeholder="Job ID" className="px-3 py-2 text-xs rounded bg-surface-2 border border-border/50 text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-lob-green/30" />
                <select required value={carrier} onChange={(e) => setCarrier(e.target.value)} className="px-3 py-2 text-xs rounded bg-surface-2 border border-border/50 text-text-secondary">
                  <option value="">Carrier</option>
                  <option value="usps">USPS</option>
                  <option value="ups">UPS</option>
                  <option value="fedex">FedEx</option>
                  <option value="dhl">DHL</option>
                </select>
                <input type="text" required value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)} placeholder="Tracking Number" className="px-3 py-2 text-xs rounded bg-surface-2 border border-border/50 text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-lob-green/30" />
              </div>
              <motion.button type="submit" className="btn-primary text-xs px-4 py-1.5 inline-flex items-center gap-1.5" whileTap={{ scale: 0.97 }} disabled={shipProduct.isPending || !shipJobId || !carrier || !trackingNumber}>
                {shipProduct.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Truck className="w-3 h-3" />}
                Submit Tracking
              </motion.button>
            </form>
          </div>
          <div className="card px-4 py-8 text-center">
            <p className="text-sm text-text-secondary">Pending orders will appear here</p>
          </div>
        </motion.div>
      )}

      {/* Purchases tab */}
      {activeTab === "purchases" && (
        <motion.div key="purchases" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
          <div className="card px-4 py-8 text-center">
            <CheckCircle className="w-6 h-6 text-text-tertiary mx-auto mb-2" />
            <p className="text-sm text-text-secondary">Your purchases will appear here</p>
            <p className="text-xs text-text-tertiary mt-1">Track shipping and confirm receipt for your orders</p>
          </div>

          {/* Report Damaged — with evidence image upload */}
          <div className="card p-5">
            <h3 className="text-xs font-semibold text-text-primary mb-3 flex items-center gap-1.5">
              <AlertTriangle className="w-3 h-3 text-red-400" />
              Report Damaged / Not As Described
            </h3>
            <form onSubmit={handleReportDamage} className="space-y-3">
              <input type="number" required value={damageJobId} onChange={(e) => setDamageJobId(e.target.value)} placeholder="Job ID" className="w-full px-3 py-2 text-xs rounded bg-surface-2 border border-border/50 text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-lob-green/30" />

              {/* Evidence photo upload */}
              <div>
                <label className="block text-[10px] text-text-tertiary mb-1">
                  Evidence photos ({evidenceFiles.length}/5)
                </label>
                <div
                  className="border border-dashed border-border/50 rounded p-3 text-center hover:border-red-400/30 transition-colors cursor-pointer"
                  onClick={() => evidenceInputRef.current?.click()}
                >
                  <input
                    ref={evidenceInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    className="hidden"
                    onChange={handleEvidenceUpload}
                    disabled={isUploadingEvidence || evidenceFiles.length >= 5}
                  />
                  {isUploadingEvidence ? (
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="w-3 h-3 animate-spin text-red-400" />
                      <span className="text-[10px] text-text-secondary">Uploading...</span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center gap-1.5">
                      <Camera className="w-3 h-3 text-text-tertiary" />
                      <span className="text-[10px] text-text-secondary">Upload damage photos</span>
                    </div>
                  )}
                </div>
                {uploadError && <p className="text-[10px] text-red-400 mt-1">{uploadError}</p>}

                {/* Evidence previews */}
                {evidenceFiles.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {evidenceFiles.map((f, i) => (
                      <div key={f.url} className="relative w-14 h-14 rounded overflow-hidden border border-border/50 group">
                        <Image src={f.url} alt={f.name} fill className="object-cover" sizes="56px" />
                        <button
                          type="button"
                          onClick={() => setEvidenceFiles((prev) => prev.filter((_, idx) => idx !== i))}
                          className="absolute top-0 right-0 w-4 h-4 rounded-bl bg-black/70 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <motion.button type="submit" className="text-xs px-4 py-1.5 rounded border border-red-500/50 text-red-400 hover:bg-red-500/10 transition-colors inline-flex items-center gap-1.5" whileTap={{ scale: 0.97 }} disabled={reportDamaged.isPending || !damageJobId || evidenceFiles.length === 0}>
                {reportDamaged.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <AlertTriangle className="w-3 h-3" />}
                Submit Damage Report
              </motion.button>
            </form>
          </div>

          {/* Request Return */}
          <div className="card p-5">
            <h3 className="text-xs font-semibold text-text-primary mb-3 flex items-center gap-1.5">
              <Package className="w-3 h-3" />
              Request Return (within 7 days of receipt)
            </h3>
            <form onSubmit={handleReturn} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input type="number" required value={returnJobId} onChange={(e) => setReturnJobId(e.target.value)} placeholder="Job ID" className="px-3 py-2 text-xs rounded bg-surface-2 border border-border/50 text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-lob-green/30" />
                <input type="text" required value={returnReason} onChange={(e) => setReturnReason(e.target.value)} placeholder="Reason for return" className="px-3 py-2 text-xs rounded bg-surface-2 border border-border/50 text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-lob-green/30" />
              </div>
              <motion.button type="submit" className="text-xs px-4 py-1.5 rounded border border-border/50 text-text-secondary hover:text-text-primary hover:border-border transition-colors inline-flex items-center gap-1.5" whileTap={{ scale: 0.97 }} disabled={requestReturn.isPending || !returnJobId || !returnReason}>
                {requestReturn.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Package className="w-3 h-3" />}
                Request Return
              </motion.button>
            </form>
          </div>
        </motion.div>
      )}

      {/* Tx status */}
      {txStatus && (
        <motion.div
          className={`mt-4 p-3 rounded text-xs ${txStatus.startsWith("Error") ? "bg-red-500/10 border border-red-500/30 text-red-400" : "bg-lob-green/10 border border-lob-green/30 text-lob-green"}`}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {txStatus.startsWith("Error") && <AlertTriangle className="w-3 h-3 inline mr-1" />}
          {txStatus}
        </motion.div>
      )}
    </motion.div>
  );
}
