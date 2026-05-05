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

export interface NotionIntegrationCredential {
  id: string;
  teamId: string;
  providerType: "notion";
  name: string;
  workspaceId: string;
  workspaceName: string;
  botId: string;
  isActive: boolean;
  createdAt: string;
}

export interface TrelloIntegrationCredential {
  id: string;
  teamId: string;
  providerType: "trello";
  name: string;
  workspaceId: string;
  botId: string;
  isActive: boolean;
  createdAt: string;
}

export interface IntegrationConnectUrlResponse {
  url: string;
}

export interface NotionPageSearchResult {
  id: string;
  title: string;
  type?: "page" | "database";
  icon?: string;
  url?: string;
  lastEditedTime?: string;
}

export interface TrelloBoardSearchResult {
  id: string;
  title: string;
  url?: string;
  lastEditedTime?: string;
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

export async function listNotionCredentials(
  teamId: string,
  accessToken: string,
): Promise<NotionIntegrationCredential[]> {
  const res = await fetch(`${BASE_URL}/integrations/${teamId}/notion/credentials`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return parseApiError(res, 'Failed to fetch Notion credentials');
  return res.json();
}

export async function deleteNotionCredential(
  teamId: string,
  credentialId: string,
  accessToken: string,
): Promise<void> {
  const res = await fetch(`${BASE_URL}/integrations/${teamId}/notion/credentials/${credentialId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return parseApiError(res, 'Failed to delete Notion credential');
}

export async function getNotionConnectUrl(
  teamId: string,
  accessToken: string,
): Promise<IntegrationConnectUrlResponse> {
  const res = await fetch(`${BASE_URL}/integrations/${teamId}/notion/connect-url`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return parseApiError(res, 'Failed to get Notion connect URL');
  return res.json();
}

export async function searchNotionPages(
  teamId: string,
  credentialId: string,
  query: string,
  accessToken: string,
): Promise<NotionPageSearchResult[]> {
  const encodedQuery = encodeURIComponent(query || '');
  const res = await fetch(`${BASE_URL}/integrations/${teamId}/notion/credentials/${credentialId}/pages?query=${encodedQuery}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return parseApiError(res, 'Failed to search Notion pages');
  return res.json();
}

export async function importNotionPage(
  teamId: string,
  credentialId: string,
  pageId: string,
  accessToken: string,
  folderId?: string,
): Promise<{ ok: boolean; jobId: string }> {
  const body: { pageId: string; folderId?: string } = { pageId };
  if (folderId) body.folderId = folderId;

  const res = await fetch(`${BASE_URL}/integrations/${teamId}/notion/credentials/${credentialId}/import`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) return parseApiError(res, 'Failed to import Notion page');
  return res.json();
}

export function subscribeNotionImportProgress(
  teamId: string,
  credentialId: string,
  jobId: string,
  accessToken: string,
  onEvent: (event: { stage: string; message: string; percent: number; done?: boolean; error?: string }) => void,
): () => void {
  const url = `${BASE_URL}/integrations/${teamId}/notion/credentials/${credentialId}/import/progress?jobId=${encodeURIComponent(jobId)}`;
  const es = new EventSource(`${url}&token=${encodeURIComponent(accessToken)}`);
  // EventSource doesn't support custom headers — use fetch-based SSE instead
  es.close();

  const ctrl = new AbortController();
  fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: ctrl.signal,
  }).then(async (res) => {
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const parts = buf.split('\n\n');
      buf = parts.pop() ?? '';
      for (const part of parts) {
        const line = part.replace(/^data: /, '').trim();
        if (!line) continue;
        try { onEvent(JSON.parse(line)); } catch { /* ignore */ }
      }
    }
  }).catch(() => {});
  return () => ctrl.abort();
}

