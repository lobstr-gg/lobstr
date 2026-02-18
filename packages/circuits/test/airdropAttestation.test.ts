import { expect } from "chai";
import * as path from "path";

// circom_tester provides a lightweight way to test circuits
// without a full trusted setup
const circom_tester = require("circom_tester");
const wasm_tester = circom_tester.wasm;

// We need Poseidon for computing expected hashes
let poseidon: any;
let F: any;

const CIRCUIT_PATH = path.join(
  __dirname,
  "..",
  "circuits",
  "airdropAttestation.circom"
);

/**
 * Helper: build a depth-8 Merkle tree from leaves using Poseidon
 */
function buildMerkleTree(leaves: bigint[]) {
  const depth = 8;
  const treeSize = 1 << depth; // 256

  // Pad leaves to tree size
  const paddedLeaves = [...leaves];
  while (paddedLeaves.length < treeSize) {
    paddedLeaves.push(BigInt(0));
  }

  // Build tree bottom-up
  const layers: bigint[][] = [paddedLeaves];
  for (let d = 0; d < depth; d++) {
    const prev = layers[d];
    const next: bigint[] = [];
    for (let i = 0; i < prev.length; i += 2) {
      next.push(F.toObject(poseidon([prev[i], prev[i + 1]])));
    }
    layers.push(next);
  }

  const root = layers[depth][0];

  // Generate proof for a given leaf index
  function getProof(leafIndex: number) {
    const pathElements: bigint[] = [];
    const pathIndices: number[] = [];

    let idx = leafIndex;
    for (let d = 0; d < depth; d++) {
      const siblingIdx = idx % 2 === 0 ? idx + 1 : idx - 1;
      pathElements.push(layers[d][siblingIdx]);
      pathIndices.push(idx % 2);
      idx = Math.floor(idx / 2);
    }

    return { pathElements, pathIndices };
  }

  return { root, layers, getProof };
}

/**
 * Helper: create valid circuit input for testing
 */
function createValidInput(overrides: Partial<any> = {}) {
  const workspaceId = BigInt(12345);
  const salt = BigInt(67890);
  const workspaceHash = F.toObject(poseidon([workspaceId, salt]));

  const numHeartbeats = overrides.numHeartbeats ?? 15;
  const heartbeatValues: bigint[] = [];
  for (let i = 0; i < numHeartbeats; i++) {
    heartbeatValues.push(BigInt(1000 + i));
  }

  const tree = buildMerkleTree(heartbeatValues);

  // Prepare padded arrays
  const heartbeatLeaves: string[] = [];
  const heartbeatPathElements: string[][] = [];
  const heartbeatPathIndices: string[][] = [];

  for (let i = 0; i < 64; i++) {
    if (i < numHeartbeats) {
      heartbeatLeaves.push(heartbeatValues[i].toString());
      const proof = tree.getProof(i);
      heartbeatPathElements.push(proof.pathElements.map((e) => e.toString()));
      heartbeatPathIndices.push(proof.pathIndices.map((e) => e.toString()));
    } else {
      heartbeatLeaves.push("0");
      heartbeatPathElements.push(Array(8).fill("0"));
      heartbeatPathIndices.push(Array(8).fill("0"));
    }
  }

  const uptimeDays = overrides.uptimeDays ?? 15;
  const channelCount = overrides.channelCount ?? 4;
  const toolCallCount = overrides.toolCallCount ?? 150;

  // Determine expected tier
  let tierIndex = 0;
  const ud = uptimeDays;
  const cc = channelCount;
  const tc = toolCallCount;
  if (ud >= 14 && cc >= 3 && tc >= 100) {
    tierIndex = 2;
  } else if (ud >= 7 && cc >= 2 && tc >= 50) {
    tierIndex = 1;
  }

  const claimantAddress = BigInt("0x1234567890abcdef1234567890abcdef12345678");

  return {
    workspaceHash: (overrides.workspaceHash ?? workspaceHash).toString(),
    claimantAddress: (
      overrides.claimantAddress ?? claimantAddress
    ).toString(),
    tierIndex: (overrides.tierIndex ?? tierIndex).toString(),
    workspaceId: (overrides.workspaceId ?? workspaceId).toString(),
    salt: (overrides.salt ?? salt).toString(),
    uptimeDays: uptimeDays.toString(),
    channelCount: channelCount.toString(),
    toolCallCount: toolCallCount.toString(),
    heartbeatLeaves,
    heartbeatPathElements,
    heartbeatPathIndices,
    numHeartbeats: numHeartbeats.toString(),
    heartbeatMerkleRoot: tree.root.toString(),
  };
}

