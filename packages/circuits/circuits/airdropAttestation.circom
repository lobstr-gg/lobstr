pragma circom 2.1.6;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/comparators.circom";
include "../node_modules/circomlib/circuits/mux1.circom";

/**
 * AirdropAttestation — proves workspace legitimacy and tier qualification
 * without revealing private data.
 *
 * Public inputs (3):
 *   workspaceHash   — Poseidon(workspaceId, salt), commitment to workspace identity
 *   claimantAddress — bound to msg.sender to prevent proof replay/front-running
 *   tierIndex       — 0=New, 1=Active, 2=PowerUser
 *
 * Private inputs:
 *   workspaceId     — unique workspace identifier
 *   salt            — random salt for workspace hash commitment
 *   uptimeDays      — number of days the agent was active
 *   channelCount    — number of communication channels
 *   toolCallCount   — total tool invocations
 *   heartbeatLeaves[64]     — heartbeat leaf values for Merkle proof
 *   heartbeatPathElements[64][8] — Merkle path siblings (depth 8)
 *   heartbeatPathIndices[64][8]  — Merkle path direction bits
 *   numHeartbeats   — actual number of valid heartbeats (<=64)
 *   heartbeatMerkleRoot — the root of the heartbeat Merkle tree
 *
 * Constraint groups:
 *   1. Workspace hash commitment
 *   2. Heartbeat Merkle membership (selective verification)
 *   3. Uptime consistency
 *   4. Tier classification (hardcoded thresholds)
 *   5. Address binding (wired as public input)
 */

