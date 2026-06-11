export interface FrontCardData {
  systemId:    string;
  fullName:    string;
  position:    string;
  photoBase64: string;
  logoBase64:  string;
  expiryDate:  string;
}

export function buildFrontCard(data: FrontCardData): string {
  const idSuffix = data.systemId.replace(/^SSLG/i, '');

  const photoContent = data.photoBase64
    ? `<img src="${data.photoBase64}" style="width:100%;height:100%;object-fit:cover"/>`
    : `<div style="width:100%;height:100%;background:#eee;display:flex;align-items:center;justify-content:center;font-size:4pt;color:#999">PHOTO</div>`;

  const logoContent = data.logoBase64
    ? `<img src="${data.logoBase64}" style="width:10mm;height:10mm;object-fit:contain"/>`
    : `<div style="width:10mm;height:10mm;background:#1B3A6B;border-radius:50%"></div>`;

  return `<div style="width:85.6mm;height:54mm;display:flex;flex-direction:row;font-family:Arial,sans-serif;overflow:hidden;border-radius:3mm;border:0.3mm solid #ccc;">

  <!-- WHITE LEFT SECTION -->
  <div style="width:65%;height:100%;background:#ffffff;display:flex;flex-direction:column;padding:1.5mm 2mm;position:relative;">

    <!-- ID Number top centre -->
    <div style="text-align:center;font-weight:bold;font-size:5pt;letter-spacing:0.5px;margin-bottom:1.5mm;">
      STAP - ${idSuffix}
    </div>

    <!-- Photo + Fields row -->
    <div style="display:flex;flex-direction:row;gap:2mm;flex:1;">

      <!-- Guard photo -->
      <div style="width:18mm;min-width:18mm;border:0.5mm solid #999;overflow:hidden;border-radius:1mm;">
        ${photoContent}
      </div>

      <!-- Text fields -->
      <div style="flex:1;display:flex;flex-direction:column;justify-content:center;gap:1mm;">
        <div style="background:#f2aa20;color:#000;font-weight:bold;font-size:4.5pt;padding:0.8mm 1.5mm;border-radius:1mm;text-align:center;letter-spacing:0.3px;">
          STAFF IDENTITY CARD
        </div>
        <div style="font-size:4pt;line-height:1.6"><b>Name:</b> ${data.fullName}</div>
        <div style="font-size:4pt;line-height:1.6"><b>ID Number:</b> ${data.systemId}</div>
        <div style="font-size:4pt;line-height:1.6"><b>Position:</b> ${data.position}</div>
      </div>
    </div>

    <!-- Bottom: signatures + expiry -->
    <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:1.5mm;font-size:3.5pt;color:#333;border-top:0.3mm solid #ccc;padding-top:1mm;">
      <div>
        Issue's Signature<br/>
        <div style="border-bottom:0.3mm solid #000;width:15mm;margin-top:1.5mm;">&nbsp;</div>
      </div>
      <div style="text-align:right">
        Holder's Signature<br/>
        <div style="border-bottom:0.3mm solid #000;width:15mm;margin-top:1.5mm;margin-left:auto;">&nbsp;</div>
      </div>
    </div>
    <div style="font-size:3.5pt;color:#333;margin-top:0.8mm;">
      Expiry Date: ${data.expiryDate}
    </div>
  </div>

  <!-- ORANGE RIGHT STRIP -->
  <div style="width:35%;height:100%;background:#f2aa20;display:flex;flex-direction:column;align-items:center;justify-content:space-between;padding:2mm 1.5mm;border-left:0.5mm solid #000;">

    <!-- Shield logo top -->
    ${logoContent}

    <!-- Company name vertical -->
    <div style="writing-mode:vertical-rl;transform:rotate(180deg);font-size:7pt;font-weight:900;color:#000;letter-spacing:1px;text-align:center;flex:1;display:flex;align-items:center;justify-content:center;margin:2mm 0;">
      STAP SECURITY LTD
    </div>

    <!-- Tagline bottom -->
    <div style="font-size:4pt;color:#1B3A6B;text-align:center;font-style:italic;font-family:Georgia,serif;line-height:1.4;">
      Secure<br/>Your<br/>Future
    </div>
  </div>

</div>`;
}
