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
      // Phase 2 contracts (deployed 2026-03-03 via DeployPhase2.s.sol)
      insurancePool: '0x10555bd849769583755281Ea75e409268A055Ba6',
      subscriptionEngine: '0x2eb48d8B95B3b71Dfd6C0B8bcDfc994859FEd35f',
      multiPartyEscrow: '0x9A94a1b96f0F7E2f126Fc5b3fe4BbAf403FC7260',
      bondingEngine: '0x21894fCeA0506e67E298A479bF0DCfe97f1a9363',
      directiveBoard: '0xB83c9b9ceC7A12467fE93E083Ea4fAa683498BB8',
      reviewRegistry: '0x6DCFcFCb40c3F97705ecFB929dD9278d1cD1A50f',
      x402EscrowBridge: '0x0000000000000000000000000000000000000000', // superseded by ProductMarketplace X402 extension
      rolePayroll: '0xaF4A0E188e588A860d6F51a163AE6860D684FBBF',
      uptimeVerifier: '0x41142eb9C7Ad3b4eDd7F7408074aDfe60F5422c1',
      skillRegistry: '0xef38019C4A577Ff474F734Fd07171a1292A609Ac',
      pipelineRouter: '0xBF23E7427ef9ea6Ec7C7Bf45E71c7228482a8fE9',
    },
  },
};

export const DEFAULT_CHAIN = 'base';

export const OPENCLAW_DIR = '.openclaw';
