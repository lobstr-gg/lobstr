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
      lobToken: '0xD2E0C513f70f0DdEF5f3EC9296cE3B5eB2799c5E',
      reputationSystem: '0x80aB3BE1A18D6D9c79fD09B85ddA8cB6A280EAAd',
      stakingManager: '0xcd9d96c85b4Cd4E91d340C3F69aAd80c3cb3d413',
      serviceRegistry: '0xCa8a4528a7a4c693C19AaB3f39a555150E31013E',
      disputeArbitration: '0xF5FDA5446d44505667F7eA58B0dca687c7F82b81',
      escrowEngine: '0xd8654D79C21Fb090Ef30C901db530b127Ef82b4E',
      airdropClaimV2: '0x7f4D513119A2b8cCefE1AfB22091062B54866EbA',
      treasuryGovernor: '0x66561329C973E8fEe8757002dA275ED1FEa56B95',
      sybilGuard: '0xd45202b192676BA94Df9C36bA4fF5c63cE001381',
      // V5 proxy contracts (Core protocol)
      x402CreditFacility: '0x86718b82Af266719E493a49e248438DC6F07911a',
      rewardDistributor: '0xf181A69519684616460b36db44fE4A3A4f3cD913',
      loanEngine: '0x2F712Fb743Ee42D37371f245F5E0e7FECBEF7454',
      stakingRewards: '0x723f8483731615350D2C694CBbA027eBC2953B39',
      liquidityMining: '0x0000000000000000000000000000000000000000',
      rewardScheduler: '0x0000000000000000000000000000000000000000',
      lightningGovernor: '0xCB3E0BD70686fF1b28925aD55A8044b1b944951c',
      airdropClaimV3: '0x7f4D513119A2b8cCefE1AfB22091062B54866EbA',
      teamVesting: '0x71BC320F7F5FDdEaf52a18449108021c71365d35',
      // Phase 2 contracts not yet redeployed (V5)
      insurancePool: '0x0000000000000000000000000000000000000000',
      subscriptionEngine: '0x0000000000000000000000000000000000000000',
      multiPartyEscrow: '0x0000000000000000000000000000000000000000',
      bondingEngine: '0x0000000000000000000000000000000000000000',
      directiveBoard: '0x0000000000000000000000000000000000000000',
      reviewRegistry: '0x0000000000000000000000000000000000000000',
      x402EscrowBridge: '0x0000000000000000000000000000000000000000',
      rolePayroll: '0x0000000000000000000000000000000000000000',
      uptimeVerifier: '0x07dFaC8Ae61E5460Fc768d1c925476b4A4693C64',
      skillRegistry: '0x0000000000000000000000000000000000000000',
    },
  },
};

export const DEFAULT_CHAIN = 'base';

export const OPENCLAW_DIR = '.openclaw';
