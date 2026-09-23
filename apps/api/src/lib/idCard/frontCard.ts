import { COMPANY_NAME_UPPER } from '../../config/branding';

export interface FrontCardData {
  systemId:    string;
  fullName:    string;
  position:    string;
  photoBase64: string;
  logoBase64:  string;
  expiryDate:  string;
}

const AMBER = '#f2aa20';
const NAVY  = '#1b3a6b';

/**
 * Long names have to stay on one line — the field is sized for the common case
 * and steps down rather than wrapping into the field below it.
 */
function nameFontSize(fullName: string): string {
  if (fullName.length <= 18) return '9pt';
  if (fullName.length <= 26) return '7.5pt';
  if (fullName.length <= 34) return '6.2pt';
  return '5.4pt';
}

function field(label: string, value: string, valueStyle = ''): string {
  return `<div style="display:flex;flex-direction:column;">
    <div style="font-size:4.6pt;font-weight:bold;color:${AMBER};letter-spacing:0.4px;line-height:1;text-transform:uppercase;">${label}</div>
    <div style="font-size:7.5pt;font-weight:bold;color:${NAVY};line-height:1.15;${valueStyle}">${value}</div>
  </div>`;
}

export function buildFrontCard(data: FrontCardData): string {
  const displayId = data.systemId;

  const logoImg = data.logoBase64
    ? `<img src="${data.logoBase64}" style="width:100%;height:100%;object-fit:contain;filter:brightness(0) invert(1);"/>`
    : `<div style="width:100%;height:100%;background:#1B3A6B;border-radius:1mm;"></div>`;

  const photoImg = data.photoBase64
    ? `<img src="${data.photoBase64}" style="width:100%;height:100%;object-fit:cover;object-position:center top;"/>`
    : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:5pt;color:#999;letter-spacing:0.5px;">PHOTO</div>`;

  const signature = (caption: string) => `<div style="flex:1;">
    <div style="border-bottom:0.3mm solid #333;height:3.5mm;"></div>
    <div style="font-size:4.2pt;color:#555;margin-top:0.4mm;">${caption}</div>
  </div>`;

  return `<div style="width:85.6mm;height:54mm;display:flex;flex-direction:column;font-family:Arial,Helvetica,sans-serif;overflow:hidden;border-radius:2mm;border:0.3mm solid #bbb;">

  <!--════ HEADER BAND — full width amber ════-->
  <div style="width:100%;height:14mm;background:${AMBER};display:flex;flex-direction:row;align-items:center;padding:0 3mm;gap:2.5mm;flex-shrink:0;">

    <!-- Shield logo -->
    <div style="width:11mm;height:11mm;flex-shrink:0;">
      ${logoImg}
    </div>

    <!-- Company name + tagline -->
    <div style="display:flex;flex-direction:column;justify-content:center;">
      <div style="font-size:12pt;font-weight:900;color:#ffffff;letter-spacing:0.6px;line-height:1.05;text-shadow:0.3mm 0.3mm 0 rgba(0,0,0,0.2);">
        ${COMPANY_NAME_UPPER}
      </div>
      <div style="font-family:Georgia,serif;font-style:italic;font-size:7.5pt;color:#ffffff;margin-top:0.3mm;letter-spacing:0.2px;line-height:1.1;">
        Secure Your Future
      </div>
    </div>

  </div>

  <!--════ WHITE BODY — three columns ════-->
  <div style="width:100%;flex:1;display:flex;flex-direction:row;background:#ffffff;overflow:hidden;">

    <!--── LEFT COLUMN: Rotated ID number ──-->
    <div style="width:9mm;flex-shrink:0;display:flex;align-items:center;justify-content:center;background:${NAVY};">
      <div style="writing-mode:vertical-rl;transform:rotate(180deg);font-size:8pt;font-weight:bold;color:#ffffff;letter-spacing:1.6px;white-space:nowrap;">
        ${displayId}
      </div>
    </div>

    <!--── MIDDLE COLUMN: Photo ──────────-->
    <div style="width:24mm;flex-shrink:0;display:flex;align-items:center;justify-content:center;padding:1.6mm 1.5mm;">
      <div style="width:21mm;height:100%;border:0.5mm solid ${AMBER};border-radius:0.8mm;overflow:hidden;background:#f0f0f0;">
        ${photoImg}
      </div>
    </div>

    <!--── RIGHT SECTION: Fields ─────────-->
    <div style="flex:1;display:flex;flex-direction:column;padding:1.6mm 2.5mm 1.6mm 0.5mm;min-width:0;">

      <!-- STAFF IDENTITY CARD amber pill -->
      <div style="background:${AMBER};border-radius:3mm;text-align:center;font-size:6.5pt;font-weight:bold;letter-spacing:0.6px;padding:0.9mm 0;color:#ffffff;flex-shrink:0;">
        STAFF IDENTITY CARD
      </div>

      <!-- Field rows — spread to fill the column, no dead space at the bottom -->
      <div style="flex:1;display:flex;flex-direction:column;justify-content:space-evenly;padding:0.8mm 0;min-width:0;">
        ${field('Name', data.fullName, `font-size:${nameFontSize(data.fullName)};white-space:nowrap;overflow:hidden;`)}
        ${field('Position', data.position, 'font-size:7pt;white-space:nowrap;overflow:hidden;')}
        <div style="display:flex;gap:2mm;">
          <div style="flex:1;min-width:0;">
            ${field('ID Number', displayId, "font-family:'Courier New',monospace;font-size:7.5pt;letter-spacing:0.3px;")}
          </div>
          <div style="flex:1;min-width:0;">
            ${field('Valid Until', data.expiryDate, 'font-size:7pt;')}
          </div>
        </div>
      </div>

      <!-- Signature row -->
      <div style="display:flex;gap:3mm;flex-shrink:0;">
        ${signature("Issuer's Signature")}
        ${signature("Holder's Signature")}
      </div>

    </div>

  </div>

</div>`;
}
