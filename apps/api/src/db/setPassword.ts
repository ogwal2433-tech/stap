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
 *   tsx src/db/setPassword.ts <email> [password]   set one account's password
 *   tsx src/db/setPassword.ts --audit              list accounts that cannot log in
 *   tsx src/db/setPassword.ts --fix-broken [pw]    reset every such account
 *
 * In a built container the compiled form is:
 *   node apps/api/dist/db/setPassword.js <email> [password]
 *
 * Omit the password and a strong one is generated and printed once. The hash is
 * produced here and written through Prisma, so no shell ever handles it.
 */
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import prisma from './prisma';
import { isValidBcryptHash } from '../lib/passwordHash';

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

/** Every account whose stored hash cannot authenticate, whatever the password. */
async function findBroken() {
  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true, status: true, passwordHash: true },
    orderBy: { email: 'asc' },
  });
  return users.filter((u) => !isValidBcryptHash(u.passwordHash));
}

function describe(u: { email: string; role: string; passwordHash: string }): string {
  return `  ${u.email.padEnd(38)} ${u.role.padEnd(22)} ` +
         `len ${String(u.passwordHash.length).padStart(2)} (expect 60), ` +
         `starts ${JSON.stringify(u.passwordHash.slice(0, 4))} (expect "$2a$")`;
}

async function audit(): Promise<void> {
  const broken = await findBroken();
  const total  = await prisma.user.count();
  console.log('');
  if (broken.length === 0) {
    console.log(`✅ All ${total} accounts have a valid password hash.`);
  } else {
    console.log(`❌ ${broken.length} of ${total} accounts cannot log in — their hash is not bcrypt:`);
    console.log('');
    broken.forEach((u) => console.log(describe(u)));
    console.log('');
    console.log('   Fix them all with:  setPassword --fix-broken [password]');
  }
  console.log('');
}

async function fixBroken(supplied?: string): Promise<void> {
  const broken = await findBroken();
  console.log('');
  if (broken.length === 0) {
    console.log('✅ Nothing to fix — every account already has a valid hash.');
    console.log('');
    return;
  }
  if (supplied && supplied.length < MIN_LENGTH) {
    console.error(`❌ Password must be at least ${MIN_LENGTH} characters.`);
    process.exit(1);
  }

  console.log(`Resetting ${broken.length} account(s):`);
  console.log('');
  for (const u of broken) {
    const password = supplied ?? generatePassword();
    await prisma.user.update({
      where: { id: u.id },
      data:  { passwordHash: await bcrypt.hash(password, SALT_ROUNDS) },
    });
    await revokeSessions(u.id);
    console.log(`  ${u.email.padEnd(38)} ${supplied ? 'set' : password}`);
  }
  console.log('');
  if (supplied) console.log('   Every account above now uses the password you supplied.');
  else          console.log('   Passwords shown once. Have each holder change theirs after signing in.');
  console.log('');
}

/**
 * Drops the stored refresh token and the failed-attempt counter. A password
 * change otherwise leaves whoever knew the old one still signed in, and a
 * lockout accumulated while the account was broken would block the first
 * attempt with the new password.
 */
async function revokeSessions(userId: string): Promise<boolean> {
  try {
    const { redisConnection } = await import('../lib/redis');
    await redisConnection.del(`refresh:${userId}`);
    await redisConnection.del(`auth:failed:${userId}`);
    return true;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const [email, supplied] = process.argv.slice(2);

  if (email === '--audit')      { await audit();             return; }
  if (email === '--fix-broken') { await fixBroken(supplied); return; }

  if (!email) {
    console.error('Usage: setPassword <email> [password]');
    console.error('       setPassword --audit');
    console.error('       setPassword --fix-broken [password]');
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
  const sessionsRevoked = await revokeSessions(user.id);

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
    // The Redis connection is long-lived by design and holds the event loop
    // open; a one-shot script never exits without standing it down.
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('❌ Failed to set password:', err);
    await prisma.$disconnect().catch(() => {});
    process.exit(1);
  });
