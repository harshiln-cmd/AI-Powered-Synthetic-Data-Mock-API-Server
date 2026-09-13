import { describe, it, expect } from 'vitest';
import mongoose from 'mongoose';
import { ApiConfigModel } from '../../src/models/api-config.model';
import type { EndpointJsonSchema } from '@mock-api-engine/schema';

/**
 * No mocking in this file, and no real database either — that's not a
 * contradiction. Mongoose document validation (.validate()) is pure,
 * in-process logic that runs entirely against the schema's own rules; only
 * .save()/.create()/queries actually need a live connection. Confirmed
 * empirically before writing these: mongoose.connection.readyState is 0
 * (disconnected) for this entire file, and validation still works
 * correctly — the first test below locks that in as a standing guarantee
 * rather than an assumption.
 *
 * `.validate()` (async) is used rather than `.validateSync()` — the sync
 * version is deprecated as of this Mongoose version and slated for removal.
 */

const VALID_SCHEMA: EndpointJsonSchema = { response: { type: 'object', properties: {} } };

function buildDoc(overrides: Record<string, unknown> = {}) {
  return new ApiConfigModel({
    endpointName: '/api/users',
    httpMethod: 'GET',
    jsonSchema: VALID_SCHEMA,
    ...overrides,
  });
}

describe('ApiConfigModel schema validation', () => {
  it('runs with no live database connection', () => {
    expect(mongoose.connection.readyState).toBe(0);
  });

  it('accepts a fully valid document', async () => {
    await expect(buildDoc().validate()).resolves.toBeUndefined();
  });

  describe('endpointName', () => {
    it('rejects a missing endpointName', async () => {
      await expect(buildDoc({ endpointName: undefined }).validate()).rejects.toMatchObject({
        errors: { endpointName: { message: 'endpointName is required' } },
      });
    });

    it('rejects a path without a leading slash, quoting the offending value', async () => {
      await expect(buildDoc({ endpointName: 'api/users' }).validate()).rejects.toMatchObject({
        errors: { endpointName: { message: '"api/users" must start with a leading "/" (e.g. "/api/users")' } },
      });
    });

    it('trims surrounding whitespace before the leading-slash check runs', async () => {
      const doc = buildDoc({ endpointName: '  /api/users  ' });

      expect(doc.endpointName).toBe('/api/users');
      await expect(doc.validate()).resolves.toBeUndefined();
    });
  });

  describe('httpMethod', () => {
    it('rejects a missing httpMethod', async () => {
      await expect(buildDoc({ httpMethod: undefined }).validate()).rejects.toMatchObject({
        errors: { httpMethod: { message: 'Path `httpMethod` is required.' } },
      });
    });

    it.each(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])('accepts %s as a valid method', async (method) => {
      await expect(buildDoc({ httpMethod: method }).validate()).resolves.toBeUndefined();
    });

    it('rejects an unsupported method', async () => {
      await expect(buildDoc({ httpMethod: 'TRACE' }).validate()).rejects.toMatchObject({
        errors: { httpMethod: { message: 'TRACE is not a supported HTTP method' } },
      });
    });

    it('uppercases a lowercase method before validating, so "get" is accepted', async () => {
      const doc = buildDoc({ httpMethod: 'get' });

      expect(doc.httpMethod).toBe('GET');
      await expect(doc.validate()).resolves.toBeUndefined();
    });

    it('uppercases before the enum check runs, so the error reports the uppercased value', async () => {
      const doc = buildDoc({ httpMethod: 'trace' });

      expect(doc.httpMethod).toBe('TRACE');
      await expect(doc.validate()).rejects.toMatchObject({
        errors: { httpMethod: { message: 'TRACE is not a supported HTTP method' } },
      });
    });
  });

  describe('jsonSchema', () => {
    it('rejects a missing jsonSchema', async () => {
      await expect(buildDoc({ jsonSchema: undefined }).validate()).rejects.toMatchObject({
        errors: { jsonSchema: { message: 'jsonSchema is required' } },
      });
    });

    it('accepts any object shape, since it is stored as Schema.Types.Mixed', async () => {
      const doc = buildDoc({ jsonSchema: { body: { type: 'string' }, anything: 'goes' } });

      await expect(doc.validate()).resolves.toBeUndefined();
    });
  });

  describe('isActive', () => {
    it('defaults to true when not provided', () => {
      expect(buildDoc().isActive).toBe(true);
    });

    it('can be explicitly set to false', async () => {
      const doc = buildDoc({ isActive: false });

      expect(doc.isActive).toBe(false);
      await expect(doc.validate()).resolves.toBeUndefined();
    });
  });

  it('reports every invalid field at once, not just the first one encountered', async () => {
    await expect(new ApiConfigModel({}).validate()).rejects.toMatchObject({
      errors: {
        endpointName: expect.anything(),
        httpMethod: expect.anything(),
        jsonSchema: expect.anything(),
      },
    });
  });

  describe('schema configuration', () => {
    // These two confirm the constraints are DECLARED correctly via
    // introspection — not that MongoDB will enforce them. Uniqueness in
    // particular is enforced by the database's index on .save()/.create(),
    // which needs a real connection and is explicitly out of scope here.
    it('has timestamps enabled', () => {
      expect(ApiConfigModel.schema.get('timestamps')).toBe(true);
    });

    it('declares a unique compound index on (endpointName, httpMethod)', () => {
      expect(ApiConfigModel.schema.indexes()).toEqual([[{ endpointName: 1, httpMethod: 1 }, { unique: true }]]);
    });
  });
});
