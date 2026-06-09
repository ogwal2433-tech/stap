import fs from 'fs';
import path from 'path';

// Resolve from __dirname — works from both src/ (dev) and dist/ (compiled):
//   src/lib/templates/  → 5 levels up → workspace root
//   dist/lib/templates/ → 5 levels up → workspace root
function getLogoBase64(): string | null {
  try {
    const logoPath = path.resolve(__dirname, '../../../../../logo.jpg');
    const buf = fs.readFileSync(logoPath);
    return `data:image/jpeg;base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

export interface LetterHtmlOptions {
  refNumber:    string;
  issueDate:    string;
  body:         string;
  directorName: string;
  employeeName: string;
}

export function buildLetterHtml(opts: LetterHtmlOptions): string {
  const logo = getLogoBase64();

  // position:fixed elements are rendered on EVERY page by Puppeteer/Chromium.
  // This is the reliable way to get a background image (header + footer from
  // the letterhead) on all pages of a multi-page PDF.
  const bgElement = logo
    ? `<img class="page-bg" src="${logo}" alt="" />`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    @page {
      size: A4;
      margin: 0;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }

    /* ── Page background ─────────────────────────────────────────────────────
       position:fixed + full dimensions = Puppeteer renders this on every page.
       z-index:-1 keeps it behind all content.                               */
    .page-bg {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      object-fit: fill;
      z-index: -1;
    }

    body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 11pt;
      color: #1a1a1a;
      line-height: 1.65;
    }

    /* ── Letter content ──────────────────────────────────────────────────────
       No padding here — all page margins (top/right/bottom/left) are set in
       Puppeteer's page.pdf() margin option, which applies on EVERY page.    */
    .content {
      padding: 0;
    }

    .date-ref {
      display: flex;
      justify-content: space-between;
      font-size: 9.5pt;
      color: #444;
      margin-bottom: 20px;
    }

    .letter-body { margin-bottom: 10px; }
    .letter-body p { margin-bottom: 12px; }

    .sig-block {
      margin-top: 44px;
      display: flex;
      gap: 60px;
    }
    .sig-col { flex: 1; }
    .sig-line {
      border-top: 1px solid #333;
      width: 180px;
      margin-top: 36px;
      margin-bottom: 4px;
    }
    .sig-label { font-size: 9pt; color: #444; }
  </style>
</head>
<body>
  ${bgElement}

  <div class="content">
    <div class="date-ref">
      <span>Ref: ${opts.refNumber}</span>
      <span>${opts.issueDate}</span>
    </div>

    <div class="letter-body">
      ${opts.body}
    </div>

    <div class="sig-block">
      <div class="sig-col">
        <div class="sig-label">Employee</div>
        <div class="sig-line"></div>
        <div><strong>${opts.employeeName}</strong></div>
        <div class="sig-label">Signature &amp; Date: _______________</div>
      </div>
      <div class="sig-col">
        <div class="sig-label">For STAP Security Ltd</div>
        <div class="sig-line"></div>
        <div><strong>${opts.directorName}</strong></div>
        <div class="sig-label">Director &nbsp;&nbsp; Date: _______________</div>
      </div>
    </div>
  </div>
</body>
</html>`;
}
