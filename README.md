# AI-Powered Synthetic Data & Mock API Server

![Test Coverage](https://img.shields.io/badge/Coverage-100%25-brightgreen)
![TypeScript](https://img.shields.io/badge/TypeScript-Strict-blue)
![Fastify](https://img.shields.io/badge/Fastify-Backend-black)

An end-to-end developer platform that converts OpenAPI and JSON schemas into dynamic, live mock REST APIs. Built to accelerate frontend and QA workflows, this engine uses generative AI to produce realistic data payloads and is backed by a strict Redis caching layer to guarantee sub-50ms response times for high-throughput testing environments.

Built with a focus on zero-touch automation, product reliability, and 100% backend test coverage.

## 🚀 Core Product Features

* **Dynamic Schema Routing:** Instantly spawn live `GET`, `POST`, `PUT`, and `DELETE` endpoints by uploading OpenAPI or JSON schemas via the React dashboard.
* **AI-Driven Payload Generation:** Context-aware JSON mock generation utilizing LLMs (OpenAI/Anthropic) to produce realistic synthetic data instead of static placeholders.
* **Low-Latency Caching Engine:** A strict Redis caching layer intercepts requests, serving cached AI payloads in under 50ms to prevent LLM rate-limiting during UI stress tests.
* **Resilient Fallback System:** Automatically intercepts AI API timeouts or network failures and falls back to a deterministic, local dummy generator (Faker.js) to ensure the mock API never goes down.
* **Runtime Schema Validation:** Integrated Zod validation engine guards system boundaries, strictly verifying incoming client request payloads and queries against defined schema rules before processing.

## 🛠️ Technology Stack

**Frontend:**
* React, TypeScript, Vite
* Tailwind CSS & Lucide Icons

**Backend & Infrastructure:**
* Node.js & Fastify (chosen over Express for high-throughput JSON processing)
* MongoDB (Metadata & Request Logging)
* Redis (High-speed Payload Cache)
* Docker & Docker Compose

**Quality Engineering & CI/CD:**
* **Unit & E2E Testing:** Vitest (Achieved 100% statement, function, and line coverage)
* **Pipeline:** GitHub Actions for zero-touch CI/CD

## 🧠 System Architecture Flow

1. **Schema Ingestion:** Users upload schemas via the frontend. The backend parses and validates the schema using Zod, persisting the metadata in MongoDB.
2. **Client Request:** A client sends an HTTP request to the dynamic `/api/v1/mock/{endpoint}`.
3. **Validation:** Fastify intercepts the request and strictly validates the body/query against the Zod schema.
4. **Cache Intercept:** The router checks Redis. If a synthetic payload exists, it returns immediately (Cache Hit).
5. **AI Generation:** On a cache miss, the engine prompts the LLM with strict structured-output constraints, caches the new payload in Redis, and returns the response.

## 🚦 Getting Started

### Prerequisites
* Node.js (v20+)
* pnpm (v9+)
* Docker & Docker Compose
* OpenAI API Key

### Installation

1. **Clone the repository:**
   ```bash
   git clone [https://github.com/yourusername/AI-Powered-Synthetic-Data-Mock-API-Server.git](https://github.com/yourusername/AI-Powered-Synthetic-Data-Mock-API-Server.git)
   cd AI-Powered-Synthetic-Data-Mock-API-Server/mock-api-engine
