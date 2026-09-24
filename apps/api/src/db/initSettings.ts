/**
 * initSettings.ts
 *
 * Upserts the default SystemSetting rows that every environment needs.
 * Safe to run on every deploy — update:{} means existing customised values
 * are never overwritten; only brand-new keys are inserted.
 *
 * Run via:  npx ts-node src/db/initSettings.ts
 * Or from the compiled output:  node dist/db/initSettings.js
 */

import prisma from './prisma';

const DEFAULT_SETTINGS: Array<{
  key: string;
  value: string;
  label: string;
  group: string;
  dataType?: string;
}> = [
  // ── GENERAL ─────────────────────────────────────────────────────────
  { key: 'company_name',         value: 'STAP Security Ltd',       label: 'Company Name',                   group: 'GENERAL' },
  { key: 'company_address',      value: 'Kampala, Uganda',         label: 'Company Address',                group: 'GENERAL' },
  { key: 'company_phone',        value: '+256 414 000 000',        label: 'Company Phone',                  group: 'GENERAL' },
  { key: 'company_email',        value: 'info@stapsecurity.co.ug', label: 'Company Email',                  group: 'GENERAL' },
  { key: 'company_website',      value: 'www.stapsecurity.co.ug',  label: 'Company Website',                group: 'GENERAL' },
  { key: 'director_name',        value: '',                        label: 'Director Name',                  group: 'GENERAL' },
  { key: 'financial_year_start', value: '01/07',                   label: 'Financial Year Start (DD/MM)',   group: 'GENERAL' },

  // ── GUARD FIELDS ─────────────────────────────────────────────────────
  // Which optional guard fields this deployment insists on. Only fields the
  // database allows to be absent appear here: firstName, lastName, dateOfBirth,
  // salaryRate and contractStart are NOT NULL and are always required.
  { key: 'guard_field_phone_required',                   value: 'false', label: 'Phone number required',        group: 'GUARD_FIELDS', dataType: 'boolean' },
  { key: 'guard_field_nationalId_required',              value: 'false', label: 'National ID required',         group: 'GUARD_FIELDS', dataType: 'boolean' },
  { key: 'guard_field_idType_required',                  value: 'false', label: 'ID type required',             group: 'GUARD_FIELDS', dataType: 'boolean' },
  { key: 'guard_field_gender_required',                  value: 'false', label: 'Gender required',              group: 'GUARD_FIELDS', dataType: 'boolean' },
  { key: 'guard_field_district_required',                value: 'false', label: 'District required',            group: 'GUARD_FIELDS', dataType: 'boolean' },
  { key: 'guard_field_nextOfKinName_required',           value: 'false', label: 'Next of kin name required',    group: 'GUARD_FIELDS', dataType: 'boolean' },
  { key: 'guard_field_nextOfKinPhone_required',          value: 'false', label: 'Next of kin phone required',   group: 'GUARD_FIELDS', dataType: 'boolean' },
  { key: 'guard_field_preferredPaymentContact_required', value: 'false', label: 'Mobile money number required', group: 'GUARD_FIELDS', dataType: 'boolean' },
  { key: 'guard_field_mobileNetwork_required',           value: 'false', label: 'Mobile network required',      group: 'GUARD_FIELDS', dataType: 'boolean' },

  // ── PAYROLL ──────────────────────────────────────────────────────────
  { key: 'payroll_working_days', value: '26',    label: 'Working Days per Month',         group: 'PAYROLL', dataType: 'number' },
  { key: 'payroll_currency',     value: 'UGX',   label: 'Payroll Currency',               group: 'PAYROLL' },
  { key: 'nssf_rate',            value: '5',     label: 'NSSF Rate (%)',                  group: 'PAYROLL', dataType: 'number' },
  { key: 'nssf_enabled',         value: 'false', label: 'NSSF Deductions Enabled',        group: 'PAYROLL', dataType: 'boolean' },

  // ── BILLING ──────────────────────────────────────────────────────────
  { key: 'default_billing_terms', value: '30',       label: 'Default Billing Terms (days)', group: 'BILLING', dataType: 'number' },
  { key: 'invoice_prefix',        value: 'STAP/INV', label: 'Invoice Prefix',               group: 'BILLING' },
  { key: 'tax_rate',              value: '0',        label: 'Tax Rate (%)',                  group: 'BILLING', dataType: 'number' },
  { key: 'yo_payment_enabled',    value: 'false',    label: 'Yo! Payments Enabled',          group: 'BILLING', dataType: 'boolean' },

  // ── ID FORMATS ───────────────────────────────────────────────────────
  // Prefixes for generated system IDs. Changing one affects records created
  // afterwards; nothing already issued is renamed.
  { key: 'guard_id_prefix',    value: 'SSLG', label: 'Guard ID Prefix',           group: 'ID_FORMAT' },
  { key: 'client_id_prefix',   value: 'SSLC', label: 'Client ID Prefix',          group: 'ID_FORMAT' },
  { key: 'staff_id_prefix',    value: 'SSLS', label: 'Staff ID Prefix',           group: 'ID_FORMAT' },
  { key: 'gun_id_prefix',      value: 'GUN',  label: 'Gun ID Prefix',             group: 'ID_FORMAT' },
  { key: 'shift_report_prefix',value: 'SHR',  label: 'Shift Report ID Prefix',    group: 'ID_FORMAT' },
  { key: 'id_padding',         value: '3',    label: 'ID Number Padding (digits)', group: 'ID_FORMAT', dataType: 'number' },

  // ── SECURITY ─────────────────────────────────────────────────────────
  { key: 'max_failed_logins',    value: '5',     label: 'Max Failed Login Attempts',      group: 'SECURITY', dataType: 'number' },
  { key: 'session_timeout_mins', value: '480',   label: 'Session Timeout (minutes)',      group: 'SECURITY', dataType: 'number' },
  { key: 'require_2fa_director', value: 'false', label: 'Require 2FA for Director',       group: 'SECURITY', dataType: 'boolean' },

  // ── NOTIFICATIONS ────────────────────────────────────────────────────
  { key: 'sms_enabled',            value: 'false', label: 'SMS Notifications Enabled',       group: 'NOTIFICATIONS', dataType: 'boolean' },
  { key: 'email_enabled',          value: 'true',  label: 'Email Notifications Enabled',     group: 'NOTIFICATIONS', dataType: 'boolean' },
  { key: 'absent_alert_threshold', value: '2',     label: 'Absent Alert Threshold (hours)',  group: 'NOTIFICATIONS', dataType: 'number' },
];

