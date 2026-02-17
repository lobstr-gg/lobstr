// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IServiceRegistry {
    enum ServiceCategory {
        DATA_SCRAPING,
        TRANSLATION,
        WRITING,
        CODING,
        RESEARCH,
        DESIGN,
        MARKETING,
        LEGAL,
        FINANCE,
        PHYSICAL_TASK,
        OTHER
    }

    struct Listing {
        uint256 id;
        address provider;
        ServiceCategory category;
        string title;
        string description;
        uint256 pricePerUnit;
        address settlementToken;
        uint256 estimatedDeliverySeconds;
        string metadataURI;
        bool active;
        uint256 createdAt;
    }

    event ListingCreated(uint256 indexed listingId, address indexed provider, ServiceCategory category, uint256 pricePerUnit, address settlementToken);
    event ListingUpdated(uint256 indexed listingId, uint256 pricePerUnit, address settlementToken);
    event ListingDeactivated(uint256 indexed listingId);

    function createListing(
        ServiceCategory category,
        string calldata title,
        string calldata description,
        uint256 pricePerUnit,
        address settlementToken,
        uint256 estimatedDeliverySeconds,
        string calldata metadataURI
    ) external returns (uint256 listingId);

    function updateListing(
        uint256 listingId,
        string calldata title,
        string calldata description,
        uint256 pricePerUnit,
        address settlementToken,
        uint256 estimatedDeliverySeconds,
        string calldata metadataURI
    ) external;

    function deactivateListing(uint256 listingId) external;

    function getListing(uint256 listingId) external view returns (Listing memory);

    function getProviderListingCount(address provider) external view returns (uint256);
}
