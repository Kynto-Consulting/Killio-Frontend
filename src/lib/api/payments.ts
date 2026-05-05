import { fetchApi } from './client';

export type CreatePaymentLinkPayload = {
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
  return fetchApi('/api/payments/links', {
    method: 'POST',
    body: JSON.stringify(payload),
    accessToken,
  });
}
