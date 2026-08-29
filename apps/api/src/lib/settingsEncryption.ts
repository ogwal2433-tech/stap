import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';

/**
 * Encryption for the credentials kept in SystemSetting.
 *
 * AES-256-GCM rather than CBC: it authenticates as well as encrypts, so a value
 * tampered with in the database fails to decrypt instead of yielding plausible
 * rubbish that would then be sent to a payment gateway.
 *
 * One secret stays in the environment — SETTINGS_ENCRYPTION_KEY — because it is
 * what protects all the others. Moving it into the same table it protects would
 * leave the ciphertext and its key side by side.
 */
const ALGORITHM = 'aes-256-gcm';

/**
 * SHA-256 of the configured secret, so any length of passphrase yields the 32
 * bytes the cipher needs. Padding a short string with zeroes instead — as is
 * often suggested — would make "abc" and "abc0000…" the same key.
 */
function key(): Buffer {
  const secret = process.env.SETTINGS_ENCRYPTION_KEY;
  if (!secret || secret.length < 16) {
    throw new Error(
      'SETTINGS_ENCRYPTION_KEY is missing or too short. Set it to a random string ' +
      'of at least 16 characters — `openssl rand -base64 32` — before saving encrypted settings.',
    );
  }
  return createHash('sha256').update(secret).digest();
}

export function isEncryptionConfigured(): boolean {
  const secret = process.env.SETTINGS_ENCRYPTION_KEY;
  return Boolean(secret && secret.length >= 16);
}

/** Returns `iv:authTag:ciphertext`, each base64. */
export function encrypt(plaintext: string): string {
  const iv     = randomBytes(12); // 96 bits, the size GCM is defined for
  const cipher = createCipheriv(ALGORITHM, key(), iv);
  const body   = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [iv.toString('base64'), cipher.getAuthTag().toString('base64'), body.toString('base64')].join(':');
}

export function decrypt(stored: string): string {
  const [ivB64, tagB64, bodyB64] = stored.split(':');
  if (!ivB64 || !tagB64 || !bodyB64) {
    throw new Error('Stored value is not in the expected iv:tag:ciphertext form.');
  }
  const decipher = createDecipheriv(ALGORITHM, key(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(bodyB64, 'base64')), decipher.final()]).toString('utf8');
}

/** True when a stored value looks like something encrypt() produced. */
export function looksEncrypted(value: string): boolean {
  const parts = value.split(':');
  return parts.length === 3 && parts.every((p) => /^[A-Za-z0-9+/]+=*$/.test(p) && p.length > 0);
}
