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
