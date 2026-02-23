// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "./interfaces/IDirectiveBoard.sol";

/**
 * @title DirectiveBoard
 * @notice On-chain directive posting for governance → agent communication.
 *         Posters (governance, mods, admin) create directives; executors
 *         (agents) mark them as executed. Lazy expiry — no gas cost for
 *         time-based expiration.
 */
contract DirectiveBoard is AccessControl, IDirectiveBoard {
    bytes32 public constant POSTER_ROLE = keccak256("POSTER_ROLE");
    bytes32 public constant EXECUTOR_ROLE = keccak256("EXECUTOR_ROLE");

    address public immutable sybilGuard;

    uint256 private _nextDirectiveId = 1;

    mapping(uint256 => Directive) private _directives;
    mapping(address => uint256[]) private _activeByTarget;
    mapping(DirectiveType => uint256[]) private _activeByType;

    constructor(address _sybilGuard) {
        require(_sybilGuard != address(0), "DirectiveBoard: zero sybilGuard");
        sybilGuard = _sybilGuard;
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function postDirective(
        DirectiveType directiveType,
        address target,
        bytes32 contentHash,
        string calldata contentURI,
        uint256 expiresAt
    ) external onlyRole(POSTER_ROLE) returns (uint256 id) {
        // Ban check on poster
        (bool ok, bytes memory data) = sybilGuard.staticcall(
            abi.encodeWithSignature("checkBanned(address)", msg.sender)
        );
        require(ok && !abi.decode(data, (bool)), "DirectiveBoard: poster banned");

        require(bytes(contentURI).length > 0, "DirectiveBoard: empty URI");
        if (expiresAt > 0) {
            require(expiresAt > block.timestamp, "DirectiveBoard: expired");
        }

        id = _nextDirectiveId++;

        _directives[id] = Directive({
            id: id,
            directiveType: directiveType,
            poster: msg.sender,
            target: target,
            contentHash: contentHash,
            contentURI: contentURI,
            status: DirectiveStatus.Active,
            createdAt: block.timestamp,
            expiresAt: expiresAt
        });

        _activeByTarget[target].push(id);
        _activeByType[directiveType].push(id);

        emit DirectivePosted(id, directiveType, msg.sender, target, contentHash, contentURI, expiresAt);
    }

    function markExecuted(uint256 id) external {
        Directive storage d = _directives[id];
        require(d.id != 0, "DirectiveBoard: not found");
        require(d.status == DirectiveStatus.Active, "DirectiveBoard: not active");
        require(
            hasRole(EXECUTOR_ROLE, msg.sender) || d.target == msg.sender,
            "DirectiveBoard: unauthorized"
        );

        d.status = DirectiveStatus.Executed;
        emit DirectiveExecuted(id, msg.sender);
    }

    function cancelDirective(uint256 id) external {
        Directive storage d = _directives[id];
        require(d.id != 0, "DirectiveBoard: not found");
        require(d.status == DirectiveStatus.Active, "DirectiveBoard: not active");
        require(
            hasRole(POSTER_ROLE, msg.sender) || d.poster == msg.sender,
            "DirectiveBoard: unauthorized"
        );

        d.status = DirectiveStatus.Cancelled;
        emit DirectiveCancelled(id, msg.sender);
    }

    function getDirective(uint256 id) external view returns (Directive memory) {
        require(_directives[id].id != 0, "DirectiveBoard: not found");
        return _directives[id];
    }

    function getActiveDirectives(address target) external view returns (uint256[] memory) {
        uint256[] storage targeted = _activeByTarget[target];
        uint256[] storage broadcasts = _activeByTarget[address(0)];

        uint256 total = targeted.length + broadcasts.length;
        uint256[] memory temp = new uint256[](total);
        uint256 count;

        for (uint256 i = 0; i < targeted.length; i++) {
            if (_isActiveDirective(targeted[i])) {
                temp[count++] = targeted[i];
            }
        }

        // Include broadcasts (target=address(0)) unless querying for address(0) itself
        if (target != address(0)) {
            for (uint256 i = 0; i < broadcasts.length; i++) {
                if (_isActiveDirective(broadcasts[i])) {
                    temp[count++] = broadcasts[i];
                }
            }
        }

        uint256[] memory result = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            result[i] = temp[i];
        }
        return result;
    }

    function getDirectivesByType(DirectiveType directiveType) external view returns (uint256[] memory) {
        uint256[] storage ids = _activeByType[directiveType];
        uint256[] memory temp = new uint256[](ids.length);
        uint256 count;

        for (uint256 i = 0; i < ids.length; i++) {
            if (_isActiveDirective(ids[i])) {
                temp[count++] = ids[i];
            }
        }

        uint256[] memory result = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            result[i] = temp[i];
        }
        return result;
    }

    function _isActiveDirective(uint256 id) private view returns (bool) {
        Directive storage d = _directives[id];
        if (d.status != DirectiveStatus.Active) return false;
        if (d.expiresAt > 0 && d.expiresAt <= block.timestamp) return false;
        return true;
    }
}
