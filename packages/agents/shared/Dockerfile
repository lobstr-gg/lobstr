# Pin to SHA for supply-chain safety — update periodically
FROM node:20-slim@sha256:c6585df72c34172bebd8d36abed961e231d7d3b5cee2e01294c4495e8a03f687 AS builder

WORKDIR /build

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy vendored openclaw packages + workspace config
COPY packages/openclaw/package.json packages/openclaw/tsconfig.json packages/openclaw/
COPY packages/openclaw/src/ packages/openclaw/src/
COPY packages/openclaw-skill/package.json packages/openclaw-skill/tsconfig.json packages/openclaw-skill/
COPY packages/openclaw-skill/src/ packages/openclaw-skill/src/

# Copy Discord bot package
COPY packages/discord-bot/package.json packages/discord-bot/
COPY packages/discord-bot/bot.mjs packages/discord-bot/

# Create minimal pnpm workspace
RUN echo '{"private":true}' > package.json && \
    echo 'packages:\n  - "packages/*"' > pnpm-workspace.yaml

# Install dependencies and build
RUN pnpm install --filter openclaw --filter openclaw-skill --filter lobstr-discord-bot
RUN pnpm --filter openclaw build
RUN pnpm --filter openclaw-skill build

# ──────────────────────────────────────
FROM node:20-slim@sha256:c6585df72c34172bebd8d36abed961e231d7d3b5cee2e01294c4495e8a03f687

RUN apt-get update && \
    apt-get install -y --no-install-recommends curl jq cron ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# Non-root user (reuse node:20-slim's existing UID/GID 1000)
RUN usermod -l agent -d /home/agent -m node && \
    groupmod -n agent node

# Copy built application
COPY --from=builder /build /opt/lobstr/app

# Copy shared scripts, cron templates, and bundled skills
COPY scripts/ /opt/scripts/
COPY cron/ /opt/cron/
COPY skills/ /opt/skills/
COPY docker-entrypoint.sh /opt/docker-entrypoint.sh

RUN chmod +x /opt/docker-entrypoint.sh /opt/scripts/*.sh /opt/cron/*.sh

# Create log directory
RUN mkdir -p /var/log/agent && chown agent:agent /var/log/agent && \
    mkdir -p /home/agent && chown agent:agent /home/agent

# Link lobstr CLI globally via shell wrapper (more reliable than pnpm link)
RUN printf '#!/bin/sh\nexec node /opt/lobstr/app/packages/openclaw-skill/dist/bin.js "$@"\n' \
    > /usr/local/bin/lobstr && chmod +x /usr/local/bin/lobstr

# Copy ZK circuit files for attestation proof generation
COPY circuits/ /opt/lobstr/circuits/

# No exposed ports — zero inbound attack surface
ENTRYPOINT ["/opt/docker-entrypoint.sh"]
