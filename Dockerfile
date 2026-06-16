FROM node:26-alpine

WORKDIR /app

# openssl: cert generation in entrypoint
# bash: entrypoint script shebang
# tini: PID 1 init that reaps zombies. The busybox-wget HEALTHCHECK forks an
#   ssl_client TLS helper per probe; with node as PID 1 (no init) those get
#   reparented to PID 1 and never reaped, leaking one zombie every 30s until
#   PID exhaustion makes the healthcheck unable to fork -> container unhealthy.
RUN apk add --no-cache openssl bash tini

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

ENTRYPOINT ["/sbin/tini", "--", "./docker-entrypoint.sh"]
CMD ["node", "server.mjs"]
