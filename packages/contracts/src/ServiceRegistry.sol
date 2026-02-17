// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./interfaces/IServiceRegistry.sol";
import "./interfaces/IStakingManager.sol";
import "./interfaces/IReputationSystem.sol";

contract ServiceRegistry is IServiceRegistry, AccessControl, ReentrancyGuard {
    IStakingManager public immutable stakingManager;
    IReputationSystem public immutable reputationSystem;

    uint256 private _nextListingId = 1;

    mapping(uint256 => Listing) private _listings;
    mapping(address => uint256) private _providerListingCount;

    constructor(address _stakingManager, address _reputationSystem) {
        require(_stakingManager != address(0), "ServiceRegistry: zero staking");
        require(_reputationSystem != address(0), "ServiceRegistry: zero reputation");
        stakingManager = IStakingManager(_stakingManager);
        reputationSystem = IReputationSystem(_reputationSystem);
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function createListing(
        ServiceCategory category,
        string calldata title,
        string calldata description,
        uint256 pricePerUnit,
        address settlementToken,
        uint256 estimatedDeliverySeconds,
        string calldata metadataURI
    ) external nonReentrant returns (uint256 listingId) {
        require(bytes(title).length > 0 && bytes(title).length <= 256, "ServiceRegistry: invalid title");
        require(bytes(description).length <= 1024, "ServiceRegistry: description too long");
        require(pricePerUnit > 0, "ServiceRegistry: zero price");
        require(estimatedDeliverySeconds > 0, "ServiceRegistry: zero delivery time");

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
    ) external nonReentrant {
        Listing storage listing = _listings[listingId];
        require(listing.provider == msg.sender, "ServiceRegistry: not owner");
        require(listing.active, "ServiceRegistry: listing inactive");
        require(bytes(title).length > 0 && bytes(title).length <= 256, "ServiceRegistry: invalid title");
        require(bytes(description).length <= 1024, "ServiceRegistry: description too long");
        require(pricePerUnit > 0, "ServiceRegistry: zero price");

        listing.title = title;
        listing.description = description;
        listing.pricePerUnit = pricePerUnit;
        listing.settlementToken = settlementToken;
        listing.estimatedDeliverySeconds = estimatedDeliverySeconds;
        listing.metadataURI = metadataURI;

        emit ListingUpdated(listingId, pricePerUnit, settlementToken);
    }

    function deactivateListing(uint256 listingId) external nonReentrant {
        Listing storage listing = _listings[listingId];
        require(listing.provider == msg.sender, "ServiceRegistry: not owner");
        require(listing.active, "ServiceRegistry: already inactive");

        listing.active = false;
        _providerListingCount[msg.sender] -= 1;

        emit ListingDeactivated(listingId);
    }

    function getListing(uint256 listingId) external view returns (Listing memory) {
        require(_listings[listingId].provider != address(0), "ServiceRegistry: listing not found");
        return _listings[listingId];
    }

    function getProviderListingCount(address provider) external view returns (uint256) {
        return _providerListingCount[provider];
    }
}
