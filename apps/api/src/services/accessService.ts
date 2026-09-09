import bcrypt from 'bcryptjs';
import prisma from '../db/prisma';
import { generateStaffId } from '../lib/systemId';
import { QueueService } from '../jobs/QueueService';
import { NotFoundError, AppError } from '../errors/AppError';
import { APP_NAME } from '../config/branding';
import { loginUrl } from '../jobs/templates/emailTemplates';
import type { LinkedAccount } from '@stap/shared';

/**
 * System access for people who are already on record.
 *
 * A guard or a client company exists first and may never need to sign in; when
 * they do, the login is switched on from the profile that already describes
 * them rather than typed a second time into a user-admin screen. That is the
 * whole point of this service — one record, one place, no re-keying.
 *
 * Revoking deactivates rather than deletes. Most of what a User can author —
 * an incident, a gun movement, a requisition — points back at them with a
 * required foreign key, so a delete would either fail outright on an account
 * that has been used or take the history with it. `status` is what the login
 * check reads (authService), so flipping it to INACTIVE shuts the door and
 * leaves the trail intact.
 */

/** A revoked login keeps its row, so re-granting reuses it instead of colliding. */
const REVOKED = 'INACTIVE';

function linked(user: { id: string; name: string; email: string; status: string }): LinkedAccount {
  return { userId: user.id, name: user.name, email: user.email, status: user.status };
}

/**
 * Claims an email for a new login, reusing a previously revoked one where it
 * belongs to the same subject. Without this, revoking and re-granting to the
 * same person fails on the unique email for good.
 */
async function assertEmailFree(email: string, reusableUserId?: string | null): Promise<void> {
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing && existing.id !== reusableUserId) {
    throw new AppError(`${email} is already used by another account`, 409);
  }
}

/** Best-effort: a queue outage must not fail an operation that already happened. */
async function audit(data: Parameters<typeof QueueService.logAudit>[0]): Promise<void> {
  try {
    await QueueService.logAudit(data);
  } catch (err) {
    console.error('⚠️  Failed to queue audit entry for', data.action, err);
  }
}

/**
 * Hands someone their new credentials.
 *
 * Queued rather than sent inline: the account already exists by this point, and
 * a mail server that is slow or down must not turn a successful grant into an
 * error the caller retries into "email already in use". The queue owns the
 * retries and records a failure of its own.
 */
async function sendCredentials(opts: {
  to:       string;
  name:     string;
  password: string;
  subject:  string;
  template: 'welcome' | 'client-portal-welcome' | 'password-reset';
  extra?:   Record<string, unknown>;
}): Promise<void> {
  try {
    await QueueService.sendEmail({
      to:       opts.to,
      subject:  opts.subject,
      template: opts.template,
      data: {
        name:     opts.name,
        email:    opts.to,
        password: opts.password,
        loginUrl: loginUrl(),
        ...opts.extra,
      },
    });
  } catch (err) {
    console.error('⚠️  Failed to queue credentials email for', opts.to, err);
  }
}

