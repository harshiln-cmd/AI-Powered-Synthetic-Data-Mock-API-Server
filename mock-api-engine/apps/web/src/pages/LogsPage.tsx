import { Activity } from 'lucide-react';
import { EmptyState } from '../components/ui/EmptyState';

export function LogsPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-4xl font-semibold text-ink">Logs</h1>
        <p className="mt-1.5 text-sm text-ink-muted">Request traffic across every mock endpoint, as it happens.</p>
      </div>

      <EmptyState
        icon={Activity}
        title="Not wired up yet"
        description="Real-time request logging lands in a future pass — this view is reserved for it."
      />
    </div>
  );
}
