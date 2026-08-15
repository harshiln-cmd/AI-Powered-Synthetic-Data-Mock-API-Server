import type { HttpMethod } from '@mock-api-engine/schema';

// Reuses design.md's existing status colors by semantic fit rather than
// inventing a new palette: creating (POST) reads as success, modifying
// (PUT/PATCH) as warning, deleting as error/destructive, and reading (GET)
// as the neutral secondary accent.
const METHOD_STYLES: Record<HttpMethod, { text: string; dot: string }> = {
  GET: { text: 'text-accent', dot: 'bg-accent' },
  POST: { text: 'text-success', dot: 'bg-success' },
  PUT: { text: 'text-warning', dot: 'bg-warning' },
  PATCH: { text: 'text-warning', dot: 'bg-warning' },
  DELETE: { text: 'text-error', dot: 'bg-error' },
};

export function MethodBadge({ method }: { method: HttpMethod }) {
  const style = METHOD_STYLES[method];
  return (
    <span className={`inline-flex items-center gap-1.5 font-mono text-code font-medium ${style.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} aria-hidden="true" />
      {method}
    </span>
  );
}
