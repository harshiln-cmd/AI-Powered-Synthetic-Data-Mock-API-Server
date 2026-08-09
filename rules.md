# Engineering Rules & Guidelines

## Technical Choices & Rationale
* **TypeScript Throughout:** Strict typing across frontend, backend, and testing suites to eliminate runtime type mismatches.
* **Fastify over Express:** Chosen for high throughput and native JSON schema processing capabilities.
* **Redis Caching Mandatory:** Direct LLM calls per HTTP request introduce 1-3s latency. Redis ensures sub-50ms responses for mock servers.
* **Zod for Runtime Guards:** Guarantees strong runtime boundary checking for user input before hitting AI layers.

## Anti-Patterns & What to Avoid
* **UNCONSTRAINED AI PROMPTING:** Never call the LLM without strict JSON output mode or function calling. Raw text outputs break API contracts.
* **UNCACHED AI ENDPOINTS:** Do not allow un-cached synthetic generation on hot paths to prevent high latency and API token rate limiting.
* **HARDCODED TEST LOCATORS:** Avoid brittle XPath or UI-dependent selectors in Playwright. Use resilient data attributes (`data-testid`).

## Boundaries of AI & Error Handling
* **Fallback Strategy:** If the LLM API times out or hits rate limits, the system MUST fall back to a local static dummy generator (Faker.js) and flag the header `X-Mock-Fallback: True`.
* **Token Budget Guard:** Set strict `max_tokens` limits per endpoint schema generation to control compute costs.
