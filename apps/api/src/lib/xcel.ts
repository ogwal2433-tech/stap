import { randomBytes } from 'crypto';

const MTN_PREFIXES    = ['77', '78', '76', '39'];
const AIRTEL_PREFIXES = ['70', '75', '74'];

export function normalisePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('0') && digits.length === 10) return `256${digits.slice(1)}`;
  if (digits.startsWith('256') && digits.length === 12) return digits;
  throw new Error(`Unrecognised phone format: ${phone}`);
}

export function detectNetwork(normalisedPhone: string): 'MTN' | 'AIRTEL' {
  const prefix = normalisedPhone.slice(3, 5); // after '256'
  if (MTN_PREFIXES.includes(prefix))    return 'MTN';
  if (AIRTEL_PREFIXES.includes(prefix)) return 'AIRTEL';
  throw new Error(`Cannot determine network for number starting 256${prefix}`);
}

export function generateExtReference(): string {
  return `STAP-${Date.now()}-${randomBytes(4).toString('hex').toUpperCase()}`;
}

function baseUrl(): string {
  return (process.env.XCEL_BASE_URL ?? 'https://sandbox-api.xcelapp.com').replace(/\/$/, '');
}

function authHeaders(): Record<string, string> {
  return {
    'x-api-key':     process.env.XCEL_API_KEY ?? '',
    'x-merchant-id': process.env.XCEL_MERCHANT_ID ?? '',
    'Content-Type':  'application/json',
  };
}

async function xcelPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, {
    method:  'POST',
    headers: authHeaders(),
    body:    JSON.stringify(body),
    signal:  AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`XCEL API error ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

async function xcelGet<T>(path: string): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, {
    headers: authHeaders(),
    signal:  AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`XCEL API error ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export interface CollectionRequest {
  phone:        string;
  amount:       number;
  network:      string;
  accountName:  string;
  extReference: string;
  description:  string;
  webhookUrl:   string;
}

export interface CollectionResponse {
  success:       boolean;
  message:       string;
  data: {
    reference: string;
    status:    string;
  };
}

export async function initiateCollection(req: CollectionRequest): Promise<CollectionResponse> {
  return xcelPost<CollectionResponse>('/partners/momo/collection', {
    currency:      'UGX',
    phone_number:  req.phone,
    amount:        String(req.amount),
    country:       'UG',
    bank_code:     req.network,
    ext_reference: req.extReference,
    description:   req.description,
    account_name:  req.accountName,
    webhook_url:   req.webhookUrl, // docs say `webhook_utl`; the live API actually requires `webhook_url`
    product_id:    'MOMO_COLLECTION',
  });
}

export interface StatusResponse {
  success: boolean;
  message: string;
  data: {
    status:          string; // numeric code, e.g. "06"
    description:     string; // human-readable state, e.g. "failed" | "success" | "pending"
    reference:       string;
    reason:          string | null;
    clientReference: string;
    transDate:       string;
  };
}

export async function checkPaymentStatus(extReference: string): Promise<StatusResponse> {
  return xcelGet<StatusResponse>(`/partners/momo/payment/status/${extReference}`);
}

// ── Disbursements (payouts to guard mobile money accounts) ─────────────────────

export interface DlCodeRequest {
  amount:          string;
  receiverAccount: string;
  bankCode:        string;
}

interface DlCodeResponse {
  success: boolean;
  message: string;
  data: { dl_code: string };
}

export async function generateDlCode(req: DlCodeRequest): Promise<string> {
  const res = await xcelPost<DlCodeResponse>('/partners/momo/dl-code', {
    amount:           req.amount,
    receiver_account: req.receiverAccount,
    bank_code:        req.bankCode,
    // `config_preset` / `utility` are documented fields, but sending either one
    // (even the merchant's real config_preset value) makes the sandbox 404 on
    // an internal upstream call. Omit them entirely.
  });
  if (!res.data?.dl_code) throw new Error(`Failed to generate DL code: ${res.message}`);
  return res.data.dl_code;
}

export interface DisbursementRequest {
  amount:      number;
  reference:   string;
  dlCode:      string;
  network:     string;
  accountNum:  string;
  accountName: string;
  description: string;
  webhookUrl:  string;
}

export async function initiateDisbursement(req: DisbursementRequest): Promise<CollectionResponse> {
  return xcelPost<CollectionResponse>('/partners/momo/payment', {
    country:      'UG',
    currency:     'UGX',
    amount:       String(req.amount),
    reference:    req.reference,
    dl_code:      req.dlCode,
    bank_code:    req.network,
    account_num:  req.accountNum,
    account_name: req.accountName,
    description:  req.description,
    webhook_url:  req.webhookUrl,
    product_id:   process.env.XCEL_PRODUCT_ID ?? 'EG8O0h_52',
  });
}

export function generateDisbursementRef(guardId: string, period: string): string {
  return `STAP-SAL-${guardId.slice(0, 6).toUpperCase()}-${period.replace('-', '')}-${Date.now()}`;
}
