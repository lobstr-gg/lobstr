/**
 * End-to-end test: read REAL workspace data, generate attestation input,
 * create ZK proof, verify locally, and submit on-chain to AirdropClaimV2.
 *
 * Uses the actual openclaw workspace at ~/.openclaw/<name>/ — no hardcoded data.
 */

import { buildPoseidon } from "circomlibjs";
import * as snarkjs from "snarkjs";
import { createWalletClient, createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BUILD_DIR = path.join(__dirname, "..", "build");
const WASM_PATH = path.join(BUILD_DIR, "airdropAttestation_js", "airdropAttestation.wasm");
const ZKEY_PATH = path.join(BUILD_DIR, "airdropAttestation_0001.zkey");
const VKEY_PATH = path.join(BUILD_DIR, "verification_key.json");

const AIRDROP_V2 = "0x93556AF4785ab34726848AC6b2aaEA53ffC4760B";

const TREE_DEPTH = 8;
const TREE_SIZE = 1 << TREE_DEPTH; // 256

const airdropAbi = [
  {
    name: "submitProof",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "pA", type: "uint256[2]" },
      { name: "pB", type: "uint256[2][2]" },
      { name: "pC", type: "uint256[2]" },
      { name: "pubSignals", type: "uint256[3]" },
    ],
    outputs: [],
  },
  {
    name: "getClaimInfo",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "claimant", type: "address" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "claimed", type: "bool" },
          { name: "amount", type: "uint256" },
          { name: "vestedAmount", type: "uint256" },
          { name: "claimedAt", type: "uint256" },
          { name: "tier", type: "uint8" },
          { name: "workspaceHash", type: "uint256" },
        ],
      },
    ],
  },
  {
    name: "claimWindowStart",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "claimWindowEnd",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
];

// ──────────────────────────────────────────────────────
// 1. Read real workspace data
// ──────────────────────────────────────────────────────

function loadWorkspace(wsName) {
  const wsDir = path.join(process.env.HOME, ".openclaw", wsName);
  if (!fs.existsSync(wsDir)) {
    throw new Error(`Workspace not found: ${wsDir}`);
  }

  const config = JSON.parse(fs.readFileSync(path.join(wsDir, "config.json"), "utf-8"));
  const activity = fs.existsSync(path.join(wsDir, "activity.json"))
    ? JSON.parse(fs.readFileSync(path.join(wsDir, "activity.json"), "utf-8"))
    : { channelCount: 0, toolCallCount: 0 };
  const wallet = JSON.parse(fs.readFileSync(path.join(wsDir, "wallet.json"), "utf-8"));

  // Read heartbeats (may not exist)
  let heartbeats = [];
  const hbPath = path.join(wsDir, "heartbeats.jsonl");
  if (fs.existsSync(hbPath)) {
    const lines = fs.readFileSync(hbPath, "utf-8").trim().split("\n").filter(Boolean);
    heartbeats = lines.map((l) => JSON.parse(l));
  }

  return { config, activity, wallet, heartbeats, wsDir };
}

// ──────────────────────────────────────────────────────
// 2. Build Merkle tree (same algorithm as openclaw/lib/merkle.ts)
// ──────────────────────────────────────────────────────

async function buildMerkleTree(poseidon, F, leaves) {
  const padded = [...leaves];
  while (padded.length < TREE_SIZE) padded.push(0n);

  const layers = [padded];
  for (let d = 0; d < TREE_DEPTH; d++) {
    const prev = layers[d];
    const next = [];
    for (let i = 0; i < prev.length; i += 2) {
      next.push(F.toObject(poseidon([prev[i], prev[i + 1]])));
    }
    layers.push(next);
  }

  const root = layers[TREE_DEPTH][0];

  function getProof(leafIndex) {
    const pathElements = [];
    const pathIndices = [];
    let idx = leafIndex;
    for (let d = 0; d < TREE_DEPTH; d++) {
      const siblingIdx = idx % 2 === 0 ? idx + 1 : idx - 1;
      pathElements.push(layers[d][siblingIdx]);
      pathIndices.push(idx % 2);
      idx = Math.floor(idx / 2);
    }
    return { pathElements, pathIndices };
  }

  return { root, layers, getProof };
}

// ──────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────

