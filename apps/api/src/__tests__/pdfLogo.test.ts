import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveLogoBase64 } from '../lib/pdfBase';

describe('PDF company logo fallback', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('uses the embedded logo when the configured URL is blank', async () => {
    const fallback = vi.fn(() => 'embedded-logo');
    expect(await resolveLogoBase64('   ', fallback)).toBe('embedded-logo');
    expect(fallback).toHaveBeenCalledOnce();
  });

  it('uses the embedded logo when the configured URL returns 404', async () => {
    const fallback = vi.fn(() => 'embedded-logo');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 404 })));
    expect(await resolveLogoBase64('https://example.test/logo.png', fallback)).toBe('embedded-logo');
    expect(fallback).toHaveBeenCalledOnce();
  });
});
