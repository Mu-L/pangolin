FROM node:24-alpine AS base

WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package*.json ./

FROM base AS builder-dev

RUN npm ci

COPY . .

ARG BUILD=oss
ARG DATABASE=sqlite

RUN if [ "$BUILD" = "oss" ]; then rm -rf server/private; fi && \
    npm run set:$DATABASE && \
    npm run set:$BUILD && \
    npm run db:generate && \
    npm run build && \
    npm run build:cli && \
    test -f dist/server.mjs

FROM base AS builder

RUN npm ci --omit=dev

FROM node:24-alpine AS runner

WORKDIR /app

RUN apk add --no-cache curl tzdata

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

COPY --from=builder-dev /app/.next/standalone ./
COPY --from=builder-dev /app/.next/static ./.next/static
COPY --from=builder-dev /app/dist ./dist
COPY --from=builder-dev /app/server/migrations ./dist/init

COPY ./cli/wrapper.sh /usr/local/bin/pangctl
RUN chmod +x /usr/local/bin/pangctl ./dist/cli.mjs

COPY server/db/names.json ./dist/names.json
COPY server/db/ios_models.json ./dist/ios_models.json
COPY server/db/mac_models.json ./dist/mac_models.json
COPY public ./public

# OCI Image Labels - Build Args for dynamic values
ARG VERSION="dev"
ARG REVISION=""
ARG CREATED=""
ARG LICENSE="AGPL-3.0"

# Derive title and description based on BUILD type
ARG IMAGE_TITLE="Pangolin"
ARG IMAGE_DESCRIPTION="Identity-aware VPN and proxy for remote access to anything, anywhere"

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
