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
  stripeSecretKey?: string;
  stripeWebhookSecret?: string;
  paypalClientId?: string;
  paypalClientSecret?: string;
  paypalMode?: 'sandbox' | 'live';
  mercadopagoAccessToken?: string;
  mercadopagoMode?: 'sandbox' | 'live';
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
