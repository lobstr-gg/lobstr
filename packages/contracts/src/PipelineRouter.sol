// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "./interfaces/IPipelineRouter.sol";
import "./interfaces/ISkillRegistry.sol";
import "./interfaces/IStakingManager.sol";
import "./interfaces/IReputationSystem.sol";
import "./interfaces/ISybilGuard.sol";

contract PipelineRouter is
    IPipelineRouter,
    Initializable,
    UUPSUpgradeable,
    OwnableUpgradeable,
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable,
    PausableUpgradeable
{
    ISkillRegistry public skillRegistry;
    IStakingManager public stakingManager;
    IReputationSystem public reputationSystem;
    ISybilGuard public sybilGuard;

    uint256 private _nextPipelineId = 1;

    mapping(uint256 => Pipeline) private _pipelines;
    mapping(uint256 => uint256[]) private _pipelineSteps;
    mapping(uint256 => bytes[]) private _pipelineStepConfigs;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _skillRegistry,
        address _stakingManager,
        address _reputationSystem,
        address _sybilGuard,
        address initialOwner
    ) public virtual initializer {
        require(_skillRegistry != address(0), "PipelineRouter: zero skillRegistry");
        require(_stakingManager != address(0), "PipelineRouter: zero staking");
        require(_reputationSystem != address(0), "PipelineRouter: zero reputation");
        require(_sybilGuard != address(0), "PipelineRouter: zero sybilGuard");

        __Ownable_init(initialOwner);
        __AccessControl_init();
        __ReentrancyGuard_init();
        __Pausable_init();
        __UUPSUpgradeable_init();

        _nextPipelineId = 1;

        skillRegistry = ISkillRegistry(_skillRegistry);
        stakingManager = IStakingManager(_stakingManager);
        reputationSystem = IReputationSystem(_reputationSystem);
        sybilGuard = ISybilGuard(_sybilGuard);

        _grantRole(DEFAULT_ADMIN_ROLE, initialOwner);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    function createPipeline(
        string calldata name,
        uint256[] calldata skillIds,
        bytes[] calldata stepConfigs,
        bool isPublic
    ) external nonReentrant whenNotPaused returns (uint256 pipelineId) {
        require(!sybilGuard.checkBanned(msg.sender), "PipelineRouter: banned");
        require(bytes(name).length > 0, "PipelineRouter: empty name");
        require(skillIds.length > 0, "PipelineRouter: no steps");
        require(skillIds.length == stepConfigs.length, "PipelineRouter: length mismatch");

        // Validate buyer has access to all skills
        for (uint256 i = 0; i < skillIds.length; i++) {
            require(
                skillRegistry.hasActiveAccess(msg.sender, skillIds[i]),
                "PipelineRouter: no access to skill"
            );
        }

        // Public pipelines require Gold+ marketplace tier
        if (isPublic) {
            ISkillRegistry.MarketplaceTier tier = skillRegistry.getMarketplaceTier(msg.sender);
            require(
                uint256(tier) >= uint256(ISkillRegistry.MarketplaceTier.Gold),
                "PipelineRouter: need Gold+ for public"
            );
        }

        pipelineId = _nextPipelineId++;

        _pipelines[pipelineId] = Pipeline({
            id: pipelineId,
            owner: msg.sender,
            name: name,
            isPublic: isPublic,
            executionCount: 0,
            createdAt: block.timestamp,
            active: true
        });

        for (uint256 i = 0; i < skillIds.length; i++) {
            _pipelineSteps[pipelineId].push(skillIds[i]);
            _pipelineStepConfigs[pipelineId].push(stepConfigs[i]);
        }

        emit PipelineCreated(pipelineId, msg.sender, name, isPublic);
    }

    function executePipeline(uint256 pipelineId) external nonReentrant whenNotPaused {
        require(!sybilGuard.checkBanned(msg.sender), "PipelineRouter: banned");

        Pipeline storage pipeline = _pipelines[pipelineId];
        require(pipeline.id != 0, "PipelineRouter: not found");
        require(pipeline.active, "PipelineRouter: inactive");

        if (msg.sender != pipeline.owner) {
            require(pipeline.isPublic, "PipelineRouter: not public");

            // Non-owner must have access to all steps
            uint256[] storage steps = _pipelineSteps[pipelineId];
            for (uint256 i = 0; i < steps.length; i++) {
                require(
                    skillRegistry.hasActiveAccess(msg.sender, steps[i]),
                    "PipelineRouter: no access to skill"
                );
            }
        }

        pipeline.executionCount++;

        emit PipelineExecuted(pipelineId, msg.sender, pipeline.executionCount);
    }

    function updatePipeline(
        uint256 pipelineId,
        string calldata newName,
        uint256[] calldata newSkillIds,
        bytes[] calldata newStepConfigs,
        bool isPublic
    ) external nonReentrant whenNotPaused {
        Pipeline storage pipeline = _pipelines[pipelineId];
        require(pipeline.id != 0, "PipelineRouter: not found");
        require(msg.sender == pipeline.owner, "PipelineRouter: not owner");
        require(pipeline.active, "PipelineRouter: inactive");
        require(bytes(newName).length > 0, "PipelineRouter: empty name");
        require(newSkillIds.length > 0, "PipelineRouter: no steps");
        require(newSkillIds.length == newStepConfigs.length, "PipelineRouter: length mismatch");

        // Validate access for new steps
        for (uint256 i = 0; i < newSkillIds.length; i++) {
            require(
                skillRegistry.hasActiveAccess(msg.sender, newSkillIds[i]),
                "PipelineRouter: no access to skill"
            );
        }

        // Public toggle requires Gold+
        if (isPublic && !pipeline.isPublic) {
            ISkillRegistry.MarketplaceTier tier = skillRegistry.getMarketplaceTier(msg.sender);
            require(
                uint256(tier) >= uint256(ISkillRegistry.MarketplaceTier.Gold),
                "PipelineRouter: need Gold+ for public"
            );
        }

        pipeline.name = newName;
        pipeline.isPublic = isPublic;
        delete _pipelineSteps[pipelineId];
        delete _pipelineStepConfigs[pipelineId];
        for (uint256 i = 0; i < newSkillIds.length; i++) {
            _pipelineSteps[pipelineId].push(newSkillIds[i]);
            _pipelineStepConfigs[pipelineId].push(newStepConfigs[i]);
        }

        emit PipelineUpdated(pipelineId, newName, isPublic);
    }

    function deactivatePipeline(uint256 pipelineId) external nonReentrant whenNotPaused {
        Pipeline storage pipeline = _pipelines[pipelineId];
        require(pipeline.id != 0, "PipelineRouter: not found");
        require(msg.sender == pipeline.owner, "PipelineRouter: not owner");
        require(pipeline.active, "PipelineRouter: already inactive");

        pipeline.active = false;

        emit PipelineDeactivated(pipelineId);
    }

    // --- View Functions ---

    function getPipeline(uint256 pipelineId) external view returns (Pipeline memory) {
        require(_pipelines[pipelineId].id != 0, "PipelineRouter: not found");
        return _pipelines[pipelineId];
    }

    function getPipelineSteps(uint256 pipelineId) external view returns (uint256[] memory) {
        require(_pipelines[pipelineId].id != 0, "PipelineRouter: not found");
        return _pipelineSteps[pipelineId];
    }

    function getPipelineStepConfigs(uint256 pipelineId) external view returns (bytes[] memory) {
        require(_pipelines[pipelineId].id != 0, "PipelineRouter: not found");
        return _pipelineStepConfigs[pipelineId];
    }

    // --- Admin ---

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }
}
