import puppeteer, { type Browser } from 'puppeteer';
import path from 'path';
import fs from 'fs';
import { companyProfile, type CompanyProfile } from '../services/integrationSettings';

// ── Singleton browser ──────────────────────────────────────────────────────────

let _browser: Browser | null = null;
let _browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (_browser && _browser.connected) return _browser;
  if (_browserPromise) return _browserPromise;
  _browserPromise = puppeteer
    .launch({
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    })
    .then((b) => {
      _browser = b;
      _browserPromise = null;
      b.on('disconnected', () => { _browser = null; _browserPromise = null; });
      return b;
    })
    .catch((err) => { _browserPromise = null; throw err; });
  return _browserPromise;
}

// ── Logo loader ────────────────────────────────────────────────────────────────

function getLogoBase64(preferredFile?: string): string {
  // A named file in src/assets wins when the caller asks for one (e.g. the
  // payroll export ships the tiger logo); anything missing falls through to the
  // deployment's default logo rather than losing the header image entirely.
  const preferredMime = preferredFile?.match(/jpe?g$/i) ? 'image/jpeg' : 'image/png';
  const preferred = preferredFile
    ? [[path.resolve(__dirname, '../assets', preferredFile), preferredMime] as [string, string]]
    : [];
  const candidates: Array<[string, string]> = [
    ...preferred,
    [path.resolve(__dirname, '../assets/logo.png'),                    'image/png'],
    [path.resolve(__dirname, '../../../../logo-removebg-preview.png'), 'image/png'],
    [path.resolve(__dirname, '../../../../logo.jpg'),                  'image/jpeg'],
  ];
  for (const [p, mime] of candidates) {
    try {
      const buf = fs.readFileSync(p);
      return `data:${mime};base64,${buf.toString('base64')}`;
    } catch {
      // try next candidate
    }
  }
  console.warn('[PDF] No logo file found — header will use text-only fallback');
  return '';
}

// ── Watermark loader ───────────────────────────────────────────────────────────
// Uses image.png (copied to src/assets/watermark.png) as the page watermark.

function getWatermarkBase64(): string {
  const candidates: Array<[string, string]> = [
    [path.resolve(__dirname, '../assets/watermark.png'), 'image/png'],
    [path.resolve(__dirname, '../../../../image.png'),   'image/png'],
  ];
  for (const [p, mime] of candidates) {
    try {
      const buf = fs.readFileSync(p);
      return `data:${mime};base64,${buf.toString('base64')}`;
    } catch {
      // try next candidate
    }
  }
  return '';
}

// ── Header template ────────────────────────────────────────────────────────────
// Full-width amber band (~53mm — 2/3 of original 80mm).
// Left 1/3 : transparent logo PNG centred, amber shows through.
// Right 2/3 : company name, tagline, phone / email / website.

