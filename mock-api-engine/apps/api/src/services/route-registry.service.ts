import type { IApiConfigDocument } from '../models/api-config.model';

/**
 * WHY AN IN-MEMORY REGISTRY INSTEAD OF CALLING fastify.route() PER CONFIG:
 *
 * Fastify (via its find-my-way router) builds its routing tree during the
 * plugin "boot" phase and does not support registering new routes once the
 * instance is listening — there's no supported `fastify.addRoute()` you can
 * call safely mid-request-lifecycle from inside a route handler.
 *
 * So instead of registering one Fastify route per saved config, we register
 * exactly ONE wildcard route (`fastify.all('/api/v1/mock/*', ...)`, see
 * routes/mock.routes.ts) at boot, and do our own dispatch inside its
 * handler by looking the incoming method+path up in this plain in-memory
 * Map. Adding a new mock endpoint then just means adding an entry to this
 * Map — no server restart, no touching Fastify's router at all.
 */
const registry = new Map<string, IApiConfigDocument>();

export function normalizeEndpointName(endpointName: string): string {
  const withLeadingSlash = endpointName.startsWith('/') ? endpointName : `/${endpointName}`;
  const trimmedTrailingSlash =
    withLeadingSlash.length > 1 && withLeadingSlash.endsWith('/')
      ? withLeadingSlash.slice(0, -1)
      : withLeadingSlash;
  return trimmedTrailingSlash;
}

export function buildRegistryKey(httpMethod: string, endpointName: string): string {
  return `${httpMethod.toUpperCase()}:${normalizeEndpointName(endpointName)}`;
}

export function registerInMemory(config: IApiConfigDocument): void {
  registry.set(buildRegistryKey(config.httpMethod, config.endpointName), config);
}

export function unregisterInMemory(httpMethod: string, endpointName: string): void {
  registry.delete(buildRegistryKey(httpMethod, endpointName));
}

export function lookupRoute(httpMethod: string, endpointName: string): IApiConfigDocument | undefined {
  return registry.get(buildRegistryKey(httpMethod, endpointName));
}

export function listRegisteredRoutes(): IApiConfigDocument[] {
  return Array.from(registry.values());
}

export function getRegistrySize(): number {
  return registry.size;
}

/** Test/ops escape hatch — not used by the app itself. */
export function clearRegistry(): void {
  registry.clear();
}
