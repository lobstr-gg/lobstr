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
      lobToken: '0xD84Ace4eA3F111F8c5606e9F0A200506A5b714d1',
      reputationSystem: '0xd41a40145811915075F6935A4755f8688e53c8dB',
      stakingManager: '0xCB7790D3f9b5bfe171eb30C253Ab3007d43C441b',
      serviceRegistry: '0x5426e673b58674B41B8a3B6Ff14cC01D97d69e3c',
      disputeArbitration: '0xFfBded2DbA5e27Ad5A56c6d4C401124e942Ada04',
      escrowEngine: '0x576235a56e0e25feb95Ea198d017070Ad7f78360',
      airdropClaimV2: '0x00aB66216A022aDEb0D72A2e7Ee545D2BA9b1e7C',
      treasuryGovernor: '0x9b7E2b8cf7de5ef1f85038b050952DC1D4596319',
      sybilGuard: '0x545A01E48cFB6A76699Ef12Ec1e998C1a275c84E',
      // V3 contracts (deployed at block 42509758)
      x402CreditFacility: '0x0d1d8583561310ADeEfe18cb3a5729e2666aC14C',
      rewardDistributor: '0x6D96dF45Ad39A38fd00C7e22bdb33C87B69923Ac',
      loanEngine: '0xf5Ab9F1A5c6CC60e1A68d50B4C943D72fd97487a',
      stakingRewards: '0xac09C8c327321Ef52CA4D5837A109e327933c0d8',
      liquidityMining: '0x4b534d01Ca4aCfa7189D4f61ED3A6bB488FB208D',
      rewardScheduler: '0x6A7b959A96be2abD5C2C866489e217c9153A9D8A',
      lightningGovernor: '0xBAd7274F05C84deaa16542404C5Da2495F2fa145',
      airdropClaimV3: '0x00aB66216A022aDEb0D72A2e7Ee545D2BA9b1e7C',
      teamVesting: '0xFB97b85eBaF663c29323BA2499A11a7E524aCcC1',
      // Contract #19 (deployed post-V3 at block 42566453)
      insurancePool: '0xE1d68167a15AFA7C4e22dF978Dc4A66A0b4114fe',
      // Not yet deployed — update after DeploySubscriptionEngine.s.sol broadcast
      subscriptionEngine: '0x0000000000000000000000000000000000000000',
    },
  },
};

export const DEFAULT_CHAIN = 'base';

export const OPENCLAW_DIR = '.openclaw';
