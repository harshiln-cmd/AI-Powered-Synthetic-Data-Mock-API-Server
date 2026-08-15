import 'dotenv/config';
import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { connectToDatabase } from './services/database.service';
import { connectToCache } from './services/cache.service';
import { loadRoutesFromDatabase } from './services/route-loader.service';
import { adminRoutes } from './routes/admin.routes';
import { mockRoutes } from './routes/mock.routes';
import { healthRoutes } from './routes/health.routes';

const PORT = Number(process.env.PORT ?? 4000);
const HOST = '0.0.0.0';
// The Phase 3 dashboard (apps/web) calls this API directly cross-origin —
// http://localhost:5173 is Vite's default dev port. Without CORS, every
// fetch() from the browser would be silently blocked regardless of how
// correct the request itself is. Comma-separated for multiple origins.
const CORS_ORIGINS = (process.env.CORS_ORIGIN ?? 'http://localhost:5173').split(',').map((origin) => origin.trim());

async function buildServer(): Promise<FastifyInstance> {
  const fastify = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
      transport: process.env.NODE_ENV === 'production' ? undefined : { target: 'pino-pretty' },
    },
  });

  await fastify.register(cors, { origin: CORS_ORIGINS });
  await fastify.register(healthRoutes);
  await fastify.register(adminRoutes);
  await fastify.register(mockRoutes);

  return fastify;
}

async function start(): Promise<void> {
  await connectToDatabase();
  await connectToCache(); // non-fatal if Redis is unreachable — see cache.service.ts

  const loadedCount = await loadRoutesFromDatabase();
  // eslint-disable-next-line no-console
  console.log(`[bootstrap] loaded ${loadedCount} mock endpoint(s) from MongoDB`);

  const fastify = await buildServer();

  try {
    await fastify.listen({ port: PORT, host: HOST });
  } catch (error) {
    fastify.log.error(error);
    process.exit(1);
  }
}

start();
