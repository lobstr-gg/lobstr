import type { Context } from "hono";
import type { x402Facilitator } from "@x402/core/facilitator";

export function supportedHandler(facilitator: x402Facilitator) {
  return async (c: Context) => {
    const supported = facilitator.getSupported();
    return c.json(supported);
  };
}
