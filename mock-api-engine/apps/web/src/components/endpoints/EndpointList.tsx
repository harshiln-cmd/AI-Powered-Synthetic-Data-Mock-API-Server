import { AlertTriangle, Route } from 'lucide-react';
import type { ApiConfigDto } from '@mock-api-engine/schema';
import { EndpointRow } from './EndpointRow';
import { EmptyState } from '../ui/EmptyState';
import { Button } from '../ui/Button';

interface EndpointListProps {
  endpoints: ApiConfigDto[];
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
  onCreateClick: () => void;
}

function LoadingSkeleton() {
  return (
    <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-panel">
      {[0, 1, 2].map((row) => (
        <div key={row} className="flex items-center justify-between px-5 py-4">
          <div className="space-y-2">
            <div className="h-4 w-48 animate-pulse rounded bg-border/60" />
            <div className="h-3 w-32 animate-pulse rounded bg-border/40" />
          </div>
          <div className="h-3 w-14 animate-pulse rounded bg-border/40" />
        </div>
      ))}
    </div>
  );
}

export function EndpointList({ endpoints, isLoading, error, onRetry, onCreateClick }: EndpointListProps) {
  if (isLoading) return <LoadingSkeleton />;

  if (error) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Couldn't load endpoints"
        description={error}
        action={
          <Button variant="secondary" onClick={onRetry}>
            Try again
          </Button>
        }
      />
    );
  }

  if (endpoints.length === 0) {
    return (
      <EmptyState
        icon={Route}
        title="No endpoints yet"
        description="Register a mock endpoint to start serving synthetic responses for it."
        action={<Button onClick={onCreateClick}>New endpoint</Button>}
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-panel">
      {endpoints.map((config) => (
        <EndpointRow key={config._id} config={config} />
      ))}
    </div>
  );
}
