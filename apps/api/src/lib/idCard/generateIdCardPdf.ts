import fs   from 'fs';
import path from 'path';
import { renderRawPdf } from '../pdfBase';
import { buildFrontCard } from './frontCard';
import { buildBackCard }  from './backCard';
import { companyProfile } from '../../services/integrationSettings';

function toBase64(filePath: string): string {
  if (!fs.existsSync(filePath)) return '';
  const ext  = path.extname(filePath).replace('.', '');
  const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
  return `data:${mime};base64,${fs.readFileSync(filePath).toString('base64')}`;
}

export interface IdCardData {
  systemId:    string;
  fullName:    string;
  position:    string;
  photoPath:   string;
  expiryDate?: string;
}

export async function generateIdCardPdf(data: IdCardData): Promise<Buffer> {
  const logoPath    = path.join(__dirname, '../../assets/logo.png');
  const logoBase64  = toBase64(logoPath);
  const photoBase64 = toBase64(data.photoPath);

  const expiry = data.expiryDate
    ?? new Date(new Date().setFullYear(new Date().getFullYear() + 2))
        .toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });

  const frontHtml = buildFrontCard({
    systemId:    data.systemId,
    fullName:    data.fullName,
    position:    data.position,
    photoBase64,
    logoBase64,
    expiryDate:  expiry,
  });

  const backHtml = buildBackCard({ logoBase64, company: await companyProfile() });

  const pageHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body {
      width:       210mm;
      padding:     15mm;
      background:  #f5f5f5;
      font-family: Arial, sans-serif;
    }
    .label {
      font-size:    8pt;
      color:        #666;
      margin-bottom:2mm;
      font-weight:  bold;
    }
    .card-wrapper {
      margin-bottom: 10mm;
    }
  </style>
</head>
<body>
  <div class="card-wrapper">
    <div class="label">FRONT</div>
    ${frontHtml}
  </div>
  <div class="card-wrapper">
    <div class="label">BACK</div>
    ${backHtml}
  </div>
</body>
</html>`;

  return renderRawPdf(pageHtml, {
    format:          'A4',
    printBackground: true,
    margin: { top: '0', bottom: '0', left: '0', right: '0' },
  });
}
