-- Marketing Head and Sales created and edited clients through a role list on the
-- client routes. Those routes now check clients.create and clients.edit, which
-- neither role held by default — without this, both would lose access the moment
-- this deploys.
--
-- Data only; no schema change. Idempotent, and limited to roles and permissions
-- that exist: a deployment that deleted either role, has not seeded these
-- permissions yet, or already granted them is left exactly as it is.
INSERT INTO "RolePermission" ("id", "role", "permissionId", "grantedAt")
SELECT gen_random_uuid()::text, r."name", p."id", NOW()
FROM "Role" r
CROSS JOIN "Permission" p
WHERE r."name" IN ('MARKETING_HEAD', 'SALES')
  AND p."key"  IN ('clients.create', 'clients.edit')
ON CONFLICT ("role", "permissionId") DO NOTHING;
