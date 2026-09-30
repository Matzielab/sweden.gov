# --- Build: a static site ------------------------------------------------------
FROM oven/bun:1.3 AS build

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .

# The api's public URL is compiled into the page, so it's needed at build time.
# Changing it means rebuilding the image.
ARG PUBLIC_API_URL
RUN test -n "$PUBLIC_API_URL" || { \
      echo "ERROR: PUBLIC_API_URL must be set at build time (e.g. https://api.example.se)" >&2; \
      exit 1; \
    }
ENV PUBLIC_API_URL=$PUBLIC_API_URL

# --bun: run Astro on Bun's runtime (the image has no Node)
RUN bun --bun astro build

# --- Serve: plain nginx ----------------------------------------------------------
FROM nginx:stable-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO /dev/null http://127.0.0.1/ || exit 1
