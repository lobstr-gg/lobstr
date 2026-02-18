// Singleton async Poseidon hasher from circomlibjs
let poseidonInstance: any = null;
let fieldInstance: any = null;

export async function getPoseidon(): Promise<{ poseidon: any; F: any }> {
  if (!poseidonInstance) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { buildPoseidon } = require('circomlibjs');
    poseidonInstance = await buildPoseidon();
    fieldInstance = poseidonInstance.F;
  }
  return { poseidon: poseidonInstance, F: fieldInstance };
}

export async function poseidonHash(inputs: bigint[]): Promise<bigint> {
  const { poseidon, F } = await getPoseidon();
  return F.toObject(poseidon(inputs));
}
