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
      // V4 contracts (deployed at block 42598375)
      lobToken: '0x6a9ebf62c198c252be0c814224518b2def93a937',
      reputationSystem: '0x21e96019dd46e07b694ee28999b758e3c156b7c2',
      stakingManager: '0x7fd4cb4b4ed7446bfd319d80f5bb6b8aeed6e408',
      serviceRegistry: '0xcfbdfad104b8339187af3d84290b59647cf4da74',
      disputeArbitration: '0x5a5c510db582546ef17177a62a604cbafceba672',
      escrowEngine: '0xada65391bb0e1c7db6e0114b3961989f3f3221a1',
      airdropClaimV2: '0xc7917624fa0cf6f4973b887de5e670d7661ef297',
      treasuryGovernor: '0x905f8b6bd8264cca4d7f5a5b834af45a1b9fce27',
      sybilGuard: '0xb216314338f291a0458e1d469c1c904ec65f1b21',
      x402CreditFacility: '0x124dd81b5d0e903704e5854a6fbc2dc8f954e6ca',
      rewardDistributor: '0xeb8b276fccbb982c55d1a18936433ed875783ffe',
      loanEngine: '0x472ec915cd56ef94e0a163a74176ef9a336cdbe9',
      stakingRewards: '0xfe5ca8efb8a79e8ef22c5a2c4e43f7592fa93323',
      liquidityMining: '0x0000000000000000000000000000000000000000',
      rewardScheduler: '0x0000000000000000000000000000000000000000',
      lightningGovernor: '0xcae6aec8d63479bde5c0969241c959b402f5647d',
      airdropClaimV3: '0xc7917624fa0cf6f4973b887de5e670d7661ef297',
      teamVesting: '0x053945d387b80b92f7a9e6b3c8c25beb41bdf14d',
      insurancePool: '0xe01d6085344b1d90b81c7ba4e7ff3023d609bb65',
      subscriptionEngine: '0x90d2a7737633eb0191d2c95bc764f596a0be9912',
      multiPartyEscrow: '0x9812384d366337390dbaeb192582d6dab989319d',
      bondingEngine: '0xb6d23b546921cce8e4494ae6ec62722930d6547e',
      directiveBoard: '0xa30a2da1016a6beb573f4d4529a0f68257ed0aed',
      reviewRegistry: '0x8d8e0e86a704cecc7614abe4ad447112f2c72e3d',
      x402EscrowBridge: '0x62baf62c541fa1c1d11c4a9dad733db47485ca12',
      rolePayroll: '0xc1cd28c36567869534690b992d94e58daee736ab',
      uptimeVerifier: '0xea24fbedab58f1552962a41eed436c96a7116571',
      skillRegistry: '0x0000000000000000000000000000000000000000',
    },
  },
};

export const DEFAULT_CHAIN = 'base';

export const OPENCLAW_DIR = '.openclaw';