describe("AirdropAttestation Circuit", function () {
  this.timeout(120000);

  let circuit: any;

  before(async () => {
    // Initialize Poseidon
    const buildPoseidon = require("circomlibjs").buildPoseidon;
    poseidon = await buildPoseidon();
    F = poseidon.F;

    // Compile circuit
    circuit = await wasm_tester(CIRCUIT_PATH, {
      include: [path.join(__dirname, "..", "node_modules")],
    });
  });

  // --- Test 1: Valid PowerUser proof ---
  it("should accept a valid PowerUser proof (tier 2)", async () => {
    const input = createValidInput({
      uptimeDays: 15,
      channelCount: 4,
      toolCallCount: 150,
      numHeartbeats: 15,
    });

    const witness = await circuit.calculateWitness(input, true);
    await circuit.checkConstraints(witness);
  });

  // --- Test 2: Valid Active proof ---
  it("should accept a valid Active proof (tier 1)", async () => {
    const input = createValidInput({
      uptimeDays: 10,
      channelCount: 3,
      toolCallCount: 75,
      numHeartbeats: 10,
    });

    const witness = await circuit.calculateWitness(input, true);
    await circuit.checkConstraints(witness);
  });

  // --- Test 3: Valid New agent proof ---
  it("should accept a valid New agent proof (tier 0)", async () => {
    const input = createValidInput({
      uptimeDays: 3,
      channelCount: 1,
      toolCallCount: 20,
      numHeartbeats: 5,
    });

    const witness = await circuit.calculateWitness(input, true);
    await circuit.checkConstraints(witness);
  });

  // --- Test 4: Wrong workspace hash should fail ---
  it("should reject an invalid workspace hash", async () => {
    const input = createValidInput();
    input.workspaceHash = "999999"; // Wrong hash

    try {
      await circuit.calculateWitness(input, true);
      expect.fail("Should have thrown");
    } catch (err: any) {
      expect(err.message).to.include("Assert Failed");
    }
  });

  // --- Test 5: Wrong tier claim should fail ---
  it("should reject an incorrect tier claim", async () => {
    const input = createValidInput({
      uptimeDays: 3,
      channelCount: 1,
      toolCallCount: 20,
      numHeartbeats: 5,
    });
    // Claims PowerUser but doesn't qualify
    input.tierIndex = "2";

    try {
      await circuit.calculateWitness(input, true);
      expect.fail("Should have thrown");
    } catch (err: any) {
      expect(err.message).to.include("Assert Failed");
    }
  });

  // --- Test 6: Inflated uptime should fail ---
  it("should reject uptimeDays exceeding numHeartbeats", async () => {
    const input = createValidInput({
      uptimeDays: 50,
      channelCount: 4,
      toolCallCount: 150,
      numHeartbeats: 15,
    });

    try {
      await circuit.calculateWitness(input, true);
      expect.fail("Should have thrown");
    } catch (err: any) {
      expect(err.message).to.include("Assert Failed");
    }
  });

  // --- Test 7: Boundary values for Active tier ---
  it("should accept exact boundary values for Active tier", async () => {
    const input = createValidInput({
      uptimeDays: 7,
      channelCount: 2,
      toolCallCount: 50,
      numHeartbeats: 7,
    });

    const witness = await circuit.calculateWitness(input, true);
    await circuit.checkConstraints(witness);
  });

  // --- Test 8: Boundary values for PowerUser tier ---
  it("should accept exact boundary values for PowerUser tier", async () => {
    const input = createValidInput({
      uptimeDays: 14,
      channelCount: 3,
      toolCallCount: 100,
      numHeartbeats: 14,
    });

    const witness = await circuit.calculateWitness(input, true);
    await circuit.checkConstraints(witness);
  });

  // --- Test 9: Address binding is enforced ---
  it("should produce different proofs for different addresses", async () => {
    const input1 = createValidInput({
      claimantAddress: BigInt("0x1111111111111111111111111111111111111111"),
    });
    const input2 = createValidInput({
      claimantAddress: BigInt("0x2222222222222222222222222222222222222222"),
    });

    const witness1 = await circuit.calculateWitness(input1, true);
    const witness2 = await circuit.calculateWitness(input2, true);

    // Both should pass but with different witness values
    await circuit.checkConstraints(witness1);
    await circuit.checkConstraints(witness2);

    // The witnesses should be different (address is in the public inputs)
    expect(witness1.toString()).to.not.equal(witness2.toString());
  });
});
