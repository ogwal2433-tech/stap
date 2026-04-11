import IORedis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL;

if (!REDIS_URL) {
  console.error('REDIS_URL is not set. Exiting.');
  process.exit(1);
}

export const redisConnection = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null, // required for BullMQ blocking operations
  enableReadyCheck: false,
});

redisConnection.on('connect', () => {
  console.log('Redis connected');
});

redisConnection.on('error', (err) => {
  console.error('Redis connection error:', err.message);
});

const shutdown = async () => {
  await redisConnection.quit();
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

export default redisConnection;
