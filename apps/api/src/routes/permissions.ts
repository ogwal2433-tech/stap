import { Router, type Request, type Response } from 'express';
import prisma from '../db/prisma';
import { authenticate } from '../middleware/authenticate';
import { requirePermission, clearPermissionCache } from '../middleware/permissions';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError, NotFoundError } from '../errors/AppError';
import { QueueService } from '../jobs/QueueService';
import { PERMISSIONS } from '../constants/permissions';
import { DEFAULT_ROLE_PERMISSIONS } from '../constants/defaultPermissions';

const router = Router();

router.use(authenticate);
// Managing permissions is itself a permission, so the matrix cannot be opened
// by someone who only happens to hold a high role.
router.use(requirePermission(PERMISSIONS.ROLES_MANAGE));

/** The roles the matrix covers. GUARD and CLIENT are not permission-gated. */
const MANAGED_ROLES = Object.keys(DEFAULT_ROLE_PERMISSIONS);

function assertManagedRole(role: string): void {
  if (!MANAGED_ROLES.includes(role)) {
    throw new AppError(`"${role}" is not a role whose permissions can be managed.`, 400);
  }
}

/**
 * DIRECTOR is deliberately immutable.
 *
 * It is the only role guaranteed to hold roles.manage, so letting it be edited
 * allows an administrator to revoke the last grant that can undo the change —
 * locking permission management out of the system with no route back in.
 */
function assertEditable(role: string): void {
  assertManagedRole(role);
  if (role === 'DIRECTOR') {
    throw new AppError(
      'Director permissions cannot be changed. The role is the fallback that keeps permission management reachable.',
      400,
    );
  }
}

// ── Catalogue ─────────────────────────────────────────────────────────────────

router.get(
  '/',
  asyncHandler(async (_req: Request, res: Response) => {
    const permissions = await prisma.permission.findMany({
      orderBy: [{ module: 'asc' }, { name: 'asc' }],
    });
    res.json({ success: true, data: permissions });
  }),
);

/** Every managed role with its grant count — drives the left-hand role list. */
router.get(
  '/roles',
  asyncHandler(async (_req: Request, res: Response) => {
    const counts = await prisma.rolePermission.groupBy({
      by:     ['role'],
      _count: { id: true },
    });
    const byRole = new Map(counts.map((c) => [String(c.role), c._count.id]));

    res.json({
      success: true,
      data: MANAGED_ROLES.map((role) => ({
        role,
        count:    byRole.get(role) ?? 0,
        editable: role !== 'DIRECTOR',
      })),
    });
  }),
);

router.get(
  '/roles/:role',
  asyncHandler(async (req: Request, res: Response) => {
    const role = req.params.role;
    assertManagedRole(role);

    const rows = await prisma.rolePermission.findMany({
      where:   { role: role as never },
      include: { permission: true },
      orderBy: { permission: { key: 'asc' } },
    });

    res.json({
      success: true,
      data: {
        role,
        editable:    role !== 'DIRECTOR',
        permissions: rows.map((r) => r.permission),
      },
    });
  }),
);

// ── Grant and revoke ──────────────────────────────────────────────────────────

router.post(
  '/roles/:role/grant',
  asyncHandler(async (req: Request, res: Response) => {
    const role = req.params.role;
    assertEditable(role);

    const { permissionKey } = req.body as { permissionKey?: string };
    if (!permissionKey) throw new AppError('permissionKey is required.', 400);

    const permission = await prisma.permission.findUnique({ where: { key: permissionKey } });
    if (!permission) throw new NotFoundError(`No permission with key "${permissionKey}".`);

    await prisma.rolePermission.upsert({
      where:  { role_permissionId: { role: role as never, permissionId: permission.id } },
      update: {},
      create: { role: role as never, permissionId: permission.id, grantedById: req.user!.userId },
    });

    clearPermissionCache(role);
    await QueueService.logAudit({
      userId:   req.user!.userId,
      action:   'PERMISSION_GRANTED',
      entity:   'rolePermission',
      entityId: `${role}:${permissionKey}`,
      newValue: { role, permissionKey },
    });

    res.status(201).json({ success: true, data: { role, permissionKey, granted: true } });
  }),
);

router.delete(
  '/roles/:role/revoke/:key',
  asyncHandler(async (req: Request, res: Response) => {
    const role = req.params.role;
    assertEditable(role);

    const permissionKey = decodeURIComponent(req.params.key);
    const permission = await prisma.permission.findUnique({ where: { key: permissionKey } });
    if (!permission) throw new NotFoundError(`No permission with key "${permissionKey}".`);

    await prisma.rolePermission.deleteMany({
      where: { role: role as never, permissionId: permission.id },
    });

    clearPermissionCache(role);
    await QueueService.logAudit({
      userId:   req.user!.userId,
      action:   'PERMISSION_REVOKED',
      entity:   'rolePermission',
      entityId: `${role}:${permissionKey}`,
      oldValue: { role, permissionKey },
    });

    res.json({ success: true, data: { role, permissionKey, granted: false } });
  }),
);

/** Replaces a role's whole set — used by the UI's "reset to defaults". */
router.put(
  '/roles/:role',
  asyncHandler(async (req: Request, res: Response) => {
    const role = req.params.role;
    assertEditable(role);

    const { permissionKeys } = req.body as { permissionKeys?: string[] };
    if (!Array.isArray(permissionKeys)) {
      throw new AppError('permissionKeys must be an array of permission keys.', 400);
    }

    const found = await prisma.permission.findMany({
      where:  { key: { in: permissionKeys } },
      select: { id: true, key: true },
    });
    // Refuse the whole write rather than silently granting a subset: a typo
    // would otherwise leave the role with fewer permissions than asked for.
    const unknown = permissionKeys.filter((k) => !found.some((f) => f.key === k));
    if (unknown.length) {
      throw new AppError(`Unknown permission key(s): ${unknown.join(', ')}`, 400);
    }

    await prisma.$transaction([
      prisma.rolePermission.deleteMany({ where: { role: role as never } }),
      prisma.rolePermission.createMany({
        data: found.map((f) => ({
          role:         role as never,
          permissionId: f.id,
          grantedById:  req.user!.userId,
        })),
      }),
    ]);

    clearPermissionCache(role);
    await QueueService.logAudit({
      userId:   req.user!.userId,
      action:   'PERMISSIONS_BULK_UPDATED',
      entity:   'rolePermission',
      entityId: role,
      newValue: { role, count: found.length, permissionKeys },
    });

    res.json({ success: true, data: { role, count: found.length } });
  }),
);

/** The default set for a role, so the UI can offer "reset" without hardcoding it. */
router.get(
  '/roles/:role/defaults',
  asyncHandler(async (req: Request, res: Response) => {
    const role = req.params.role;
    assertManagedRole(role);
    res.json({ success: true, data: { role, permissionKeys: DEFAULT_ROLE_PERMISSIONS[role] ?? [] } });
  }),
);

export default router;
