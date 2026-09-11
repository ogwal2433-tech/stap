import { PrismaClient, UserStatus } from '@prisma/client';
import { SYSTEM_ROLES } from '../constants/systemRoles';
import { HR_LETTER_TEMPLATES } from './hrLetterTemplates';
import { PERMISSIONS, permissionModule, permissionName } from '../constants/permissions';
import { DEFAULT_ROLE_PERMISSIONS } from '../constants/defaultPermissions';
import { SETTINGS_CONFIG } from '../constants/settingsConfig';
import { syncJobRegistry } from '../lib/jobRunner';
import { encrypt, isEncryptionConfigured } from '../lib/settingsEncryption';
import bcrypt from 'bcryptjs';

function fmtId(prefix: string, n: number): string {
  return `${prefix}${n.toString().padStart(3, '0')}`;
}

const prisma = new PrismaClient();

const PASSWORD = process.env.SEED_PASSWORD as string;
if (!PASSWORD) {
  console.error('❌ SEED_PASSWORD env var is required. Set it in .env before running the seed.');
  process.exit(1);
}
const SALT_ROUNDS = 12;

/**
 * Gives a system ID to rows that predate the scheme.
 *
 * Numbering continues past the highest ID already issued rather than restarting
 * at 1, and skips any number already taken. Restarting at 1 meant a second run
 * collided on the unique constraint and aborted the whole seed, which in QA
 * takes the API down with it: the entrypoint runs the seed before the server,
 * under `set -e`, so a colliding ID becomes a container restart loop.
 *
 * Skipping taken numbers as well as counting past the maximum covers the case
 * the maximum alone does not — a gap-filled or hand-edited sequence, where the
 * next number up is free but a later one is not.
 */
async function backfillSystemIds() {
  console.log('📋 Backfilling system IDs...');

  /**
   * Assigns IDs to the rows that have none, from the rows already read — no
   * extra queries, and every taken ID is known before the first write.
   */
  async function backfill<T extends { id: string; systemId: string | null }>(
    rows:   T[],
    prefix: string,
    update: (id: string, systemId: string) => Promise<unknown>,
    label:  string,
  ): Promise<void> {
    const taken = new Set(rows.map((r) => r.systemId).filter(Boolean) as string[]);
    const missing = rows.filter((r) => !r.systemId);
    if (!missing.length) return;

    let n = rows.reduce((max, r) => {
      const m = r.systemId?.match(new RegExp(`^${prefix}(\\d+)$`));
      return m ? Math.max(max, parseInt(m[1], 10)) : max;
    }, 0);

    for (const row of missing) {
      let candidate = fmtId(prefix, ++n);
      while (taken.has(candidate)) candidate = fmtId(prefix, ++n);
      taken.add(candidate);
      await update(row.id, candidate);
    }
    console.log(`✅ Backfilled ${missing.length} ${label}`);
  }

  const order = { orderBy: { createdAt: 'asc' } } as const;
  const select = { id: true, systemId: true } as const;

  await backfill(
    await prisma.guard.findMany({ select, ...order }), 'SSLG',
    (id, systemId) => prisma.guard.update({ where: { id }, data: { systemId } }), 'guard IDs',
  );
  await backfill(
    await prisma.client.findMany({ select, ...order }), 'SSLC',
    (id, systemId) => prisma.client.update({ where: { id }, data: { systemId } }), 'client IDs',
  );
  await backfill(
    await prisma.user.findMany({ select, ...order }), 'SSLS',
    (id, systemId) => prisma.user.update({ where: { id }, data: { systemId } }), 'user IDs',
  );
}

