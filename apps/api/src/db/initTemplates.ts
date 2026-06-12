/**
 * initTemplates.ts
 *
 * Upserts the default letter templates that every environment needs.
 * Safe to run on every deploy — update:{} means existing admin-customised
 * templates are never overwritten; only missing entries are inserted.
 *
 * Run via:  node dist/db/initTemplates.js
 */

import prisma from './prisma';

const TEMPLATES: Array<{ letterType: string; name: string; content: string }> = [
  {
    letterType: 'WARNING',
    name: 'Warning Letter',
    content: `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:700px;margin:auto;padding:40px">
<p style="text-align:right">{date}</p>
<p><strong>Ref:</strong> {ref_number}</p>
<h3 style="text-align:center">WARNING LETTER</h3>
<p>To: <strong>{guard_name}</strong></p>
<p>Position: {position}</p>
<p>Dear {guard_name},</p>
<p>This letter serves as a formal warning regarding <strong>{reason}</strong>. You are expected to improve your conduct immediately. Further violations may result in suspension or termination.</p>
<br><p>Approved by:</p>
<p><strong>{director_name}</strong><br>Director, {company_name}</p>
<br><p>Guard Signature: _________________________ &nbsp;&nbsp; Date: _____________</p>
</body></html>`,
  },
  {
    letterType: 'SUSPENSION',
    name: 'Suspension Letter',
    content: `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:700px;margin:auto;padding:40px">
<p style="text-align:right">{date}</p>
<p><strong>Ref:</strong> {ref_number}</p>
<h3 style="text-align:center">SUSPENSION LETTER</h3>
<p>To: <strong>{guard_name}</strong></p>
<p>Position: {position}</p>
<p>Dear {guard_name},</p>
<p>You are hereby suspended from duty pending investigation. This suspension takes effect immediately and is without pay unless otherwise stated.</p>
<p><strong>Reason:</strong> {reason}</p>
<br><p>Approved by:</p>
<p><strong>{director_name}</strong><br>Director, {company_name}</p>
</body></html>`,
  },
  {
    letterType: 'TERMINATION_NOTICE',
    name: 'Termination Letter',
    content: `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:700px;margin:auto;padding:40px">
<p style="text-align:right">{date}</p>
<p><strong>Ref:</strong> {ref_number}</p>
<h3 style="text-align:center">TERMINATION LETTER</h3>
<p>To: <strong>{guard_name}</strong></p>
<p>Position: {position}</p>
<p>Dear {guard_name},</p>
<p>We regret to inform you that your employment with {company_name} is terminated effective <strong>{date}</strong> due to <strong>{reason}</strong>. Please return all company property immediately.</p>
<br><p>Approved by:</p>
<p><strong>{director_name}</strong><br>Director, {company_name}</p>
</body></html>`,
  },
  {
    letterType: 'TERMINATION',
    name: 'Termination Letter (HR Flow)',
    content: `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:700px;margin:auto;padding:40px">
<p style="text-align:right">{date}</p>
<p><strong>Ref:</strong> {ref_number}</p>
<h3 style="text-align:center">TERMINATION LETTER</h3>
<p>To: <strong>{guard_name}</strong></p>
<p>Position: {position}</p>
<p>Dear {guard_name},</p>
<p>We regret to inform you that your employment with {company_name} is terminated effective <strong>{date}</strong> due to <strong>{reason}</strong>. Please return all company property immediately.</p>
<br><p>Approved by:</p>
<p><strong>{director_name}</strong><br>Director, {company_name}</p>
</body></html>`,
  },
  {
    letterType: 'REINSTATEMENT',
    name: 'Reinstatement Letter',
    content: `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:700px;margin:auto;padding:40px">
<p style="text-align:right">{date}</p>
<p><strong>Ref:</strong> {ref_number}</p>
<h3 style="text-align:center">REINSTATEMENT LETTER</h3>
<p>To: <strong>{guard_name}</strong></p>
<p>Position: {position}</p>
<p>Dear {guard_name},</p>
<p>Following a review, you are hereby reinstated to your position effective <strong>{date}</strong>. We expect full compliance with company policies moving forward.</p>
<br><p>Approved by:</p>
<p><strong>{director_name}</strong><br>Director, {company_name}</p>
</body></html>`,
  },
  {
    letterType: 'COMMITMENT_AGREEMENT',
    name: 'Employment Commitment Agreement',
    content: `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:700px;margin:auto;padding:40px">
<p style="text-align:right">{date}</p>
<h3 style="text-align:center">EMPLOYMENT COMMITMENT AGREEMENT</h3>
<p>This agreement is entered into between <strong>{company_name}</strong> and <strong>{guard_name}</strong>.</p>
<p>The employee agrees to abide by all company policies and codes of conduct during the period of employment.</p>
<br><p>Employee Signature: _________________________ &nbsp;&nbsp; Date: _____________</p>
<p>For {company_name}: _________________________ &nbsp;&nbsp; Date: _____________</p>
</body></html>`,
  },
  {
    letterType: 'CLEARANCE_FORM',
    name: 'Guard / Staff Clearance Form',
    content: `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:700px;margin:auto;padding:40px">
<p style="text-align:right">{date}</p>
<h3 style="text-align:center">STAP SECURITY LTD — GUARD / STAFF CLEARANCE FORM</h3>
<p><strong>Name:</strong> {guard_name} &nbsp;&nbsp; <strong>ID:</strong> {ref_number}</p>
<p>This is to certify that the above-named staff has been cleared by all departments.</p>
<br>
<table style="width:100%;border-collapse:collapse">
  <tr><th style="border:1px solid #ccc;padding:6px">Department</th><th style="border:1px solid #ccc;padding:6px">Signature</th><th style="border:1px solid #ccc;padding:6px">Date</th></tr>
  <tr><td style="border:1px solid #ccc;padding:6px">Operations</td><td style="border:1px solid #ccc;padding:6px">&nbsp;</td><td style="border:1px solid #ccc;padding:6px">&nbsp;</td></tr>
  <tr><td style="border:1px solid #ccc;padding:6px">Finance</td><td style="border:1px solid #ccc;padding:6px">&nbsp;</td><td style="border:1px solid #ccc;padding:6px">&nbsp;</td></tr>
  <tr><td style="border:1px solid #ccc;padding:6px">HR</td><td style="border:1px solid #ccc;padding:6px">&nbsp;</td><td style="border:1px solid #ccc;padding:6px">&nbsp;</td></tr>
  <tr><td style="border:1px solid #ccc;padding:6px">Director</td><td style="border:1px solid #ccc;padding:6px">&nbsp;</td><td style="border:1px solid #ccc;padding:6px">&nbsp;</td></tr>
</table>
</body></html>`,
  },
  {
    letterType: 'SICK_LEAVE',
    name: 'Sick Leave Approval Letter',
    content: `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:700px;margin:auto;padding:40px">
<p style="text-align:right">{date}</p>
<p><strong>Ref:</strong> {ref_number}</p>
<h3 style="text-align:center">SICK LEAVE APPROVAL LETTER</h3>
<p>To: <strong>{guard_name}</strong></p>
<p>Your application for sick leave has been approved. Please return to duty with a valid medical certificate.</p>
<br><p>Approved by:</p>
<p><strong>{director_name}</strong><br>Director, {company_name}</p>
</body></html>`,
  },
  {
    letterType: 'RESIGNATION_ACCEPTANCE',
    name: 'Immediate Resignation Acceptance Letter',
    content: `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:700px;margin:auto;padding:40px">
<p style="text-align:right">{date}</p>
<p><strong>Ref:</strong> {ref_number}</p>
<h3 style="text-align:center">IMMEDIATE RESIGNATION ACCEPTANCE LETTER</h3>
<p>To: <strong>{guard_name}</strong></p>
<p>We acknowledge receipt of your resignation letter and hereby accept your immediate resignation effective <strong>{date}</strong>. Please complete the clearance process before your departure.</p>
<br><p>Approved by:</p>
<p><strong>{director_name}</strong><br>Director, {company_name}</p>
</body></html>`,
  },
  {
    letterType: 'EXPULSION',
    name: 'Expulsion Letter',
    content: `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:700px;margin:auto;padding:40px">
<p style="text-align:right">{date}</p>
<p><strong>Ref:</strong> {ref_number}</p>
<h3 style="text-align:center">EXPULSION LETTER</h3>
<p>To: <strong>{guard_name}</strong></p>
<p>Following a disciplinary review, you are hereby expelled from {company_name} effective <strong>{date}</strong>. Please complete the clearance process immediately.</p>
<br><p>Approved by:</p>
<p><strong>{director_name}</strong><br>Director, {company_name}</p>
</body></html>`,
  },
];

async function initTemplates() {
  console.log('📄  Initialising default letter templates…');

  const existing = await prisma.letterTemplate.findMany({ select: { letterType: true } });
  const existingTypes = new Set(existing.map((t) => t.letterType));
  let inserted = 0;

  for (const tmpl of TEMPLATES) {
    await prisma.letterTemplate.upsert({
      where:  { letterType: tmpl.letterType },
      update: {},  // never overwrite admin-customised content
      create: { ...tmpl, createdBy: 'system', isActive: true, version: 1 },
    });
    if (!existingTypes.has(tmpl.letterType)) inserted++;
  }

  console.log(`✅ Letter templates — ${inserted} new, ${TEMPLATES.length - inserted} already existed.`);
}

initTemplates()
  .catch((err) => { console.error('❌ initTemplates failed:', err); process.exit(1); })
  .finally(() => prisma.$disconnect());
