// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IDirectiveBoard {
    enum DirectiveType { DisputeReview, ModAlert, AgentTask, SystemBroadcast, GovernanceAction }
    enum DirectiveStatus { Active, Executed, Cancelled }

    struct Directive {
        uint256 id;
        DirectiveType directiveType;
        address poster;
        address target;
        bytes32 contentHash;
        string contentURI;
        DirectiveStatus status;
        uint256 createdAt;
        uint256 expiresAt;
    }

    event DirectivePosted(
        uint256 indexed id,
        DirectiveType indexed directiveType,
        address indexed poster,
        address target,
        bytes32 contentHash,
        string contentURI,
        uint256 expiresAt
    );
    event DirectiveExecuted(uint256 indexed id, address indexed executor);
    event DirectiveCancelled(uint256 indexed id, address indexed canceller);

    function postDirective(
        DirectiveType directiveType,
        address target,
        bytes32 contentHash,
        string calldata contentURI,
        uint256 expiresAt
    ) external returns (uint256 id);

    function markExecuted(uint256 id) external;
    function cancelDirective(uint256 id) external;
    function getDirective(uint256 id) external view returns (Directive memory);
    function getActiveDirectives(address target) external view returns (uint256[] memory);
    function getDirectivesByType(DirectiveType directiveType) external view returns (uint256[] memory);
}
