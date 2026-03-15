# Build stage
FROM node:18-alpine AS builder

WORKDIR /app

ENV DB_ENV=prod
ENV CI=true

COPY package.json package-lock.json switch-db.js ./
COPY prisma/schema.prisma prisma/schema.prisma
RUN npm ci

COPY . .

RUN npm run build

# Production stage
FROM node:18-alpine

RUN apk add --no-cache openssl

WORKDIR /app

ENV DB_ENV=prod
ENV CI=true

COPY package.json package-lock.json switch-db.js ./
COPY prisma/schema.prisma prisma/schema.prisma
RUN npm ci --omit=dev

# Remove CI so the entrypoint runs migrations normally
ENV CI=

COPY --from=builder /app/dist/ dist/
COPY --from=builder /app/prisma/migrations-prod/ prisma/migrations-prod/

COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

LABEL org.opencontainers.image.source=https://github.com/chr1syy/RaidPresence
LABEL org.opencontainers.image.description="RaidPresence Discord Bot"
LABEL com.centurylinklabs.watchtower.enable=true

ENTRYPOINT ["./docker-entrypoint.sh"]
