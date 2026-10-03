export interface InvoiceEmailData {
  title: string;
  clientName:    string;
  invoiceNumber: string;
  issueDate:     string;
  dueDate:       string;
  lineItems: {
    description: string;
    qty:         number;
    unitPrice:   number;
    total:       number;
  }[];
  subtotal:     number;
  tax:          number;
  totalAmount:  number;
  currency:     string;
  /** From Settings → Company details, so the invoice names the right business. */
  company: {
    name:  string;
    email: string | null;
    /** Where to pay. All null until the deployment fills them in in Settings. */
    bankName:        string | null;
    bankBranchName:  string | null;
    bankBranchNo:    string | null;
    bankAccountName: string | null;
    bankAccount:     string | null;
  };
}

export function buildInvoiceEmail(data: InvoiceEmailData): string {
  const fmt = (n: number) => n.toLocaleString('en-UG');

  // Printed only when there is something to print — an emailed invoice with a
  // blank account number reads as a mistake, and invites a fraudulent one. Each
  // part is optional, so only what Settings holds appears.
  const bankLines = ([
    ['Bank',         data.company.bankName],
    ['Branch',       [data.company.bankBranchName, data.company.bankBranchNo].filter(Boolean).join(' · ')],
    ['Account Name', data.company.bankAccountName],
    ['Account No',   data.company.bankAccount],
  ] as Array<[string, string | null]>)
    .filter(([, value]) => value && value.trim())
    .map(([label, value]) => `${label}: <strong>${value}</strong>`)
    .join(' &nbsp;·&nbsp; ');

  const rows = data.lineItems.map(item => `
    <tr>
      <td style="padding:8px;border-bottom:1px solid #e9ecef">${item.description}</td>
      <td style="padding:8px;text-align:center;border-bottom:1px solid #e9ecef">${item.qty}</td>
      <td style="padding:8px;text-align:right;border-bottom:1px solid #e9ecef">${data.currency} ${fmt(item.unitPrice)}</td>
      <td style="padding:8px;text-align:right;border-bottom:1px solid #e9ecef">${data.currency} ${fmt(item.total)}</td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;color:#1A1A1A;max-width:640px;margin:0 auto;padding:0">

  <div style="background:#1B3A6B;padding:24px 32px">
    <h1 style="color:#fff;margin:0;font-size:1.4rem">${data.company.name}</h1>
    <p style="color:#D6E0F0;margin:4px 0 0">${data.title}</p>
  </div>

  <div style="padding:32px">
    <p>Dear <strong>${data.clientName}</strong>,</p>
    <p>Please find your invoice details below. Payment is due by <strong>${data.dueDate}</strong>.</p>

    <table style="width:100%;border-collapse:collapse;margin:24px 0">
      <thead>
        <tr style="background:#F2F4F7">
          <th style="padding:10px 8px;text-align:left">Description</th>
          <th style="padding:10px 8px;text-align:center">Qty</th>
          <th style="padding:10px 8px;text-align:right">Unit Price</th>
          <th style="padding:10px 8px;text-align:right">Total</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <div style="text-align:right;margin-top:16px">
      <div style="margin-bottom:4px">Subtotal: <strong>${data.currency} ${fmt(data.subtotal)}</strong></div>
      ${data.tax > 0 ? `<div style="margin-bottom:4px">Tax: <strong>${data.currency} ${fmt(data.tax)}</strong></div>` : ''}
      <div style="font-size:1.1rem;margin-top:8px;color:#1B3A6B;font-weight:bold">
        Total Due: ${data.currency} ${fmt(data.totalAmount)}
      </div>
    </div>

    <div style="margin-top:32px;padding:16px;background:#F2F4F7;border-radius:8px;font-size:0.85rem;color:#6c757d">
      Invoice No: <strong>${data.invoiceNumber}</strong> &nbsp;·&nbsp;
      Issued: ${data.issueDate} &nbsp;·&nbsp;
      Due: ${data.dueDate}
    </div>

    ${bankLines ? `
    <div style="margin-top:16px;padding:16px;background:#F2F4F7;border-left:4px solid #F2AA20;border-radius:8px;font-size:0.9rem;color:#1A1A1A">
      <div style="font-size:0.75rem;text-transform:uppercase;letter-spacing:0.5px;color:#6c757d;margin-bottom:6px">Payment details</div>
      ${bankLines}
    </div>` : ''}

    <p style="margin-top:24px;font-size:0.85rem;color:#6c757d">
      ${data.company.email
        ? `For queries contact <a href="mailto:${data.company.email}" style="color:#1B3A6B">${data.company.email}</a>`
        : ''}
    </p>
  </div>

</body>
</html>`;
}
