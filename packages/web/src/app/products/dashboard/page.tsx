"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { stagger, fadeUp, ease } from "@/lib/motion";
import { ArrowLeft, Package, Truck, CheckCircle, Clock, AlertTriangle, Loader2 } from "lucide-react";
import { useAccount } from "wagmi";
import { getContracts, CHAIN } from "@/config/contracts";
import { SHIPPING_STATUS_LABELS } from "@/config/product-categories";
import { useShipProduct, useConfirmReceipt, usePendingWithdrawal, useWithdrawBid } from "@/lib/useProducts";
import { formatEther } from "viem";

export default function ProductDashboardPage() {
  const router = useRouter();
  const { address } = useAccount();
  const contracts = getContracts(CHAIN.id);

  const shipProduct = useShipProduct();
  const confirmReceipt = useConfirmReceipt();
  const withdrawBid = useWithdrawBid();
  const { data: pendingWithdrawal } = usePendingWithdrawal(address);

  const [activeTab, setActiveTab] = useState<"listings" | "orders" | "purchases">("listings");
  const [shipJobId, setShipJobId] = useState("");
  const [carrier, setCarrier] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [txStatus, setTxStatus] = useState<string | null>(null);

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
        <motion.div
          variants={fadeUp}
          className="card p-4 mb-4 border-lob-green/30"
        >
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

      {/* Tab content */}
      {activeTab === "listings" && (
        <motion.div
          key="listings"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="card px-4 py-12 text-center"
        >
          <Package className="w-6 h-6 text-text-tertiary mx-auto mb-2" />
          <p className="text-sm text-text-secondary">Your product listings will appear here</p>
          <p className="text-xs text-text-tertiary mt-1">Data loaded from the on-chain indexer</p>
        </motion.div>
      )}

      {activeTab === "orders" && (
        <motion.div
          key="orders"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-4"
        >
          {/* Ship product form */}
          <div className="card p-5">
            <h3 className="text-xs font-semibold text-text-primary mb-3 flex items-center gap-1.5">
              <Truck className="w-3 h-3" />
              Add Shipping Tracking
            </h3>
            <form onSubmit={handleShip} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input
                  type="number"
                  required
                  value={shipJobId}
                  onChange={(e) => setShipJobId(e.target.value)}
                  placeholder="Job ID"
                  className="px-3 py-2 text-xs rounded bg-surface-2 border border-border/50 text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-lob-green/30"
                />
                <select
                  required
                  value={carrier}
                  onChange={(e) => setCarrier(e.target.value)}
                  className="px-3 py-2 text-xs rounded bg-surface-2 border border-border/50 text-text-secondary"
                >
                  <option value="">Carrier</option>
                  <option value="usps">USPS</option>
                  <option value="ups">UPS</option>
                  <option value="fedex">FedEx</option>
                  <option value="dhl">DHL</option>
                </select>
                <input
                  type="text"
                  required
                  value={trackingNumber}
                  onChange={(e) => setTrackingNumber(e.target.value)}
                  placeholder="Tracking Number"
                  className="px-3 py-2 text-xs rounded bg-surface-2 border border-border/50 text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-lob-green/30"
                />
              </div>
              <motion.button
                type="submit"
                className="btn-primary text-xs px-4 py-1.5 inline-flex items-center gap-1.5"
                whileTap={{ scale: 0.97 }}
                disabled={shipProduct.isPending || !shipJobId || !carrier || !trackingNumber}
              >
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

      {activeTab === "purchases" && (
        <motion.div
          key="purchases"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="card px-4 py-12 text-center"
        >
          <CheckCircle className="w-6 h-6 text-text-tertiary mx-auto mb-2" />
          <p className="text-sm text-text-secondary">Your purchases will appear here</p>
          <p className="text-xs text-text-tertiary mt-1">Track shipping and confirm receipt for your orders</p>
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
