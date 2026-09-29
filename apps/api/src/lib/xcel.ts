import { randomBytes } from 'crypto';
import { xcelConfig } from '../services/integrationSettings';

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
  return `S360-${Date.now()}-${randomBytes(4).toString('hex').toUpperCase()}`;
}

/**
 * Endpoint and credentials come from the settings resolver — database first,
 * .env second — rather than being read from the environment at each call. That
 * is what lets a key be rotated from the Settings page without a redeploy.
 */
async function baseUrl(): Promise<string> {
  return (await xcelConfig()).baseUrl;
}

async function authHeaders(): Promise<Record<string, string>> {
  const cfg = await xcelConfig();
  if (!cfg.apiKey || !cfg.merchantId) {
    throw new Error(
      'The XCEL payment gateway is not configured. Set the API key and merchant ID in ' +
      'Settings → Integrations.',
    );
  }
  return {
    'x-api-key':     cfg.apiKey,
    'x-merchant-id': cfg.merchantId,
    'Content-Type':  'application/json',
  };
}

async function xcelPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${await baseUrl()}${path}`, {
    method:  'POST',
    headers: await authHeaders(),
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
  const res = await fetch(`${await baseUrl()}${path}`, {
    headers: await authHeaders(),
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
// Salary disbursements use the separate Partner Transaction API — see
// xcelPartner.ts (different auth model, different DL-code/payment flow).

export function generateDisbursementRef(guardId: string, period: string): string {
  return `S360-SAL-${guardId.slice(0, 6).toUpperCase()}-${period.replace('-', '')}-${Date.now()}`;
}
