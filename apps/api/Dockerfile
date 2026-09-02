FROM node:24-bookworm-slim AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json* ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN npm ci --workspace=api --include-workspace-root

FROM deps AS build
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build -w @riskon/shared && npm run build -w api

FROM node:24-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY --from=build /app/packages/shared ./packages/shared
COPY --from=build /app/apps/api/dist ./apps/api/dist
RUN npm ci --omit=dev --workspace=api --include-workspace-root
EXPOSE 3000
CMD ["node", "apps/api/dist/main.js"]
