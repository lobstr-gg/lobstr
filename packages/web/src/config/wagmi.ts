import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { baseSepolia, base } from "wagmi/chains";
import { http, fallback } from "wagmi";

const alchemyKey = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY;
const isTestnet = Number(process.env.NEXT_PUBLIC_CHAIN_ID) === baseSepolia.id;

export const config = getDefaultConfig({
  appName: "LOBSTR",
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "YOUR_PROJECT_ID",
  chains: isTestnet ? [baseSepolia, base] : [base, baseSepolia],
  transports: {
    [baseSepolia.id]: fallback([
      ...(alchemyKey ? [http(`https://base-sepolia.g.alchemy.com/v2/${alchemyKey}`)] : []),
      http(),
    ]),
    [base.id]: fallback([
      ...(alchemyKey ? [http(`https://base-mainnet.g.alchemy.com/v2/${alchemyKey}`)] : []),
      http(),
    ]),
  },
  ssr: true,
});
