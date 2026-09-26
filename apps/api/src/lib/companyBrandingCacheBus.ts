import type IORedis from 'ioredis';
import redisConnection from './redis';

const CHANNEL = 'company-branding:invalidate';
let subscriber: IORedis | null = null;

export function publishCompanyBrandingChange(): void {
  void redisConnection.publish(CHANNEL, 'invalidate').catch(() => undefined);
}

export function startCompanyBrandingCacheSync(onChange: () => void): void {
  if (subscriber) return;
  const client = redisConnection.duplicate();
  subscriber = client;
  client.on('error', () => undefined);
  client.on('message', () => onChange());
  void client.subscribe(CHANNEL).catch(() => { subscriber = null; client.disconnect(); });
}

export async function stopCompanyBrandingCacheSync(): Promise<void> {
  if (!subscriber) return;
  const client = subscriber;
  subscriber = null;
  try { await client.unsubscribe(CHANNEL); } catch { /* already gone */ }
  client.disconnect();
}
