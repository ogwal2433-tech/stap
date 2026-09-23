import { useState } from 'react';
import { COMPANY_NAME } from '../../lib/branding';
import { Alert, Button, Col, Form, Modal, Row, Spinner } from 'react-bootstrap';
import { useGenerateLetterRecord } from '../../hooks/useLetters';
import { useLetterTemplates, usePreviewTemplate } from '../../hooks/useHR';
import { LetterEditor } from './LetterEditor';
import { HR_LETTER_LABELS, TEMPLATE_TYPES_BY_LETTER_TYPE } from '@stap/shared';

function buildCommitmentAgreementBody(guardName: string, startDate: string, minimumPeriod: string): string {
  return `
<p>Dear <strong>${guardName}</strong>,</p>

<p>We are pleased to offer you employment as a Security Guard with ${COMPANY_NAME}. To ensure stability and continuity in our security operations, we require a commitment from you regarding the minimum service period.</p>

<p>By signing this agreement, you acknowledge and commit to the following terms:</p>

<p style="font-weight:bold;margin-top:14px;">1. Minimum Service Period:</p>
<ul style="margin:4px 0 10px 24px;line-height:1.6;">
  <li>You agree to work with ${COMPANY_NAME} for a minimum of <strong>${minimumPeriod}</strong> from <strong>${startDate}</strong>, unless otherwise terminated in accordance with company policies.</li>
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

  <p style="font-weight:bold;margin-top:24px;">For &amp; On Behalf of ${COMPANY_NAME}:</p>
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

interface Props {
  guardId:   string;
  guardName: string;
  show:      boolean;
  onClose:   () => void;
  onSuccess?: () => void;
}

/** Generates HR letters (commendation, reinstatement, general, commitment agreement) —
 * never linked to a disciplinary record. Disciplinary letters (warning/suspension/
 * termination) are generated from the specific incident on the Disciplinary Records tab. */
export default function HRLetterModal({ guardId, guardName, show, onClose, onSuccess }: Props) {
  const mutation = useGenerateLetterRecord();
  const { data: templates = [] } = useLetterTemplates();
  const previewTemplate = usePreviewTemplate();
  const [letterType, setLetterType]       = useState('GENERAL');
  const [title, setTitle]                 = useState('');
  const [body, setBody]                   = useState('');
  const [minimumPeriod, setMinimumPeriod] = useState('');
  const [startDate, setStartDate]         = useState('');
  const [error, setError]                 = useState('');
  const [succeeded, setSucceeded]         = useState(false);
  const [editorKey, setEditorKey]         = useState(0);

  const isCommitmentAgreement = letterType === 'COMMITMENT_AGREEMENT';
  const eligibleTemplateTypes = TEMPLATE_TYPES_BY_LETTER_TYPE[letterType] ?? [];
  const eligibleTemplates = templates.filter((t) => eligibleTemplateTypes.includes(t.letterType));

  async function handleLoadTemplate(templateType: string) {
    if (!templateType) return;
    const html = await previewTemplate.mutateAsync({
      letterType: templateType,
      sampleData: {
        guard_name:   guardName,
        date:         new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
        company_name: COMPANY_NAME,
      },
    });
    setBody(html);
    setEditorKey((k) => k + 1);
  }

  function handleClose() {
    setLetterType('GENERAL');
    setTitle('');
    setBody('');
    setMinimumPeriod('');
    setStartDate('');
    setError('');
    setSucceeded(false);
    setEditorKey(0);
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    let finalBody = body;

    if (isCommitmentAgreement) {
      if (!minimumPeriod.trim()) { setError('Minimum commitment period is required.'); return; }
      if (!startDate.trim())     { setError('Start date is required.'); return; }
      const formattedDate = new Date(startDate).toLocaleDateString('en-GB', {
        day: 'numeric', month: 'long', year: 'numeric',
      });
      finalBody = buildCommitmentAgreementBody(guardName, formattedDate, minimumPeriod.trim());
      if (!title.trim()) { setError('Letter title is required.'); return; }
    } else {
      if (!title.trim()) { setError('Letter title is required.'); return; }
      const plainTextLength = body.replace(/<[^>]*>/g, '').trim().length;
      if (plainTextLength < 20) { setError('Letter body must be at least 20 characters.'); return; }
    }

    try {
      await mutation.mutateAsync({
        subjectType: 'GUARD',
        subjectId:   guardId,
        subjectName: guardName,
        title:       title.trim(),
        body:        finalBody,
        letterType:  letterType as any,
        // HR letters are never linked to a disciplinary record.
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
        <Modal.Title>Generate HR Letter — {guardName}</Modal.Title>
      </Modal.Header>

      {succeeded ? (
        <Modal.Body>
          <div className="text-center py-4">
            <div style={{ fontSize: '3rem' }}>✉️</div>
            <div className="fw-bold mt-2" style={{ color: '#1B3A6B' }}>Letter Draft Created</div>
            <div className="text-muted small mt-1">
              HR has been notified and will review this letter for approval.
            </div>
            <Button className="mt-3" variant="outline-primary" onClick={handleClose}>Close</Button>
          </div>
        </Modal.Body>
      ) : (
        <Form onSubmit={handleSubmit}>
          <Modal.Body>
            {error && <Alert variant="danger" className="small py-2">{error}</Alert>}

            <div className="mb-3">
              <Form.Label className="fw-bold small">Letter Type <span className="text-danger">*</span></Form.Label>
              <Row className="g-2">
                {Object.entries(HR_LETTER_LABELS).map(([key, label]) => (
                  <Col xs={6} key={key}>
                    <button
                      type="button"
                      onClick={() => setLetterType(key)}
                      style={{
                        width: '100%', padding: '10px 12px', borderRadius: '0.5rem',
                        cursor: 'pointer', fontSize: '0.82rem', textAlign: 'left',
                        border:     `2px solid ${letterType === key ? '#1B3A6B' : '#ced4da'}`,
                        background: letterType === key ? '#D6E0F0' : '#fff',
                        fontWeight: letterType === key ? 600 : 400,
                        color:      letterType === key ? '#1B3A6B' : '#4A5568',
                      }}
                    >
                      {label}
                    </button>
                  </Col>
                ))}
              </Row>
            </div>

            <Form.Group className="mb-3">
              <Form.Label className="small fw-bold">Title <span className="text-danger">*</span></Form.Label>
              <Form.Control
                type="text"
                maxLength={200}
                placeholder={
                  isCommitmentAgreement
                    ? `Employment Commitment Agreement — ${guardName}`
                    : 'e.g. Commendation for Excellent Service'
                }
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </Form.Group>

            {isCommitmentAgreement ? (
              <>
                <Form.Group className="mb-3">
                  <Form.Label className="small fw-bold">
                    Minimum Commitment Period <span className="text-danger">*</span>
                  </Form.Label>
                  <Form.Control
                    type="text"
                    placeholder="e.g. 6 months, 1 year"
                    value={minimumPeriod}
                    onChange={(e) => setMinimumPeriod(e.target.value)}
                  />
                  <Form.Text className="text-muted">The minimum employment period the guard commits to.</Form.Text>
                </Form.Group>
                <Form.Group className="mb-3">
                  <Form.Label className="small fw-bold">
                    Effective Start Date <span className="text-danger">*</span>
                  </Form.Label>
                  <Form.Control type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                </Form.Group>
                <Alert variant="secondary" className="small py-2 mb-3">
                  📄 The agreement body will be auto-generated from the fields above.
                </Alert>
              </>
            ) : (
              <div className="mb-3">
                <div className="d-flex align-items-center justify-content-between mb-1">
                  <Form.Label className="small fw-bold mb-0">Letter Content <span className="text-danger">*</span></Form.Label>
                  {eligibleTemplates.length > 0 && (
                    <Form.Select
                      size="sm"
                      style={{ width: 'auto', fontSize: '0.78rem' }}
                      value=""
                      disabled={previewTemplate.isPending}
                      onChange={(e) => handleLoadTemplate(e.target.value)}
                    >
                      <option value="">📄 Load from template…</option>
                      {eligibleTemplates.map((t) => (
                        <option key={t.letterType} value={t.letterType}>{t.name}</option>
                      ))}
                    </Form.Select>
                  )}
                </div>
                <LetterEditor
                  key={editorKey}
                  content={body}
                  onChange={setBody}
                  minHeight="240px"
                  placeholder={`Dear ${guardName}, this letter is to formally notify you...`}
                />
              </div>
            )}

            <Alert variant="info" className="mb-0 small py-2">
              📋 This letter will be saved as <strong>Pending HR Approval</strong>. It will appear on the guard's
              Letters tab once approved.
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
                : '+ Generate Letter'}
            </Button>
          </Modal.Footer>
        </Form>
      )}
    </Modal>
  );
}
