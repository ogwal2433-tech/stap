import type IORedis from 'ioredis';
import redisConnection from './redis';

/**
 * Tells every API process to drop a role from its permission cache.
 *
 * The cache lives in each process, so clearing it after a grant only affects
 * the process that served that request. A second container — or a second PM2
 * instance — kept answering with the old permissions until its entry expired,
 * which is what made a grant look like it had not taken effect: whether the
 * change appeared depended on which process the next request reached.
 *
 * Redis is already here for the job queues. A publish reaches every subscriber
 * including this process, so the sender clears locally first and the broadcast
 * is only a nudge to the others.
 *
 * If Redis is unavailable the publish is dropped: the five-minute TTL still
 * bounds how long a stale entry can live, exactly as before.
 */

const CHANNEL = 'permissions:invalidate';
/** What a message carries when every role should be dropped. */
const ALL = '*';

let subscriber: IORedis | null = null;

export function publishPermissionChange(role?: string): void {
  void redisConnection.publish(CHANNEL, role ?? ALL).catch(() => undefined);
}

/**
 * Starts listening. Idempotent, so importing this twice cannot end up with two
 * subscriptions. A subscriber connection cannot run ordinary commands, hence
 * the duplicate rather than the shared client.
 */
export function startPermissionCacheSync(onChange: (role?: string) => void): void {
  if (subscriber) return;
  const client = redisConnection.duplicate();
  subscriber = client;

  client.on('error', () => undefined); // never take the API down over the cache bus
  client.on('message', (_channel: string, message: string) => {
    onChange(message === ALL ? undefined : message);
  });

  void client.subscribe(CHANNEL).catch(() => {
    // Subscribed processes fall back to the TTL; nothing else changes.
    subscriber = null;
    client.disconnect();
  });
}

/** For tests and shutdown. */
export async function stopPermissionCacheSync(): Promise<void> {
  if (!subscriber) return;
  const client = subscriber;
  subscriber = null;
  try {
    await client.unsubscribe(CHANNEL);
  } catch { /* already gone */ }
  client.disconnect();
}
