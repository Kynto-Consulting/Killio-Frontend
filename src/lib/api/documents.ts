import { fetchApi } from './client';

export type DocumentMembershipRole = 'owner' | 'editor' | 'commenter' | 'viewer';

export type DocumentSummary = {
  id: string;
  title: string;
  teamId: string;
  folderId?: string;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
};

export type DocumentBrick = {
  id: string;
  documentId: string;
  kind: string;
  position: number;
  content: DocumentBrickContent;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
};

export type DocumentBrickComment = {
  id: string;
  text: string;
  createdAt: string;
  userId?: string | null;
  userName?: string | null;
  resolved?: boolean;
};

export type DocumentBrickContent = Record<string, any> & {
  comments?: DocumentBrickComment[];
};

export type DocumentView = DocumentSummary & {
  role: DocumentMembershipRole;
  bricks: DocumentBrick[];
};

export async function listDocuments(teamId: string, accessToken: string, folderId?: string): Promise<DocumentSummary[]> {
  const url = folderId ? `/documents?teamId=${teamId}&folderId=${folderId}` : `/documents?teamId=${teamId}`;
  return fetchApi(url, { accessToken });
}

export async function createDocument(
  payload: { teamId: string; title: string; folderId?: string },
  accessToken: string
): Promise<DocumentSummary> {
  return fetchApi('/documents', {
    method: 'POST',
    body: JSON.stringify(payload),
    accessToken,
  });
}

export async function getDocument(documentId: string, accessToken: string): Promise<DocumentView> {
  return fetchApi(`/documents/${documentId}`, { accessToken });
}

export async function getDocumentExportUrl(documentId: string, format: 'pdf' | 'docx', style: 'carta' | 'harvard', paperSize: 'letter' | 'A4', accessToken: string): Promise<string> {
  // Rather than downloading via fetch, we can just return the authorized URL if we had a cookie...
  // However, since we use bearer tokens, we need to fetch the blob.
  const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1'}/documents/${documentId}/export?format=${format}&style=${style}&paperSize=${paperSize}`, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  if (!response.ok) throw new Error('Failed to export document');
  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

export async function updateDocumentTitle(
  documentId: string,
  title: string,
  accessToken: string
): Promise<void> {
  return fetchApi(`/documents/${documentId}/title`, {
    method: 'PUT',
    body: JSON.stringify({ title }),
    accessToken,
  });
}

export async function deleteDocument(
  documentId: string,
  accessToken: string
): Promise<void> {
  return fetchApi(`/documents/${documentId}`, {
    method: 'DELETE',
    accessToken,
  });
}

export async function createDocumentBrick(
  documentId: string,
  payload: { kind: string; position: number; content: any },
  accessToken: string
): Promise<DocumentBrick> {
  return fetchApi(`/documents/${documentId}/bricks`, {
    method: 'POST',
    body: JSON.stringify(payload),
    accessToken,
  });
}

export async function reorderDocumentBricks(
  documentId: string,
  updates: { id: string; position: number }[],
  accessToken: string
): Promise<void> {
  return fetchApi(`/documents/${documentId}/bricks/reorder`, {
    method: 'PUT',
    body: JSON.stringify({ updates }),
    accessToken,
  });
}

export async function updateDocumentBrick(
  documentId: string,
  brickId: string,
  content: any,
  accessToken: string
): Promise<DocumentBrick> {
  return fetchApi(`/documents/${documentId}/bricks/${brickId}`, {
    method: 'PUT',
    body: JSON.stringify({ content }),
    accessToken,
  });
}

export async function deleteDocumentBrick(
  documentId: string,
  brickId: string,
  accessToken: string
): Promise<void> {
  return fetchApi(`/documents/${documentId}/bricks/${brickId}`, {
    method: 'DELETE',
    accessToken,
  });
}

export async function addDocumentMember(
  documentId: string,
  email: string,
  role: DocumentMembershipRole,
  accessToken: string
): Promise<void> {
  return fetchApi(`/documents/${documentId}/members`, {
    method: 'POST',
    body: JSON.stringify({ email, role }),
    accessToken,
  });
}

export async function listDocumentComments(documentId: string, accessToken: string): Promise<any[]> {
  return fetchApi(`/documents/${documentId}/comments`, { accessToken });
}

export async function addDocumentComment(
  documentId: string,
  text: string,
  accessToken: string
): Promise<any> {
  return fetchApi(`/documents/${documentId}/comments`, {
    method: 'POST',
    body: JSON.stringify({ text }),
    accessToken,
  });
}
