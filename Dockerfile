# Build stage
FROM node:18-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ENV DB_ENV=prod
ENV CI=true

RUN npm run build

# Production stage
FROM node:18-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY prisma/schema.prisma prisma/schema.prisma
RUN npx prisma generate

COPY --from=builder /app/dist/ dist/
COPY --from=builder /app/switch-db.js switch-db.js
COPY --from=builder /app/prisma/schema.prisma prisma/schema.prisma
COPY --from=builder /app/prisma/migrations-prod/ prisma/migrations-prod/

COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

LABEL org.opencontainers.image.source=https://github.com/chr1syy/RaidPresence
LABEL org.opencontainers.image.description="RaidPresence Discord Bot"
LABEL com.centurylinklabs.watchtower.enable=true

ENTRYPOINT ["./docker-entrypoint.sh"]
