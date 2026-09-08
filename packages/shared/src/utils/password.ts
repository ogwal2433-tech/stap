/**
 * The alphabet drops the characters people mis-read when a password is copied
 * off a screen or read down a phone: O/0, I/l/1. What is left is unambiguous
 * whether it is typed from a note or dictated.
 */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';

/**
 * A temporary password for an account someone else is about to use.
 *
 * Drawn from the platform CSPRNG rather than Math.random — these are handed to
 * real people to sign in with, and some will keep them longer than intended.
 * Values that would skew the distribution are discarded rather than folded in
 * with a modulo, so every character stays equally likely.
 */
export function generatePassword(length = 10): string {
  const cryptoApi: Crypto | undefined = globalThis.crypto;

  // The largest multiple of the alphabet that fits in a byte; anything above
  // it is re-drawn rather than wrapped.
  const limit = 256 - (256 % ALPHABET.length);
  let out = '';

  if (cryptoApi?.getRandomValues) {
    const buf = new Uint8Array(length * 2);
    while (out.length < length) {
      cryptoApi.getRandomValues(buf);
      for (const byte of buf) {
        if (byte < limit) {
          out += ALPHABET[byte % ALPHABET.length];
          if (out.length === length) break;
        }
      }
    }
    return out;
  }

  // Only reached on a runtime with no Web Crypto. Still produces a usable
  // password rather than throwing in the user's face mid-form.
  for (let i = 0; i < length; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}