// Merkle tree depth for heartbeat tree
// 2^8 = 256 max heartbeats
template AirdropAttestation() {
    // --- Public inputs ---
    signal input workspaceHash;
    signal input claimantAddress;
    signal input tierIndex;

    // --- Private inputs ---
    signal input workspaceId;
    signal input salt;
    signal input uptimeDays;
    signal input channelCount;
    signal input toolCallCount;
    signal input heartbeatLeaves[64];
    signal input heartbeatPathElements[64][8];
    signal input heartbeatPathIndices[64][8];
    signal input numHeartbeats;
    signal input heartbeatMerkleRoot;

    // =============================================
    // 1. Workspace hash commitment
    //    workspaceHash == Poseidon(workspaceId, salt)
    // =============================================
    component workspaceHasher = Poseidon(2);
    workspaceHasher.inputs[0] <== workspaceId;
    workspaceHasher.inputs[1] <== salt;
    workspaceHash === workspaceHasher.out;

    // =============================================
    // 2. Heartbeat Merkle membership
    //    For each heartbeat i < numHeartbeats, verify the leaf
    //    is in the Merkle tree with root heartbeatMerkleRoot.
    //    We use selective verification: only check if i < numHeartbeats.
    // =============================================

    // For each potential heartbeat slot, compute Merkle root from leaf
    component merkleHashers[64][8];
    signal computedRoots[64];
    signal hashes[64][9];
    signal left[64][8];
    signal right[64][8];

    for (var i = 0; i < 64; i++) {
        hashes[i][0] <== heartbeatLeaves[i];

        for (var j = 0; j < 8; j++) {
            // Ensure pathIndices are binary
            heartbeatPathIndices[i][j] * (1 - heartbeatPathIndices[i][j]) === 0;

            merkleHashers[i][j] = Poseidon(2);

            // Select ordering based on pathIndex
            left[i][j] <== hashes[i][j] + heartbeatPathIndices[i][j] * (heartbeatPathElements[i][j] - hashes[i][j]);
            right[i][j] <== heartbeatPathElements[i][j] + heartbeatPathIndices[i][j] * (hashes[i][j] - heartbeatPathElements[i][j]);

            merkleHashers[i][j].inputs[0] <== left[i][j];
            merkleHashers[i][j].inputs[1] <== right[i][j];

            hashes[i][j + 1] <== merkleHashers[i][j].out;
        }

        computedRoots[i] <== hashes[i][8];
    }

    // Selective check: for each heartbeat i, if i < numHeartbeats,
    // then computedRoots[i] must equal heartbeatMerkleRoot
    component ltChecks[64];
    signal rootDiff[64];
    signal enabledRootDiff[64];
    for (var i = 0; i < 64; i++) {
        ltChecks[i] = LessThan(8); // 8 bits supports up to 255
        ltChecks[i].in[0] <== i;
        ltChecks[i].in[1] <== numHeartbeats;

        // If i < numHeartbeats (ltChecks[i].out == 1), then root must match
        // enabled * (computedRoot - expectedRoot) === 0
        rootDiff[i] <== computedRoots[i] - heartbeatMerkleRoot;
        enabledRootDiff[i] <== ltChecks[i].out * rootDiff[i];
        enabledRootDiff[i] === 0;
    }

    // =============================================
    // 3. Uptime consistency
    //    uptimeDays <= numHeartbeats
    //    (you can't have more uptime days than heartbeats)
    // =============================================
    component uptimeCheck = LessEqThan(16);
    uptimeCheck.in[0] <== uptimeDays;
    uptimeCheck.in[1] <== numHeartbeats;
    uptimeCheck.out === 1;

    // numHeartbeats <= 64 (max slots)
    component maxHeartbeatCheck = LessEqThan(8);
    maxHeartbeatCheck.in[0] <== numHeartbeats;
    maxHeartbeatCheck.in[1] <== 64;
    maxHeartbeatCheck.out === 1;

    // =============================================
    // 4. Tier classification
    //    Hardcoded thresholds matching the contract:
    //    PowerUser (tier 2): 14d uptime, 3 channels, 100 tool calls
    //    Active    (tier 1): 7d uptime, 2 channels, 50 tool calls
    //    New       (tier 0): everything else
    //
    //    We verify the claimed tierIndex matches the actual tier
    //    determined by the private inputs.
    // =============================================

    // Check PowerUser thresholds
    component puUptime = GreaterEqThan(16);
    puUptime.in[0] <== uptimeDays;
    puUptime.in[1] <== 14;

    component puChannels = GreaterEqThan(16);
    puChannels.in[0] <== channelCount;
    puChannels.in[1] <== 3;

    component puToolCalls = GreaterEqThan(16);
    puToolCalls.in[0] <== toolCallCount;
    puToolCalls.in[1] <== 100;

    // isPowerUser = puUptime AND puChannels AND puToolCalls
    signal puAnd1;
    puAnd1 <== puUptime.out * puChannels.out;
    signal isPowerUser;
    isPowerUser <== puAnd1 * puToolCalls.out;

    // Check Active thresholds
    component actUptime = GreaterEqThan(16);
    actUptime.in[0] <== uptimeDays;
    actUptime.in[1] <== 7;

    component actChannels = GreaterEqThan(16);
    actChannels.in[0] <== channelCount;
    actChannels.in[1] <== 2;

    component actToolCalls = GreaterEqThan(16);
    actToolCalls.in[0] <== toolCallCount;
    actToolCalls.in[1] <== 50;

    // isActive = actUptime AND actChannels AND actToolCalls AND NOT isPowerUser
    signal actAnd1;
    actAnd1 <== actUptime.out * actChannels.out;
    signal actAnd2;
    actAnd2 <== actAnd1 * actToolCalls.out;
    signal isActive;
    isActive <== actAnd2 * (1 - isPowerUser);

    // isNew = NOT isPowerUser AND NOT isActive (i.e. everything else)
    signal isNew;
    isNew <== (1 - isPowerUser) * (1 - isActive - isPowerUser + isPowerUser);
    // Simplified: isNew = 1 - isPowerUser - isActive
    // But we need to verify this algebraically...
    // Actually: isPowerUser + isActive + isNew should = 1
    // isNew = 1 - isPowerUser - isActive (no overlap by construction)

    // Compute expected tier: 0*isNew + 1*isActive + 2*isPowerUser
    signal expectedTier;
    expectedTier <== isActive + 2 * isPowerUser;

    // Verify claimed tier matches
    tierIndex === expectedTier;

    // =============================================
    // 5. Address binding
    //    claimantAddress is a public input, wired into the circuit.
    //    The contract checks msg.sender == claimantAddress.
    //    We include it in the circuit so the proof is bound to
    //    a specific address and cannot be replayed.
    //    We add a trivial constraint to ensure it's not optimized away.
    // =============================================
    signal addressSquared;
    addressSquared <== claimantAddress * claimantAddress;
    // This constraint ensures claimantAddress is actually used in the circuit
    // and cannot be stripped by the compiler. The verifier will check the
    // public input matches msg.sender on-chain.
}

component main {public [workspaceHash, claimantAddress, tierIndex]} = AirdropAttestation();
