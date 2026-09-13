import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// mongoose is mocked entirely — connectToDatabase/disconnectFromDatabase
// exist specifically to wrap real network I/O, so this suite never talks to
// an actual MongoDB instance.
// ---------------------------------------------------------------------------

const { mockSet, mockConnect, mockDisconnect } = vi.hoisted(() => ({
  mockSet: vi.fn(),
  mockConnect: vi.fn(),
  mockDisconnect: vi.fn(),
}));

vi.mock('mongoose', () => ({
  default: {
    set: mockSet,
    connect: mockConnect,
    disconnect: mockDisconnect,
  },
}));

import { connectToDatabase, disconnectFromDatabase } from '../../src/services/database.service';

describe('database.service', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let originalMongodbUri: string | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    originalMongodbUri = process.env.MONGODB_URI;
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    // MONGODB_URI is read fresh on every call (not cached at module load),
    // so tests can freely mutate it — as long as it's restored afterward.
    if (originalMongodbUri === undefined) {
      delete process.env.MONGODB_URI;
    } else {
      process.env.MONGODB_URI = originalMongodbUri;
    }
  });

  describe('connectToDatabase', () => {
    it('falls back to the default local URI when MONGODB_URI is not set', async () => {
      delete process.env.MONGODB_URI;
      mockConnect.mockResolvedValueOnce({ connection: { name: 'mock-api-engine' } });

      await connectToDatabase();

      expect(mockConnect).toHaveBeenCalledWith('mongodb://localhost:27017/mock-api-engine');
    });

    it('uses MONGODB_URI when it is set', async () => {
      process.env.MONGODB_URI = 'mongodb://custom-host:27017/custom-db';
      mockConnect.mockResolvedValueOnce({ connection: { name: 'custom-db' } });

      await connectToDatabase();

      expect(mockConnect).toHaveBeenCalledWith('mongodb://custom-host:27017/custom-db');
    });

    it('sets strictQuery before connecting', async () => {
      mockConnect.mockResolvedValueOnce({ connection: { name: 'mock-api-engine' } });

      await connectToDatabase();

      expect(mockSet).toHaveBeenCalledWith('strictQuery', true);
    });

    it('logs the connected database name and returns the connection object', async () => {
      const fakeConnection = { connection: { name: 'mock-api-engine' } };
      mockConnect.mockResolvedValueOnce(fakeConnection);

      const result = await connectToDatabase();

      expect(result).toBe(fakeConnection);
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('connected to MongoDB (db: "mock-api-engine")'));
    });

    it('propagates a connection failure rather than swallowing it', async () => {
      mockConnect.mockRejectedValueOnce(new Error('connection refused'));

      await expect(connectToDatabase()).rejects.toThrow('connection refused');
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });
  });

  describe('disconnectFromDatabase', () => {
    it('calls mongoose.disconnect()', async () => {
      mockDisconnect.mockResolvedValueOnce(undefined);

      await disconnectFromDatabase();

      expect(mockDisconnect).toHaveBeenCalledTimes(1);
    });

    it('propagates a disconnect failure rather than swallowing it', async () => {
      mockDisconnect.mockRejectedValueOnce(new Error('disconnect failed'));

      await expect(disconnectFromDatabase()).rejects.toThrow('disconnect failed');
    });
  });
});
