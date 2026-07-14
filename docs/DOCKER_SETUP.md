# Docker Setup

## 1. Files

```
docker/
├── frontend.Dockerfile
├── backend.Dockerfile
└── docker-compose.yml       # local dev
docker-compose.test.yml       # e2e (root, references docker/ Dockerfiles)
```

## 2. `docker-compose.yml` (local development)

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: workforceos
      POSTGRES_PASSWORD: workforceos
      POSTGRES_DB: workforceos
    ports: ["5432:5432"]
    volumes: ["pgdata:/var/lib/postgresql/data"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U workforceos"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]

  backend:
    build:
      context: .
      dockerfile: docker/backend.Dockerfile
    env_file: apps/backend/.env
    depends_on:
      postgres: { condition: service_healthy }
    ports: ["4000:4000"]

  indexer:
    build:
      context: .
      dockerfile: docker/backend.Dockerfile
    command: ["node", "dist/indexer/main.js"]
    env_file: apps/backend/.env
    depends_on:
      postgres: { condition: service_healthy }

  frontend:
    build:
      context: .
      dockerfile: docker/frontend.Dockerfile
    env_file: apps/frontend/.env
    depends_on: [backend]
    ports: ["3000:3000"]

volumes:
  pgdata:
```

`redis`/BullMQ is present in local dev to exercise the real indexer job
queue path (per [TECHNICAL_ARCHITECTURE.md](./TECHNICAL_ARCHITECTURE.md)
§8) even though it's optional for a minimal deployment.

## 3. `backend.Dockerfile` (multi-stage)

```dockerfile
FROM node:20-alpine AS deps
WORKDIR /repo
COPY package.json package-lock.json turbo.json ./
COPY apps/backend/package.json apps/backend/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/sdk/package.json packages/sdk/package.json
RUN npm ci

FROM node:20-alpine AS build
WORKDIR /repo
COPY --from=deps /repo/node_modules ./node_modules
COPY . .
RUN npx turbo run build --filter=backend...

FROM node:20-alpine AS runtime
WORKDIR /repo
ENV NODE_ENV=production
COPY --from=build /repo/apps/backend/dist ./apps/backend/dist
COPY --from=build /repo/apps/backend/node_modules ./apps/backend/node_modules
COPY --from=build /repo/apps/backend/prisma ./apps/backend/prisma
EXPOSE 4000
CMD ["node", "apps/backend/dist/main.js"]
```

## 4. `frontend.Dockerfile` (multi-stage, standalone Next.js output)

```dockerfile
FROM node:20-alpine AS deps
WORKDIR /repo
COPY package.json package-lock.json turbo.json ./
COPY apps/frontend/package.json apps/frontend/package.json
RUN npm ci

FROM node:20-alpine AS build
WORKDIR /repo
COPY --from=deps /repo/node_modules ./node_modules
COPY . .
RUN npx turbo run build --filter=frontend...

FROM node:20-alpine AS runtime
WORKDIR /repo
ENV NODE_ENV=production
COPY --from=build /repo/apps/frontend/.next/standalone ./
COPY --from=build /repo/apps/frontend/.next/static ./apps/frontend/.next/static
COPY --from=build /repo/apps/frontend/public ./apps/frontend/public
EXPOSE 3000
CMD ["node", "apps/frontend/server.js"]
```

(`next.config.ts` sets `output: 'standalone'` to make this minimal runtime
image possible.)

## 5. Local dev workflow

```bash
cp apps/backend/.env.example apps/backend/.env
cp apps/frontend/.env.example apps/frontend/.env
docker compose -f docker/docker-compose.yml up -d postgres redis
npm run db:migrate    # prisma migrate dev, run on host against the compose postgres
npm run db:seed
npm run dev           # turbo dev: frontend + backend + indexer, unconcontainerized for fast iteration
```

Full container builds (`docker compose up --build`) are used for
CI/deployment parity checks, not as the default local dev loop — running
Next.js/NestJS natively with hot reload is materially faster for
day-to-day work; Docker exists to guarantee the deployment artifact is
correct, not to be the daily dev environment.

## 6. Contracts are not containerized

`packages/contracts` builds with `cargo`/`soroban-cli` directly (no
Docker layer) — see [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) for the
build/deploy commands, run from CI runners with Rust toolchain installed
via `actions-rs`/`rustup`, not inside these Docker images.
