# System Architecture

## Application Flow
1. **User Workflow:** User uploads an API Schema via the React Dashboard -> Backend validates schema using Zod -> MongoDB persists configuration -> Dynamic route registered.
2. **Client Request Workflow:** Client sends request to `/api/v1/mock/{endpoint}`:
   - **Step 1:** Zod validates incoming request payload and query params.
   - **Step 2:** Fastify router checks Redis cache for existing synthetic response.
   - **Step 3 (Cache Hit):** Returns cached synthetic payload immediately (<50ms).
   - **Step 4 (Cache Miss):** Requests LLM API to generate payload matching schema -> Saves to Redis -> Returns response to client.
   - **Step 5:** Asynchronously logs request metrics to MongoDB.

## Tech Stack
* **Frontend:** React, TypeScript, Tailwind CSS, Lucide Icons, Vite
* **Backend:** Node.js, Fastify (or Express), TypeScript
* **Database & Cache:** MongoDB (Metadata/Logs), Redis (Payload Cache)
* **AI Engine:** OpenAI API (GPT-4o) / Anthropic API with structured output constraints
* **Validation & Testing:** Zod, Playwright (E2E), Jest (Unit), k6 (Load Testing)
* **DevOps & Infra:** Docker, GitHub Actions CI/CD, Prometheus/Grafana

## Directory & File Structure
```text
mock-api-engine/
├── .github/
│   └── workflows/
│       └── ci-cd.yml
├── apps/
│   ├── web/                     # React Frontend
│   │   ├── src/
│   │   │   ├── components/
│   │   │   ├── hooks/
│   │   │   ├── pages/
│   │   │   └── services/
│   │   └── package.json
│   └── api/                     # Node.js Dynamic Server
│       ├── src/
│       │   ├── controllers/
│       │   ├── middleware/
│       │   ├── routes/
│       │   ├── services/        # AI & Redis services
│       │   └── utils/
│       └── package.json
├── packages/
│   └── schema/                  # Shared Zod types & schemas
├── tests/
│   ├── e2e/                     # Playwright tests
│   ├── unit/                    # Jest tests
│   └── load/                    # k6 performance scripts
├── docker-compose.yml
└── package.json