const DEFAULT_SHIFT_TYPES = [
  { code: 'DAY',     name: 'Day Shift',     startTime: '07:00', endTime: '19:00', durationHours: 12, displayOrder: 1 },
  { code: 'NIGHT',   name: 'Night Shift',   startTime: '19:00', endTime: '07:00', durationHours: 12, displayOrder: 2 },
  { code: 'FULL_24', name: '24 Hour Shift', startTime: '07:00', endTime: '07:00', durationHours: 24, displayOrder: 3 },
];

async function initSettings() {
  console.log('⚙️  Initialising default system settings…');
  let inserted = 0;

  // Check which keys already exist so we can report inserts vs skips.
  const existing = await prisma.systemSetting.findMany({ select: { key: true } });
  const existingKeys = new Set(existing.map((s) => s.key));

  for (const s of DEFAULT_SETTINGS) {
    await prisma.systemSetting.upsert({
      where:  { key: s.key },
      update: {},   // never overwrite values customised by the admin
      create: {
        key:      s.key,
        value:    s.value,
        label:    s.label,
        group:    s.group,
        dataType: s.dataType ?? 'string',
      },
    });
    if (!existingKeys.has(s.key)) inserted++;
  }

  console.log(`✅ Settings initialised — ${inserted} new row(s) inserted, ${DEFAULT_SETTINGS.length - inserted} already existed.`);

  // ── Seed default shift types ──────────────────────────────────────────────
  console.log('⚙️  Seeding default shift types…');
  let shiftInserted = 0;
  const existingShifts = await prisma.shiftTypeConfig.findMany({ select: { code: true } });
  const existingCodes = new Set(existingShifts.map((s) => s.code));

  for (const shift of DEFAULT_SHIFT_TYPES) {
    await prisma.shiftTypeConfig.upsert({
      where:  { code: shift.code },
      update: {},   // never overwrite admin-configured values
      create: { ...shift, isActive: true, isOvertime: false },
    });
    if (!existingCodes.has(shift.code)) shiftInserted++;
  }

  console.log(`✅ Shift types seeded — ${shiftInserted} new, ${DEFAULT_SHIFT_TYPES.length - shiftInserted} already existed.`);
}

initSettings()
  .catch((err) => { console.error('❌ initSettings failed:', err); process.exit(1); })
  .finally(() => prisma.$disconnect());
