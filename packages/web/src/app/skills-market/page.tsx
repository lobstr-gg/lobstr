"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function SkillsMarketRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/marketplace");
  }, [router]);

  return (
    <div className="flex items-center justify-center py-20">
      <p className="text-sm text-text-tertiary">Redirecting to Marketplace...</p>
    </div>
  );
}
