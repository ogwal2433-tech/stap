import { xcelConfig } from '../services/integrationSettings';
// XCEL "Partner Transaction API" — a separate product surface from the
// Merchant ID-based Collections API in xcel.ts. Different base URLs, different
// auth (Partner ID, not Merchant ID), different DL-code flow (OTP-based).
// Used for salary disbursements to guard mobile money wallets.

// Endpoints and credentials come from the settings resolver — database first,
// .env second. This file still read process.env directly after the collections
// client moved across, so disbursement was the one integration the Settings
// page could not actually configure.
async function partnerBaseUrl(): Promise<string> {
  return (await xcelConfig()).partnerBaseUrl;
}

async function dlCodeBaseUrl(): Promise<string> {
  return (await xcelConfig()).dlCodeBaseUrl;
}

async function partnerAuthHeaders(): Promise<Record<string, string>> {
  const cfg = await xcelConfig();
  if (!cfg.partnerId || !cfg.partnerApiKey) {
    throw new Error(
      'Salary disbursement is not configured. Set the XCEL Partner ID and Partner API key in ' +
      'Settings → Integrations.',
    );
  }
  return {
    'X-PARTNER-ID': cfg.partnerId,
    'X-API-KEY':    cfg.partnerApiKey,
    'Content-Type': 'application/json',
  };
}

async function partnerPost<T>(base: string, path: string, body: unknown): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    method:  'POST',
    headers: await partnerAuthHeaders(),
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
    headers: await partnerAuthHeaders(),
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
  const cfg = await xcelConfig();
  const res = await partnerPost<DynamicLinkOtpResponse>(await dlCodeBaseUrl(), '/otp/generate/dynamic-link', {
    config_preset: cfg.configPreset,
    transaction_params: {
      src_amount: req.amount.toFixed(2),
      des_amount: req.amount.toFixed(2),
      // payeeId is the concatenation of bank code + destination account number.
      payeeId: `${req.bankCode}${req.accountNum}`,
      // The account being debited. Was the partner id; XCEL documents the
      // merchant account here, and merchantAccount falls back to the partner id
      // so accounts issued one identifier for both are unaffected.
      payerId: cfg.merchantAccount,
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
  return partnerPost<PartnerPaymentResponse>(await partnerBaseUrl(), '/external/payment/wallet', {
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

// ── Salary disbursement ─────────────────────────────────────────────────────
// The path is a setting, defaulting to /external/payment/momo, which is the
// surface XCEL documents for this and the one the working request uses.
//
// It is configurable because which surface an account may use has already
// varied here: /external/payment/wallet rejects every receiver with "Receiver
// information not found" regardless of parameters, and /external/payment/bank
// was used instead for a time — it accepts the same mobile-money-as-bank-code
// shape. The body below is identical across all three, so switching path is
// the only change any of them needs.

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
  const cfg = await xcelConfig();
  return partnerPost<PartnerPaymentResponse>(await partnerBaseUrl(), cfg.disbursementPath, {
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
      first_name: 'Security360',
      last_name:  'Ltd',
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
  return partnerGet<PartnerStatusResponse>(await partnerBaseUrl(), `/external/payment/status/${reference}`);
}
