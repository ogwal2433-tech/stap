export interface BackCardData {
  logoBase64: string;
}

const AMBER = '#f2aa20';
const NAVY  = '#1b3a6b';

function contact(icon: string, iconColor: string, text: string): string {
  return `<div style="display:flex;align-items:center;gap:1.4mm;line-height:1.2;">
    <span style="color:${iconColor};font-size:6.5pt;width:3mm;flex-shrink:0;text-align:center;">${icon}</span>
    <span style="font-size:6.2pt;color:#111;">${text}</span>
  </div>`;
}

export function buildBackCard(data: BackCardData): string {
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
      <div style="font-size:7pt;font-weight:bold;color:${NAVY};text-align:center;line-height:1.1;">Stap Security Ltd</div>
      <div style="font-family:Georgia,serif;font-style:italic;font-size:5.6pt;color:#666;text-align:center;line-height:1.2;">
        Secure Your Future<br/>24/7 Protection Guarantee
      </div>
    </div>

    <!-- RIGHT: Contact details -->
    <div style="flex:1;min-width:0;display:flex;flex-direction:column;justify-content:space-evenly;">
      ${contact('&#9993;', '#e63946', 'staps218@gmail.com')}
      ${contact('f', '#1877f2', 'stap security ltd')}
      ${contact('&#9679;', '#e1306c', 'stapsecurity')}
      ${contact('&#9650;', '#1da1f2', '@stapsecurity2')}
      ${contact('&#9990;', '#0f9d58', '+256 (0) 700 467 551')}
      ${contact('&#9679;', '#25D366', '+256 (0) 787 417 404')}
      ${contact('&#9679;', '#e63946', 'P.O Box 111518 Kampala (U)')}
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