export async function listTrelloCredentials(
  teamId: string,
  accessToken: string,
): Promise<TrelloIntegrationCredential[]> {
  const res = await fetch(`${BASE_URL}/integrations/${teamId}/trello/credentials`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return parseApiError(res, 'Failed to fetch Trello credentials');
  return res.json();
}

export async function deleteTrelloCredential(
  teamId: string,
  credentialId: string,
  accessToken: string,
): Promise<void> {
  const res = await fetch(`${BASE_URL}/integrations/${teamId}/trello/credentials/${credentialId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return parseApiError(res, 'Failed to delete Trello credential');
}

export async function getTrelloConnectUrl(
  teamId: string,
  accessToken: string,
): Promise<IntegrationConnectUrlResponse> {
  const res = await fetch(`${BASE_URL}/integrations/${teamId}/trello/connect-url`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return parseApiError(res, 'Failed to get Trello connect URL');
  return res.json();
}

export async function searchTrelloBoards(
  teamId: string,
  credentialId: string,
  query: string,
  accessToken: string,
): Promise<TrelloBoardSearchResult[]> {
  const encodedQuery = encodeURIComponent(query || '');
  const res = await fetch(`${BASE_URL}/integrations/${teamId}/trello/credentials/${credentialId}/boards?query=${encodedQuery}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return parseApiError(res, 'Failed to search Trello boards');
  return res.json();
}

export async function importTrelloBoard(
  teamId: string,
  credentialId: string,
  boardId: string,
  accessToken: string,
): Promise<{ ok: boolean; jobId: string }> {
  const res = await fetch(`${BASE_URL}/integrations/${teamId}/trello/credentials/${credentialId}/import`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ boardId }),
  });
  if (!res.ok) return parseApiError(res, 'Failed to import Trello board');
  return res.json();
}

export function subscribeTrelloImportProgress(
  teamId: string,
  credentialId: string,
  jobId: string,
  accessToken: string,
  onEvent: (event: { stage: string; message: string; percent: number; done?: boolean; error?: string }) => void,
): () => void {
  const url = `${BASE_URL}/integrations/${teamId}/trello/credentials/${credentialId}/import/progress?jobId=${encodeURIComponent(jobId)}`;
  const ctrl = new AbortController();
  fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: ctrl.signal,
  }).then(async (res) => {
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const parts = buf.split('\n\n');
      buf = parts.pop() ?? '';
      for (const part of parts) {
        const line = part.replace(/^data: /, '').trim();
        if (!line) continue;
        try { onEvent(JSON.parse(line)); } catch { /* ignore */ }
      }
    }
  }).catch(() => {});
  return () => ctrl.abort();
}

export async function saveNotionCallback(
  teamId: string,
  code: string,
  accessToken: string,
): Promise<any> {
  const res = await fetch(`${BASE_URL}/integrations/${teamId}/notion/callback`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ code }),
  });
  if (!res.ok) return parseApiError(res, 'Failed to connect Notion');
  return res.json();
}

export async function saveTrelloCallback(
  teamId: string,
  token: string,
  accessToken: string,
): Promise<any> {
  const res = await fetch(`${BASE_URL}/integrations/${teamId}/trello/callback`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ token }),
  });
  if (!res.ok) return parseApiError(res, 'Failed to connect Trello');
  return res.json();
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

// ─── Google Drive ─────────────────────────────────────────────────────────────

export interface GoogleDriveIntegrationCredential {
  id: string;
  teamId: string;
  providerType: 'google_drive';
  name: string;
  email: string;
  googleUserId: string;
  isActive: boolean;
  createdAt: string;
}

export interface GoogleDriveFile {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
  iconLink?: string;
  modifiedTime?: string;
}

