// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface ISkillRegistry {
    enum AssetType { SKILL, AGENT_TEMPLATE, PIPELINE }
    enum DeliveryMethod { HOSTED_API, CODE_PACKAGE, BOTH }
    enum PricingModel { ONE_TIME, PER_CALL, SUBSCRIPTION }
    enum MarketplaceTier { None, Bronze, Silver, Gold, Platinum }

    struct SkillListing {
        uint256 id;
        address seller;
        AssetType assetType;
        DeliveryMethod deliveryMethod;
        PricingModel pricingModel;
        string title;
        string description;
        string metadataURI;
        uint256 version;
        uint256 price;
        address settlementToken;
        bytes32 apiEndpointHash;
        bytes32 packageHash;
        bool active;
        uint256 totalPurchases;
        uint256 totalCalls;
        uint256 createdAt;
        uint256 updatedAt;
    }

    struct AccessRecord {
        uint256 id;
        uint256 skillId;
        address buyer;
        PricingModel pricingModel;
        uint256 purchasedAt;
        uint256 expiresAt;
        uint256 totalCallsUsed;
        uint256 totalPaid;
        bool active;
    }

    struct ListSkillParams {
        AssetType assetType;
        DeliveryMethod deliveryMethod;
        PricingModel pricingModel;
        uint256 price;
        address settlementToken;
        bytes32 apiEndpointHash;
        bytes32 packageHash;
    }

    event SkillListed(uint256 indexed skillId, address indexed seller, AssetType assetType, PricingModel pricingModel, uint256 price);
    event SkillUpdated(uint256 indexed skillId, uint256 newPrice, string newMetadataURI);
    event SkillDeactivated(uint256 indexed skillId);
    event SkillPurchased(uint256 indexed skillId, address indexed buyer, uint256 accessId, PricingModel pricingModel, uint256 amount);
    event SubscriptionRenewed(uint256 indexed accessId, uint256 indexed skillId, address indexed buyer, uint256 newExpiresAt);
    event UsageRecorded(uint256 indexed accessId, uint256 indexed skillId, uint256 calls, uint256 cost);
    event CallCreditsDeposited(address indexed buyer, address indexed token, uint256 amount);
    event CallCreditsWithdrawn(address indexed buyer, address indexed token, uint256 amount);
    event SellerPaid(address indexed seller, address indexed token, uint256 amount);

    function listSkill(
        ListSkillParams calldata params,
        string calldata title,
        string calldata description,
        string calldata metadataURI,
        uint256[] calldata requiredSkills
    ) external returns (uint256 skillId);

    function updateSkill(
        uint256 skillId,
        uint256 newPrice,
        string calldata newMetadataURI,
        bytes32 newApiEndpointHash,
        bytes32 newPackageHash
    ) external;

    function deactivateSkill(uint256 skillId) external;

    function purchaseSkill(uint256 skillId) external returns (uint256 accessId);
    function renewSubscription(uint256 accessId) external;
    function recordUsage(uint256 accessId, uint256 calls) external;
    function depositCallCredits(address token, uint256 amount) external;
    function withdrawCallCredits(address token, uint256 amount) external;
    function claimEarnings(address token) external;

    function getSkill(uint256 skillId) external view returns (SkillListing memory);
    function getAccess(uint256 accessId) external view returns (AccessRecord memory);
    function getMarketplaceTier(address user) external view returns (MarketplaceTier);
    function getBuyerCredits(address buyer, address token) external view returns (uint256);
    function getSkillDependencies(uint256 skillId) external view returns (uint256[] memory);
    function getSellerListingCount(address seller) external view returns (uint256);
    function hasActiveAccess(address buyer, uint256 skillId) external view returns (bool);
    function getAccessIdByBuyer(address buyer, uint256 skillId) external view returns (uint256);
}
