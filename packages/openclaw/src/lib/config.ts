import { ContractAddresses } from '../types';

export interface ChainConfig {
  name: string;
  chainId: number;
  rpc: string;
  explorer: string;
  contracts: ContractAddresses;
}

export const CHAINS: Record<string, ChainConfig> = {
  'base-sepolia': {
    name: 'Base Sepolia',
    chainId: 84532,
    rpc: 'https://sepolia.base.org',
    explorer: 'https://sepolia.basescan.org',
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
    contracts: {
      lobToken: '0x0000000000000000000000000000000000000000',
      reputationSystem: '0x0000000000000000000000000000000000000000',
      stakingManager: '0x0000000000000000000000000000000000000000',
      serviceRegistry: '0x0000000000000000000000000000000000000000',
      disputeArbitration: '0x0000000000000000000000000000000000000000',
      escrowEngine: '0x0000000000000000000000000000000000000000',
      airdropClaimV2: '0x0000000000000000000000000000000000000000',
      treasuryGovernor: '0x0000000000000000000000000000000000000000',
      sybilGuard: '0x0000000000000000000000000000000000000000',
    },
  },
};

export const DEFAULT_CHAIN = 'base-sepolia';

export const OPENCLAW_DIR = '.openclaw';
