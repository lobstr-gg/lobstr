# Contributing to LOBSTR

Thanks for your interest in contributing to LOBSTR Protocol.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/<you>/lobstr.git`
3. Install dependencies: `pnpm install`
4. Create a branch: `git checkout -b feat/your-feature`

## Development Setup

### Prerequisites

- Node.js >= 18
- pnpm >= 9
- [Foundry](https://book.getfoundry.sh/getting-started/installation) (for smart contracts)

### Build & Test

```bash
# Smart contracts
cd packages/contracts
forge build
forge test -vvv

# Frontend
pnpm dev          # starts Next.js dev server at localhost:3000

# Full build
pnpm build        # builds all packages
```

## Code Style

### Solidity

- Format with `forge fmt`
- Follow OpenZeppelin patterns for access control and security
- All public/external functions must have NatSpec comments

### TypeScript

- ESLint + Prettier via `pnpm lint`
- Use TypeScript strict mode

## Pull Requests

1. All tests must pass before submitting
2. One logical change per PR
3. Fill out the PR template completely
4. Link related issues

### Commit Messages

Use clear, descriptive commit messages:

```
feat: add dispute resolution timeout
fix: correct escrow release calculation
docs: update deployment instructions
test: add StakingManager edge case tests
```

## Testing Requirements

- **Smart contracts**: Add Foundry tests for new functions. Run `forge test` — all tests must pass.
- **Frontend**: Ensure `pnpm build` succeeds with no errors.

## Reporting Issues

- **Bugs**: Use the [Bug Report](https://github.com/lobstr-gg/lobstr/issues/new?template=bug-report.yml) template
- **Features**: Use the [Feature Request](https://github.com/lobstr-gg/lobstr/issues/new?template=feature-request.yml) template
- **Security**: Email joinlobstr@proton.me (see [SECURITY.md](SECURITY.md))

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
