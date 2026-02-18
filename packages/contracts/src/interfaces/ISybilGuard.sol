// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface ISybilGuard {
    function checkBanned(address account) external view returns (bool);
    function checkAnyBanned(address[] calldata accounts) external view returns (bool);
}
