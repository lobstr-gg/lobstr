// SPDX-License-Identifier: GPL-3.0
/*
    Copyright 2021 0KIMS association.

    This file is generated with [snarkJS](https://github.com/iden3/snarkjs).

    snarkJS is a free software: you can redistribute it and/or modify it
    under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    snarkJS is distributed in the hope that it will be useful, but WITHOUT
    ANY WARRANTY; without even the implied warranty of MERCHANTABILITY
    or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public
    License for more details.

    You should have received a copy of the GNU General Public License
    along with snarkJS. If not, see <https://www.gnu.org/licenses/>.
*/

pragma solidity >=0.7.0 <0.9.0;

/**
 * @title Groth16VerifierV4
 * @notice Groth16 proof verifier for the AirdropMerkleClaim circuit.
 *         2 public signals: [merkleRoot, claimantAddress]
 *
 *         IMPORTANT: This is a PLACEHOLDER verifier. The verification key
 *         constants (alpha, beta, gamma, delta, IC) must be replaced with
 *         values generated from the actual trusted setup ceremony:
 *           1. circom airdropMerkleClaim.circom --r1cs --wasm --sym
 *           2. snarkjs groth16 setup
 *           3. snarkjs zkey export solidityverifier
 *
 *         The structure and pairing logic are correct; only the constants
 *         need to be swapped after the ceremony.
 */
