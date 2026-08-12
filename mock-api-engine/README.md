# mock-api-engine

AI-Powered Synthetic Data & Mock API Server. See `prd.md` / `architecture.md` / `phases.md` / `rules.md` / `design.md` for the full spec.

## Phase 1 status — Core Engine & Dynamic Routing

- [x] Monorepo structure with TypeScript (pnpm workspaces)
- [x] Fastify backend capable of dynamic route creation
- [x] Zod validation engine for incoming API requests
- [x] MongoDB schema for user configurations

Not in scope yet: AI payload generation, Redis caching, the dashboard UI, and the CI/CD/test pipeline (Phases 2–4).

## Prerequisites

- Node.js >= 20.19
- pnpm (`corepack enable && corepack prepare pnpm@latest --activate` if you don't have it)
- Docker (for local MongoDB)

## Setup

```bash
pnpm install
cp .env.example apps/api/.env
docker compose up -d mongo
pnpm dev:api
```

The API starts on `http://localhost:4000`.

## Try it

Register a mock endpoint:

```bash
curl -X POST http://localhost:4000/admin/endpoints \
  -H "Content-Type: application/json" \
  -d '{
    "endpointName": "/api/users",
    "httpMethod": "POST",
    "jsonSchema": {
      "body": {
        "type": "object",
        "required": ["name", "email"],
        "properties": {
          "name": { "type": "string", "minLength": 2 },
          "email": { "type": "string", "format": "email" },
          "role": { "type": "string", "enum": ["admin", "member"] }
        }
      }
    }
  }'
```

Call it:

```bash
# Passes validation -> 200
curl -X POST http://localhost:4000/api/v1/mock/api/users \
  -H "Content-Type: application/json" \
  -d '{"name": "Ada Lovelace", "email": "ada@example.com", "role": "admin"}'

# Fails validation (bad email, missing name) -> 400 with Zod issues
curl -X POST http://localhost:4000/api/v1/mock/api/users \
  -H "Content-Type: application/json" \
  -d '{"email": "not-an-email"}'

# Unregistered path/method -> 404
curl http://localhost:4000/api/v1/mock/api/nonexistent
```

List everything currently registered:

```bash
curl http://localhost:4000/admin/endpoints
```
