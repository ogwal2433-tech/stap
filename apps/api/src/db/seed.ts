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
