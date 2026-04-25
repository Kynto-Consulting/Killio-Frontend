const BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL
  ?? process.env.NEXT_PUBLIC_KILLIO_API_URL
  ?? process.env.NEXT_PUBLIC_API_URL
  ?? 'http://localhost:4000'
).replace(/\/$/, '');

export type TeamPlanTier = 'free' | 'pro' | 'max' | 'enterprise';

export interface RagPolicy {
  dailyBaseSync: number;
  dailyExtraSync: number;
  extraThresholdPct: number | null;
}

export interface BillingPlanDefinition {
  tier: TeamPlanTier;
  label: string;
  priceCentsMonthly: number | null;
  currency: 'PEN';
  scripts: {
    monthlyRunLimit: number | null;
  };
  ai: {
    monthlyCreditLimit: number;
  };
  killioTables: {
    maxTables: number | null;
    storageLimitMb: number | null;
  };
  rag: RagPolicy;
  checkoutEnabled: boolean;
}

export interface TeamBillingSummary {
  teamId: string;
  currentPlanTier: TeamPlanTier;
  billingOwnerUserId: string;
  billingOwnerName: string;
  isBillingOwner: boolean;
  plans: BillingPlanDefinition[];
  billingEmail: string;
  mercadoPago: {
    configured: boolean;
    publicKey: string | null;
    environment: 'sandbox' | 'production';
  };
}

export type BillingCheckoutResponse =
  | {
      mode: 'wallet_brick';
      checkoutId: string;
      targetPlanTier: TeamPlanTier;
      amountCents: number;
      currency: 'PEN';
      preferenceId: string;
      initPoint: string;
      publicKey: string;
    }
  | {
      mode: 'contact_sales';
      billingEmail: string;
      message: string;
    };

async function parseApiError(res: Response, fallbackMessage: string): Promise<never> {
  let message = fallbackMessage;
  try {
    const payload = await res.json();
    if (typeof payload?.message === 'string') {
      message = payload.message;
    } else if (Array.isArray(payload?.message) && typeof payload.message[0] === 'string') {
      message = payload.message[0];
    }
  } catch {
    // keep fallback
  }
  throw new Error(message);
}

export async function getTeamBillingSummary(teamId: string, accessToken: string): Promise<TeamBillingSummary> {
  const res = await fetch(`${BASE_URL}/billing/team/${encodeURIComponent(teamId)}/summary`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    return parseApiError(res, 'Failed to load billing summary.');
  }

  return res.json();
}

export async function createTeamCheckout(
  teamId: string,
  targetPlanTier: TeamPlanTier,
  accessToken: string,
): Promise<BillingCheckoutResponse> {
  const res = await fetch(`${BASE_URL}/billing/team/${encodeURIComponent(teamId)}/checkout`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ targetPlanTier }),
  });

  if (!res.ok) {
    return parseApiError(res, 'Failed to create checkout session.');
  }

  return res.json();
}
