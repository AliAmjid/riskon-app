FROM node:24-bookworm-slim AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json* ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN npm ci && npm install --no-save @rolldown/binding-linux-x64-gnu lightningcss-linux-x64-gnu

FROM deps AS dev
COPY packages/shared packages/shared
COPY apps/web apps/web
WORKDIR /app/apps/web
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

FROM deps AS build
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN npm run build -w @riskon/shared && npm run build -w web

FROM nginx:1.27-alpine AS production
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
