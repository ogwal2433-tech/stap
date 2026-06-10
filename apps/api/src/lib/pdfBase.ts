import puppeteer, { type Browser } from 'puppeteer';
import path from 'path';
import fs from 'fs';

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
// Tries src/assets/logo.png first (transparent PNG), then falls back to
// logo-removebg-preview.png at workspace root (4 levels up).

function getLogoBase64(): string {
  const candidates: Array<[string, string]> = [
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

// ── Header template ────────────────────────────────────────────────────────────
// Full-width amber band (~80mm).
// Left 1/3 : transparent logo PNG centred, amber shows through.
// Right 2/3 : company name, tagline, phone / email / website.

function buildHeaderHtml(logoBase64: string): string {
  const logoContent = logoBase64
    ? `<img src="${logoBase64}"
            alt="STAP Security Ltd"
            style="max-height:100%; max-width:100%; object-fit:contain;" />`
    : `<span style="font-weight:900; font-size:16pt; color:#1B3A6B;">STAP</span>`;

  return `
    <div style="
      width:              210mm;
      height:             80mm;
      background-color:   #f2aa20;
      display:            flex;
      flex-direction:     row;
      align-items:        stretch;
      font-family:        Arial, Helvetica, sans-serif;
      box-sizing:         border-box;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    ">

      <!-- LEFT: Logo (1/3) -->
      <div style="
        width:            33.33%;
        display:          flex;
        align-items:      center;
        justify-content:  center;
        padding:          10px;
        border-right:     1px solid rgba(255,255,255,0.5);
        box-sizing:       border-box;
      ">
        ${logoContent}
      </div>

      <!-- RIGHT: Company text (2/3) -->
      <div style="
        width:            66.67%;
        display:          flex;
        flex-direction:   column;
        justify-content:  center;
        padding:          12px 20px;
        gap:              4px;
        box-sizing:       border-box;
      ">
        <div style="
          font-family:    'Arial Black', Arial, sans-serif;
          font-size:      22pt;
          font-weight:    900;
          color:          #1B3A6B;
          letter-spacing: 1px;
          line-height:    1.1;
        ">STAP SECURITY LTD</div>

        <div style="
          font-size:  11pt;
          font-style: italic;
          color:      #1B3A6B;
          margin-top: 2px;
        ">Excellence in Security</div>

        <div style="
          margin-top:  8px;
          font-size:   9pt;
          color:       #1B3A6B;
          line-height: 1.6;
        ">
          &#128222; +256 700 467 551 &nbsp;|&nbsp; +256 787 417 404<br/>
          &#9993;&nbsp; staps218@gmail.com
        </div>

        <div style="font-size:9pt; color:#1B3A6B;">
          &#127760;&nbsp; www.stapsecurity.co.ug
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
      border-top: 1px solid #ccc;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 8.5pt;
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
// No @page { margin: 0 } here — that was overriding Puppeteer's CDP margins.
// Margin control is handled entirely by page.pdf({ margin }) below.

export function wrapContent(contentHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    @page { size: A4; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 11pt;
      color: #1a1a1a;
      line-height: 1.7;
    }
    .content { padding: 0; }
  </style>
</head>
<body>
  <div class="content">
    ${contentHtml}
  </div>
</body>
</html>`;
}

// ── Browser preview (dev only) ────────────────────────────────────────────────
// Returns a single HTML page that simulates the PDF layout in a browser.
// Header + footer are inlined (not Puppeteer templates) so you can open it
// directly at /dev/letter-preview and refresh after editing pdfBase.ts.

export function buildPreviewHtml(contentHtml: string): string {
  const logoBase64 = getLogoBase64();
  const header     = buildHeaderHtml(logoBase64);
  const footer     = buildFooterHtml();
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Letter Preview — STAP</title>
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
    }
    .page-header { flex-shrink: 0; }
    .page-body {
      flex: 1;
      padding: 3mm 15mm 4mm 18mm;
      font-size: 11pt;
      color: #1a1a1a;
      line-height: 1.7;
    }
    .page-footer { flex-shrink: 0; }
    @media print { body { background: none; padding: 0; } .page { box-shadow: none; } }
  </style>
</head>
<body>
  <div class="page">
    <div class="page-header">${header}</div>
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
}

/**
 * Render an A4 PDF with the STAP letterhead header and footer on every page.
 * Pass only the inner content HTML — this function wraps it and adds
 * the header/footer via Puppeteer's displayHeaderFooter mechanism.
 *
 * Default margins (50mm top, 14mm bottom) keep content within the white area.
 */
export async function renderToPdf(
  contentHtml: string,
  opts?: PdfRenderOptions,
): Promise<Buffer> {
  const logoBase64 = getLogoBase64();
  const html       = wrapContent(contentHtml);
  const browser    = await getBrowser();
  const page       = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: buildHeaderHtml(logoBase64),
      footerTemplate: buildFooterHtml(),
      margin: {
        top:    opts?.marginTop    ?? '83mm',   // 80mm header + 3mm gap
        bottom: opts?.marginBottom ?? '14mm',
        left:   opts?.marginLeft   ?? '18mm',
        right:  opts?.marginRight  ?? '15mm',
      },
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
