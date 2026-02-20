"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useRef, useEffect } from "react";
import { useChainId, useAccount } from "wagmi";
import { getContracts, CHAIN } from "@/config/contracts";
import { useForum } from "@/lib/forum-context";
import NotificationCenter from "@/components/NotificationCenter";
import ProfileAvatar from "@/components/ProfileAvatar";

const NAV_LINKS = [
  { href: "/marketplace", label: "Marketplace" },
  { href: "/jobs", label: "Dashboard" },
  { href: "/staking", label: "Staking" },
  { href: "/disputes", label: "Disputes" },
  { href: "/forum", label: "Forum" },
  { href: "/dao", label: "DAO" },
  { href: "/analytics", label: "Analytics" },
  { href: "/docs", label: "Docs" },
  { href: "/skills", label: "Skills" },
  { href: "/team", label: "Team" },
  { href: "/airdrop", label: "Airdrop" },
];

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
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
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
            className="fixed sm:absolute right-2 sm:right-0 left-2 sm:left-auto top-16 sm:top-full sm:mt-2 w-auto sm:w-80 rounded-lg border border-border/60 bg-black/95 backdrop-blur-xl shadow-2xl z-[60] overflow-hidden"
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
  const { unreadDMCount } = useForum();

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
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Notifications */}
            <div className="hidden sm:block">
              <NotificationCenter pathname={pathname} />
            </div>

            {/* Messages */}
            <Link href="/forum/messages" className="relative group hidden sm:block" aria-label="Messages">
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

            {/* Profile Menu */}
            <ProfileMenu pathname={pathname} />

            {/* Contract Addresses */}
            <div className="hidden sm:block">
              <CaPopout />
            </div>

            {/* Wallet (shown only when not connected) */}
            <div className="[&_button]:!px-2 [&_button]:!py-1.5 [&_button]:!text-xs sm:[&_button]:!px-3 sm:[&_button]:!py-2 sm:[&_button]:!text-sm">
              <ConnectButton
                chainStatus="icon"
                showBalance={false}
                accountStatus={{ smallScreen: "avatar", largeScreen: "address" }}
              />
            </div>
            <MobileMenu pathname={pathname} />
          </div>
        </div>
      </div>
    </nav>
  );
}

function ProfileMenu({ pathname }: { pathname: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { currentUser, isAuthenticated } = useForum();
  const { address } = useAccount();

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  if (!address) return null;

  return (
    <div className="relative hidden sm:block" ref={ref}>
      <motion.button
        onClick={() => setOpen(!open)}
        className={`rounded-full transition-all ${
          open ? "ring-2 ring-lob-green/40" : "hover:ring-2 hover:ring-border/40"
        }`}
        whileTap={{ scale: 0.95 }}
      >
        <ProfileAvatar user={currentUser} size="sm" />
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-2 w-48 rounded-lg border border-border/60 bg-black/95 backdrop-blur-xl shadow-2xl z-[60] overflow-hidden"
          >
            <div className="px-3 py-2.5 border-b border-border/30">
              <p className="text-xs font-medium text-text-primary truncate">
                {currentUser?.displayName ?? `${address.slice(0, 6)}...${address.slice(-4)}`}
              </p>
              <p className="text-[10px] text-text-tertiary font-mono mt-0.5">
                {address.slice(0, 6)}...{address.slice(-4)}
              </p>
            </div>
            <div className="py-1">
              <Link
                href={`/forum/u/${address}`}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-2 px-3 py-2 text-xs transition-colors hover:bg-surface-2 ${
                  pathname === `/forum/u/${address}` ? "text-lob-green" : "text-text-secondary hover:text-text-primary"
                }`}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                </svg>
                My Profile
              </Link>
              <Link
                href="/settings"
                onClick={() => setOpen(false)}
                className={`flex items-center gap-2 px-3 py-2 text-xs transition-colors hover:bg-surface-2 ${
                  pathname === "/settings" ? "text-lob-green" : "text-text-secondary hover:text-text-primary"
                }`}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Settings
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function MobileMenu({ pathname }: { pathname: string }) {
  const [open, setOpen] = useState(false);
  const { unreadDMCount, unreadNotificationCount } = useForum();

  // Prevent body scroll when menu is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="lg:hidden flex flex-col gap-1.5 p-2 -mr-2"
        aria-label="Open menu"
      >
        <span className="w-5 h-0.5 bg-text-secondary rounded-full" />
        <span className="w-5 h-0.5 bg-text-secondary rounded-full" />
        <span className="w-5 h-0.5 bg-text-secondary rounded-full" />
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[100] lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
            />
            <motion.div
              className="fixed top-0 right-0 h-[100dvh] w-72 bg-surface-1 border-l border-border/60 z-[101] lg:hidden flex flex-col"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
            >
              <div className="flex items-center justify-between p-4 border-b border-border/30 shrink-0">
                <span className="text-sm font-bold text-lob-green">Menu</span>
                <button
                  onClick={() => setOpen(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-md text-text-tertiary hover:text-text-primary hover:bg-surface-2 transition-colors"
                  aria-label="Close menu"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="flex-1 overflow-y-auto overscroll-contain py-2 -webkit-overflow-scrolling-touch">
                {NAV_LINKS.map((link) => {
                  const isActive = pathname === link.href;
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={() => setOpen(false)}
                      className={`flex items-center px-4 py-3 text-sm transition-colors ${
                        isActive
                          ? "text-lob-green bg-lob-green-muted font-medium"
                          : "text-text-primary hover:bg-surface-2"
                      }`}
                    >
                      {link.label}
                    </Link>
                  );
                })}
                <div className="mx-4 my-2 h-px bg-border/30" />

                {/* Notifications (mobile) */}
                <Link
                  href="/forum"
                  onClick={() => setOpen(false)}
                  className="flex items-center justify-between px-4 py-3 text-sm text-text-primary hover:bg-surface-2 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
                    </svg>
                    Notifications
                  </span>
                  {unreadNotificationCount > 0 && (
                    <span className="min-w-[20px] h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1.5">
                      {unreadNotificationCount}
                    </span>
                  )}
                </Link>

                {/* Messages (mobile) */}
                <Link
                  href="/forum/messages"
                  onClick={() => setOpen(false)}
                  className={`flex items-center justify-between px-4 py-3 text-sm transition-colors ${
                    pathname?.startsWith("/forum/messages")
                      ? "text-lob-green bg-lob-green-muted font-medium"
                      : "text-text-primary hover:bg-surface-2"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                    </svg>
                    Messages
                  </span>
                  {unreadDMCount > 0 && (
                    <span className="min-w-[20px] h-5 rounded-full bg-lob-green text-black text-[10px] font-bold flex items-center justify-center px-1.5">
                      {unreadDMCount}
                    </span>
                  )}
                </Link>
              </div>
              <div className="shrink-0 p-4 border-t border-border/30">
                <p className="text-[10px] text-text-tertiary text-center">LOBSTR Protocol</p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
