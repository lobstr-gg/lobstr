import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();

const CONTRACT_EVENT_SOURCES = [
  {
    contract: "DisputeArbitration",
    source: "packages/contracts/src/interfaces/IDisputeArbitration.sol",
    abi: "packages/indexer/abis/DisputeArbitration.ts",
  },
  {
    contract: "EscrowEngine",
    source: "packages/contracts/src/interfaces/IEscrowEngine.sol",
    abi: "packages/indexer/abis/EscrowEngine.ts",
  },
  {
    contract: "SybilGuard",
    source: "packages/contracts/src/SybilGuard.sol",
    abi: "packages/indexer/abis/SybilGuard.ts",
  },
];

const INDEXER_FILE = "packages/indexer/src/index.ts";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function extractSolidityEvents(source) {
  const matches = source.matchAll(/\bevent\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g);
  return new Set(Array.from(matches, (m) => m[1]));
}

function extractAbiEvents(source) {
  const matches = source.matchAll(/"name":\s*"([A-Za-z_][A-Za-z0-9_]*)"/g);
  return new Set(Array.from(matches, (m) => m[1]));
}

function extractIndexerHandlers(source, contractName) {
  const rx = new RegExp(
    `ponder\\.on\\(\\s*"${contractName}:([A-Za-z_][A-Za-z0-9_]*)"`,
    "g"
  );
  const matches = source.matchAll(rx);
  return new Set(Array.from(matches, (m) => m[1]));
}

async function main() {
  const indexerContent = await readFile(resolve(root, INDEXER_FILE), "utf8");
  const failures = [];

  for (const entry of CONTRACT_EVENT_SOURCES) {
    const contractContent = await readFile(resolve(root, entry.source), "utf8");
    const abiContent = await readFile(resolve(root, entry.abi), "utf8");

    const contractEvents = extractSolidityEvents(contractContent);
    const abiEvents = extractAbiEvents(abiContent);
    const handlerEvents = extractIndexerHandlers(indexerContent, entry.contract);

    for (const eventName of contractEvents) {
      if (!abiEvents.has(eventName)) {
        failures.push(`${entry.contract}: missing ABI event ${eventName}`);
      }
      if (!handlerEvents.has(eventName)) {
        failures.push(`${entry.contract}: missing indexer handler ${eventName}`);
      }
    }
  }

  assert(failures.length === 0, `Event plumbing check failed:\n- ${failures.join("\n- ")}`);
  console.log("Event plumbing check passed.");
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
