import { describe, expect, it } from 'vitest';
import { buildFooterHtml, buildHeaderHtml } from '../lib/pdfBase';
import type { CompanyProfile } from '../services/integrationSettings';

// The header an invoice carries. These are asserted on the markup rather than a
// rendered PDF because the band is built from what an administrator typed in
// Settings, and a header that prints white-on-white or drops the phone number is
// a document nobody can pay or call back.
const TIGER: CompanyProfile = {
  name: 'Tiger Security Services Ltd',
  nameUpper: 'TIGER SECURITY SERVICES LTD',
  shortName: 'Tiger',
  logoUrl: '',
  registrationNumber: 'BR-1234',
  taxId: 'TIN-1234',
  email: 'billing@tiger.co.ug',
  phone: '+256 414 000 000',
  whatsapp: '+256 700 000 000',
  website: 'www.tiger.co.ug',
  address: 'Plot 12, Nakwero Road, Kampala',
  facebook: null,
  instagram: null,
  twitter: null,
  bankName: 'DFCU BANK',
  bankBranchName: null,
  bankBranchNo: null,
  bankAccountName: null,
  bankAccount: '01010290290300',
};

describe('pdfBase plain header (invoice letterhead)', () => {
  const plain = buildHeaderHtml('data:image/jpeg;base64,LOGO', TIGER, { plainHeader: true });

  it('drops the amber band for the page’s own white', () => {
    expect(plain).not.toContain('#f2aa20');
    expect(plain).toContain('#ffffff');
    // Text has to be dark to be seen on white: the amber band's white type would
    // have printed an empty header.
    expect(plain).not.toContain('color:#ffffff');
    expect(plain).toContain('#1B3A6B');
  });

  it('holds the company details an invoice has to answer', () => {
    for (const detail of [TIGER.nameUpper, TIGER.address, TIGER.email, TIGER.phone, TIGER.website]) {
      expect(plain).toContain(detail);
    }
  });

  it('pushes the logo to the left of the company details', () => {
    expect(plain.indexOf('<img')).toBeLessThan(plain.indexOf(TIGER.nameUpper));
    // The logo column is pinned to the start and the details take the rest of the
    // width against the right margin — nothing is centred the way the amber
    // logo-only band centres its image.
    expect(plain).not.toContain('justify-content');
    expect(plain).toContain('text-align:right');
  });

  it('keeps the band 53mm tall so the body padding still clears it', () => {
    // wrapContent defaults to 56mm of body padding; a taller header pushes the
    // last line of an invoice onto an empty second page.
    expect(plain).toContain('53mm');
    expect(plain).not.toContain('56mm');
  });

  it('leaves out a detail that has not been configured', () => {
    const sparse = buildHeaderHtml('data:image/jpeg;base64,LOGO', { ...TIGER, address: null, website: '', phone: '   ' }, { plainHeader: true });
    expect(sparse).toContain(TIGER.nameUpper);
    expect(sparse).toContain(TIGER.email);
    expect(sparse).not.toContain('Nakwero');
    expect(sparse).not.toContain('www.tiger.co.ug');
    expect(sparse).not.toContain('+256 414');
    // Not even the row it would have sat in.
    expect(sparse.match(/font-size:9pt/g)).toHaveLength(1);
  });

  it('escapes what an administrator typed into settings', () => {
    const hostile = buildHeaderHtml('data:image/jpeg;base64,LOGO', { ...TIGER, name: '<script>x</script>', nameUpper: '<script>x</script>' }, { plainHeader: true });
    expect(hostile).not.toContain('<script>x</script>');
    expect(hostile).toContain('&lt;script&gt;');
  });

  it('still falls back to short text when there is no logo image', () => {
    const noLogo = buildHeaderHtml('', TIGER, { plainHeader: true });
    expect(noLogo).not.toContain('<img');
    expect(noLogo).toContain('TIGE');
  });
});

describe('pdfBase header bands left untouched', () => {
  it('keeps the amber logo-only band for the payroll schedule', () => {
    const logoOnly = buildHeaderHtml('data:image/jpeg;base64,LOGO', TIGER, { logoOnly: true });
    expect(logoOnly).toContain('#f2aa20');
    expect(logoOnly).toContain('justify-content:    center');
    // Nothing but the logo: no company name and no contact rows.
    expect(logoOnly).not.toContain(TIGER.nameUpper);
    expect(logoOnly).not.toContain(TIGER.email);
  });

  it('keeps the full amber letterhead for documents that ask for neither variant', () => {
    const band = buildHeaderHtml('data:image/jpeg;base64,LOGO', TIGER);
    expect(band).toContain('#f2aa20');
    expect(band).toContain(TIGER.nameUpper);
    expect(band).toContain('24/7 Protection Guarantee');
  });
});

describe('pdfBase footer line', () => {
  it('carries the credit the invoice asks for', () => {
    expect(buildFooterHtml('POWERED BY: Biiteek Globe Ltd')).toContain('POWERED BY: Biiteek Globe Ltd');
  });

  it('keeps the letterhead line for every document that names none', () => {
    // The invoice changed its closing line; a payroll schedule or letter that
    // never asked must not silently follow it.
    expect(buildFooterHtml()).toContain('Start Protecting Your Future');
    expect(buildFooterHtml()).not.toContain('Biiteek');
  });

  it('escapes the line it is given', () => {
    expect(buildFooterHtml('A & B <b>')).toContain('A &amp; B &lt;b&gt;');
  });
});