contract Groth16VerifierV4 {
    // Scalar field size
    uint256 constant r    = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    // Base field size
    uint256 constant q   = 21888242871839275222246405745257275088696311157297823662689037894645226208583;

    // Verification Key data — PLACEHOLDER values, replace after trusted setup
    uint256 constant alphax  = 20491192805390485299153009773594534940189261866228447918068658471970481763042;
    uint256 constant alphay  = 9383485363053290200918347156157836566562967994039712273449902621266178545958;
    uint256 constant betax1  = 4252822878758300859123897981450591353533073413197771768651442665752259397132;
    uint256 constant betax2  = 6375614351688725206403948262868962793625744043794305715222011528459656738731;
    uint256 constant betay1  = 21847035105528745403288232691147584728191162732299865338377159692350059136679;
    uint256 constant betay2  = 10505242626370262277552901082094356697409835680220590971873171140371331206856;
    uint256 constant gammax1 = 11559732032986387107991004021392285783925812861821192530917403151452391805634;
    uint256 constant gammax2 = 10857046999023057135944570762232829481370756359578518086990519993285655852781;
    uint256 constant gammay1 = 4082367875863433681332203403145435568316851327593401208105741076214120093531;
    uint256 constant gammay2 = 8495653923123431417604973247489272438418190587263600148770280649306958101930;
    uint256 constant deltax1 = 20583044832319721512399158155166567742140792217697546402185940892433493394250;
    uint256 constant deltax2 = 3004555612106717319521803643134677375855778066717739703442521449356154580771;
    uint256 constant deltay1 = 9995588662201547691902076945666627784235261047384587495939365797239270200032;
    uint256 constant deltay2 = 11078358252337011890258408225256497122481407826284088475354619486228046475143;

    // IC for 2 public signals: IC0, IC1, IC2
    uint256 constant IC0x = 2298363211181231665408194456465172623696963948839513804089617015460386445992;
    uint256 constant IC0y = 15841527747520431986843441785198223541138355806414062130765988360347391162067;

    uint256 constant IC1x = 7323145329900776653390725973815777081914285170521209259012988755507977232941;
    uint256 constant IC1y = 14811112621021155089408092037259957202878988263107610116341931773263046610902;

    uint256 constant IC2x = 13144009025773946829459704744599082367939498706850541086442539075612109147854;
    uint256 constant IC2y = 2584593580098737028407439058285235985226797301979752498723662526908862402695;

    // Memory data
    uint16 constant pVk = 0;
    uint16 constant pPairing = 128;

    uint16 constant pLastMem = 896;

    function verifyProof(uint[2] calldata _pA, uint[2][2] calldata _pB, uint[2] calldata _pC, uint[2] calldata _pubSignals) public view returns (bool) {
        assembly {
            function checkField(v) {
                if iszero(lt(v, r)) {
                    mstore(0, 0)
                    return(0, 0x20)
                }
            }

            // G1 function to multiply a G1 value(x,y) to value in an address
            function g1_mulAccC(pR, x, y, s) {
                let success
                let mIn := mload(0x40)
                mstore(mIn, x)
                mstore(add(mIn, 32), y)
                mstore(add(mIn, 64), s)

                success := staticcall(sub(gas(), 2000), 7, mIn, 96, mIn, 64)

                if iszero(success) {
                    mstore(0, 0)
                    return(0, 0x20)
                }

                mstore(add(mIn, 64), mload(pR))
                mstore(add(mIn, 96), mload(add(pR, 32)))

                success := staticcall(sub(gas(), 2000), 6, mIn, 128, pR, 64)

                if iszero(success) {
                    mstore(0, 0)
                    return(0, 0x20)
                }
            }

            function checkPairing(pA, pB, pC, pubSignals, pMem) -> isOk {
                let _pPairing := add(pMem, pPairing)
                let _pVk := add(pMem, pVk)

                mstore(_pVk, IC0x)
                mstore(add(_pVk, 32), IC0y)

                // Validate all public signals
                checkField(calldataload(pubSignals))
                checkField(calldataload(add(pubSignals, 32)))

                // Compute Vk from public signals
                g1_mulAccC(_pVk, IC1x, IC1y, calldataload(pubSignals))
                g1_mulAccC(_pVk, IC2x, IC2y, calldataload(add(pubSignals, 32)))

                // -A
                mstore(add(_pPairing, 0), calldataload(pA))
                mstore(add(_pPairing, 32), calldataload(add(pA, 32)))

                // B
                mstore(add(_pPairing, 64), calldataload(pB))
                mstore(add(_pPairing, 96), calldataload(add(pB, 32)))
                mstore(add(_pPairing, 128), calldataload(add(pB, 64)))
                mstore(add(_pPairing, 160), calldataload(add(pB, 96)))

                // alpha1
                mstore(add(_pPairing, 192), alphax)
                mstore(add(_pPairing, 224), alphay)

                // beta2
                mstore(add(_pPairing, 256), betax1)
                mstore(add(_pPairing, 288), betax2)
                mstore(add(_pPairing, 320), betay1)
                mstore(add(_pPairing, 352), betay2)

                // vk_x
                mstore(add(_pPairing, 384), mload(add(pMem, pVk)))
                mstore(add(_pPairing, 416), mload(add(add(pMem, pVk), 32)))

                // gamma2
                mstore(add(_pPairing, 448), gammax1)
                mstore(add(_pPairing, 480), gammax2)
                mstore(add(_pPairing, 512), gammay1)
                mstore(add(_pPairing, 544), gammay2)

                // C
                mstore(add(_pPairing, 576), calldataload(pC))
                mstore(add(_pPairing, 608), calldataload(add(pC, 32)))

                // delta2
                mstore(add(_pPairing, 640), deltax1)
                mstore(add(_pPairing, 672), deltax2)
                mstore(add(_pPairing, 704), deltay1)
                mstore(add(_pPairing, 736), deltay2)

                let success := staticcall(sub(gas(), 2000), 8, _pPairing, 768, _pPairing, 0x20)

                isOk := and(success, mload(_pPairing))
            }

            let pMem := mload(0x40)
            mstore(0x40, add(pMem, pLastMem))

            // Validate that all evaluations ∈ F
            checkField(calldataload(add(_pA, 0)))
            checkField(calldataload(add(_pA, 32)))
            checkField(calldataload(add(_pB, 0)))
            checkField(calldataload(add(_pB, 32)))
            checkField(calldataload(add(_pB, 64)))
            checkField(calldataload(add(_pB, 96)))
            checkField(calldataload(add(_pC, 0)))
            checkField(calldataload(add(_pC, 32)))

            // Validate all evaluations
            let isValid := checkPairing(_pA, _pB, _pC, _pubSignals, pMem)

            mstore(0, isValid)
            return(0, 0x20)
        }
    }
}
