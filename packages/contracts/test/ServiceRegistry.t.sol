// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/LOBToken.sol";
import "../src/StakingManager.sol";
import "../src/ReputationSystem.sol";
import "../src/ServiceRegistry.sol";
import "../src/SybilGuard.sol";

contract MockSybilGuardSR {
    function checkBanned(address) external pure returns (bool) { return false; }
    function checkAnyBanned(address[] calldata) external pure returns (bool) { return false; }
}

contract ServiceRegistryTest is Test {
    // Re-declare events for vm.expectEmit (Solidity 0.8.20 limitation)
    event ListingCreated(uint256 indexed listingId, address indexed provider, IServiceRegistry.ServiceCategory category, uint256 pricePerUnit, address settlementToken);
    event ListingUpdated(uint256 indexed listingId, uint256 pricePerUnit, address settlementToken);
    event ListingDeactivated(uint256 indexed listingId);
    LOBToken public token;
    StakingManager public staking;
    ReputationSystem public reputation;
    ServiceRegistry public registry;
    MockSybilGuardSR public mockSybilGuard;

    address public admin = makeAddr("admin");
    address public distributor = makeAddr("distributor");
    address public alice = makeAddr("alice");
    address public bob = makeAddr("bob");

    function setUp() public {
        vm.startPrank(admin);
        token = new LOBToken();
        token.initialize(distributor);
        staking = new StakingManager();
        staking.initialize(address(token));
        reputation = new ReputationSystem();
        reputation.initialize();
        mockSybilGuard = new MockSybilGuardSR();
        registry = new ServiceRegistry();
        registry.initialize(address(staking), address(reputation), address(mockSybilGuard));
        vm.stopPrank();

        // Fund alice
        vm.prank(distributor);
        token.transfer(alice, 200_000 ether);

        // Alice stakes to Bronze tier
        vm.startPrank(alice);
        token.approve(address(staking), 100 ether);
        staking.stake(100 ether);
        vm.stopPrank();
    }

    function test_CreateListing() public {
        vm.prank(alice);
        uint256 listingId = registry.createListing(
            IServiceRegistry.ServiceCategory.DATA_SCRAPING,
            "Web Scraping Service",
            "I scrape websites",
            50 ether,
            address(token),
            3600,
            "ipfs://metadata"
        );

        assertEq(listingId, 1);

        IServiceRegistry.Listing memory listing = registry.getListing(listingId);
        assertEq(listing.provider, alice);
        assertEq(listing.title, "Web Scraping Service");
        assertEq(listing.pricePerUnit, 50 ether);
        assertTrue(listing.active);
    }

    function test_CreateListing_RevertNoStake() public {
        vm.prank(bob); // bob has no stake
        vm.expectRevert("ServiceRegistry: no active stake");
        registry.createListing(
            IServiceRegistry.ServiceCategory.CODING,
            "Coding Service",
            "I code",
            100 ether,
            address(token),
            7200,
            ""
        );
    }

    function test_CreateListing_RevertMaxListings() public {
        // Bronze tier allows 3 listings max
        vm.startPrank(alice);
        for (uint256 i = 0; i < 3; i++) {
            registry.createListing(
                IServiceRegistry.ServiceCategory.CODING,
                "Service",
                "Description",
                100 ether,
                address(token),
                7200,
                ""
            );
        }

        vm.expectRevert("ServiceRegistry: max listings reached");
        registry.createListing(
            IServiceRegistry.ServiceCategory.CODING,
            "Fourth Service",
            "Description",
            100 ether,
            address(token),
            7200,
            ""
        );
        vm.stopPrank();
    }

    function test_UpdateListing() public {
        vm.startPrank(alice);
        uint256 listingId = registry.createListing(
            IServiceRegistry.ServiceCategory.DATA_SCRAPING,
            "Old Title",
            "Old desc",
            50 ether,
            address(token),
            3600,
            ""
        );

        registry.updateListing(
            listingId,
            "New Title",
            "New desc",
            75 ether,
            address(token),
            7200,
            "ipfs://new"
        );
        vm.stopPrank();

        IServiceRegistry.Listing memory listing = registry.getListing(listingId);
        assertEq(listing.title, "New Title");
        assertEq(listing.pricePerUnit, 75 ether);
    }

    function test_UpdateListing_RevertNotOwner() public {
        vm.prank(alice);
        uint256 listingId = registry.createListing(
            IServiceRegistry.ServiceCategory.DATA_SCRAPING,
            "Title",
            "Desc",
            50 ether,
            address(token),
            3600,
            ""
        );

        vm.prank(bob);
        vm.expectRevert("ServiceRegistry: not owner");
        registry.updateListing(listingId, "Hacked", "x", 1 ether, address(token), 3600, "");
    }

    function test_DeactivateListing() public {
        vm.startPrank(alice);
        uint256 listingId = registry.createListing(
            IServiceRegistry.ServiceCategory.DATA_SCRAPING,
            "Title",
            "Desc",
            50 ether,
            address(token),
            3600,
            ""
        );

        assertEq(registry.getProviderListingCount(alice), 1);

        registry.deactivateListing(listingId);
        vm.stopPrank();

        IServiceRegistry.Listing memory listing = registry.getListing(listingId);
        assertFalse(listing.active);
        assertEq(registry.getProviderListingCount(alice), 0);
    }

    function test_DeactivateListing_RevertNotOwner() public {
        vm.prank(alice);
        uint256 listingId = registry.createListing(
            IServiceRegistry.ServiceCategory.DATA_SCRAPING,
            "Title",
            "Desc",
            50 ether,
            address(token),
            3600,
            ""
        );

        vm.prank(bob);
        vm.expectRevert("ServiceRegistry: not owner");
        registry.deactivateListing(listingId);
    }

    function test_CreateListing_ValidationErrors() public {
        vm.startPrank(alice);

        vm.expectRevert("ServiceRegistry: invalid title");
        registry.createListing(
            IServiceRegistry.ServiceCategory.CODING,
            "", // empty title
            "Desc",
            100 ether,
            address(token),
            7200,
            ""
        );

        vm.expectRevert("ServiceRegistry: zero price");
        registry.createListing(
            IServiceRegistry.ServiceCategory.CODING,
            "Title",
            "Desc",
            0, // zero price
            address(token),
            7200,
            ""
        );

        vm.expectRevert("ServiceRegistry: zero delivery time");
        registry.createListing(
            IServiceRegistry.ServiceCategory.CODING,
            "Title",
            "Desc",
            100 ether,
            address(token),
            0, // zero delivery
            ""
        );

        vm.stopPrank();
    }

    function test_GetListing_RevertNotFound() public {
        vm.expectRevert("ServiceRegistry: listing not found");
        registry.getListing(999);
    }

    // --- Pause / Unpause Tests ---

    function test_Paused_CreateListingReverts() public {
        vm.prank(admin);
        registry.pause();

        vm.prank(alice);
        vm.expectRevert("EnforcedPause()");
        registry.createListing(
            IServiceRegistry.ServiceCategory.CODING,
            "Service",
            "Desc",
            100 ether,
            address(token),
            7200,
            ""
        );
    }

    function test_Paused_UpdateListingReverts() public {
        vm.prank(alice);
        uint256 listingId = registry.createListing(
            IServiceRegistry.ServiceCategory.CODING,
            "Service",
            "Desc",
            100 ether,
            address(token),
            7200,
            ""
        );

        vm.prank(admin);
        registry.pause();

        vm.prank(alice);
        vm.expectRevert("EnforcedPause()");
        registry.updateListing(listingId, "New", "New", 200 ether, address(token), 3600, "");
    }

    function test_Paused_DeactivateListingReverts() public {
        vm.prank(alice);
        uint256 listingId = registry.createListing(
            IServiceRegistry.ServiceCategory.CODING,
            "Service",
            "Desc",
            100 ether,
            address(token),
            7200,
            ""
        );

        vm.prank(admin);
        registry.pause();

        vm.prank(alice);
        vm.expectRevert("EnforcedPause()");
        registry.deactivateListing(listingId);
    }

    function test_Unpause_ResumesOperations() public {
        vm.prank(admin);
        registry.pause();

        vm.prank(admin);
        registry.unpause();

        vm.prank(alice);
        uint256 listingId = registry.createListing(
            IServiceRegistry.ServiceCategory.CODING,
            "Service",
            "Desc",
            100 ether,
            address(token),
            7200,
            ""
        );
        assertEq(listingId, 1);
    }

    // --- Event Emission Tests ---

    function test_EmitListingCreated() public {
        vm.prank(alice);
        vm.expectEmit(true, true, false, true);
        emit ListingCreated(1, alice, IServiceRegistry.ServiceCategory.CODING, 100 ether, address(token));
        registry.createListing(
            IServiceRegistry.ServiceCategory.CODING,
            "Service",
            "Desc",
            100 ether,
            address(token),
            7200,
            ""
        );
    }

    function test_EmitListingUpdated() public {
        vm.startPrank(alice);
        uint256 listingId = registry.createListing(
            IServiceRegistry.ServiceCategory.CODING,
            "Service",
            "Desc",
            100 ether,
            address(token),
            7200,
            ""
        );

        vm.expectEmit(true, false, false, true);
        emit ListingUpdated(listingId, 200 ether, address(token));
        registry.updateListing(listingId, "New", "New", 200 ether, address(token), 3600, "");
        vm.stopPrank();
    }

    function test_EmitListingDeactivated() public {
        vm.startPrank(alice);
        uint256 listingId = registry.createListing(
            IServiceRegistry.ServiceCategory.CODING,
            "Service",
            "Desc",
            100 ether,
            address(token),
            7200,
            ""
        );

        vm.expectEmit(true, false, false, false);
        emit ListingDeactivated(listingId);
        registry.deactivateListing(listingId);
        vm.stopPrank();
    }
}
