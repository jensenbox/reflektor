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
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- --no-check-certificate "https://localhost:${PORT:-8443}/healthz" >/dev/null || exit 1

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.mjs"]
