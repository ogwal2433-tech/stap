import type { CompanyProfile } from '../../services/integrationSettings';

export interface BackCardData {
  logoBase64: string;
  company:    CompanyProfile;
}

const AMBER = '#f2aa20';
const NAVY  = '#1b3a6b';

const esc = (v: unknown): string =>
  String(v ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

/** One contact line, or nothing when the company has not set that detail. */
function contact(icon: string, iconColor: string, text: string | null): string {
  if (!text) return '';
  return `<div style="display:flex;align-items:center;gap:1.4mm;line-height:1.2;">
    <span style="color:${iconColor};font-size:6.5pt;width:3mm;flex-shrink:0;text-align:center;">${icon}</span>
    <span style="font-size:6.2pt;color:#111;">${esc(text)}</span>
  </div>`;
}

export function buildBackCard(data: BackCardData): string {
  const { company } = data;
  const logoContent = data.logoBase64
    ? `<img src="${data.logoBase64}" style="width:22mm;height:16mm;object-fit:contain"/>`
    : '';

  return `<div style="width:85.6mm;height:54mm;font-family:Arial,sans-serif;overflow:hidden;border-radius:3mm;border:0.3mm solid #ccc;display:flex;flex-direction:column;">

  <!-- BLACK TOP STRIP -->
  <div style="background:#1a1a1a;padding:1.6mm 3mm;text-align:center;flex-shrink:0;">
    <span style="color:#e63946;font-family:Georgia,serif;font-style:italic;font-size:8pt;">
      This card is a property of
    </span>
  </div>

  <!-- WHITE MAIN AREA -->
  <div style="flex:1;background:#ffffff;display:flex;flex-direction:row;padding:2mm 3mm;gap:3mm;overflow:hidden;">

    <!-- LEFT: Logo block -->
    <div style="width:24mm;flex-shrink:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0.8mm;">
      ${logoContent}
      <div style="font-size:7pt;font-weight:bold;color:${NAVY};text-align:center;line-height:1.1;">${esc(company.name)}</div>
      <div style="font-family:Georgia,serif;font-style:italic;font-size:5.6pt;color:#666;text-align:center;line-height:1.2;">
        Secure Your Future<br/>24/7 Protection Guarantee
      </div>
    </div>

    <!-- RIGHT: Contact details -->
    <div style="flex:1;min-width:0;display:flex;flex-direction:column;justify-content:space-evenly;">
      ${contact('&#9993;', '#e63946', company.email)}
      ${contact('f', '#1877f2', company.facebook)}
      ${contact('&#9679;', '#e1306c', company.instagram)}
      ${contact('&#9650;', '#1da1f2', company.twitter)}
      ${contact('&#9990;', '#0f9d58', company.phone)}
      ${contact('&#9679;', '#25D366', company.whatsapp)}
      ${contact('&#9679;', '#e63946', company.address)}
    </div>
  </div>

  <!-- AMBER BOTTOM STRIP -->
  <div style="background:${AMBER};padding:1.6mm 3mm;text-align:center;flex-shrink:0;">
    <span style="font-family:Georgia,serif;font-style:italic;font-size:7.5pt;color:#1a1a1a;">
      If found please return to the above address
    </span>
  </div>

</div>`;
}
