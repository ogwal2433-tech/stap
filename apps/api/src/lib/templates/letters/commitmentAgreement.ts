import { DEFAULT_COMPANY_NAME } from '@security360/shared';

export interface CommitmentAgreementData {
  guardName:     string;
  startDate:     string;
  minimumPeriod: string;
}

export function buildCommitmentAgreementBody(data: CommitmentAgreementData, companyName = DEFAULT_COMPANY_NAME): string {
  return `
<p>Dear <strong>${data.guardName}</strong>,</p>

<p>We are pleased to offer you employment as a Security Guard with ${companyName}. To ensure stability and continuity in our security operations, we require a commitment from you regarding the minimum service period.</p>

<p>By signing this agreement, you acknowledge and commit to the following terms:</p>

<p style="font-weight:bold;margin-top:14px;">1. Minimum Service Period:</p>
<ul style="margin:4px 0 10px 24px;line-height:1.6;">
  <li>You agree to work with ${companyName} for a minimum of <strong>${data.minimumPeriod}</strong> from <strong>${data.startDate}</strong>, unless otherwise terminated in accordance with company policies.</li>
</ul>

<p style="font-weight:bold;margin-top:14px;">2. Resignation or Termination Before Committed Period:</p>
<ul style="margin:4px 0 10px 24px;line-height:1.6;">
  <li>If you choose to resign before completing the agreed period, you must provide one month's written notice.</li>
  <li>You will not be entitled to any salary payment for the days or weeks worked prior to resignation.</li>
  <li>You will be required to pay a non-refundable fee of <strong>UGX 50,000</strong> as a training cost, and an additional <strong>UGX 30,000</strong> for meals and accommodation during training.</li>
  <li>You will also be required to return all company-issued items (e.g., uniform, boots, belt, ID card, etc.). Failure to do so will result in additional charges equivalent to the value of the missing items.</li>
  <li>Regardless of whether you officially resign, if you leave before completing your committed period, you will be classified as a deserter. The company reserves the right to take legal action and report the desertion to relevant authorities or agencies.</li>
  <li>Any exceptions to this clause may be reviewed on a case-by-case basis at the company's sole discretion.</li>
</ul>

<p style="font-weight:bold;margin-top:14px;">3. Code of Conduct &amp; Performance:</p>
<ul style="margin:4px 0 10px 24px;line-height:1.6;">
  <li>You agree to comply with all company policies, maintain professional conduct, and meet job performance expectations.</li>
  <li>Any form of misconduct, breach of company rules, or poor performance may result in disciplinary action, including termination without notice.</li>
</ul>

<p style="font-weight:bold;margin-top:14px;">4. Training &amp; Professional Development:</p>
<ul style="margin:4px 0 10px 24px;line-height:1.6;">
  <li>The company will provide training programs to enhance your skills and professionalism.</li>
  <li>You are required to attend and actively participate in all assigned training programs. Failure to comply may result in disciplinary action or dismissal.</li>
</ul>

<p style="font-weight:bold;margin-top:14px;">5. Confidentiality &amp; Security Ethics:</p>
<ul style="margin:4px 0 10px 24px;line-height:1.6;">
  <li>You are required to maintain confidentiality in all security-related matters and uphold the highest level of integrity in your role.</li>
  <li>Any sharing of confidential information or unethical behavior will result in disciplinary action or legal consequences.</li>
</ul>

<p style="margin-top:14px;">By signing below, you confirm that you have read, understood, and agreed to the above terms and conditions, including the financial obligations and penalties should you fail to honor this employment commitment.</p>

<div style="margin-top:28px;">
  <p style="font-weight:bold;">Signed &amp; Agreed By:</p>
  <table style="width:100%;margin-top:10px;border-collapse:collapse;font-size:10pt;">
    <tr>
      <td style="width:55%;padding-bottom:6px;">Employee's Name: <span style="display:inline-block;width:160px;border-bottom:1px solid #333;">&nbsp;</span></td>
      <td>Signature: <span style="display:inline-block;width:130px;border-bottom:1px solid #333;">&nbsp;</span></td>
    </tr>
    <tr>
      <td colspan="2" style="padding-top:10px;">Date: <span style="display:inline-block;width:160px;border-bottom:1px solid #333;">&nbsp;</span></td>
    </tr>
  </table>

  <p style="font-weight:bold;margin-top:24px;">For &amp; On Behalf of ${companyName}:</p>
  <table style="width:100%;margin-top:10px;border-collapse:collapse;font-size:10pt;">
    <tr>
      <td style="width:55%;padding-bottom:6px;">Authorized Representative Name: <span style="display:inline-block;width:100px;border-bottom:1px solid #333;">&nbsp;</span></td>
      <td>Signature: <span style="display:inline-block;width:130px;border-bottom:1px solid #333;">&nbsp;</span></td>
    </tr>
    <tr>
      <td style="padding-top:10px;">Position: <span style="display:inline-block;width:180px;border-bottom:1px solid #333;">&nbsp;</span></td>
      <td></td>
    </tr>
    <tr>
      <td colspan="2" style="padding-top:10px;">Date: <span style="display:inline-block;width:160px;border-bottom:1px solid #333;">&nbsp;</span></td>
    </tr>
  </table>
</div>`;
}
