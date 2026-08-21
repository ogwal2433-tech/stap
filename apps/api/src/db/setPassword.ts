/**
 * Set a user's password from the command line.
 *
 * Exists because the alternative — writing a bcrypt hash into the database by
 * hand — is a trap. A hash pasted into a double-quoted shell string loses its
 * `$2a$`, `$12$` and `$…` segments to parameter expansion before psql sees it,
 * and the result is a column that refuses every password with nothing in the
 * logs to say why.
 *
 * Usage:
 *   pnpm --filter api exec tsx src/db/setPassword.ts <email> [password]
 *
 * Omit the password and a strong one is generated and printed once. The hash is
 * produced here and written through Prisma, so no shell ever handles it.
 */
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import prisma from './prisma';

const SALT_ROUNDS = 12;
const MIN_LENGTH  = 8;
/** Ambiguous glyphs (0/O, 1/l/I) left out — these get read off a screen. */
const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$';

function generatePassword(length = 16): string {
  const max = 256 - (256 % CHARS.length);
  let out = '';
  while (out.length < length) {
    for (const byte of crypto.randomBytes(length)) {
      if (byte >= max) continue;
      out += CHARS[byte % CHARS.length];
      if (out.length === length) break;
    }
  }
  return out;
}

async function main(): Promise<void> {
  const [email, supplied] = process.argv.slice(2);

  if (!email) {
    console.error('Usage: tsx src/db/setPassword.ts <email> [password]');
    process.exit(1);
  }

  const user = await prisma.user.findUnique({
    where:  { email: email.toLowerCase() },
    select: { id: true, name: true, email: true, role: true, status: true },
  });

  if (!user) {
    console.error(`❌ No user with email "${email}".`);
    process.exit(1);
  }

  if (supplied && supplied.length < MIN_LENGTH) {
    console.error(`❌ Password must be at least ${MIN_LENGTH} characters.`);
    process.exit(1);
  }

  const password     = supplied ?? generatePassword();
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });

  // Existing sessions outlive a password change otherwise: the refresh token in
  // Redis stays valid, so whoever knew the old password keeps their session.
  let sessionsRevoked = false;
  try {
    const { redisConnection } = await import('../lib/redis');
    await redisConnection.del(`refresh:${user.id}`);
    await redisConnection.del(`auth:failed:${user.id}`);
    // The connection is long-lived by design — it holds the event loop open
    // and a one-shot script would never exit without closing it.
    await redisConnection.quit();
    sessionsRevoked = true;
  } catch {
    // Redis unreachable — the password is still set; say so rather than pretend.
  }

  console.log('');
  console.log(`✅ Password set for ${user.name} <${user.email}> (${user.role})`);
  if (!supplied) {
    console.log('');
    console.log(`   Password: ${password}`);
    console.log('   Shown once. Change it after logging in.');
  }
  if (user.status !== 'ACTIVE') {
    console.log('');
    console.log(`   ⚠️  This account's status is ${user.status}, so it still cannot log in.`);
    console.log('      Reactivate it before the new password is usable.');
  }
  if (!sessionsRevoked) {
    console.log('');
    console.log('   ⚠️  Redis was unreachable, so existing sessions were not revoked.');
  }
  console.log('');
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('❌ Failed to set password:', err);
    await prisma.$disconnect().catch(() => {});
    process.exit(1);
  });
