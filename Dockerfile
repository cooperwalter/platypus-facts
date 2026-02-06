FROM oven/bun:1 AS builder
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .

FROM oven/bun:1
WORKDIR /app
COPY --from=builder /app /app
RUN mkdir -p /app/data /app/public/images/facts
EXPOSE 3000
CMD ["sh", "-c", "bun run src/scripts/sync-facts.ts && bun run src/index.ts"]
