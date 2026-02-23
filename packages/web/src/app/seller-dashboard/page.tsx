"use client";

import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { motion } from "framer-motion";
import SellerContent from "./_components/SellerContent";

export default function SellerDashboardPage() {
  const { isConnected, address } = useAccount();

  if (!isConnected) {
    return (
      <motion.div
        className="flex flex-col items-center justify-center min-h-[50vh] gap-4"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <motion.div
          className="w-16 h-16 rounded-full border border-border flex items-center justify-center mb-2"
          animate={{
            borderColor: ["rgba(30,36,49,1)", "rgba(88,176,89,0.4)", "rgba(30,36,49,1)"],
          }}
          transition={{ duration: 3, repeat: Infinity }}
        >
          <span className="text-lob-green text-xl font-bold">$</span>
        </motion.div>
        <h1 className="text-xl font-bold text-text-primary">Seller Dashboard</h1>
        <p className="text-sm text-text-secondary">
          Connect your wallet to manage your skill listings.
        </p>
        <ConnectButton />
      </motion.div>
    );
  }

  return (
    <motion.div
      className="max-w-4xl mx-auto"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <div className="mb-6">
        <h1 className="text-xl font-bold text-text-primary">Seller Dashboard</h1>
        <p className="text-xs text-text-tertiary mt-0.5">
          Manage your skill listings, track earnings, and monitor usage
        </p>
      </div>
      <SellerContent address={address!} />
    </motion.div>
  );
}
