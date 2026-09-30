FROM oven/bun:1.3-slim

WORKDIR /app

ENV NODE_ENV=production
ENV ENVIRONMENT=production

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# Bun runs the TypeScript directly — no build step. tsconfig.json carries the
# "@/..." path alias, so it ships too.
COPY tsconfig.json ./
COPY src ./src

USER bun

EXPOSE 3000

# The slim image has no curl; bun can do the request itself
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD bun -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/ping').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["bun", "src/index.ts"]