// Letterhead icons, held apart from the markup so the contact rows below read
// as data rather than a wall of paths.
const PIN_SVG       = '<svg xmlns="http://www.w3.org/2000/svg" width="9" height="12" viewBox="0 0 24 30" fill="white" style="display:inline-block;vertical-align:middle;margin-right:3px;"><path d="M12 0C7.6 0 4 3.6 4 8c0 5.5 8 18 8 18S20 13.5 20 8c0-4.4-3.6-8-8-8zm0 11c-1.7 0-3-1.3-3-3s1.3-3 3-3 3 1.3 3 3-1.3 3-3 3z"/></svg>';
const FACEBOOK_SVG  = '<svg xmlns="http://www.w3.org/2000/svg" width="9" height="9" viewBox="0 0 24 24" fill="white" style="display:inline-block;vertical-align:middle;margin-right:2px;"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>';
const INSTAGRAM_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="9" height="9" viewBox="0 0 24 24" fill="white" style="display:inline-block;vertical-align:middle;margin-right:2px;"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><rect x="7" y="7" width="10" height="10" rx="3" ry="3" fill="#f2aa20"/><circle cx="12" cy="12" r="3" fill="white"/><circle cx="17" cy="7" r="1.5" fill="white"/></svg>';
const TWITTER_SVG   = '<svg xmlns="http://www.w3.org/2000/svg" width="9" height="9" viewBox="0 0 24 24" fill="white" style="display:inline-block;vertical-align:middle;margin-right:2px;"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.747l7.73-8.835L1.254 2.25H8.08l4.264 5.634L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>';
const PHONE_SVG     = '<svg xmlns="http://www.w3.org/2000/svg" width="9" height="9" viewBox="0 0 24 24" fill="white" style="display:inline-block;vertical-align:middle;margin-right:2px;"><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.58.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1C10.29 21 3 13.71 3 4.5c0-.55.45-1 1-1H7.5c.55 0 1 .45 1 1 0 1.25.2 2.46.57 3.58.11.35.03.74-.24 1.02L6.6 10.8z"/></svg>';
const WHATSAPP_SVG  = '<svg xmlns="http://www.w3.org/2000/svg" width="9" height="9" viewBox="0 0 24 24" fill="white" style="display:inline-block;vertical-align:middle;margin-right:2px;"><path d="M12 2C6.48 2 2 6.48 2 12c0 1.85.5 3.58 1.38 5.07L2 22l5.07-1.36C8.44 21.51 10.19 22 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2zm.01 18c-1.63 0-3.15-.45-4.46-1.23l-.32-.19-3.27.87.88-3.21-.21-.33A7.95 7.95 0 0 1 4 12c0-4.42 3.59-8 8.01-8 4.43 0 7.99 3.58 7.99 8s-3.57 8-7.99 8zm4.39-5.96c-.24-.12-1.41-.69-1.63-.77-.22-.08-.38-.12-.54.12-.16.24-.62.77-.76.93-.14.16-.28.18-.52.06-.24-.12-1.01-.37-1.93-1.18-.71-.63-1.19-1.41-1.33-1.65-.14-.24-.01-.37.11-.49.11-.11.24-.28.36-.42.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.54-1.29-.74-1.77-.19-.46-.39-.4-.54-.41h-.46c-.16 0-.42.06-.64.3-.22.24-.84.82-.84 2s.86 2.32.98 2.48c.12.16 1.69 2.58 4.1 3.62.57.25 1.02.39 1.37.5.57.18 1.09.15 1.5.09.46-.07 1.41-.58 1.61-1.13.2-.56.2-1.03.14-1.13-.06-.1-.22-.16-.46-.28z"/></svg>';

function buildHeaderHtml(logoBase64: string, company: CompanyProfile, logoOnly = false): string {
  const logoContent = logoBase64
    ? `<img src="${logoBase64}"
            alt="${company.name}"
            style="width:100%; height:100%; object-fit:contain; display:block;" />`
    : `<span style="font-weight:900; font-size:11pt; color:#1B3A6B;">${company.nameUpper.slice(0, 4)}</span>`;

  // Logo-only band: same height and background as the full letterhead so the
  // content padding in wrapContent still lines up, but nothing but the logo.
  if (logoOnly) {
    return `<div style="
        width:              210mm;
        height:             53mm;
        background-color:   #f2aa20;
        display:            flex;
        align-items:        center;
        justify-content:    center;
        box-sizing:         border-box;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      ">
        <div style="height:44mm;max-width:80%;">${logoContent}</div>
      </div>`;
  }

  // Each contact row is dropped when nothing has been configured for it, rather
  // than printing a placeholder: a wrong address on a letter is worse than none.
  const icon = (svg: string, text: string) =>
    `${svg}<span style="vertical-align:middle;">${text}</span>`;

  const addressLine = [
    company.address ? icon(PIN_SVG, company.address) : '',
    company.email   ? `&nbsp;&nbsp;&#9993;&nbsp;<span style="vertical-align:middle;">${company.email}</span>` : '',
  ].join('');

  const socialLine = [
    company.facebook  ? icon(FACEBOOK_SVG,  company.facebook)  : '',
    company.instagram ? icon(INSTAGRAM_SVG, company.instagram) : '',
    company.twitter   ? icon(TWITTER_SVG,   company.twitter)   : '',
  ].filter(Boolean).join('&nbsp;&nbsp;');

  const phoneLine = [
    company.phone    ? icon(PHONE_SVG,    company.phone)    : '',
    company.whatsapp ? icon(WHATSAPP_SVG, company.whatsapp) : '',
  ].filter(Boolean).join('&nbsp;&nbsp;');

  return `<div style="
      width:              210mm;
      height:             53mm;
      background-color:   #f2aa20;
      display:            flex;
      flex-direction:     row;
      align-items:        stretch;
      font-family:        Arial, Helvetica, sans-serif;
      box-sizing:         border-box;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    ">

      <!-- LEFT: Logo (1/4) — fills the full column box -->
      <div style="
        width:            25%;
        overflow:         hidden;
        box-sizing:       border-box;
      ">
        ${logoContent}
      </div>

      <!-- RIGHT: Company text (3/4) — reverse-cone: each row smaller than the one above -->
      <div style="
        width:            75%;
        display:          flex;
        flex-direction:   column;
        justify-content:  center;
        align-items:      center;
        padding:          8px 13px;
        gap:              5px;
        box-sizing:       border-box;
      ">
        <!-- Row 1 — largest -->
        <div style="
          font-family:    'Arial Black', Arial, sans-serif;
          font-size:      32pt;
          font-weight:    900;
          color:          #ffffff;
          letter-spacing: 1.5px;
          line-height:    1.05;
          text-align:     center;
          white-space:    nowrap;
        ">${company.nameUpper}</div>

        <!-- Row 2 — address + email -->
        <div style="font-size:10pt;font-weight:400;color:#ffffff;text-align:center;white-space:nowrap;line-height:1;">
          ${addressLine}
        </div>

        <!-- Row 3 — social handles -->
        <div style="font-size:8.5pt;font-weight:400;color:#ffffff;text-align:center;white-space:nowrap;line-height:1;">
          ${socialLine}
        </div>

        <!-- Row 4 — phone / whatsapp -->
        <div style="font-size:8pt;font-weight:400;color:#ffffff;text-align:center;white-space:nowrap;line-height:1;">
          ${phoneLine}
        </div>

        <!-- Row 5 — tagline -->
        <div style="font-size:7.5pt;font-weight:700;font-style:italic;color:#ffffff;text-align:center;white-space:nowrap;line-height:1;">
          24/7 Protection Guarantee
        </div>
      </div>

    </div>`;
}

