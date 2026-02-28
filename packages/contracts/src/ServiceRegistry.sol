// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "./interfaces/IServiceRegistry.sol";
import "./interfaces/IStakingManager.sol";
import "./interfaces/IReputationSystem.sol";
import "./interfaces/ISybilGuard.sol";

contract ServiceRegistry is IServiceRegistry, Initializable, UUPSUpgradeable, OwnableUpgradeable, AccessControlUpgradeable, ReentrancyGuardUpgradeable, PausableUpgradeable {
    IStakingManager public stakingManager;
    IReputationSystem public reputationSystem;
    ISybilGuard public sybilGuard;

    uint256 private _nextListingId = 1;

    mapping(uint256 => Listing) private _listings;
    mapping(address => uint256) private _providerListingCount;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address _stakingManager, address _reputationSystem, address _sybilGuard) external initializer {
        __Ownable_init(msg.sender);
        __UUPSUpgradeable_init();
        __AccessControl_init();
        __ReentrancyGuard_init();
        __Pausable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);

        _nextListingId = 1;

        require(_stakingManager != address(0), "ServiceRegistry: zero staking");
        require(_reputationSystem != address(0), "ServiceRegistry: zero reputation");
        require(_sybilGuard != address(0), "ServiceRegistry: zero sybilGuard");
        stakingManager = IStakingManager(_stakingManager);
        reputationSystem = IReputationSystem(_reputationSystem);
        sybilGuard = ISybilGuard(_sybilGuard);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    function createListing(
        ServiceCategory category,
        string calldata title,
        string calldata description,
        uint256 pricePerUnit,
        address settlementToken,
        uint256 estimatedDeliverySeconds,
        string calldata metadataURI
    ) external nonReentrant whenNotPaused returns (uint256 listingId) {
        require(bytes(title).length > 0 && bytes(title).length <= 256, "ServiceRegistry: invalid title");
        require(bytes(description).length <= 1024, "ServiceRegistry: description too long");
        require(pricePerUnit > 0, "ServiceRegistry: zero price");
        require(estimatedDeliverySeconds > 0, "ServiceRegistry: zero delivery time");
        require(settlementToken != address(0), "ServiceRegistry: zero token");

        // H-4: Ban check
        require(!sybilGuard.checkBanned(msg.sender), "ServiceRegistry: provider banned");

        IStakingManager.Tier tier = stakingManager.getTier(msg.sender);
        require(tier != IStakingManager.Tier.None, "ServiceRegistry: no active stake");

        uint256 maxAllowed = stakingManager.maxListings(tier);
        require(_providerListingCount[msg.sender] < maxAllowed, "ServiceRegistry: max listings reached");

        listingId = _nextListingId++;

        _listings[listingId] = Listing({
            id: listingId,
            provider: msg.sender,
            category: category,
            title: title,
            description: description,
            pricePerUnit: pricePerUnit,
            settlementToken: settlementToken,
            estimatedDeliverySeconds: estimatedDeliverySeconds,
            metadataURI: metadataURI,
            active: true,
            createdAt: block.timestamp
        });

        _providerListingCount[msg.sender] += 1;

        emit ListingCreated(listingId, msg.sender, category, pricePerUnit, settlementToken);
    }

    function updateListing(
        uint256 listingId,
        string calldata title,
        string calldata description,
        uint256 pricePerUnit,
        address settlementToken,
        uint256 estimatedDeliverySeconds,
        string calldata metadataURI
    ) external nonReentrant whenNotPaused {
        Listing storage listing = _listings[listingId];
        require(listing.provider == msg.sender, "ServiceRegistry: not owner");
        require(listing.active, "ServiceRegistry: listing inactive");
        require(bytes(title).length > 0 && bytes(title).length <= 256, "ServiceRegistry: invalid title");
        require(bytes(description).length <= 1024, "ServiceRegistry: description too long");
        require(pricePerUnit > 0, "ServiceRegistry: zero price");
        require(estimatedDeliverySeconds > 0, "ServiceRegistry: zero delivery time");
        require(settlementToken != address(0), "ServiceRegistry: zero token");

        listing.title = title;
        listing.description = description;
        listing.pricePerUnit = pricePerUnit;
        listing.settlementToken = settlementToken;
        listing.estimatedDeliverySeconds = estimatedDeliverySeconds;
        listing.metadataURI = metadataURI;

        emit ListingUpdated(listingId, pricePerUnit, settlementToken);
    }

    function deactivateListing(uint256 listingId) external nonReentrant whenNotPaused {
        Listing storage listing = _listings[listingId];
        require(listing.provider == msg.sender, "ServiceRegistry: not owner");
        require(listing.active, "ServiceRegistry: already inactive");

        listing.active = false;
        _providerListingCount[msg.sender] -= 1;

        emit ListingDeactivated(listingId);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function getListing(uint256 listingId) external view returns (Listing memory) {
        Listing memory listing = _listings[listingId];
        require(listing.provider != address(0), "ServiceRegistry: listing not found");
        return listing;
    }

    function getProviderListingCount(address provider) external view returns (uint256) {
        return _providerListingCount[provider];
    }
}
