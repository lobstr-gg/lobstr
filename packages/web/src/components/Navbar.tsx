"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useRef, useEffect } from "react";
import { useChainId, useAccount } from "wagmi";
import { getContracts, CHAIN } from "@/config/contracts";

const NAV_LINKS = [
  { href: "/marketplace", label: "Marketplace" },
  { href: "/post-job", label: "Post Job" },
  { href: "/jobs", label: "Dashboard" },
  { href: "/staking", label: "Staking" },
  { href: "/disputes", label: "Disputes" },
  { href: "/forum", label: "Forum" },
  { href: "/dao", label: "DAO" },
  { href: "/docs", label: "Docs" },
  { href: "/skills", label: "Skills" },
  { href: "/team", label: "Team" },
  { href: "/airdrop", label: "Airdrop" },
];

function useUnreadDMCount(): number {
  const { address, isConnected } = useAccount();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!isConnected || !address) {
      setCount(0);
      return;
    }
    fetch("/api/forum/messages", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.conversations) {
          const total = data.conversations.reduce(
            (sum: number, c: { unreadCount?: number }) =>
              sum + (c.unreadCount || 0),
            0
          );
          setCount(total);
        }
      })
      .catch(() => {});
  }, [isConnected, address]);

  return count;
}

function getContractAddresses() {
  const c = getContracts(CHAIN.id);
  if (!c) return [];
  return [
    { label: "$LOB Token", address: c.lobToken },
    { label: "Staking", address: c.stakingManager },
    { label: "Reputation", address: c.reputationSystem },
    { label: "Registry", address: c.serviceRegistry },
    { label: "Disputes", address: c.disputeArbitration },
    { label: "Escrow", address: c.escrowEngine },
    { label: "SybilGuard", address: c.sybilGuard },
    { label: "Treasury", address: c.treasuryGovernor },
  ];
}

