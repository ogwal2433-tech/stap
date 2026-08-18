/**
 * initTemplates.ts
 *
 * Adds the HR letter templates to an environment that has already been seeded.
 * Safe to run on every deploy: existing rows are left exactly as they are, so
 * wording an admin has edited is never overwritten — only missing templates are
 * inserted.
 *
 * Run via:  pnpm --filter api letters:init
 *
 * Previously this file carried its own copy of ten templates whose letterType
 * strings were not in LETTER_TYPES, so anything it inserted could not be edited
 * through the API or selected in the letter composer. It now shares the single
 * definition used by the seed.
 */

import prisma from './prisma';
import { HR_LETTER_TEMPLATES } from './hrLetterTemplates';

async function initTemplates() {
  console.log('📄  Adding HR letter templates…');

  const existing     = await prisma.letterTemplate.findMany({ select: { letterType: true } });
  const existingTypes = new Set(existing.map((t) => t.letterType));

  // Whoever set the system up owns templates created this way; fall back to the
  // literal 'system' when there is no Director yet.
  const director = await prisma.user.findFirst({
    where:  { role: 'DIRECTOR' },
    select: { id: true },
  });
  const createdBy = director?.id ?? 'system';

  let inserted = 0;
  for (const tmpl of HR_LETTER_TEMPLATES) {
    if (existingTypes.has(tmpl.letterType)) continue;
    await prisma.letterTemplate.create({
      data: { ...tmpl, createdBy, isActive: true, version: 1 },
    });
    inserted++;
    console.log(`   + ${tmpl.letterType} — ${tmpl.name}`);
  }

  console.log(
    `✅ HR letter templates — ${inserted} added, ` +
    `${HR_LETTER_TEMPLATES.length - inserted} already present.`,
  );
}

initTemplates()
  .catch((err) => { console.error('❌ initTemplates failed:', err); process.exit(1); })
  .finally(() => prisma.$disconnect());
