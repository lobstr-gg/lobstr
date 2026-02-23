export const LOBTokenABI = [
  {
    "type": "constructor",
    "inputs": [
      { "name": "distributionAddress", "type": "address", "internalType": "address" }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "TOTAL_SUPPLY",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "allowance",
    "inputs": [
      { "name": "owner", "type": "address", "internalType": "address" },
      { "name": "spender", "type": "address", "internalType": "address" }
    ],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "approve",
    "inputs": [
      { "name": "spender", "type": "address", "internalType": "address" },
      { "name": "amount", "type": "uint256", "internalType": "uint256" }
    ],
    "outputs": [{ "name": "", "type": "bool", "internalType": "bool" }],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "balanceOf",
    "inputs": [
      { "name": "account", "type": "address", "internalType": "address" }
    ],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "decimals",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint8", "internalType": "uint8" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "decreaseAllowance",
    "inputs": [
      { "name": "spender", "type": "address", "internalType": "address" },
      { "name": "subtractedValue", "type": "uint256", "internalType": "uint256" }
    ],
    "outputs": [{ "name": "", "type": "bool", "internalType": "bool" }],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "increaseAllowance",
    "inputs": [
      { "name": "spender", "type": "address", "internalType": "address" },
      { "name": "addedValue", "type": "uint256", "internalType": "uint256" }
    ],
    "outputs": [{ "name": "", "type": "bool", "internalType": "bool" }],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "name",
    "inputs": [],
    "outputs": [{ "name": "", "type": "string", "internalType": "string" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "symbol",
    "inputs": [],
    "outputs": [{ "name": "", "type": "string", "internalType": "string" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "totalSupply",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "transfer",
    "inputs": [
      { "name": "to", "type": "address", "internalType": "address" },
      { "name": "amount", "type": "uint256", "internalType": "uint256" }
    ],
    "outputs": [{ "name": "", "type": "bool", "internalType": "bool" }],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "transferFrom",
    "inputs": [
      { "name": "from", "type": "address", "internalType": "address" },
      { "name": "to", "type": "address", "internalType": "address" },
      { "name": "amount", "type": "uint256", "internalType": "uint256" }
    ],
    "outputs": [{ "name": "", "type": "bool", "internalType": "bool" }],
    "stateMutability": "nonpayable"
  },
  {
    "type": "event",
    "name": "Approval",
    "inputs": [
      { "name": "owner", "type": "address", "indexed": true, "internalType": "address" },
      { "name": "spender", "type": "address", "indexed": true, "internalType": "address" },
      { "name": "value", "type": "uint256", "indexed": false, "internalType": "uint256" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Transfer",
    "inputs": [
      { "name": "from", "type": "address", "indexed": true, "internalType": "address" },
      { "name": "to", "type": "address", "indexed": true, "internalType": "address" },
      { "name": "value", "type": "uint256", "indexed": false, "internalType": "uint256" }
    ],
    "anonymous": false
  }
] as const;

export const StakingManagerABI = [
  {
    "type": "constructor",
    "inputs": [
      { "name": "_lobToken", "type": "address", "internalType": "address" }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "BRONZE_THRESHOLD",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "DEFAULT_ADMIN_ROLE",
    "inputs": [],
    "outputs": [{ "name": "", "type": "bytes32", "internalType": "bytes32" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "GOLD_THRESHOLD",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "PLATINUM_THRESHOLD",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "SILVER_THRESHOLD",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "SLASHER_ROLE",
    "inputs": [],
    "outputs": [{ "name": "", "type": "bytes32", "internalType": "bytes32" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "UNSTAKE_COOLDOWN",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getRoleAdmin",
    "inputs": [
      { "name": "role", "type": "bytes32", "internalType": "bytes32" }
    ],
    "outputs": [{ "name": "", "type": "bytes32", "internalType": "bytes32" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getStake",
    "inputs": [
      { "name": "user", "type": "address", "internalType": "address" }
    ],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getStakeInfo",
    "inputs": [
      { "name": "user", "type": "address", "internalType": "address" }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct IStakingManager.StakeInfo",
        "components": [
          { "name": "amount", "type": "uint256", "internalType": "uint256" },
          { "name": "unstakeRequestTime", "type": "uint256", "internalType": "uint256" },
          { "name": "unstakeRequestAmount", "type": "uint256", "internalType": "uint256" }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getTier",
    "inputs": [
      { "name": "user", "type": "address", "internalType": "address" }
    ],
    "outputs": [{ "name": "", "type": "uint8", "internalType": "enum IStakingManager.Tier" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "grantRole",
    "inputs": [
      { "name": "role", "type": "bytes32", "internalType": "bytes32" },
      { "name": "account", "type": "address", "internalType": "address" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "hasRole",
    "inputs": [
      { "name": "role", "type": "bytes32", "internalType": "bytes32" },
      { "name": "account", "type": "address", "internalType": "address" }
    ],
    "outputs": [{ "name": "", "type": "bool", "internalType": "bool" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "lobToken",
    "inputs": [],
    "outputs": [{ "name": "", "type": "address", "internalType": "contract IERC20" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "maxListings",
    "inputs": [
      { "name": "tier", "type": "uint8", "internalType": "enum IStakingManager.Tier" }
    ],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "pure"
  },
  {
    "type": "function",
    "name": "renounceRole",
    "inputs": [
      { "name": "role", "type": "bytes32", "internalType": "bytes32" },
      { "name": "account", "type": "address", "internalType": "address" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "requestUnstake",
    "inputs": [
      { "name": "amount", "type": "uint256", "internalType": "uint256" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "revokeRole",
    "inputs": [
      { "name": "role", "type": "bytes32", "internalType": "bytes32" },
      { "name": "account", "type": "address", "internalType": "address" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "slash",
    "inputs": [
      { "name": "user", "type": "address", "internalType": "address" },
      { "name": "amount", "type": "uint256", "internalType": "uint256" },
      { "name": "beneficiary", "type": "address", "internalType": "address" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "stake",
    "inputs": [
      { "name": "amount", "type": "uint256", "internalType": "uint256" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "supportsInterface",
    "inputs": [
      { "name": "interfaceId", "type": "bytes4", "internalType": "bytes4" }
    ],
    "outputs": [{ "name": "", "type": "bool", "internalType": "bool" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "tierThreshold",
    "inputs": [
      { "name": "tier", "type": "uint8", "internalType": "enum IStakingManager.Tier" }
    ],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "pure"
  },
  {
    "type": "function",
    "name": "unstake",
    "inputs": [],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "event",
    "name": "RoleAdminChanged",
    "inputs": [
      { "name": "role", "type": "bytes32", "indexed": true, "internalType": "bytes32" },
      { "name": "previousAdminRole", "type": "bytes32", "indexed": true, "internalType": "bytes32" },
      { "name": "newAdminRole", "type": "bytes32", "indexed": true, "internalType": "bytes32" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "RoleGranted",
    "inputs": [
      { "name": "role", "type": "bytes32", "indexed": true, "internalType": "bytes32" },
      { "name": "account", "type": "address", "indexed": true, "internalType": "address" },
      { "name": "sender", "type": "address", "indexed": true, "internalType": "address" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "RoleRevoked",
    "inputs": [
      { "name": "role", "type": "bytes32", "indexed": true, "internalType": "bytes32" },
      { "name": "account", "type": "address", "indexed": true, "internalType": "address" },
      { "name": "sender", "type": "address", "indexed": true, "internalType": "address" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Slashed",
    "inputs": [
      { "name": "user", "type": "address", "indexed": true, "internalType": "address" },
      { "name": "amount", "type": "uint256", "indexed": false, "internalType": "uint256" },
      { "name": "beneficiary", "type": "address", "indexed": true, "internalType": "address" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Staked",
    "inputs": [
      { "name": "user", "type": "address", "indexed": true, "internalType": "address" },
      { "name": "amount", "type": "uint256", "indexed": false, "internalType": "uint256" },
      { "name": "newTier", "type": "uint8", "indexed": false, "internalType": "enum IStakingManager.Tier" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "TierChanged",
    "inputs": [
      { "name": "user", "type": "address", "indexed": true, "internalType": "address" },
      { "name": "oldTier", "type": "uint8", "indexed": false, "internalType": "enum IStakingManager.Tier" },
      { "name": "newTier", "type": "uint8", "indexed": false, "internalType": "enum IStakingManager.Tier" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "UnstakeRequested",
    "inputs": [
      { "name": "user", "type": "address", "indexed": true, "internalType": "address" },
      { "name": "amount", "type": "uint256", "indexed": false, "internalType": "uint256" },
      { "name": "availableAt", "type": "uint256", "indexed": false, "internalType": "uint256" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Unstaked",
    "inputs": [
      { "name": "user", "type": "address", "indexed": true, "internalType": "address" },
      { "name": "amount", "type": "uint256", "indexed": false, "internalType": "uint256" },
      { "name": "newTier", "type": "uint8", "indexed": false, "internalType": "enum IStakingManager.Tier" }
    ],
    "anonymous": false
  }
] as const;

export const ReputationSystemABI = [
  {
    "type": "constructor",
    "inputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "BASE_SCORE",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "COMPLETION_POINTS",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "DEFAULT_ADMIN_ROLE",
    "inputs": [],
    "outputs": [{ "name": "", "type": "bytes32", "internalType": "bytes32" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "DISPUTE_LOSS_PENALTY",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "DISPUTE_WIN_BONUS",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "FAST_DELIVERY_BONUS",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "GOLD_THRESHOLD",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "MAX_TENURE_BONUS",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "PLATINUM_THRESHOLD",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "RECORDER_ROLE",
    "inputs": [],
    "outputs": [{ "name": "", "type": "bytes32", "internalType": "bytes32" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "SILVER_THRESHOLD",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "TENURE_POINTS_PER_30_DAYS",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getReputationData",
    "inputs": [
      { "name": "user", "type": "address", "internalType": "address" }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct IReputationSystem.ReputationData",
        "components": [
          { "name": "score", "type": "uint256", "internalType": "uint256" },
          { "name": "completions", "type": "uint256", "internalType": "uint256" },
          { "name": "disputesLost", "type": "uint256", "internalType": "uint256" },
          { "name": "disputesWon", "type": "uint256", "internalType": "uint256" },
          { "name": "firstActivityTimestamp", "type": "uint256", "internalType": "uint256" }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getRoleAdmin",
    "inputs": [
      { "name": "role", "type": "bytes32", "internalType": "bytes32" }
    ],
    "outputs": [{ "name": "", "type": "bytes32", "internalType": "bytes32" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getScore",
    "inputs": [
      { "name": "user", "type": "address", "internalType": "address" }
    ],
    "outputs": [
      { "name": "score", "type": "uint256", "internalType": "uint256" },
      { "name": "tier", "type": "uint8", "internalType": "enum IReputationSystem.ReputationTier" }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "grantRole",
    "inputs": [
      { "name": "role", "type": "bytes32", "internalType": "bytes32" },
      { "name": "account", "type": "address", "internalType": "address" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "hasRole",
    "inputs": [
      { "name": "role", "type": "bytes32", "internalType": "bytes32" },
      { "name": "account", "type": "address", "internalType": "address" }
    ],
    "outputs": [{ "name": "", "type": "bool", "internalType": "bool" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "recordCompletion",
    "inputs": [
      { "name": "provider", "type": "address", "internalType": "address" },
      { "name": "client", "type": "address", "internalType": "address" },
      { "name": "deliveryTime", "type": "uint256", "internalType": "uint256" },
      { "name": "estimatedTime", "type": "uint256", "internalType": "uint256" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "recordDispute",
    "inputs": [
      { "name": "provider", "type": "address", "internalType": "address" },
      { "name": "providerWon", "type": "bool", "internalType": "bool" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "renounceRole",
    "inputs": [
      { "name": "role", "type": "bytes32", "internalType": "bytes32" },
      { "name": "account", "type": "address", "internalType": "address" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "revokeRole",
    "inputs": [
      { "name": "role", "type": "bytes32", "internalType": "bytes32" },
      { "name": "account", "type": "address", "internalType": "address" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "supportsInterface",
    "inputs": [
      { "name": "interfaceId", "type": "bytes4", "internalType": "bytes4" }
    ],
    "outputs": [{ "name": "", "type": "bool", "internalType": "bool" }],
    "stateMutability": "view"
  },
  {
    "type": "event",
    "name": "CompletionRecorded",
    "inputs": [
      { "name": "provider", "type": "address", "indexed": true, "internalType": "address" },
      { "name": "client", "type": "address", "indexed": true, "internalType": "address" },
      { "name": "deliveryTime", "type": "uint256", "indexed": false, "internalType": "uint256" },
      { "name": "estimatedTime", "type": "uint256", "indexed": false, "internalType": "uint256" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "RoleAdminChanged",
    "inputs": [
      { "name": "role", "type": "bytes32", "indexed": true, "internalType": "bytes32" },
      { "name": "previousAdminRole", "type": "bytes32", "indexed": true, "internalType": "bytes32" },
      { "name": "newAdminRole", "type": "bytes32", "indexed": true, "internalType": "bytes32" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "RoleGranted",
    "inputs": [
      { "name": "role", "type": "bytes32", "indexed": true, "internalType": "bytes32" },
      { "name": "account", "type": "address", "indexed": true, "internalType": "address" },
      { "name": "sender", "type": "address", "indexed": true, "internalType": "address" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "RoleRevoked",
    "inputs": [
      { "name": "role", "type": "bytes32", "indexed": true, "internalType": "bytes32" },
      { "name": "account", "type": "address", "indexed": true, "internalType": "address" },
      { "name": "sender", "type": "address", "indexed": true, "internalType": "address" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ScoreUpdated",
    "inputs": [
      { "name": "user", "type": "address", "indexed": true, "internalType": "address" },
      { "name": "newScore", "type": "uint256", "indexed": false, "internalType": "uint256" },
      { "name": "newTier", "type": "uint8", "indexed": false, "internalType": "enum IReputationSystem.ReputationTier" }
    ],
    "anonymous": false
  }
] as const;

export const ServiceRegistryABI = [
  {
    "type": "constructor",
    "inputs": [
      { "name": "_stakingManager", "type": "address", "internalType": "address" },
      { "name": "_reputationSystem", "type": "address", "internalType": "address" }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "DEFAULT_ADMIN_ROLE",
    "inputs": [],
    "outputs": [{ "name": "", "type": "bytes32", "internalType": "bytes32" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "createListing",
    "inputs": [
      { "name": "category", "type": "uint8", "internalType": "enum IServiceRegistry.ServiceCategory" },
      { "name": "title", "type": "string", "internalType": "string" },
      { "name": "description", "type": "string", "internalType": "string" },
      { "name": "pricePerUnit", "type": "uint256", "internalType": "uint256" },
      { "name": "settlementToken", "type": "address", "internalType": "address" },
      { "name": "estimatedDeliverySeconds", "type": "uint256", "internalType": "uint256" },
      { "name": "metadataURI", "type": "string", "internalType": "string" }
    ],
    "outputs": [{ "name": "listingId", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "deactivateListing",
    "inputs": [
      { "name": "listingId", "type": "uint256", "internalType": "uint256" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "getListing",
    "inputs": [
      { "name": "listingId", "type": "uint256", "internalType": "uint256" }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct IServiceRegistry.Listing",
        "components": [
          { "name": "id", "type": "uint256", "internalType": "uint256" },
          { "name": "provider", "type": "address", "internalType": "address" },
          { "name": "category", "type": "uint8", "internalType": "enum IServiceRegistry.ServiceCategory" },
          { "name": "title", "type": "string", "internalType": "string" },
          { "name": "description", "type": "string", "internalType": "string" },
          { "name": "pricePerUnit", "type": "uint256", "internalType": "uint256" },
          { "name": "settlementToken", "type": "address", "internalType": "address" },
          { "name": "estimatedDeliverySeconds", "type": "uint256", "internalType": "uint256" },
          { "name": "metadataURI", "type": "string", "internalType": "string" },
          { "name": "active", "type": "bool", "internalType": "bool" },
          { "name": "createdAt", "type": "uint256", "internalType": "uint256" }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getProviderListingCount",
    "inputs": [
      { "name": "provider", "type": "address", "internalType": "address" }
    ],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getRoleAdmin",
    "inputs": [
      { "name": "role", "type": "bytes32", "internalType": "bytes32" }
    ],
    "outputs": [{ "name": "", "type": "bytes32", "internalType": "bytes32" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "grantRole",
    "inputs": [
      { "name": "role", "type": "bytes32", "internalType": "bytes32" },
      { "name": "account", "type": "address", "internalType": "address" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "hasRole",
    "inputs": [
      { "name": "role", "type": "bytes32", "internalType": "bytes32" },
      { "name": "account", "type": "address", "internalType": "address" }
    ],
    "outputs": [{ "name": "", "type": "bool", "internalType": "bool" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "renounceRole",
    "inputs": [
      { "name": "role", "type": "bytes32", "internalType": "bytes32" },
      { "name": "account", "type": "address", "internalType": "address" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "reputationSystem",
    "inputs": [],
    "outputs": [{ "name": "", "type": "address", "internalType": "contract IReputationSystem" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "revokeRole",
    "inputs": [
      { "name": "role", "type": "bytes32", "internalType": "bytes32" },
      { "name": "account", "type": "address", "internalType": "address" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "stakingManager",
    "inputs": [],
    "outputs": [{ "name": "", "type": "address", "internalType": "contract IStakingManager" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "supportsInterface",
    "inputs": [
      { "name": "interfaceId", "type": "bytes4", "internalType": "bytes4" }
    ],
    "outputs": [{ "name": "", "type": "bool", "internalType": "bool" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "updateListing",
    "inputs": [
      { "name": "listingId", "type": "uint256", "internalType": "uint256" },
      { "name": "title", "type": "string", "internalType": "string" },
      { "name": "description", "type": "string", "internalType": "string" },
      { "name": "pricePerUnit", "type": "uint256", "internalType": "uint256" },
      { "name": "settlementToken", "type": "address", "internalType": "address" },
      { "name": "estimatedDeliverySeconds", "type": "uint256", "internalType": "uint256" },
      { "name": "metadataURI", "type": "string", "internalType": "string" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "event",
    "name": "ListingCreated",
    "inputs": [
      { "name": "listingId", "type": "uint256", "indexed": true, "internalType": "uint256" },
      { "name": "provider", "type": "address", "indexed": true, "internalType": "address" },
      { "name": "category", "type": "uint8", "indexed": false, "internalType": "enum IServiceRegistry.ServiceCategory" },
      { "name": "pricePerUnit", "type": "uint256", "indexed": false, "internalType": "uint256" },
      { "name": "settlementToken", "type": "address", "indexed": false, "internalType": "address" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ListingDeactivated",
    "inputs": [
      { "name": "listingId", "type": "uint256", "indexed": true, "internalType": "uint256" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ListingUpdated",
    "inputs": [
      { "name": "listingId", "type": "uint256", "indexed": true, "internalType": "uint256" },
      { "name": "pricePerUnit", "type": "uint256", "indexed": false, "internalType": "uint256" },
      { "name": "settlementToken", "type": "address", "indexed": false, "internalType": "address" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "RoleAdminChanged",
    "inputs": [
      { "name": "role", "type": "bytes32", "indexed": true, "internalType": "bytes32" },
      { "name": "previousAdminRole", "type": "bytes32", "indexed": true, "internalType": "bytes32" },
      { "name": "newAdminRole", "type": "bytes32", "indexed": true, "internalType": "bytes32" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "RoleGranted",
    "inputs": [
      { "name": "role", "type": "bytes32", "indexed": true, "internalType": "bytes32" },
      { "name": "account", "type": "address", "indexed": true, "internalType": "address" },
      { "name": "sender", "type": "address", "indexed": true, "internalType": "address" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "RoleRevoked",
    "inputs": [
      { "name": "role", "type": "bytes32", "indexed": true, "internalType": "bytes32" },
      { "name": "account", "type": "address", "indexed": true, "internalType": "address" },
      { "name": "sender", "type": "address", "indexed": true, "internalType": "address" }
    ],
    "anonymous": false
  }
] as const;

export const DisputeArbitrationABI = [
  {
    "type": "constructor",
    "inputs": [
      { "name": "_lobToken", "type": "address", "internalType": "address" },
      { "name": "_stakingManager", "type": "address", "internalType": "address" },
      { "name": "_reputationSystem", "type": "address", "internalType": "address" }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "COUNTER_EVIDENCE_WINDOW",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "DEFAULT_ADMIN_ROLE",
    "inputs": [],
    "outputs": [{ "name": "", "type": "bytes32", "internalType": "bytes32" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "ESCROW_ROLE",
    "inputs": [],
    "outputs": [{ "name": "", "type": "bytes32", "internalType": "bytes32" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "JUNIOR_FEE_BPS",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "JUNIOR_MAX_DISPUTE",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "JUNIOR_THRESHOLD",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "PRINCIPAL_FEE_BPS",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "PRINCIPAL_THRESHOLD",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "SENIOR_FEE_BPS",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "SENIOR_MAX_DISPUTE",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "SENIOR_THRESHOLD",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "SLASH_DISTRIBUTION_BPS",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "SLASH_MIN_BPS",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "advanceToVoting",
    "inputs": [
      { "name": "disputeId", "type": "uint256", "internalType": "uint256" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "executeRuling",
    "inputs": [
      { "name": "disputeId", "type": "uint256", "internalType": "uint256" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "getActiveArbitratorCount",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getArbitratorInfo",
    "inputs": [
      { "name": "arbitrator", "type": "address", "internalType": "address" }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct IDisputeArbitration.ArbitratorInfo",
        "components": [
          { "name": "stake", "type": "uint256", "internalType": "uint256" },
          { "name": "rank", "type": "uint8", "internalType": "enum IDisputeArbitration.ArbitratorRank" },
          { "name": "disputesHandled", "type": "uint256", "internalType": "uint256" },
          { "name": "majorityVotes", "type": "uint256", "internalType": "uint256" },
          { "name": "active", "type": "bool", "internalType": "bool" }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getDispute",
    "inputs": [
      { "name": "disputeId", "type": "uint256", "internalType": "uint256" }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct IDisputeArbitration.Dispute",
        "components": [
          { "name": "id", "type": "uint256", "internalType": "uint256" },
          { "name": "jobId", "type": "uint256", "internalType": "uint256" },
          { "name": "buyer", "type": "address", "internalType": "address" },
          { "name": "seller", "type": "address", "internalType": "address" },
          { "name": "amount", "type": "uint256", "internalType": "uint256" },
          { "name": "token", "type": "address", "internalType": "address" },
          { "name": "buyerEvidenceURI", "type": "string", "internalType": "string" },
          { "name": "sellerEvidenceURI", "type": "string", "internalType": "string" },
          { "name": "status", "type": "uint8", "internalType": "enum IDisputeArbitration.DisputeStatus" },
          { "name": "ruling", "type": "uint8", "internalType": "enum IDisputeArbitration.Ruling" },
          { "name": "createdAt", "type": "uint256", "internalType": "uint256" },
          { "name": "counterEvidenceDeadline", "type": "uint256", "internalType": "uint256" },
          { "name": "arbitrators", "type": "address[3]", "internalType": "address[3]" },
          { "name": "votesForBuyer", "type": "uint8", "internalType": "uint8" },
          { "name": "votesForSeller", "type": "uint8", "internalType": "uint8" },
          { "name": "totalVotes", "type": "uint8", "internalType": "uint8" }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getRoleAdmin",
    "inputs": [
      { "name": "role", "type": "bytes32", "internalType": "bytes32" }
    ],
    "outputs": [{ "name": "", "type": "bytes32", "internalType": "bytes32" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "grantRole",
    "inputs": [
      { "name": "role", "type": "bytes32", "internalType": "bytes32" },
      { "name": "account", "type": "address", "internalType": "address" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "hasRole",
    "inputs": [
      { "name": "role", "type": "bytes32", "internalType": "bytes32" },
      { "name": "account", "type": "address", "internalType": "address" }
    ],
    "outputs": [{ "name": "", "type": "bool", "internalType": "bool" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "lobToken",
    "inputs": [],
    "outputs": [{ "name": "", "type": "address", "internalType": "contract IERC20" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "renounceRole",
    "inputs": [
      { "name": "role", "type": "bytes32", "internalType": "bytes32" },
      { "name": "account", "type": "address", "internalType": "address" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "reputationSystem",
    "inputs": [],
    "outputs": [{ "name": "", "type": "address", "internalType": "contract IReputationSystem" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "revokeRole",
    "inputs": [
      { "name": "role", "type": "bytes32", "internalType": "bytes32" },
      { "name": "account", "type": "address", "internalType": "address" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "stakeAsArbitrator",
    "inputs": [
      { "name": "amount", "type": "uint256", "internalType": "uint256" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "stakingManager",
    "inputs": [],
    "outputs": [{ "name": "", "type": "address", "internalType": "contract IStakingManager" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "submitCounterEvidence",
    "inputs": [
      { "name": "disputeId", "type": "uint256", "internalType": "uint256" },
      { "name": "sellerEvidenceURI", "type": "string", "internalType": "string" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "submitDispute",
    "inputs": [
      { "name": "jobId", "type": "uint256", "internalType": "uint256" },
      { "name": "buyer", "type": "address", "internalType": "address" },
      { "name": "seller", "type": "address", "internalType": "address" },
      { "name": "amount", "type": "uint256", "internalType": "uint256" },
      { "name": "token", "type": "address", "internalType": "address" },
      { "name": "buyerEvidenceURI", "type": "string", "internalType": "string" }
    ],
    "outputs": [{ "name": "disputeId", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "supportsInterface",
    "inputs": [
      { "name": "interfaceId", "type": "bytes4", "internalType": "bytes4" }
    ],
    "outputs": [{ "name": "", "type": "bool", "internalType": "bool" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "unstakeAsArbitrator",
    "inputs": [
      { "name": "amount", "type": "uint256", "internalType": "uint256" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "vote",
    "inputs": [
      { "name": "disputeId", "type": "uint256", "internalType": "uint256" },
      { "name": "favorBuyer", "type": "bool", "internalType": "bool" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "event",
    "name": "ArbitratorStaked",
    "inputs": [
      { "name": "arbitrator", "type": "address", "indexed": true, "internalType": "address" },
      { "name": "amount", "type": "uint256", "indexed": false, "internalType": "uint256" },
      { "name": "rank", "type": "uint8", "indexed": false, "internalType": "enum IDisputeArbitration.ArbitratorRank" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ArbitratorUnstaked",
    "inputs": [
      { "name": "arbitrator", "type": "address", "indexed": true, "internalType": "address" },
      { "name": "amount", "type": "uint256", "indexed": false, "internalType": "uint256" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ArbitratorsAssigned",
    "inputs": [
      { "name": "disputeId", "type": "uint256", "indexed": true, "internalType": "uint256" },
      { "name": "arbitrators", "type": "address[3]", "indexed": false, "internalType": "address[3]" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "CounterEvidenceSubmitted",
    "inputs": [
      { "name": "disputeId", "type": "uint256", "indexed": true, "internalType": "uint256" },
      { "name": "evidenceURI", "type": "string", "indexed": false, "internalType": "string" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "DisputeCreated",
    "inputs": [
      { "name": "disputeId", "type": "uint256", "indexed": true, "internalType": "uint256" },
      { "name": "jobId", "type": "uint256", "indexed": true, "internalType": "uint256" },
      { "name": "buyer", "type": "address", "indexed": true, "internalType": "address" },
      { "name": "seller", "type": "address", "indexed": false, "internalType": "address" },
      { "name": "amount", "type": "uint256", "indexed": false, "internalType": "uint256" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "RoleAdminChanged",
    "inputs": [
      { "name": "role", "type": "bytes32", "indexed": true, "internalType": "bytes32" },
      { "name": "previousAdminRole", "type": "bytes32", "indexed": true, "internalType": "bytes32" },
      { "name": "newAdminRole", "type": "bytes32", "indexed": true, "internalType": "bytes32" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "RoleGranted",
    "inputs": [
      { "name": "role", "type": "bytes32", "indexed": true, "internalType": "bytes32" },
      { "name": "account", "type": "address", "indexed": true, "internalType": "address" },
      { "name": "sender", "type": "address", "indexed": true, "internalType": "address" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "RoleRevoked",
    "inputs": [
      { "name": "role", "type": "bytes32", "indexed": true, "internalType": "bytes32" },
      { "name": "account", "type": "address", "indexed": true, "internalType": "address" },
      { "name": "sender", "type": "address", "indexed": true, "internalType": "address" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "RulingExecuted",
    "inputs": [
      { "name": "disputeId", "type": "uint256", "indexed": true, "internalType": "uint256" },
      { "name": "ruling", "type": "uint8", "indexed": false, "internalType": "enum IDisputeArbitration.Ruling" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "VoteCast",
    "inputs": [
      { "name": "disputeId", "type": "uint256", "indexed": true, "internalType": "uint256" },
      { "name": "arbitrator", "type": "address", "indexed": true, "internalType": "address" },
      { "name": "favorBuyer", "type": "bool", "indexed": false, "internalType": "bool" }
    ],
    "anonymous": false
  },
  {
    "type": "function",
    "name": "appealRuling",
    "inputs": [
      { "name": "disputeId", "type": "uint256", "internalType": "uint256" }
    ],
    "outputs": [{ "name": "appealDisputeId", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "finalizeRuling",
    "inputs": [
      { "name": "disputeId", "type": "uint256", "internalType": "uint256" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "pauseAsArbitrator",
    "inputs": [],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "unpauseAsArbitrator",
    "inputs": [],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "isArbitratorPaused",
    "inputs": [
      { "name": "arb", "type": "address", "internalType": "address" }
    ],
    "outputs": [{ "name": "", "type": "bool", "internalType": "bool" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "isAppealDispute",
    "inputs": [
      { "name": "disputeId", "type": "uint256", "internalType": "uint256" }
    ],
    "outputs": [{ "name": "", "type": "bool", "internalType": "bool" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getAppealDisputeId",
    "inputs": [
      { "name": "originalId", "type": "uint256", "internalType": "uint256" }
    ],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "APPEAL_BOND",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "APPEAL_WINDOW",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "event",
    "name": "RulingFinalized",
    "inputs": [
      { "name": "disputeId", "type": "uint256", "indexed": true, "internalType": "uint256" },
      { "name": "ruling", "type": "uint8", "indexed": false, "internalType": "enum IDisputeArbitration.Ruling" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ArbitratorPaused",
    "inputs": [
      { "name": "arbitrator", "type": "address", "indexed": true, "internalType": "address" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ArbitratorUnpaused",
    "inputs": [
      { "name": "arbitrator", "type": "address", "indexed": true, "internalType": "address" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "AppealFiled",
    "inputs": [
      { "name": "originalDisputeId", "type": "uint256", "indexed": true, "internalType": "uint256" },
      { "name": "appealDisputeId", "type": "uint256", "indexed": true, "internalType": "uint256" },
      { "name": "appealer", "type": "address", "indexed": true, "internalType": "address" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "AppealBondReturned",
    "inputs": [
      { "name": "disputeId", "type": "uint256", "indexed": true, "internalType": "uint256" },
      { "name": "appealer", "type": "address", "indexed": true, "internalType": "address" },
      { "name": "amount", "type": "uint256", "indexed": false, "internalType": "uint256" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "AppealBondForfeited",
    "inputs": [
      { "name": "disputeId", "type": "uint256", "indexed": true, "internalType": "uint256" },
      { "name": "amount", "type": "uint256", "indexed": false, "internalType": "uint256" }
    ],
    "anonymous": false
  },
  {
    "type": "function",
    "name": "getAgreementRate",
    "inputs": [
      { "name": "arbA", "type": "address", "internalType": "address" },
      { "name": "arbB", "type": "address", "internalType": "address" }
    ],
    "outputs": [
      { "name": "agreed", "type": "uint256", "internalType": "uint256" },
      { "name": "total", "type": "uint256", "internalType": "uint256" }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getActiveDisputeCount",
    "inputs": [
      { "name": "arbitrator", "type": "address", "internalType": "address" }
    ],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "VOTING_DEADLINE",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "event",
    "name": "CollusionFlagged",
    "inputs": [
      { "name": "arbA", "type": "address", "indexed": true, "internalType": "address" },
      { "name": "arbB", "type": "address", "indexed": true, "internalType": "address" },
      { "name": "agreementRate", "type": "uint256", "indexed": false, "internalType": "uint256" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "VotingAdvanced",
    "inputs": [
      { "name": "disputeId", "type": "uint256", "indexed": true, "internalType": "uint256" }
    ],
    "anonymous": false
  }
] as const;

export const AirdropClaimABI = [
  {
    "type": "function",
    "name": "totalClaimed",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "claimWindowEnd",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "maxAirdropPool",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "IMMEDIATE_RELEASE",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "MILESTONE_REWARD",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "NUM_MILESTONES",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "TOTAL_ALLOCATION",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "difficultyTarget",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getMerkleRoot",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getClaimInfo",
    "inputs": [
      { "name": "claimant", "type": "address", "internalType": "address" }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct IAirdropClaimV3.ClaimInfo",
        "components": [
          { "name": "claimed", "type": "bool", "internalType": "bool" },
          { "name": "released", "type": "uint256", "internalType": "uint256" },
          { "name": "milestonesCompleted", "type": "uint256", "internalType": "uint256" },
          { "name": "claimedAt", "type": "uint256", "internalType": "uint256" }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "isMilestoneComplete",
    "inputs": [
      { "name": "claimant", "type": "address", "internalType": "address" },
      { "name": "milestone", "type": "uint8", "internalType": "enum IAirdropClaimV3.Milestone" }
    ],
    "outputs": [{ "name": "", "type": "bool", "internalType": "bool" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getPendingMilestones",
    "inputs": [
      { "name": "claimant", "type": "address", "internalType": "address" }
    ],
    "outputs": [
      { "name": "pending", "type": "bool[5]", "internalType": "bool[5]" }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "claim",
    "inputs": [
      { "name": "pA", "type": "uint256[2]", "internalType": "uint256[2]" },
      { "name": "pB", "type": "uint256[2][2]", "internalType": "uint256[2][2]" },
      { "name": "pC", "type": "uint256[2]", "internalType": "uint256[2]" },
      { "name": "pubSignals", "type": "uint256[2]", "internalType": "uint256[2]" },
      { "name": "approvalSig", "type": "bytes", "internalType": "bytes" },
      { "name": "powNonce", "type": "uint256", "internalType": "uint256" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "completeMilestone",
    "inputs": [
      { "name": "claimant", "type": "address", "internalType": "address" },
      { "name": "milestone", "type": "uint8", "internalType": "enum IAirdropClaimV3.Milestone" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "event",
    "name": "AirdropClaimed",
    "inputs": [
      { "name": "claimant", "type": "address", "indexed": true, "internalType": "address" },
      { "name": "immediateRelease", "type": "uint256", "indexed": false, "internalType": "uint256" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "MilestoneCompleted",
    "inputs": [
      { "name": "claimant", "type": "address", "indexed": true, "internalType": "address" },
      { "name": "milestone", "type": "uint8", "indexed": false, "internalType": "enum IAirdropClaimV3.Milestone" },
      { "name": "amountReleased", "type": "uint256", "indexed": false, "internalType": "uint256" }
    ],
    "anonymous": false
  }
] as const;

export const EscrowEngineABI = [
  {
    "type": "constructor",
    "inputs": [
      { "name": "_lobToken", "type": "address", "internalType": "address" },
      { "name": "_serviceRegistry", "type": "address", "internalType": "address" },
      { "name": "_stakingManager", "type": "address", "internalType": "address" },
      { "name": "_disputeArbitration", "type": "address", "internalType": "address" },
      { "name": "_reputationSystem", "type": "address", "internalType": "address" },
      { "name": "_treasury", "type": "address", "internalType": "address" }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "DEFAULT_ADMIN_ROLE",
    "inputs": [],
    "outputs": [{ "name": "", "type": "bytes32", "internalType": "bytes32" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "HIGH_VALUE_DISPUTE_WINDOW",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "HIGH_VALUE_THRESHOLD",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "LOW_VALUE_DISPUTE_WINDOW",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "USDC_FEE_BPS",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "MIN_ESCROW_AMOUNT",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "AUTO_RELEASE_GRACE",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "SKILL_ESCROW_DISPUTE_WINDOW",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "SKILL_REGISTRY_ROLE",
    "inputs": [],
    "outputs": [{ "name": "", "type": "bytes32", "internalType": "bytes32" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "isTokenAllowed",
    "inputs": [
      { "name": "token", "type": "address", "internalType": "address" }
    ],
    "outputs": [{ "name": "", "type": "bool", "internalType": "bool" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "allowlistToken",
    "inputs": [
      { "name": "token", "type": "address", "internalType": "address" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "removeToken",
    "inputs": [
      { "name": "token", "type": "address", "internalType": "address" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "createSkillEscrow",
    "inputs": [
      { "name": "skillId", "type": "uint256", "internalType": "uint256" },
      { "name": "buyer", "type": "address", "internalType": "address" },
      { "name": "seller", "type": "address", "internalType": "address" },
      { "name": "amount", "type": "uint256", "internalType": "uint256" },
      { "name": "token", "type": "address", "internalType": "address" }
    ],
    "outputs": [{ "name": "jobId", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "pause",
    "inputs": [],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "paused",
    "inputs": [],
    "outputs": [{ "name": "", "type": "bool", "internalType": "bool" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "unpause",
    "inputs": [],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "sybilGuard",
    "inputs": [],
    "outputs": [{ "name": "", "type": "address", "internalType": "contract ISybilGuard" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "resolveDisputeDraw",
    "inputs": [
      { "name": "jobId", "type": "uint256", "internalType": "uint256" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "autoRelease",
    "inputs": [
      { "name": "jobId", "type": "uint256", "internalType": "uint256" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "confirmDelivery",
    "inputs": [
      { "name": "jobId", "type": "uint256", "internalType": "uint256" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "createJob",
    "inputs": [
      { "name": "listingId", "type": "uint256", "internalType": "uint256" },
      { "name": "seller", "type": "address", "internalType": "address" },
      { "name": "amount", "type": "uint256", "internalType": "uint256" },
      { "name": "token", "type": "address", "internalType": "address" }
    ],
    "outputs": [{ "name": "jobId", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "disputeArbitration",
    "inputs": [],
    "outputs": [{ "name": "", "type": "address", "internalType": "contract IDisputeArbitration" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getJob",
    "inputs": [
      { "name": "jobId", "type": "uint256", "internalType": "uint256" }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct IEscrowEngine.Job",
        "components": [
          { "name": "id", "type": "uint256", "internalType": "uint256" },
          { "name": "listingId", "type": "uint256", "internalType": "uint256" },
          { "name": "buyer", "type": "address", "internalType": "address" },
          { "name": "seller", "type": "address", "internalType": "address" },
          { "name": "amount", "type": "uint256", "internalType": "uint256" },
          { "name": "token", "type": "address", "internalType": "address" },
          { "name": "fee", "type": "uint256", "internalType": "uint256" },
          { "name": "status", "type": "uint8", "internalType": "enum IEscrowEngine.JobStatus" },
          { "name": "createdAt", "type": "uint256", "internalType": "uint256" },
          { "name": "disputeWindowEnd", "type": "uint256", "internalType": "uint256" },
          { "name": "deliveryMetadataURI", "type": "string", "internalType": "string" },
          { "name": "escrowType", "type": "uint8", "internalType": "enum IEscrowEngine.EscrowType" },
          { "name": "skillId", "type": "uint256", "internalType": "uint256" }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getJobDisputeId",
    "inputs": [
      { "name": "jobId", "type": "uint256", "internalType": "uint256" }
    ],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getRoleAdmin",
    "inputs": [
      { "name": "role", "type": "bytes32", "internalType": "bytes32" }
    ],
    "outputs": [{ "name": "", "type": "bytes32", "internalType": "bytes32" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "grantRole",
    "inputs": [
      { "name": "role", "type": "bytes32", "internalType": "bytes32" },
      { "name": "account", "type": "address", "internalType": "address" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "hasRole",
    "inputs": [
      { "name": "role", "type": "bytes32", "internalType": "bytes32" },
      { "name": "account", "type": "address", "internalType": "address" }
    ],
    "outputs": [{ "name": "", "type": "bool", "internalType": "bool" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "initiateDispute",
    "inputs": [
      { "name": "jobId", "type": "uint256", "internalType": "uint256" },
      { "name": "evidenceURI", "type": "string", "internalType": "string" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "lobToken",
    "inputs": [],
    "outputs": [{ "name": "", "type": "address", "internalType": "contract IERC20" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "renounceRole",
    "inputs": [
      { "name": "role", "type": "bytes32", "internalType": "bytes32" },
      { "name": "account", "type": "address", "internalType": "address" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "reputationSystem",
    "inputs": [],
    "outputs": [{ "name": "", "type": "address", "internalType": "contract IReputationSystem" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "resolveDispute",
    "inputs": [
      { "name": "jobId", "type": "uint256", "internalType": "uint256" },
      { "name": "buyerWins", "type": "bool", "internalType": "bool" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "revokeRole",
    "inputs": [
      { "name": "role", "type": "bytes32", "internalType": "bytes32" },
      { "name": "account", "type": "address", "internalType": "address" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "serviceRegistry",
    "inputs": [],
    "outputs": [{ "name": "", "type": "address", "internalType": "contract IServiceRegistry" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "stakingManager",
    "inputs": [],
    "outputs": [{ "name": "", "type": "address", "internalType": "contract IStakingManager" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "submitDelivery",
    "inputs": [
      { "name": "jobId", "type": "uint256", "internalType": "uint256" },
      { "name": "metadataURI", "type": "string", "internalType": "string" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "supportsInterface",
    "inputs": [
      { "name": "interfaceId", "type": "bytes4", "internalType": "bytes4" }
    ],
    "outputs": [{ "name": "", "type": "bool", "internalType": "bool" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "treasury",
    "inputs": [],
    "outputs": [{ "name": "", "type": "address", "internalType": "address" }],
    "stateMutability": "view"
  },
  {
    "type": "event",
    "name": "AutoReleased",
    "inputs": [
      { "name": "jobId", "type": "uint256", "indexed": true, "internalType": "uint256" },
      { "name": "caller", "type": "address", "indexed": true, "internalType": "address" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "DeliveryConfirmed",
    "inputs": [
      { "name": "jobId", "type": "uint256", "indexed": true, "internalType": "uint256" },
      { "name": "buyer", "type": "address", "indexed": true, "internalType": "address" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "DeliverySubmitted",
    "inputs": [
      { "name": "jobId", "type": "uint256", "indexed": true, "internalType": "uint256" },
      { "name": "metadataURI", "type": "string", "indexed": false, "internalType": "string" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "DisputeInitiated",
    "inputs": [
      { "name": "jobId", "type": "uint256", "indexed": true, "internalType": "uint256" },
      { "name": "disputeId", "type": "uint256", "indexed": true, "internalType": "uint256" },
      { "name": "evidenceURI", "type": "string", "indexed": false, "internalType": "string" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "FundsReleased",
    "inputs": [
      { "name": "jobId", "type": "uint256", "indexed": true, "internalType": "uint256" },
      { "name": "seller", "type": "address", "indexed": true, "internalType": "address" },
      { "name": "amount", "type": "uint256", "indexed": false, "internalType": "uint256" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "JobCreated",
    "inputs": [
      { "name": "jobId", "type": "uint256", "indexed": true, "internalType": "uint256" },
      { "name": "listingId", "type": "uint256", "indexed": true, "internalType": "uint256" },
      { "name": "buyer", "type": "address", "indexed": true, "internalType": "address" },
      { "name": "seller", "type": "address", "indexed": false, "internalType": "address" },
      { "name": "amount", "type": "uint256", "indexed": false, "internalType": "uint256" },
      { "name": "token", "type": "address", "indexed": false, "internalType": "address" },
      { "name": "fee", "type": "uint256", "indexed": false, "internalType": "uint256" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "RoleAdminChanged",
    "inputs": [
      { "name": "role", "type": "bytes32", "indexed": true, "internalType": "bytes32" },
      { "name": "previousAdminRole", "type": "bytes32", "indexed": true, "internalType": "bytes32" },
      { "name": "newAdminRole", "type": "bytes32", "indexed": true, "internalType": "bytes32" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "RoleGranted",
    "inputs": [
      { "name": "role", "type": "bytes32", "indexed": true, "internalType": "bytes32" },
      { "name": "account", "type": "address", "indexed": true, "internalType": "address" },
      { "name": "sender", "type": "address", "indexed": true, "internalType": "address" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "RoleRevoked",
    "inputs": [
      { "name": "role", "type": "bytes32", "indexed": true, "internalType": "bytes32" },
      { "name": "account", "type": "address", "indexed": true, "internalType": "address" },
      { "name": "sender", "type": "address", "indexed": true, "internalType": "address" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "SkillEscrowCreated",
    "inputs": [
      { "name": "jobId", "type": "uint256", "indexed": true, "internalType": "uint256" },
      { "name": "skillId", "type": "uint256", "indexed": true, "internalType": "uint256" },
      { "name": "buyer", "type": "address", "indexed": true, "internalType": "address" },
      { "name": "seller", "type": "address", "indexed": false, "internalType": "address" },
      { "name": "amount", "type": "uint256", "indexed": false, "internalType": "uint256" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "TokenAllowlisted",
    "inputs": [
      { "name": "token", "type": "address", "indexed": true, "internalType": "address" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "TokenRemoved",
    "inputs": [
      { "name": "token", "type": "address", "indexed": true, "internalType": "address" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Paused",
    "inputs": [
      { "name": "account", "type": "address", "indexed": false, "internalType": "address" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Unpaused",
    "inputs": [
      { "name": "account", "type": "address", "indexed": false, "internalType": "address" }
    ],
    "anonymous": false
  }
] as const;

export const TreasuryGovernorABI = [
  {
    "type": "function",
    "name": "DEFAULT_ADMIN_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "GUARDIAN_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "MAX_SIGNERS",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "MIN_SIGNERS",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "PROPOSAL_EXPIRY",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "PROPOSAL_TIMELOCK",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "SIGNER_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "STREAM_MAX_DURATION",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "SYBIL_GUARD_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "addSigner",
    "inputs": [
      {
        "name": "signer",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "adminProposalApprovals",
    "inputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "adminProposals",
    "inputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "id",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "proposer",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "target",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "callData",
        "type": "bytes",
        "internalType": "bytes"
      },
      {
        "name": "description",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "status",
        "type": "uint8",
        "internalType": "enum TreasuryGovernor.ProposalStatus"
      },
      {
        "name": "approvalCount",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "createdAt",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "timelockEnd",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "approveAdminProposal",
    "inputs": [
      {
        "name": "proposalId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "approveProposal",
    "inputs": [
      {
        "name": "proposalId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "bounties",
    "inputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "id",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "creator",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "title",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "description",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "reward",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "status",
        "type": "uint8",
        "internalType": "enum TreasuryGovernor.BountyStatus"
      },
      {
        "name": "category",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "difficulty",
        "type": "uint8",
        "internalType": "uint8"
      },
      {
        "name": "claimant",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "createdAt",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "deadline",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "cancelAdminProposal",
    "inputs": [
      {
        "name": "proposalId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "cancelBounty",
    "inputs": [
      {
        "name": "bountyId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "cancelProposal",
    "inputs": [
      {
        "name": "proposalId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "cancelStream",
    "inputs": [
      {
        "name": "streamId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "cancelStreamsForAddress",
    "inputs": [
      {
        "name": "banned",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "claimBounty",
    "inputs": [
      {
        "name": "bountyId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "claimStream",
    "inputs": [
      {
        "name": "streamId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "completeBounty",
    "inputs": [
      {
        "name": "bountyId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "createAdminProposal",
    "inputs": [
      {
        "name": "target",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "data",
        "type": "bytes",
        "internalType": "bytes"
      },
      {
        "name": "description",
        "type": "string",
        "internalType": "string"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "createBounty",
    "inputs": [
      {
        "name": "title",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "description",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "reward",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "category",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "difficulty",
        "type": "uint8",
        "internalType": "uint8"
      },
      {
        "name": "deadline",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "createProposal",
    "inputs": [
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "recipient",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "description",
        "type": "string",
        "internalType": "string"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "createStream",
    "inputs": [
      {
        "name": "recipient",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "totalAmount",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "duration",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "role",
        "type": "string",
        "internalType": "string"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "delegate",
    "inputs": [
      {
        "name": "to",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "delegateTo",
    "inputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "delegatorCount",
    "inputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "deposit",
    "inputs": [
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "executeAdminProposal",
    "inputs": [
      {
        "name": "proposalId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "executeProposal",
    "inputs": [
      {
        "name": "proposalId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "getAdminProposal",
    "inputs": [
      {
        "name": "proposalId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "id",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "proposer",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "target",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "callData",
        "type": "bytes",
        "internalType": "bytes"
      },
      {
        "name": "description",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "status",
        "type": "uint8",
        "internalType": "enum TreasuryGovernor.ProposalStatus"
      },
      {
        "name": "approvalCount",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "createdAt",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "timelockEnd",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getBalance",
    "inputs": [
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getBounty",
    "inputs": [
      {
        "name": "bountyId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct TreasuryGovernor.Bounty",
        "components": [
          {
            "name": "id",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "creator",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "title",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "description",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "reward",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "token",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "status",
            "type": "uint8",
            "internalType": "enum TreasuryGovernor.BountyStatus"
          },
          {
            "name": "category",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "difficulty",
            "type": "uint8",
            "internalType": "uint8"
          },
          {
            "name": "claimant",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "createdAt",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "deadline",
            "type": "uint256",
            "internalType": "uint256"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getDelegatee",
    "inputs": [
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getProposal",
    "inputs": [
      {
        "name": "proposalId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct TreasuryGovernor.Proposal",
        "components": [
          {
            "name": "id",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "proposer",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "token",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "recipient",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "amount",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "description",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "status",
            "type": "uint8",
            "internalType": "enum TreasuryGovernor.ProposalStatus"
          },
          {
            "name": "approvalCount",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "createdAt",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "timelockEnd",
            "type": "uint256",
            "internalType": "uint256"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getRecipientStreams",
    "inputs": [
      {
        "name": "recipient",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256[]",
        "internalType": "uint256[]"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getRoleAdmin",
    "inputs": [
      {
        "name": "role",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getStream",
    "inputs": [
      {
        "name": "streamId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct TreasuryGovernor.PaymentStream",
        "components": [
          {
            "name": "id",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "recipient",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "token",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "totalAmount",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "claimedAmount",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "startTime",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "endTime",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "role",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "active",
            "type": "bool",
            "internalType": "bool"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "grantRole",
    "inputs": [
      {
        "name": "role",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "hasRole",
    "inputs": [
      {
        "name": "role",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "isProposalExpired",
    "inputs": [
      {
        "name": "proposalId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "lobToken",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "nextBountyId",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "proposalApprovals",
    "inputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "proposals",
    "inputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "id",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "proposer",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "recipient",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "description",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "status",
        "type": "uint8",
        "internalType": "enum TreasuryGovernor.ProposalStatus"
      },
      {
        "name": "approvalCount",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "createdAt",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "timelockEnd",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "receiveSeizedFunds",
    "inputs": [
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "from",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "reason",
        "type": "string",
        "internalType": "string"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "recipientStreams",
    "inputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "removeSigner",
    "inputs": [
      {
        "name": "signer",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "renounceRole",
    "inputs": [
      {
        "name": "role",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "requiredApprovals",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "revokeRole",
    "inputs": [
      {
        "name": "role",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setRequiredApprovals",
    "inputs": [
      {
        "name": "newRequired",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "signerCount",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "streamClaimable",
    "inputs": [
      {
        "name": "streamId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "streams",
    "inputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "id",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "recipient",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "totalAmount",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "claimedAmount",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "startTime",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "endTime",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "role",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "active",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "supportsInterface",
    "inputs": [
      {
        "name": "interfaceId",
        "type": "bytes4",
        "internalType": "bytes4"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "totalSeizedLOB",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "totalSeizedUSDC",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "undelegate",
    "inputs": [],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "event",
    "name": "AdminProposalApproved",
    "inputs": [
      {
        "name": "proposalId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "signer",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "AdminProposalApprovedForExecution",
    "inputs": [
      {
        "name": "proposalId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "timelockEnd",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "AdminProposalCancelled",
    "inputs": [
      {
        "name": "proposalId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "canceller",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "AdminProposalCreated",
    "inputs": [
      {
        "name": "proposalId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "target",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "proposer",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "AdminProposalExecuted",
    "inputs": [
      {
        "name": "proposalId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "target",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "BountyCancelled",
    "inputs": [
      {
        "name": "bountyId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "BountyClaimed",
    "inputs": [
      {
        "name": "bountyId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "claimant",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "BountyCompleted",
    "inputs": [
      {
        "name": "bountyId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "claimant",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "reward",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "BountyCreated",
    "inputs": [
      {
        "name": "bountyId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "creator",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "reward",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "token",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "DelegateRemoved",
    "inputs": [
      {
        "name": "delegator",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "previousDelegatee",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "DelegateSet",
    "inputs": [
      {
        "name": "delegator",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "delegatee",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "FundsReceived",
    "inputs": [
      {
        "name": "token",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "from",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "FundsSeized",
    "inputs": [
      {
        "name": "token",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "from",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "reason",
        "type": "string",
        "indexed": false,
        "internalType": "string"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ProposalApproved",
    "inputs": [
      {
        "name": "proposalId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "signer",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ProposalApprovedForExecution",
    "inputs": [
      {
        "name": "proposalId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "timelockEnd",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ProposalCancelled",
    "inputs": [
      {
        "name": "proposalId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "canceller",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ProposalCreated",
    "inputs": [
      {
        "name": "proposalId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "proposer",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "token",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      },
      {
        "name": "recipient",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "description",
        "type": "string",
        "indexed": false,
        "internalType": "string"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ProposalExecuted",
    "inputs": [
      {
        "name": "proposalId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "recipient",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "RequiredApprovalsChanged",
    "inputs": [
      {
        "name": "oldValue",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "newValue",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "RoleAdminChanged",
    "inputs": [
      {
        "name": "role",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "previousAdminRole",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "newAdminRole",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "RoleGranted",
    "inputs": [
      {
        "name": "role",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "account",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "sender",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "RoleRevoked",
    "inputs": [
      {
        "name": "role",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "account",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "sender",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "SignerAdded",
    "inputs": [
      {
        "name": "signer",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "SignerRemoved",
    "inputs": [
      {
        "name": "signer",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "StreamCancelled",
    "inputs": [
      {
        "name": "streamId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "StreamClaimed",
    "inputs": [
      {
        "name": "streamId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "recipient",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "StreamCreated",
    "inputs": [
      {
        "name": "streamId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "recipient",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "token",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      },
      {
        "name": "totalAmount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "startTime",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "endTime",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "role",
        "type": "string",
        "indexed": false,
        "internalType": "string"
      }
    ],
    "anonymous": false
  }
] as const;

export const SybilGuardABI = [
  {
    "type": "function",
    "name": "APPEALS_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "COOLDOWN_AFTER_UNBAN",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "DEFAULT_ADMIN_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "JUDGE_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "MIN_JUDGES_FOR_BAN",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "MIN_JUDGES_FOR_REJECT",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "REPORT_EXPIRY",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "WATCHER_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "banRecords",
    "inputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "banned",
        "type": "bool",
        "internalType": "bool"
      },
      {
        "name": "bannedAt",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "unbannedAt",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "reason",
        "type": "uint8",
        "internalType": "enum SybilGuard.ViolationType"
      },
      {
        "name": "reportId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "seizedAmount",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "seizedToken",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "bannedAddresses",
    "inputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "checkAnyBanned",
    "inputs": [
      {
        "name": "accounts",
        "type": "address[]",
        "internalType": "address[]"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "checkBanned",
    "inputs": [
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "confirmReport",
    "inputs": [
      {
        "name": "reportId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "getBanRecord",
    "inputs": [
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct SybilGuard.BanRecord",
        "components": [
          {
            "name": "banned",
            "type": "bool",
            "internalType": "bool"
          },
          {
            "name": "bannedAt",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "unbannedAt",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "reason",
            "type": "uint8",
            "internalType": "enum SybilGuard.ViolationType"
          },
          {
            "name": "reportId",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "seizedAmount",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "seizedToken",
            "type": "address",
            "internalType": "address"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getBannedCount",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getLinkedAccounts",
    "inputs": [
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "address[]",
        "internalType": "address[]"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getReport",
    "inputs": [
      {
        "name": "reportId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct SybilGuard.SybilReport",
        "components": [
          {
            "name": "id",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "reporter",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "subjects",
            "type": "address[]",
            "internalType": "address[]"
          },
          {
            "name": "violation",
            "type": "uint8",
            "internalType": "enum SybilGuard.ViolationType"
          },
          {
            "name": "evidenceURI",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "status",
            "type": "uint8",
            "internalType": "enum SybilGuard.ReportStatus"
          },
          {
            "name": "confirmations",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "createdAt",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "notes",
            "type": "string",
            "internalType": "string"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getReportSubjects",
    "inputs": [
      {
        "name": "reportId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "address[]",
        "internalType": "address[]"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getRoleAdmin",
    "inputs": [
      {
        "name": "role",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "grantRole",
    "inputs": [
      {
        "name": "role",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "hasRole",
    "inputs": [
      {
        "name": "role",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "isBanned",
    "inputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "isReportExpired",
    "inputs": [
      {
        "name": "reportId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "linkedAccounts",
    "inputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "lobToken",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract IERC20"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "rejectReport",
    "inputs": [
      {
        "name": "reportId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "renounceRole",
    "inputs": [
      {
        "name": "role",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "reportConfirmations",
    "inputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "reportRejectionCount",
    "inputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "reportRejections",
    "inputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "reports",
    "inputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "id",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "reporter",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "violation",
        "type": "uint8",
        "internalType": "enum SybilGuard.ViolationType"
      },
      {
        "name": "evidenceURI",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "status",
        "type": "uint8",
        "internalType": "enum SybilGuard.ReportStatus"
      },
      {
        "name": "confirmations",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "createdAt",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "notes",
        "type": "string",
        "internalType": "string"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "revokeRole",
    "inputs": [
      {
        "name": "role",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "stakingManager",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract IStakingManager"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "submitReport",
    "inputs": [
      {
        "name": "subjects",
        "type": "address[]",
        "internalType": "address[]"
      },
      {
        "name": "violation",
        "type": "uint8",
        "internalType": "enum SybilGuard.ViolationType"
      },
      {
        "name": "evidenceURI",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "notes",
        "type": "string",
        "internalType": "string"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "supportsInterface",
    "inputs": [
      {
        "name": "interfaceId",
        "type": "bytes4",
        "internalType": "bytes4"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "totalBans",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "totalReports",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "totalSeized",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "treasuryGovernor",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "unban",
    "inputs": [
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "event",
    "name": "AddressBanned",
    "inputs": [
      {
        "name": "account",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "reason",
        "type": "uint8",
        "indexed": false,
        "internalType": "enum SybilGuard.ViolationType"
      },
      {
        "name": "reportId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "seizedAmount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "AddressUnbanned",
    "inputs": [
      {
        "name": "account",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "unbannedBy",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "FundsSeized",
    "inputs": [
      {
        "name": "account",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "token",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "reportId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "LinkedAccountsRegistered",
    "inputs": [
      {
        "name": "primary",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "linked",
        "type": "address[]",
        "indexed": false,
        "internalType": "address[]"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ReportConfirmed",
    "inputs": [
      {
        "name": "reportId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "judge",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ReportCreated",
    "inputs": [
      {
        "name": "reportId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "reporter",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "violation",
        "type": "uint8",
        "indexed": false,
        "internalType": "enum SybilGuard.ViolationType"
      },
      {
        "name": "subjects",
        "type": "address[]",
        "indexed": false,
        "internalType": "address[]"
      },
      {
        "name": "evidenceURI",
        "type": "string",
        "indexed": false,
        "internalType": "string"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ReportRejected",
    "inputs": [
      {
        "name": "reportId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "judge",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "RoleAdminChanged",
    "inputs": [
      {
        "name": "role",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "previousAdminRole",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "newAdminRole",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "RoleGranted",
    "inputs": [
      {
        "name": "role",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "account",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "sender",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "RoleRevoked",
    "inputs": [
      {
        "name": "role",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "account",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "sender",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "function",
    "name": "BAN_DELAY",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "SEIZURE_ESCROW_PERIOD",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "HIGH_STAKE_THRESHOLD",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "HIGH_STAKE_MIN_JUDGES",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "WATCHER_REWARD_BPS",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "JUDGE_FLAT_REWARD",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "reportBanScheduledAt",
    "inputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "reportBanExecuted",
    "inputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "outputs": [{ "name": "", "type": "bool", "internalType": "bool" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "reportBondAmount",
    "inputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "seizedInEscrow",
    "inputs": [{ "name": "", "type": "address", "internalType": "address" }],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "seizureEscrowExpiry",
    "inputs": [{ "name": "", "type": "address", "internalType": "address" }],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "escrowReportId",
    "inputs": [{ "name": "", "type": "address", "internalType": "address" }],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getWatcherStats",
    "inputs": [{ "name": "watcher", "type": "address", "internalType": "address" }],
    "outputs": [
      { "name": "submitted", "type": "uint256", "internalType": "uint256" },
      { "name": "confirmed", "type": "uint256", "internalType": "uint256" },
      { "name": "rejected", "type": "uint256", "internalType": "uint256" }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "executeBan",
    "inputs": [{ "name": "reportId", "type": "uint256", "internalType": "uint256" }],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "cancelBan",
    "inputs": [{ "name": "reportId", "type": "uint256", "internalType": "uint256" }],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "releaseEscrow",
    "inputs": [{ "name": "account", "type": "address", "internalType": "address" }],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "expireReport",
    "inputs": [{ "name": "reportId", "type": "uint256", "internalType": "uint256" }],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "event",
    "name": "BanScheduled",
    "inputs": [
      { "name": "reportId", "type": "uint256", "indexed": true, "internalType": "uint256" },
      { "name": "executeAfter", "type": "uint256", "indexed": false, "internalType": "uint256" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "BanCancelled",
    "inputs": [
      { "name": "reportId", "type": "uint256", "indexed": true, "internalType": "uint256" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "EscrowReleased",
    "inputs": [
      { "name": "account", "type": "address", "indexed": true, "internalType": "address" },
      { "name": "amount", "type": "uint256", "indexed": false, "internalType": "uint256" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "EscrowRefunded",
    "inputs": [
      { "name": "account", "type": "address", "indexed": true, "internalType": "address" },
      { "name": "amount", "type": "uint256", "indexed": false, "internalType": "uint256" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "WatcherBondCollected",
    "inputs": [
      { "name": "reportId", "type": "uint256", "indexed": true, "internalType": "uint256" },
      { "name": "watcher", "type": "address", "indexed": true, "internalType": "address" },
      { "name": "amount", "type": "uint256", "indexed": false, "internalType": "uint256" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "WatcherBondReturned",
    "inputs": [
      { "name": "reportId", "type": "uint256", "indexed": true, "internalType": "uint256" },
      { "name": "watcher", "type": "address", "indexed": true, "internalType": "address" },
      { "name": "amount", "type": "uint256", "indexed": false, "internalType": "uint256" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "WatcherBondSlashed",
    "inputs": [
      { "name": "reportId", "type": "uint256", "indexed": true, "internalType": "uint256" },
      { "name": "watcher", "type": "address", "indexed": true, "internalType": "address" },
      { "name": "amount", "type": "uint256", "indexed": false, "internalType": "uint256" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ReportExpired",
    "inputs": [
      { "name": "reportId", "type": "uint256", "indexed": true, "internalType": "uint256" }
    ],
    "anonymous": false
  }
] as const;

// ─── X402EscrowBridge ABI (frontend subset) ──────────────────────────────────

export const X402EscrowBridgeABI = [
  {
    "type": "function",
    "name": "jobPayer",
    "inputs": [{ "name": "", "type": "uint256" }],
    "outputs": [{ "name": "", "type": "address" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "jobRefundCredit",
    "inputs": [{ "name": "", "type": "uint256" }],
    "outputs": [{ "name": "", "type": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "refundClaimed",
    "inputs": [{ "name": "", "type": "uint256" }],
    "outputs": [{ "name": "", "type": "bool" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "confirmDelivery",
    "inputs": [{ "name": "jobId", "type": "uint256" }],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "initiateDispute",
    "inputs": [
      { "name": "jobId", "type": "uint256" },
      { "name": "evidenceURI", "type": "string" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "claimEscrowRefund",
    "inputs": [{ "name": "jobId", "type": "uint256" }],
    "outputs": [],
    "stateMutability": "nonpayable"
  }
] as const;

export const RewardDistributorABI = [
  {
    "type": "function",
    "name": "availableBudget",
    "inputs": [{ "name": "token", "type": "address", "internalType": "address" }],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "claim",
    "inputs": [{ "name": "token", "type": "address", "internalType": "address" }],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "claimableBalance",
    "inputs": [
      { "name": "account", "type": "address", "internalType": "address" },
      { "name": "token", "type": "address", "internalType": "address" }
    ],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "deposit",
    "inputs": [
      { "name": "token", "type": "address", "internalType": "address" },
      { "name": "amount", "type": "uint256", "internalType": "uint256" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "totalDeposited",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "totalDistributed",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "totalEarnedByAccount",
    "inputs": [{ "name": "", "type": "address", "internalType": "address" }],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "event",
    "name": "ArbitratorRewardCredited",
    "inputs": [
      { "name": "arbitrator", "type": "address", "indexed": true, "internalType": "address" },
      { "name": "token", "type": "address", "indexed": true, "internalType": "address" },
      { "name": "amount", "type": "uint256", "indexed": false, "internalType": "uint256" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Deposited",
    "inputs": [
      { "name": "depositor", "type": "address", "indexed": true, "internalType": "address" },
      { "name": "token", "type": "address", "indexed": true, "internalType": "address" },
      { "name": "amount", "type": "uint256", "indexed": false, "internalType": "uint256" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "JudgeRewardCredited",
    "inputs": [
      { "name": "judge", "type": "address", "indexed": true, "internalType": "address" },
      { "name": "token", "type": "address", "indexed": true, "internalType": "address" },
      { "name": "amount", "type": "uint256", "indexed": false, "internalType": "uint256" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "RewardClaimed",
    "inputs": [
      { "name": "account", "type": "address", "indexed": true, "internalType": "address" },
      { "name": "token", "type": "address", "indexed": true, "internalType": "address" },
      { "name": "amount", "type": "uint256", "indexed": false, "internalType": "uint256" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "WatcherRewardCredited",
    "inputs": [
      { "name": "watcher", "type": "address", "indexed": true, "internalType": "address" },
      { "name": "token", "type": "address", "indexed": true, "internalType": "address" },
      { "name": "amount", "type": "uint256", "indexed": false, "internalType": "uint256" }
    ],
    "anonymous": false
  }
] as const;

export const TeamVestingABI = [
  {
    "type": "function",
    "name": "beneficiary",
    "inputs": [],
    "outputs": [{ "name": "", "type": "address", "internalType": "address" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "cliffEnd",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "duration",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "releasable",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "release",
    "inputs": [],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "released",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "revoked",
    "inputs": [],
    "outputs": [{ "name": "", "type": "bool", "internalType": "bool" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "start",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "totalAllocation",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "vestedAmount",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "event",
    "name": "TokensReleased",
    "inputs": [
      { "name": "amount", "type": "uint256", "indexed": false, "internalType": "uint256" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "VestingRevoked",
    "inputs": [
      { "name": "returnTo", "type": "address", "indexed": false, "internalType": "address" },
      { "name": "returned", "type": "uint256", "indexed": false, "internalType": "uint256" }
    ],
    "anonymous": false
  }
] as const;

// ─── InsurancePool ABI (frontend subset) ──────────────────────────────────────

export const InsurancePoolABI = [
  {
    "type": "function",
    "name": "getPoolStats",
    "inputs": [],
    "outputs": [
      { "name": "totalDeposits", "type": "uint256", "internalType": "uint256" },
      { "name": "totalPremiums", "type": "uint256", "internalType": "uint256" },
      { "name": "totalClaims", "type": "uint256", "internalType": "uint256" },
      { "name": "available", "type": "uint256", "internalType": "uint256" }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getStakerInfo",
    "inputs": [
      { "name": "staker", "type": "address", "internalType": "address" }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct IInsurancePool.PoolStaker",
        "components": [
          { "name": "deposited", "type": "uint256", "internalType": "uint256" },
          { "name": "rewardPerTokenPaid", "type": "uint256", "internalType": "uint256" },
          { "name": "pendingRewards", "type": "uint256", "internalType": "uint256" }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getCoverageCap",
    "inputs": [
      { "name": "buyer", "type": "address", "internalType": "address" }
    ],
    "outputs": [
      { "name": "", "type": "uint256", "internalType": "uint256" }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "isInsuredJob",
    "inputs": [
      { "name": "jobId", "type": "uint256", "internalType": "uint256" }
    ],
    "outputs": [
      { "name": "", "type": "bool", "internalType": "bool" }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "poolEarned",
    "inputs": [
      { "name": "staker", "type": "address", "internalType": "address" }
    ],
    "outputs": [
      { "name": "", "type": "uint256", "internalType": "uint256" }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "premiumRateBps",
    "inputs": [],
    "outputs": [
      { "name": "", "type": "uint256", "internalType": "uint256" }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "totalPoolDeposits",
    "inputs": [],
    "outputs": [
      { "name": "", "type": "uint256", "internalType": "uint256" }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "totalPremiumsCollected",
    "inputs": [],
    "outputs": [
      { "name": "", "type": "uint256", "internalType": "uint256" }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "totalClaimsPaid",
    "inputs": [],
    "outputs": [
      { "name": "", "type": "uint256", "internalType": "uint256" }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "coverageCapBronze",
    "inputs": [],
    "outputs": [
      { "name": "", "type": "uint256", "internalType": "uint256" }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "coverageCapSilver",
    "inputs": [],
    "outputs": [
      { "name": "", "type": "uint256", "internalType": "uint256" }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "coverageCapGold",
    "inputs": [],
    "outputs": [
      { "name": "", "type": "uint256", "internalType": "uint256" }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "coverageCapPlatinum",
    "inputs": [],
    "outputs": [
      { "name": "", "type": "uint256", "internalType": "uint256" }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "depositToPool",
    "inputs": [
      { "name": "amount", "type": "uint256", "internalType": "uint256" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "withdrawFromPool",
    "inputs": [
      { "name": "amount", "type": "uint256", "internalType": "uint256" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "claimPoolRewards",
    "inputs": [],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "createInsuredJob",
    "inputs": [
      { "name": "listingId", "type": "uint256", "internalType": "uint256" },
      { "name": "seller", "type": "address", "internalType": "address" },
      { "name": "amount", "type": "uint256", "internalType": "uint256" },
      { "name": "token", "type": "address", "internalType": "address" }
    ],
    "outputs": [
      { "name": "jobId", "type": "uint256", "internalType": "uint256" }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "fileClaim",
    "inputs": [
      { "name": "jobId", "type": "uint256", "internalType": "uint256" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "confirmInsuredDelivery",
    "inputs": [
      { "name": "jobId", "type": "uint256", "internalType": "uint256" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "initiateInsuredDispute",
    "inputs": [
      { "name": "jobId", "type": "uint256", "internalType": "uint256" },
      { "name": "evidenceURI", "type": "string", "internalType": "string" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "event",
    "name": "PoolDeposited",
    "inputs": [
      { "name": "staker", "type": "address", "indexed": true, "internalType": "address" },
      { "name": "amount", "type": "uint256", "indexed": false, "internalType": "uint256" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "PoolWithdrawn",
    "inputs": [
      { "name": "staker", "type": "address", "indexed": true, "internalType": "address" },
      { "name": "amount", "type": "uint256", "indexed": false, "internalType": "uint256" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "InsuredJobCreated",
    "inputs": [
      { "name": "jobId", "type": "uint256", "indexed": true, "internalType": "uint256" },
      { "name": "buyer", "type": "address", "indexed": true, "internalType": "address" },
      { "name": "premiumPaid", "type": "uint256", "indexed": false, "internalType": "uint256" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ClaimPaid",
    "inputs": [
      { "name": "jobId", "type": "uint256", "indexed": true, "internalType": "uint256" },
      { "name": "buyer", "type": "address", "indexed": true, "internalType": "address" },
      { "name": "claimAmount", "type": "uint256", "indexed": false, "internalType": "uint256" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "PremiumCollected",
    "inputs": [
      { "name": "jobId", "type": "uint256", "indexed": true, "internalType": "uint256" },
      { "name": "buyer", "type": "address", "indexed": true, "internalType": "address" },
      { "name": "premiumAmount", "type": "uint256", "indexed": false, "internalType": "uint256" }
    ],
    "anonymous": false
  }
] as const;

// ─── X402CreditFacility ABI (frontend subset) ────────────────────────────────

export const X402CreditFacilityABI = [
  {
    "type": "function",
    "name": "getCreditLine",
    "inputs": [{ "name": "agent", "type": "address", "internalType": "address" }],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct IX402CreditFacility.CreditLine",
        "components": [
          { "name": "agent", "type": "address", "internalType": "address" },
          { "name": "creditLimit", "type": "uint256", "internalType": "uint256" },
          { "name": "totalDrawn", "type": "uint256", "internalType": "uint256" },
          { "name": "totalRepaid", "type": "uint256", "internalType": "uint256" },
          { "name": "interestRateBps", "type": "uint256", "internalType": "uint256" },
          { "name": "collateralDeposited", "type": "uint256", "internalType": "uint256" },
          { "name": "status", "type": "uint8", "internalType": "enum IX402CreditFacility.CreditLineStatus" },
          { "name": "openedAt", "type": "uint256", "internalType": "uint256" },
          { "name": "defaults", "type": "uint256", "internalType": "uint256" },
          { "name": "activeDraws", "type": "uint256", "internalType": "uint256" }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getDraw",
    "inputs": [{ "name": "drawId", "type": "uint256", "internalType": "uint256" }],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct IX402CreditFacility.CreditDraw",
        "components": [
          { "name": "id", "type": "uint256", "internalType": "uint256" },
          { "name": "creditLineId", "type": "uint256", "internalType": "uint256" },
          { "name": "agent", "type": "address", "internalType": "address" },
          { "name": "amount", "type": "uint256", "internalType": "uint256" },
          { "name": "interestAccrued", "type": "uint256", "internalType": "uint256" },
          { "name": "protocolFee", "type": "uint256", "internalType": "uint256" },
          { "name": "escrowJobId", "type": "uint256", "internalType": "uint256" },
          { "name": "drawnAt", "type": "uint256", "internalType": "uint256" },
          { "name": "repaidAt", "type": "uint256", "internalType": "uint256" },
          { "name": "liquidated", "type": "bool", "internalType": "bool" },
          { "name": "refundCredit", "type": "uint256", "internalType": "uint256" }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getActiveDrawIds",
    "inputs": [{ "name": "agent", "type": "address", "internalType": "address" }],
    "outputs": [{ "name": "", "type": "uint256[]", "internalType": "uint256[]" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getAvailableCredit",
    "inputs": [{ "name": "agent", "type": "address", "internalType": "address" }],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getPoolUtilization",
    "inputs": [],
    "outputs": [
      { "name": "total", "type": "uint256", "internalType": "uint256" },
      { "name": "outstanding", "type": "uint256", "internalType": "uint256" },
      { "name": "available", "type": "uint256", "internalType": "uint256" }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "openCreditLine",
    "inputs": [],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "closeCreditLine",
    "inputs": [],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "drawCreditAndCreateEscrow",
    "inputs": [
      { "name": "listingId", "type": "uint256", "internalType": "uint256" },
      { "name": "seller", "type": "address", "internalType": "address" },
      { "name": "amount", "type": "uint256", "internalType": "uint256" }
    ],
    "outputs": [{ "name": "drawId", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "repayDraw",
    "inputs": [{ "name": "drawId", "type": "uint256", "internalType": "uint256" }],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "confirmDelivery",
    "inputs": [{ "name": "escrowJobId", "type": "uint256", "internalType": "uint256" }],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "initiateDispute",
    "inputs": [
      { "name": "escrowJobId", "type": "uint256", "internalType": "uint256" },
      { "name": "evidenceURI", "type": "string", "internalType": "string" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "claimEscrowRefund",
    "inputs": [{ "name": "escrowJobId", "type": "uint256", "internalType": "uint256" }],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "liquidateDraw",
    "inputs": [{ "name": "drawId", "type": "uint256", "internalType": "uint256" }],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "depositToPool",
    "inputs": [{ "name": "amount", "type": "uint256", "internalType": "uint256" }],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "withdrawFromPool",
    "inputs": [{ "name": "amount", "type": "uint256", "internalType": "uint256" }],
    "outputs": [],
    "stateMutability": "nonpayable"
  }
] as const;

export const ReviewRegistryABI = [
  {
    "type": "function",
    "name": "getReview",
    "inputs": [{ "name": "reviewId", "type": "uint256", "internalType": "uint256" }],
    "outputs": [{ "name": "", "type": "tuple", "internalType": "struct IReviewRegistry.Review", "components": [{ "name": "id", "type": "uint256", "internalType": "uint256" }, { "name": "jobId", "type": "uint256", "internalType": "uint256" }, { "name": "reviewer", "type": "address", "internalType": "address" }, { "name": "subject", "type": "address", "internalType": "address" }, { "name": "rating", "type": "uint8", "internalType": "uint8" }, { "name": "metadataURI", "type": "string", "internalType": "string" }, { "name": "timestamp", "type": "uint256", "internalType": "uint256" }] }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getReviewByJobAndReviewer",
    "inputs": [{ "name": "jobId", "type": "uint256", "internalType": "uint256" }, { "name": "reviewer", "type": "address", "internalType": "address" }],
    "outputs": [{ "name": "", "type": "tuple", "internalType": "struct IReviewRegistry.Review", "components": [{ "name": "id", "type": "uint256", "internalType": "uint256" }, { "name": "jobId", "type": "uint256", "internalType": "uint256" }, { "name": "reviewer", "type": "address", "internalType": "address" }, { "name": "subject", "type": "address", "internalType": "address" }, { "name": "rating", "type": "uint8", "internalType": "uint8" }, { "name": "metadataURI", "type": "string", "internalType": "string" }, { "name": "timestamp", "type": "uint256", "internalType": "uint256" }] }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getRatingStats",
    "inputs": [{ "name": "subject", "type": "address", "internalType": "address" }],
    "outputs": [{ "name": "", "type": "tuple", "internalType": "struct IReviewRegistry.RatingStats", "components": [{ "name": "totalRatings", "type": "uint256", "internalType": "uint256" }, { "name": "sumRatings", "type": "uint256", "internalType": "uint256" }] }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getAverageRating",
    "inputs": [{ "name": "subject", "type": "address", "internalType": "address" }],
    "outputs": [{ "name": "numerator", "type": "uint256", "internalType": "uint256" }, { "name": "denominator", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "submitReview",
    "inputs": [{ "name": "jobId", "type": "uint256", "internalType": "uint256" }, { "name": "rating", "type": "uint8", "internalType": "uint8" }, { "name": "metadataURI", "type": "string", "internalType": "string" }],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "event",
    "name": "ReviewSubmitted",
    "inputs": [{ "name": "reviewId", "type": "uint256", "indexed": true, "internalType": "uint256" }, { "name": "jobId", "type": "uint256", "indexed": true, "internalType": "uint256" }, { "name": "reviewer", "type": "address", "indexed": true, "internalType": "address" }, { "name": "subject", "type": "address", "indexed": false, "internalType": "address" }, { "name": "rating", "type": "uint8", "indexed": false, "internalType": "uint8" }, { "name": "metadataURI", "type": "string", "indexed": false, "internalType": "string" }],
    "anonymous": false
  }
] as const;

// ═══════════════════════════════════════════════════════════════════════
//  SkillRegistry
// ═══════════════════════════════════════════════════════════════════════

export const SkillRegistryABI = [
  { "type": "function", "name": "getSkill", "inputs": [{ "name": "skillId", "type": "uint256", "internalType": "uint256" }], "outputs": [{ "name": "", "type": "tuple", "internalType": "struct ISkillRegistry.SkillListing", "components": [{ "name": "id", "type": "uint256", "internalType": "uint256" }, { "name": "seller", "type": "address", "internalType": "address" }, { "name": "assetType", "type": "uint8", "internalType": "enum ISkillRegistry.AssetType" }, { "name": "deliveryMethod", "type": "uint8", "internalType": "enum ISkillRegistry.DeliveryMethod" }, { "name": "pricingModel", "type": "uint8", "internalType": "enum ISkillRegistry.PricingModel" }, { "name": "title", "type": "string", "internalType": "string" }, { "name": "description", "type": "string", "internalType": "string" }, { "name": "metadataURI", "type": "string", "internalType": "string" }, { "name": "version", "type": "uint256", "internalType": "uint256" }, { "name": "price", "type": "uint256", "internalType": "uint256" }, { "name": "settlementToken", "type": "address", "internalType": "address" }, { "name": "apiEndpointHash", "type": "bytes32", "internalType": "bytes32" }, { "name": "packageHash", "type": "bytes32", "internalType": "bytes32" }, { "name": "active", "type": "bool", "internalType": "bool" }, { "name": "totalPurchases", "type": "uint256", "internalType": "uint256" }, { "name": "totalCalls", "type": "uint256", "internalType": "uint256" }, { "name": "createdAt", "type": "uint256", "internalType": "uint256" }, { "name": "updatedAt", "type": "uint256", "internalType": "uint256" }] }], "stateMutability": "view" },
  { "type": "function", "name": "getAccess", "inputs": [{ "name": "accessId", "type": "uint256", "internalType": "uint256" }], "outputs": [{ "name": "", "type": "tuple", "internalType": "struct ISkillRegistry.AccessRecord", "components": [{ "name": "id", "type": "uint256", "internalType": "uint256" }, { "name": "skillId", "type": "uint256", "internalType": "uint256" }, { "name": "buyer", "type": "address", "internalType": "address" }, { "name": "pricingModel", "type": "uint8", "internalType": "enum ISkillRegistry.PricingModel" }, { "name": "purchasedAt", "type": "uint256", "internalType": "uint256" }, { "name": "expiresAt", "type": "uint256", "internalType": "uint256" }, { "name": "totalCallsUsed", "type": "uint256", "internalType": "uint256" }, { "name": "totalPaid", "type": "uint256", "internalType": "uint256" }, { "name": "active", "type": "bool", "internalType": "bool" }] }], "stateMutability": "view" },
  { "type": "function", "name": "getMarketplaceTier", "inputs": [{ "name": "user", "type": "address", "internalType": "address" }], "outputs": [{ "name": "", "type": "uint8", "internalType": "enum ISkillRegistry.MarketplaceTier" }], "stateMutability": "view" },
  { "type": "function", "name": "getBuyerCredits", "inputs": [{ "name": "buyer", "type": "address", "internalType": "address" }, { "name": "token", "type": "address", "internalType": "address" }], "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }], "stateMutability": "view" },
  { "type": "function", "name": "getSkillDependencies", "inputs": [{ "name": "skillId", "type": "uint256", "internalType": "uint256" }], "outputs": [{ "name": "", "type": "uint256[]", "internalType": "uint256[]" }], "stateMutability": "view" },
  { "type": "function", "name": "getSellerListingCount", "inputs": [{ "name": "seller", "type": "address", "internalType": "address" }], "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }], "stateMutability": "view" },
  { "type": "function", "name": "hasActiveAccess", "inputs": [{ "name": "buyer", "type": "address", "internalType": "address" }, { "name": "skillId", "type": "uint256", "internalType": "uint256" }], "outputs": [{ "name": "", "type": "bool", "internalType": "bool" }], "stateMutability": "view" },
  { "type": "function", "name": "listSkill", "inputs": [{ "name": "params", "type": "tuple", "internalType": "struct ISkillRegistry.ListSkillParams", "components": [{ "name": "assetType", "type": "uint8", "internalType": "enum ISkillRegistry.AssetType" }, { "name": "deliveryMethod", "type": "uint8", "internalType": "enum ISkillRegistry.DeliveryMethod" }, { "name": "pricingModel", "type": "uint8", "internalType": "enum ISkillRegistry.PricingModel" }, { "name": "price", "type": "uint256", "internalType": "uint256" }, { "name": "settlementToken", "type": "address", "internalType": "address" }, { "name": "apiEndpointHash", "type": "bytes32", "internalType": "bytes32" }, { "name": "packageHash", "type": "bytes32", "internalType": "bytes32" }] }, { "name": "title", "type": "string", "internalType": "string" }, { "name": "description", "type": "string", "internalType": "string" }, { "name": "metadataURI", "type": "string", "internalType": "string" }, { "name": "requiredSkills", "type": "uint256[]", "internalType": "uint256[]" }], "outputs": [{ "name": "skillId", "type": "uint256", "internalType": "uint256" }], "stateMutability": "nonpayable" },
  { "type": "function", "name": "updateSkill", "inputs": [{ "name": "skillId", "type": "uint256", "internalType": "uint256" }, { "name": "newPrice", "type": "uint256", "internalType": "uint256" }, { "name": "newMetadataURI", "type": "string", "internalType": "string" }, { "name": "newApiEndpointHash", "type": "bytes32", "internalType": "bytes32" }, { "name": "newPackageHash", "type": "bytes32", "internalType": "bytes32" }], "outputs": [], "stateMutability": "nonpayable" },
  { "type": "function", "name": "deactivateSkill", "inputs": [{ "name": "skillId", "type": "uint256", "internalType": "uint256" }], "outputs": [], "stateMutability": "nonpayable" },
  { "type": "function", "name": "purchaseSkill", "inputs": [{ "name": "skillId", "type": "uint256", "internalType": "uint256" }], "outputs": [{ "name": "accessId", "type": "uint256", "internalType": "uint256" }], "stateMutability": "nonpayable" },
  { "type": "function", "name": "renewSubscription", "inputs": [{ "name": "accessId", "type": "uint256", "internalType": "uint256" }], "outputs": [], "stateMutability": "nonpayable" },
  { "type": "function", "name": "depositCallCredits", "inputs": [{ "name": "token", "type": "address", "internalType": "address" }, { "name": "amount", "type": "uint256", "internalType": "uint256" }], "outputs": [], "stateMutability": "nonpayable" },
  { "type": "function", "name": "withdrawCallCredits", "inputs": [{ "name": "token", "type": "address", "internalType": "address" }, { "name": "amount", "type": "uint256", "internalType": "uint256" }], "outputs": [], "stateMutability": "nonpayable" },
  { "type": "function", "name": "claimEarnings", "inputs": [{ "name": "token", "type": "address", "internalType": "address" }], "outputs": [], "stateMutability": "nonpayable" },
  { "type": "function", "name": "SUBSCRIPTION_PERIOD", "inputs": [], "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }], "stateMutability": "view" },
  { "type": "function", "name": "lobToken", "inputs": [], "outputs": [{ "name": "", "type": "address", "internalType": "contract IERC20" }], "stateMutability": "view" },
  { "type": "event", "name": "SkillListed", "inputs": [{ "name": "skillId", "type": "uint256", "indexed": true }, { "name": "seller", "type": "address", "indexed": true }, { "name": "assetType", "type": "uint8", "indexed": false }, { "name": "pricingModel", "type": "uint8", "indexed": false }, { "name": "price", "type": "uint256", "indexed": false }], "anonymous": false },
  { "type": "event", "name": "SkillPurchased", "inputs": [{ "name": "skillId", "type": "uint256", "indexed": true }, { "name": "buyer", "type": "address", "indexed": true }, { "name": "accessId", "type": "uint256", "indexed": false }, { "name": "pricingModel", "type": "uint8", "indexed": false }, { "name": "amount", "type": "uint256", "indexed": false }], "anonymous": false },
  { "type": "event", "name": "SkillDeactivated", "inputs": [{ "name": "skillId", "type": "uint256", "indexed": true }], "anonymous": false },
  { "type": "event", "name": "SubscriptionRenewed", "inputs": [{ "name": "accessId", "type": "uint256", "indexed": true }, { "name": "skillId", "type": "uint256", "indexed": true }, { "name": "buyer", "type": "address", "indexed": true }, { "name": "newExpiresAt", "type": "uint256", "indexed": false }], "anonymous": false },
  { "type": "event", "name": "CallCreditsDeposited", "inputs": [{ "name": "buyer", "type": "address", "indexed": true }, { "name": "token", "type": "address", "indexed": true }, { "name": "amount", "type": "uint256", "indexed": false }], "anonymous": false },
  { "type": "event", "name": "SellerPaid", "inputs": [{ "name": "seller", "type": "address", "indexed": true }, { "name": "token", "type": "address", "indexed": true }, { "name": "amount", "type": "uint256", "indexed": false }], "anonymous": false }
] as const;

// ═══════════════════════════════════════════════════════════════════════
//  PipelineRouter
// ═══════════════════════════════════════════════════════════════════════

export const PipelineRouterABI = [
  { "type": "function", "name": "getPipeline", "inputs": [{ "name": "pipelineId", "type": "uint256", "internalType": "uint256" }], "outputs": [{ "name": "", "type": "tuple", "internalType": "struct IPipelineRouter.Pipeline", "components": [{ "name": "id", "type": "uint256", "internalType": "uint256" }, { "name": "owner", "type": "address", "internalType": "address" }, { "name": "name", "type": "string", "internalType": "string" }, { "name": "isPublic", "type": "bool", "internalType": "bool" }, { "name": "executionCount", "type": "uint256", "internalType": "uint256" }, { "name": "createdAt", "type": "uint256", "internalType": "uint256" }, { "name": "active", "type": "bool", "internalType": "bool" }] }], "stateMutability": "view" },
  { "type": "function", "name": "getPipelineSteps", "inputs": [{ "name": "pipelineId", "type": "uint256", "internalType": "uint256" }], "outputs": [{ "name": "", "type": "uint256[]", "internalType": "uint256[]" }], "stateMutability": "view" },
  { "type": "function", "name": "getPipelineStepConfigs", "inputs": [{ "name": "pipelineId", "type": "uint256", "internalType": "uint256" }], "outputs": [{ "name": "", "type": "bytes[]", "internalType": "bytes[]" }], "stateMutability": "view" },
  { "type": "function", "name": "createPipeline", "inputs": [{ "name": "name", "type": "string", "internalType": "string" }, { "name": "skillIds", "type": "uint256[]", "internalType": "uint256[]" }, { "name": "stepConfigs", "type": "bytes[]", "internalType": "bytes[]" }, { "name": "isPublic", "type": "bool", "internalType": "bool" }], "outputs": [{ "name": "pipelineId", "type": "uint256", "internalType": "uint256" }], "stateMutability": "nonpayable" },
  { "type": "function", "name": "executePipeline", "inputs": [{ "name": "pipelineId", "type": "uint256", "internalType": "uint256" }], "outputs": [], "stateMutability": "nonpayable" },
  { "type": "function", "name": "updatePipeline", "inputs": [{ "name": "pipelineId", "type": "uint256", "internalType": "uint256" }, { "name": "newName", "type": "string", "internalType": "string" }, { "name": "newSkillIds", "type": "uint256[]", "internalType": "uint256[]" }, { "name": "newStepConfigs", "type": "bytes[]", "internalType": "bytes[]" }, { "name": "isPublic", "type": "bool", "internalType": "bool" }], "outputs": [], "stateMutability": "nonpayable" },
  { "type": "function", "name": "deactivatePipeline", "inputs": [{ "name": "pipelineId", "type": "uint256", "internalType": "uint256" }], "outputs": [], "stateMutability": "nonpayable" },
  { "type": "event", "name": "PipelineCreated", "inputs": [{ "name": "pipelineId", "type": "uint256", "indexed": true }, { "name": "owner", "type": "address", "indexed": true }, { "name": "name", "type": "string", "indexed": false }, { "name": "isPublic", "type": "bool", "indexed": false }], "anonymous": false },
  { "type": "event", "name": "PipelineExecuted", "inputs": [{ "name": "pipelineId", "type": "uint256", "indexed": true }, { "name": "executor", "type": "address", "indexed": true }, { "name": "executionCount", "type": "uint256", "indexed": false }], "anonymous": false },
  { "type": "event", "name": "PipelineDeactivated", "inputs": [{ "name": "pipelineId", "type": "uint256", "indexed": true }], "anonymous": false }
] as const;

// ═══════════════════════════════════════════════════════════════════════
//  StakingRewards
// ═══════════════════════════════════════════════════════════════════════

export const StakingRewardsABI = [
  { "type": "function", "name": "earned", "inputs": [{ "name": "user", "type": "address" }, { "name": "token", "type": "address" }], "outputs": [{ "name": "", "type": "uint256" }], "stateMutability": "view" },
  { "type": "function", "name": "getEffectiveBalance", "inputs": [{ "name": "user", "type": "address" }], "outputs": [{ "name": "", "type": "uint256" }], "stateMutability": "view" },
  { "type": "function", "name": "getRewardTokens", "inputs": [], "outputs": [{ "name": "", "type": "address[]" }], "stateMutability": "view" },
  { "type": "function", "name": "getTotalEffectiveBalance", "inputs": [], "outputs": [{ "name": "", "type": "uint256" }], "stateMutability": "view" },
  { "type": "function", "name": "rewardPerToken", "inputs": [{ "name": "token", "type": "address" }], "outputs": [{ "name": "", "type": "uint256" }], "stateMutability": "view" },
  { "type": "function", "name": "lastTimeRewardApplicable", "inputs": [{ "name": "token", "type": "address" }], "outputs": [{ "name": "", "type": "uint256" }], "stateMutability": "view" },
  { "type": "function", "name": "syncStake", "inputs": [], "outputs": [], "stateMutability": "nonpayable" },
  { "type": "function", "name": "claimRewards", "inputs": [{ "name": "token", "type": "address" }], "outputs": [], "stateMutability": "nonpayable" },
  { "type": "function", "name": "paused", "inputs": [], "outputs": [{ "name": "", "type": "bool" }], "stateMutability": "view" },
  { "type": "function", "name": "stakingManager", "inputs": [], "outputs": [{ "name": "", "type": "address" }], "stateMutability": "view" },
  { "type": "function", "name": "BRONZE_MULTIPLIER", "inputs": [], "outputs": [{ "name": "", "type": "uint256" }], "stateMutability": "view" },
  { "type": "function", "name": "SILVER_MULTIPLIER", "inputs": [], "outputs": [{ "name": "", "type": "uint256" }], "stateMutability": "view" },
  { "type": "function", "name": "GOLD_MULTIPLIER", "inputs": [], "outputs": [{ "name": "", "type": "uint256" }], "stateMutability": "view" },
  { "type": "function", "name": "PLATINUM_MULTIPLIER", "inputs": [], "outputs": [{ "name": "", "type": "uint256" }], "stateMutability": "view" },
  { "type": "event", "name": "StakeSynced", "inputs": [{ "name": "user", "type": "address", "indexed": true }, { "name": "effectiveBalance", "type": "uint256", "indexed": false }, { "name": "stakingTier", "type": "uint256", "indexed": false }], "anonymous": false },
  { "type": "event", "name": "RewardsClaimed", "inputs": [{ "name": "user", "type": "address", "indexed": true }, { "name": "token", "type": "address", "indexed": true }, { "name": "amount", "type": "uint256", "indexed": false }], "anonymous": false },
] as const;

// ═══════════════════════════════════════════════════════════════════════
//  LiquidityMining
// ═══════════════════════════════════════════════════════════════════════

export const LiquidityMiningABI = [
  { "type": "function", "name": "earned", "inputs": [{ "name": "user", "type": "address" }], "outputs": [{ "name": "", "type": "uint256" }], "stateMutability": "view" },
  { "type": "function", "name": "balanceOf", "inputs": [{ "name": "user", "type": "address" }], "outputs": [{ "name": "", "type": "uint256" }], "stateMutability": "view" },
  { "type": "function", "name": "totalSupply", "inputs": [], "outputs": [{ "name": "", "type": "uint256" }], "stateMutability": "view" },
  { "type": "function", "name": "getBoostMultiplier", "inputs": [{ "name": "user", "type": "address" }], "outputs": [{ "name": "", "type": "uint256" }], "stateMutability": "view" },
  { "type": "function", "name": "rewardPerToken", "inputs": [], "outputs": [{ "name": "", "type": "uint256" }], "stateMutability": "view" },
  { "type": "function", "name": "rewardRate", "inputs": [], "outputs": [{ "name": "", "type": "uint256" }], "stateMutability": "view" },
  { "type": "function", "name": "periodFinish", "inputs": [], "outputs": [{ "name": "", "type": "uint256" }], "stateMutability": "view" },
  { "type": "function", "name": "lastTimeRewardApplicable", "inputs": [], "outputs": [{ "name": "", "type": "uint256" }], "stateMutability": "view" },
  { "type": "function", "name": "lpToken", "inputs": [], "outputs": [{ "name": "", "type": "address" }], "stateMutability": "view" },
  { "type": "function", "name": "rewardToken", "inputs": [], "outputs": [{ "name": "", "type": "address" }], "stateMutability": "view" },
  { "type": "function", "name": "paused", "inputs": [], "outputs": [{ "name": "", "type": "bool" }], "stateMutability": "view" },
  { "type": "function", "name": "stake", "inputs": [{ "name": "amount", "type": "uint256" }], "outputs": [], "stateMutability": "nonpayable" },
  { "type": "function", "name": "withdraw", "inputs": [{ "name": "amount", "type": "uint256" }], "outputs": [], "stateMutability": "nonpayable" },
  { "type": "function", "name": "getReward", "inputs": [], "outputs": [], "stateMutability": "nonpayable" },
  { "type": "function", "name": "exit", "inputs": [], "outputs": [], "stateMutability": "nonpayable" },
  { "type": "function", "name": "emergencyWithdraw", "inputs": [], "outputs": [], "stateMutability": "nonpayable" },
  { "type": "event", "name": "Staked", "inputs": [{ "name": "user", "type": "address", "indexed": true }, { "name": "amount", "type": "uint256", "indexed": false }], "anonymous": false },
  { "type": "event", "name": "Withdrawn", "inputs": [{ "name": "user", "type": "address", "indexed": true }, { "name": "amount", "type": "uint256", "indexed": false }], "anonymous": false },
  { "type": "event", "name": "RewardPaid", "inputs": [{ "name": "user", "type": "address", "indexed": true }, { "name": "amount", "type": "uint256", "indexed": false }], "anonymous": false },
  { "type": "event", "name": "EmergencyWithdrawn", "inputs": [{ "name": "user", "type": "address", "indexed": true }, { "name": "amount", "type": "uint256", "indexed": false }], "anonymous": false },
] as const;

// ═══════════════════════════════════════════════════════════════════════
//  RewardScheduler
// ═══════════════════════════════════════════════════════════════════════

export const RewardSchedulerABI = [
  { "type": "function", "name": "getStream", "inputs": [{ "name": "streamId", "type": "uint256" }], "outputs": [{ "name": "", "type": "tuple", "components": [{ "name": "id", "type": "uint256" }, { "name": "targetType", "type": "uint8" }, { "name": "rewardToken", "type": "address" }, { "name": "emissionPerSecond", "type": "uint256" }, { "name": "lastDripTime", "type": "uint256" }, { "name": "endTime", "type": "uint256" }, { "name": "active", "type": "bool" }] }], "stateMutability": "view" },
  { "type": "function", "name": "getActiveStreams", "inputs": [], "outputs": [{ "name": "", "type": "tuple[]", "components": [{ "name": "id", "type": "uint256" }, { "name": "targetType", "type": "uint8" }, { "name": "rewardToken", "type": "address" }, { "name": "emissionPerSecond", "type": "uint256" }, { "name": "lastDripTime", "type": "uint256" }, { "name": "endTime", "type": "uint256" }, { "name": "active", "type": "bool" }] }], "stateMutability": "view" },
  { "type": "function", "name": "streamBalance", "inputs": [{ "name": "streamId", "type": "uint256" }], "outputs": [{ "name": "", "type": "uint256" }], "stateMutability": "view" },
  { "type": "function", "name": "getStreamCount", "inputs": [], "outputs": [{ "name": "", "type": "uint256" }], "stateMutability": "view" },
  { "type": "function", "name": "drip", "inputs": [{ "name": "streamId", "type": "uint256" }], "outputs": [], "stateMutability": "nonpayable" },
  { "type": "function", "name": "dripAll", "inputs": [], "outputs": [], "stateMutability": "nonpayable" },
  { "type": "function", "name": "paused", "inputs": [], "outputs": [{ "name": "", "type": "bool" }], "stateMutability": "view" },
  { "type": "function", "name": "stakingRewards", "inputs": [], "outputs": [{ "name": "", "type": "address" }], "stateMutability": "view" },
  { "type": "function", "name": "liquidityMining", "inputs": [], "outputs": [{ "name": "", "type": "address" }], "stateMutability": "view" },
  { "type": "event", "name": "StreamDripped", "inputs": [{ "name": "streamId", "type": "uint256", "indexed": true }, { "name": "amount", "type": "uint256", "indexed": false }, { "name": "elapsed", "type": "uint256", "indexed": false }], "anonymous": false },
] as const;

// ─── MultiPartyEscrow ABI ─────────────────────────────────────────────────────

export const MultiPartyEscrowABI = [
  { "type": "function", "name": "DEFAULT_ADMIN_ROLE", "inputs": [], "outputs": [{ "name": "", "type": "bytes32", "internalType": "bytes32" }], "stateMutability": "view" },
  { "type": "function", "name": "MAX_SELLERS", "inputs": [], "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }], "stateMutability": "view" },
  { "type": "function", "name": "confirmDelivery", "inputs": [{ "name": "jobId", "type": "uint256", "internalType": "uint256" }], "outputs": [], "stateMutability": "nonpayable" },
  { "type": "function", "name": "createMultiJob", "inputs": [{ "name": "sellers", "type": "address[]", "internalType": "address[]" }, { "name": "shares", "type": "uint256[]", "internalType": "uint256[]" }, { "name": "listingIds", "type": "uint256[]", "internalType": "uint256[]" }, { "name": "token", "type": "address", "internalType": "address" }, { "name": "totalAmount", "type": "uint256", "internalType": "uint256" }, { "name": "metadataURI", "type": "string", "internalType": "string" }], "outputs": [{ "name": "groupId", "type": "uint256", "internalType": "uint256" }], "stateMutability": "nonpayable" },
  { "type": "function", "name": "escrowEngine", "inputs": [], "outputs": [{ "name": "", "type": "address", "internalType": "contract IEscrowEngine" }], "stateMutability": "view" },
  { "type": "function", "name": "getGroup", "inputs": [{ "name": "groupId", "type": "uint256", "internalType": "uint256" }], "outputs": [{ "name": "", "type": "tuple", "internalType": "struct IMultiPartyEscrow.JobGroup", "components": [{ "name": "groupId", "type": "uint256", "internalType": "uint256" }, { "name": "buyer", "type": "address", "internalType": "address" }, { "name": "totalAmount", "type": "uint256", "internalType": "uint256" }, { "name": "token", "type": "address", "internalType": "address" }, { "name": "jobCount", "type": "uint256", "internalType": "uint256" }, { "name": "metadataURI", "type": "string", "internalType": "string" }, { "name": "createdAt", "type": "uint256", "internalType": "uint256" }] }], "stateMutability": "view" },
  { "type": "function", "name": "getGroupJobIds", "inputs": [{ "name": "groupId", "type": "uint256", "internalType": "uint256" }], "outputs": [{ "name": "", "type": "uint256[]", "internalType": "uint256[]" }], "stateMutability": "view" },
  { "type": "function", "name": "getGroupStatus", "inputs": [{ "name": "groupId", "type": "uint256", "internalType": "uint256" }], "outputs": [{ "name": "", "type": "uint8", "internalType": "enum IMultiPartyEscrow.GroupStatus" }], "stateMutability": "view" },
  { "type": "function", "name": "getJobGroup", "inputs": [{ "name": "jobId", "type": "uint256", "internalType": "uint256" }], "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }], "stateMutability": "view" },
  { "type": "function", "name": "initiateDispute", "inputs": [{ "name": "jobId", "type": "uint256", "internalType": "uint256" }, { "name": "evidenceURI", "type": "string", "internalType": "string" }], "outputs": [], "stateMutability": "nonpayable" },
  { "type": "function", "name": "lobToken", "inputs": [], "outputs": [{ "name": "", "type": "address", "internalType": "contract IERC20" }], "stateMutability": "view" },
  { "type": "function", "name": "paused", "inputs": [], "outputs": [{ "name": "", "type": "bool", "internalType": "bool" }], "stateMutability": "view" },
  { "type": "function", "name": "sybilGuard", "inputs": [], "outputs": [{ "name": "", "type": "address", "internalType": "contract ISybilGuard" }], "stateMutability": "view" },
  { "type": "event", "name": "GroupCompleted", "inputs": [{ "name": "groupId", "type": "uint256", "indexed": true, "internalType": "uint256" }], "anonymous": false },
  { "type": "event", "name": "MultiJobCreated", "inputs": [{ "name": "groupId", "type": "uint256", "indexed": true, "internalType": "uint256" }, { "name": "buyer", "type": "address", "indexed": true, "internalType": "address" }, { "name": "jobIds", "type": "uint256[]", "indexed": false, "internalType": "uint256[]" }, { "name": "sellers", "type": "address[]", "indexed": false, "internalType": "address[]" }, { "name": "shares", "type": "uint256[]", "indexed": false, "internalType": "uint256[]" }, { "name": "token", "type": "address", "indexed": false, "internalType": "address" }, { "name": "totalAmount", "type": "uint256", "indexed": false, "internalType": "uint256" }], "anonymous": false },
  { "type": "event", "name": "Paused", "inputs": [{ "name": "account", "type": "address", "indexed": false, "internalType": "address" }], "anonymous": false },
  { "type": "event", "name": "Unpaused", "inputs": [{ "name": "account", "type": "address", "indexed": false, "internalType": "address" }], "anonymous": false }
] as const;

// ─── AffiliateManager ABI ─────────────────────────────────────────────────────

export const AffiliateManagerABI = [
  { "type": "function", "name": "CREDITOR_ROLE", "inputs": [], "outputs": [{ "name": "", "type": "bytes32", "internalType": "bytes32" }], "stateMutability": "view" },
  { "type": "function", "name": "DEFAULT_ADMIN_ROLE", "inputs": [], "outputs": [{ "name": "", "type": "bytes32", "internalType": "bytes32" }], "stateMutability": "view" },
  { "type": "function", "name": "claimRewards", "inputs": [{ "name": "token", "type": "address", "internalType": "address" }], "outputs": [], "stateMutability": "nonpayable" },
  { "type": "function", "name": "claimableBalance", "inputs": [{ "name": "referrer", "type": "address", "internalType": "address" }, { "name": "token", "type": "address", "internalType": "address" }], "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }], "stateMutability": "view" },
  { "type": "function", "name": "creditReferralReward", "inputs": [{ "name": "referrer", "type": "address", "internalType": "address" }, { "name": "token", "type": "address", "internalType": "address" }, { "name": "amount", "type": "uint256", "internalType": "uint256" }], "outputs": [], "stateMutability": "nonpayable" },
  { "type": "function", "name": "getReferralInfo", "inputs": [{ "name": "referred", "type": "address", "internalType": "address" }], "outputs": [{ "name": "", "type": "tuple", "internalType": "struct IAffiliateManager.ReferralInfo", "components": [{ "name": "referrer", "type": "address", "internalType": "address" }, { "name": "registeredAt", "type": "uint256", "internalType": "uint256" }] }], "stateMutability": "view" },
  { "type": "function", "name": "getReferrerStats", "inputs": [{ "name": "referrer", "type": "address", "internalType": "address" }], "outputs": [{ "name": "", "type": "tuple", "internalType": "struct IAffiliateManager.ReferrerStats", "components": [{ "name": "totalReferred", "type": "uint256", "internalType": "uint256" }, { "name": "totalRewardsCredited", "type": "uint256", "internalType": "uint256" }, { "name": "totalRewardsClaimed", "type": "uint256", "internalType": "uint256" }, { "name": "pendingRewards", "type": "uint256", "internalType": "uint256" }] }], "stateMutability": "view" },
  { "type": "function", "name": "paused", "inputs": [], "outputs": [{ "name": "", "type": "bool", "internalType": "bool" }], "stateMutability": "view" },
  { "type": "function", "name": "registerReferral", "inputs": [{ "name": "referred", "type": "address", "internalType": "address" }], "outputs": [], "stateMutability": "nonpayable" },
  { "type": "function", "name": "sybilGuard", "inputs": [], "outputs": [{ "name": "", "type": "address", "internalType": "contract ISybilGuard" }], "stateMutability": "view" },
  { "type": "event", "name": "Paused", "inputs": [{ "name": "account", "type": "address", "indexed": false, "internalType": "address" }], "anonymous": false },
  { "type": "event", "name": "ReferralRegistered", "inputs": [{ "name": "referrer", "type": "address", "indexed": true, "internalType": "address" }, { "name": "referred", "type": "address", "indexed": true, "internalType": "address" }, { "name": "timestamp", "type": "uint256", "indexed": false, "internalType": "uint256" }], "anonymous": false },
  { "type": "event", "name": "ReferralRewardCredited", "inputs": [{ "name": "referrer", "type": "address", "indexed": true, "internalType": "address" }, { "name": "token", "type": "address", "indexed": true, "internalType": "address" }, { "name": "amount", "type": "uint256", "indexed": false, "internalType": "uint256" }], "anonymous": false },
  { "type": "event", "name": "RewardsClaimed", "inputs": [{ "name": "referrer", "type": "address", "indexed": true, "internalType": "address" }, { "name": "token", "type": "address", "indexed": true, "internalType": "address" }, { "name": "amount", "type": "uint256", "indexed": false, "internalType": "uint256" }], "anonymous": false },
  { "type": "event", "name": "Unpaused", "inputs": [{ "name": "account", "type": "address", "indexed": false, "internalType": "address" }], "anonymous": false }
] as const;

// ─── LoanEngine ABI ─────────────────────────────────────────────────────────

export const LoanEngineABI = [
  { "type": "function", "name": "BPS_DENOMINATOR", "inputs": [], "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }], "stateMutability": "view" },
  { "type": "function", "name": "DAYS_PER_YEAR", "inputs": [], "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }], "stateMutability": "view" },
  { "type": "function", "name": "DEFAULTS_BEFORE_RESTRICTION", "inputs": [], "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }], "stateMutability": "view" },
  { "type": "function", "name": "DEFAULT_ADMIN_ROLE", "inputs": [], "outputs": [{ "name": "", "type": "bytes32", "internalType": "bytes32" }], "stateMutability": "view" },
  { "type": "function", "name": "GOLD_COLLATERAL_BPS", "inputs": [], "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }], "stateMutability": "view" },
  { "type": "function", "name": "GOLD_INTEREST_BPS", "inputs": [], "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }], "stateMutability": "view" },
  { "type": "function", "name": "GOLD_MAX_BORROW", "inputs": [], "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }], "stateMutability": "view" },
  { "type": "function", "name": "GRACE_PERIOD", "inputs": [], "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }], "stateMutability": "view" },
  { "type": "function", "name": "MAX_ACTIVE_LOANS", "inputs": [], "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }], "stateMutability": "view" },
  { "type": "function", "name": "PLATINUM_COLLATERAL_BPS", "inputs": [], "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }], "stateMutability": "view" },
  { "type": "function", "name": "PLATINUM_INTEREST_BPS", "inputs": [], "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }], "stateMutability": "view" },
  { "type": "function", "name": "PLATINUM_MAX_BORROW", "inputs": [], "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }], "stateMutability": "view" },
  { "type": "function", "name": "PROTOCOL_FEE_BPS", "inputs": [], "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }], "stateMutability": "view" },
  { "type": "function", "name": "REQUEST_EXPIRY", "inputs": [], "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }], "stateMutability": "view" },
  { "type": "function", "name": "SILVER_COLLATERAL_BPS", "inputs": [], "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }], "stateMutability": "view" },
  { "type": "function", "name": "SILVER_INTEREST_BPS", "inputs": [], "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }], "stateMutability": "view" },
  { "type": "function", "name": "SILVER_MAX_BORROW", "inputs": [], "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }], "stateMutability": "view" },
  { "type": "function", "name": "cancelLoan", "inputs": [{ "name": "loanId", "type": "uint256", "internalType": "uint256" }], "outputs": [], "stateMutability": "nonpayable" },
  { "type": "function", "name": "cleanupExpiredRequest", "inputs": [{ "name": "loanId", "type": "uint256", "internalType": "uint256" }], "outputs": [], "stateMutability": "nonpayable" },
  { "type": "function", "name": "fundLoan", "inputs": [{ "name": "loanId", "type": "uint256", "internalType": "uint256" }], "outputs": [], "stateMutability": "nonpayable" },
  { "type": "function", "name": "getActiveLoanIds", "inputs": [{ "name": "borrower", "type": "address", "internalType": "address" }], "outputs": [{ "name": "", "type": "uint256[]", "internalType": "uint256[]" }], "stateMutability": "view" },
  { "type": "function", "name": "getBorrowerProfile", "inputs": [{ "name": "borrower", "type": "address", "internalType": "address" }], "outputs": [{ "name": "", "type": "tuple", "internalType": "struct ILoanEngine.BorrowerProfile", "components": [{ "name": "activeLoans", "type": "uint256", "internalType": "uint256" }, { "name": "totalBorrowed", "type": "uint256", "internalType": "uint256" }, { "name": "totalRepaid", "type": "uint256", "internalType": "uint256" }, { "name": "defaults", "type": "uint256", "internalType": "uint256" }, { "name": "restricted", "type": "bool", "internalType": "bool" }] }], "stateMutability": "view" },
  { "type": "function", "name": "getCollateralRequired", "inputs": [{ "name": "principal", "type": "uint256", "internalType": "uint256" }, { "name": "borrower", "type": "address", "internalType": "address" }], "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }], "stateMutability": "view" },
  { "type": "function", "name": "getInterestRate", "inputs": [{ "name": "borrower", "type": "address", "internalType": "address" }], "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }], "stateMutability": "view" },
  { "type": "function", "name": "getLoan", "inputs": [{ "name": "loanId", "type": "uint256", "internalType": "uint256" }], "outputs": [{ "name": "", "type": "tuple", "internalType": "struct ILoanEngine.Loan", "components": [{ "name": "id", "type": "uint256", "internalType": "uint256" }, { "name": "borrower", "type": "address", "internalType": "address" }, { "name": "lender", "type": "address", "internalType": "address" }, { "name": "principal", "type": "uint256", "internalType": "uint256" }, { "name": "interestAmount", "type": "uint256", "internalType": "uint256" }, { "name": "protocolFee", "type": "uint256", "internalType": "uint256" }, { "name": "collateralAmount", "type": "uint256", "internalType": "uint256" }, { "name": "totalRepaid", "type": "uint256", "internalType": "uint256" }, { "name": "status", "type": "uint8", "internalType": "enum ILoanEngine.LoanStatus" }, { "name": "term", "type": "uint8", "internalType": "enum ILoanEngine.LoanTerm" }, { "name": "requestedAt", "type": "uint256", "internalType": "uint256" }, { "name": "fundedAt", "type": "uint256", "internalType": "uint256" }, { "name": "dueDate", "type": "uint256", "internalType": "uint256" }] }], "stateMutability": "view" },
  { "type": "function", "name": "getMaxBorrow", "inputs": [{ "name": "borrower", "type": "address", "internalType": "address" }], "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }], "stateMutability": "view" },
  { "type": "function", "name": "getOutstandingAmount", "inputs": [{ "name": "loanId", "type": "uint256", "internalType": "uint256" }], "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }], "stateMutability": "view" },
  { "type": "function", "name": "getRoleAdmin", "inputs": [{ "name": "role", "type": "bytes32", "internalType": "bytes32" }], "outputs": [{ "name": "", "type": "bytes32", "internalType": "bytes32" }], "stateMutability": "view" },
  { "type": "function", "name": "getTermDuration", "inputs": [{ "name": "term", "type": "uint8", "internalType": "enum ILoanEngine.LoanTerm" }], "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }], "stateMutability": "pure" },
  { "type": "function", "name": "grantRole", "inputs": [{ "name": "role", "type": "bytes32", "internalType": "bytes32" }, { "name": "account", "type": "address", "internalType": "address" }], "outputs": [], "stateMutability": "nonpayable" },
  { "type": "function", "name": "hasRole", "inputs": [{ "name": "role", "type": "bytes32", "internalType": "bytes32" }, { "name": "account", "type": "address", "internalType": "address" }], "outputs": [{ "name": "", "type": "bool", "internalType": "bool" }], "stateMutability": "view" },
  { "type": "function", "name": "liftRestriction", "inputs": [{ "name": "borrower", "type": "address", "internalType": "address" }], "outputs": [], "stateMutability": "nonpayable" },
  { "type": "function", "name": "liquidate", "inputs": [{ "name": "loanId", "type": "uint256", "internalType": "uint256" }], "outputs": [], "stateMutability": "nonpayable" },
  { "type": "function", "name": "lobToken", "inputs": [], "outputs": [{ "name": "", "type": "address", "internalType": "contract IERC20" }], "stateMutability": "view" },
  { "type": "function", "name": "pause", "inputs": [], "outputs": [], "stateMutability": "nonpayable" },
  { "type": "function", "name": "paused", "inputs": [], "outputs": [{ "name": "", "type": "bool", "internalType": "bool" }], "stateMutability": "view" },
  { "type": "function", "name": "renounceRole", "inputs": [{ "name": "role", "type": "bytes32", "internalType": "bytes32" }, { "name": "account", "type": "address", "internalType": "address" }], "outputs": [], "stateMutability": "nonpayable" },
  { "type": "function", "name": "repay", "inputs": [{ "name": "loanId", "type": "uint256", "internalType": "uint256" }, { "name": "amount", "type": "uint256", "internalType": "uint256" }], "outputs": [], "stateMutability": "nonpayable" },
  { "type": "function", "name": "reputationSystem", "inputs": [], "outputs": [{ "name": "", "type": "address", "internalType": "contract IReputationSystem" }], "stateMutability": "view" },
  { "type": "function", "name": "requestLoan", "inputs": [{ "name": "principal", "type": "uint256", "internalType": "uint256" }, { "name": "term", "type": "uint8", "internalType": "enum ILoanEngine.LoanTerm" }], "outputs": [{ "name": "loanId", "type": "uint256", "internalType": "uint256" }], "stateMutability": "nonpayable" },
  { "type": "function", "name": "revokeRole", "inputs": [{ "name": "role", "type": "bytes32", "internalType": "bytes32" }, { "name": "account", "type": "address", "internalType": "address" }], "outputs": [], "stateMutability": "nonpayable" },
  { "type": "function", "name": "stakingManager", "inputs": [], "outputs": [{ "name": "", "type": "address", "internalType": "contract IStakingManager" }], "stateMutability": "view" },
  { "type": "function", "name": "supportsInterface", "inputs": [{ "name": "interfaceId", "type": "bytes4", "internalType": "bytes4" }], "outputs": [{ "name": "", "type": "bool", "internalType": "bool" }], "stateMutability": "view" },
  { "type": "function", "name": "sybilGuard", "inputs": [], "outputs": [{ "name": "", "type": "address", "internalType": "contract ISybilGuard" }], "stateMutability": "view" },
  { "type": "function", "name": "treasury", "inputs": [], "outputs": [{ "name": "", "type": "address", "internalType": "address" }], "stateMutability": "view" },
  { "type": "function", "name": "unpause", "inputs": [], "outputs": [], "stateMutability": "nonpayable" },
  { "type": "event", "name": "BorrowerRestricted", "inputs": [{ "name": "borrower", "type": "address", "indexed": true, "internalType": "address" }, { "name": "defaults", "type": "uint256", "indexed": false, "internalType": "uint256" }], "anonymous": false },
  { "type": "event", "name": "LoanCancelled", "inputs": [{ "name": "loanId", "type": "uint256", "indexed": true, "internalType": "uint256" }], "anonymous": false },
  { "type": "event", "name": "LoanDefaulted", "inputs": [{ "name": "loanId", "type": "uint256", "indexed": true, "internalType": "uint256" }, { "name": "borrower", "type": "address", "indexed": true, "internalType": "address" }], "anonymous": false },
  { "type": "event", "name": "LoanFunded", "inputs": [{ "name": "loanId", "type": "uint256", "indexed": true, "internalType": "uint256" }, { "name": "lender", "type": "address", "indexed": true, "internalType": "address" }], "anonymous": false },
  { "type": "event", "name": "LoanLiquidated", "inputs": [{ "name": "loanId", "type": "uint256", "indexed": true, "internalType": "uint256" }, { "name": "collateralSeized", "type": "uint256", "indexed": false, "internalType": "uint256" }, { "name": "stakeSlashed", "type": "uint256", "indexed": false, "internalType": "uint256" }], "anonymous": false },
  { "type": "event", "name": "LoanRepaid", "inputs": [{ "name": "loanId", "type": "uint256", "indexed": true, "internalType": "uint256" }], "anonymous": false },
  { "type": "event", "name": "LoanRequested", "inputs": [{ "name": "loanId", "type": "uint256", "indexed": true, "internalType": "uint256" }, { "name": "borrower", "type": "address", "indexed": true, "internalType": "address" }, { "name": "principal", "type": "uint256", "indexed": false, "internalType": "uint256" }, { "name": "term", "type": "uint8", "indexed": false, "internalType": "enum ILoanEngine.LoanTerm" }], "anonymous": false },
  { "type": "event", "name": "Paused", "inputs": [{ "name": "account", "type": "address", "indexed": false, "internalType": "address" }], "anonymous": false },
  { "type": "event", "name": "RepaymentMade", "inputs": [{ "name": "loanId", "type": "uint256", "indexed": true, "internalType": "uint256" }, { "name": "amount", "type": "uint256", "indexed": false, "internalType": "uint256" }, { "name": "remaining", "type": "uint256", "indexed": false, "internalType": "uint256" }], "anonymous": false },
  { "type": "event", "name": "RoleAdminChanged", "inputs": [{ "name": "role", "type": "bytes32", "indexed": true, "internalType": "bytes32" }, { "name": "previousAdminRole", "type": "bytes32", "indexed": true, "internalType": "bytes32" }, { "name": "newAdminRole", "type": "bytes32", "indexed": true, "internalType": "bytes32" }], "anonymous": false },
  { "type": "event", "name": "RoleGranted", "inputs": [{ "name": "role", "type": "bytes32", "indexed": true, "internalType": "bytes32" }, { "name": "account", "type": "address", "indexed": true, "internalType": "address" }, { "name": "sender", "type": "address", "indexed": true, "internalType": "address" }], "anonymous": false },
  { "type": "event", "name": "RoleRevoked", "inputs": [{ "name": "role", "type": "bytes32", "indexed": true, "internalType": "bytes32" }, { "name": "account", "type": "address", "indexed": true, "internalType": "address" }, { "name": "sender", "type": "address", "indexed": true, "internalType": "address" }], "anonymous": false },
  { "type": "event", "name": "Unpaused", "inputs": [{ "name": "account", "type": "address", "indexed": false, "internalType": "address" }], "anonymous": false }
] as const;

// ─── SubscriptionEngine ABI ─────────────────────────────────────────────────

export const SubscriptionEngineABI = [
  { "type": "function", "name": "DEFAULT_ADMIN_ROLE", "inputs": [], "outputs": [{ "name": "", "type": "bytes32", "internalType": "bytes32" }], "stateMutability": "view" },
  { "type": "function", "name": "MAX_PROCESSING_WINDOW", "inputs": [], "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }], "stateMutability": "view" },
  { "type": "function", "name": "MIN_INTERVAL", "inputs": [], "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }], "stateMutability": "view" },
  { "type": "function", "name": "USDC_FEE_BPS", "inputs": [], "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }], "stateMutability": "view" },
  { "type": "function", "name": "cancelSubscription", "inputs": [{ "name": "subscriptionId", "type": "uint256", "internalType": "uint256" }], "outputs": [], "stateMutability": "nonpayable" },
  { "type": "function", "name": "createSubscription", "inputs": [{ "name": "seller", "type": "address", "internalType": "address" }, { "name": "token", "type": "address", "internalType": "address" }, { "name": "amount", "type": "uint256", "internalType": "uint256" }, { "name": "interval", "type": "uint256", "internalType": "uint256" }, { "name": "maxCycles", "type": "uint256", "internalType": "uint256" }, { "name": "listingId", "type": "uint256", "internalType": "uint256" }, { "name": "metadataURI", "type": "string", "internalType": "string" }], "outputs": [{ "name": "id", "type": "uint256", "internalType": "uint256" }], "stateMutability": "nonpayable" },
  { "type": "function", "name": "getRoleAdmin", "inputs": [{ "name": "role", "type": "bytes32", "internalType": "bytes32" }], "outputs": [{ "name": "", "type": "bytes32", "internalType": "bytes32" }], "stateMutability": "view" },
  { "type": "function", "name": "getSubscription", "inputs": [{ "name": "id", "type": "uint256", "internalType": "uint256" }], "outputs": [{ "name": "", "type": "tuple", "internalType": "struct ISubscriptionEngine.Subscription", "components": [{ "name": "id", "type": "uint256", "internalType": "uint256" }, { "name": "buyer", "type": "address", "internalType": "address" }, { "name": "seller", "type": "address", "internalType": "address" }, { "name": "token", "type": "address", "internalType": "address" }, { "name": "amount", "type": "uint256", "internalType": "uint256" }, { "name": "interval", "type": "uint256", "internalType": "uint256" }, { "name": "nextDue", "type": "uint256", "internalType": "uint256" }, { "name": "maxCycles", "type": "uint256", "internalType": "uint256" }, { "name": "cyclesCompleted", "type": "uint256", "internalType": "uint256" }, { "name": "status", "type": "uint8", "internalType": "enum ISubscriptionEngine.SubscriptionStatus" }, { "name": "listingId", "type": "uint256", "internalType": "uint256" }, { "name": "metadataURI", "type": "string", "internalType": "string" }, { "name": "createdAt", "type": "uint256", "internalType": "uint256" }] }], "stateMutability": "view" },
  { "type": "function", "name": "getSubscriptionsByBuyer", "inputs": [{ "name": "buyer", "type": "address", "internalType": "address" }], "outputs": [{ "name": "", "type": "uint256[]", "internalType": "uint256[]" }], "stateMutability": "view" },
  { "type": "function", "name": "getSubscriptionsBySeller", "inputs": [{ "name": "seller", "type": "address", "internalType": "address" }], "outputs": [{ "name": "", "type": "uint256[]", "internalType": "uint256[]" }], "stateMutability": "view" },
  { "type": "function", "name": "grantRole", "inputs": [{ "name": "role", "type": "bytes32", "internalType": "bytes32" }, { "name": "account", "type": "address", "internalType": "address" }], "outputs": [], "stateMutability": "nonpayable" },
  { "type": "function", "name": "hasRole", "inputs": [{ "name": "role", "type": "bytes32", "internalType": "bytes32" }, { "name": "account", "type": "address", "internalType": "address" }], "outputs": [{ "name": "", "type": "bool", "internalType": "bool" }], "stateMutability": "view" },
  { "type": "function", "name": "lobToken", "inputs": [], "outputs": [{ "name": "", "type": "address", "internalType": "contract IERC20" }], "stateMutability": "view" },
  { "type": "function", "name": "pause", "inputs": [], "outputs": [], "stateMutability": "nonpayable" },
  { "type": "function", "name": "pauseSubscription", "inputs": [{ "name": "subscriptionId", "type": "uint256", "internalType": "uint256" }], "outputs": [], "stateMutability": "nonpayable" },
  { "type": "function", "name": "paused", "inputs": [], "outputs": [{ "name": "", "type": "bool", "internalType": "bool" }], "stateMutability": "view" },
  { "type": "function", "name": "processPayment", "inputs": [{ "name": "subscriptionId", "type": "uint256", "internalType": "uint256" }], "outputs": [], "stateMutability": "nonpayable" },
  { "type": "function", "name": "renounceRole", "inputs": [{ "name": "role", "type": "bytes32", "internalType": "bytes32" }, { "name": "account", "type": "address", "internalType": "address" }], "outputs": [], "stateMutability": "nonpayable" },
  { "type": "function", "name": "reputationSystem", "inputs": [], "outputs": [{ "name": "", "type": "address", "internalType": "contract IReputationSystem" }], "stateMutability": "view" },
  { "type": "function", "name": "resumeSubscription", "inputs": [{ "name": "subscriptionId", "type": "uint256", "internalType": "uint256" }], "outputs": [], "stateMutability": "nonpayable" },
  { "type": "function", "name": "revokeRole", "inputs": [{ "name": "role", "type": "bytes32", "internalType": "bytes32" }, { "name": "account", "type": "address", "internalType": "address" }], "outputs": [], "stateMutability": "nonpayable" },
  { "type": "function", "name": "supportsInterface", "inputs": [{ "name": "interfaceId", "type": "bytes4", "internalType": "bytes4" }], "outputs": [{ "name": "", "type": "bool", "internalType": "bool" }], "stateMutability": "view" },
  { "type": "function", "name": "sybilGuard", "inputs": [], "outputs": [{ "name": "", "type": "address", "internalType": "contract ISybilGuard" }], "stateMutability": "view" },
  { "type": "function", "name": "treasury", "inputs": [], "outputs": [{ "name": "", "type": "address", "internalType": "address" }], "stateMutability": "view" },
  { "type": "function", "name": "unpause", "inputs": [], "outputs": [], "stateMutability": "nonpayable" },
  { "type": "event", "name": "Paused", "inputs": [{ "name": "account", "type": "address", "indexed": false, "internalType": "address" }], "anonymous": false },
  { "type": "event", "name": "PaymentProcessed", "inputs": [{ "name": "id", "type": "uint256", "indexed": true, "internalType": "uint256" }, { "name": "cycleNumber", "type": "uint256", "indexed": false, "internalType": "uint256" }, { "name": "amount", "type": "uint256", "indexed": false, "internalType": "uint256" }, { "name": "fee", "type": "uint256", "indexed": false, "internalType": "uint256" }], "anonymous": false },
  { "type": "event", "name": "RoleAdminChanged", "inputs": [{ "name": "role", "type": "bytes32", "indexed": true, "internalType": "bytes32" }, { "name": "previousAdminRole", "type": "bytes32", "indexed": true, "internalType": "bytes32" }, { "name": "newAdminRole", "type": "bytes32", "indexed": true, "internalType": "bytes32" }], "anonymous": false },
  { "type": "event", "name": "RoleGranted", "inputs": [{ "name": "role", "type": "bytes32", "indexed": true, "internalType": "bytes32" }, { "name": "account", "type": "address", "indexed": true, "internalType": "address" }, { "name": "sender", "type": "address", "indexed": true, "internalType": "address" }], "anonymous": false },
  { "type": "event", "name": "RoleRevoked", "inputs": [{ "name": "role", "type": "bytes32", "indexed": true, "internalType": "bytes32" }, { "name": "account", "type": "address", "indexed": true, "internalType": "address" }, { "name": "sender", "type": "address", "indexed": true, "internalType": "address" }], "anonymous": false },
  { "type": "event", "name": "SubscriptionCancelled", "inputs": [{ "name": "id", "type": "uint256", "indexed": true, "internalType": "uint256" }, { "name": "cancelledBy", "type": "address", "indexed": false, "internalType": "address" }], "anonymous": false },
  { "type": "event", "name": "SubscriptionCompleted", "inputs": [{ "name": "id", "type": "uint256", "indexed": true, "internalType": "uint256" }], "anonymous": false },
  { "type": "event", "name": "SubscriptionCreated", "inputs": [{ "name": "id", "type": "uint256", "indexed": true, "internalType": "uint256" }, { "name": "buyer", "type": "address", "indexed": true, "internalType": "address" }, { "name": "seller", "type": "address", "indexed": true, "internalType": "address" }, { "name": "token", "type": "address", "indexed": false, "internalType": "address" }, { "name": "amount", "type": "uint256", "indexed": false, "internalType": "uint256" }, { "name": "interval", "type": "uint256", "indexed": false, "internalType": "uint256" }, { "name": "maxCycles", "type": "uint256", "indexed": false, "internalType": "uint256" }], "anonymous": false },
  { "type": "event", "name": "SubscriptionPaused", "inputs": [{ "name": "id", "type": "uint256", "indexed": true, "internalType": "uint256" }], "anonymous": false },
  { "type": "event", "name": "SubscriptionResumed", "inputs": [{ "name": "id", "type": "uint256", "indexed": true, "internalType": "uint256" }, { "name": "newNextDue", "type": "uint256", "indexed": false, "internalType": "uint256" }], "anonymous": false },
  { "type": "event", "name": "Unpaused", "inputs": [{ "name": "account", "type": "address", "indexed": false, "internalType": "address" }], "anonymous": false }
] as const;

// ─── BondingEngine ABI ──────────────────────────────────────────────────────

export const BondingEngineABI = [
  { "type": "function", "name": "DEFAULT_ADMIN_ROLE", "inputs": [], "outputs": [{ "name": "", "type": "bytes32", "internalType": "bytes32" }], "stateMutability": "view" },
  { "type": "function", "name": "GOLD_BONUS_BPS", "inputs": [], "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }], "stateMutability": "view" },
  { "type": "function", "name": "MARKET_ADMIN_ROLE", "inputs": [], "outputs": [{ "name": "", "type": "bytes32", "internalType": "bytes32" }], "stateMutability": "view" },
  { "type": "function", "name": "MAX_DISCOUNT_BPS", "inputs": [], "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }], "stateMutability": "view" },
  { "type": "function", "name": "MIN_VESTING_PERIOD", "inputs": [], "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }], "stateMutability": "view" },
  { "type": "function", "name": "PLATINUM_BONUS_BPS", "inputs": [], "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }], "stateMutability": "view" },
  { "type": "function", "name": "SILVER_BONUS_BPS", "inputs": [], "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }], "stateMutability": "view" },
  { "type": "function", "name": "availableLOB", "inputs": [], "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }], "stateMutability": "view" },
  { "type": "function", "name": "bondCount", "inputs": [], "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }], "stateMutability": "view" },
  { "type": "function", "name": "claim", "inputs": [{ "name": "bondId", "type": "uint256", "internalType": "uint256" }], "outputs": [], "stateMutability": "nonpayable" },
  { "type": "function", "name": "claimMultiple", "inputs": [{ "name": "bondIds", "type": "uint256[]", "internalType": "uint256[]" }], "outputs": [], "stateMutability": "nonpayable" },
  { "type": "function", "name": "claimable", "inputs": [{ "name": "bondId", "type": "uint256", "internalType": "uint256" }], "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }], "stateMutability": "view" },
  { "type": "function", "name": "closeMarket", "inputs": [{ "name": "marketId", "type": "uint256", "internalType": "uint256" }], "outputs": [], "stateMutability": "nonpayable" },
  { "type": "function", "name": "createMarket", "inputs": [{ "name": "quoteToken", "type": "address", "internalType": "address" }, { "name": "pricePer1LOB", "type": "uint256", "internalType": "uint256" }, { "name": "discountBps", "type": "uint256", "internalType": "uint256" }, { "name": "vestingPeriod", "type": "uint256", "internalType": "uint256" }, { "name": "capacity", "type": "uint256", "internalType": "uint256" }, { "name": "addressCap", "type": "uint256", "internalType": "uint256" }], "outputs": [{ "name": "marketId", "type": "uint256", "internalType": "uint256" }], "stateMutability": "nonpayable" },
  { "type": "function", "name": "depositLOB", "inputs": [{ "name": "amount", "type": "uint256", "internalType": "uint256" }], "outputs": [], "stateMutability": "nonpayable" },
  { "type": "function", "name": "effectiveDiscount", "inputs": [{ "name": "marketId", "type": "uint256", "internalType": "uint256" }, { "name": "buyer", "type": "address", "internalType": "address" }], "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }], "stateMutability": "view" },
  { "type": "function", "name": "getBond", "inputs": [{ "name": "bondId", "type": "uint256", "internalType": "uint256" }], "outputs": [{ "name": "", "type": "tuple", "internalType": "struct IBondingEngine.BondPosition", "components": [{ "name": "marketId", "type": "uint256", "internalType": "uint256" }, { "name": "owner", "type": "address", "internalType": "address" }, { "name": "payout", "type": "uint256", "internalType": "uint256" }, { "name": "claimed", "type": "uint256", "internalType": "uint256" }, { "name": "vestStart", "type": "uint256", "internalType": "uint256" }, { "name": "vestEnd", "type": "uint256", "internalType": "uint256" }] }], "stateMutability": "view" },
  { "type": "function", "name": "getBondsByOwner", "inputs": [{ "name": "owner", "type": "address", "internalType": "address" }], "outputs": [{ "name": "", "type": "uint256[]", "internalType": "uint256[]" }], "stateMutability": "view" },
  { "type": "function", "name": "getMarket", "inputs": [{ "name": "marketId", "type": "uint256", "internalType": "uint256" }], "outputs": [{ "name": "", "type": "tuple", "internalType": "struct IBondingEngine.BondMarket", "components": [{ "name": "quoteToken", "type": "address", "internalType": "address" }, { "name": "pricePer1LOB", "type": "uint256", "internalType": "uint256" }, { "name": "discountBps", "type": "uint256", "internalType": "uint256" }, { "name": "vestingPeriod", "type": "uint256", "internalType": "uint256" }, { "name": "capacity", "type": "uint256", "internalType": "uint256" }, { "name": "sold", "type": "uint256", "internalType": "uint256" }, { "name": "active", "type": "bool", "internalType": "bool" }, { "name": "addressCap", "type": "uint256", "internalType": "uint256" }] }], "stateMutability": "view" },
  { "type": "function", "name": "getRoleAdmin", "inputs": [{ "name": "role", "type": "bytes32", "internalType": "bytes32" }], "outputs": [{ "name": "", "type": "bytes32", "internalType": "bytes32" }], "stateMutability": "view" },
  { "type": "function", "name": "grantRole", "inputs": [{ "name": "role", "type": "bytes32", "internalType": "bytes32" }, { "name": "account", "type": "address", "internalType": "address" }], "outputs": [], "stateMutability": "nonpayable" },
  { "type": "function", "name": "hasRole", "inputs": [{ "name": "role", "type": "bytes32", "internalType": "bytes32" }, { "name": "account", "type": "address", "internalType": "address" }], "outputs": [{ "name": "", "type": "bool", "internalType": "bool" }], "stateMutability": "view" },
  { "type": "function", "name": "lobToken", "inputs": [], "outputs": [{ "name": "", "type": "address", "internalType": "contract IERC20" }], "stateMutability": "view" },
  { "type": "function", "name": "marketCount", "inputs": [], "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }], "stateMutability": "view" },
  { "type": "function", "name": "pause", "inputs": [], "outputs": [], "stateMutability": "nonpayable" },
  { "type": "function", "name": "paused", "inputs": [], "outputs": [{ "name": "", "type": "bool", "internalType": "bool" }], "stateMutability": "view" },
  { "type": "function", "name": "purchase", "inputs": [{ "name": "marketId", "type": "uint256", "internalType": "uint256" }, { "name": "quoteAmount", "type": "uint256", "internalType": "uint256" }], "outputs": [{ "name": "bondId", "type": "uint256", "internalType": "uint256" }], "stateMutability": "nonpayable" },
  { "type": "function", "name": "purchasedByAddress", "inputs": [{ "name": "marketId", "type": "uint256", "internalType": "uint256" }, { "name": "buyer", "type": "address", "internalType": "address" }], "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }], "stateMutability": "view" },
  { "type": "function", "name": "renounceRole", "inputs": [{ "name": "role", "type": "bytes32", "internalType": "bytes32" }, { "name": "account", "type": "address", "internalType": "address" }], "outputs": [], "stateMutability": "nonpayable" },
  { "type": "function", "name": "revokeRole", "inputs": [{ "name": "role", "type": "bytes32", "internalType": "bytes32" }, { "name": "account", "type": "address", "internalType": "address" }], "outputs": [], "stateMutability": "nonpayable" },
  { "type": "function", "name": "stakingManager", "inputs": [], "outputs": [{ "name": "", "type": "address", "internalType": "contract IStakingManager" }], "stateMutability": "view" },
  { "type": "function", "name": "supportsInterface", "inputs": [{ "name": "interfaceId", "type": "bytes4", "internalType": "bytes4" }], "outputs": [{ "name": "", "type": "bool", "internalType": "bool" }], "stateMutability": "view" },
  { "type": "function", "name": "sweepQuoteToken", "inputs": [{ "name": "token", "type": "address", "internalType": "address" }], "outputs": [], "stateMutability": "nonpayable" },
  { "type": "function", "name": "sybilGuard", "inputs": [], "outputs": [{ "name": "", "type": "address", "internalType": "contract ISybilGuard" }], "stateMutability": "view" },
  { "type": "function", "name": "totalOutstandingLOB", "inputs": [], "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }], "stateMutability": "view" },
  { "type": "function", "name": "treasury", "inputs": [], "outputs": [{ "name": "", "type": "address", "internalType": "address" }], "stateMutability": "view" },
  { "type": "function", "name": "unpause", "inputs": [], "outputs": [], "stateMutability": "nonpayable" },
  { "type": "function", "name": "updateMarketPrice", "inputs": [{ "name": "marketId", "type": "uint256", "internalType": "uint256" }, { "name": "newPrice", "type": "uint256", "internalType": "uint256" }], "outputs": [], "stateMutability": "nonpayable" },
  { "type": "function", "name": "withdrawLOB", "inputs": [{ "name": "amount", "type": "uint256", "internalType": "uint256" }], "outputs": [], "stateMutability": "nonpayable" },
  { "type": "event", "name": "BondClaimed", "inputs": [{ "name": "bondId", "type": "uint256", "indexed": true, "internalType": "uint256" }, { "name": "owner", "type": "address", "indexed": true, "internalType": "address" }, { "name": "amount", "type": "uint256", "indexed": false, "internalType": "uint256" }], "anonymous": false },
  { "type": "event", "name": "BondPurchased", "inputs": [{ "name": "bondId", "type": "uint256", "indexed": true, "internalType": "uint256" }, { "name": "marketId", "type": "uint256", "indexed": true, "internalType": "uint256" }, { "name": "buyer", "type": "address", "indexed": true, "internalType": "address" }, { "name": "quoteAmount", "type": "uint256", "indexed": false, "internalType": "uint256" }, { "name": "payout", "type": "uint256", "indexed": false, "internalType": "uint256" }, { "name": "vestEnd", "type": "uint256", "indexed": false, "internalType": "uint256" }], "anonymous": false },
  { "type": "event", "name": "LOBDeposited", "inputs": [{ "name": "from", "type": "address", "indexed": true, "internalType": "address" }, { "name": "amount", "type": "uint256", "indexed": false, "internalType": "uint256" }], "anonymous": false },
  { "type": "event", "name": "LOBWithdrawn", "inputs": [{ "name": "to", "type": "address", "indexed": true, "internalType": "address" }, { "name": "amount", "type": "uint256", "indexed": false, "internalType": "uint256" }], "anonymous": false },
  { "type": "event", "name": "MarketClosed", "inputs": [{ "name": "marketId", "type": "uint256", "indexed": true, "internalType": "uint256" }], "anonymous": false },
  { "type": "event", "name": "MarketCreated", "inputs": [{ "name": "marketId", "type": "uint256", "indexed": true, "internalType": "uint256" }, { "name": "quoteToken", "type": "address", "indexed": true, "internalType": "address" }, { "name": "pricePer1LOB", "type": "uint256", "indexed": false, "internalType": "uint256" }, { "name": "discountBps", "type": "uint256", "indexed": false, "internalType": "uint256" }, { "name": "vestingPeriod", "type": "uint256", "indexed": false, "internalType": "uint256" }, { "name": "capacity", "type": "uint256", "indexed": false, "internalType": "uint256" }], "anonymous": false },
  { "type": "event", "name": "MarketPriceUpdated", "inputs": [{ "name": "marketId", "type": "uint256", "indexed": true, "internalType": "uint256" }, { "name": "newPrice", "type": "uint256", "indexed": false, "internalType": "uint256" }], "anonymous": false },
  { "type": "event", "name": "Paused", "inputs": [{ "name": "account", "type": "address", "indexed": false, "internalType": "address" }], "anonymous": false },
  { "type": "event", "name": "QuoteTokenSwept", "inputs": [{ "name": "token", "type": "address", "indexed": true, "internalType": "address" }, { "name": "amount", "type": "uint256", "indexed": false, "internalType": "uint256" }], "anonymous": false },
  { "type": "event", "name": "RoleAdminChanged", "inputs": [{ "name": "role", "type": "bytes32", "indexed": true, "internalType": "bytes32" }, { "name": "previousAdminRole", "type": "bytes32", "indexed": true, "internalType": "bytes32" }, { "name": "newAdminRole", "type": "bytes32", "indexed": true, "internalType": "bytes32" }], "anonymous": false },
  { "type": "event", "name": "RoleGranted", "inputs": [{ "name": "role", "type": "bytes32", "indexed": true, "internalType": "bytes32" }, { "name": "account", "type": "address", "indexed": true, "internalType": "address" }, { "name": "sender", "type": "address", "indexed": true, "internalType": "address" }], "anonymous": false },
  { "type": "event", "name": "RoleRevoked", "inputs": [{ "name": "role", "type": "bytes32", "indexed": true, "internalType": "bytes32" }, { "name": "account", "type": "address", "indexed": true, "internalType": "address" }, { "name": "sender", "type": "address", "indexed": true, "internalType": "address" }], "anonymous": false },
  { "type": "event", "name": "Unpaused", "inputs": [{ "name": "account", "type": "address", "indexed": false, "internalType": "address" }], "anonymous": false }
] as const;

// ─── LightningGovernor ABI ──────────────────────────────────────────────────

export const LightningGovernorABI = [
  { "type": "function", "name": "DEFAULT_ADMIN_ROLE", "inputs": [], "outputs": [{ "name": "", "type": "bytes32", "internalType": "bytes32" }], "stateMutability": "view" },
  { "type": "function", "name": "EXECUTOR_ROLE", "inputs": [], "outputs": [{ "name": "", "type": "bytes32", "internalType": "bytes32" }], "stateMutability": "view" },
  { "type": "function", "name": "GUARDIAN_ROLE", "inputs": [], "outputs": [{ "name": "", "type": "bytes32", "internalType": "bytes32" }], "stateMutability": "view" },
  { "type": "function", "name": "MAX_EXECUTION_DELAY", "inputs": [], "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }], "stateMutability": "view" },
  { "type": "function", "name": "MAX_EXECUTION_WINDOW", "inputs": [], "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }], "stateMutability": "view" },
  { "type": "function", "name": "MAX_QUORUM", "inputs": [], "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }], "stateMutability": "view" },
  { "type": "function", "name": "MAX_VOTING_WINDOW", "inputs": [], "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }], "stateMutability": "view" },
  { "type": "function", "name": "MIN_EXECUTION_DELAY", "inputs": [], "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }], "stateMutability": "view" },
  { "type": "function", "name": "MIN_EXECUTION_WINDOW", "inputs": [], "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }], "stateMutability": "view" },
  { "type": "function", "name": "MIN_QUORUM", "inputs": [], "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }], "stateMutability": "view" },
  { "type": "function", "name": "MIN_VOTING_WINDOW", "inputs": [], "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }], "stateMutability": "view" },
  { "type": "function", "name": "PROPOSAL_COOLDOWN", "inputs": [], "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }], "stateMutability": "view" },
  { "type": "function", "name": "cancel", "inputs": [{ "name": "proposalId", "type": "uint256", "internalType": "uint256" }], "outputs": [], "stateMutability": "nonpayable" },
  { "type": "function", "name": "createProposal", "inputs": [{ "name": "target", "type": "address", "internalType": "address" }, { "name": "data", "type": "bytes", "internalType": "bytes" }, { "name": "description", "type": "string", "internalType": "string" }], "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }], "stateMutability": "nonpayable" },
  { "type": "function", "name": "execute", "inputs": [{ "name": "proposalId", "type": "uint256", "internalType": "uint256" }], "outputs": [], "stateMutability": "nonpayable" },
  { "type": "function", "name": "executionDelay", "inputs": [], "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }], "stateMutability": "view" },
  { "type": "function", "name": "executionWindow", "inputs": [], "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }], "stateMutability": "view" },
  { "type": "function", "name": "getEffectiveStatus", "inputs": [{ "name": "proposalId", "type": "uint256", "internalType": "uint256" }], "outputs": [{ "name": "", "type": "uint8", "internalType": "enum ILightningGovernor.ProposalStatus" }], "stateMutability": "view" },
  { "type": "function", "name": "getProposal", "inputs": [{ "name": "proposalId", "type": "uint256", "internalType": "uint256" }], "outputs": [{ "name": "", "type": "tuple", "internalType": "struct ILightningGovernor.Proposal", "components": [{ "name": "id", "type": "uint256", "internalType": "uint256" }, { "name": "proposer", "type": "address", "internalType": "address" }, { "name": "target", "type": "address", "internalType": "address" }, { "name": "callData", "type": "bytes", "internalType": "bytes" }, { "name": "description", "type": "string", "internalType": "string" }, { "name": "status", "type": "uint8", "internalType": "enum ILightningGovernor.ProposalStatus" }, { "name": "voteCount", "type": "uint256", "internalType": "uint256" }, { "name": "createdAt", "type": "uint256", "internalType": "uint256" }, { "name": "votingDeadline", "type": "uint256", "internalType": "uint256" }, { "name": "approvedAt", "type": "uint256", "internalType": "uint256" }, { "name": "executionDeadline", "type": "uint256", "internalType": "uint256" }] }], "stateMutability": "view" },
  { "type": "function", "name": "getRoleAdmin", "inputs": [{ "name": "role", "type": "bytes32", "internalType": "bytes32" }], "outputs": [{ "name": "", "type": "bytes32", "internalType": "bytes32" }], "stateMutability": "view" },
  { "type": "function", "name": "grantRole", "inputs": [{ "name": "role", "type": "bytes32", "internalType": "bytes32" }, { "name": "account", "type": "address", "internalType": "address" }], "outputs": [], "stateMutability": "nonpayable" },
  { "type": "function", "name": "hasRole", "inputs": [{ "name": "role", "type": "bytes32", "internalType": "bytes32" }, { "name": "account", "type": "address", "internalType": "address" }], "outputs": [{ "name": "", "type": "bool", "internalType": "bool" }], "stateMutability": "view" },
  { "type": "function", "name": "hasVoted", "inputs": [{ "name": "proposalId", "type": "uint256", "internalType": "uint256" }, { "name": "voter", "type": "address", "internalType": "address" }], "outputs": [{ "name": "", "type": "bool", "internalType": "bool" }], "stateMutability": "view" },
  { "type": "function", "name": "isWhitelisted", "inputs": [{ "name": "target", "type": "address", "internalType": "address" }, { "name": "selector", "type": "bytes4", "internalType": "bytes4" }], "outputs": [{ "name": "", "type": "bool", "internalType": "bool" }], "stateMutability": "view" },
  { "type": "function", "name": "pause", "inputs": [], "outputs": [], "stateMutability": "nonpayable" },
  { "type": "function", "name": "paused", "inputs": [], "outputs": [{ "name": "", "type": "bool", "internalType": "bool" }], "stateMutability": "view" },
  { "type": "function", "name": "proposalCount", "inputs": [], "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }], "stateMutability": "view" },
  { "type": "function", "name": "quorum", "inputs": [], "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }], "stateMutability": "view" },
  { "type": "function", "name": "renounceRole", "inputs": [{ "name": "role", "type": "bytes32", "internalType": "bytes32" }, { "name": "account", "type": "address", "internalType": "address" }], "outputs": [], "stateMutability": "nonpayable" },
  { "type": "function", "name": "revokeRole", "inputs": [{ "name": "role", "type": "bytes32", "internalType": "bytes32" }, { "name": "account", "type": "address", "internalType": "address" }], "outputs": [], "stateMutability": "nonpayable" },
  { "type": "function", "name": "setExecutionDelay", "inputs": [{ "name": "newDelay", "type": "uint256", "internalType": "uint256" }], "outputs": [], "stateMutability": "nonpayable" },
  { "type": "function", "name": "setExecutionWindow", "inputs": [{ "name": "newWindow", "type": "uint256", "internalType": "uint256" }], "outputs": [], "stateMutability": "nonpayable" },
  { "type": "function", "name": "setQuorum", "inputs": [{ "name": "newQuorum", "type": "uint256", "internalType": "uint256" }], "outputs": [], "stateMutability": "nonpayable" },
  { "type": "function", "name": "setVotingWindow", "inputs": [{ "name": "newWindow", "type": "uint256", "internalType": "uint256" }], "outputs": [], "stateMutability": "nonpayable" },
  { "type": "function", "name": "setWhitelisted", "inputs": [{ "name": "target", "type": "address", "internalType": "address" }, { "name": "selector", "type": "bytes4", "internalType": "bytes4" }, { "name": "allowed", "type": "bool", "internalType": "bool" }], "outputs": [], "stateMutability": "nonpayable" },
  { "type": "function", "name": "stakingManager", "inputs": [], "outputs": [{ "name": "", "type": "address", "internalType": "contract IStakingManager" }], "stateMutability": "view" },
  { "type": "function", "name": "supportsInterface", "inputs": [{ "name": "interfaceId", "type": "bytes4", "internalType": "bytes4" }], "outputs": [{ "name": "", "type": "bool", "internalType": "bool" }], "stateMutability": "view" },
  { "type": "function", "name": "unpause", "inputs": [], "outputs": [], "stateMutability": "nonpayable" },
  { "type": "function", "name": "vote", "inputs": [{ "name": "proposalId", "type": "uint256", "internalType": "uint256" }], "outputs": [], "stateMutability": "nonpayable" },
  { "type": "function", "name": "votingWindow", "inputs": [], "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }], "stateMutability": "view" },
  { "type": "event", "name": "ExecutionDelayUpdated", "inputs": [{ "name": "oldDelay", "type": "uint256", "indexed": false, "internalType": "uint256" }, { "name": "newDelay", "type": "uint256", "indexed": false, "internalType": "uint256" }], "anonymous": false },
  { "type": "event", "name": "ExecutionWindowUpdated", "inputs": [{ "name": "oldWindow", "type": "uint256", "indexed": false, "internalType": "uint256" }, { "name": "newWindow", "type": "uint256", "indexed": false, "internalType": "uint256" }], "anonymous": false },
  { "type": "event", "name": "Paused", "inputs": [{ "name": "account", "type": "address", "indexed": false, "internalType": "address" }], "anonymous": false },
  { "type": "event", "name": "ProposalApproved", "inputs": [{ "name": "proposalId", "type": "uint256", "indexed": true, "internalType": "uint256" }, { "name": "executionDeadline", "type": "uint256", "indexed": false, "internalType": "uint256" }], "anonymous": false },
  { "type": "event", "name": "ProposalCancelled", "inputs": [{ "name": "proposalId", "type": "uint256", "indexed": true, "internalType": "uint256" }, { "name": "cancelledBy", "type": "address", "indexed": true, "internalType": "address" }], "anonymous": false },
  { "type": "event", "name": "ProposalCreated", "inputs": [{ "name": "proposalId", "type": "uint256", "indexed": true, "internalType": "uint256" }, { "name": "proposer", "type": "address", "indexed": true, "internalType": "address" }, { "name": "target", "type": "address", "indexed": false, "internalType": "address" }, { "name": "selector", "type": "bytes4", "indexed": false, "internalType": "bytes4" }, { "name": "description", "type": "string", "indexed": false, "internalType": "string" }], "anonymous": false },
  { "type": "event", "name": "ProposalExecuted", "inputs": [{ "name": "proposalId", "type": "uint256", "indexed": true, "internalType": "uint256" }, { "name": "executor", "type": "address", "indexed": true, "internalType": "address" }], "anonymous": false },
  { "type": "event", "name": "QuorumUpdated", "inputs": [{ "name": "oldQuorum", "type": "uint256", "indexed": false, "internalType": "uint256" }, { "name": "newQuorum", "type": "uint256", "indexed": false, "internalType": "uint256" }], "anonymous": false },
  { "type": "event", "name": "RoleAdminChanged", "inputs": [{ "name": "role", "type": "bytes32", "indexed": true, "internalType": "bytes32" }, { "name": "previousAdminRole", "type": "bytes32", "indexed": true, "internalType": "bytes32" }, { "name": "newAdminRole", "type": "bytes32", "indexed": true, "internalType": "bytes32" }], "anonymous": false },
  { "type": "event", "name": "RoleGranted", "inputs": [{ "name": "role", "type": "bytes32", "indexed": true, "internalType": "bytes32" }, { "name": "account", "type": "address", "indexed": true, "internalType": "address" }, { "name": "sender", "type": "address", "indexed": true, "internalType": "address" }], "anonymous": false },
  { "type": "event", "name": "RoleRevoked", "inputs": [{ "name": "role", "type": "bytes32", "indexed": true, "internalType": "bytes32" }, { "name": "account", "type": "address", "indexed": true, "internalType": "address" }, { "name": "sender", "type": "address", "indexed": true, "internalType": "address" }], "anonymous": false },
  { "type": "event", "name": "Unpaused", "inputs": [{ "name": "account", "type": "address", "indexed": false, "internalType": "address" }], "anonymous": false },
  { "type": "event", "name": "Voted", "inputs": [{ "name": "proposalId", "type": "uint256", "indexed": true, "internalType": "uint256" }, { "name": "voter", "type": "address", "indexed": true, "internalType": "address" }, { "name": "newVoteCount", "type": "uint256", "indexed": false, "internalType": "uint256" }], "anonymous": false },
  { "type": "event", "name": "VotingWindowUpdated", "inputs": [{ "name": "oldWindow", "type": "uint256", "indexed": false, "internalType": "uint256" }, { "name": "newWindow", "type": "uint256", "indexed": false, "internalType": "uint256" }], "anonymous": false },
  { "type": "event", "name": "WhitelistUpdated", "inputs": [{ "name": "target", "type": "address", "indexed": true, "internalType": "address" }, { "name": "selector", "type": "bytes4", "indexed": true, "internalType": "bytes4" }, { "name": "allowed", "type": "bool", "indexed": false, "internalType": "bool" }], "anonymous": false }
] as const;

// ─── DirectiveBoard ABI ─────────────────────────────────────────────────────

export const DirectiveBoardABI = [
  { "type": "function", "name": "DEFAULT_ADMIN_ROLE", "inputs": [], "outputs": [{ "name": "", "type": "bytes32", "internalType": "bytes32" }], "stateMutability": "view" },
  { "type": "function", "name": "EXECUTOR_ROLE", "inputs": [], "outputs": [{ "name": "", "type": "bytes32", "internalType": "bytes32" }], "stateMutability": "view" },
  { "type": "function", "name": "POSTER_ROLE", "inputs": [], "outputs": [{ "name": "", "type": "bytes32", "internalType": "bytes32" }], "stateMutability": "view" },
  { "type": "function", "name": "cancelDirective", "inputs": [{ "name": "id", "type": "uint256", "internalType": "uint256" }], "outputs": [], "stateMutability": "nonpayable" },
  { "type": "function", "name": "getActiveDirectives", "inputs": [{ "name": "target", "type": "address", "internalType": "address" }], "outputs": [{ "name": "", "type": "uint256[]", "internalType": "uint256[]" }], "stateMutability": "view" },
  { "type": "function", "name": "getDirective", "inputs": [{ "name": "id", "type": "uint256", "internalType": "uint256" }], "outputs": [{ "name": "", "type": "tuple", "internalType": "struct IDirectiveBoard.Directive", "components": [{ "name": "id", "type": "uint256", "internalType": "uint256" }, { "name": "directiveType", "type": "uint8", "internalType": "enum IDirectiveBoard.DirectiveType" }, { "name": "poster", "type": "address", "internalType": "address" }, { "name": "target", "type": "address", "internalType": "address" }, { "name": "contentHash", "type": "bytes32", "internalType": "bytes32" }, { "name": "contentURI", "type": "string", "internalType": "string" }, { "name": "status", "type": "uint8", "internalType": "enum IDirectiveBoard.DirectiveStatus" }, { "name": "createdAt", "type": "uint256", "internalType": "uint256" }, { "name": "expiresAt", "type": "uint256", "internalType": "uint256" }] }], "stateMutability": "view" },
  { "type": "function", "name": "getDirectivesByType", "inputs": [{ "name": "directiveType", "type": "uint8", "internalType": "enum IDirectiveBoard.DirectiveType" }], "outputs": [{ "name": "", "type": "uint256[]", "internalType": "uint256[]" }], "stateMutability": "view" },
  { "type": "function", "name": "getRoleAdmin", "inputs": [{ "name": "role", "type": "bytes32", "internalType": "bytes32" }], "outputs": [{ "name": "", "type": "bytes32", "internalType": "bytes32" }], "stateMutability": "view" },
  { "type": "function", "name": "grantRole", "inputs": [{ "name": "role", "type": "bytes32", "internalType": "bytes32" }, { "name": "account", "type": "address", "internalType": "address" }], "outputs": [], "stateMutability": "nonpayable" },
  { "type": "function", "name": "hasRole", "inputs": [{ "name": "role", "type": "bytes32", "internalType": "bytes32" }, { "name": "account", "type": "address", "internalType": "address" }], "outputs": [{ "name": "", "type": "bool", "internalType": "bool" }], "stateMutability": "view" },
  { "type": "function", "name": "markExecuted", "inputs": [{ "name": "id", "type": "uint256", "internalType": "uint256" }], "outputs": [], "stateMutability": "nonpayable" },
  { "type": "function", "name": "postDirective", "inputs": [{ "name": "directiveType", "type": "uint8", "internalType": "enum IDirectiveBoard.DirectiveType" }, { "name": "target", "type": "address", "internalType": "address" }, { "name": "contentHash", "type": "bytes32", "internalType": "bytes32" }, { "name": "contentURI", "type": "string", "internalType": "string" }, { "name": "expiresAt", "type": "uint256", "internalType": "uint256" }], "outputs": [{ "name": "id", "type": "uint256", "internalType": "uint256" }], "stateMutability": "nonpayable" },
  { "type": "function", "name": "renounceRole", "inputs": [{ "name": "role", "type": "bytes32", "internalType": "bytes32" }, { "name": "account", "type": "address", "internalType": "address" }], "outputs": [], "stateMutability": "nonpayable" },
  { "type": "function", "name": "revokeRole", "inputs": [{ "name": "role", "type": "bytes32", "internalType": "bytes32" }, { "name": "account", "type": "address", "internalType": "address" }], "outputs": [], "stateMutability": "nonpayable" },
  { "type": "function", "name": "supportsInterface", "inputs": [{ "name": "interfaceId", "type": "bytes4", "internalType": "bytes4" }], "outputs": [{ "name": "", "type": "bool", "internalType": "bool" }], "stateMutability": "view" },
  { "type": "function", "name": "sybilGuard", "inputs": [], "outputs": [{ "name": "", "type": "address", "internalType": "address" }], "stateMutability": "view" },
  { "type": "event", "name": "DirectiveCancelled", "inputs": [{ "name": "id", "type": "uint256", "indexed": true, "internalType": "uint256" }, { "name": "canceller", "type": "address", "indexed": true, "internalType": "address" }], "anonymous": false },
  { "type": "event", "name": "DirectiveExecuted", "inputs": [{ "name": "id", "type": "uint256", "indexed": true, "internalType": "uint256" }, { "name": "executor", "type": "address", "indexed": true, "internalType": "address" }], "anonymous": false },
  { "type": "event", "name": "DirectivePosted", "inputs": [{ "name": "id", "type": "uint256", "indexed": true, "internalType": "uint256" }, { "name": "directiveType", "type": "uint8", "indexed": true, "internalType": "enum IDirectiveBoard.DirectiveType" }, { "name": "poster", "type": "address", "indexed": true, "internalType": "address" }, { "name": "target", "type": "address", "indexed": false, "internalType": "address" }, { "name": "contentHash", "type": "bytes32", "indexed": false, "internalType": "bytes32" }, { "name": "contentURI", "type": "string", "indexed": false, "internalType": "string" }, { "name": "expiresAt", "type": "uint256", "indexed": false, "internalType": "uint256" }], "anonymous": false },
  { "type": "event", "name": "RoleAdminChanged", "inputs": [{ "name": "role", "type": "bytes32", "indexed": true, "internalType": "bytes32" }, { "name": "previousAdminRole", "type": "bytes32", "indexed": true, "internalType": "bytes32" }, { "name": "newAdminRole", "type": "bytes32", "indexed": true, "internalType": "bytes32" }], "anonymous": false },
  { "type": "event", "name": "RoleGranted", "inputs": [{ "name": "role", "type": "bytes32", "indexed": true, "internalType": "bytes32" }, { "name": "account", "type": "address", "indexed": true, "internalType": "address" }, { "name": "sender", "type": "address", "indexed": true, "internalType": "address" }], "anonymous": false },
  { "type": "event", "name": "RoleRevoked", "inputs": [{ "name": "role", "type": "bytes32", "indexed": true, "internalType": "bytes32" }, { "name": "account", "type": "address", "indexed": true, "internalType": "address" }, { "name": "sender", "type": "address", "indexed": true, "internalType": "address" }], "anonymous": false }
] as const;

export const Groth16VerifierV4ABI = [
  {
    "type": "function",
    "name": "verifyProof",
    "inputs": [
      { "name": "_pA", "type": "uint256[2]", "internalType": "uint256[2]" },
      { "name": "_pB", "type": "uint256[2][2]", "internalType": "uint256[2][2]" },
      { "name": "_pC", "type": "uint256[2]", "internalType": "uint256[2]" },
      { "name": "_pubSignals", "type": "uint256[2]", "internalType": "uint256[2]" }
    ],
    "outputs": [{ "name": "", "type": "bool", "internalType": "bool" }],
    "stateMutability": "view"
  }
] as const;
