// XCEL "Partner Transaction API" — a separate product surface from the
// Merchant ID-based Collections API in xcel.ts. Different base URLs, different
// auth (Partner ID, not Merchant ID), different DL-code flow (OTP-based).
// Used for salary disbursements to guard mobile money wallets.

function partnerBaseUrl(): string {
  return (process.env.XCEL_PARTNER_BASE_URL ?? 'https://sandbox-api.xcelapp.com/xas/v1').replace(/\/$/, '');
}

function dlCodeBaseUrl(): string {
  return (process.env.XCEL_DL_CODE_BASE_URL ?? 'https://sandbox-api.xcelapp.com/esa-api/api').replace(/\/$/, '');
}

function partnerAuthHeaders(): Record<string, string> {
  return {
    'X-PARTNER-ID': process.env.XCEL_PARTNER_ID ?? '',
    'X-API-KEY':    process.env.XCEL_PARTNER_API_KEY ?? '',
    'Content-Type': 'application/json',
  };
}

async function partnerPost<T>(base: string, path: string, body: unknown): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    method:  'POST',
    headers: partnerAuthHeaders(),
    body:    JSON.stringify(body),
    signal:  AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`XCEL Partner API error ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

async function partnerGet<T>(base: string, path: string): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    headers: partnerAuthHeaders(),
    signal:  AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`XCEL Partner API error ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

// ── DL code (dynamic-link OTP) ──────────────────────────────────────────────

export interface DynamicLinkOtpRequest {
  amount:     number;
  bankCode:   string; // MTN | AIRTEL
  accountNum: string; // guard's mobile money number
}

interface DynamicLinkOtpResponse {
  // Docs say `{ success, data: { otp_sid, message } }` — the live sandbox
  // actually returns `{ status, otp_sid, message }`, flat, no `data` wrapper.
  status:  boolean;
  otp_sid: string;
  message: string;
}

export async function generateDynamicLinkOtp(req: DynamicLinkOtpRequest): Promise<string> {
  const res = await partnerPost<DynamicLinkOtpResponse>(dlCodeBaseUrl(), '/otp/generate/dynamic-link', {
    config_preset: process.env.XCEL_CONFIG_PRESET ?? '',
    transaction_params: {
      src_amount: req.amount.toFixed(2),
      des_amount: req.amount.toFixed(2),
      // payeeId is the concatenation of bank code + destination account number.
      payeeId: `${req.bankCode}${req.accountNum}`,
      payerId: process.env.XCEL_PARTNER_ID ?? '',
    },
  });
  if (!res.otp_sid) throw new Error(`Failed to generate dynamic-link OTP: ${res.message ?? 'unknown error'}`);
  return res.otp_sid;
}

// ── Wallet payment (mobile money disbursement) ──────────────────────────────

export interface WalletPaymentRequest {
  amount:      number;
  reference:   string;
  dlCode:      string;
  accountNum:  string;
  description: string;
}

export interface PartnerPaymentResponse {
  success: boolean;
  message: string;
  data: { reference: string; status: string };
}

export async function initiateWalletPayment(req: WalletPaymentRequest): Promise<PartnerPaymentResponse> {
  return partnerPost<PartnerPaymentResponse>(partnerBaseUrl(), '/external/payment/wallet', {
    country:     'UG',
    currency:    'UGX',
    amount:      String(req.amount),
    to_account:  req.accountNum,
    dl_code:     req.dlCode,
    to_business: false,
    reference:   req.reference,
    description: req.description,
  });
}

// ── Bank payment (mobile money disbursement via the bank-transfer surface) ──
// The wallet endpoint above rejects every receiver with "Receiver information
// not found" regardless of parameters; the bank endpoint accepts the same
// mobile-money-as-bank-code shape (bank_code = network, account_num = phone).

export interface BankPaymentRequest {
  amount:         number;
  reference:      string;
  dlCode:         string;
  bankCode:       string; // MTN | AIRTEL
  accountNum:     string; // guard's mobile money number
  accountName:    string;
  description:    string;
  receiverFirstName: string;
  receiverLastName:  string;
}

export async function initiateBankPayment(req: BankPaymentRequest): Promise<PartnerPaymentResponse> {
  return partnerPost<PartnerPaymentResponse>(partnerBaseUrl(), '/external/payment/bank', {
    amount:       req.amount.toFixed(2),
    currency:     'UGX',
    country:      'UG',
    reference:    req.reference,
    description:  req.description,
    bank_code:    req.bankCode,
    account_num:  req.accountNum,
    account_name: req.accountName,
    dl_code:      req.dlCode,
    initiator: {
      first_name: 'STAP',
      last_name:  'Security',
      purpose:    'Salary Payment',
    },
    receiver: {
      first_name:  req.receiverFirstName,
      last_name:   req.receiverLastName,
      account_num: req.accountNum,
      bank_code:   req.bankCode,
      currency:    'UGX',
    },
  });
}

// ── Status check ─────────────────────────────────────────────────────────────

export interface PartnerStatusResponse {
  success: boolean;
  message: string;
  data: { status: string; description: string; reference: string };
}

export async function checkPartnerPaymentStatus(reference: string): Promise<PartnerStatusResponse> {
  return partnerGet<PartnerStatusResponse>(partnerBaseUrl(), `/external/payment/status/${reference}`);
}
