export const DirectiveBoardABI = [
  {
    "type": "constructor",
    "inputs": [
      {
        "name": "_sybilGuard",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "event",
    "name": "DirectivePosted",
    "inputs": [
      { "name": "id", "type": "uint256", "indexed": true, "internalType": "uint256" },
      { "name": "directiveType", "type": "uint8", "indexed": true, "internalType": "enum IDirectiveBoard.DirectiveType" },
      { "name": "poster", "type": "address", "indexed": true, "internalType": "address" },
      { "name": "target", "type": "address", "indexed": false, "internalType": "address" },
      { "name": "contentHash", "type": "bytes32", "indexed": false, "internalType": "bytes32" },
      { "name": "contentURI", "type": "string", "indexed": false, "internalType": "string" },
      { "name": "expiresAt", "type": "uint256", "indexed": false, "internalType": "uint256" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "DirectiveExecuted",
    "inputs": [
      { "name": "id", "type": "uint256", "indexed": true, "internalType": "uint256" },
      { "name": "executor", "type": "address", "indexed": true, "internalType": "address" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "DirectiveCancelled",
    "inputs": [
      { "name": "id", "type": "uint256", "indexed": true, "internalType": "uint256" },
      { "name": "canceller", "type": "address", "indexed": true, "internalType": "address" }
    ],
    "anonymous": false
  }
] as const;
