FROM node:20-slim AS builder

WORKDIR /build

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy workspace root manifests
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./

# Copy package sources needed for the agent
COPY packages/openclaw/ packages/openclaw/
COPY packages/openclaw-skill/ packages/openclaw-skill/
COPY packages/lobstrclaw/ packages/lobstrclaw/

# Install dependencies and build
RUN pnpm install --frozen-lockfile --filter openclaw --filter openclaw-skill --filter lobstrclaw
RUN pnpm --filter openclaw build
RUN pnpm --filter openclaw-skill build
RUN pnpm --filter lobstrclaw build

# ──────────────────────────────────────
FROM node:20-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends curl jq cron && \
    rm -rf /var/lib/apt/lists/*

# Install Foundry (cast binary only — for on-chain transaction execution)
RUN curl -L https://foundry.paradigm.xyz | bash && \
    /root/.foundry/bin/foundryup && \
    cp /root/.foundry/bin/cast /usr/local/bin/cast && \
    rm -rf /root/.foundry

# Non-root user
RUN groupadd -g 1000 agent && \
    useradd -u 1000 -g agent -m -s /bin/bash agent

# Copy built application (owned by agent, not root)
COPY --from=builder --chown=agent:agent /build /opt/lobstr/app

# Copy shared scripts and cron templates
COPY --chown=agent:agent packages/agents/shared/scripts/ /opt/scripts/
COPY --chown=agent:agent packages/agents/shared/cron/ /opt/cron/
COPY --chown=agent:agent packages/agents/shared/docker-entrypoint.sh /opt/docker-entrypoint.sh

RUN chmod +x /opt/docker-entrypoint.sh /opt/scripts/*.sh /opt/cron/*.sh

# Create log directory
RUN mkdir -p /var/log/agent && chown agent:agent /var/log/agent

# Link CLI globally
RUN cd /opt/lobstr/app && \
    corepack enable && \
    corepack prepare pnpm@latest --activate && \
    pnpm --filter openclaw link --global 2>/dev/null || true && \
    pnpm --filter lobstrclaw link --global 2>/dev/null || true

# No exposed ports — zero inbound attack surface
ENTRYPOINT ["/opt/docker-entrypoint.sh"]
