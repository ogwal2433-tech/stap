export interface FrontCardData {
  systemId:    string;
  fullName:    string;
  position:    string;
  photoBase64: string;
  logoBase64:  string;
  expiryDate:  string;
}

export function buildFrontCard(data: FrontCardData): string {
  const displayNumber = data.systemId.replace(/^[A-Z]+/i, '').padStart(3, '0');
  const displayId     = `STAP - ${displayNumber}`;

  const logoImg = data.logoBase64
    ? `<img src="${data.logoBase64}" style="width:100%;height:100%;object-fit:contain;filter:brightness(0) invert(1);"/>`
    : `<div style="width:12mm;height:12mm;background:#1B3A6B;border-radius:1mm;"></div>`;

  const photoImg = data.photoBase64
    ? `<img src="${data.photoBase64}" style="width:100%;height:100%;object-fit:cover;object-position:center top;"/>`
    : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:3.5pt;color:#aaa;">PHOTO</div>`;

  return `<div style="width:85.6mm;height:54mm;display:flex;flex-direction:column;font-family:Arial,Helvetica,sans-serif;overflow:hidden;border-radius:2mm;border:0.3mm solid #bbb;">

  <!--════ HEADER BAND — full width amber ════-->
  <div style="width:100%;height:16mm;background:#f2aa20;display:flex;flex-direction:row;align-items:center;padding:1.5mm 2.5mm;gap:2mm;flex-shrink:0;">

    <!-- Shield logo -->
    <div style="width:10mm;height:10mm;flex-shrink:0;">
      ${logoImg}
    </div>

    <!-- Company name + tagline -->
    <div style="display:flex;flex-direction:column;justify-content:center;">
      <div style="font-size:9pt;font-weight:900;color:#ffffff;letter-spacing:0.8px;line-height:1.1;text-shadow:0.3mm 0.3mm 0 rgba(0,0,0,0.2);">
        STAP SECURITY LTD
      </div>
      <div style="font-family:Georgia,serif;font-style:italic;font-size:6pt;color:#ffffff;margin-top:0.5mm;letter-spacing:0.3px;">
        Secure Your Future
      </div>
    </div>

  </div>

  <!--════ WHITE BODY — three columns ════-->
  <div style="width:100%;flex:1;display:flex;flex-direction:row;background:#ffffff;">

    <!--── LEFT COLUMN: Rotated ID number ──-->
    <div style="width:15mm;flex-shrink:0;display:flex;align-items:center;justify-content:center;padding:1.5mm;border-right:0.2mm solid #ddd;">
      <div style="writing-mode:vertical-rl;transform:rotate(180deg);font-size:5.5pt;font-weight:bold;color:#111;letter-spacing:1px;border:0.4mm solid #555;padding:1.5mm 1mm;white-space:nowrap;">
        ${displayId}
      </div>
    </div>

    <!--── MIDDLE COLUMN: Photo ──────────-->
    <div style="width:20mm;flex-shrink:0;display:flex;align-items:center;justify-content:center;padding:1.5mm 1mm;border-right:0.2mm solid #ddd;">
      <div style="width:18mm;height:28mm;border:0.5mm solid #555;border-radius:0.5mm;overflow:hidden;background:#f0f0f0;">
        ${photoImg}
      </div>
    </div>

    <!--── RIGHT SECTION: Fields ─────────-->
    <div style="flex:1;display:flex;flex-direction:column;padding:1.5mm 2mm;">

      <!-- STAFF IDENTITY CARD amber pill -->
      <div style="background:#f2aa20;border-radius:3mm;text-align:center;font-size:4.5pt;font-weight:bold;letter-spacing:0.5px;padding:0.8mm 0;margin-bottom:1.5mm;color:#111;width:100%;">
        STAFF IDENTITY CARD
      </div>

      <!-- Field rows -->
      <div style="flex:1;font-size:3.8pt;color:#111;line-height:1.8;">
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="font-weight:bold;white-space:nowrap;vertical-align:top;padding-right:1mm;width:30%;">Name:</td>
            <td style="vertical-align:top;">${data.fullName}</td>
          </tr>
          <tr>
            <td style="font-weight:bold;white-space:nowrap;vertical-align:top;padding-right:1mm;">ID Number:</td>
            <td style="vertical-align:top;">${displayId}</td>
          </tr>
          <tr>
            <td style="font-weight:bold;white-space:nowrap;vertical-align:top;padding-right:1mm;">Position:</td>
            <td style="vertical-align:top;">${data.position}</td>
          </tr>
        </table>
      </div>

      <!-- Signature row -->
      <div style="display:flex;justify-content:space-between;border-top:0.2mm solid #ccc;padding-top:1mm;margin-top:0.5mm;">
        <div style="font-size:3pt;color:#444;">
          <div style="border-bottom:0.3mm solid #333;width:11mm;margin-bottom:0.5mm;height:3mm;">&nbsp;</div>
          Issue's Signature
        </div>
        <div style="font-size:3pt;color:#444;text-align:center;">
          <div style="border-bottom:0.3mm solid #333;width:11mm;margin-bottom:0.5mm;height:3mm;margin-left:auto;margin-right:auto;">&nbsp;</div>
          Holder's Signature
        </div>
      </div>

    </div>

  </div>

</div>`;
}
