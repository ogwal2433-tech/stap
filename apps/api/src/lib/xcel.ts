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
  return (process.env.XCEL_BASE_URL ?? 'https://sandbox.xcelpay.io/api/v1').replace(/\/$/, '');
}

function authHeaders(): Record<string, string> {
  return {
    Authorization:  `Bearer ${process.env.XCEL_API_KEY ?? ''}`,
    'Content-Type': 'application/json',
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
  extReference: string;
  description:  string;
  webhookUrl:   string;
}

export interface CollectionResponse {
  status:        string;
  transactionId: string;
  message:       string;
}

export async function initiateCollection(req: CollectionRequest): Promise<CollectionResponse> {
  return xcelPost<CollectionResponse>('/partners/momo/collection', {
    merchant_id:   process.env.XCEL_MERCHANT_ID,
    phone:         req.phone,
    amount:        req.amount,
    network:       req.network,
    ext_reference: req.extReference,
    description:   req.description,
    webhook_utl:   req.webhookUrl, // field typo is in the XCEL API spec
  });
}

export interface StatusResponse {
  status:        string;
  transactionId: string | null;
  message:       string;
}

export async function checkPaymentStatus(extReference: string): Promise<StatusResponse> {
  return xcelGet<StatusResponse>(`/partners/momo/status/${extReference}`);
}
