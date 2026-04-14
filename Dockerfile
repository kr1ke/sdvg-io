# Multi-stage: vite build → static serve.
# Подходит для Railway (слушает $PORT), Fly.io, любой контейнерной платформы.
# Без cache-mount намеренно: Railway BuildKit требует своего prefix'а к cache id,
# что ломает портативность. npm ci и без mount достаточно быстр (~30c для этого репо).

FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
# `serve -s` отдаёт SPA fallback на index.html, корректные MIME для .webmanifest и .svg.
RUN npm install -g serve@14 --no-audit --no-fund
COPY --from=builder /app/dist ./dist
# Railway проставит свой $PORT; локально по дефолту 3000.
ENV PORT=3000
EXPOSE 3000
CMD ["sh", "-c", "serve -s dist -l ${PORT:-3000}"]