export async function listGoogleDriveCredentials(
  teamId: string,
  accessToken: string,
): Promise<GoogleDriveIntegrationCredential[]> {
  const res = await fetch(`${BASE_URL}/integrations/${teamId}/google-drive/credentials`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return parseApiError(res, 'Failed to fetch Google Drive credentials');
  return res.json();
}

export async function deleteGoogleDriveCredential(
  teamId: string,
  credentialId: string,
  accessToken: string,
): Promise<void> {
  const res = await fetch(`${BASE_URL}/integrations/${teamId}/google-drive/credentials/${credentialId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return parseApiError(res, 'Failed to delete Google Drive credential');
}

export async function getGoogleDriveConnectUrl(
  teamId: string,
  accessToken: string,
): Promise<IntegrationConnectUrlResponse> {
  const res = await fetch(`${BASE_URL}/integrations/${teamId}/google-drive/connect-url`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return parseApiError(res, 'Failed to get Google Drive connect URL');
  return res.json();
}

export async function saveGoogleDriveCallback(
  teamId: string,
  code: string,
  accessToken: string,
): Promise<GoogleDriveIntegrationCredential> {
  const res = await fetch(`${BASE_URL}/integrations/${teamId}/google-drive/callback`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  if (!res.ok) return parseApiError(res, 'Failed to connect Google Drive');
  return res.json();
}

export async function searchGoogleDriveFiles(
  teamId: string,
  credentialId: string,
  query: string,
  accessToken: string,
): Promise<GoogleDriveFile[]> {
  const encodedQuery = encodeURIComponent(query || '');
  const res = await fetch(
    `${BASE_URL}/integrations/${teamId}/google-drive/credentials/${credentialId}/files?query=${encodedQuery}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) return parseApiError(res, 'Failed to search Google Drive files');
  return res.json();
}

export async function makeGoogleDriveFilePublic(
  teamId: string,
  credentialId: string,
  fileId: string,
  accessToken: string,
): Promise<{ webViewLink: string }> {
  const res = await fetch(
    `${BASE_URL}/integrations/${teamId}/google-drive/credentials/${credentialId}/files/${encodeURIComponent(fileId)}/make-public`,
    { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) return parseApiError(res, 'Failed to make Google Drive file public');
  return res.json();
}

// ─── OneDrive ─────────────────────────────────────────────────────────────────

export interface OneDriveIntegrationCredential {
  id: string;
  teamId: string;
  providerType: 'onedrive';
  name: string;
  email: string;
  microsoftUserId: string;
  isActive: boolean;
  createdAt: string;
}

export interface OneDriveFile {
  id: string;
  name: string;
  mimeType?: string;
  webUrl?: string;
  size?: number;
  lastModifiedDateTime?: string;
}

export async function listOneDriveCredentials(
  teamId: string,
  accessToken: string,
): Promise<OneDriveIntegrationCredential[]> {
  const res = await fetch(`${BASE_URL}/integrations/${teamId}/onedrive/credentials`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return parseApiError(res, 'Failed to fetch OneDrive credentials');
  return res.json();
}

export async function deleteOneDriveCredential(
  teamId: string,
  credentialId: string,
  accessToken: string,
): Promise<void> {
  const res = await fetch(`${BASE_URL}/integrations/${teamId}/onedrive/credentials/${credentialId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return parseApiError(res, 'Failed to delete OneDrive credential');
}

export async function getOneDriveConnectUrl(
  teamId: string,
  accessToken: string,
): Promise<IntegrationConnectUrlResponse> {
  const res = await fetch(`${BASE_URL}/integrations/${teamId}/onedrive/connect-url`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return parseApiError(res, 'Failed to get OneDrive connect URL');
  return res.json();
}

export async function saveOneDriveCallback(
  teamId: string,
  code: string,
  accessToken: string,
): Promise<OneDriveIntegrationCredential> {
  const res = await fetch(`${BASE_URL}/integrations/${teamId}/onedrive/callback`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  if (!res.ok) return parseApiError(res, 'Failed to connect OneDrive');
  return res.json();
}

export async function searchOneDriveFiles(
  teamId: string,
  credentialId: string,
  query: string,
  accessToken: string,
): Promise<OneDriveFile[]> {
  const encodedQuery = encodeURIComponent(query || '');
  const res = await fetch(
    `${BASE_URL}/integrations/${teamId}/onedrive/credentials/${credentialId}/files?query=${encodedQuery}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) return parseApiError(res, 'Failed to search OneDrive files');
  return res.json();
}

export async function makeOneDriveFilePublic(
  teamId: string,
  credentialId: string,
  fileId: string,
  accessToken: string,
): Promise<{ webUrl: string }> {
  const res = await fetch(
    `${BASE_URL}/integrations/${teamId}/onedrive/credentials/${credentialId}/files/${encodeURIComponent(fileId)}/make-public`,
    { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) return parseApiError(res, 'Failed to make OneDrive file public');
  return res.json();
}

// ─── Payments (Stripe / PayPal / MercadoPago) ─────────────────────────────────

export interface StripeIntegrationCredential {
  id: string;
  teamId: string;
  providerType: 'stripe';
  name: string;
  publishableKey?: string;
  secretKeyMasked: string;
  isActive: boolean;
  createdAt: string;
}

export interface PaypalIntegrationCredential {
  id: string;
  teamId: string;
  providerType: 'paypal';
  name: string;
  clientId?: string;
  clientSecretMasked: string;
  mode?: 'sandbox' | 'live';
  isActive: boolean;
  createdAt: string;
}

export interface MercadopagoIntegrationCredential {
  id: string;
  teamId: string;
  providerType: 'mercadopago';
  name: string;
  accessTokenMasked: string;
  mode?: 'sandbox' | 'live';
  isActive: boolean;
  createdAt: string;
}

export async function listStripeCredentials(teamId: string, accessToken: string): Promise<StripeIntegrationCredential[]> {
  const res = await fetch(`${BASE_URL}/integrations/${teamId}/payments/stripe/credentials`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return parseApiError(res, 'Failed to fetch Stripe credentials');
  return res.json();
}

export async function saveStripeCredential(
  teamId: string,
  payload: { credentialId?: string; name: string; publishableKey?: string; secretKey: string },
  accessToken: string,
): Promise<StripeIntegrationCredential> {
  const res = await fetch(`${BASE_URL}/integrations/${teamId}/payments/stripe/credentials`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) return parseApiError(res, 'Failed to save Stripe credential');
  return res.json();
}

export async function deleteStripeCredential(teamId: string, credentialId: string, accessToken: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/integrations/${teamId}/payments/stripe/credentials/${credentialId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return parseApiError(res, 'Failed to delete Stripe credential');
}

export async function listPaypalCredentials(teamId: string, accessToken: string): Promise<PaypalIntegrationCredential[]> {
  const res = await fetch(`${BASE_URL}/integrations/${teamId}/payments/paypal/credentials`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return parseApiError(res, 'Failed to fetch PayPal credentials');
  return res.json();
}

export async function savePaypalCredential(
  teamId: string,
  payload: { credentialId?: string; name: string; clientId?: string; clientSecret: string; mode?: 'sandbox' | 'live' },
  accessToken: string,
): Promise<PaypalIntegrationCredential> {
  const res = await fetch(`${BASE_URL}/integrations/${teamId}/payments/paypal/credentials`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) return parseApiError(res, 'Failed to save PayPal credential');
  return res.json();
}

export async function deletePaypalCredential(teamId: string, credentialId: string, accessToken: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/integrations/${teamId}/payments/paypal/credentials/${credentialId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return parseApiError(res, 'Failed to delete PayPal credential');
}

export async function listMercadopagoCredentials(teamId: string, accessToken: string): Promise<MercadopagoIntegrationCredential[]> {
  const res = await fetch(`${BASE_URL}/integrations/${teamId}/payments/mercadopago/credentials`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return parseApiError(res, 'Failed to fetch MercadoPago credentials');
  return res.json();
}

export async function saveMercadopagoCredential(
  teamId: string,
  payload: { credentialId?: string; name: string; accessToken: string; mode?: 'sandbox' | 'live' },
  accessToken: string,
): Promise<MercadopagoIntegrationCredential> {
  const res = await fetch(`${BASE_URL}/integrations/${teamId}/payments/mercadopago/credentials`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) return parseApiError(res, 'Failed to save MercadoPago credential');
  return res.json();
}

export async function deleteMercadopagoCredential(teamId: string, credentialId: string, accessToken: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/integrations/${teamId}/payments/mercadopago/credentials/${credentialId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return parseApiError(res, 'Failed to delete MercadoPago credential');
}
