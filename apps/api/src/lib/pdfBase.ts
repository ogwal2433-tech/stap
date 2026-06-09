import puppeteer, { type Browser } from 'puppeteer';
import path from 'path';
import fs from 'fs';

// ── Singleton browser ──────────────────────────────────────────────────────────
// Reused across requests — launching Chromium per-request is the main timeout cause.

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

// ── Letterhead ────────────────────────────────────────────────────────────────
// logo.jpg lives at workspace root — 4 levels up from src/lib/ (or dist/lib/).

function getLetterheadBase64(): string {
  try {
    const logoPath = path.resolve(__dirname, '../../../../logo.jpg');
    const buf = fs.readFileSync(logoPath);
    return `data:image/jpeg;base64,${buf.toString('base64')}`;
  } catch {
    console.warn('[PDF] logo.jpg not found at workspace root — generating without letterhead background');
    return '';
  }
}

// ── HTML wrapper ──────────────────────────────────────────────────────────────

export function wrapWithLetterhead(contentHtml: string): string {
  const letterhead = getLetterheadBase64();
  // position:fixed elements are rendered on EVERY page by Puppeteer/Chromium.
  // This is the reliable way to get a background image on all pages of a multi-page PDF.
  const bgElement = letterhead
    ? `<img class="page-bg" src="${letterhead}" alt="" />`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    @page { size: A4; margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    .page-bg {
      position: fixed;
      top: 0; left: 0;
      width: 100%; height: 100%;
      object-fit: fill;
      z-index: -1;
    }
    body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 11pt;
      color: #1a1a1a;
      line-height: 1.7;
    }
    /* All page margins are set via Puppeteer's page.pdf() option — applies on every page. */
    .content { padding: 0; }
  </style>
</head>
<body>
  ${bgElement}
  <div class="content">
    ${contentHtml}
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
 * Render an A4 PDF with the STAP letterhead background.
 * Pass only the inner content HTML — this function wraps it with the full page structure.
 * Default margins (47mm top, 17mm bottom) keep content within the letterhead white area.
 */
export async function renderToPdf(
  contentHtml: string,
  opts?: PdfRenderOptions,
): Promise<Buffer> {
  const html    = wrapWithLetterhead(contentHtml);
  const browser = await getBrowser();
  const page    = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top:    opts?.marginTop    ?? '47mm',
        bottom: opts?.marginBottom ?? '17mm',
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
 * Render a PDF from a complete HTML document without any letterhead wrapping.
 * Used for non-A4 documents (e.g. wallet-sized ID cards) that supply their own layout.
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
