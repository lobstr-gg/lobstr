#!/bin/bash
set -e

CIRCUIT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BUILD_DIR="$CIRCUIT_DIR/build"

echo "==> Compiling airdropAttestation circuit..."
mkdir -p "$BUILD_DIR"

circom "$CIRCUIT_DIR/circuits/airdropAttestation.circom" \
  --r1cs \
  --wasm \
  --sym \
  --output "$BUILD_DIR" \
  -l "$CIRCUIT_DIR/node_modules"

echo "==> Circuit compiled successfully."
echo "    R1CS: $BUILD_DIR/airdropAttestation.r1cs"
echo "    WASM: $BUILD_DIR/airdropAttestation_js/airdropAttestation.wasm"
echo "    SYM:  $BUILD_DIR/airdropAttestation.sym"

# Print circuit info
if command -v snarkjs &> /dev/null; then
  echo ""
  echo "==> Circuit info:"
  npx snarkjs r1cs info "$BUILD_DIR/airdropAttestation.r1cs"
fi
