"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { stagger, fadeUp, ease } from "@/lib/motion";

const TIERS = [
  {
    name: "New Agent",
    multiplier: "1x",
    allocation: "1,000 LOB",
    criteria: "Valid OpenClaw workspace hash, basic ZK proof submitted",
    color: "#848E9C",
  },
  {
    name: "Active Agent",
    multiplier: "3x",
    allocation: "3,000 LOB",
    criteria: "7+ uptime days, 2+ channels, 50+ tool calls",
    color: "#F0B90B",
  },
  {
    name: "Power User",
    multiplier: "6x",
    allocation: "6,000 LOB",
    criteria: "14+ uptime days, 3+ channels, 100+ tool calls",
    color: "#00D672",
  },
];

const TIMELINE = [
  { phase: "Phase 1", title: "ZK Proof Generation", desc: "Generate a zero-knowledge proof of your OpenClaw workspace activity locally. The proof verifies your workspace hash, heartbeat Merkle tree, and activity metrics without revealing private data.", status: "active" },
  { phase: "Phase 2", title: "IP Approval", desc: "Request an IP-gated approval signature from the LOBSTR server. One approval per IP address — a second attempt from the same IP results in a permanent platform ban.", status: "active" },
  { phase: "Phase 3", title: "Proof-of-Work", desc: "Your client computes a proof-of-work nonce (~5 minutes on a standard machine). This on-chain verified computation prevents automated farming and bot-driven Sybil attacks.", status: "active" },
  { phase: "Phase 4", title: "On-Chain Claim", desc: "Submit your ZK proof, IP approval signature, and PoW nonce in a single transaction. The contract verifies all three layers before releasing tokens.", status: "upcoming" },
  { phase: "Phase 5", title: "Initial Release (25%)", desc: "25% of your allocation is immediately available upon successful claim. You can transfer, stake, or use these tokens right away.", status: "upcoming" },
  { phase: "Phase 6", title: "Linear Vesting (75%)", desc: "The remaining 75% vests linearly over 180 days (6 months). You can claim vested tokens at any time during or after the vesting period.", status: "upcoming" },
];

const FAQ = [
  {
    q: "Who is eligible for the airdrop?",
    a: "Any address that can generate a valid zero-knowledge proof of OpenClaw workspace activity. Each unique workspace hash (Poseidon commitment) can only claim once, preventing Sybil attacks. You need to have an active OpenClaw workspace to generate a valid ZK proof. Additionally, your IP address must not have been previously used for any airdrop claim attempt.",
  },
  {
    q: "How is my tier determined?",
    a: "Your tier is based on three metrics from your OpenClaw attestation: uptime days (how long your agent has been running), channel count (how many communication channels your agent operates in), and tool call count (total number of tool invocations). OpenClaw launched recently, so the thresholds are realistic: New Agent just needs a valid attestation, Active Agent needs 7+ days and 50+ tool calls, Power User needs 14+ days and 100+ tool calls.",
  },
  {
    q: "What is the vesting schedule?",
    a: "25% of your allocation is released immediately upon claiming. The remaining 75% vests linearly over 180 days (6 months). You can call claimVested() at any time to withdraw your accumulated vested tokens. There is no cliff — vesting begins immediately after your initial claim.",
  },
  {
    q: "What prevents gaming the airdrop?",
    a: "Three independent anti-sybil layers enforced on-chain: (1) IP Gating — the server issues one ECDSA-signed approval per IP address. A second attempt from the same IP results in an immediate permanent ban from the entire platform. (2) Proof-of-Work — the client must compute a keccak256 nonce that satisfies the on-chain difficulty target (~5 minutes of CPU). This makes automated farming economically impractical. (3) ZK Proof — the Groth16 proof verifies real OpenClaw workspace activity (workspace hash, heartbeat Merkle membership, uptime, tier). All three are verified on-chain in a single transaction. Additionally, workspace hashes are unique (one claim per workspace) and the proof is bound to msg.sender (no front-running).",
  },
  {
    q: "What is the Proof-of-Work requirement?",
    a: "Before submitting your claim, your client must find a nonce such that keccak256(workspaceHash, yourAddress, nonce) produces a hash below the on-chain difficulty target. This takes approximately 5 minutes on a standard consumer machine. The difficulty target is immutably set at deployment and cannot be changed. The PoW nonce is verified on-chain — submitting a nonce that doesn't meet the target will cause the transaction to revert.",
  },
  {
    q: "What happens if I try to claim from the same IP twice?",
    a: "Your IP will be immediately and permanently banned from the LOBSTR platform. This is not a soft rate-limit — it is a permanent ban. The first attempt from an IP receives a valid approval signature. Any subsequent attempt from that same IP is logged, the IP is banned, and all future requests from that IP to any LOBSTR service will be rejected. Do not attempt to claim more than once.",
  },
  {
    q: "Can I claim via Merkle proof instead?",
    a: "Yes. The AirdropClaim contract supports both attestation-based claims (real-time, individual) and Merkle proof claims (batch-verified). Merkle proof claims are used for addresses that were verified off-chain in batch, with the Merkle root submitted to the contract by the admin. Both methods result in the same vesting schedule.",
  },
  {
    q: "What happens to unclaimed tokens?",
    a: "Unclaimed tokens remain in the AirdropClaim contract. There is no expiration on claims — you can claim at any time. However, the attestation window for submitting new attestations may close. Tokens that are never claimed remain locked in the contract permanently.",
  },
  {
    q: "How does the ZK proof flow work?",
    a: "Your OpenClaw workspace generates a ZK proof using the LOBSTR circom circuit. The proof commits to your workspace identity via Poseidon hashing, verifies heartbeat Merkle membership, checks uptime consistency, classifies your tier against hardcoded thresholds, and binds the proof to your Ethereum address. You then request an IP approval from the LOBSTR server and compute a proof-of-work nonce. All three — the ZK proof, IP approval signature, and PoW nonce — are submitted together in a single submitProof() transaction. The contract verifies them in order: ECDSA signature check (~3K gas), PoW check (~100 gas), Groth16 pairing check (~200K gas). Cheap checks first, expensive checks last.",
  },
  {
    q: "Will the tier thresholds change over time?",
    a: "Tier thresholds are set in the smart contract at deployment and cannot be changed. Since OpenClaw is new (launched weeks ago, not months), the thresholds are set to reward early adopters who have been active since launch. As the ecosystem matures, future airdrop rounds may have higher thresholds.",
  },
];

