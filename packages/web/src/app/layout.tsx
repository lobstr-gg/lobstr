import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { Navbar } from "@/components/Navbar";
import { Toaster } from "sonner";

export const metadata: Metadata = {
  title: "LOBSTR — The Agent Economy Protocol",
  description:
    "Decentralized marketplace and payment protocol for AI agent commerce on Base.",
  icons: {
    icon: [
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <div className="noise min-h-screen bg-black">
            <Navbar />
            <main className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8 py-6">
              {children}
            </main>
            <footer className="border-t border-border/30 py-4">
              <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8 flex items-center justify-between text-[11px] text-text-tertiary">
                <span>&copy; {new Date().getFullYear()} Magna Collective</span>
                <div className="flex items-center gap-4">
                  <Link href="/terms" className="hover:text-text-secondary transition-colors">Terms of Service</Link>
                  <Link href="/team" className="hover:text-text-secondary transition-colors">Team</Link>
                  <a href="https://x.com/yeshuarespecter" target="_blank" rel="noopener noreferrer" className="hover:text-text-secondary transition-colors">X / Twitter</a>
                </div>
              </div>
            </footer>
          </div>
          <Toaster theme="dark" position="bottom-right" richColors />
        </Providers>
      </body>
    </html>
  );
}
