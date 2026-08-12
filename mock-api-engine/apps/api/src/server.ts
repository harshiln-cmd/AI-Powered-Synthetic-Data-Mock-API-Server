import 'dotenv/config';
import Fastify, { type FastifyInstance } from 'fastify';
import { connectToDatabase } from './services/database.service';
import { loadRoutesFromDatabase } from './services/route-loader.service';
import { adminRoutes } from './routes/admin.routes';
import { mockRoutes } from './routes/mock.routes';
import { healthRoutes } from './routes/health.routes';

const PORT = Number(process.env.PORT ?? 4000);
const HOST = '0.0.0.0';

async function buildServer(): Promise<FastifyInstance> {
  const fastify = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
      transport: process.env.NODE_ENV === 'production' ? undefined : { target: 'pino-pretty' },
    },
  });

  await fastify.register(healthRoutes);
  await fastify.register(adminRoutes);
  await fastify.register(mockRoutes);

  return fastify;
}

async function start(): Promise<void> {
  await connectToDatabase();

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
