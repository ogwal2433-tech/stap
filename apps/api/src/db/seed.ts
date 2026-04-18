import { PrismaClient, Role, UserStatus, EmploymentStatus, ContractStatus, ClientContractStatus, ShiftType } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const PASSWORD = process.env.SEED_PASSWORD as string;
if (!PASSWORD) {
  console.error('❌ SEED_PASSWORD env var is required. Set it in .env before running the seed.');
  process.exit(1);
}
const SALT_ROUNDS = 12;

async function main() {
  console.log('🌱 Starting seed...\n');

  const passwordHash = await bcrypt.hash(PASSWORD, SALT_ROUNDS);

  // ── Users (one per role) ────────────────────────────────────────────────────

  const userSeeds: Array<{ name: string; email: string; role: Role; status: UserStatus }> = [
    { name: 'Joshua Ssewakiryanga',  email: 'director@stapsecurity.co.ug',     role: Role.DIRECTOR,             status: UserStatus.ACTIVE },
    { name: 'Grace Namutebi',        email: 'asstmanager@stapsecurity.co.ug',  role: Role.ASSISTANT_MANAGER,    status: UserStatus.ACTIVE },
    { name: 'Ronald Byaruhanga',     email: 'admin@stapsecurity.co.ug',        role: Role.ADMINISTRATOR,        status: UserStatus.ACTIVE },
    { name: 'Patricia Namukasa',     email: 'opsupervisor@stapsecurity.co.ug', role: Role.OPERATIONS_SUPERVISOR, status: UserStatus.ACTIVE },
    { name: 'Emmanuel Okello',       email: 'fieldsupervisor@stapsecurity.co.ug', role: Role.FIELD_SUPERVISOR,  status: UserStatus.ACTIVE },
    { name: 'Immaculate Nalubega',   email: 'trainer@stapsecurity.co.ug',      role: Role.TRAINER,              status: UserStatus.ACTIVE },
    { name: 'Charles Mwesigwa',      email: 'accounts@stapsecurity.co.ug',     role: Role.ACCOUNTS_OFFICER,     status: UserStatus.ACTIVE },
    { name: 'Sylvia Akello',         email: 'marketing@stapsecurity.co.ug',    role: Role.MARKETING,            status: UserStatus.ACTIVE },
    { name: 'David Wasswa',          email: 'guard.wasswa@stapsecurity.co.ug', role: Role.GUARD,                status: UserStatus.ACTIVE },
    { name: 'Michael Kakooza',       email: 'client.kakooza@stapsecurity.co.ug', role: Role.CLIENT,             status: UserStatus.ACTIVE },
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

  // ── Clients ─────────────────────────────────────────────────────────────────

  const kcca = await prisma.client.upsert({
    where: { id: 'client-kcca-001' },
    update: {},
    create: {
      id: 'client-kcca-001',
      clientName:      'Kampala Capital City Authority',
      contactPerson:   'Eng. Andrew Kitaka',
      contactPhone:    '+256-414-234567',
      email:           'security@kcca.go.ug',
      physicalAddress: 'City Hall, Kampala Road, Kampala',
      billingAddress:  'P.O. Box 7010, Kampala',
      billingTerms:    30,
      contractStatus:  ClientContractStatus.ACTIVE,
    },
  });
  console.log(`✅ Client created: ${kcca.clientName}`);

  const ura = await prisma.client.upsert({
    where: { id: 'client-ura-001' },
    update: {},
    create: {
      id: 'client-ura-001',
      clientName:      'Uganda Revenue Authority',
      contactPerson:   'Ms. Doris Akol',
      contactPhone:    '+256-417-444444',
      email:           'security@ura.go.ug',
      physicalAddress: 'URA Tower, Nakawa Industrial Area, Kampala',
      billingAddress:  'P.O. Box 7279, Kampala',
      billingTerms:    30,
      contractStatus:  ClientContractStatus.ACTIVE,
    },
  });
  console.log(`✅ Client created: ${ura.clientName}`);

  // ── Sites ───────────────────────────────────────────────────────────────────

  const kccaSite = await prisma.site.upsert({
    where: { id: 'site-kcca-cityhall' },
    update: {},
    create: {
      id:                  'site-kcca-cityhall',
      clientId:            kcca.id,
      siteName:            'KCCA City Hall',
      location:            'Kampala Road, Kampala',
      gpsLat:              0.3163,
      gpsLon:              32.5822,
      siteManagerName:     'Mr. Isaac Sserunjogi',
      siteManagerContact:  '+256-772-100200',
      specialInstructions: 'Access control at main entrance. Visitor log mandatory at all times.',
      guardsRequired:      4,
    },
  });
  console.log(`✅ Site created: ${kccaSite.siteName}`);

  const uraSite = await prisma.site.upsert({
    where: { id: 'site-ura-nakawa' },
    update: {},
    create: {
      id:                  'site-ura-nakawa',
      clientId:            ura.id,
      siteName:            'URA Head Office – Nakawa',
      location:            'Nakawa Industrial Area, Kampala',
      gpsLat:              0.3280,
      gpsLon:              32.6218,
      siteManagerName:     'Ms. Brenda Nassimbwa',
      siteManagerContact:  '+256-701-444555',
      specialInstructions: 'No photography on premises. All guards must carry ID at all times.',
      guardsRequired:      6,
    },
  });
  console.log(`✅ Site created: ${uraSite.siteName}`);

  // ── Contracts ───────────────────────────────────────────────────────────────

  await prisma.contract.upsert({
    where: { id: 'contract-kcca-2026' },
    update: {},
    create: {
      id:              'contract-kcca-2026',
      clientId:        kcca.id,
      contractStart:   new Date('2026-01-01'),
      contractEnd:     new Date('2026-12-31'),
      guardsRequired:  4,
      billingPerGuard: 850000, // UGX 850,000 per guard per month
      status:          ContractStatus.ACTIVE,
    },
  });
  console.log(`✅ Contract created for ${kcca.clientName}`);

  await prisma.contract.upsert({
    where: { id: 'contract-ura-2026' },
    update: {},
    create: {
      id:              'contract-ura-2026',
      clientId:        ura.id,
      contractStart:   new Date('2026-01-01'),
      contractEnd:     new Date('2026-12-31'),
      guardsRequired:  6,
      billingPerGuard: 900000, // UGX 900,000 per guard per month
      status:          ContractStatus.ACTIVE,
    },
  });
  console.log(`✅ Contract created for ${ura.clientName}`);

  // ── Guards ──────────────────────────────────────────────────────────────────

  const guardSeeds = [
    {
      id:               'guard-001',
      firstName:        'David',
      lastName:         'Wasswa',
      nationalId:       'CM9200010001XXXX',
      phone:            '+256-772-001001',
      dateOfBirth:      new Date('1992-03-15'),
      nextOfKinName:    'Sarah Nakirijja',
      nextOfKinPhone:   '+256-701-002002',
      bankName:         'Stanbic Bank Uganda',
      accountNumber:    'ENC:9030012345678', // encrypted placeholder
      salaryRate:       650000,
      employmentStatus: EmploymentStatus.ACTIVE,
      contractStart:    new Date('2024-06-01'),
      psoCertNumber:    'PSO-2024-0234',
      userId:           users[Role.GUARD].id,
    },
    {
      id:               'guard-002',
      firstName:        'Robert',
      lastName:         'Kiggundu',
      nationalId:       'CM9000020002XXXX',
      phone:            '+256-753-002002',
      dateOfBirth:      new Date('1990-07-22'),
      nextOfKinName:    'Agnes Nansubuga',
      nextOfKinPhone:   '+256-772-003003',
      bankName:         'Centenary Bank',
      accountNumber:    'ENC:1010098765432',
      salaryRate:       650000,
      employmentStatus: EmploymentStatus.ACTIVE,
      contractStart:    new Date('2023-09-01'),
      psoCertNumber:    'PSO-2023-0187',
    },
    {
      id:               'guard-003',
      firstName:        'Harriet',
      lastName:         'Nakibuuka',
      nationalId:       'CF9500030003XXXX',
      phone:            '+256-702-003003',
      dateOfBirth:      new Date('1995-11-08'),
      nextOfKinName:    'Moses Ssemwogerere',
      nextOfKinPhone:   '+256-753-004004',
      salaryRate:       650000,
      employmentStatus: EmploymentStatus.ACTIVE,
      contractStart:    new Date('2025-01-15'),
    },
    {
      id:               'guard-004',
      firstName:        'Francis',
      lastName:         'Opio',
      otherNames:       'Bonny',
      nationalId:       'CM8800040004XXXX',
      phone:            '+256-776-004004',
      dateOfBirth:      new Date('1988-04-30'),
      nextOfKinName:    'Mary Acen',
      nextOfKinPhone:   '+256-701-005005',
      bankName:         'DFCU Bank',
      accountNumber:    'ENC:2020087654321',
      salaryRate:       650000,
      employmentStatus: EmploymentStatus.ACTIVE,
      contractStart:    new Date('2022-11-01'),
      psoCertNumber:    'PSO-2022-0095',
    },
    {
      id:               'guard-005',
      firstName:        'Lydia',
      lastName:         'Atim',
      nationalId:       'CF9300050005XXXX',
      phone:            '+256-703-005005',
      dateOfBirth:      new Date('1993-09-19'),
      nextOfKinName:    'Peter Okwi',
      nextOfKinPhone:   '+256-772-006006',
      salaryRate:       650000,
      employmentStatus: EmploymentStatus.ACTIVE,
      contractStart:    new Date('2025-03-01'),
    },
  ];

  for (const seed of guardSeeds) {
    const guard = await prisma.guard.upsert({
      where: { nationalId: seed.nationalId },
      update: {},
      create: seed,
    });
    console.log(`✅ Guard created: ${guard.firstName} ${guard.lastName} (${guard.nationalId})`);
  }

  // ── Deployment History (sample entries) ─────────────────────────────────────

  const supervisor = users[Role.FIELD_SUPERVISOR];
  const guard1 = await prisma.guard.findUnique({ where: { nationalId: 'CM9200010001XXXX' } });
  const guard2 = await prisma.guard.findUnique({ where: { nationalId: 'CM9000020002XXXX' } });

  if (guard1 && guard2) {
    await prisma.deploymentHistory.upsert({
      where: { id: 'dh-001' },
      update: {},
      create: {
        id:           'dh-001',
        guardId:      guard1.id,
        siteId:       kccaSite.id,
        startDate:    new Date('2026-01-01'),
        shiftType:    ShiftType.DAY,
        supervisorId: supervisor.id,
      },
    });

    await prisma.deploymentHistory.upsert({
      where: { id: 'dh-002' },
      update: {},
      create: {
        id:           'dh-002',
        guardId:      guard2.id,
        siteId:       uraSite.id,
        startDate:    new Date('2026-01-01'),
        shiftType:    ShiftType.NIGHT,
        supervisorId: supervisor.id,
      },
    });
    console.log('✅ Deployment history records created');
  }

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

  for (const tmpl of letterTemplates) {
    await prisma.letterTemplate.upsert({
      where:  { letterType: tmpl.letterType },
      update: {},
      create: { ...tmpl, createdBy: directorId, isActive: true, version: 1 },
    });
  }
  console.log(`✅ ${letterTemplates.length} letter templates seeded`);

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
