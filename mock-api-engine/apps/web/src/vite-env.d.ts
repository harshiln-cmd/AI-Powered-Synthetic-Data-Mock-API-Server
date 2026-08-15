/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the Fastify API. Defaults to http://localhost:4000 if unset — see api-client.ts. */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
