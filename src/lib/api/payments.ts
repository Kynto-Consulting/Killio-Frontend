import { fetchApi } from './client';

export type CreatePaymentLinkPayload = {
  // The brick lives in a document (documentId) or a card (cardId); brickId is the payment brick id.
  documentId?: string;
  cardId?: string;
  brickId?: string;
  title: string;
  description?: string;
  amount: number;
  currency: string;
  provider: 'stripe' | 'paypal' | 'mercadopago';
  connectionId?: string;
};

export type PaymentLinkResponse = {
  checkoutUrl: string;
  externalProductId?: string | null;
};

export async function createPaymentLink(
  payload: CreatePaymentLinkPayload,
  accessToken?: string
): Promise<PaymentLinkResponse> {
  // The backend answers { success, data }; fetchApi returns the raw JSON, so unwrap it here.
  const response = await fetchApi<{ data?: PaymentLinkResponse } & Partial<PaymentLinkResponse>>('/api/payments/links', {
    method: 'POST',
    body: JSON.stringify(payload),
    accessToken,
  });
  return (response?.data ?? response) as PaymentLinkResponse;
}

export type PaymentBrickStatus = {
  status: 'pending' | 'paid' | 'failed' | 'refunded';
  paidAt: string | null;
  payerEmail: string | null;
  provider: 'stripe' | 'paypal' | 'mercadopago' | null;
};

/** Server-confirmed status of a payment brick (the browser never decides it). */
export async function getPaymentBrickStatus(brickId: string, accessToken?: string): Promise<PaymentBrickStatus> {
  const response = await fetchApi<{ data: PaymentBrickStatus }>(`/api/payments/status/${encodeURIComponent(brickId)}`, {
    accessToken,
  });
  return response.data;
}
