import { API_BASE_URL } from "./client";

export interface UploadResult {
  id: string;
  key: string;
  url: string;
  mimeType: string;
  sizeBytes: number;
  originalName: string;
}

export async function uploadFile(
  file: File,
  accessToken: string,
  options?: {
    ownerScopeType?: "user" | "team" | "board" | "card" | "document";
    ownerScopeId?: string;
    usage?: string;
  }
): Promise<UploadResult> {
  const formData = new FormData();
  formData.append("file", file);

  if (options?.ownerScopeType) formData.append("ownerScopeType", options.ownerScopeType);
  if (options?.ownerScopeId) formData.append("ownerScopeId", options.ownerScopeId);
  if (options?.usage) formData.append("usage", options.usage);

  const response = await fetch(`${API_BASE_URL}/uploads`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: "Upload failed" }));
    throw new Error(err.message || "Upload failed");
  }

  return response.json();
}
