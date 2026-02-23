"use client";

import { useState, useEffect } from "react";
import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import { WagmiProvider, useAccount, useSwitchChain } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { config } from "@/config/wagmi";
import { CHAIN } from "@/config/contracts";
import { ForumProvider } from "@/lib/forum-context";
import ProfileSetupModal from "@/components/ProfileSetupModal";

import "@rainbow-me/rainbowkit/styles.css";

function ChainGuard({ children }: { children: React.ReactNode }) {
  const { isConnected, chainId } = useAccount();
  const { switchChain, isPending } = useSwitchChain();

  if (isConnected && chainId && chainId !== CHAIN.id) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-bg-primary/90 backdrop-blur-sm">
        <div className="card p-8 max-w-sm text-center space-y-4">
          <p className="text-sm text-text-primary font-semibold">Wrong Network</p>
          <p className="text-xs text-text-secondary">
            LOBSTR runs on {CHAIN.name}. Switch networks to continue.
          </p>
          <button
            onClick={() => switchChain({ chainId: CHAIN.id })}
            disabled={isPending}
            className="btn-primary w-full text-xs py-2"
          >
            {isPending ? "Switching..." : `Switch to ${CHAIN.name}`}
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={darkTheme({
            accentColor: "#58B059",
            accentColorForeground: "#0B0E11",
            borderRadius: "small",
            fontStack: "system",
            overlayBlur: "small",
          })}
        >
          {mounted ? (
            <ChainGuard>
              <ForumProvider>
                {children}
                <ProfileSetupModal />
              </ForumProvider>
            </ChainGuard>
          ) : (
            // Render children without wallet-dependent components during SSR
            <>{children}</>
          )}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
