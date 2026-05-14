# syntax=docker/dockerfile:1.7
# =============================================================================
# Parametric Memory Web — Multi-stage Docker build
# =============================================================================
# Produces a minimal production image using Next.js standalone output.
# Runs as non-root user (security audit finding from 2026-03-09).
# Supply-chain hardening (2026-05-12):
#   - syntax pragma pins BuildKit frontend (reproducible builds)
#   - OCI labels for registry metadata + Scout
#   - Compose-side runtime hardening (cap_drop, read_only, no-new-privileges)
#   - Build flags --sbom=true --provenance=mode=max set in CI (see docs)
#
# TODO: pin base image to digest. Get the current digest with:
#   docker buildx imagetools inspect node:22-alpine --format '{{.Manifest.Digest}}'
# then replace `node:22-alpine` below with `node:22-alpine@sha256:<digest>`
# on ALL THREE FROM lines. Renovate/dependabot can keep it current.
# =============================================================================

# --- Stage 1: Dependencies ---
FROM node:22-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts

# --- Stage 2: Build ---
FROM node:22-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Set build-time env vars
ARG GIT_COMMIT_SHA=unknown
ENV GIT_COMMIT_SHA=${GIT_COMMIT_SHA}
ENV NEXT_TELEMETRY_DISABLED=1

# Ensure public directory exists (may have no static assets yet)
RUN mkdir -p public

RUN npm run build

# --- Stage 3: Production ---
FROM node:22-alpine AS runner
WORKDIR /app

# OCI image labels — show up in Docker Hub, Scout, and `docker inspect`.
# GIT_COMMIT_SHA is wired from the builder stage's ARG.
ARG GIT_COMMIT_SHA=unknown
LABEL org.opencontainers.image.title="parametric-memory-web" \
      org.opencontainers.image.description="Commercial website for Parametric Memory" \
      org.opencontainers.image.source="https://github.com/parametricmemory/parametric-memory-web" \
      org.opencontainers.image.url="https://parametric-memory.dev" \
      org.opencontainers.image.licenses="SEE LICENSE IN LICENSE" \
      org.opencontainers.image.revision="${GIT_COMMIT_SHA}" \
      org.opencontainers.image.vendor="Parametric Memory"

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy standalone output and static assets
# public dir is guaranteed to exist from builder (mkdir -p above)
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

CMD ["node", "server.js"]
