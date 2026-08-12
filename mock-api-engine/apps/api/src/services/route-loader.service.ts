import { ApiConfigModel } from '../models/api-config.model';
import { registerInMemory, getRegistrySize } from './route-registry.service';

/**
 * Runs once at startup: pulls every active config out of MongoDB and
 * populates the in-memory route registry so previously-created mock
 * endpoints are live again immediately after a restart.
 */
export async function loadRoutesFromDatabase(): Promise<number> {
  const configs = await ApiConfigModel.find({ isActive: true }).exec();
  configs.forEach(registerInMemory);
  return getRegistrySize();
}