export const accessService = {
  // ── Guards ───────────────────────────────────────────────────────────────

  /**
   * Gives a guard a login. The account is created and linked in one
   * transaction: a User with no guard behind it would be an orphan that the
   * guard profile could never find again.
   */
  async grantGuardAccess(
    guardId: string,
    email: string,
    password: string,
    grantedById: string,
  ): Promise<LinkedAccount> {
    const guard = await prisma.guard.findUnique({
      where:  { id: guardId },
      select: { id: true, firstName: true, lastName: true, otherNames: true, userId: true },
    });
    if (!guard) throw new NotFoundError('Guard not found');
    if (guard.userId) throw new AppError('This guard already has system access', 409);

    // A login revoked earlier keeps its row and its email; granting again to
    // the same address revives that account rather than colliding with it.
    const revoked = await prisma.user.findUnique({
      where:  { email },
      select: { id: true, role: true, status: true, guard: { select: { id: true } } },
    });
    const reusable =
      revoked && revoked.role === 'GUARD' && revoked.status === REVOKED && !revoked.guard
        ? revoked.id
        : null;

    await assertEmailFree(email, reusable);

    const name = [guard.firstName, guard.otherNames, guard.lastName].filter(Boolean).join(' ');
    const passwordHash = await bcrypt.hash(password, 12);
    // Resolved before the transaction opens: it reads the highest existing
    // staff number on its own connection, which has no business running while
    // an interactive transaction is holding rows.
    const systemId = reusable ? null : await generateStaffId();

    const user = await prisma.$transaction(async (tx) => {
      const account = reusable
        ? await tx.user.update({
            where: { id: reusable },
            data:  { name, passwordHash, status: 'ACTIVE' },
            select: { id: true, name: true, email: true, status: true },
          })
        : await tx.user.create({
            data: {
              systemId: systemId!,
              name,
              email,
              passwordHash,
              role:   'GUARD',
              status: 'ACTIVE',
            },
            select: { id: true, name: true, email: true, status: true },
          });

      await tx.guard.update({ where: { id: guardId }, data: { userId: account.id } });
      return account;
    });

    await audit({
      userId:   grantedById,
      action:   'GUARD_ACCESS_GRANTED',
      entity:   'Guard',
      entityId: guardId,
      newValue: { userId: user.id, email },
    });
    await sendCredentials({
      to: email, name, password,
      subject:  `Your ${APP_NAME} login`,
      template: 'welcome',
    });

    return linked(user);
  },

  /** Shuts the login down and unlinks it, leaving whatever it authored in place. */
  async revokeGuardAccess(guardId: string, revokedById: string): Promise<{ revoked: true }> {
    const guard = await prisma.guard.findUnique({
      where:  { id: guardId },
      select: { id: true, userId: true, user: { select: { email: true } } },
    });
    if (!guard) throw new NotFoundError('Guard not found');
    if (!guard.userId) throw new AppError('This guard has no system access', 400);

    const userId = guard.userId;
    await prisma.$transaction([
      prisma.guard.update({ where: { id: guardId }, data: { userId: null } }),
      prisma.user.update({
        where: { id: userId },
        data:  {
          status:             REVOKED,
          deactivatedAt:      new Date(),
          deactivatedById:    revokedById,
          deactivationReason: 'System access revoked from the guard profile',
        },
      }),
    ]);

    await audit({
      userId:   revokedById,
      action:   'GUARD_ACCESS_REVOKED',
      entity:   'Guard',
      entityId: guardId,
      oldValue: { userId, email: guard.user?.email },
    });

    return { revoked: true };
  },

  // ── Client portal ────────────────────────────────────────────────────────

  /**
   * Adds a portal login for a client company.
   *
   * A company can hold several — a finance contact and an operations contact
   * often want their own — so this adds to the set rather than replacing it.
   */
  async grantClientPortalAccess(
    clientId: string,
    email: string,
    password: string,
    contactName: string,
    grantedById: string,
  ): Promise<LinkedAccount> {
    const client = await prisma.client.findUnique({
      where:  { id: clientId },
      select: { id: true, clientName: true },
    });
    if (!client) throw new NotFoundError('Client not found');

    const revoked = await prisma.user.findUnique({
      where:  { email },
      select: { id: true, role: true, status: true, clientId: true },
    });
    const reusable =
      revoked && revoked.role === 'CLIENT' && revoked.status === REVOKED && !revoked.clientId
        ? revoked.id
        : null;

    await assertEmailFree(email, reusable);

    const passwordHash = await bcrypt.hash(password, 12);

    const user = reusable
      ? await prisma.user.update({
          where:  { id: reusable },
          data:   { name: contactName, passwordHash, status: 'ACTIVE', clientId },
          select: { id: true, name: true, email: true, status: true },
        })
      : await prisma.user.create({
          data: {
            systemId: await generateStaffId(),
            name:     contactName,
            email,
            passwordHash,
            role:     'CLIENT',
            status:   'ACTIVE',
            clientId,
          },
          select: { id: true, name: true, email: true, status: true },
        });

    await audit({
      userId:   grantedById,
      action:   'CLIENT_PORTAL_GRANTED',
      entity:   'Client',
      entityId: clientId,
      newValue: { userId: user.id, email, contactName },
    });
    await sendCredentials({
      to: email, name: contactName, password,
      subject:  `Welcome to the ${client.clientName} client portal`,
      template: 'client-portal-welcome',
      extra:    { contactName, clientName: client.clientName },
    });

    return linked(user);
  },

  /**
   * Turns off one portal login, or every login the company holds when no
   * particular one is named — which is what "Disable Portal" means.
   */
  async revokeClientPortalAccess(
    clientId: string,
    revokedById: string,
    userId?: string,
  ): Promise<{ revoked: number }> {
    const accounts = await prisma.user.findMany({
      where:  { clientId, role: 'CLIENT', ...(userId ? { id: userId } : {}) },
      select: { id: true, email: true },
    });
    if (!accounts.length) {
      throw new AppError(
        userId ? 'That portal login was not found for this client' : 'This client has no portal access',
        400,
      );
    }

    const ids = accounts.map((a) => a.id);
    await prisma.user.updateMany({
      where: { id: { in: ids } },
      data:  {
        status:             REVOKED,
        clientId:           null,
        deactivatedAt:      new Date(),
        deactivatedById:    revokedById,
        deactivationReason: 'Portal access disabled from the client profile',
      },
    });

    await audit({
      userId:   revokedById,
      action:   'CLIENT_PORTAL_REVOKED',
      entity:   'Client',
      entityId: clientId,
      oldValue: { accounts: accounts.map((a) => a.email) },
    });

    return { revoked: ids.length };
  },

  /** Sets a new temporary password on one of a client's portal logins. */
  async resetClientPortalPassword(
    clientId: string,
    userId: string,
    newPassword: string,
    resetById: string,
  ): Promise<{ email: string }> {
    const user = await prisma.user.findFirst({
      where:  { id: userId, clientId, role: 'CLIENT' },
      select: { id: true, name: true, email: true },
    });
    if (!user) throw new NotFoundError('That portal login was not found for this client');

    await prisma.user.update({
      where: { id: user.id },
      data:  { passwordHash: await bcrypt.hash(newPassword, 12) },
    });

    await audit({
      userId:   resetById,
      action:   'CLIENT_PORTAL_PASSWORD_RESET',
      entity:   'Client',
      entityId: clientId,
      newValue: { userId: user.id, email: user.email },
    });
    await sendCredentials({
      to: user.email, name: user.name, password: newPassword,
      subject:  'Your portal password has been reset',
      template: 'password-reset',
    });

    return { email: user.email };
  },

  /** The portal logins a client currently holds, for the profile section. */
  async listClientPortalAccounts(clientId: string): Promise<LinkedAccount[]> {
    const users = await prisma.user.findMany({
      where:   { clientId, role: 'CLIENT' },
      select:  { id: true, name: true, email: true, status: true },
      orderBy: { createdAt: 'asc' },
    });
    return users.map(linked);
  },
};
