import { useState } from 'react';
import { Alert, Button, Form, Modal, Spinner } from 'react-bootstrap';
import { useGenerateLetterRecord } from '../../hooks/useLetters';

const LETTER_TYPE_COLORS: Record<string, string> = {
  WARNING:               '#dc3545',
  SUSPENSION:            '#E8701A',
  TERMINATION:           '#842029',
  REINSTATEMENT:         '#0F7B6C',
  COMMITMENT_AGREEMENT:  '#5A3E9B',
  CLEARANCE_FORM:        '#2B6CB0',
  SICK_LEAVE:            '#276749',
  RESIGNATION_ACCEPTANCE: '#C05621',
  EXPULSION:             '#6B2737',
};
const LETTER_TYPE_BG: Record<string, string> = {
  WARNING:               '#f8d7da',
  SUSPENSION:            '#fff3cd',
  TERMINATION:           '#f8d7da',
  REINSTATEMENT:         '#D0EDE9',
  COMMITMENT_AGREEMENT:  '#EDE8F8',
  CLEARANCE_FORM:        '#EBF4FF',
  SICK_LEAVE:            '#C6F6D5',
  RESIGNATION_ACCEPTANCE: '#FFFAF0',
  EXPULSION:             '#FFF5F7',
};
const LETTER_TYPE_LABELS: Record<string, string> = {
  WARNING:               'Warning Letter',
  SUSPENSION:            'Suspension Letter',
  TERMINATION:           'Termination Letter',
  REINSTATEMENT:         'Reinstatement Letter',
  COMMITMENT_AGREEMENT:  'Commitment Agreement',
  CLEARANCE_FORM:        'Clearance Form',
  SICK_LEAVE:            'Sick Leave Approval',
  RESIGNATION_ACCEPTANCE: 'Resignation Acceptance',
  EXPULSION:             'Expulsion Letter',
};

// Letter types that have structured fields instead of a free-form body textarea
const STRUCTURED_TYPES = new Set(['COMMITMENT_AGREEMENT', 'SUSPENSION', 'CLEARANCE_FORM', 'SICK_LEAVE', 'RESIGNATION_ACCEPTANCE', 'EXPULSION']);

