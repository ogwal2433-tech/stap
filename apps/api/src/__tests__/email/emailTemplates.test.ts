import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderEmail, loginUrl } from '../../jobs/templates/emailTemplates';

const CREDENTIALS = {
  name:        'John Mugisha',
  contactName: 'John Mugisha',
  clientName:  'Acme Holdings',
  email:       'john@acme.com',
  password:    'Xk7mPq2rTv',
  loginUrl:    'https://stap.example.com/login',
};

describe('client-portal-welcome', () => {
  it('carries the credentials, the company and a way in', () => {
    const html = renderEmail('client-portal-welcome', 'ignored', CREDENTIALS);

    expect(html).toContain('John Mugisha');
    expect(html).toContain('Acme Holdings');
    expect(html).toContain('john@acme.com');
    expect(html).toContain('Xk7mPq2rTv');
    expect(html).toContain('https://stap.example.com/login');
    expect(html).toContain('Open the portal');
  });

  it('says what the portal is for', () => {
    const html = renderEmail('client-portal-welcome', 'ignored', CREDENTIALS);
    expect(html).toContain('invoices');
    expect(html).toContain('service requests');
  });

  it('tells them to change the password', () => {
    expect(renderEmail('client-portal-welcome', 'ignored', CREDENTIALS)).toMatch(/change this password/i);
  });

  it('omits the button rather than linking nowhere when there is no URL', () => {
    const html = renderEmail('client-portal-welcome', 'ignored', { ...CREDENTIALS, loginUrl: '' });
    expect(html).not.toContain('Open the portal');
    // The credentials still have to arrive.
    expect(html).toContain('Xk7mPq2rTv');
  });

  it('falls back to name when no contactName is supplied', () => {
    const { contactName: _omitted, ...rest } = CREDENTIALS;
    expect(renderEmail('client-portal-welcome', 'ignored', rest)).toContain('John Mugisha');
  });
});

describe('HTML injection', () => {
  // Client and contact names are free text typed by staff. Interpolating them
  // raw would let a name close the surrounding tag and rewrite the email —
  // including the sign-in link the recipient is being told to trust.
  it('escapes a name that contains markup', () => {
    const html = renderEmail('client-portal-welcome', 'ignored', {
      ...CREDENTIALS,
      clientName: '<script>alert(1)</script>',
      contactName: '"><a href="https://evil.example">click</a>',
    });

    expect(html).not.toContain('<script>');
    expect(html).not.toContain('href="https://evil.example"');
    expect(html).toContain('&lt;script&gt;');
  });

  it('escapes a crafted login URL rather than breaking out of the attribute', () => {
    const html = renderEmail('client-portal-welcome', 'ignored', {
      ...CREDENTIALS,
      loginUrl: 'https://ok.example/login" onclick="steal()',
    });
    expect(html).not.toContain('onclick="steal()"');
  });
});

describe('password-reset', () => {
  it('sends the new password and a sign-in link', () => {
    const html = renderEmail('password-reset', 'ignored', {
      name: 'John', email: 'john@acme.com', password: 'NewPass123', loginUrl: CREDENTIALS.loginUrl,
    });
    expect(html).toContain('NewPass123');
    expect(html).toContain('Sign in');
    expect(html).toContain(CREDENTIALS.loginUrl);
  });
});

describe('shared layout', () => {
  it.each(['welcome', 'client-portal-welcome', 'password-reset', 'notification'])(
    '%s carries the branding bar',
    (template) => {
      const html = renderEmail(template, 'Subject', CREDENTIALS);
      expect(html).toContain('#1B3A6B');
      expect(html).toContain('#F2AA20');
    },
  );

  it('still renders something readable for an unknown template', () => {
    const html = renderEmail('does-not-exist', 'Some subject', { a: 1 });
    expect(html).toContain('Some subject');
  });
});

describe('loginUrl()', () => {
  const original = process.env.FRONTEND_URL;
  beforeEach(() => { process.env.FRONTEND_URL = 'https://stap.example.com'; });
  afterEach(() => {
    if (original === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = original;
  });

  it('appends the login path', () => {
    expect(loginUrl()).toBe('https://stap.example.com/login');
  });

  it('does not double the slash on a trailing-slash base', () => {
    process.env.FRONTEND_URL = 'https://stap.example.com/';
    expect(loginUrl()).toBe('https://stap.example.com/login');
  });

  it('returns empty rather than a dead "/login" when unset', () => {
    delete process.env.FRONTEND_URL;
    expect(loginUrl()).toBe('');
  });
});
