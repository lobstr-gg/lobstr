---
name: uniswap-swap
description: Plan and execute token swaps on Uniswap via deep links. Use when conversation involves swapping tokens, trading ETH for USDC, exchanging tokens, buying tokens, converting ETH to stablecoins, or any token swap on Base or other Uniswap-supported chains. Generates deep links for execution in the Uniswap interface. Based on Uniswap AI skills (github.com/Uniswap/uniswap-ai).
---

# Uniswap Swap Planner (LOBSTR Adapted)

Plan token swaps and generate deep links for execution on Uniswap. Adapted from the official Uniswap AI swap-planner skill for LOBSTR agent use.

## When To Use

- Steward needs to swap tokens for treasury management (e.g., ETH for gas top-ups)
- Any agent needs to convert tokens on Base
- Cruz asks an agent to prepare a swap

## Safety Rules

- **Never execute swaps autonomously** — generate the deep link and post to #crew for Cruz to review
- **Always verify token contracts on-chain** before generating links
- **Log all swap plans to BRAIN.md** via `brain_log_action`
- **Warn about low liquidity** — if pool TVL < $100k, flag it

## Workflow

### Step 1: Gather Swap Intent

Extract from the request:

| Parameter    | Required                | Example                   |
| ------------ | ----------------------- | ------------------------- |
| Input token  | Yes                     | ETH, USDC, token address  |
| Output token | Yes                     | USDC, WBTC, token address |
| Amount       | Yes                     | 1.5 ETH, $500 worth       |
| Chain        | Yes (default: Base)     | Base, Ethereum, Arbitrum   |

### Step 2: Resolve Token Addresses

**Native tokens**: Use `NATIVE` as the address parameter.

**Common tokens on Base:**

| Token | Address                                      |
| ----- | -------------------------------------------- |
| USDC  | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| WETH  | `0x4200000000000000000000000000000000000006` |
| DAI   | `0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb` |
| cbBTC | `0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf` |

**Common tokens on Ethereum:**

| Token | Address                                      |
| ----- | -------------------------------------------- |
| USDC  | `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` |
| WETH  | `0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2` |
| WBTC  | `0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599` |
| DAI   | `0x6B175474E89094C44Da98b954EedeAC495271d0F` |

For unknown tokens, search DexScreener:

```bash
curl -s "https://api.dexscreener.com/latest/dex/search?q=TOKEN_NAME" | \
  jq '[.pairs[] | select(.chainId == "base" and .dexId == "uniswap")] |
    sort_by(-.volume.h24) | .[0:5] | map({
      token: .baseToken.symbol,
      address: .baseToken.address,
      price: .priceUsd,
      volume24h: .volume.h24,
      liquidity: .liquidity.usd
    })'
```

### Step 3: Verify Token Contract

Verify the token address is a real contract:

```bash
# Using the agent's RPC (Base)
curl -s -X POST "${OPENCLAW_RPC_URL}" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_getCode","params":["TOKEN_ADDRESS","latest"],"id":1}' \
  | jq -r '.result'
```

If result is `0x` or empty, the address is NOT a valid contract. Do not proceed.

### Step 4: Fetch Price Data

Get current price and liquidity from DexScreener:

```bash
curl -s "https://api.dexscreener.com/token-pairs/v1/base/TOKEN_ADDRESS" | \
  jq '[.[] | select(.dexId == "uniswap")][0] | {
    price: .priceUsd,
    liquidity: .liquidity.usd,
    volume24h: .volume.h24
  }'
```

**Liquidity risk assessment:**

| Pool TVL    | Risk    | Action                                  |
| ----------- | ------- | --------------------------------------- |
| > $1M       | Low     | Proceed normally                        |
| $100k - $1M | Medium  | Note potential slippage in the message  |
| < $100k     | High    | Warn user explicitly, suggest smaller trade |

### Step 5: Generate Deep Link

Construct the Uniswap swap URL:

```
https://app.uniswap.org/swap?chain={chain}&inputCurrency={input}&outputCurrency={output}&value={amount}&field=INPUT
```

**Parameters:**

| Parameter        | Description      | Values                                              |
| ---------------- | ---------------- | --------------------------------------------------- |
| `chain`          | Network          | `base`, `ethereum`, `arbitrum`, `optimism`, `polygon` |
| `inputCurrency`  | Input token      | Address or `NATIVE` for ETH                         |
| `outputCurrency` | Output token     | Address or `NATIVE` for ETH                         |
| `value`          | Amount           | Decimal number (e.g., `1.5`)                        |
| `field`          | Amount direction | `INPUT` or `OUTPUT`                                 |

### Step 6: Post to Discord

Format and post to #crew:

```markdown
## Swap Plan

| Parameter        | Value                      |
| ---------------- | -------------------------- |
| From             | 1 ETH                      |
| To               | USDC                       |
| Chain            | Base                       |
| Current Rate     | ~3,200 USDC per ETH        |
| Estimated Output | ~3,200 USDC                |
| Pool Liquidity   | $15.2M (Low slippage risk) |

**Execute here:** https://app.uniswap.org/swap?chain=base&inputCurrency=NATIVE&outputCurrency=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913&value=1&field=INPUT
```

## Supported Chains

Base (primary — where LOBSTR operates), Ethereum, Arbitrum, Optimism, Polygon, BNB Chain, Avalanche, Unichain

## Important Notes

- Default slippage in Uniswap is 0.5%. For volatile tokens, advise adjusting.
- Base has the lowest gas fees. Always default to Base unless specified otherwise.
- For large trades, warn about price impact and suggest splitting.
- **Never generate links for tokens you haven't verified on-chain.**
