FROM node:24.14.1-bookworm-slim AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.7.0 --activate
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:24.14.1-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production HOST=127.0.0.1 PORT=4010
RUN corepack enable && corepack prepare pnpm@11.7.0 --activate
COPY --from=build /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/contracts ./contracts
COPY --from=build /app/datasets ./datasets
EXPOSE 4010
CMD ["node", "dist/src/app/server.js"]