// ── Footer template ────────────────────────────────────────────────────────────

function buildFooterHtml(): string {
  return `
    <div style="
      width: 210mm;
      padding: 3mm 18mm;
      border-top: 3px solid #f2aa20;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 8.5pt;
      font-weight: 700;
      font-style: italic;
      color: #555;
      text-align: center;
      box-sizing: border-box;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    ">
      Start Protecting Your Future
    </div>`;
}

// ── Content wrapper ────────────────────────────────────────────────────────────
// @page { margin: 0 } makes the content area = the full page, so
// position:fixed;top:0 lands at the true page edge (not offset by a margin).
// body { padding } then keeps letter text from overlapping the header/footer.
// No CDP margin is passed to page.pdf(), so there is no @page vs CDP conflict.

export function wrapContent(
  contentHtml:   string,
  headerHtml?:   string,
  footerHtml?:   string,
  paddingTop?:   string,
  paddingBottom?: string,
  paddingLeft?:  string,
  paddingRight?: string,
  showWatermark = true,
): string {
  const pt = paddingTop    ?? '56mm';
  const pb = paddingBottom ?? '14mm';
  const pl = paddingLeft   ?? '18mm';
  const pr = paddingRight  ?? '15mm';

  const watermarkBase64 = getWatermarkBase64();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    @page { size: A4; margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 11pt;
      color: #1a1a1a;
      line-height: 1.7;
      padding: ${pt} ${pr} ${pb} ${pl};
    }
  </style>
</head>
<body>
  ${headerHtml ? `<div style="position:fixed;top:0;left:0;width:100%;z-index:1;">${headerHtml}</div>` : ''}
  ${footerHtml ? `<div style="position:fixed;bottom:0;left:0;width:100%;z-index:1;">${footerHtml}</div>` : ''}
  ${showWatermark && watermarkBase64 ? `<div style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:130mm;z-index:0;pointer-events:none;opacity:0.07;"><img src="${watermarkBase64}" style="width:100%;height:auto;display:block;" /></div>` : ''}
  <div style="position:relative;z-index:2;">${contentHtml}</div>
</body>
</html>`;
}

// ── Browser preview (dev only) ────────────────────────────────────────────────
// Returns a single HTML page that simulates the PDF layout in a browser.
// Header + footer are inlined (not Puppeteer templates) so you can open it
// directly at /dev/letter-preview and refresh after editing pdfBase.ts.

export async function buildPreviewHtml(contentHtml: string): Promise<string> {
  const company         = await companyProfile();
  const logoBase64      = getLogoBase64();
  const watermarkBase64 = getWatermarkBase64();
  const header          = buildHeaderHtml(logoBase64, company);
  const footer          = buildFooterHtml();
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Letter Preview — ${company.name}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #e0e0e0; font-family: Arial, Helvetica, sans-serif; padding: 24px; }
    .page {
      width: 210mm;
      min-height: 297mm;
      margin: 0 auto;
      background: #fff;
      box-shadow: 0 4px 24px rgba(0,0,0,.25);
      display: flex;
      flex-direction: column;
      position: relative;
      overflow: hidden;
    }
    .page-header { flex-shrink: 0; overflow: hidden; line-height: 0; font-size: 0; }
    .page-watermark {
      position: absolute;
      top: 50%; left: 50%;
      transform: translate(-50%, -50%);
      width: 130mm;
      opacity: 0.07;
      pointer-events: none;
      z-index: 0;
    }
    .page-watermark img { width: 100%; height: auto; display: block; }
    .page-body {
      flex: 1;
      padding: 3mm 15mm 4mm 18mm;
      font-size: 11pt;
      color: #1a1a1a;
      line-height: 1.7;
      position: relative;
      z-index: 2;
    }
    .page-footer { flex-shrink: 0; position: relative; z-index: 2; }
    @media print { body { background: none; padding: 0; } .page { box-shadow: none; } }
  </style>
</head>
<body>
  <div class="page">
    <div class="page-header">${header}</div>
    ${watermarkBase64 ? `<div class="page-watermark"><img src="${watermarkBase64}" alt="" /></div>` : ''}
    <div class="page-body">${contentHtml}</div>
    <div class="page-footer">${footer}</div>
  </div>
</body>
</html>`;
}

