const BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL
  ?? process.env.NEXT_PUBLIC_KILLIO_API_URL
  ?? process.env.NEXT_PUBLIC_API_URL
  ?? 'http://localhost:4000'
).replace(/\/$/, '');

export type TeamPlanTier = 'free' | 'pro' | 'max' | 'enterprise';
export type BillingCycle = 'monthly' | 'yearly';

export interface RagPolicy {
  dailyBaseSync: number;
  dailyExtraSync: number;
  extraThresholdPct: number | null;
}

export interface BillingPlanDefinition {
  tier: TeamPlanTier;
  label: string;
  priceCentsMonthly: number | null;
  priceCentsYearly: number | null;
  yearlyDiscountPct: number;
  trialDays: number;
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
  activity: {
    historyRetentionDays: number | null;
    auditLogs: boolean;
  };
  meshBoards: {
    maxBoards: number | null;
  };
  support: {
    priority: boolean;
    custom: boolean;
    ssoScim: boolean;
  };
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
  subscription: {
    status: 'trialing' | 'active' | 'past_due' | 'cancelled' | 'expired';
    planTier: TeamPlanTier;
    billingCycle: BillingCycle;
    trialEndsAt: string | null;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    providerStatus: string | null;
  } | null;
  trial: {
    active: {
      planTier: TeamPlanTier;
      endsAt: string;
    } | null;
    eligible: {
      pro: boolean;
      max: boolean;
    };
  };
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
      billingCycle: BillingCycle;
      checkoutKind: 'subscription' | 'one_time';
      amountCents: number;
      currency: 'PEN';
      preferenceId: string;
      initPoint: string;
      publicKey: string;
    }
  | {
      mode: 'trial_activated';
      targetPlanTier: TeamPlanTier;
      billingCycle: BillingCycle;
      trialEndsAt: string;
    }
  | {
      mode: 'contact_sales';
      billingEmail: string;
      message: string;
    };

export interface TeamSubscriptionUpdateResponse {
  ok: boolean;
  cancelAtPeriodEnd?: boolean;
  cancelledImmediately?: boolean;
  alreadyCancelled?: boolean;
}

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
  options?: {
    billingCycle?: BillingCycle;
    startTrial?: boolean;
  },
): Promise<BillingCheckoutResponse> {
  const res = await fetch(`${BASE_URL}/billing/team/${encodeURIComponent(teamId)}/checkout`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      targetPlanTier,
      billingCycle: options?.billingCycle,
      startTrial: options?.startTrial,
    }),
  });

  if (!res.ok) {
    return parseApiError(res, 'Failed to create checkout session.');
  }

  return res.json();
}

export async function cancelTeamSubscription(
  teamId: string,
  accessToken: string,
): Promise<TeamSubscriptionUpdateResponse> {
  const res = await fetch(`${BASE_URL}/billing/team/${encodeURIComponent(teamId)}/subscription/cancel`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    return parseApiError(res, 'Failed to cancel subscription.');
  }

  return res.json();
}

export async function resumeTeamSubscription(
  teamId: string,
  accessToken: string,
): Promise<TeamSubscriptionUpdateResponse> {
  const res = await fetch(`${BASE_URL}/billing/team/${encodeURIComponent(teamId)}/subscription/resume`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    return parseApiError(res, 'Failed to resume subscription.');
  }

  return res.json();
}
