# ProductMarketplace Deploy Plan

## Prerequisites

- [ ] Deployer wallet funded with ETH on Base Mainnet (gas)
- [ ] `.env` configured in `packages/contracts/` with:
  ```
  PRIVATE_KEY=0x...
  SERVICE_REGISTRY_ADDRESS=0xCa8a4528a7a4c693C19AaB3f39a555150E31013E
  ESCROW_ENGINE_ADDRESS=0xd8654D79C21Fb090Ef30C901db530b127Ef82b4E
  SYBIL_GUARD_ADDRESS=0xd45202b192676BA94Df9C36bA4fF5c63cE001381
  BASE_MAINNET_RPC_URL=https://mainnet.base.org
  BASESCAN_API_KEY=<your-key>
  ```

---

## Phase 1: Contract Deployment (Base Mainnet)

### 1.1 Build & verify locally

```bash
cd packages/contracts
forge build --skip test --skip script
forge test --mc ProductMarketplaceTest -v
```

All 47 tests must pass.

### 1.2 Deploy to Base Mainnet

```bash
forge script script/DeployProductMarketplace.s.sol:DeployProductMarketplace \
  --rpc-url $BASE_MAINNET_RPC_URL \
  --broadcast --verify -vvvv
```

This deploys:
- `ProductMarketplace` implementation contract
- `ERC1967Proxy` pointing to the implementation
- Calls `initialize(serviceRegistry, escrowEngine, sybilGuard)`

Record the **proxy address** from the output.

### 1.3 Verify on Basescan (if --verify didn't auto-verify)

```bash
forge verify-contract <PROXY_ADDRESS> src/ProductMarketplace.sol:ProductMarketplace \
  --chain base \
  --etherscan-api-key $BASESCAN_API_KEY
```

---

## Phase 2: Update Config (Single Source of Truth)

### 2.1 Update contract addresses

Edit `packages/web/src/config/contract-addresses.ts`:

```diff
- productMarketplace: ZERO_ADDRESS,
+ productMarketplace: "0x<DEPLOYED_PROXY_ADDRESS>" as Address,
```

Update **both** `BASE_MAINNET_ADDRESSES` and `BASE_SEPOLIA_ADDRESSES` (if deploying to testnet too).

### 2.2 Verify address wiring

```bash
pnpm check:address-wiring
```

Must pass with no errors.

---

## Phase 3: Regenerate ABIs

The ABI was already generated during implementation. If the contract changed since then:

```bash
cd packages/contracts
forge build --skip test --skip script
python3 -c "
import json, sys
data = json.load(open('out/ProductMarketplace.sol/ProductMarketplace.json'))
print('export const ProductMarketplaceABI =', json.dumps(data['abi'], indent=2), 'as const;')
" > /tmp/pm-abi.ts
```

Then replace the ABI in:
- `packages/web/src/config/abis.ts` (the `ProductMarketplaceABI` export at the bottom)
- `packages/indexer/abis/ProductMarketplace.ts` (full file replacement)

---

## Phase 4: Update Indexer Start Block

Edit `packages/indexer/ponder.config.ts`:

```diff
  ProductMarketplace: {
    network: "baseMainnet",
    abi: ProductMarketplaceABI,
    address: CONTRACTS.productMarketplace,
-   startBlock: V3_START_BLOCK,
+   startBlock: <DEPLOY_BLOCK_NUMBER>,
  },
```

Use the block number from the deployment transaction.

---

## Phase 5: Deploy Web + Indexer

### 5.1 Push to main

```bash
git add -A
git commit -m "Deploy ProductMarketplace to Base Mainnet"
git push origin main
```

This triggers the GitHub Actions deploy workflow which:
1. Builds and deploys **web** to Firebase Hosting (Cloud Run)
2. Deploys **indexer** to Railway (picks up new contract + handlers)
3. Deploys **agent-memory** to Railway (no changes needed)

### 5.2 Monitor deployments

- **Firebase**: Check https://console.firebase.google.com/project/lobstr-8ec05/hosting
- **Railway**: Check https://railway.app (lobstr-indexer service)
- **Indexer health**: `curl https://<INDEXER_URL>/health`

### 5.3 Verify indexer is syncing

The indexer will start indexing ProductMarketplace events from the start block. Check:
- GraphQL endpoint responds with `product` and `auction` tables
- No errors in Railway logs

---

## Phase 6: Smoke Test (Base Mainnet)

### 6.1 Fixed-price flow

1. **Seller stakes LOB** (if not already staked) via Staking page
2. **Seller creates ServiceRegistry listing** (PHYSICAL_TASK category) via Post Job page
3. **Seller calls `createProduct(listingId, ...)`** via /products/sell
4. **Verify** product appears on /products page (via indexer)
5. **Buyer approves LOB** to ProductMarketplace contract
6. **Buyer calls `buyProduct(productId, amount, deadline)`**
7. **Seller calls `shipProduct(jobId, carrier, tracking)`** via dashboard
8. **Seller calls `submitDelivery(jobId, metadataURI)`** on EscrowEngine
9. **Buyer calls `confirmReceipt(jobId)`** — funds released to seller

### 6.2 Auction flow

1. **Seller creates AUCTION product** via /products/sell
2. **Seller calls `createAuction(productId, ...)`**
3. **Bidder 1 approves + calls `placeBid(auctionId, amount)`**
4. **Bidder 2 outbids** (must exceed by 5%)
5. **Wait for auction end** (or use buy-now)
6. **Anyone calls `settleAuction(auctionId, deadline)`**
7. **Bidder 1 calls `withdrawBid()`** to reclaim refund
8. **Winner receives escrow job** → shipping → confirm receipt

### 6.3 Dispute flow

1. After step 7 of fixed-price flow, instead of confirming:
2. **Buyer calls `reportDamaged(jobId, evidenceURI)`**
3. Dispute routes to DisputeArbitration (3-arbitrator panel)
4. Arbitrators vote → ruling resolves escrow

### 6.4 Return flow

1. After buyer confirms receipt:
2. **Within 7 days**, buyer calls `requestReturn(jobId, reason)`
3. Shipment status updates to RETURN_REQUESTED

---

## Post-Deploy: Role Grants (if needed)

ProductMarketplace does **not** require any special roles from other contracts. It:
- Reads from ServiceRegistry (public `getListing`)
- Calls EscrowEngine as buyer proxy (public `createJob`, `confirmDelivery`, `initiateDispute`)
- Calls EscrowEngine `setJobPayer` (requires being the job buyer, which it is)
- Reads SybilGuard (public `checkBanned`)

No admin grants needed.

---

## Rollback Plan

If issues are found post-deploy:

1. **Pause the contract**: Owner calls `marketplace.pause()`
2. **Update address to ZERO_ADDRESS** in `contract-addresses.ts` to hide from UI
3. **Push to main** to redeploy web/indexer without ProductMarketplace
4. **Fix issues**, redeploy implementation, and upgrade proxy via UUPS

---

## Timeline Summary

| Step | Action |
|------|--------|
| 1 | Deploy contract to Base Mainnet |
| 2 | Update `contract-addresses.ts` with proxy address |
| 3 | Update indexer start block |
| 4 | Push to main (auto-deploys web + indexer) |
| 5 | Smoke test all flows |
| 6 | Announce on Discord/Twitter |
