import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { APP_NAME, APP_TAGLINE, COMPANY_NAME } from '@stap/shared';

/**
 * The product and the business are two different names that used to be spelled
 * the same. Staff chrome names the product; anything a guard or client reads
 * names the company they are employed by or contracted with. These pin that
 * split so a future rename cannot quietly put a product name on a document
 * addressed to a client.
 */
const src  = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');
const root = (p: string) => readFileSync(resolve(__dirname, '../..', p), 'utf8');

describe('brand constants', () => {
  it('names the product and the company separately', () => {
    expect(APP_NAME).toBe('Security360');
    expect(COMPANY_NAME).toBe('STAP Security Ltd');
    expect(APP_NAME).not.toBe(COMPANY_NAME);
    expect(APP_TAGLINE.length).toBeGreaterThan(0);
  });
});

describe('staff-facing chrome names the product', () => {
  it.each([
    ['components/layout/Sidebar.tsx'],
    ['components/layout/AppLayout.tsx'],
    ['pages/LoginPage.tsx'],
  ])('%s uses APP_NAME and no hardcoded product name', (file) => {
    const s = src(file);
    expect(s).toContain('APP_NAME');
    expect(s).not.toMatch(/>STAP Security</);
  });

  it('the browser tab is the product', () => {
    expect(root('index.html')).toContain(`<title>${APP_NAME}</title>`);
  });
});

describe('client- and guard-facing surfaces name the company', () => {
  it.each([
    ['components/layout/PortalLayout.tsx'],
    ['pages/attendance/CheckinPage.tsx'],
  ])('%s uses COMPANY_NAME', (file) => {
    expect(src(file)).toContain('COMPANY_NAME');
  });

  it('the client portal still says who is writing to them', () => {
    // A notice "from Security360" would leave a client unsure who sent it.
    const s = src('pages/portal/ClientPortalPage.tsx');
    expect(s).toContain('Notices from STAP Security');
    expect(s).not.toContain('Notices from Security360');
  });

  it('letter content keeps the legal entity', () => {
    expect(src('components/letters/HRLetterModal.tsx')).toContain('STAP Security Ltd');
  });
});