function CaPopout() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const CONTRACT_ADDRESSES = getContractAddresses();

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const copy = (addr: string, label: string) => {
    navigator.clipboard.writeText(addr);
    setCopied(label);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div className="relative" ref={ref}>
      <motion.button
        onClick={() => setOpen(!open)}
        className={`px-2.5 py-1.5 rounded text-xs font-medium border transition-colors ${
          open
            ? "text-lob-green border-lob-green/30 bg-lob-green-muted"
            : "text-text-secondary border-border/40 hover:text-text-primary hover:border-border"
        }`}
        whileTap={{ scale: 0.95 }}
      >
        CA
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-2 w-80 rounded-lg border border-border/60 bg-black/95 backdrop-blur-xl shadow-2xl z-50 overflow-hidden"
          >
            <div className="px-3 py-2 border-b border-border/30">
              <p className="text-[10px] text-text-tertiary uppercase tracking-widest font-semibold">
                Contract Addresses
              </p>
              <p className="text-[9px] text-text-tertiary mt-0.5">
                Base &mdash; Click to copy
              </p>
            </div>
            <div className="py-1">
              {CONTRACT_ADDRESSES.map((c) => (
                <button
                  key={c.label}
                  onClick={() => copy(c.address, c.label)}
                  className="w-full flex items-center justify-between px-3 py-2 hover:bg-surface-2 transition-colors group"
                >
                  <span className="text-xs text-text-secondary group-hover:text-text-primary transition-colors">
                    {c.label}
                  </span>
                  <span className="text-[10px] font-mono text-text-tertiary group-hover:text-lob-green transition-colors">
                    {copied === c.label
                      ? "Copied!"
                      : `${c.address.slice(0, 6)}...${c.address.slice(-4)}`}
                  </span>
                </button>
              ))}
            </div>
            <div className="px-3 py-2 border-t border-border/30">
              <p className="text-[9px] text-text-tertiary text-center">
                Live on Base Mainnet
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function Navbar() {
  const pathname = usePathname();
  const chainId = useChainId();
  const contracts = getContracts(chainId);
  const unreadDMCount = useUnreadDMCount();

  return (
    <nav className="border-b border-border/60 bg-black/80 backdrop-blur-xl sticky top-0 z-40">
      {!contracts && (
        <div className="bg-yellow-500/10 border-b border-yellow-500/20 px-4 py-1.5 text-center">
          <p className="text-xs text-yellow-400">
            Unsupported chain. Please switch to Base to use LOBSTR.
          </p>
        </div>
      )}
      <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8">
        <div className="flex h-14 items-center justify-between">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-0.5 group">
              <Image
                src="/logo.png"
                alt="LOBSTR"
                width={28}
                height={28}
                className="rounded-sm"
                priority
              />
              <motion.span
                className="text-lg font-bold tracking-tight text-lob-green"
                whileHover={{ textShadow: "0 0 20px rgba(0, 214, 114, 0.6)" }}
              >
                LOBSTR
              </motion.span>
            </Link>
            <div className="hidden lg:flex items-center gap-0">
              {NAV_LINKS.map((link) => {
                const isActive = pathname === link.href;
                return (
                  <Link key={link.href} href={link.href} className="relative">
                    <motion.div
                      className={`px-2.5 py-1.5 rounded text-sm transition-colors ${
                        isActive
                          ? "text-lob-green font-medium"
                          : "text-text-secondary hover:text-text-primary"
                      }`}
                      whileHover={{ y: -1 }}
                      whileTap={{ scale: 0.97 }}
                      transition={{ type: "spring", stiffness: 500, damping: 30 }}
                    >
                      {link.label}
                    </motion.div>
                    {isActive && (
                      <motion.div
                        layoutId="nav-active"
                        className="absolute inset-0 rounded bg-lob-green-muted -z-10"
                        transition={{ type: "spring", stiffness: 380, damping: 30 }}
                      />
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/forum/messages" className="relative group">
              <motion.div
                className={`p-2 rounded transition-colors ${
                  pathname?.startsWith("/forum/messages")
                    ? "text-lob-green"
                    : "text-text-secondary hover:text-text-primary"
                }`}
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.95 }}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                </svg>
                {unreadDMCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] rounded-full bg-lob-green text-black text-[8px] font-bold flex items-center justify-center px-0.5">
                    {unreadDMCount}
                  </span>
                )}
              </motion.div>
            </Link>
            <CaPopout />
            <ConnectButton
              chainStatus="icon"
              showBalance={false}
              accountStatus="address"
            />
            <MobileMenu pathname={pathname} />
          </div>
        </div>
      </div>
    </nav>
  );
}

function MobileMenu({ pathname }: { pathname: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="lg:hidden flex flex-col gap-1 p-2"
        aria-label="Open menu"
      >
        <span className="w-4 h-0.5 bg-text-secondary" />
        <span className="w-4 h-0.5 bg-text-secondary" />
        <span className="w-4 h-0.5 bg-text-secondary" />
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
            />
            <motion.div
              className="fixed top-0 right-0 h-full w-64 bg-surface-1 border-l border-border/60 z-50 lg:hidden overflow-y-auto"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
            >
              <div className="flex items-center justify-between p-4 border-b border-border/30">
                <span className="text-sm font-bold text-lob-green">Menu</span>
                <button
                  onClick={() => setOpen(false)}
                  className="text-text-tertiary hover:text-text-primary text-lg"
                >
                  &times;
                </button>
              </div>
              <div className="py-2">
                {NAV_LINKS.map((link) => {
                  const isActive = pathname === link.href;
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={() => setOpen(false)}
                      className={`flex items-center px-4 py-2.5 text-sm transition-colors ${
                        isActive
                          ? "text-lob-green bg-lob-green-muted font-medium"
                          : "text-text-secondary hover:text-text-primary hover:bg-surface-2"
                      }`}
                    >
                      {link.label}
                    </Link>
                  );
                })}
                <Link
                  href="/forum/messages"
                  onClick={() => setOpen(false)}
                  className={`flex items-center gap-2 px-4 py-2.5 text-sm transition-colors ${
                    pathname?.startsWith("/forum/messages")
                      ? "text-lob-green bg-lob-green-muted font-medium"
                      : "text-text-secondary hover:text-text-primary hover:bg-surface-2"
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                  </svg>
                  Messages
                </Link>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
