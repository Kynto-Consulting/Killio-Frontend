/** Board view settings (`/boards/:boardId/view-settings`) and team tag groups (`/teams/:teamId/tag-groups`). */
import type { ListViewConfig } from "../boards/categories";
import type { SortRule, TagGroup } from "../boards/sorting";

const API = (process.env.NEXT_PUBLIC_API_BASE_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").replace(/\/$/, "");

export interface ServerSavedView {
  id: string;
  name: string;
  expression: string;
}

export interface ServerBoardViewSettings {
  teamId: string | null;
  sort: SortRule[];
  lists: Record<string, ListViewConfig>;
  savedViews: ServerSavedView[];
  /** ISO timestamps of the last server write (last write wins). */
  meta: { sortUpdatedAt: string | null; listUpdatedAt: Record<string, string> };
}

export interface ServerTagGroup extends TagGroup {
  teamId?: string;
  position: number;
  updatedAt?: string;
}

export interface UpdateBoardViewSettingsBody {
  /** `null` or `[]` clears the board sort. */
  sort?: SortRule[] | null;
  /** `{ [listId]: config | null }`: `null` removes the config. */
  listConfigs?: Record<string, ListViewConfig | null>;
}

export class ApiRequestError extends Error {
  status: number;
  details: unknown;
  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.details = details;
  }
}

async function call<T>(path: string, accessToken: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: init.method ?? "GET",
    headers: { Authorization: `Bearer ${accessToken}`, ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}) },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  if (!res.ok) {
    let payload: any = null;
    try {
      payload = await res.json();
    } catch {
      /* not JSON */
    }
    const message = Array.isArray(payload?.message) ? payload.message.join(", ") : payload?.message;
    throw new ApiRequestError(message || `Request failed (${res.status})`, res.status, payload);
  }
  return (await res.json()) as T;
}

const b = (boardId: string) => `/boards/${encodeURIComponent(boardId)}/view-settings`;
const t = (teamId: string) => `/teams/${encodeURIComponent(teamId)}/tag-groups`;

export const getBoardViewSettings = (boardId: string, accessToken: string) => call<ServerBoardViewSettings>(b(boardId), accessToken);
export const updateBoardViewSettings = (boardId: string, body: UpdateBoardViewSettingsBody, accessToken: string) => call<ServerBoardViewSettings>(b(boardId), accessToken, { method: "PUT", body });
export const createBoardSavedView = (boardId: string, view: ServerSavedView, accessToken: string) => call<ServerSavedView>(`${b(boardId)}/saved-views`, accessToken, { method: "POST", body: view });
export const updateBoardSavedView = (boardId: string, viewId: string, patch: { name?: string; expression?: string }, accessToken: string) =>
  call<ServerSavedView>(`${b(boardId)}/saved-views/${encodeURIComponent(viewId)}`, accessToken, { method: "PATCH", body: patch });
export const deleteBoardSavedView = (boardId: string, viewId: string, accessToken: string) => call<{ deleted: true }>(`${b(boardId)}/saved-views/${encodeURIComponent(viewId)}`, accessToken, { method: "DELETE" });

export const listTeamTagGroups = (teamId: string, accessToken: string) => call<ServerTagGroup[]>(t(teamId), accessToken);
export const createTeamTagGroup = (teamId: string, group: { id?: string; name: string; tags: string[]; position?: number }, accessToken: string) => call<ServerTagGroup>(t(teamId), accessToken, { method: "POST", body: group });
export const updateTeamTagGroup = (teamId: string, groupId: string, patch: { name?: string; tags?: string[]; position?: number }, accessToken: string) =>
  call<ServerTagGroup>(`${t(teamId)}/${encodeURIComponent(groupId)}`, accessToken, { method: "PATCH", body: patch });
export const deleteTeamTagGroup = (teamId: string, groupId: string, accessToken: string) => call<{ deleted: true }>(`${t(teamId)}/${encodeURIComponent(groupId)}`, accessToken, { method: "DELETE" });

/** The HTTP implementation of the sync layer's API (`lib/boards/view-sync`); the token is read at call time so refreshes apply. */
export function createViewSettingsApi(getToken: () => string | null) {
  const token = () => {
    const tk = getToken();
    if (!tk) throw new ApiRequestError("Not signed in", 401);
    return tk;
  };
  return {
    getBoard: (boardId: string) => getBoardViewSettings(boardId, token()),
    putBoard: (boardId: string, body: UpdateBoardViewSettingsBody) => updateBoardViewSettings(boardId, body, token()),
    createSavedView: (boardId: string, view: ServerSavedView) => createBoardSavedView(boardId, view, token()),
    updateSavedView: (boardId: string, viewId: string, patch: { name?: string; expression?: string }) => updateBoardSavedView(boardId, viewId, patch, token()),
    deleteSavedView: (boardId: string, viewId: string) => deleteBoardSavedView(boardId, viewId, token()),
    listTagGroups: (teamId: string) => listTeamTagGroups(teamId, token()),
    createTagGroup: (teamId: string, group: { id: string; name: string; tags: string[]; position: number }) => createTeamTagGroup(teamId, group, token()),
    updateTagGroup: (teamId: string, groupId: string, patch: { name?: string; tags?: string[]; position?: number }) => updateTeamTagGroup(teamId, groupId, patch, token()),
    deleteTagGroup: (teamId: string, groupId: string) => deleteTeamTagGroup(teamId, groupId, token()),
  };
}
