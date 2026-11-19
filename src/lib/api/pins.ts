import { fetchApi } from './client';

export type PinType = 'board' | 'mesh' | 'document' | 'folder';

export interface Pin {
  entityType: PinType;
  entityId: string;
  position: number;
  createdAt: string;
}

const base = (teamId: string) => `/teams/${encodeURIComponent(teamId)}/pins`;
const one = (teamId: string, type: PinType, id: string) => `${base(teamId)}/${type}/${encodeURIComponent(id)}`;

export const listPins = (teamId: string, accessToken: string) => fetchApi<Pin[]>(base(teamId), { accessToken });
export const pinEntity = (teamId: string, type: PinType, id: string, accessToken: string) => fetchApi<Pin[]>(one(teamId, type, id), { method: 'PUT', accessToken });
export const unpinEntity = (teamId: string, type: PinType, id: string, accessToken: string) => fetchApi<Pin[]>(one(teamId, type, id), { method: 'DELETE', accessToken });
