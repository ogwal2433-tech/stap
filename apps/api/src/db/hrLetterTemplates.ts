/**
 * The HR letter templates STAP issues on paper, as editable HTML.
 *
 * Wording follows the company's own documents. Only {guard_name}, {date} and
 * {company_name} are substituted when a template is loaded into the letter
 * composer — everything else is left as a ruled blank, exactly as on the
 * printed forms, for HR to complete before the letter is approved.
 */
export interface HrLetterTemplate {
  letterType: string;
  name:       string;
  content:    string;
}

const BLANK      = '________________________';
const SHORT      = '_____________';
const wrap = (title: string, inner: string) =>
  `<h3 style="text-align:center;text-decoration:underline">${title}</h3>\n${inner}`;

/** Signature lines used by every approved letter. */
const APPROVED_BY = `<p><strong>Approved by:</strong></p>
<p>${BLANK}<br>${BLANK}</p>`;

/** The four-department sign-off block several of the letters carry. */
const CLEARANCE_BLOCK = `<p><strong>Clearance:</strong></p>
<p>HR Department: ${BLANK}<br>
Accounts Department: ${BLANK}<br>
Operations Department: ${BLANK}<br>
Stores Department: ${BLANK}</p>`;

const ADDRESSEE = `<p>To: <strong>{guard_name}</strong><br>Position: ${BLANK}</p>
<p>Dear {guard_name},</p>`;

export const HR_LETTER_TEMPLATES: HrLetterTemplate[] = [
  {
    letterType: 'DESERTION_NOTICE',
    name:       'Desertion Classification Notice',
    content: wrap('DESERTION CLASSIFICATION NOTICE', `${ADDRESSEE}
<p>You have been absent from duty without authorization since ${SHORT}. As per company policy,
failure to report constitutes <strong>desertion</strong>, leading to automatic dismissal. Your
employment with {company_name} is therefore <strong>terminated</strong> effective ${SHORT}.</p>
${APPROVED_BY}`),
  },

  {
    letterType: 'RESIGNATION_ACCEPTANCE',
    name:       'Immediate Resignation Acceptance Letter',
    content: wrap('IMMEDIATE RESIGNATION ACCEPTANCE LETTER', `${ADDRESSEE}
<p>We acknowledge receipt of your immediate resignation letter dated ${SHORT}. While company
policy requires a notice period of ${SHORT} days, we accept your resignation effective
immediately. As per company policy, a fine of <strong>UGX 50,000</strong> will be deducted from
your final dues. Ensure that all company-issued uniforms and equipment are returned to avoid
additional deductions.</p>
<p>We wish you the best in your future endeavors.</p>
${APPROVED_BY}
${CLEARANCE_BLOCK}`),
  },

  {
    letterType: 'SICK_LEAVE_APPROVAL',
    name:       'Sick Leave Approval Letter',
    content: wrap('SICK LEAVE APPROVAL LETTER', `${ADDRESSEE}
<p>Your request for sick leave from ${SHORT} to ${SHORT} has been <strong>approved</strong>.
Kindly ensure that you submit a medical report from a recognized medical facility upon your
return. In case of an extension, notify the office promptly.</p>
<p>Wishing you a speedy recovery.</p>
${APPROVED_BY}
${CLEARANCE_BLOCK}`),
  },

  {
    letterType: 'REINSTATEMENT_LETTER',
    name:       'Reinstatement Letter',
    content: wrap('REINSTATEMENT LETTER', `${ADDRESSEE}
<p>Following a review, you are hereby <strong>reinstated</strong> to your position effective
${SHORT}. We expect full compliance with company policies moving forward.</p>
${APPROVED_BY}`),
  },

  {
    letterType: 'EXPULSION_LETTER',
    name:       'Expulsion Letter',
    content: wrap('EXPULSION LETTER', `${ADDRESSEE}
<p>This letter serves as an official notification of your <strong>expulsion</strong> from
{company_name}, effective ${SHORT}. The reason for this action is ${BLANK}. You are required to
return all company property, including uniforms and equipment, immediately.</p>
<p>You will receive your final dues after clearance with the HR department.</p>
${APPROVED_BY}
${CLEARANCE_BLOCK}`),
  },

  {
    letterType: 'CLEARANCE_FORM',
    name:       'Guard / Staff Clearance Form',
    content: wrap('STAP SECURITY LTD GUARD/STAFF CLEARANCE FORM', `
<p><strong>1. EMPLOYEE INFORMATION</strong></p>
<ul>
  <li>Full Name: <strong>{guard_name}</strong></li>
  <li>Deployment Location / Site: ${BLANK}</li>
  <li>Position: ${BLANK}</li>
  <li>Supervisor Name: ${BLANK}</li>
  <li>Last Working Day: ${BLANK}</li>
  <li>Reason for Exit (Resignation / Termination / Abscondment): ${BLANK}</li>
</ul>

<p><strong>2. CLEARANCE CHECKLIST</strong></p>
<table style="width:100%;border-collapse:collapse;font-size:0.9em">
  <thead>
    <tr>
      <th style="border:1px solid #333;padding:6px;text-align:left">Department</th>
      <th style="border:1px solid #333;padding:6px;text-align:left">Item / Responsibility</th>
      <th style="border:1px solid #333;padding:6px;text-align:left">Returned / Cleared (Yes/No)</th>
      <th style="border:1px solid #333;padding:6px;text-align:left">Signature</th>
    </tr>
  </thead>
  <tbody>
    ${[
      ['Stores',     'Uniform Shirt'],
      ['Stores',     'Uniform Trousers'],
      ['Stores',     'Boots'],
      ['Stores',     'Baton'],
      ['Stores',     'ID Card'],
      ['Accounts',   'Salary Balance'],
      ['Accounts',   'Advances / Loans'],
      ['Accounts',   'Fines / Deductions'],
      ['Operations', 'All Company Documents Returned'],
      ['Supervisor', 'Site Duties Properly Handed Over'],
    ].map(([dept, item]) =>
      `<tr>
      <td style="border:1px solid #333;padding:6px">${dept}</td>
      <td style="border:1px solid #333;padding:6px">${item}</td>
      <td style="border:1px solid #333;padding:6px">&nbsp;</td>
      <td style="border:1px solid #333;padding:6px">&nbsp;</td>
    </tr>`).join('\n    ')}
  </tbody>
</table>

<p><strong>3. DECLARATION BY EMPLOYEE</strong></p>
<p>I, <strong>{guard_name}</strong>, confirm that I have returned all company property in good
condition and fulfilled all obligations to {company_name}. I understand that failure to return
company property or clear liabilities may result in salary deductions or legal action.</p>
<p>Guard Signature: ${BLANK} &nbsp;&nbsp; Date: ${SHORT}</p>

<p><strong>4. FINAL APPROVAL</strong></p>
<ul>
  <li>Stores Officer Signature: ${BLANK} &nbsp; Date: ${SHORT}</li>
  <li>Accounts Officer Signature: ${BLANK} &nbsp; Date: ${SHORT}</li>
  <li>Operations Manager Signature: ${BLANK} &nbsp; Date: ${SHORT}</li>
</ul>`),
  },
];
