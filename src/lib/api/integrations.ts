const BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL
  ?? process.env.NEXT_PUBLIC_KILLIO_API_URL
  ?? process.env.NEXT_PUBLIC_API_URL
  ?? 'http://localhost:4000'
).replace(/\/$/, '');

export interface GithubAppInstallation {
  id: string;
  teamId: string;
  installationId: number;
  accountLogin: string;
  accountType: string;
  isActive: boolean;
  createdAt: string;
}

export interface GithubConnectUrlResponse {
  url: string;
  state: string;
}

export interface GithubInstallationRepository {
  id: number;
  name: string;
  fullName: string;
  private: boolean;
  defaultBranch: string;
}

export interface GithubInstallationBranch {
  name: string;
  isProtected: boolean;
  commitSha: string;
}

export interface WhatsappManualCredential {
  id: string;
  teamId: string;
  providerType: "whatsapp";
  name: string;
  phoneNumberId: string;
  accessTokenMasked: string;
  isActive: boolean;
  createdAt: string;
}

export interface SlackWebhookManualCredential {
  id: string;
  teamId: string;
  providerType: "slack_webhook";
  name: string;
  webhookUrlMasked: string;
  isActive: boolean;
  createdAt: string;
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
    // Keep fallback message when response body is not JSON.
  }
  throw new Error(message);
}

export async function listGithubInstallations(
  teamId: string,
  accessToken: string,
): Promise<GithubAppInstallation[]> {
  const res = await fetch(`${BASE_URL}/integrations/${teamId}/github`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error('Failed to fetch GitHub installations');
  return res.json();
}

export async function listWhatsappCredentials(
  teamId: string,
  accessToken: string,
): Promise<WhatsappManualCredential[]> {
  const res = await fetch(`${BASE_URL}/integrations/${teamId}/whatsapp/credentials`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return parseApiError(res, 'Failed to fetch WhatsApp credentials');
  return res.json();
}

export async function saveWhatsappCredential(
  teamId: string,
  payload: {
    credentialId?: string;
    name: string;
    phoneNumberId: string;
    accessToken: string;
  },
  accessToken: string,
): Promise<WhatsappManualCredential> {
  const res = await fetch(`${BASE_URL}/integrations/${teamId}/whatsapp/credentials`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) return parseApiError(res, 'Failed to save WhatsApp credential');
  return res.json();
}

export async function deleteWhatsappCredential(
  teamId: string,
  credentialId: string,
  accessToken: string,
): Promise<void> {
  const res = await fetch(`${BASE_URL}/integrations/${teamId}/whatsapp/credentials/${credentialId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return parseApiError(res, 'Failed to delete WhatsApp credential');
}

export async function listSlackWebhookCredentials(
  teamId: string,
  accessToken: string,
): Promise<SlackWebhookManualCredential[]> {
  const res = await fetch(`${BASE_URL}/integrations/${teamId}/slack/webhook-credentials`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return parseApiError(res, 'Failed to fetch Slack webhook credentials');
  return res.json();
}

export async function saveSlackWebhookCredential(
  teamId: string,
  payload: {
    credentialId?: string;
    name: string;
    webhookUrl: string;
  },
  accessToken: string,
): Promise<SlackWebhookManualCredential> {
  const res = await fetch(`${BASE_URL}/integrations/${teamId}/slack/webhook-credentials`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) return parseApiError(res, 'Failed to save Slack webhook credential');
  return res.json();
}

export async function deleteSlackWebhookCredential(
  teamId: string,
  credentialId: string,
  accessToken: string,
): Promise<void> {
  const res = await fetch(`${BASE_URL}/integrations/${teamId}/slack/webhook-credentials/${credentialId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return parseApiError(res, 'Failed to delete Slack webhook credential');
}

export async function saveGithubInstallation(
  teamId: string,
  installationId: number,
  accessToken: string,
  opts?: { accountLogin?: string; accountType?: string },
): Promise<GithubAppInstallation> {
  const res = await fetch(`${BASE_URL}/integrations/${teamId}/github/install`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ installationId, ...opts }),
  });
  if (!res.ok) throw new Error('Failed to save GitHub installation');
  return res.json();
}

export async function getGithubConnectUrl(
  teamId: string,
  accessToken: string,
): Promise<GithubConnectUrlResponse> {
  const res = await fetch(`${BASE_URL}/integrations/${teamId}/github/connect-url`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error('Failed to get GitHub connect URL');
  return res.json();
}

export async function deleteGithubInstallation(
  teamId: string,
  installationId: number,
  accessToken: string,
): Promise<void> {
  const res = await fetch(`${BASE_URL}/integrations/${teamId}/github/${installationId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error('Failed to delete GitHub installation');
}

export async function listGithubInstallationRepositories(
  teamId: string,
  installationId: number,
  accessToken: string,
): Promise<GithubInstallationRepository[]> {
  const res = await fetch(`${BASE_URL}/integrations/${teamId}/github/${installationId}/repositories`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return parseApiError(res, 'Failed to fetch GitHub repositories');
  return res.json();
}

export async function listGithubInstallationBranches(
  teamId: string,
  installationId: number,
  repoFullName: string,
  accessToken: string,
): Promise<GithubInstallationBranch[]> {
  const encodedRepo = encodeURIComponent(repoFullName);
  const res = await fetch(`${BASE_URL}/integrations/${teamId}/github/${installationId}/branches?repoFullName=${encodedRepo}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return parseApiError(res, 'Failed to fetch GitHub branches');
  return res.json();
}
