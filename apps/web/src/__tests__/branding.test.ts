import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  resolveBranding,
  DEFAULT_APP_NAME,
  DEFAULT_COMPANY_NAME,
  DEFAULT_APP_TAGLINE,
  COMPANY_BRANDING_DEFAULTS,
  resolveCompanyBranding,
} from '@stap/shared';
import { APP_NAME, APP_TAGLINE, COMPANY_NAME, FILE_PREFIX } from '../lib/branding';

/**
 * The product and the business are two different names that used to be spelled
 * the same. Staff chrome names the product; anything a guard or client reads
 * names the company they are employed by or contracted with. These pin that
 * split so a future rename cannot quietly put a product name on a document
 * addressed to a client.
 *
 * The product name is now per-deployment, because one host runs more than one
 * branding of this code. So these also pin that an unconfigured build is still
 * the original — a second brand must not rename the first one by existing.
 */
const src  = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');
const root = (p: string) => readFileSync(resolve(__dirname, '../..', p), 'utf8');

describe('brand constants', () => {
  it('names the product and the company separately', () => {
    expect(DEFAULT_APP_NAME).toBe('STAP Security');
    expect(DEFAULT_COMPANY_NAME).toBe('STAP Security Ltd');
    expect(DEFAULT_APP_NAME).not.toBe(DEFAULT_COMPANY_NAME);
    expect(DEFAULT_APP_TAGLINE.length).toBeGreaterThan(0);
  });

  it('an unconfigured build is the original brand', () => {
    // The existing deployment sets none of these and must not change.
    expect(APP_NAME).toBe(DEFAULT_APP_NAME);
    expect(COMPANY_NAME).toBe(DEFAULT_COMPANY_NAME);
    expect(APP_TAGLINE).toBe(DEFAULT_APP_TAGLINE);
  });
});

describe('resolveBranding()', () => {
  it('takes the product name from the environment', () => {
    expect(resolveBranding({ VITE_APP_NAME: 'Security360' }).appName).toBe('Security360');
    expect(resolveBranding({ APP_NAME: 'Security360' }).appName).toBe('Security360');
  });

  it('renaming the product does not rename the company', () => {
    // The entity on the invoice is a separate decision from the name on the tab.
    const b = resolveBranding({ VITE_APP_NAME: 'Security360' });
    expect(b.appName).toBe('Security360');
    expect(b.companyName).toBe(DEFAULT_COMPANY_NAME);
  });

  it('derives the upper-case company from the company, not the default', () => {
    const b = resolveBranding({ COMPANY_NAME: 'Security360 Ltd' });
    expect(b.companyNameUpper).toBe('SECURITY360 LTD');
  });

  it('ignores blank and whitespace-only values rather than showing nothing', () => {
    for (const value of ['', '   ']) {
      expect(resolveBranding({ VITE_APP_NAME: value }).appName).toBe(DEFAULT_APP_NAME);
    }
  });

  it('trims a value that arrived with stray whitespace', () => {
    expect(resolveBranding({ VITE_APP_NAME: '  Security360 ' }).appName).toBe('Security360');
  });

  it('prefers the VITE_ form, which is the only one a browser bundle sees', () => {
    const b = resolveBranding({ VITE_APP_NAME: 'FromVite', APP_NAME: 'FromNode' });
    expect(b.appName).toBe('FromVite');
  });

  it('an empty environment is the default brand', () => {
    expect(resolveBranding().appName).toBe(DEFAULT_APP_NAME);
  });

  it('company branding resolves blank overrides to safe defaults', () => {
    expect(resolveCompanyBranding({ company_name: '   ' }).company_name).toBe(COMPANY_BRANDING_DEFAULTS.company_name);
    expect(resolveCompanyBranding({ company_name: ' Example Ltd ' }).company_name).toBe('Example Ltd');
  });
});

describe('download filenames follow the deployment', () => {
  it('is the product name with nothing a filesystem dislikes', () => {
    expect(FILE_PREFIX).toBe(APP_NAME.replace(/[^A-Za-z0-9]+/g, '_'));
    expect(FILE_PREFIX).not.toMatch(/[^A-Za-z0-9_]/);
  });

  it('is derived, so a rebrand renames the downloads with it', () => {
    // Pinning a literal here would let the files keep the old brand after a
    // rename — which is how they came to say STAP on a Security360 stack.
    const s = src('lib/exportToExcel.ts');
    expect(s).toContain('FILE_PREFIX');
    expect(s).not.toMatch(/`STAP_/);
  });

  it('the login card no longer carries a copyright line', () => {
    // Removed on request: the card names the product, and the legal entity
    // belongs on documents rather than the sign-in screen.
    const s = src('pages/LoginPage.tsx');
    expect(s).not.toContain('All rights reserved');
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
    // Read from the per-deployment resolver, not the shared defaults — via
    // @stap/shared the name would be frozen at whatever this repo ships.
    expect(s).toMatch(/from '(\.\.\/)+lib\/branding'/);
  });

  it('the browser tab is templated, not a literal', () => {
    const html = root('index.html');
    expect(html).toContain('<title>%APP_NAME%</title>');
    expect(html).not.toContain('<title>STAP Security</title>');
  });

  it('the build substitutes the placeholder', () => {
    // Otherwise the tab ships reading "%APP_NAME%".
    expect(root('vite.config.ts')).toContain('transformIndexHtml');
    expect(root('vite.config.ts')).toContain('%APP_NAME%');
  });
});

describe('client- and guard-facing surfaces name the company', () => {
  it.each([
    ['components/layout/PortalLayout.tsx'],
    ['pages/attendance/CheckinPage.tsx'],
  ])('%s reads the runtime company setting', (file) => {
    expect(src(file)).toContain('useCompanyBranding');
  });

  it('the client portal still says who is writing to them', () => {
    // A notice that named the platform rather than the business would leave a
    // client unsure who sent it. The name is now read per deployment rather
    // than written into the page, so what is pinned is that it is the company.
    const s = src('pages/portal/ClientPortalPage.tsx');
    expect(s).toMatch(/Notices from \{companyName\}/);
    expect(s).not.toContain('Notices from STAP Security');
  });

  it('letter content keeps the legal entity', () => {
    // Still the company rather than the product, but resolved per deployment:
    // a second brand on the same host must sign its own letters.
    const s = src('components/letters/HRLetterModal.tsx');
    expect(s).toContain('useCompanyBranding');
    expect(s).toContain('company_name: companyBranding.company_name');
    expect(s).not.toContain('STAP Security Ltd');
  });
});
