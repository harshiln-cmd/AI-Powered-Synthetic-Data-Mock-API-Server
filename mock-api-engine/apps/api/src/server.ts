import 'dotenv/config';
import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { connectToDatabase } from './services/database.service';
import { connectToCache } from './services/cache.service';
import { loadRoutesFromDatabase } from './services/route-loader.service';
import { adminRoutes } from './routes/admin.routes';
import { mockRoutes } from './routes/mock.routes';
import { healthRoutes } from './routes/health.routes';
import { apiKeyRoutes } from './routes/api-key.routes';

const PORT = Number(process.env.PORT ?? 4000);
const HOST = '0.0.0.0';
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
  await fastify.register(apiKeyRoutes);
  await fastify.register(mockRoutes);

  return fastify;
}

async function start(): Promise<void> {
  await connectToDatabase();
  await connectToCache();

  const loadedCount = await loadRoutesFromDatabase();
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