function buildCommitmentAgreementBody(guardName: string, startDate: string, minimumPeriod: string): string {
  return `
<p>Dear <strong>${guardName}</strong>,</p>

<p>We are pleased to offer you employment as a Security Guard with STAP Security Ltd. To ensure stability and continuity in our security operations, we require a commitment from you regarding the minimum service period.</p>

<p>By signing this agreement, you acknowledge and commit to the following terms:</p>

<p style="font-weight:bold;margin-top:14px;">1. Minimum Service Period:</p>
<ul style="margin:4px 0 10px 24px;line-height:1.6;">
  <li>You agree to work with STAP Security Ltd for a minimum of <strong>${minimumPeriod}</strong> from <strong>${startDate}</strong>, unless otherwise terminated in accordance with company policies.</li>
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

  <p style="font-weight:bold;margin-top:24px;">For &amp; On Behalf of STAP Security Ltd:</p>
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

function buildExpulsionBody(guardName: string, expulsionDate: string): string {
  return `
<p style="font-weight:bold;text-decoration:underline;font-size:12pt;text-align:center;">EXPULSION LETTER</p>
<p>To: <strong>${guardName}</strong></p>
<p>Position: Security Guard</p>
<p>Dear ${guardName},</p>
<p>We acknowledge receipt of your immediate resignation letter dated <strong>${expulsionDate}</strong>. While company policy requires a notice period of 30 days, we accept your resignation effective immediately. As per company policy, a fine of <strong>UGX 50,000</strong> will be deducted from your final dues. Ensure that all company-issued uniforms and equipment are returned to avoid additional deductions.</p>
<p>We wish you the best in your future endeavors.</p>

<div style="margin-top:28px;">
  <p style="font-weight:bold;">Approved by:</p>
  <div style="border-top:1px solid #333;width:200px;margin:28px 0 4px;"></div>
  <div style="border-top:1px solid #333;width:200px;margin:14px 0 4px;"></div>
</div>

<div style="margin-top:28px;">
  <p style="font-weight:bold;">Clearance:</p>
  <table style="width:100%;margin-top:10px;border-collapse:collapse;font-size:10pt;line-height:2;">
    <tr><td>HR Department: <span style="display:inline-block;width:220px;border-bottom:1px solid #333;">&nbsp;</span></td></tr>
    <tr><td>Accounts Department: <span style="display:inline-block;width:200px;border-bottom:1px solid #333;">&nbsp;</span></td></tr>
    <tr><td>Operations Department: <span style="display:inline-block;width:195px;border-bottom:1px solid #333;">&nbsp;</span></td></tr>
    <tr><td>Stores Department: <span style="display:inline-block;width:212px;border-bottom:1px solid #333;">&nbsp;</span></td></tr>
  </table>
</div>`;
}

function buildResignationAcceptanceBody(guardName: string, resignationDate: string): string {
  return `
<p style="font-weight:bold;text-decoration:underline;font-size:12pt;text-align:center;">IMMEDIATE RESIGNATION ACCEPTANCE LETTER</p>
<p>To: <strong>${guardName}</strong></p>
<p>Position: Security Guard</p>
<p>Dear ${guardName},</p>
<p>We acknowledge receipt of your immediate resignation letter dated <strong>${resignationDate}</strong>. While company policy requires a notice period of 30 days, we accept your resignation effective immediately. As per company policy, a fine of <strong>UGX 50,000</strong> will be deducted from your final dues. Ensure that all company-issued uniforms and equipment are returned to avoid additional deductions.</p>
<p>We wish you the best in your future endeavors.</p>

<div style="margin-top:28px;">
  <p style="font-weight:bold;">Approved by:</p>
  <div style="border-top:1px solid #333;width:200px;margin:28px 0 4px;"></div>
  <div style="border-top:1px solid #333;width:200px;margin:14px 0 4px;"></div>
</div>

<div style="margin-top:28px;">
  <p style="font-weight:bold;">Clearance:</p>
  <table style="width:100%;margin-top:10px;border-collapse:collapse;font-size:10pt;line-height:2;">
    <tr><td>HR Department: <span style="display:inline-block;width:220px;border-bottom:1px solid #333;">&nbsp;</span></td></tr>
    <tr><td>Accounts Department: <span style="display:inline-block;width:200px;border-bottom:1px solid #333;">&nbsp;</span></td></tr>
    <tr><td>Operations Department: <span style="display:inline-block;width:195px;border-bottom:1px solid #333;">&nbsp;</span></td></tr>
    <tr><td>Stores Department: <span style="display:inline-block;width:212px;border-bottom:1px solid #333;">&nbsp;</span></td></tr>
  </table>
</div>`;
}

function buildSickLeaveBody(guardName: string, fromDate: string, toDate: string): string {
  return `
<p style="font-weight:bold;text-decoration:underline;font-size:12pt;text-align:center;">SICK LEAVE APPROVAL LETTER</p>
<p>To: <strong>${guardName}</strong></p>
<p>Position: Security Guard</p>
<p>Dear ${guardName},</p>
<p>Your request for sick leave from <strong>${fromDate}</strong> to <strong>${toDate}</strong> has been approved. Kindly ensure that you submit a medical report from a recognized medical facility upon your return. In case of an extension, notify the office promptly.</p>
<p>Wishing you a speedy recovery.</p>

<div style="margin-top:28px;">
  <p style="font-weight:bold;">Approved by:</p>
  <div style="border-top:1px solid #333;width:200px;margin:28px 0 4px;"></div>
  <div style="border-top:1px solid #333;width:200px;margin:14px 0 4px;"></div>
</div>

<div style="margin-top:28px;">
  <p style="font-weight:bold;">Clearance:</p>
  <table style="width:100%;margin-top:10px;border-collapse:collapse;font-size:10pt;line-height:2;">
    <tr><td>HR Department: <span style="display:inline-block;width:220px;border-bottom:1px solid #333;">&nbsp;</span></td></tr>
    <tr><td>Accounts Department: <span style="display:inline-block;width:200px;border-bottom:1px solid #333;">&nbsp;</span></td></tr>
    <tr><td>Operations Department: <span style="display:inline-block;width:195px;border-bottom:1px solid #333;">&nbsp;</span></td></tr>
    <tr><td>Stores Department: <span style="display:inline-block;width:212px;border-bottom:1px solid #333;">&nbsp;</span></td></tr>
  </table>
</div>`;
}

function buildClearanceFormBody(
  guardName: string,
  deploymentLocation: string,
  supervisorName: string,
  lastWorkingDay: string,
  exitReason: string,
): string {
  const row = (dept: string, item: string) => `
    <tr>
      <td style="border:1px solid #999;padding:5px 8px;font-size:9.5pt;">${dept}</td>
      <td style="border:1px solid #999;padding:5px 8px;font-size:9.5pt;">${item}</td>
      <td style="border:1px solid #999;padding:5px 8px;text-align:center;">&nbsp;</td>
      <td style="border:1px solid #999;padding:5px 8px;">&nbsp;</td>
    </tr>`;

  return `
<p style="font-weight:bold;text-align:center;font-size:12pt;text-decoration:underline;margin-bottom:12px;">STAP SECURITY LTD GUARD/STAFF CLEARANCE FORM</p>

<p style="font-weight:bold;margin-bottom:5px;">1. EMPLOYEE INFORMATION</p>
<table style="width:100%;border-collapse:collapse;font-size:10pt;margin-bottom:12px;">
  <tr><td style="padding:3px 0;width:48%;">Full Name:</td><td style="border-bottom:1px solid #333;padding:3px 4px;">${guardName}</td></tr>
  <tr><td style="padding:3px 0;">Deployment Location / Site:</td><td style="border-bottom:1px solid #333;padding:3px 4px;">${deploymentLocation}</td></tr>
  <tr><td style="padding:3px 0;">Position:</td><td style="border-bottom:1px solid #333;padding:3px 4px;">Security Guard</td></tr>
  <tr><td style="padding:3px 0;">Supervisor Name:</td><td style="border-bottom:1px solid #333;padding:3px 4px;">${supervisorName}</td></tr>
  <tr><td style="padding:3px 0;">Last Working Day:</td><td style="border-bottom:1px solid #333;padding:3px 4px;">${lastWorkingDay}</td></tr>
  <tr><td style="padding:3px 0;">Reason for Exit:</td><td style="border-bottom:1px solid #333;padding:3px 4px;">${exitReason}</td></tr>
</table>

<p style="font-weight:bold;margin-bottom:5px;">2. CLEARANCE CHECKLIST</p>
<table style="width:100%;border-collapse:collapse;font-size:9.5pt;margin-bottom:12px;-webkit-print-color-adjust:exact;print-color-adjust:exact;">
  <thead>
    <tr style="background-color:#f2aa20;color:#ffffff;-webkit-print-color-adjust:exact;print-color-adjust:exact;">
      <th style="border:1px solid #ccc;padding:5px 8px;text-align:left;">Department</th>
      <th style="border:1px solid #ccc;padding:5px 8px;text-align:left;">Item / Responsibility</th>
      <th style="border:1px solid #ccc;padding:5px 8px;text-align:center;white-space:nowrap;">Returned / Cleared<br/>(Yes / No)</th>
      <th style="border:1px solid #ccc;padding:5px 8px;text-align:left;">Signature</th>
    </tr>
  </thead>
  <tbody>
    ${row('Stores', 'Uniform Shirt')}
    ${row('Stores', 'Uniform Trousers')}
    ${row('Stores', 'Boots')}
    ${row('Stores', 'Baton')}
    ${row('Stores', 'ID Card')}
    ${row('Accounts', 'Salary Balance')}
    ${row('Accounts', 'Advances / Loans')}
    ${row('Accounts', 'Fines / Deductions')}
    ${row('Operations', 'All Company Documents Returned')}
    ${row('Supervisor', 'Site Duties Properly Handed Over')}
  </tbody>
</table>

<p style="font-weight:bold;margin-bottom:5px;">4. DECLARATION BY EMPLOYEE</p>
<p style="font-size:10pt;margin-bottom:8px;">I, <span style="display:inline-block;width:190px;border-bottom:1px solid #333;">&nbsp;</span>, confirm that I have returned all company property in good condition and fulfilled all obligations to STAP Security Ltd. I understand that failure to return company property or clear liabilities may result in salary deductions or legal action.</p>
<p style="font-size:10pt;">Guard Signature: <span style="display:inline-block;width:150px;border-bottom:1px solid #333;">&nbsp;</span> &nbsp;&nbsp;&nbsp; Date: <span style="display:inline-block;width:110px;border-bottom:1px solid #333;">&nbsp;</span></p>

<p style="font-weight:bold;margin-top:16px;margin-bottom:6px;">5. FINAL APPROVAL</p>
<table style="width:100%;border-collapse:collapse;font-size:10pt;">
  <tr>
    <td style="padding:5px 0;width:60%;">Stores Officer Signature: <span style="display:inline-block;width:130px;border-bottom:1px solid #333;">&nbsp;</span></td>
    <td style="padding:5px 0;">Date: <span style="display:inline-block;width:100px;border-bottom:1px solid #333;">&nbsp;</span></td>
  </tr>
  <tr>
    <td style="padding:5px 0;">Accounts Officer Signature: <span style="display:inline-block;width:120px;border-bottom:1px solid #333;">&nbsp;</span></td>
    <td style="padding:5px 0;">Date: <span style="display:inline-block;width:100px;border-bottom:1px solid #333;">&nbsp;</span></td>
  </tr>
  <tr>
    <td style="padding:5px 0;">Operations Manager Signature: <span style="display:inline-block;width:112px;border-bottom:1px solid #333;">&nbsp;</span></td>
    <td style="padding:5px 0;">Date: <span style="display:inline-block;width:100px;border-bottom:1px solid #333;">&nbsp;</span></td>
  </tr>
</table>`;
}

function buildSuspensionBody(guardName: string, fromDate: string, toDate: string, reason: string): string {
  return `
<p style="font-weight:bold;text-decoration:underline;font-size:12pt;text-align:center;">SUSPENSION LETTER</p>
<p>To: <strong>${guardName}</strong></p>
<p>Position: Security Guard</p>
<p>Dear ${guardName},</p>
<p>Following an internal review, you are hereby suspended from duty with effect from <strong>${fromDate}</strong> to <strong>${toDate}</strong> due to <strong>${reason}</strong>. During this period, you are required to remain available for any inquiries related to your case.</p>
<p>Failure to comply with company policies may result in further disciplinary action.</p>

<div style="margin-top:28px;">
  <p style="font-weight:bold;">Approved by:</p>
  <div style="border-top:1px solid #333;width:200px;margin:28px 0 4px;"></div>
  <div style="border-top:1px solid #333;width:200px;margin:14px 0 4px;"></div>
</div>

<div style="margin-top:28px;">
  <p style="font-weight:bold;">Clearance:</p>
  <table style="width:100%;margin-top:10px;border-collapse:collapse;font-size:10pt;line-height:2;">
    <tr><td>HR Department: <span style="display:inline-block;width:220px;border-bottom:1px solid #333;">&nbsp;</span></td></tr>
    <tr><td>Accounts Department: <span style="display:inline-block;width:200px;border-bottom:1px solid #333;">&nbsp;</span></td></tr>
    <tr><td>Operations Department: <span style="display:inline-block;width:195px;border-bottom:1px solid #333;">&nbsp;</span></td></tr>
    <tr><td>Stores Department: <span style="display:inline-block;width:212px;border-bottom:1px solid #333;">&nbsp;</span></td></tr>
  </table>
</div>`;
}

interface Props {
  subjectType: 'GUARD' | 'STAFF' | 'APPLICANT';
  subjectId:   string;
  subjectName: string;
  show:        boolean;
  onClose:     () => void;
  onSuccess?:  () => void;
}

export default function GenerateLetterModal({
  subjectType, subjectId, subjectName, show, onClose, onSuccess,
}: Props) {
  const mutation = useGenerateLetterRecord();
  const [letterType, setLetterType]           = useState('WARNING');
  const [title, setTitle]                     = useState('');
  const [body, setBody]                       = useState('');
  const [minimumPeriod, setMinimumPeriod]     = useState('');
  const [startDate, setStartDate]             = useState('');
  const [suspensionFrom, setSuspensionFrom]     = useState('');
  const [suspensionTo, setSuspensionTo]         = useState('');
  const [suspensionReason, setSuspensionReason] = useState('');
  const [clearLocation, setClearLocation]       = useState('');
  const [clearSupervisor, setClearSupervisor]   = useState('');
  const [clearLastDay, setClearLastDay]         = useState('');
  const [clearExitReason, setClearExitReason]   = useState('');
  const [sickLeaveFrom, setSickLeaveFrom]         = useState('');
  const [sickLeaveTo, setSickLeaveTo]             = useState('');
  const [resignationDate, setResignationDate]     = useState('');
  const [expulsionDate, setExpulsionDate]         = useState('');
  const [error, setError]                       = useState('');
  const [succeeded, setSucceeded]             = useState(false);

  const isStructured = STRUCTURED_TYPES.has(letterType);

  function handleClose() {
    setLetterType('WARNING');
    setTitle('');
    setBody('');
    setMinimumPeriod('');
    setStartDate('');
    setSuspensionFrom('');
    setSuspensionTo('');
    setSuspensionReason('');
    setClearLocation('');
    setClearSupervisor('');
    setClearLastDay('');
    setClearExitReason('');
    setSickLeaveFrom('');
    setSickLeaveTo('');
    setResignationDate('');
    setExpulsionDate('');
    setError('');
    setSucceeded(false);
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    let finalBody = body;

    if (isStructured) {
      if (letterType === 'COMMITMENT_AGREEMENT') {
        if (!minimumPeriod.trim()) { setError('Minimum commitment period is required.'); return; }
        if (!startDate.trim())     { setError('Start date is required.'); return; }
        const formattedDate = new Date(startDate).toLocaleDateString('en-GB', {
          day: 'numeric', month: 'long', year: 'numeric',
        });
        finalBody = buildCommitmentAgreementBody(subjectName, formattedDate, minimumPeriod.trim());
      }
      if (letterType === 'SUSPENSION') {
        if (!suspensionFrom.trim())   { setError('Suspension start date is required.'); return; }
        if (!suspensionTo.trim())     { setError('Suspension end date is required.'); return; }
        if (!suspensionReason.trim()) { setError('Reason for suspension is required.'); return; }
        const fmt = (d: string) => new Date(d).toLocaleDateString('en-GB', {
          day: 'numeric', month: 'long', year: 'numeric',
        });
        finalBody = buildSuspensionBody(subjectName, fmt(suspensionFrom), fmt(suspensionTo), suspensionReason.trim());
      }
      if (letterType === 'EXPULSION') {
        if (!expulsionDate.trim()) { setError('Date of resignation letter is required.'); return; }
        const fmt = new Date(expulsionDate).toLocaleDateString('en-GB', {
          day: 'numeric', month: 'long', year: 'numeric',
        });
        finalBody = buildExpulsionBody(subjectName, fmt);
      }
      if (letterType === 'RESIGNATION_ACCEPTANCE') {
        if (!resignationDate.trim()) { setError('Resignation letter date is required.'); return; }
        const fmt = new Date(resignationDate).toLocaleDateString('en-GB', {
          day: 'numeric', month: 'long', year: 'numeric',
        });
        finalBody = buildResignationAcceptanceBody(subjectName, fmt);
      }
      if (letterType === 'SICK_LEAVE') {
        if (!sickLeaveFrom.trim()) { setError('Leave start date is required.'); return; }
        if (!sickLeaveTo.trim())   { setError('Leave end date is required.'); return; }
        const fmt = (d: string) => new Date(d).toLocaleDateString('en-GB', {
          day: 'numeric', month: 'long', year: 'numeric',
        });
        finalBody = buildSickLeaveBody(subjectName, fmt(sickLeaveFrom), fmt(sickLeaveTo));
      }
      if (letterType === 'CLEARANCE_FORM') {
        if (!clearLocation.trim())   { setError('Deployment location is required.'); return; }
        if (!clearSupervisor.trim()) { setError('Supervisor name is required.'); return; }
        if (!clearLastDay.trim())    { setError('Last working day is required.'); return; }
        if (!clearExitReason.trim()) { setError('Reason for exit is required.'); return; }
        const fmtDay = new Date(clearLastDay).toLocaleDateString('en-GB', {
          day: 'numeric', month: 'long', year: 'numeric',
        });
        finalBody = buildClearanceFormBody(subjectName, clearLocation.trim(), clearSupervisor.trim(), fmtDay, clearExitReason.trim());
      }
      if (!title.trim()) { setError('Letter title is required.'); return; }
    } else {
      if (!title.trim()) { setError('Letter title is required.'); return; }
      if (body.trim().length < 20) { setError('Letter body must be at least 20 characters.'); return; }
    }

    try {
      await mutation.mutateAsync({
        subjectType,
        subjectId,
        subjectName,
        title:      title.trim(),
        body:       finalBody,
        letterType: letterType as any,
      });
      setSucceeded(true);
      onSuccess?.();
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Failed to generate letter. Please try again.');
    }
  }

  return (
    <Modal show={show} onHide={handleClose} size="lg">
      <Modal.Header closeButton>
        <Modal.Title>Generate Letter — {subjectName}</Modal.Title>
      </Modal.Header>

      {succeeded ? (
        <Modal.Body>
          <div className="text-center py-4">
            <div style={{ fontSize: '3rem' }}>✉️</div>
            <div className="fw-bold mt-2" style={{ color: '#1B3A6B' }}>Letter Draft Created</div>
            <div className="text-muted small mt-1">
              HR has been notified and will review this letter for approval.
              {isStructured && ' A PDF will be emailed to HR upon approval.'}
            </div>
            <Button className="mt-3" variant="outline-primary" onClick={handleClose}>Close</Button>
          </div>
        </Modal.Body>
      ) : (
        <Form onSubmit={handleSubmit}>
          <Modal.Body>
            {error && <Alert variant="danger" className="small py-2">{error}</Alert>}

            {/* Letter type selector */}
            <Form.Label className="small fw-bold">Letter Type <span className="text-danger">*</span></Form.Label>
            <div className="d-flex flex-wrap gap-2 mb-3">
              {Object.entries(LETTER_TYPE_LABELS).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setLetterType(key)}
                  style={{
                    padding: '6px 14px', borderRadius: '0.5rem', fontSize: '0.82rem', cursor: 'pointer',
                    fontWeight:  letterType === key ? 600 : 400,
                    border:      `2px solid ${letterType === key ? LETTER_TYPE_COLORS[key] : '#ced4da'}`,
                    background:  letterType === key ? LETTER_TYPE_BG[key]     : '#fff',
                    color:       letterType === key ? LETTER_TYPE_COLORS[key] : '#4A5568',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Title */}
            <Form.Group className="mb-3">
              <Form.Label className="small fw-bold">Title <span className="text-danger">*</span></Form.Label>
              <Form.Control
                type="text"
                maxLength={200}
                placeholder={
                  letterType === 'COMMITMENT_AGREEMENT'
                    ? `Employment Commitment Agreement — ${subjectName}`
                    : 'e.g. First Written Warning — Lateness'
                }
                value={title}
                onChange={e => setTitle(e.target.value)}
              />
            </Form.Group>

            {/* Structured fields for COMMITMENT_AGREEMENT */}
            {letterType === 'COMMITMENT_AGREEMENT' && (
              <>
                <Form.Group className="mb-3">
                  <Form.Label className="small fw-bold">
                    Minimum Commitment Period <span className="text-danger">*</span>
                  </Form.Label>
                  <Form.Control
                    type="text"
                    placeholder="e.g. 6 months, 1 year"
                    value={minimumPeriod}
                    onChange={e => setMinimumPeriod(e.target.value)}
                  />
                  <Form.Text className="text-muted">
                    The minimum employment period the guard commits to.
                  </Form.Text>
                </Form.Group>
                <Form.Group className="mb-3">
                  <Form.Label className="small fw-bold">
                    Effective Start Date <span className="text-danger">*</span>
                  </Form.Label>
                  <Form.Control
                    type="date"
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                  />
                </Form.Group>
                <Alert variant="secondary" className="small py-2 mb-3">
                  📄 The agreement body will be auto-generated from the fields above. A formatted PDF will
                  be emailed to HR automatically upon approval.
                </Alert>
              </>
            )}

            {/* Structured fields for SUSPENSION */}
            {letterType === 'SUSPENSION' && (
              <>
                <div className="d-flex gap-3 mb-3">
                  <Form.Group className="flex-fill">
                    <Form.Label className="small fw-bold">
                      Suspension From <span className="text-danger">*</span>
                    </Form.Label>
                    <Form.Control
                      type="date"
                      value={suspensionFrom}
                      onChange={e => setSuspensionFrom(e.target.value)}
                    />
                  </Form.Group>
                  <Form.Group className="flex-fill">
                    <Form.Label className="small fw-bold">
                      Suspension To <span className="text-danger">*</span>
                    </Form.Label>
                    <Form.Control
                      type="date"
                      value={suspensionTo}
                      onChange={e => setSuspensionTo(e.target.value)}
                    />
                  </Form.Group>
                </div>
                <Form.Group className="mb-3">
                  <Form.Label className="small fw-bold">
                    Reason for Suspension <span className="text-danger">*</span>
                  </Form.Label>
                  <Form.Control
                    as="textarea"
                    rows={2}
                    placeholder="e.g. misconduct and breach of company policy"
                    value={suspensionReason}
                    onChange={e => setSuspensionReason(e.target.value)}
                  />
                </Form.Group>
                <Alert variant="secondary" className="small py-2 mb-3">
                  📄 The suspension letter body will be auto-generated. A formatted PDF will be emailed
                  to HR automatically upon approval.
                </Alert>
              </>
            )}

            {/* Structured fields for EXPULSION */}
            {letterType === 'EXPULSION' && (
              <>
                <Form.Group className="mb-3">
                  <Form.Label className="small fw-bold">
                    Date of Resignation Letter <span className="text-danger">*</span>
                  </Form.Label>
                  <Form.Control
                    type="date"
                    value={expulsionDate}
                    onChange={e => setExpulsionDate(e.target.value)}
                  />
                  <Form.Text className="text-muted">The date on the employee's resignation letter.</Form.Text>
                </Form.Group>
                <Alert variant="secondary" className="small py-2 mb-3">
                  📄 The expulsion letter will be auto-generated. A formatted PDF will be emailed to
                  HR automatically upon approval.
                </Alert>
              </>
            )}

            {/* Structured fields for RESIGNATION_ACCEPTANCE */}
            {letterType === 'RESIGNATION_ACCEPTANCE' && (
              <>
                <Form.Group className="mb-3">
                  <Form.Label className="small fw-bold">
                    Resignation Letter Date <span className="text-danger">*</span>
                  </Form.Label>
                  <Form.Control
                    type="date"
                    value={resignationDate}
                    onChange={e => setResignationDate(e.target.value)}
                  />
                  <Form.Text className="text-muted">The date on the employee's resignation letter.</Form.Text>
                </Form.Group>
                <Alert variant="secondary" className="small py-2 mb-3">
                  📄 The resignation acceptance letter will be auto-generated. A formatted PDF will be
                  emailed to HR automatically upon approval.
                </Alert>
              </>
            )}

            {/* Structured fields for SICK_LEAVE */}
            {letterType === 'SICK_LEAVE' && (
              <>
                <div className="d-flex gap-3 mb-3">
                  <Form.Group className="flex-fill">
                    <Form.Label className="small fw-bold">
                      Leave From <span className="text-danger">*</span>
                    </Form.Label>
                    <Form.Control
                      type="date"
                      value={sickLeaveFrom}
                      onChange={e => setSickLeaveFrom(e.target.value)}
                    />
                  </Form.Group>
                  <Form.Group className="flex-fill">
                    <Form.Label className="small fw-bold">
                      Leave To <span className="text-danger">*</span>
                    </Form.Label>
                    <Form.Control
                      type="date"
                      value={sickLeaveTo}
                      onChange={e => setSickLeaveTo(e.target.value)}
                    />
                  </Form.Group>
                </div>
                <Alert variant="secondary" className="small py-2 mb-3">
                  📄 The sick leave approval letter will be auto-generated. A formatted PDF will be
                  emailed to HR automatically upon approval.
                </Alert>
              </>
            )}

            {/* Structured fields for CLEARANCE_FORM */}
            {letterType === 'CLEARANCE_FORM' && (
              <>
                <Form.Group className="mb-3">
                  <Form.Label className="small fw-bold">
                    Deployment Location / Site <span className="text-danger">*</span>
                  </Form.Label>
                  <Form.Control
                    type="text"
                    placeholder="e.g. Kampala Industrial Area"
                    value={clearLocation}
                    onChange={e => setClearLocation(e.target.value)}
                  />
                </Form.Group>
                <div className="d-flex gap-3 mb-3">
                  <Form.Group className="flex-fill">
                    <Form.Label className="small fw-bold">
                      Supervisor Name <span className="text-danger">*</span>
                    </Form.Label>
                    <Form.Control
                      type="text"
                      placeholder="Supervisor's full name"
                      value={clearSupervisor}
                      onChange={e => setClearSupervisor(e.target.value)}
                    />
                  </Form.Group>
                  <Form.Group className="flex-fill">
                    <Form.Label className="small fw-bold">
                      Last Working Day <span className="text-danger">*</span>
                    </Form.Label>
                    <Form.Control
                      type="date"
                      value={clearLastDay}
                      onChange={e => setClearLastDay(e.target.value)}
                    />
                  </Form.Group>
                </div>
                <Form.Group className="mb-3">
                  <Form.Label className="small fw-bold">
                    Reason for Exit <span className="text-danger">*</span>
                  </Form.Label>
                  <Form.Select
                    value={clearExitReason}
                    onChange={e => setClearExitReason(e.target.value)}
                  >
                    <option value="">Select reason…</option>
                    <option value="Resignation">Resignation</option>
                    <option value="Termination">Termination</option>
                    <option value="Abscondment">Abscondment</option>
                  </Form.Select>
                </Form.Group>
                <Alert variant="secondary" className="small py-2 mb-3">
                  📄 The clearance form will be auto-generated from the fields above. A formatted PDF
                  will be emailed to HR automatically upon approval.
                </Alert>
              </>
            )}

            {/* Free-form body — only for non-structured types */}
            {!isStructured && (
              <Form.Group className="mb-3">
                <Form.Label className="small fw-bold">Letter Body <span className="text-danger">*</span></Form.Label>
                <Form.Control
                  as="textarea"
                  rows={10}
                  value={body}
                  onChange={e => setBody(e.target.value)}
                  placeholder={`Dear ${subjectName},\n\nThis letter is to formally notify you...\n\nSigned,\nManagement`}
                  style={{ fontFamily: 'Georgia, serif', fontSize: '0.9rem' }}
                />
                <Form.Text className="text-muted">{body.length} characters</Form.Text>
              </Form.Group>
            )}

            <Alert variant="info" className="mb-0 small py-2">
              📋 This letter will be saved as a <strong>draft pending HR approval</strong>. The HR Manager will be notified
              and must approve before the letter is considered official. You will be notified when a decision is made.
            </Alert>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={handleClose} disabled={mutation.isPending}>Cancel</Button>
            <Button
              type="submit"
              style={{ backgroundColor: '#1B3A6B', borderColor: '#1B3A6B' }}
              disabled={mutation.isPending}
            >
              {mutation.isPending
                ? <><Spinner size="sm" animation="border" className="me-1" />Generating…</>
                : 'Generate Letter Draft'}
            </Button>
          </Modal.Footer>
        </Form>
      )}
    </Modal>
  );
}
