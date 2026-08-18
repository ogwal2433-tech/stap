import { describe, it, expect } from 'vitest';
import { HR_LETTER_TEMPLATES } from '../../db/hrLetterTemplates';
import { LETTER_TYPES, TEMPLATE_TYPES_BY_LETTER_TYPE } from '@stap/shared';

const byType = (t: string) => HR_LETTER_TEMPLATES.find(x => x.letterType === t)!;
const text   = (t: string) => byType(t).content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('HR letter templates', () => {
  it('covers each of the printed forms', () => {
    expect(HR_LETTER_TEMPLATES.map(t => t.letterType).sort()).toEqual([
      'CLEARANCE_FORM', 'DESERTION_NOTICE', 'EXPULSION_LETTER',
      'REINSTATEMENT_LETTER', 'RESIGNATION_ACCEPTANCE', 'SICK_LEAVE_APPROVAL',
    ]);
  });

  it('registers every type in LETTER_TYPES, or it could not be saved or edited', () => {
    for (const t of HR_LETTER_TEMPLATES) {
      expect(LETTER_TYPES).toContain(t.letterType as never);
    }
  });

  it('makes every type reachable from the letter composer', () => {
    const mapped = new Set(Object.values(TEMPLATE_TYPES_BY_LETTER_TYPE).flat());
    for (const t of HR_LETTER_TEMPLATES) {
      expect(mapped.has(t.letterType)).toBe(true);
    }
  });

  it('uses only the three tokens the composer substitutes', () => {
    // Anything else would reach the printed letter as a literal {token}.
    const allowed = new Set(['{guard_name}', '{date}', '{company_name}']);
    for (const t of HR_LETTER_TEMPLATES) {
      for (const token of t.content.match(/\{[a-z_]+\}/g) ?? []) {
        expect(allowed.has(token), `${t.letterType} uses ${token}`).toBe(true);
      }
    }
  });

  it('clears the minimum length the save schema enforces', () => {
    for (const t of HR_LETTER_TEMPLATES) expect(t.content.length).toBeGreaterThan(50);
  });
});

// The wording is contractual — these assert the clauses that carry obligations,
// so a later edit cannot quietly drop a penalty or a required step.
describe('wording taken from the printed forms', () => {
  it('desertion notice states the automatic dismissal', () => {
    expect(text('DESERTION_NOTICE')).toContain('failure to report constitutes');
    expect(text('DESERTION_NOTICE')).toMatch(/desertion/);
    expect(text('DESERTION_NOTICE')).toMatch(/terminated/);
  });

  it('resignation acceptance keeps the UGX 50,000 fine and the equipment condition', () => {
    const t = text('RESIGNATION_ACCEPTANCE');
    expect(t).toContain('UGX 50,000');
    expect(t).toContain('uniforms and equipment are returned');
    expect(t).toContain('Clearance:');
  });

  it('sick leave keeps the medical report requirement', () => {
    const t = text('SICK_LEAVE_APPROVAL');
    expect(t).toContain('medical report from a recognized medical facility');
    expect(t).toContain('extension');
  });

  it('expulsion keeps the property return and final dues clauses', () => {
    const t = text('EXPULSION_LETTER');
    expect(t).toContain('return all company property');
    expect(t).toContain('final dues after clearance');
  });

  it('clearance form carries all ten checklist rows', () => {
    const rows = byType('CLEARANCE_FORM').content.match(/<tr>\s*<td/g) ?? [];
    expect(rows).toHaveLength(10);
    const t = text('CLEARANCE_FORM');
    for (const item of ['Uniform Shirt', 'Uniform Trousers', 'Boots', 'Baton', 'ID Card',
                        'Salary Balance', 'Advances / Loans', 'Fines / Deductions']) {
      expect(t).toContain(item);
    }
  });

  it('clearance form keeps the employee declaration and three approvals', () => {
    const t = text('CLEARANCE_FORM');
    expect(t).toContain('returned all company property in good');
    expect(t).toContain('Stores Officer Signature');
    expect(t).toContain('Accounts Officer Signature');
    expect(t).toContain('Operations Manager Signature');
  });

  it('every letter to a guard is addressed and signed off', () => {
    for (const t of HR_LETTER_TEMPLATES) {
      if (t.letterType === 'CLEARANCE_FORM') continue; // a form, not a letter
      expect(text(t.letterType)).toContain('Dear {guard_name}');
      expect(text(t.letterType)).toContain('Approved by:');
    }
  });
});
