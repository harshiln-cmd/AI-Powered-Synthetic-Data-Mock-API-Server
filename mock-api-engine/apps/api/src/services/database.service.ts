import mongoose from 'mongoose';

const DEFAULT_MONGODB_URI = 'mongodb://localhost:27017/mock-api-engine';

export async function connectToDatabase(): Promise<typeof mongoose> {
  const uri = process.env.MONGODB_URI ?? DEFAULT_MONGODB_URI;

  mongoose.set('strictQuery', true);
  const connection = await mongoose.connect(uri);

  // eslint-disable-next-line no-console
  console.log(`[database] connected to MongoDB (db: "${connection.connection.name}")`);
  return connection;
}

export async function disconnectFromDatabase(): Promise<void> {
  await mongoose.disconnect();
}
