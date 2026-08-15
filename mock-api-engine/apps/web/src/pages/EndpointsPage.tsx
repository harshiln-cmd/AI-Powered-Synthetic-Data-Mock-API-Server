import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useEndpoints } from '../hooks/useEndpoints';
import { EndpointList } from '../components/endpoints/EndpointList';
import { CreateEndpointModal } from '../components/endpoints/CreateEndpointModal';
import { Button } from '../components/ui/Button';

export function EndpointsPage() {
  const { endpoints, isLoading, error, refetch, createEndpoint } = useEndpoints();
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <div>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-4xl font-semibold text-ink">Endpoints</h1>
          <p className="mt-1.5 text-sm text-ink-muted">
            Mock REST endpoints backed by AI-generated, schema-validated payloads.
          </p>
        </div>
        {endpoints.length > 0 && (
          <Button onClick={() => setIsModalOpen(true)}>
            <Plus size={16} />
            New endpoint
          </Button>
        )}
      </div>

      <EndpointList
        endpoints={endpoints}
        isLoading={isLoading}
        error={error}
        onRetry={refetch}
        onCreateClick={() => setIsModalOpen(true)}
      />

      {isModalOpen && (
        <CreateEndpointModal onClose={() => setIsModalOpen(false)} onCreate={createEndpoint} />
      )}
    </div>
  );
}
