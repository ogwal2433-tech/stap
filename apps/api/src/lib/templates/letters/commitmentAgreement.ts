export interface CommitmentAgreementData {
  guardName:     string;
  startDate:     string;
  minimumPeriod: string;
}

export function buildCommitmentAgreementBody(data: CommitmentAgreementData): string {
  return `
    <p>Dear <strong>${data.guardName}</strong>,</p>

    <p style="font-weight:bold; text-decoration:underline; font-size:12pt; margin-bottom:16px;">
      RE: EMPLOYMENT COMMITMENT AGREEMENT
    </p>

    <p>
      This Employment Commitment Agreement is entered into between <strong>STAP Security Ltd</strong>
      (hereinafter "the Company") and <strong>${data.guardName}</strong> (hereinafter "the Employee"),
      effective from <strong>${data.startDate}</strong>.
    </p>

    <p style="font-weight:bold; margin-top:18px;">1. Employment Duration</p>
    <p>
      The Employee commits to remaining in the employment of STAP Security Ltd for a minimum period of
      <strong>${data.minimumPeriod}</strong> from the effective start date of
      <strong>${data.startDate}</strong>. The Employee shall not resign or abandon their post before
      this minimum period elapses without prior written notice and management approval.
    </p>

    <p style="font-weight:bold; margin-top:18px;">2. Training &amp; Development</p>
    <p>
      STAP Security Ltd commits to providing the Employee with the necessary training, uniform, personal
      protective equipment, and any other resources required to perform their assigned security duties
      effectively. Any training provided shall remain the property of the Company for the duration of
      the commitment period.
    </p>

    <p style="font-weight:bold; margin-top:18px;">3. Employee Obligations</p>
    <p>
      The Employee agrees to adhere to all Company policies, rules, and regulations as detailed in the
      STAP Security Ltd Staff Handbook, including but not limited to the Code of Conduct, uniform
      standards, attendance requirements, and site assignment directives. The Employee shall conduct
      themselves professionally and uphold the reputation of the Company at all times.
    </p>

    <p style="font-weight:bold; margin-top:18px;">4. Early Departure Consequences</p>
    <p>
      Should the Employee resign, abandon their post, or otherwise terminate their employment before
      the minimum commitment period of <strong>${data.minimumPeriod}</strong> has elapsed, STAP
      Security Ltd reserves the right to recover reasonable costs associated with training, uniform,
      and equipment issued to the Employee, as determined by Management. The Employee acknowledges
      and accepts this condition as a material term of their employment.
    </p>

    <p style="font-weight:bold; margin-top:18px;">5. Governing Law &amp; Dispute Resolution</p>
    <p>
      This Agreement shall be governed by and construed in accordance with the laws of the Republic
      of Uganda. Any dispute arising from or in connection with this Agreement shall be resolved in
      the first instance through the Company's internal grievance procedure. Where no resolution is
      reached, the matter may be referred to the relevant statutory authority.
    </p>

    <p style="margin-top:20px;">
      By signing below, the Employee confirms that they have read, understood, and voluntarily agree
      to the terms of this Employment Commitment Agreement.
    </p>
  `;
}
