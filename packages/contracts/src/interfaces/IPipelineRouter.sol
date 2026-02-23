// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IPipelineRouter {
    struct Pipeline {
        uint256 id;
        address owner;
        string name;
        bool isPublic;
        uint256 executionCount;
        uint256 createdAt;
        bool active;
    }

    event PipelineCreated(uint256 indexed pipelineId, address indexed owner, string name, bool isPublic);
    event PipelineExecuted(uint256 indexed pipelineId, address indexed executor, uint256 executionCount);
    event PipelineUpdated(uint256 indexed pipelineId, string newName, bool isPublic);
    event PipelineDeactivated(uint256 indexed pipelineId);

    function createPipeline(
        string calldata name,
        uint256[] calldata skillIds,
        bytes[] calldata stepConfigs,
        bool isPublic
    ) external returns (uint256 pipelineId);

    function executePipeline(uint256 pipelineId) external;

    function updatePipeline(
        uint256 pipelineId,
        string calldata newName,
        uint256[] calldata newSkillIds,
        bytes[] calldata newStepConfigs,
        bool isPublic
    ) external;

    function deactivatePipeline(uint256 pipelineId) external;

    function getPipeline(uint256 pipelineId) external view returns (Pipeline memory);
    function getPipelineSteps(uint256 pipelineId) external view returns (uint256[] memory);
    function getPipelineStepConfigs(uint256 pipelineId) external view returns (bytes[] memory);
}
