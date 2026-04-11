import { beforeAll, afterAll } from 'vitest';
import dotenv from 'dotenv';
import prisma from '../db/prisma';
import { redisConnection } from '../lib/redis';

dotenv.config({ path: '.env.test' });

process.env.NODE_ENV = 'test';

// Ensure required env vars have fallbacks for CI
process.env.JWT_SECRET ??= 'test-jwt-secret-ci';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret-ci';

beforeAll(async () => {
  // Verify DB connection
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.$disconnect();
  await redisConnection.quit();
});
