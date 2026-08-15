# mock-api-engine

AI-Powered Synthetic Data & Mock API Server. See `prd.md` / `architecture.md` / `phases.md` / `rules.md` / `design.md` for the full spec.

## Status

**Phase 1 — Core Engine & Dynamic Routing:** done (monorepo, Fastify dynamic routing, Zod request validation, MongoDB config storage).

**Phase 2 — AI Pipeline & Low-Latency Caching:** done.
- [x] OpenAI Structured Outputs generates schema-conformant mock payloads
- [x] Redis caches generated payloads (cache-first, keyed by method + endpoint + request body/query hash)
- [x] Faker-based local fallback on any AI failure (rules.md mandatory fallback), flagged via `X-Mock-Fallback: True`
- [x] Token Budget Guard via `max_completion_tokens`

**Phase 3 — Dashboard & Schema Management:** step 1-4 done (frontend init, design system, layout/routing, endpoint manager). Not done: drag-and-drop OpenAPI uploader, request log inspector, API key/rate-limit controls.

Not in scope yet: the CI/CD/test pipeline (Phase 4).

## Prerequisites

- Node.js >= 20.19
- pnpm (`corepack enable && corepack prepare pnpm@latest --activate` if you don't have it)
- Docker (for local MongoDB + Redis)
- An OpenAI API key (optional — the server runs fine without one, it just always falls back to Faker-generated data; see below)

## Setup

```bash
pnpm install
cp .env.example apps/api/.env      # then fill in OPENAI_API_KEY
cp apps/web/.env.example apps/web/.env
docker compose up -d
pnpm dev:api    # http://localhost:4000
pnpm dev:web    # http://localhost:5173 (run in a second terminal)
```

The API starts on `http://localhost:4000`.

## Try it

Register a mock endpoint. Note `jsonSchema.response` — separate from `body`/`query`, this is the shape the AI (or fallback) generates:

```bash
curl -X POST http://localhost:4000/admin/endpoints \
  -H "Content-Type: application/json" \
  -d '{
    "endpointName": "/api/users",
    "httpMethod": "GET",
    "jsonSchema": {
      "response": {
        "type": "object",
        "required": ["id", "name", "email", "role"],
        "properties": {
          "id": { "type": "string", "format": "uuid" },
          "name": { "type": "string" },
          "email": { "type": "string", "format": "email" },
          "role": { "type": "string", "enum": ["admin", "member"] }
        }
      }
    }
  }'
```

Call it — first request is a cache miss (calls OpenAI, or falls back to Faker if the AI call fails/no key is set); repeat requests within the TTL are cache hits:

```bash
curl -i http://localhost:4000/api/v1/mock/api/users
# X-Mock-Cache: MISS
# X-Mock-Fallback: True   <- only present if AI generation failed and Faker was used

curl -i http://localhost:4000/api/v1/mock/api/users
# X-Mock-Cache: HIT       <- same payload as above, served from Redis
```

List everything currently registered:

```bash
curl http://localhost:4000/admin/endpoints
```

