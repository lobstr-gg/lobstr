#!/bin/bash
set -e

CIRCUIT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BUILD_DIR="$CIRCUIT_DIR/build"
CONTRACTS_DIR="$CIRCUIT_DIR/../contracts/src/verifiers"

echo "==> Generating Solidity verifier..."

mkdir -p "$CONTRACTS_DIR"

npx snarkjs zkey export solidityverifier \
  "$BUILD_DIR/airdropAttestation_0001.zkey" \
  "$CONTRACTS_DIR/Groth16Verifier.sol"

# Fix the pragma to match our Solidity version
sed -i '' 's/pragma solidity ^0.6.11/pragma solidity ^0.8.20/' "$CONTRACTS_DIR/Groth16Verifier.sol" 2>/dev/null || \
sed -i 's/pragma solidity ^0.6.11/pragma solidity ^0.8.20/' "$CONTRACTS_DIR/Groth16Verifier.sol"

echo "==> Verifier exported to: $CONTRACTS_DIR/Groth16Verifier.sol"
echo "    Updated pragma to ^0.8.20"
