import { describe, it, expect, beforeEach } from 'vitest';
import {
  normalizeEndpointName,
  buildRegistryKey,
  registerInMemory,
  unregisterInMemory,
  lookupRoute,
  listRegisteredRoutes,
  getRegistrySize,
  clearRegistry,
} from '../../src/services/route-registry.service';
import type { IApiConfigDocument } from '../../src/models/api-config.model';

// route-registry.service.ts holds its registry in module-level state (a
// singleton Map), so — unlike the other services in this suite — there's
// nothing to mock here, but tests DO need to reset that shared state
// between runs or they'll bleed into each other. clearRegistry() exists
// specifically for this ("Test/ops escape hatch — not used by the app
// itself").
beforeEach(() => {
  clearRegistry();
});

function fakeConfig(overrides: Partial<{ endpointName: string; httpMethod: string }> = {}): IApiConfigDocument {
  return {
    endpointName: overrides.endpointName ?? '/api/users',
    httpMethod: overrides.httpMethod ?? 'GET',
  } as unknown as IApiConfigDocument;
}

describe('route-registry.service', () => {
  describe('normalizeEndpointName', () => {
    it('adds a leading slash when missing', () => {
      expect(normalizeEndpointName('api/users')).toBe('/api/users');
    });

    it('leaves an already-normalized path unchanged', () => {
      expect(normalizeEndpointName('/api/users')).toBe('/api/users');
    });

    it('strips a trailing slash', () => {
      expect(normalizeEndpointName('/api/users/')).toBe('/api/users');
    });

    it('adds a leading slash AND strips a trailing slash in the same call', () => {
      expect(normalizeEndpointName('api/users/')).toBe('/api/users');
    });

    it('does not reduce the root path "/" to an empty string', () => {
      // Without the length>1 guard in the implementation, this would strip
      // the only character and return "", which would then match every
      // other path's normalized-empty prefix. Worth locking in explicitly.
      expect(normalizeEndpointName('/')).toBe('/');
    });
  });

  describe('buildRegistryKey', () => {
    it('combines the uppercased method and the normalized path', () => {
      expect(buildRegistryKey('get', 'api/users/')).toBe('GET:/api/users');
    });

    it('is stable for equivalent but differently-formatted inputs', () => {
      expect(buildRegistryKey('post', '/api/users')).toBe(buildRegistryKey('POST', 'api/users'));
    });
  });

  describe('registerInMemory / lookupRoute', () => {
    it('returns undefined for a path that was never registered', () => {
      expect(lookupRoute('GET', '/nothing/here')).toBeUndefined();
    });

    it('finds a config by the exact method and path it was registered under', () => {
      const config = fakeConfig({ endpointName: '/api/users', httpMethod: 'GET' });
      registerInMemory(config);

      expect(lookupRoute('GET', '/api/users')).toBe(config);
    });

    it('matches regardless of method casing on lookup (both sides go through buildRegistryKey)', () => {
      registerInMemory(fakeConfig({ endpointName: '/api/users', httpMethod: 'GET' }));

      expect(lookupRoute('get', '/api/users')).toBeDefined();
    });

    it('does not confuse two different HTTP methods on the same path', () => {
      const getConfig = fakeConfig({ endpointName: '/api/users', httpMethod: 'GET' });
      const postConfig = fakeConfig({ endpointName: '/api/users', httpMethod: 'POST' });
      registerInMemory(getConfig);
      registerInMemory(postConfig);

      expect(lookupRoute('GET', '/api/users')).toBe(getConfig);
      expect(lookupRoute('POST', '/api/users')).toBe(postConfig);
    });

    it('re-registering the same method+path overwrites the previous entry (last write wins)', () => {
      const original = fakeConfig({ endpointName: '/api/users', httpMethod: 'GET' });
      const updated = fakeConfig({ endpointName: '/api/users', httpMethod: 'GET' });
      registerInMemory(original);
      registerInMemory(updated);

      expect(lookupRoute('GET', '/api/users')).toBe(updated);
      expect(getRegistrySize()).toBe(1);
    });
  });

  describe('unregisterInMemory', () => {
    it('removes a previously registered route', () => {
      registerInMemory(fakeConfig({ endpointName: '/api/users', httpMethod: 'GET' }));

      unregisterInMemory('GET', '/api/users');

      expect(lookupRoute('GET', '/api/users')).toBeUndefined();
    });

    it('is a no-op for a route that was never registered', () => {
      expect(() => unregisterInMemory('DELETE', '/never/registered')).not.toThrow();
      expect(getRegistrySize()).toBe(0);
    });
  });

  describe('listRegisteredRoutes / getRegistrySize', () => {
    it('starts empty', () => {
      expect(listRegisteredRoutes()).toEqual([]);
      expect(getRegistrySize()).toBe(0);
    });

    it('reflects every registered config', () => {
      const users = fakeConfig({ endpointName: '/api/users', httpMethod: 'GET' });
      const orders = fakeConfig({ endpointName: '/api/orders', httpMethod: 'POST' });
      registerInMemory(users);
      registerInMemory(orders);

      expect(getRegistrySize()).toBe(2);
      expect(listRegisteredRoutes()).toEqual(expect.arrayContaining([users, orders]));
    });

    it('shrinks after unregistering', () => {
      registerInMemory(fakeConfig({ endpointName: '/api/users', httpMethod: 'GET' }));
      registerInMemory(fakeConfig({ endpointName: '/api/orders', httpMethod: 'POST' }));

      unregisterInMemory('GET', '/api/users');

      expect(getRegistrySize()).toBe(1);
    });
  });

  describe('clearRegistry', () => {
    it('empties the registry entirely', () => {
      registerInMemory(fakeConfig());
      registerInMemory(fakeConfig({ endpointName: '/api/orders', httpMethod: 'POST' }));

      clearRegistry();

      expect(getRegistrySize()).toBe(0);
      expect(listRegisteredRoutes()).toEqual([]);
    });
  });
});