// ── Render functions ──────────────────────────────────────────────────────────

export interface PdfRenderOptions {
  marginTop?:    string;
  marginBottom?: string;
  marginLeft?:   string;
  marginRight?:  string;
  /** Filename inside src/assets used for the letterhead logo of this render only. */
  logoFile?:     string;
  /** Set false to render without the page watermark. Defaults to true. */
  watermark?:    boolean;
  /** Set true for a logo-only header band — no company name or contact rows. */
  logoOnly?:     boolean;
}

/**
 * Render an A4 PDF with the company letterhead header and footer on every page.
 * Pass only the inner content HTML — this function wraps it and adds
 * the header/footer via Puppeteer's displayHeaderFooter mechanism.
 *
 * Default margins (50mm top, 14mm bottom) keep content within the white area.
 */
export async function renderToPdf(
  contentHtml: string,
  opts?: PdfRenderOptions,
): Promise<Buffer> {
  const company    = await companyProfile();
  const logoBase64 = getLogoBase64(opts?.logoFile);
  const html       = wrapContent(
    contentHtml,
    buildHeaderHtml(logoBase64, company, opts?.logoOnly),
    buildFooterHtml(),
    opts?.marginTop,    // becomes body padding-top
    opts?.marginBottom,
    opts?.marginLeft,
    opts?.marginRight,
    opts?.watermark !== false,
  );
  const browser = await getBrowser();
  const page    = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      // Margins are driven by @page CSS inside wrapContent — no CDP margin here.
    });
    return Buffer.from(pdf);
  } finally {
    await page.close();
  }
}

/**
 * Render a PDF from a complete HTML document without any letterhead.
 * Used for non-A4 documents (e.g. wallet-sized ID cards).
 */
export async function renderRawPdf(
  fullHtml: string,
  pdfOptions: {
    width?:           string;
    height?:          string;
    format?:          string;
    printBackground?: boolean;
    margin?: { top?: string; right?: string; bottom?: string; left?: string };
  },
): Promise<Buffer> {
  const browser = await getBrowser();
  const page    = await browser.newPage();
  try {
    await page.setContent(fullHtml, { waitUntil: 'load', timeout: 10_000 });
    const pdf = await page.pdf(pdfOptions as Parameters<typeof page.pdf>[0]);
    return Buffer.from(pdf);
  } finally {
    await page.close();
  }
}
