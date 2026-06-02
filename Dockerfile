FROM node:26-alpine

WORKDIR /app

# openssl: cert generation in entrypoint
# bash: entrypoint script shebang
RUN apk add --no-cache openssl bash

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY server.mjs ./
COPY public ./public
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

EXPOSE 8443 8080

# Self-check via /healthz (no auth required). wget is in busybox base.
# Use 127.0.0.1, not "localhost": in-container, localhost resolves to IPv6 ::1
# while the server binds IPv4 0.0.0.0 only, so localhost probes get "Connection
# refused" and the container is wrongly marked unhealthy.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- --no-check-certificate "https://127.0.0.1:${PORT:-8443}/healthz" >/dev/null || exit 1

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.mjs"]
