FROM node:24-alpine AS builder

WORKDIR /app

ARG BUILD=oss
ARG DATABASE=sqlite

RUN apk add --no-cache python3 make g++

# COPY package.json package-lock.json ./
COPY package*.json ./
RUN npm ci

COPY . .

RUN if [ "$BUILD" = "oss" ]; then rm -rf server/private; fi && \
    npm run set:$DATABASE && \
    npm run set:$BUILD && \
    npm run db:generate && \
    npm run build && \
    npm run build:cli

# test to make sure the build output is there and error if not
RUN test -f dist/server.mjs

# Prune dev dependencies and clean up to prepare for copy to runner
RUN npm prune --omit=dev && npm cache clean --force

FROM node:24-alpine AS runner

# OCI Image Labels - Build Args for dynamic values
ARG VERSION="dev"
ARG REVISION=""
ARG CREATED=""
ARG LICENSE="AGPL-3.0"

# Derive title and description based on BUILD type
ARG IMAGE_TITLE="Pangolin"
ARG IMAGE_DESCRIPTION="Identity-aware VPN and proxy for remote access to anything, anywhere"

WORKDIR /app

# Only curl and tzdata needed at runtime - no build tools!
RUN apk add --no-cache curl tzdata

# Copy pre-built node_modules from builder (already pruned to production only)
# This includes the compiled native modules like better-sqlite3
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server/migrations ./dist/init
COPY --from=builder /app/package.json ./package.json

COPY ./cli/wrapper.sh /usr/local/bin/pangctl
RUN chmod +x /usr/local/bin/pangctl ./dist/cli.mjs

COPY server/db/names.json ./dist/names.json
COPY server/db/ios_models.json ./dist/ios_models.json
COPY server/db/mac_models.json ./dist/mac_models.json
COPY public ./public

# OCI Image Labels
# https://github.com/opencontainers/image-spec/blob/main/annotations.md
LABEL org.opencontainers.image.source="https://github.com/fosrl/pangolin" \
      org.opencontainers.image.url="https://github.com/fosrl/pangolin" \
      org.opencontainers.image.documentation="https://docs.pangolin.net" \
      org.opencontainers.image.vendor="Fossorial" \
      org.opencontainers.image.licenses="${LICENSE}" \
      org.opencontainers.image.title="${IMAGE_TITLE}" \
      org.opencontainers.image.description="${IMAGE_DESCRIPTION}" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${REVISION}" \
      org.opencontainers.image.created="${CREATED}"

CMD ["npm", "run", "start"]
