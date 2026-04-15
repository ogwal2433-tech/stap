import { AppError } from '../errors/AppError';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface YoPaymentRequest {
  amount:            number;   // UGX
  msisdn:            string;   // phone number
  narrative:         string;
  internalReference: string;
  externalReference?: string;
}

export interface YoPaymentResponse {
  success:        boolean;
  transactionRef: string;
  status:         string;
  message:        string;
}

// ── YoPayments service ─────────────────────────────────────────────────────────

class YoPayments {
  async requestPayment(req: YoPaymentRequest): Promise<YoPaymentResponse> {
    console.log('YO_PAYMENT_REQUEST:', req);

    if (process.env.NODE_ENV === 'production' && process.env.YO_API_USERNAME) {
      // TODO: Implement real Yo! Payments API call when merchant account is approved
      // POST to YO_API_URL with XML payload matching Yo! Payments spec
      // Parse XML response and map to YoPaymentResponse
      throw new AppError('Yo! Payments not yet configured. Contact administrator.', 503);
    }

    // Development/staging stub
    return {
      success:        true,
      transactionRef: `YO-STUB-${Date.now()}`,
      status:         'PENDING',
      message:        'Payment request submitted (stub)',
    };
  }

  async requestBulkPayment(payments: YoPaymentRequest[]): Promise<YoPaymentResponse[]> {
    const results: YoPaymentResponse[] = [];
    for (const p of payments) {
      results.push(await this.requestPayment(p));
    }
    return results;
  }
}

export const yoPayments = new YoPayments();