async function main() {
  const wsName = process.argv[2] || "test-agent";
  console.log(`=== LOBSTR ZK Airdrop E2E — workspace: ${wsName} ===\n`);

  // --- Load workspace ---
  console.log("1. Loading workspace data...");
  const { config, activity, wallet, heartbeats, wsDir } = loadWorkspace(wsName);

  console.log(`   workspaceId: ${config.workspaceId.slice(0, 20)}...`);
  console.log(`   address:     ${wallet.address}`);
  console.log(`   heartbeats:  ${heartbeats.length}`);
  console.log(`   channels:    ${activity.channelCount}`);
  console.log(`   tool calls:  ${activity.toolCallCount}`);

  // Count unique UTC uptime days
  const uniqueDays = new Set(
    heartbeats.map((hb) => {
      const d = new Date(hb.timestamp * 1000);
      return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
    })
  );
  const uptimeDays = uniqueDays.size;
  console.log(`   uptime days: ${uptimeDays}`);

  // --- Determine tier from real data ---
  let tierIndex = 0;
  if (uptimeDays >= 14 && activity.channelCount >= 3 && activity.toolCallCount >= 100) {
    tierIndex = 2;
  } else if (uptimeDays >= 7 && activity.channelCount >= 2 && activity.toolCallCount >= 50) {
    tierIndex = 1;
  }
  const tierNames = ["New", "Active", "PowerUser"];
  console.log(`   => tier:     ${tierIndex} (${tierNames[tierIndex]})`);

  // --- Build Poseidon and Merkle tree ---
  console.log("\n2. Building Poseidon Merkle tree from heartbeats...");
  const poseidon = await buildPoseidon();
  const F = poseidon.F;

  // Use real heartbeat hashes as leaves
  const leaves = heartbeats.map((hb) => BigInt(hb.hash));
  const tree = await buildMerkleTree(poseidon, F, leaves);
  console.log(`   Merkle root: ${tree.root.toString().slice(0, 20)}...`);

  // --- Compute workspace hash ---
  const workspaceHash = F.toString(
    poseidon([BigInt(config.workspaceId), BigInt(config.salt)])
  );
  console.log(`   workspace hash: ${workspaceHash.slice(0, 20)}...`);

  // --- Build circuit inputs from real data ---
  console.log("\n3. Building circuit inputs from real workspace data...");
  const claimantAddress = BigInt(wallet.address).toString();
  const numHeartbeats = Math.min(heartbeats.length, 64);

  // Pad heartbeat proofs to 64 slots
  const heartbeatLeaves = [];
  const heartbeatPathElements = [];
  const heartbeatPathIndices = [];

  for (let i = 0; i < 64; i++) {
    if (i < numHeartbeats) {
      heartbeatLeaves.push(leaves[i].toString());
      const proof = tree.getProof(i);
      heartbeatPathElements.push(proof.pathElements.map((e) => e.toString()));
      heartbeatPathIndices.push(proof.pathIndices);
    } else {
      heartbeatLeaves.push("0");
      heartbeatPathElements.push(Array(8).fill("0"));
      heartbeatPathIndices.push(Array(8).fill(0));
    }
  }

  const circuitInput = {
    // Public
    workspaceHash,
    claimantAddress,
    tierIndex: tierIndex.toString(),
    // Private (all from real workspace data)
    workspaceId: config.workspaceId,
    salt: config.salt,
    uptimeDays: uptimeDays.toString(),
    channelCount: activity.channelCount.toString(),
    toolCallCount: activity.toolCallCount.toString(),
    heartbeatLeaves,
    heartbeatPathElements,
    heartbeatPathIndices,
    numHeartbeats: numHeartbeats.toString(),
    heartbeatMerkleRoot: tree.root.toString(),
  };

  // Save attestation input to workspace
  const attestDir = path.join(wsDir, "attestation");
  fs.mkdirSync(attestDir, { recursive: true });
  fs.writeFileSync(
    path.join(attestDir, "input.json"),
    JSON.stringify(circuitInput, null, 2)
  );
  console.log(`   Saved: ${path.join(attestDir, "input.json")}`);

  // --- Generate proof ---
  console.log("\n4. Generating Groth16 proof...");
  const startTime = Date.now();
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    circuitInput,
    WASM_PATH,
    ZKEY_PATH
  );
  const elapsed = Date.now() - startTime;
  console.log(`   Proof generated in ${elapsed}ms`);
  console.log(`   Public signals: [${publicSignals.map((s) => s.slice(0, 15) + "...").join(", ")}]`);

  // --- Verify locally ---
  console.log("\n5. Verifying proof locally...");
  const vkey = JSON.parse(fs.readFileSync(VKEY_PATH, "utf-8"));
  const valid = await snarkjs.groth16.verify(vkey, publicSignals, proof);
  console.log(`   Local verification: ${valid ? "PASS" : "FAIL"}`);
  if (!valid) {
    console.error("   ERROR: Proof failed local verification!");
    process.exit(1);
  }

  // --- Format for Solidity ---
  console.log("\n6. Formatting proof for Solidity...");
  const calldata = await snarkjs.groth16.exportSolidityCallData(proof, publicSignals);
  const [pA, pB, pC, pubSignals] = JSON.parse(`[${calldata}]`);

  // Save proof to workspace
  const proofData = { proof, publicSignals, solidity: { pA, pB, pC, pubSignals } };
  fs.writeFileSync(
    path.join(attestDir, "proof.json"),
    JSON.stringify(proofData, null, 2)
  );
  console.log(`   Saved: ${path.join(attestDir, "proof.json")}`);

  // --- Submit on-chain ---
  console.log("\n7. Submitting proof on-chain (real verifier)...");

  // Decrypt workspace wallet to get private key
  const walletPassword = process.env.OPENCLAW_PASSWORD || "testpass123";
  let privateKey;
  try {
    const salt = Buffer.from(wallet.salt, "hex");
    const iv = Buffer.from(wallet.iv, "hex");
    const authTag = Buffer.from(wallet.authTag, "hex");
    const key = crypto.pbkdf2Sync(walletPassword, salt, 100_000, 32, "sha256");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(wallet.encryptedKey, "hex", "utf-8");
    decrypted += decipher.final("utf-8");
    privateKey = decrypted;
    console.log(`   Wallet decrypted: ${wallet.address}`);
  } catch (err) {
    console.error("   Failed to decrypt wallet. Set OPENCLAW_PASSWORD env var.");
    console.log("   Proof generated and saved. Submit manually with: lobstr airdrop submit-attestation");
    process.exit(0);
  }

  const account = privateKeyToAccount(privateKey);

  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http("https://sepolia.base.org"),
  });

  const walletClient = createWalletClient({
    account,
    chain: baseSepolia,
    transport: http("https://sepolia.base.org"),
  });

  // Check claim window
  const windowStart = await publicClient.readContract({
    address: AIRDROP_V2,
    abi: airdropAbi,
    functionName: "claimWindowStart",
  });
  const windowEnd = await publicClient.readContract({
    address: AIRDROP_V2,
    abi: airdropAbi,
    functionName: "claimWindowEnd",
  });
  const now = BigInt(Math.floor(Date.now() / 1000));
  console.log(`   Claim window: ${new Date(Number(windowStart) * 1000).toISOString()} to ${new Date(Number(windowEnd) * 1000).toISOString()}`);
  console.log(`   Window active: ${now >= windowStart && now <= windowEnd}`);

  // Check if already claimed
  const claimInfo = await publicClient.readContract({
    address: AIRDROP_V2,
    abi: airdropAbi,
    functionName: "getClaimInfo",
    args: [account.address],
  });
  if (claimInfo.claimed) {
    console.log(`\n   Already claimed on this contract!`);
    console.log(`   Amount: ${Number(claimInfo.amount) / 1e18} LOB`);
    console.log(`   Tier: ${tierNames[claimInfo.tier]}`);
    console.log("\n=== DONE (proof generated + verified, already claimed on-chain) ===");
    process.exit(0);
  }

  // Submit
  try {
    const hash = await walletClient.writeContract({
      address: AIRDROP_V2,
      abi: airdropAbi,
      functionName: "submitProof",
      args: [pA.map(BigInt), pB.map((r) => r.map(BigInt)), pC.map(BigInt), pubSignals.map(BigInt)],
    });
    console.log(`   Tx: ${hash}`);
    console.log("   Waiting for confirmation...");

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log(`   Status: ${receipt.status}`);
    console.log(`   Gas used: ${receipt.gasUsed}`);

    // Read updated claim info
    const after = await publicClient.readContract({
      address: AIRDROP_V2,
      abi: airdropAbi,
      functionName: "getClaimInfo",
      args: [account.address],
    });

    const allocationMap = { 0: 1000, 1: 3000, 2: 6000 };
    console.log(`\n   === Claim Result ===`);
    console.log(`   Tier:       ${tierNames[after.tier]} (${after.tier})`);
    console.log(`   Allocation: ${Number(after.amount) / 1e18} LOB`);
    console.log(`   Immediate:  ${allocationMap[after.tier] * 0.25} LOB (25%)`);
    console.log(`   Vesting:    ${Number(after.vestedAmount) / 1e18} LOB over 180 days`);

    console.log("\n=== TEST PASSED ===");
  } catch (err) {
    console.error(`   ERROR: ${err.message}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
