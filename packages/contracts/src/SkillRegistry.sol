// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/ISkillRegistry.sol";
import "./interfaces/IStakingManager.sol";
import "./interfaces/IReputationSystem.sol";
import "./interfaces/ISybilGuard.sol";
import "./interfaces/IEscrowEngine.sol";

contract SkillRegistry is ISkillRegistry, Initializable, UUPSUpgradeable, OwnableUpgradeable, AccessControlUpgradeable, ReentrancyGuardUpgradeable, PausableUpgradeable {
    using SafeERC20 for IERC20;

    bytes32 public constant GATEWAY_ROLE = keccak256("GATEWAY_ROLE");

    uint256 public constant USDC_FEE_BPS = 150; // 1.5%
    uint256 public constant SUBSCRIPTION_PERIOD = 30 days;

    IERC20 public lobToken;
    IStakingManager public stakingManager;
    IReputationSystem public reputationSystem;
    ISybilGuard public sybilGuard;
    IEscrowEngine public escrowEngine;
    address public treasury;

    uint256 private _nextSkillId = 1;
    uint256 private _nextAccessId = 1;

    mapping(uint256 => SkillListing) private _skills;
    mapping(uint256 => uint256[]) private _skillDependencies;
    mapping(uint256 => AccessRecord) private _access;
    mapping(address => uint256) private _sellerListingCount;
    mapping(address => mapping(address => uint256)) private _buyerCredits; // buyer => token => balance
    mapping(address => mapping(address => uint256)) private _sellerEarnings; // seller => token => balance
    mapping(address => mapping(uint256 => uint256)) private _buyerSkillAccess; // buyer => skillId => accessId

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _lobToken,
        address _stakingManager,
        address _reputationSystem,
        address _sybilGuard,
        address _escrowEngine,
        address _treasury
    ) public virtual initializer {
        require(_lobToken != address(0), "SkillRegistry: zero lobToken");
        require(_stakingManager != address(0), "SkillRegistry: zero staking");
        require(_reputationSystem != address(0), "SkillRegistry: zero reputation");
        require(_sybilGuard != address(0), "SkillRegistry: zero sybilGuard");
        require(_escrowEngine != address(0), "SkillRegistry: zero escrow");
        require(_treasury != address(0), "SkillRegistry: zero treasury");

        __Ownable_init(msg.sender);
        __UUPSUpgradeable_init();
        __AccessControl_init();
        __ReentrancyGuard_init();
        __Pausable_init();

        _nextSkillId = 1;
        _nextAccessId = 1;

        lobToken = IERC20(_lobToken);
        stakingManager = IStakingManager(_stakingManager);
        reputationSystem = IReputationSystem(_reputationSystem);
        sybilGuard = ISybilGuard(_sybilGuard);
        escrowEngine = IEscrowEngine(_escrowEngine);
        treasury = _treasury;

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    // --- Core Functions ---

    function listSkill(
        ListSkillParams calldata params,
        string calldata title,
        string calldata description,
        string calldata metadataURI,
        uint256[] calldata requiredSkills
    ) external nonReentrant whenNotPaused returns (uint256 skillId) {
        require(!sybilGuard.checkBanned(msg.sender), "SkillRegistry: banned");
        require(bytes(title).length > 0, "SkillRegistry: empty title");
        require(bytes(description).length > 0, "SkillRegistry: empty description");
        require(params.price > 0, "SkillRegistry: zero price");
        require(params.settlementToken != address(0), "SkillRegistry: zero token");

        MarketplaceTier tier = getMarketplaceTier(msg.sender);

        // Tier gating for asset types
        require(uint256(tier) >= uint256(MarketplaceTier.Bronze), "SkillRegistry: need Bronze+");
        if (params.assetType == AssetType.AGENT_TEMPLATE) {
            require(uint256(tier) >= uint256(MarketplaceTier.Silver), "SkillRegistry: need Silver+ for agents");
        }
        if (params.assetType == AssetType.PIPELINE) {
            require(uint256(tier) >= uint256(MarketplaceTier.Gold), "SkillRegistry: need Gold+ for pipelines");
        }

        // Subscription pricing requires Silver+
        if (params.pricingModel == PricingModel.SUBSCRIPTION) {
            require(uint256(tier) >= uint256(MarketplaceTier.Silver), "SkillRegistry: need Silver+ for subscriptions");
        }

        // Listing cap
        {
            IStakingManager.Tier stakeTier = stakingManager.getTier(msg.sender);
            uint256 maxListing = stakingManager.maxListings(stakeTier);
            require(_sellerListingCount[msg.sender] < maxListing, "SkillRegistry: max listings reached");
        }

        // Delivery method hash validation
        if (params.deliveryMethod == DeliveryMethod.HOSTED_API || params.deliveryMethod == DeliveryMethod.BOTH) {
            require(params.apiEndpointHash != bytes32(0), "SkillRegistry: missing API hash");
        }
        if (params.deliveryMethod == DeliveryMethod.CODE_PACKAGE || params.deliveryMethod == DeliveryMethod.BOTH) {
            require(params.packageHash != bytes32(0), "SkillRegistry: missing package hash");
        }

        // Validate required skills exist
        for (uint256 i = 0; i < requiredSkills.length; i++) {
            require(_skills[requiredSkills[i]].id != 0, "SkillRegistry: dependency not found");
            require(_skills[requiredSkills[i]].active, "SkillRegistry: dependency inactive");
        }

        skillId = _nextSkillId++;
        _sellerListingCount[msg.sender]++;

        _skills[skillId] = SkillListing({
            id: skillId,
            seller: msg.sender,
            assetType: params.assetType,
            deliveryMethod: params.deliveryMethod,
            pricingModel: params.pricingModel,
            title: title,
            description: description,
            metadataURI: metadataURI,
            version: 1,
            price: params.price,
            settlementToken: params.settlementToken,
            apiEndpointHash: params.apiEndpointHash,
            packageHash: params.packageHash,
            active: true,
            totalPurchases: 0,
            totalCalls: 0,
            createdAt: block.timestamp,
            updatedAt: block.timestamp
        });

        for (uint256 j = 0; j < requiredSkills.length; j++) {
            _skillDependencies[skillId].push(requiredSkills[j]);
        }

        emit SkillListed(skillId, msg.sender, params.assetType, params.pricingModel, params.price);
    }

    function updateSkill(
        uint256 skillId,
        uint256 newPrice,
        string calldata newMetadataURI,
        bytes32 newApiEndpointHash,
        bytes32 newPackageHash
    ) external nonReentrant whenNotPaused {
        SkillListing storage skill = _skills[skillId];
        require(skill.id != 0, "SkillRegistry: not found");
        require(msg.sender == skill.seller, "SkillRegistry: not seller");
        require(skill.active, "SkillRegistry: inactive");
        require(newPrice > 0, "SkillRegistry: zero price");

        skill.price = newPrice;
        skill.metadataURI = newMetadataURI;
        skill.apiEndpointHash = newApiEndpointHash;
        skill.packageHash = newPackageHash;
        skill.version++;
        skill.updatedAt = block.timestamp;

        emit SkillUpdated(skillId, newPrice, newMetadataURI);
    }

    function deactivateSkill(uint256 skillId) external nonReentrant whenNotPaused {
        SkillListing storage skill = _skills[skillId];
        require(skill.id != 0, "SkillRegistry: not found");
        require(msg.sender == skill.seller, "SkillRegistry: not seller");
        require(skill.active, "SkillRegistry: already inactive");

        skill.active = false;
        skill.updatedAt = block.timestamp;
        _sellerListingCount[msg.sender]--;

        emit SkillDeactivated(skillId);
    }

    function purchaseSkill(uint256 skillId) external nonReentrant whenNotPaused returns (uint256 accessId) {
        require(!sybilGuard.checkBanned(msg.sender), "SkillRegistry: banned");

        SkillListing storage skill = _skills[skillId];
        require(skill.id != 0, "SkillRegistry: not found");
        require(skill.active, "SkillRegistry: inactive");
        require(msg.sender != skill.seller, "SkillRegistry: self-purchase");

        accessId = _nextAccessId++;
        skill.totalPurchases++;

        if (skill.pricingModel == PricingModel.ONE_TIME) {
            // Route through EscrowEngine for buyer protection
            // Buyer must have approved EscrowEngine for the token beforehand
            uint256 jobId = escrowEngine.createSkillEscrow(
                skillId,
                msg.sender,
                skill.seller,
                skill.price,
                skill.settlementToken
            );

            _access[accessId] = AccessRecord({
                id: accessId,
                skillId: skillId,
                buyer: msg.sender,
                pricingModel: PricingModel.ONE_TIME,
                purchasedAt: block.timestamp,
                expiresAt: 0, // No expiry for one-time
                totalCallsUsed: 0,
                totalPaid: skill.price,
                active: true
            });

            _buyerSkillAccess[msg.sender][skillId] = accessId;

            emit SkillPurchased(skillId, msg.sender, accessId, PricingModel.ONE_TIME, skill.price);
        } else if (skill.pricingModel == PricingModel.SUBSCRIPTION) {
            // Direct payment to seller minus fee
            _collectPayment(msg.sender, skill.seller, skill.price, skill.settlementToken);

            _access[accessId] = AccessRecord({
                id: accessId,
                skillId: skillId,
                buyer: msg.sender,
                pricingModel: PricingModel.SUBSCRIPTION,
                purchasedAt: block.timestamp,
                expiresAt: block.timestamp + SUBSCRIPTION_PERIOD,
                totalCallsUsed: 0,
                totalPaid: skill.price,
                active: true
            });

            _buyerSkillAccess[msg.sender][skillId] = accessId;

            emit SkillPurchased(skillId, msg.sender, accessId, PricingModel.SUBSCRIPTION, skill.price);
        } else {
            // PER_CALL — no payment now, metered later via credits
            _access[accessId] = AccessRecord({
                id: accessId,
                skillId: skillId,
                buyer: msg.sender,
                pricingModel: PricingModel.PER_CALL,
                purchasedAt: block.timestamp,
                expiresAt: 0,
                totalCallsUsed: 0,
                totalPaid: 0,
                active: true
            });

            _buyerSkillAccess[msg.sender][skillId] = accessId;

            emit SkillPurchased(skillId, msg.sender, accessId, PricingModel.PER_CALL, 0);
        }
    }

    function renewSubscription(uint256 accessId) external nonReentrant whenNotPaused {
        AccessRecord storage access = _access[accessId];
        require(access.id != 0, "SkillRegistry: access not found");
        require(access.active, "SkillRegistry: access inactive");
        require(access.pricingModel == PricingModel.SUBSCRIPTION, "SkillRegistry: not subscription");
        require(msg.sender == access.buyer, "SkillRegistry: not buyer");

        SkillListing storage skill = _skills[access.skillId];
        require(skill.active, "SkillRegistry: skill inactive");

        // Collect payment from buyer (requires prior ERC-20 approval)
        _collectPayment(access.buyer, skill.seller, skill.price, skill.settlementToken);

        // Extend from max(expiresAt, now) — prevents overcharging expired users
        // If still active, extends seamlessly from current expiry (no gap).
        // If expired, extends from now so buyer always gets a full period of access.
        uint256 base = access.expiresAt > block.timestamp ? access.expiresAt : block.timestamp;
        access.expiresAt = base + SUBSCRIPTION_PERIOD;
        access.totalPaid += skill.price;

        emit SubscriptionRenewed(accessId, access.skillId, access.buyer, access.expiresAt);
    }

    function recordUsage(uint256 accessId, uint256 calls) external onlyRole(GATEWAY_ROLE) nonReentrant whenNotPaused {
        require(calls > 0, "SkillRegistry: zero calls");

        AccessRecord storage access = _access[accessId];
        require(access.id != 0, "SkillRegistry: access not found");
        require(access.active, "SkillRegistry: access inactive");
        require(access.pricingModel == PricingModel.PER_CALL, "SkillRegistry: not per-call");

        SkillListing storage skill = _skills[access.skillId];
        uint256 cost = calls * skill.price;

        // Deduct from buyer credits
        require(_buyerCredits[access.buyer][skill.settlementToken] >= cost, "SkillRegistry: insufficient credits");
        _buyerCredits[access.buyer][skill.settlementToken] -= cost;

        // Calculate fee
        uint256 fee = 0;
        if (skill.settlementToken != address(lobToken)) {
            fee = (cost * USDC_FEE_BPS) / 10000;
        }

        // Credit seller earnings (minus fee)
        _sellerEarnings[skill.seller][skill.settlementToken] += cost - fee;
        // Credit treasury for fee
        if (fee > 0) {
            _sellerEarnings[treasury][skill.settlementToken] += fee;
        }

        access.totalCallsUsed += calls;
        access.totalPaid += cost;
        skill.totalCalls += calls;

        emit UsageRecorded(accessId, access.skillId, calls, cost);
    }

    function depositCallCredits(address token, uint256 amount) external nonReentrant whenNotPaused {
        require(amount > 0, "SkillRegistry: zero amount");
        require(token != address(0), "SkillRegistry: zero token");

        // Fee-on-transfer safe
        uint256 balanceBefore = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = IERC20(token).balanceOf(address(this)) - balanceBefore;

        _buyerCredits[msg.sender][token] += received;

        emit CallCreditsDeposited(msg.sender, token, received);
    }

    function withdrawCallCredits(address token, uint256 amount) external nonReentrant whenNotPaused {
        require(amount > 0, "SkillRegistry: zero amount");
        require(_buyerCredits[msg.sender][token] >= amount, "SkillRegistry: insufficient credits");

        _buyerCredits[msg.sender][token] -= amount;
        IERC20(token).safeTransfer(msg.sender, amount);

        emit CallCreditsWithdrawn(msg.sender, token, amount);
    }

    function claimEarnings(address token) external nonReentrant whenNotPaused {
        uint256 earnings = _sellerEarnings[msg.sender][token];
        require(earnings > 0, "SkillRegistry: no earnings");

        _sellerEarnings[msg.sender][token] = 0;
        IERC20(token).safeTransfer(msg.sender, earnings);

        emit SellerPaid(msg.sender, token, earnings);
    }

    // --- View Functions ---

    function getSkill(uint256 skillId) external view returns (SkillListing memory) {
        require(_skills[skillId].id != 0, "SkillRegistry: not found");
        return _skills[skillId];
    }

    function getAccess(uint256 accessId) external view returns (AccessRecord memory) {
        require(_access[accessId].id != 0, "SkillRegistry: access not found");
        return _access[accessId];
    }

    function getMarketplaceTier(address user) public view returns (MarketplaceTier) {
        IStakingManager.Tier stakeTier = stakingManager.getTier(user);
        if (stakeTier == IStakingManager.Tier.None) {
            return MarketplaceTier.None;
        }

        (, IReputationSystem.ReputationTier repTier) = reputationSystem.getScore(user);

        // RepTier gets +1 offset to align: Bronze(0)→1, Silver(1)→2, Gold(2)→3, Platinum(3)→4
        uint256 repTierAligned = uint256(repTier) + 1;
        uint256 stakeTierVal = uint256(stakeTier);

        // Result = min(stakeTier, repTier+1)
        uint256 result = stakeTierVal < repTierAligned ? stakeTierVal : repTierAligned;
        return MarketplaceTier(result);
    }

    function getBuyerCredits(address buyer, address token) external view returns (uint256) {
        return _buyerCredits[buyer][token];
    }

    function getSkillDependencies(uint256 skillId) external view returns (uint256[] memory) {
        return _skillDependencies[skillId];
    }

    function getSellerListingCount(address seller) external view returns (uint256) {
        return _sellerListingCount[seller];
    }

    function getAccessIdByBuyer(address buyer, uint256 skillId) external view returns (uint256) {
        return _buyerSkillAccess[buyer][skillId];
    }

    function hasActiveAccess(address buyer, uint256 skillId) external view returns (bool) {
        uint256 accessId = _buyerSkillAccess[buyer][skillId];
        if (accessId == 0) return false;

        AccessRecord storage access = _access[accessId];
        if (!access.active) return false;

        // Check expiry for subscriptions
        if (access.pricingModel == PricingModel.SUBSCRIPTION && block.timestamp > access.expiresAt) {
            return false;
        }

        return true;
    }

    // --- Admin ---

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    // --- Internal ---

    function _collectPayment(address from, address seller, uint256 amount, address token) internal {
        // Fee-on-transfer safe
        uint256 balanceBefore = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransferFrom(from, address(this), amount);
        uint256 received = IERC20(token).balanceOf(address(this)) - balanceBefore;

        uint256 fee = 0;
        if (token != address(lobToken)) {
            fee = (received * USDC_FEE_BPS) / 10000;
        }

        uint256 sellerPayout = received - fee;

        // Transfer to seller immediately
        IERC20(token).safeTransfer(seller, sellerPayout);
        if (fee > 0) {
            IERC20(token).safeTransfer(treasury, fee);
        }
    }
}
