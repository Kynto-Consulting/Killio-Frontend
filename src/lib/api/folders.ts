import { fetchApi } from './client';

export type Folder = {
  id: string;
  teamId: string;
  parentFolderId?: string | null;
  name: string;
  icon?: string | null;
  color?: string | null;
  createdByUserId?: string | null;
  createdAt: string;
  updatedAt: string;
};

export async function listFolders(
  teamId: string, 
  accessToken: string,
  parentFolderId?: string
): Promise<Folder[]> {
  const url = parentFolderId 
    ? `/folders?teamId=${teamId}&parentFolderId=${parentFolderId}` 
    : `/folders?teamId=${teamId}`;
  return fetchApi(url, { accessToken });
}

export async function createFolder(
  payload: { teamId: string; name: string; parentFolderId?: string; icon?: string; color?: string },
  accessToken: string
): Promise<Folder> {
  return fetchApi('/folders', {
    method: 'POST',
    body: JSON.stringify(payload),
    accessToken,
  });
}

export async function updateFolder(
  id: string,
  payload: { name?: string; icon?: string; color?: string },
  accessToken: string
): Promise<Folder> {
  return fetchApi(`/folders/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
    accessToken,
  });
}

export async function deleteFolder(id: string, accessToken: string): Promise<void> {
  return fetchApi(`/folders/${id}`, {
    method: 'DELETE',
    accessToken,
  });
}