export interface BackCardData {
  logoBase64: string;
}

export function buildBackCard(data: BackCardData): string {
  const logoContent = data.logoBase64
    ? `<img src="${data.logoBase64}" style="width:14mm;height:14mm;object-fit:contain"/>`
    : '';

  return `<div style="width:85.6mm;height:54mm;font-family:Arial,sans-serif;overflow:hidden;border-radius:3mm;border:0.3mm solid #ccc;display:flex;flex-direction:column;">

  <!-- BLACK TOP STRIP -->
  <div style="background:#1a1a1a;padding:1.5mm 3mm;text-align:center;">
    <span style="color:#e63946;font-family:Georgia,serif;font-style:italic;font-size:5.5pt;">
      This card is a property of
    </span>
  </div>

  <!-- WHITE MAIN AREA -->
  <div style="flex:1;background:#ffffff;display:flex;flex-direction:row;padding:2mm;gap:2mm;">

    <!-- LEFT: Logo block -->
    <div style="width:22mm;display:flex;flex-direction:column;align-items:flex-start;justify-content:center;gap:1mm;">
      ${logoContent}
      <div style="font-size:4pt;font-weight:bold;color:#000;">Stap Security Ltd</div>
      <div style="font-size:3.5pt;color:#555;line-height:1.5;">
        Secure Your Future<br/>
        24/7 Protection Guarantee
      </div>
    </div>

    <!-- RIGHT: Contact details -->
    <div style="flex:1;font-size:3.8pt;color:#111;display:flex;flex-direction:column;justify-content:center;gap:1.2mm;line-height:1.3;">
      <div><span style="color:#e63946">M</span>&nbsp; staps218@gmail.com</div>
      <div><span style="color:#1877f2">f</span>&nbsp; stap security ltd</div>
      <div><span style="color:#e1306c">&#9679;</span>&nbsp; stapsecurity</div>
      <div><span style="color:#1da1f2">&#9650;</span>&nbsp; twitter: @stapsecurity2</div>
      <div style="margin-top:0.8mm;"><span style="color:#0f9d58">&#9990;</span>&nbsp; +256 (0) 700 467 551</div>
      <div><span style="color:#25D366">&#9679;</span>&nbsp; +256 (0) 787 417 404</div>
      <div style="margin-top:0.8mm;"><span style="color:#e63946">&#9679;</span>&nbsp; P.O Box 111518 Kampala (U)</div>
    </div>
  </div>

  <!-- AMBER BOTTOM STRIP -->
  <div style="background:#f2aa20;padding:1.5mm 3mm;text-align:center;">
    <span style="font-family:Georgia,serif;font-style:italic;font-size:5pt;color:#1a1a1a;">
      If found please return to the above address
    </span>
  </div>

</div>`;
}
