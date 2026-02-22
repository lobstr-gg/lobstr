// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IERC3009 — Transfer With Authorization (EIP-3009)
/// @notice Interface for tokens that support gasless transfers via signed authorizations.
///         USDC on Base implements this standard.
interface IERC3009 {
    function transferWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;

    /// @notice Execute a transfer with a signed authorization — caller must be the `to` address.
    ///         Prevents front-running because only the intended recipient can execute the transfer.
    function receiveWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;
}
