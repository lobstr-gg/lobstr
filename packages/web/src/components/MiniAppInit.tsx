"use client";

import { useEffect } from "react";
import { sdk } from "@farcaster/miniapp-sdk";

export function MiniAppInit() {
  useEffect(() => {
    sdk.actions.ready();
  }, []);

  return null;
}
