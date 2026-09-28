import type IORedis from 'ioredis';
import redisConnection from './redis';

const CHANNEL = 'report-titles:invalidate';
let subscriber: IORedis | null = null;
export function publishReportTitleChange(): void {
  void redisConnection.publish(CHANNEL, 'invalidate').catch(() => undefined);
}
export function startReportTitleCacheSync(onChange: () => void): void {
  if (subscriber) return;
  const client = redisConnection.duplicate();
  subscriber = client;
  client.on('error', () => undefined);
  client.on('message', () => onChange());
  void client.subscribe(CHANNEL).catch(() => { subscriber = null; client.disconnect(); });
}
export async function stopReportTitleCacheSync(): Promise<void> {
  if (!subscriber) return;
  const client = subscriber;
  subscriber = null;
  try { await client.unsubscribe(CHANNEL); } catch { /* already gone */ }
  client.disconnect();
}
