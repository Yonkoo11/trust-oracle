FROM node:20-slim

WORKDIR /app

# better-sqlite3 needs native build tools
RUN apt-get update && \
    apt-get install -y --no-install-recommends python3 make g++ && \
    rm -rf /var/lib/apt/lists/*

COPY server/package.json server/package-lock.json ./
RUN npm ci

COPY server/src ./src
COPY server/public ./public
COPY server/tsconfig.json ./

# Create data directory for SQLite
RUN mkdir -p data

EXPOSE 3000

CMD ["node", "node_modules/.bin/tsx", "src/index.ts"]
