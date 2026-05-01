FROM node:20-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --prefer-offline --no-audit

FROM deps AS build
COPY . .
RUN npm run build

FROM node:20-alpine AS production
RUN apk add --no-cache curl
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./

# 生成 package.json 的精简版本（仅保留生产依赖信息）
RUN npm prune --production

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1
CMD ["node", "dist/boot.cjs"]
