import { Dropdown, Spinner } from 'react-bootstrap';
import { ROLES } from '@security360/shared';
import type { InvoiceResponse } from '@security360/shared';
import RoleGuard from '../RoleGuard';
import PermissionGuard from '../PermissionGuard';

/** The three roles allowed to move an invoice's money or content. */
const EDIT_ROLES = [ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER, ROLES.ACCOUNTS_OFFICER];

export interface InvoiceActionHandlers {
  onView:          () => void;
  onEdit:          () => void;
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
  actions,
}: {
  invoice:  InvoiceResponse;
  pdfBusy:  boolean;
  sendBusy: boolean;
  actions:  InvoiceActionHandlers;
}) {
  const status   = invoice.status;
  const canPay   = ['PENDING', 'OVERDUE', 'PARTIALLY_PAID'].includes(status);
  const canFees  = status !== 'PAID' && status !== 'VOID';
  // Only while nothing has been received — the server refuses otherwise.
  const canVoid  = ['PENDING', 'OVERDUE'].includes(status) && invoice.paidAmount === 0;
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
        <Dropdown.Item eventKey="history" onClick={actions.onHistory}>🧾 Payment history</Dropdown.Item>

        {/* Editing block: each entry appears only where it can still succeed.
            A voided invoice has nothing left to edit or send, so the whole
            group disappears rather than showing dead entries. */}
        {status !== 'VOID' && (
          <>
            <Dropdown.Divider />
            <RoleGuard allowedRoles={EDIT_ROLES}>
              {status === 'PENDING' && (
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
