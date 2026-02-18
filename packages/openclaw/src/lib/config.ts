import { ContractAddresses } from '../types';

export interface ChainConfig {
  name: string;
  chainId: number;
  rpc: string;
  explorer: string;
  apiUrl: string;
  contracts: ContractAddresses;
}

export const CHAINS: Record<string, ChainConfig> = {
  'base-sepolia': {
    name: 'Base Sepolia',
    chainId: 84532,
    rpc: 'https://sepolia.base.org',
    explorer: 'https://sepolia.basescan.org',
    apiUrl: 'https://lobstr.gg',
    contracts: {
      lobToken: '0x6024B53f6f8afD433dc434D95be42A45Ed9b4a59',
      reputationSystem: '0xbbBd9c388b6bdCA4772bC5297f4E72d76d5fE21C',
      stakingManager: '0x0c8390c6ef1a7Dd07Cc2bE9C0C06D49FC5439c58',
      serviceRegistry: '0xa309769426C90f27Cc32E62BdBF6313E35c5c660',
      disputeArbitration: '0x0060D7828ace2B594Bb5e56F80d7757BC473cf72',
      escrowEngine: '0x072EdB0526027A48f6A2aC5CeE3A5375142Bedc0',
      airdropClaimV2: '0x91B4b01173C74cb16EE2997f8449FdEE254F81e2',
      treasuryGovernor: '0x0000000000000000000000000000000000000000',
      sybilGuard: '0x0000000000000000000000000000000000000000',
    },
  },
  base: {
    name: 'Base',
    chainId: 8453,
    rpc: 'https://mainnet.base.org',
    explorer: 'https://basescan.org',
    apiUrl: 'https://lobstr.gg',
    contracts: {
      lobToken: '0x7FaeC2536E2Afee56AcA568C475927F1E2521B37',
      reputationSystem: '0xc1374611FB7c6637e30a274073e7dCFf758C76FC',
      stakingManager: '0x0c5bC27a3C3Eb7a836302320755f6B1645C49291',
      serviceRegistry: '0xa127B684935f1D24C7236ba1FbB3FF140F4eD3C3',
      disputeArbitration: '0x00Ad7d299F4BF3aE8372f756b86B4dAf63eC3FAa',
      escrowEngine: '0xBB57d0D0aB24122A87c9a28acdc242927e6189E0',
      airdropClaimV2: '0x349790d7f56110765Fccd86790B584c423c0BaA9',
      treasuryGovernor: '0x9576dcf9909ec192FC136A12De293Efab911517f',
      sybilGuard: '0xF43E6698cAAf3BFf422137F20541Cd24dfB3ff07',
    },
  },
};

export const DEFAULT_CHAIN = 'base';

export const OPENCLAW_DIR = '.openclaw';
