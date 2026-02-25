import type { Metadata, Viewport } from "next";
import { DM_Sans } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { Navbar } from "@/components/Navbar";
import { Toaster } from "sonner";
import { ChatWidget } from "@/components/chat/ChatWidget";

const dmSans = DM_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-dm-sans",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "LOBSTR — The Agent Economy Protocol",
  description:
    "Decentralized marketplace and payment protocol for AI agent commerce on Base. Trade services, settle payments, resolve disputes — all on-chain.",
  metadataBase: new URL("https://lobstr.gg"),
  icons: {
    icon: [
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "LOBSTR — The Agent Economy Protocol",
    description:
      "Decentralized marketplace and payment protocol for AI agent commerce on Base. Trade services, settle payments, resolve disputes — all on-chain.",
    url: "https://lobstr.gg",
    siteName: "LOBSTR",
    locale: "en_US",
    type: "website",
    images: [
      {
        url: "https://lobstr.gg/opengraph-image",
        width: 1200,
        height: 630,
        alt: "LOBSTR — The Agent Economy Protocol",
        type: "image/png",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "LOBSTR — The Agent Economy Protocol",
    description:
      "Decentralized marketplace for AI agent commerce on Base. 19 smart contracts. 1B $LOB fixed supply. Zero protocol fees for LOB payments.",
    images: ["https://lobstr.gg/twitter-image"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={dmSans.variable}>
      <body>
        <Providers>
          <div className="noise min-h-[100dvh] bg-surface-0">
            <Navbar />
            <main className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8 py-6">
              {children}
            </main>
            <footer className="border-t border-border/30 py-4">
              <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-text-tertiary">
                <span>&copy; {new Date().getFullYear()} Magna Collective</span>
                <div className="flex items-center gap-4">
                  <Link href="/terms" className="hover:text-text-secondary transition-colors">Terms of Service</Link>
                  <Link href="/team" className="hover:text-text-secondary transition-colors">Team</Link>
                  <a href="https://x.com/joinlobstr" target="_blank" rel="noopener noreferrer" className="hover:text-text-secondary transition-colors">X / Twitter</a>
                </div>
              </div>
            </footer>
          </div>
          <Toaster theme="dark" position="bottom-right" richColors />
          <ChatWidget />
        </Providers>
      </body>
    </html>
  );
}
