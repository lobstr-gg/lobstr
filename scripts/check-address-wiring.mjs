import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();

const paths = {
  canonical: resolve(root, "packages/web/src/config/contract-addresses.ts"),
  webContracts: resolve(root, "packages/web/src/config/contracts.ts"),
  ponderConfig: resolve(root, "packages/indexer/ponder.config.ts"),
};

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const [canonical, webContracts, ponderConfig] = await Promise.all([
    readFile(paths.canonical, "utf8"),
    readFile(paths.webContracts, "utf8"),
    readFile(paths.ponderConfig, "utf8"),
  ]);

  assert(
    canonical.includes("[baseSepolia.id]") &&
      canonical.includes("[base.id]") &&
      canonical.includes("CONTRACTS_BY_CHAIN"),
    "Canonical address map must define both Base Sepolia and Base via CONTRACTS_BY_CHAIN."
  );

  assert(
    webContracts.includes("CONTRACTS_BY_CHAIN"),
    "Web contracts config must consume CONTRACTS_BY_CHAIN."
  );

  assert(
    ponderConfig.includes(
      'import { CONTRACTS_BY_CHAIN } from "../web/src/config/contract-addresses";'
    ) && ponderConfig.includes("const CONTRACTS = CONTRACTS_BY_CHAIN[base.id];"),
    "Indexer config must consume canonical CONTRACTS_BY_CHAIN[base.id]."
  );

  const hardcodedAddressMatches = ponderConfig.match(/0x[a-fA-F0-9]{40}/g) ?? [];
  assert(
    hardcodedAddressMatches.length === 0,
    `Indexer config contains hardcoded addresses: ${hardcodedAddressMatches.join(", ")}`
  );

  console.log("Address wiring check passed.");
}

main().catch((err) => {
  console.error(`Address wiring check failed: ${err.message}`);
  process.exit(1);
});
