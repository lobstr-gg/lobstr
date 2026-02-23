// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title TeamVesting
 * @notice Linear vesting with cliff for team token allocation.
 *         150M LOB, 3-year duration, 6-month cliff, revocable by admin.
 *
 *         Timeline:
 *           [deploy] → [+6mo cliff] → [linear vest over remaining 2.5yr] → [+3yr fully vested]
 *
 *         Admin (TreasuryGovernor) can:
 *           - Revoke unvested tokens (returns to specified address)
 *           - Rotate beneficiary wallet
 *           - Set total allocation (one-time, after funding)
 */
contract TeamVesting is AccessControl {
    using SafeERC20 for IERC20;

    IERC20 public immutable token;
    address public beneficiary;
    uint256 public immutable start;
    uint256 public immutable cliffEnd;
    uint256 public immutable duration;
    uint256 public totalAllocation;
    uint256 public released;
    bool public revoked;
    bool public allocationSet;

    event TokensReleased(uint256 amount);
    event VestingRevoked(address returnTo, uint256 returned);
    event BeneficiaryUpdated(address indexed newBeneficiary);
    event AllocationSet(uint256 amount);

    constructor(
        address _token,
        address _beneficiary,
        uint256 _start,
        uint256 _cliff,
        uint256 _duration
    ) {
        require(_token != address(0), "TeamVesting: zero token");
        require(_beneficiary != address(0), "TeamVesting: zero beneficiary");
        require(_cliff <= _duration, "TeamVesting: cliff > duration");
        require(_duration > 0, "TeamVesting: zero duration");

        token = IERC20(_token);
        beneficiary = _beneficiary;
        start = _start;
        cliffEnd = _start + _cliff;
        duration = _duration;

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    /// @notice Set the total allocation amount. Can only be called once, after funding.
    function setTotalAllocation(uint256 _amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(!allocationSet, "TeamVesting: already set");
        require(_amount > 0, "TeamVesting: zero amount");
        totalAllocation = _amount;
        allocationSet = true;
        emit AllocationSet(_amount);
    }

    /// @notice Amount that has vested up to now.
    function vestedAmount() public view returns (uint256) {
        if (block.timestamp < cliffEnd) return 0;
        if (totalAllocation == 0) return 0;

        uint256 elapsed = block.timestamp - start;
        if (elapsed >= duration) return totalAllocation;

        return (totalAllocation * elapsed) / duration;
    }

    /// @notice Amount currently releasable (vested minus already released).
    function releasable() external view returns (uint256) {
        return vestedAmount() - released;
    }

    /// @notice Release vested tokens to beneficiary.
    function release() external {
        require(!revoked, "TeamVesting: revoked");
        require(allocationSet, "TeamVesting: allocation not set");

        uint256 amount = vestedAmount() - released;
        require(amount > 0, "TeamVesting: nothing to release");

        released += amount;
        token.safeTransfer(beneficiary, amount);

        emit TokensReleased(amount);
    }

    /// @notice Revoke unvested tokens. Only admin.
    function revoke(address returnTo) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(!revoked, "TeamVesting: already revoked");
        require(returnTo != address(0), "TeamVesting: zero return address");

        revoked = true;

        uint256 vested = vestedAmount();
        uint256 balance = token.balanceOf(address(this));
        uint256 owed = vested - released;
        uint256 toReturn = balance > owed ? balance - owed : 0;

        if (toReturn > 0) {
            token.safeTransfer(returnTo, toReturn);
        }

        emit VestingRevoked(returnTo, toReturn);
    }

    /// @notice Update the beneficiary address. Only admin.
    function setBeneficiary(address _beneficiary) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_beneficiary != address(0), "TeamVesting: zero beneficiary");
        beneficiary = _beneficiary;
        emit BeneficiaryUpdated(_beneficiary);
    }
}
