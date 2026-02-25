import { getPoseidon } from './poseidon';

const TREE_DEPTH = 8;
const TREE_SIZE = 1 << TREE_DEPTH; // 256

export interface MerkleTree {
  root: bigint;
  layers: bigint[][];
  getProof: (leafIndex: number) => { pathElements: bigint[]; pathIndices: number[] };
}

/**
 * Build a depth-8 Poseidon Merkle tree from leaves.
 * Matches the algorithm in packages/circuits/test/airdropAttestation.test.ts exactly.
 */
export async function buildMerkleTree(leaves: bigint[]): Promise<MerkleTree> {
  const { poseidon, F } = await getPoseidon();

  // Pad leaves to tree size
  const paddedLeaves = [...leaves];
  while (paddedLeaves.length < TREE_SIZE) {
    paddedLeaves.push(BigInt(0));
  }

  // Build tree bottom-up
  const layers: bigint[][] = [paddedLeaves];
  for (let d = 0; d < TREE_DEPTH; d++) {
    const prev = layers[d];
    const next: bigint[] = [];
    for (let i = 0; i < prev.length; i += 2) {
      next.push(F.toObject(poseidon([prev[i], prev[i + 1]])));
    }
    layers.push(next);
  }

  const root = layers[TREE_DEPTH][0];

  function getProof(leafIndex: number) {
    const pathElements: bigint[] = [];
    const pathIndices: number[] = [];

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
