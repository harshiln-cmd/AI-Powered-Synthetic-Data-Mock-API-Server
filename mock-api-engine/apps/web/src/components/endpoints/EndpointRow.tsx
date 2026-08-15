import type { ApiConfigDto } from '@mock-api-engine/schema';
import { MethodBadge } from './MethodBadge';
import { formatRelativeTime } from '../../lib/format-relative-time';

const SCHEMA_SECTIONS: { key: 'body' | 'query' | 'response'; label: string }[] = [
  { key: 'body', label: 'body' },
  { key: 'query', label: 'query' },
  { key: 'response', label: 'response' },
];

export function EndpointRow({ config }: { config: ApiConfigDto }) {
  const definedSections = SCHEMA_SECTIONS.filter((section) => config.jsonSchema?.[section.key]);

  return (
    <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-4 last:border-b-0">
      <div className="min-w-0">
        <div className="flex items-center gap-3">
          <MethodBadge method={config.httpMethod} />
          <span className="truncate font-mono text-sm text-ink">{config.endpointName}</span>
        </div>
        <div className="mt-1.5 flex items-center gap-1.5 text-xs text-ink-muted">
          {definedSections.length > 0 ? (
            definedSections.map((section, index) => (
              <span key={section.key}>
                {section.label}
                {index < definedSections.length - 1 && <span className="text-border"> · </span>}
              </span>
            ))
          ) : (
            <span>no schema defined</span>
          )}
          <span className="text-border">·</span>
          <span>updated {formatRelativeTime(config.updatedAt)}</span>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5 text-xs font-medium">
        <span
          className={`h-1.5 w-1.5 rounded-full ${config.isActive ? 'bg-success animate-pulse-ring' : 'bg-ink-muted'}`}
          aria-hidden="true"
        />
        <span className={config.isActive ? 'text-success' : 'text-ink-muted'}>
          {config.isActive ? 'active' : 'inactive'}
        </span>
      </div>
    </div>
  );
}
