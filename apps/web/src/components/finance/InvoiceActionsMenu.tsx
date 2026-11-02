import { Dropdown, Spinner } from 'react-bootstrap';
import { ROLES } from '@security360/shared';
import type { InvoiceResponse } from '@security360/shared';
import RoleGuard from '../RoleGuard';
import PermissionGuard from '../PermissionGuard';

/** The three roles allowed to move an invoice's money or content. */
const EDIT_ROLES = [ROLES.DIRECTOR, ROLES.MD, ROLES.ASSISTANT_MANAGER, ROLES.ACCOUNTS_OFFICER, ROLES.HR];
const CLONE_ROLES = [ROLES.DIRECTOR, ROLES.MD, ROLES.ASSISTANT_MANAGER, ROLES.ACCOUNTS_OFFICER, ROLES.HR];

export interface InvoiceActionHandlers {
  onView:          () => void;
  onIssue:         () => void;
  onEdit:          () => void;
  onClone:         () => void;
  onPdf:           () => void;
  onHistory:       () => void;
  onSend:          () => void;
  onAddFees:       () => void;
  onRecordPayment: () => void;
  onMobileMoney:   () => void;
  onVoid:          () => void;
}

/**
 * Every invoice action behind one kebab, replacing a row of eight buttons.
 *
 * Visibility rules are the ones the old inline buttons enforced, and they are
 * deliberate rather than cosmetic: the server refuses an edit past PENDING, a
 * void once anything has been received, and a re-send once the invoice has
 * gone out — so those items only appear when they can actually succeed.
 *
 * The menu is positioned with a fixed strategy because the table sits in a
 * Bootstrap responsive wrapper (overflow: auto), which would otherwise clip a
 * long menu or stretch the scroll area under the rows.
 */
export default function InvoiceActionsMenu({
  invoice,
  pdfBusy,
  sendBusy,
  issueBusy,
  actions,
}: {
  invoice:   InvoiceResponse;
  pdfBusy:   boolean;
  sendBusy:  boolean;
  issueBusy: boolean;
  actions:   InvoiceActionHandlers;
}) {
  const status   = invoice.status;
  // Run invoices are locked the moment they land: only the MD's issue (or a
  // void before issue) may move them, so edit/clone/fees vanish meanwhile.
  const locked   = !!invoice.runBatchId || !!invoice.issuedAt;
  const canPay   = ['PENDING', 'ISSUED', 'OVERDUE', 'PARTIALLY_PAID'].includes(status);
  const canFees  = status !== 'PAID' && status !== 'VOID' && !locked;
  // Any invoice that is not already VOID and has not been issued: settled
  // payments stay on record, only the unpaid remainder is written off.
  const canVoid  = status !== 'VOID' && !invoice.issuedAt;
  const canIssue = status === 'PENDING' && !!invoice.runBatchId;
  const sentTo   = invoice.emailSentTo ?? '';
  const sentOn   = invoice.emailSentAt
    ? new Date(invoice.emailSentAt).toLocaleDateString('en-GB')
    : null;

  return (
    <Dropdown align="end" className="text-nowrap">
      <Dropdown.Toggle size="sm" variant="outline-secondary" id={`invoice-actions-${invoice.id}`}>
        {/* The row is the only place a background job can be seen once the menu
            has closed itself, so the toggle carries the busy state. */}
        {pdfBusy || sendBusy
          ? <><Spinner size="sm" className="me-1" />Working…</>
          : '⋮ Actions'}
      </Dropdown.Toggle>
      <Dropdown.Menu popperConfig={{ strategy: 'fixed' }} className="py-1">
        <Dropdown.Item eventKey="view" onClick={actions.onView}>👁 View invoice</Dropdown.Item>
        <Dropdown.Item eventKey="pdf" onClick={actions.onPdf} disabled={pdfBusy}>
          {pdfBusy
            ? <><Spinner size="sm" className="me-1" />Preparing PDF…</>
            : '🖨️ Print / PDF'}
        </Dropdown.Item>
        {!locked && (
          <RoleGuard allowedRoles={CLONE_ROLES}>
            <Dropdown.Item eventKey="clone" onClick={actions.onClone} title="Create a fresh PENDING copy to edit">Clone + edit</Dropdown.Item>
          </RoleGuard>
        )}
        <Dropdown.Item eventKey="history" onClick={actions.onHistory}>🧾 Payment history</Dropdown.Item>

        {canIssue && (
          <PermissionGuard permission="invoices.issue">
            <Dropdown.Divider />
            <Dropdown.Item eventKey="issue" onClick={actions.onIssue} disabled={issueBusy}>
              {issueBusy ? (
                <><Spinner size="sm" className="me-1" />Issuing...</>
              ) : (
                <><i className="bi bi-check2-circle me-1" />Issue invoice (MD)</>
              )}
            </Dropdown.Item>
          </PermissionGuard>
        )}

        {/* Editing block: each entry appears only where it can still succeed.
            A voided invoice has nothing left to edit or send, so the whole
            group disappears rather than showing dead entries. */}
        {status !== 'VOID' && !locked && (
          <>
            <Dropdown.Divider />
            <RoleGuard allowedRoles={EDIT_ROLES}>
              {status !== 'VOID' && (
                <Dropdown.Item eventKey="edit" onClick={actions.onEdit}>✏️ Update invoice</Dropdown.Item>
              )}
              {canFees && (
                <Dropdown.Item eventKey="fees" onClick={actions.onAddFees}>➕ Add fees</Dropdown.Item>
              )}
              <Dropdown.Item
                eventKey="send"
                onClick={actions.onSend}
                disabled={!!sentOn || sendBusy}
                title={sentOn ? `Sent to ${sentTo} on ${sentOn}` : undefined}
              >
                {sendBusy ? (
                  <><Spinner size="sm" className="me-1" />Sending…</>
                ) : sentOn ? (
                  <>✅ Sent {sentOn}</>
                ) : (
                  '📧 Send by email'
                )}
              </Dropdown.Item>
            </RoleGuard>
          </>
        )}

        {canPay && (
          <>
            <Dropdown.Divider />
            <RoleGuard allowedRoles={EDIT_ROLES}>
              <Dropdown.Item eventKey="pay" onClick={actions.onRecordPayment}>💵 Record payment</Dropdown.Item>
              <Dropdown.Item eventKey="momo" onClick={actions.onMobileMoney}>💳 Mobile Money (MTN / Airtel)</Dropdown.Item>
            </RoleGuard>
          </>
        )}

        {canVoid && (
          <>
            <Dropdown.Divider />
            <PermissionGuard permission="invoices.void">
              <Dropdown.Item eventKey="void" onClick={actions.onVoid} className="text-danger">
                🗑 Void invoice
              </Dropdown.Item>
            </PermissionGuard>
          </>
        )}
      </Dropdown.Menu>
    </Dropdown>
  );
}