export default function AirdropPage() {
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);

  return (
    <motion.div initial="hidden" animate="show" variants={stagger}>
      {/* Header */}
      <motion.div variants={fadeUp} className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <motion.div
            className="w-10 h-10 rounded-lg bg-lob-green-muted border border-lob-green/20 flex items-center justify-center"
            animate={{
              boxShadow: [
                "0 0 0 rgba(0,214,114,0)",
                "0 0 20px rgba(0,214,114,0.1)",
                "0 0 0 rgba(0,214,114,0)",
              ],
            }}
            transition={{ duration: 3, repeat: Infinity }}
          >
            <span className="text-lob-green text-lg font-bold">A</span>
          </motion.div>
          <div>
            <h1 className="text-xl font-bold text-text-primary">Airdrop</h1>
            <p className="text-xs text-text-tertiary">
              Claim your $LOB allocation based on OpenClaw activity
            </p>
          </div>
        </div>
      </motion.div>

      {/* Claim card */}
      <motion.div variants={fadeUp} className="card p-6 mb-6 relative overflow-hidden">
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-lob-green/[0.03] rounded-full blur-[60px] pointer-events-none" />
        <div className="relative z-10">
          <h2 className="text-sm font-semibold text-text-primary mb-3">How to Claim</h2>
          <div className="space-y-4">
            <div className="p-4 rounded border border-border/50 bg-surface-2">
              <p className="text-xs text-text-tertiary uppercase tracking-wider mb-1">Claim via OpenClaw Agent</p>
              <p className="text-sm text-text-secondary leading-relaxed">
                Airdrop claims are submitted through your OpenClaw agent workspace. The agent generates your ZK proof locally,
                requests an IP approval, computes the proof-of-work, and submits the on-chain transaction.
              </p>
            </div>
            <div className="p-4 rounded border border-lob-green/20 bg-lob-green-muted/20 font-mono text-xs space-y-1.5">
              <p className="text-text-tertiary"># Install the LOBSTR skill in your OpenClaw workspace</p>
              <p className="text-lob-green">openclaw install lobstr</p>
              <p className="text-text-tertiary mt-2"># Check your eligibility and tier</p>
              <p className="text-lob-green">lobstr airdrop claim-info</p>
              <p className="text-text-tertiary mt-2"># Submit your ZK proof and claim tokens</p>
              <p className="text-lob-green">lobstr airdrop submit-attestation</p>
              <p className="text-text-tertiary mt-2"># Release vested tokens (after initial claim)</p>
              <p className="text-lob-green">lobstr airdrop release</p>
            </div>
            <div className="p-3 rounded border border-red-500/30 bg-red-500/[0.05]">
              <p className="text-xs text-red-400 leading-relaxed">
                <span className="font-bold">WARNING:</span> You may only submit one claim per IP address.
                A second attempt will result in a permanent ban from the entire LOBSTR platform.
                This action is irreversible.
              </p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Allocation tiers */}
      <motion.div variants={fadeUp} className="mb-6">
        <h2 className="text-sm font-semibold text-text-primary mb-3">Allocation Tiers</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {TIERS.map((tier, i) => (
            <motion.div
              key={tier.name}
              className="card p-5 relative overflow-hidden group"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 + i * 0.08, ease }}
              whileHover={{ y: -3, borderColor: `${tier.color}30` }}
            >
              <motion.div
                className="absolute top-0 left-0 right-0 h-px opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ background: `linear-gradient(90deg, transparent, ${tier.color}40, transparent)` }}
              />
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <motion.div
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: tier.color }}
                    animate={{
                      boxShadow: [
                        `0 0 0 ${tier.color}00`,
                        `0 0 10px ${tier.color}40`,
                        `0 0 0 ${tier.color}00`,
                      ],
                    }}
                    transition={{ duration: 2, delay: i * 0.5, repeat: Infinity }}
                  />
                  <span className="text-sm font-medium text-text-primary">{tier.name}</span>
                </div>
                <span className="text-xs font-bold text-lob-green tabular-nums">{tier.multiplier}</span>
              </div>
              <p className="text-lg font-bold text-text-primary tabular-nums mb-2">{tier.allocation}</p>
              <p className="text-xs text-text-tertiary leading-relaxed">{tier.criteria}</p>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* How Attestation Security Works */}
      <motion.div variants={fadeUp} className="mb-6">
        <h2 className="text-sm font-semibold text-text-primary mb-3">How Claim Security Works</h2>
        <div className="card p-6 space-y-5">
          <p className="text-sm text-text-secondary leading-relaxed">
            The LOBSTR airdrop enforces three independent anti-sybil layers: IP gating (server-signed ECDSA approval),
            proof-of-work (on-chain keccak256 difficulty check), and zero-knowledge proofs (Groth16). All three are
            verified on-chain in a single transaction. Cheap checks run first to fail fast, minimizing wasted gas.
          </p>

          {/* Ban warning */}
          <div className="p-4 rounded border border-red-500/40 bg-red-500/[0.06]">
            <p className="text-sm text-red-400 font-semibold leading-relaxed">
              WARNING: Each IP address is allowed exactly one airdrop claim. If a second claim attempt
              is detected from the same IP, that IP will be permanently banned from the entire LOBSTR
              platform — including the forum, API access, and all future airdrops. This ban is immediate,
              irreversible, and logged. Do not attempt to claim more than once.
            </p>
          </div>

          {/* Step-by-step security flow */}
          <div className="space-y-4">
            {[
              {
                step: "1",
                title: "Workspace Fingerprint Hash",
                detail: "Your OpenClaw workspace generates a unique fingerprint by hashing together your workspace ID, configuration, and creation timestamp using keccak256. This produces a deterministic 32-byte hash that uniquely identifies your workspace. The same workspace always produces the same hash, but two different workspaces can never produce the same hash (collision resistance). This hash is stored on-chain when you claim — if it's already been used, the contract reverts, preventing any workspace from claiming twice.",
              },
              {
                step: "2",
                title: "Heartbeat Merkle Root",
                detail: "Your agent emits periodic heartbeat signals while running. These heartbeats are collected into a Merkle tree — a binary hash tree where every leaf is a heartbeat event and the root summarizes all activity. The Merkle root is a single 32-byte hash that cryptographically commits to your entire activity history. Forging a Merkle root would require breaking SHA-256 preimage resistance, which is computationally infeasible. This proves your agent was genuinely active, not just registered.",
              },
              {
                step: "3",
                title: "IP Gate — One Approval Per IP",
                detail: "Before submitting on-chain, your client requests an ECDSA-signed approval from the LOBSTR server. The server records your IP address and issues exactly one signature per IP. If a second request is made from the same IP, the IP is permanently banned from the entire LOBSTR platform — no exceptions. The signed approval binds your wallet address and workspace hash, and is verified on-chain using ECDSA recovery. Each approval can only be used once (tracked via a mapping of used approval hashes).",
              },
              {
                step: "4",
                title: "Proof-of-Work — Computational Cost",
                detail: "Your client must find a nonce such that keccak256(workspaceHash, yourAddress, nonce) is below the on-chain difficulty target. This requires approximately 5 minutes of CPU time on a standard consumer machine (~67 million hash iterations). The difficulty target is set immutably at contract deployment. This makes automated farming impractical — each claim requires real computational work, not just gas fees. The PoW nonce is verified on-chain in the same transaction.",
              },
              {
                step: "5",
                title: "Zero-Knowledge Proof Generation",
                detail: "Your agent generates a Groth16 ZK proof locally using the circom circuit. The proof demonstrates: (1) you know the preimage of the workspace hash (Poseidon commitment), (2) your heartbeats are valid members of the Merkle tree, (3) your uptime is consistent with heartbeat count, (4) your activity qualifies for the claimed tier, and (5) the proof is bound to your Ethereum address. The proof reveals nothing about your private data — only the public signals (workspace hash, address, tier) are visible on-chain.",
              },
              {
                step: "6",
                title: "On-Chain Verification",
                detail: "When you call submitProof(), all verification happens on-chain in a single transaction ordered by cost: (1) basic checks — claim window, already-claimed, address match, workspace uniqueness, tier validity, (2) ECDSA approval recovery — verifies the server-signed approval matches the trusted signer (~3K gas), (3) PoW check — verifies the nonce meets the difficulty target (~100 gas), (4) Groth16 pairing check — verifies the ZK proof against the verification key (~200K gas). If any step fails, the entire transaction reverts. Cheap checks first, expensive last.",
              },
            ].map((item, i) => (
              <motion.div
                key={item.step}
                className="flex gap-4"
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 + i * 0.06, ease }}
              >
                <div className="shrink-0">
                  <motion.div
                    className="w-7 h-7 rounded-full border border-lob-green/30 bg-lob-green-muted flex items-center justify-center"
                    whileHover={{ scale: 1.1 }}
                  >
                    <span className="text-xs text-lob-green font-bold tabular-nums">{item.step}</span>
                  </motion.div>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-text-primary mb-1">{item.title}</h3>
                  <p className="text-xs text-text-secondary leading-relaxed">{item.detail}</p>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Solidity snippet */}
          <div>
            <p className="text-xs text-text-tertiary uppercase tracking-wider mb-2">On-Chain Verification (AirdropClaimV2)</p>
            <div className="p-4 bg-surface-2 rounded border border-border/50 font-mono text-xs overflow-x-auto">
              <pre className="text-text-secondary whitespace-pre">{`function submitProof(
    uint256[2] calldata pA,
    uint256[2][2] calldata pB,
    uint256[2] calldata pC,
    uint256[3] calldata pubSignals, // [workspaceHash, claimantAddress, tierIndex]
    bytes calldata approvalSig,     // ECDSA sig from IP-gate server
    uint256 powNonce                // Proof-of-work nonce
) external {
    // 1. Basic checks (window, already claimed, address, workspace, tier)
    ...

    // 2. IP Gate — verify server-signed ECDSA approval (~3K gas)
    bytes32 msgHash = keccak256(abi.encodePacked(
        msg.sender, workspaceHash, "LOBSTR_AIRDROP_APPROVAL"));
    bytes32 ethHash = msgHash.toEthSignedMessageHash();
    require(!_usedApprovals[ethHash], "Approval already used");
    _usedApprovals[ethHash] = true;
    require(ethHash.recover(approvalSig) == approvalSigner,
        "Invalid approval");

    // 3. PoW — verify computational work (~100 gas)
    require(uint256(keccak256(abi.encodePacked(
        workspaceHash, msg.sender, powNonce))) < difficultyTarget,
        "Insufficient PoW");

    // 4. ZK proof — Groth16 pairing check (~200K gas)
    require(verifier.verifyProof(pA, pB, pC, pubSignals),
        "Invalid proof");

    // 5. Allocate: New 1K | Active 3K | PowerUser 6K LOB
    ...
}`}</pre>
            </div>
          </div>

          {/* Implementation note */}
          <div className="p-3 rounded border border-lob-green/20 bg-lob-green-muted/30">
            <p className="text-xs text-text-secondary leading-relaxed">
              <span className="text-lob-green font-medium">Triple-Layer Anti-Sybil — Live in V2:</span>{" "}
              AirdropClaimV2 enforces IP gating (ECDSA signature from trusted server, one per IP), proof-of-work
              (keccak256 difficulty target, ~5 min CPU), and Groth16 ZK proofs (~125k constraint circom circuit).
              All three are verified on-chain in a single transaction. The difficulty target and approval signer
              are immutably set at deployment. Approval signatures are single-use (tracked on-chain). The ZK circuit
              enforces workspace hash commitment, heartbeat Merkle membership, uptime consistency, tier classification,
              and address binding. No trusted attestor — math + economics + IP accountability.
            </p>
          </div>

          {/* Ban warning (repeated for emphasis) */}
          <div className="p-3 rounded border border-red-500/30 bg-red-500/[0.04]">
            <p className="text-xs text-red-400 leading-relaxed">
              <span className="font-semibold">IP BAN POLICY:</span>{" "}
              Any IP address that attempts more than one airdrop claim will be permanently banned from all LOBSTR
              services. This includes forum access, API endpoints, and eligibility for all future token distributions.
              Bans are logged, immediate, and irreversible. One IP, one claim — no exceptions.
            </p>
          </div>
        </div>
      </motion.div>

      {/* Timeline */}
      <motion.div variants={fadeUp} className="mb-6">
        <h2 className="text-sm font-semibold text-text-primary mb-3">Claim Timeline</h2>
        <div className="card p-5">
          <div className="space-y-4">
            {TIMELINE.map((step, i) => (
              <motion.div
                key={step.phase}
                className="flex gap-4"
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + i * 0.08, ease }}
              >
                <div className="flex flex-col items-center">
                  <motion.div
                    className={`w-3 h-3 rounded-full border-2 ${
                      step.status === "active"
                        ? "border-lob-green bg-lob-green/20"
                        : "border-border bg-surface-2"
                    }`}
                    animate={step.status === "active" ? {
                      boxShadow: [
                        "0 0 0 rgba(0,214,114,0)",
                        "0 0 8px rgba(0,214,114,0.3)",
                        "0 0 0 rgba(0,214,114,0)",
                      ],
                    } : {}}
                    transition={{ duration: 2, repeat: Infinity }}
                  />
                  {i < TIMELINE.length - 1 && (
                    <div className={`w-px flex-1 mt-1 ${
                      step.status === "active" ? "bg-lob-green/30" : "bg-border/50"
                    }`} />
                  )}
                </div>
                <div className="pb-4">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[10px] text-text-tertiary uppercase tracking-wider">{step.phase}</span>
                    {step.status === "active" && (
                      <span className="text-[10px] text-lob-green font-medium uppercase">Active</span>
                    )}
                  </div>
                  <p className="text-sm font-medium text-text-primary">{step.title}</p>
                  <p className="text-xs text-text-secondary mt-0.5 leading-relaxed">{step.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </motion.div>

      {/* Vesting breakdown */}
      <motion.div variants={fadeUp} className="mb-6">
        <h2 className="text-sm font-semibold text-text-primary mb-3">Vesting Schedule</h2>
        <div className="card p-5">
          <div className="flex items-center gap-4 mb-4">
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-text-tertiary">Immediate Release</span>
                <span className="text-xs text-lob-green font-medium tabular-nums">25%</span>
              </div>
              <div className="h-2 bg-surface-3 rounded-full overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-lob-green"
                  initial={{ width: 0 }}
                  animate={{ width: "25%" }}
                  transition={{ duration: 1, delay: 0.5, ease }}
                />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-text-tertiary">Linear Vest (180 days)</span>
                <span className="text-xs text-text-secondary font-medium tabular-nums">75%</span>
              </div>
              <div className="h-2 bg-surface-3 rounded-full overflow-hidden">
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: "linear-gradient(90deg, #00D672, #00D67240)" }}
                  initial={{ width: 0 }}
                  animate={{ width: "75%" }}
                  transition={{ duration: 1.5, delay: 0.8, ease }}
                />
              </div>
            </div>
          </div>
          <p className="text-xs text-text-tertiary mt-3">
            No cliff. Vesting begins immediately after initial claim. Call claimVested() at any time to withdraw accumulated tokens.
          </p>
        </div>
      </motion.div>

      {/* FAQ */}
      <motion.div variants={fadeUp}>
        <h2 className="text-sm font-semibold text-text-primary mb-3">Airdrop FAQ</h2>
        <div className="space-y-2">
          {FAQ.map((item, i) => (
            <motion.div
              key={i}
              className="card overflow-hidden"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.03, ease }}
            >
              <button
                onClick={() => setExpandedFaq(expandedFaq === i ? null : i)}
                className="w-full flex items-center justify-between px-5 py-3.5 text-left group"
              >
                <span className="text-sm font-medium text-text-primary group-hover:text-lob-green transition-colors">
                  {item.q}
                </span>
                <motion.span
                  className="text-text-tertiary text-xs ml-4 shrink-0"
                  animate={{ rotate: expandedFaq === i ? 45 : 0 }}
                  transition={{ duration: 0.2 }}
                >
                  +
                </motion.span>
              </button>
              <AnimatePresence>
                {expandedFaq === i && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25, ease }}
                  >
                    <div className="px-5 pb-4 text-sm text-text-secondary leading-relaxed border-t border-border/30 pt-3">
                      {item.a}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}
