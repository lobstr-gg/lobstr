/**
 * Client-side proof generation for LOBSTR Airdrop Attestation.
 *
 * Usage:
 *   ts-node scripts/prove.ts --workspace-id <id> --salt <salt> \
 *     --uptime <days> --channels <n> --tool-calls <n> \
 *     --heartbeats <json-file> --address <eth-address>
 */

import * as snarkjs from "snarkjs";
import * as path from "path";
import * as fs from "fs";

const BUILD_DIR = path.join(__dirname, "..", "build");
const WASM_PATH = path.join(
  BUILD_DIR,
  "airdropAttestation_js",
  "airdropAttestation.wasm"
);
const ZKEY_PATH = path.join(BUILD_DIR, "airdropAttestation_0001.zkey");

// Poseidon hash (uses snarkjs/circomlib under the hood)
// For proper Poseidon, we need to use the circomlib implementation
const buildPoseidon = require("circomlibjs").buildPoseidon;

interface HeartbeatData {
  leaf: string;
  pathElements: string[];
  pathIndices: number[];
}

interface ProofInput {
  workspaceId: string;
  salt: string;
  uptimeDays: number;
  channelCount: number;
  toolCallCount: number;
  heartbeats: HeartbeatData[];
  heartbeatMerkleRoot: string;
  claimantAddress: string;
}

export async function generateProof(input: ProofInput) {
  const poseidon = await buildPoseidon();
  const F = poseidon.F;

  // Compute workspace hash
  const workspaceHash = F.toString(
    poseidon([BigInt(input.workspaceId), BigInt(input.salt)])
  );

  // Determine tier
  let tierIndex = 0;
  if (
    input.uptimeDays >= 14 &&
    input.channelCount >= 3 &&
    input.toolCallCount >= 100
  ) {
    tierIndex = 2; // PowerUser
  } else if (
    input.uptimeDays >= 7 &&
    input.channelCount >= 2 &&
    input.toolCallCount >= 50
  ) {
    tierIndex = 1; // Active
  }

  // Pad heartbeats to 64 slots
  const paddedLeaves: string[] = [];
  const paddedPathElements: string[][] = [];
  const paddedPathIndices: number[][] = [];

  for (let i = 0; i < 64; i++) {
    if (i < input.heartbeats.length) {
      paddedLeaves.push(input.heartbeats[i].leaf);
      paddedPathElements.push(input.heartbeats[i].pathElements);
      paddedPathIndices.push(input.heartbeats[i].pathIndices);
    } else {
      // Dummy values for unused slots
      paddedLeaves.push("0");
      paddedPathElements.push(Array(8).fill("0"));
      paddedPathIndices.push(Array(8).fill(0));
    }
  }

  const circuitInput = {
    // Public
    workspaceHash,
    claimantAddress: input.claimantAddress,
    tierIndex: tierIndex.toString(),
    // Private
    workspaceId: input.workspaceId,
    salt: input.salt,
    uptimeDays: input.uptimeDays.toString(),
    channelCount: input.channelCount.toString(),
    toolCallCount: input.toolCallCount.toString(),
    heartbeatLeaves: paddedLeaves,
    heartbeatPathElements: paddedPathElements,
    heartbeatPathIndices: paddedPathIndices,
    numHeartbeats: input.heartbeats.length.toString(),
    heartbeatMerkleRoot: input.heartbeatMerkleRoot,
  };

  console.log("Generating proof...");
  const startTime = Date.now();

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    circuitInput,
    WASM_PATH,
    ZKEY_PATH
  );

  const elapsed = Date.now() - startTime;
  console.log(`Proof generated in ${elapsed}ms`);

  // Format for Solidity
  const calldata = await snarkjs.groth16.exportSolidityCallData(
    proof,
    publicSignals
  );
  const [pA, pB, pC, pubSignals] = JSON.parse(`[${calldata}]`);

  return {
    proof,
    publicSignals,
    solidity: { pA, pB, pC, pubSignals },
    meta: {
      workspaceHash,
      tierIndex,
      provingTimeMs: elapsed,
    },
  };
}

// CLI entry point
if (require.main === module) {
  const args = process.argv.slice(2);
  const getArg = (name: string) => {
    const idx = args.indexOf(`--${name}`);
    if (idx === -1 || idx + 1 >= args.length) {
      throw new Error(`Missing --${name}`);
    }
    return args[idx + 1];
  };

  (async () => {
    try {
      const heartbeatsFile = getArg("heartbeats");
      const heartbeats = JSON.parse(fs.readFileSync(heartbeatsFile, "utf-8"));

      const result = await generateProof({
        workspaceId: getArg("workspace-id"),
        salt: getArg("salt"),
        uptimeDays: parseInt(getArg("uptime")),
        channelCount: parseInt(getArg("channels")),
        toolCallCount: parseInt(getArg("tool-calls")),
        heartbeats: heartbeats.leaves,
        heartbeatMerkleRoot: heartbeats.root,
        claimantAddress: getArg("address"),
      });

      const outFile = path.join(BUILD_DIR, "proof.json");
      fs.writeFileSync(outFile, JSON.stringify(result, null, 2));
      console.log(`Proof written to ${outFile}`);
      console.log(
        `Public signals: workspaceHash=${result.meta.workspaceHash}, tier=${result.meta.tierIndex}`
      );
    } catch (err) {
      console.error("Error:", err);
      process.exit(1);
    }
  })();
}
