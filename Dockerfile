FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache openssl bash

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY server.mjs ./
COPY public ./public
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

EXPOSE 8443 8080

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.mjs"]
