#!/bin/bash
set -e

CIRCUIT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BUILD_DIR="$CIRCUIT_DIR/build"
PTAU_FILE="$BUILD_DIR/powersOfTau28_hez_final_17.ptau"

echo "==> Starting trusted setup..."

# Phase 1: Download Powers of Tau (if not already present)
if [ ! -f "$PTAU_FILE" ]; then
  echo "==> Downloading Hermez Powers of Tau (2^17)..."
  curl -L -o "$PTAU_FILE" \
    "https://hermez.s3-eu-west-1.amazonaws.com/powersOfTau28_hez_final_17.ptau"
  echo "    Downloaded: $PTAU_FILE"
else
  echo "    Powers of Tau already present: $PTAU_FILE"
fi

# Phase 2: Circuit-specific setup
echo "==> Phase 2: Circuit-specific ceremony..."

# Generate initial .zkey
npx snarkjs groth16 setup \
  "$BUILD_DIR/airdropAttestation.r1cs" \
  "$PTAU_FILE" \
  "$BUILD_DIR/airdropAttestation_0000.zkey"

# Contribute to ceremony (dev contribution)
echo "lobstr-dev-contribution-entropy-$(date +%s)" | \
npx snarkjs zkey contribute \
  "$BUILD_DIR/airdropAttestation_0000.zkey" \
  "$BUILD_DIR/airdropAttestation_0001.zkey" \
  --name="LOBSTR dev contribution 1"

# Export verification key
npx snarkjs zkey export verificationkey \
  "$BUILD_DIR/airdropAttestation_0001.zkey" \
  "$BUILD_DIR/verification_key.json"

echo ""
echo "==> Trusted setup complete."
echo "    Final zkey: $BUILD_DIR/airdropAttestation_0001.zkey"
echo "    Verification key: $BUILD_DIR/verification_key.json"
echo ""
echo "NOTE: For production, add 2-4 more contributions from independent parties."
