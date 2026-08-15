import type { CreateEndpointConfigInput } from '@mock-api-engine/schema';
import { Modal } from '../ui/Modal';
import { CreateEndpointForm } from './CreateEndpointForm';

interface CreateEndpointModalProps {
  onClose: () => void;
  onCreate: (input: CreateEndpointConfigInput) => Promise<unknown>;
}

export function CreateEndpointModal({ onClose, onCreate }: CreateEndpointModalProps) {
  return (
    <Modal title="New endpoint" onClose={onClose}>
      <CreateEndpointForm onCreate={onCreate} onSuccess={onClose} />
    </Modal>
  );
}
