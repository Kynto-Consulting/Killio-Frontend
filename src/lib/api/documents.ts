import { fetchApi } from './client';

export type DocumentMembershipRole = 'owner' | 'editor' | 'commenter' | 'viewer';

export type DocumentSummary = {
  id: string;
  title: string;
  teamId: string;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
};

export type DocumentBrick = {
  id: string;
  documentId: string;
  kind: string;
  position: number;
  content: Record<string, any>;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
};

export type DocumentView = DocumentSummary & {
  role: DocumentMembershipRole;
  bricks: DocumentBrick[];
};

export async function listDocuments(teamId: string, accessToken: string): Promise<DocumentSummary[]> {
  return fetchApi(`/documents?teamId=${teamId}`, { accessToken });
}

export async function createDocument(
  payload: { teamId: string; title: string },
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
