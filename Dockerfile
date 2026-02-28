# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:20-slim AS builder

WORKDIR /app

# Install dependencies first (separate layer for cache efficiency)
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# Copy source and compile TypeScript
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Prune dev dependencies
RUN npm prune --omit=dev

# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
FROM node:20-slim AS runtime

WORKDIR /app

# Copy production node_modules + compiled output
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json

# Runtime defaults — overridden by Container Apps env vars
ENV PORT=3000
ENV MCP_ENV=demo
ENV PAYNEXUS_API_URL=http://localhost:3001
ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "dist/server.js"]
