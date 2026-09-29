import { describe, expect, it } from 'vitest';
import { buildLetterHtml } from '../lib/templates/letterBase';

describe('letter company branding', () => {
  it('uses the supplied company name in the PDF content', () => {
    const html = buildLetterHtml({
      refNumber: 'REF-1', issueDate: '1 January 2026', body: '<p>Letter body</p>',
      directorName: 'Director, Example Security Ltd', employeeName: 'A Guard',
      companyName: 'Example Security Ltd',
    });
    expect(html).toContain('For Example Security Ltd');
    expect(html).not.toContain('For Security360 Ltd');
  });
});