async function main() {
  console.log('🌱 Starting seed...\n');

  await backfillSystemIds();

  const passwordHash = await bcrypt.hash(PASSWORD, SALT_ROUNDS);

  // ── Roles ───────────────────────────────────────────────────────────────────
  //
  // Users and grants reference a role by name through a foreign key, so every
  // role must exist before either is written. An existing row is left alone: a
  // label or colour changed in the UI must survive a re-seed.

  for (const r of SYSTEM_ROLES) {
    await prisma.role.upsert({
      where:  { name: r.name },
      update: {},
      create: {
        name: r.name, label: r.label, description: r.description,
        colour: r.colour, isSystem: true, isActive: r.isActive,
      },
    });
  }
  console.log(`✅ ${SYSTEM_ROLES.length} system roles`);

  // ── Users (one per role) ────────────────────────────────────────────────────

  const userSeeds: Array<{ name: string; email: string; role: string; status: UserStatus }> = [
    { name: 'Joshua Ssewakiryanga',  email: 'director@stapsecurity.co.ug',     role: 'DIRECTOR',             status: UserStatus.ACTIVE },
    { name: 'Grace Namutebi',        email: 'asstmanager@stapsecurity.co.ug',  role: 'ASSISTANT_MANAGER',    status: UserStatus.ACTIVE },
    { name: 'Ronald Byaruhanga',     email: 'admin@stapsecurity.co.ug',        role: 'ADMINISTRATOR',        status: UserStatus.ACTIVE },
    { name: 'Patricia Namukasa',     email: 'opsupervisor@stapsecurity.co.ug', role: 'OPERATIONS_SUPERVISOR', status: UserStatus.ACTIVE },
    { name: 'Emmanuel Okello',       email: 'fieldsupervisor@stapsecurity.co.ug', role: 'FIELD_SUPERVISOR',  status: UserStatus.ACTIVE },
    { name: 'Immaculate Nalubega',   email: 'trainer@stapsecurity.co.ug',      role: 'TRAINER',              status: UserStatus.ACTIVE },
    { name: 'Charles Mwesigwa',      email: 'accounts@stapsecurity.co.ug',     role: 'ACCOUNTS_OFFICER',     status: UserStatus.ACTIVE },
    { name: 'Betty Nakiwala',        email: 'controlroom@stapsecurity.co.ug',  role: 'CONTROL_ROOM',         status: UserStatus.ACTIVE },
    { name: 'Sylvia Akello',         email: 'marketing@stapsecurity.co.ug',    role: 'MARKETING_HEAD',       status: UserStatus.ACTIVE },
    { name: 'Brian Kigongo',         email: 'sales@stapsecurity.co.ug',        role: 'SALES',                status: UserStatus.ACTIVE },
    { name: 'Rebecca Atim',          email: 'hr@stapsecurity.co.ug',           role: 'HR',                   status: UserStatus.ACTIVE },
    { name: 'David Wasswa',          email: 'guard.wasswa@stapsecurity.co.ug', role: 'GUARD',                status: UserStatus.ACTIVE },
    { name: 'Michael Kakooza',       email: 'client.kakooza@stapsecurity.co.ug', role: 'CLIENT',             status: UserStatus.ACTIVE },
  ];

  const users: Record<string, Awaited<ReturnType<typeof prisma.user.upsert>>> = {};

  for (const seed of userSeeds) {
    const user = await prisma.user.upsert({
      where: { email: seed.email },
      update: {},
      create: { ...seed, passwordHash },
    });
    users[seed.role] = user;
    console.log(`✅ User created: ${user.name} (${user.role})`);
  }

  // ── Integration settings ────────────────────────────────────────────────────
  //
  // Lifts SMTP and gateway credentials out of .env into the database once, so
  // they become editable from Settings → Integrations. A key already saved is
  // left alone: the database is the source of truth from that point on, and a
  // re-seed must not undo a change made in the UI or revive a rotated secret.

  console.log('🔌 Migrating integration settings from .env...');
  let migrated = 0;
  let skippedSecrets = 0;

  for (const def of SETTINGS_CONFIG) {
    const fromEnv = process.env[def.envFallback];
    if (!fromEnv) continue;

    const existing = await prisma.systemSetting.findUnique({ where: { key: def.key } });
    if (existing) continue;

    if (def.isEncrypted && !isEncryptionConfigured()) {
      skippedSecrets++;
      continue;
    }

    await prisma.systemSetting.create({
      data: {
        key:         def.key,
        value:       def.isEncrypted ? encrypt(fromEnv) : fromEnv,
        label:       def.label,
        group:       def.group,
        dataType:    def.inputType === 'number' ? 'number' : def.inputType === 'toggle' ? 'boolean' : 'string',
        description: def.description,
        inputType:   def.inputType,
        isRequired:  def.isRequired,
        isEncrypted: def.isEncrypted,
      },
    });
    migrated++;
    console.log(`   ✅ ${def.key}${def.isEncrypted ? ' (encrypted)' : ''}`);
  }

  if (skippedSecrets > 0) {
    console.log(`   ⚠️  ${skippedSecrets} secret(s) left in .env — SETTINGS_ENCRYPTION_KEY is not set.`);
  }
  console.log(`✅ ${migrated} integration setting(s) migrated; the rest already had values or none in .env`);

  // ── Permissions ─────────────────────────────────────────────────────────────
  //
  // Both loops upsert and neither deletes, so re-seeding adds anything new
  // without disturbing grants an administrator has changed from the UI. Taking
  // a role back to the defaults is a deliberate action there, not a deploy.

  console.log('🔐 Seeding permissions...');
  for (const [constant, key] of Object.entries(PERMISSIONS)) {
    await prisma.permission.upsert({
      where:  { key },
      update: { name: permissionName(constant), module: permissionModule(key) },
      create: { key, name: permissionName(constant), module: permissionModule(key) },
    });
  }
  console.log(`✅ ${Object.keys(PERMISSIONS).length} permissions`);

  console.log('🔐 Assigning default role permissions...');
  const permByKey = new Map(
    (await prisma.permission.findMany({ select: { id: true, key: true } }))
      .map((p) => [p.key, p.id]),
  );

  let granted = 0;
  for (const [role, keys] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
    for (const key of keys) {
      const permissionId = permByKey.get(key);
      if (!permissionId) {
        console.warn(`   ⚠️  ${role}: no permission row for "${key}" — skipped`);
        continue;
      }
      await prisma.rolePermission.upsert({
        where:  { role_permissionId: { role: role, permissionId } },
        update: {},
        create: { role: role, permissionId },
      });
      granted++;
    }
  }
  console.log(`✅ ${granted} role permissions across ${Object.keys(DEFAULT_ROLE_PERMISSIONS).length} roles`);

  // ── Business records are deliberately not seeded ────────────────────────────
  //
  // Clients, sites, contracts, guards and deployment history used to be created
  // here as sample data. A fresh environment now starts empty of business
  // records: real guards and clients are entered through the application, and
  // seeded stand-ins were being mistaken for live data.
  //
  // What remains below is configuration the application needs in order to run
  // at all — system settings, HR letter templates, the uniform catalogue, guard
  // ranks, deduction types and shift types. None of it is sample data; payroll,
  // rostering and letter generation each break without it.

  // ── System Settings ─────────────────────────────────────────────────────────

  const settingSeeds: Array<{ key: string; value: string; label: string; group: string; dataType?: string }> = [
    // GENERAL
    { key: 'company_name',         value: 'STAP Security Ltd',           label: 'Company Name',           group: 'GENERAL' },
    { key: 'company_address',      value: 'Kampala, Uganda',             label: 'Company Address',         group: 'GENERAL' },
    { key: 'company_phone',        value: '+256 414 000 000',            label: 'Company Phone',           group: 'GENERAL' },
    { key: 'company_email',        value: 'info@stapsecurity.co.ug',     label: 'Company Email',           group: 'GENERAL' },
    { key: 'company_website',      value: 'www.stapsecurity.co.ug',      label: 'Company Website',         group: 'GENERAL' },
    { key: 'director_name',        value: 'Taraka Joel',                 label: 'Director Name',           group: 'GENERAL' },
    { key: 'financial_year_start', value: '01/07',                       label: 'Financial Year Start (DD/MM)', group: 'GENERAL' },
    // PAYROLL
    { key: 'payroll_working_days', value: '26',    label: 'Working Days per Month', group: 'PAYROLL', dataType: 'number' },
    { key: 'payroll_currency',     value: 'UGX',   label: 'Payroll Currency',       group: 'PAYROLL' },
    { key: 'nssf_rate',            value: '5',     label: 'NSSF Rate (%)',           group: 'PAYROLL', dataType: 'number' },
    { key: 'nssf_enabled',         value: 'false', label: 'NSSF Deductions Enabled', group: 'PAYROLL', dataType: 'boolean' },
    // BILLING
    { key: 'default_billing_terms', value: '30',       label: 'Default Billing Terms (days)', group: 'BILLING', dataType: 'number' },
    { key: 'invoice_prefix',        value: 'STAP/INV', label: 'Invoice Prefix',               group: 'BILLING' },
    { key: 'tax_rate',              value: '0',        label: 'Tax Rate (%)',                  group: 'BILLING', dataType: 'number' },
    { key: 'yo_payment_enabled',    value: 'false',    label: 'Yo! Payments Enabled',          group: 'BILLING', dataType: 'boolean' },
    // SECURITY
    { key: 'max_failed_logins',      value: '5',     label: 'Max Failed Login Attempts', group: 'SECURITY', dataType: 'number' },
    { key: 'session_timeout_mins',   value: '480',   label: 'Session Timeout (minutes)', group: 'SECURITY', dataType: 'number' },
    { key: 'require_2fa_director',   value: 'false', label: 'Require 2FA for Director',  group: 'SECURITY', dataType: 'boolean' },
    // NOTIFICATIONS
    { key: 'sms_enabled',            value: 'false', label: 'SMS Notifications Enabled',  group: 'NOTIFICATIONS', dataType: 'boolean' },
    { key: 'email_enabled',          value: 'true',  label: 'Email Notifications Enabled', group: 'NOTIFICATIONS', dataType: 'boolean' },
    { key: 'absent_alert_threshold', value: '2',     label: 'Absent Alert Threshold (hours)', group: 'NOTIFICATIONS', dataType: 'number' },
  ];

  for (const s of settingSeeds) {
    await prisma.systemSetting.upsert({
      where: { key: s.key },
      update: {},
      create: { key: s.key, value: s.value, label: s.label, group: s.group, dataType: s.dataType ?? 'string' },
    });
  }
  console.log(`✅ ${settingSeeds.length} system settings seeded`);

  // ── Letter Templates ─────────────────────────────────────────────────────────

  const directorId = users['DIRECTOR']?.id ?? 'system';

  const letterTemplates: Array<{ letterType: string; name: string; content: string }> = [
    {
      letterType: 'VERBAL_WARNING',
      name: 'Verbal Warning Letter',
      content: `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:700px;margin:auto;padding:40px">
<p style="text-align:right">{date}</p>
<p><strong>Ref:</strong> {ref_number}</p>
<h3 style="text-align:center">VERBAL WARNING</h3>
<p>Dear <strong>{guard_name}</strong>,</p>
<p>This letter serves as a formal record of a verbal warning issued to you on {date} regarding the following matter:</p>
<blockquote style="border-left:3px solid #ccc;padding-left:12px">{reason}</blockquote>
<p>You are advised to improve your conduct immediately. A repeat of this behaviour may result in further disciplinary action.</p>
<p>Please acknowledge receipt of this letter by signing below.</p>
<br><p>Regards,</p>
<p><strong>{director_name}</strong><br>Director, {company_name}</p>
<br><p>Guard Signature: _________________________ &nbsp;&nbsp; Date: _____________</p>
</body></html>`,
    },
    {
      letterType: 'FIRST_WARNING',
      name: 'First Written Warning Letter',
      content: `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:700px;margin:auto;padding:40px">
<p style="text-align:right">{date}</p>
<p><strong>Ref:</strong> {ref_number}</p>
<h3 style="text-align:center">FIRST WRITTEN WARNING</h3>
<p>Dear <strong>{guard_name}</strong>,</p>
<p>Following a disciplinary hearing held on {date}, this letter constitutes a <strong>First Written Warning</strong> regarding:</p>
<blockquote style="border-left:3px solid #ccc;padding-left:12px">{reason}</blockquote>
<p><strong>Outcome:</strong> {outcome}</p>
<p>This warning will remain on your record for 6 months. A further breach may result in a final written warning or termination.</p>
<br><p>Regards,</p>
<p><strong>{director_name}</strong><br>Director, {company_name}</p>
<br><p>Guard Signature: _________________________ &nbsp;&nbsp; Date: _____________</p>
</body></html>`,
    },
    {
      letterType: 'FINAL_WARNING',
      name: 'Final Written Warning Letter',
      content: `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:700px;margin:auto;padding:40px">
<p style="text-align:right">{date}</p>
<p><strong>Ref:</strong> {ref_number}</p>
<h3 style="text-align:center;color:#c0392b">FINAL WRITTEN WARNING</h3>
<p>Dear <strong>{guard_name}</strong>,</p>
<p>This letter serves as a <strong>Final Written Warning</strong>. Following a disciplinary hearing on {date}, you have been found in breach of company policy:</p>
<blockquote style="border-left:3px solid #c0392b;padding-left:12px">{reason}</blockquote>
<p><strong>Outcome:</strong> {outcome}</p>
<p style="color:#c0392b"><strong>Any further misconduct will result in immediate termination of your employment.</strong></p>
<br><p>Regards,</p>
<p><strong>{director_name}</strong><br>Director, {company_name}</p>
<br><p>Guard Signature: _________________________ &nbsp;&nbsp; Date: _____________</p>
</body></html>`,
    },
    {
      letterType: 'TERMINATION_NOTICE',
      name: 'Termination Notice',
      content: `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:700px;margin:auto;padding:40px">
<p style="text-align:right">{date}</p>
<p><strong>Ref:</strong> {ref_number}</p>
<h3 style="text-align:center;color:#c0392b">NOTICE OF TERMINATION OF EMPLOYMENT</h3>
<p>Dear <strong>{guard_name}</strong>,</p>
<p>We regret to inform you that your employment with <strong>{company_name}</strong> has been terminated effective <strong>{date}</strong>.</p>
<p><strong>Reason for Termination:</strong></p>
<blockquote style="border-left:3px solid #c0392b;padding-left:12px">{reason}</blockquote>
<p>Please return all company property, uniforms, and equipment by the date specified above. Your final dues will be settled in accordance with the Employment Act.</p>
<br><p>Regards,</p>
<p><strong>{director_name}</strong><br>Director, {company_name}<br>{company_address}</p>
</body></html>`,
    },
    {
      letterType: 'APPOINTMENT_LETTER',
      name: 'Appointment Letter',
      content: `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:700px;margin:auto;padding:40px">
<p style="text-align:right">{date}</p>
<p><strong>Ref:</strong> {ref_number}</p>
<h3 style="text-align:center">LETTER OF APPOINTMENT</h3>
<p>Dear <strong>{guard_name}</strong>,</p>
<p>We are pleased to offer you the position of <strong>Security Guard</strong> at <strong>{company_name}</strong>, effective <strong>{contract_start}</strong>.</p>
<p><strong>Terms of Employment:</strong></p>
<ul>
  <li>Monthly Salary: UGX <strong>{salary}</strong></li>
  <li>Contract Period: {contract_start} to {contract_end}</li>
  <li>Reporting: As directed by your supervisor</li>
</ul>
<p>You are required to abide by all company policies, the Uganda Employment Act, and the Private Security Organisation Act.</p>
<p>Please sign and return a copy of this letter to confirm your acceptance.</p>
<br><p>Regards,</p>
<p><strong>{director_name}</strong><br>Director, {company_name}<br>{company_address}</p>
<br><p>I accept the above terms: _________________________ &nbsp;&nbsp; Date: _____________</p>
</body></html>`,
    },
    {
      letterType: 'CONTRACT_EXTENSION',
      name: 'Contract Extension Letter',
      content: `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:700px;margin:auto;padding:40px">
<p style="text-align:right">{date}</p>
<p><strong>Ref:</strong> {ref_number}</p>
<h3 style="text-align:center">CONTRACT EXTENSION</h3>
<p>Dear <strong>{guard_name}</strong>,</p>
<p>We are pleased to inform you that your employment contract with <strong>{company_name}</strong> has been extended.</p>
<p><strong>New Contract End Date:</strong> {contract_end}</p>
<p>All other terms and conditions of your original contract remain unchanged. Your monthly salary remains UGX <strong>{salary}</strong>.</p>
<p>Please sign below to confirm your acceptance of this extension.</p>
<br><p>Regards,</p>
<p><strong>{director_name}</strong><br>Director, {company_name}</p>
<br><p>I accept the extension: _________________________ &nbsp;&nbsp; Date: _____________</p>
</body></html>`,
    },
    {
      letterType: 'CONFIRMATION_OF_EMPLOYMENT',
      name: 'Confirmation of Employment Letter',
      content: `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:700px;margin:auto;padding:40px">
<p style="text-align:right">{date}</p>
<p><strong>Ref:</strong> {ref_number}</p>
<h3 style="text-align:center">CONFIRMATION OF EMPLOYMENT</h3>
<p>TO WHOM IT MAY CONCERN,</p>
<p>This is to confirm that <strong>{guard_name}</strong>, National ID: <strong>{national_id}</strong>, is currently employed by <strong>{company_name}</strong> as a Security Guard.</p>
<p>Employment commenced on <strong>{contract_start}</strong> and is ongoing. The employee's monthly salary is UGX <strong>{salary}</strong>.</p>
<p>This letter is issued for official purposes only.</p>
<br><p>Regards,</p>
<p><strong>{director_name}</strong><br>Director, {company_name}<br>{company_address}</p>
</body></html>`,
    },
    {
      letterType: 'SALARY_REVIEW',
      name: 'Salary Review Letter',
      content: `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:700px;margin:auto;padding:40px">
<p style="text-align:right">{date}</p>
<p><strong>Ref:</strong> {ref_number}</p>
<h3 style="text-align:center">SALARY REVIEW NOTIFICATION</h3>
<p>Dear <strong>{guard_name}</strong>,</p>
<p>Following a review of your performance and salary, we are pleased to inform you that your monthly salary has been revised to <strong>UGX {salary}</strong>, effective <strong>{date}</strong>.</p>
<p>This adjustment reflects our appreciation for your dedication and service to <strong>{company_name}</strong>.</p>
<p>All other terms and conditions of your employment remain unchanged.</p>
<br><p>Regards,</p>
<p><strong>{director_name}</strong><br>Director, {company_name}</p>
<br><p>Guard Signature: _________________________ &nbsp;&nbsp; Date: _____________</p>
</body></html>`,
    },
  ];

  // The exit/leave paperwork lives in its own module — same shape, kept apart
  // so the wording can be reviewed against the printed forms without wading
  // through the seed.
  const allTemplates = [...letterTemplates, ...HR_LETTER_TEMPLATES];

  for (const tmpl of allTemplates) {
    await prisma.letterTemplate.upsert({
      where:  { letterType: tmpl.letterType },
      // Never overwrite: an admin may have edited the wording since.
      update: {},
      create: { ...tmpl, createdBy: directorId, isActive: true, version: 1 },
    });
  }
  console.log(`✅ ${allTemplates.length} letter templates seeded`);

  // ── Uniform Inventory ────────────────────────────────────────────────────────

  const uniformItems = [
    {
      itemCode:         'STAP-UNI-SHIRT',
      itemName:         'Guard Shirt',
      itemType:         'UNIFORM',
      unitCost:         30000,
      stockQuantity:    50,
      reorderThreshold: 10,
      description:      'Issued free on joining. Replacement if lost: UGX 30,000',
      issuedFree:       true,
      isShoeItem:       false,
    },
    {
      itemCode:         'STAP-UNI-TROUSER',
      itemName:         'Guard Trouser',
      itemType:         'UNIFORM',
      unitCost:         30000,
      stockQuantity:    50,
      reorderThreshold: 10,
      description:      'Issued free on joining. Replacement if lost: UGX 30,000',
      issuedFree:       true,
      isShoeItem:       false,
    },
    {
      itemCode:         'STAP-UNI-CAP',
      itemName:         'Guard Cap',
      itemType:         'UNIFORM',
      unitCost:         15000,
      stockQuantity:    50,
      reorderThreshold: 10,
      description:      'Issued free on joining. Replacement if lost: UGX 15,000',
      issuedFree:       true,
      isShoeItem:       false,
    },
    {
      itemCode:         'STAP-UNI-BELT',
      itemName:         'Guard Belt',
      itemType:         'UNIFORM',
      unitCost:         15000,
      stockQuantity:    50,
      reorderThreshold: 10,
      description:      'Issued free on joining. Replacement if lost: UGX 15,000',
      issuedFree:       true,
      isShoeItem:       false,
    },
    {
      itemCode:         'STAP-UNI-SHOES',
      itemName:         'Guard Shoes',
      itemType:         'UNIFORM',
      unitCost:         30000,
      stockQuantity:    30,
      reorderThreshold: 5,
      description:      'UGX 30,000 deducted from guard first payroll on joining. Not replaced free if lost.',
      issuedFree:       false,
      isShoeItem:       true,
    },
  ];

  for (const item of uniformItems) {
    await prisma.inventoryItem.upsert({
      where:  { itemCode: item.itemCode },
      update: item,
      create: item,
    });
    console.log(`✅ Seeded inventory: ${item.itemName}`);
  }

  // ── Guard Ranks ─────────────────────────────────────────────────────────────

  const defaultRanks = [
    { name: 'Guard',        displayOrder: 1 },
    { name: 'Senior Guard', displayOrder: 2 },
    { name: 'Corporal',     displayOrder: 3 },
    { name: 'Sergeant',     displayOrder: 4 },
    { name: 'Supervisor',   displayOrder: 5 },
  ];

  for (const rank of defaultRanks) {
    await prisma.guardRank.upsert({
      where:  { name: rank.name },
      update: {},
      create: rank,
    });
    console.log(`✅ Seeded rank: ${rank.name}`);
  }

  // ── Deduction Types ──────────────────────────────────────────────────────────

  const defaultDeductionTypes = [
    { name: 'Uniform Recovery',         code: 'UNIFORM_RECOVERY',         defaultAmount: null,  description: 'Recovery of uniform costs. Amount varies by item.',                                                                   isAutomatic: false, displayOrder: 1 },
    { name: 'Damage / Loss',            code: 'DAMAGE_LOSS',              defaultAmount: null,  description: 'Charged when a guard loses or damages company property. Amount equals item replacement cost.',                        isAutomatic: false, displayOrder: 2 },
    { name: 'Food',                     code: 'FOOD',                     defaultAmount: 2000,  description: 'UGX 2,000 per plate. Enter number of plates in the description.',                                                     isAutomatic: false, displayOrder: 3 },
    { name: 'Transport',                code: 'TRANSPORT',                defaultAmount: null,  description: 'Actual cost of company transport used by the guard. Enter exact amount.',                                            isAutomatic: false, displayOrder: 4 },
    { name: 'Indiscipline Charge',      code: 'INDISCIPLINE',             defaultAmount: 10000, description: 'Standard charge per disciplinary charge sheet: UGX 10,000.',                                                         isAutomatic: false, displayOrder: 5 },
    { name: 'Late Coming',              code: 'LATE_COMING',              defaultAmount: 10000, description: 'Standard charge per late coming occurrence: UGX 10,000.',                                                             isAutomatic: false, displayOrder: 6 },
    { name: 'Unworked Day',             code: 'UNWORKED_DAY',             defaultAmount: 6666,  description: 'UGX 6,666 per day not worked (salary ÷ 30). Auto-calculated from attendance.',                                       isAutomatic: true,  displayOrder: 7 },
    { name: 'Disciplinary Penalty',     code: 'DISCIPLINARY_PENALTY',     defaultAmount: null,  description: 'Financial penalty imposed as part of a formal disciplinary outcome.',                                                 isAutomatic: false, displayOrder: 8 },
    { name: 'Salary Advance Repayment', code: 'SALARY_ADVANCE_REPAYMENT', defaultAmount: null,  description: 'Repayment of a salary advance previously issued to the guard.',                                                      isAutomatic: false, displayOrder: 9 },
    { name: 'NSSF Contribution',        code: 'NSSF',                     defaultAmount: null,  description: 'National Social Security Fund deduction. Amount is a percentage of gross salary.',                                   isAutomatic: true,  displayOrder: 10 },
  ];

  for (const dt of defaultDeductionTypes) {
    await prisma.deductionType.upsert({
      where:  { code: dt.code },
      update: {},
      create: dt,
    });
    console.log(`✅ Seeded deduction type: ${dt.name}`);
  }

  // ── Shift Types ─────────────────────────────────────────────────────────────

  const defaultShiftTypes = [
    { name: 'Day Shift',   code: 'DAY',      startTime: '06:00', endTime: '18:00', durationHours: 12,   displayOrder: 1, isOvertime: false },
    { name: 'Night Shift', code: 'NIGHT',    startTime: '18:00', endTime: '06:00', durationHours: 12,   displayOrder: 2, isOvertime: false },
    { name: '24 Hour',     code: 'FULL_24',  startTime: '06:00', endTime: '06:00', durationHours: 24,   displayOrder: 3, isOvertime: false },
    { name: 'Overtime',    code: 'OVERTIME', startTime: null,    endTime: null,    durationHours: null, displayOrder: 4, isOvertime: true },
  ];

  for (const shift of defaultShiftTypes) {
    await prisma.shiftTypeConfig.upsert({
      where:  { code: shift.code },
      update: {},
      create: shift,
    });
    console.log(`✅ Seeded shift type: ${shift.name}`);
  }

  // Scheduled jobs. The registry is code; this only makes sure a row exists for
  // each so the Scheduled Jobs page has something to report on. It never
  // resumes a job an operator paused.
  const jobCount = await syncJobRegistry();
  console.log(`✅ Seeded ${jobCount} scheduled jobs`);

  console.log('\n🎉 Seed completed successfully!\n');
}

main()
  .catch((err) => {
    console.error('❌ Seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
