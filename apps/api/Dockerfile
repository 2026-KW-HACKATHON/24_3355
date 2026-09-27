# 월계함 API 이미지. 저장소 루트에서 빌드합니다.
#   docker build -f apps/api/Dockerfile -t wolgyeham-api .
# 서버 코드와 의존성(contracts 포함)을 파일 하나로 묶어 실행 이미지에는 Node와 번들만 둡니다.

FROM node:24-alpine AS build
WORKDIR /repo
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/contracts/package.json packages/contracts/
RUN pnpm install --frozen-lockfile
COPY packages/contracts packages/contracts
COPY apps/api apps/api
RUN pnpm exec esbuild apps/api/src/server.ts \
      --bundle --platform=node --format=esm --target=node24 \
      --outfile=/out/server.mjs \
      "--banner:js=import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);"

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production \
    API_HOST=0.0.0.0 \
    API_PORT=3001
COPY --from=build /out/server.mjs ./server.mjs
USER node
EXPOSE 3001
HEALTHCHECK --interval=15s --timeout=3s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3001/api/health >/dev/null || exit 1
CMD ["node", "server.mjs"]
