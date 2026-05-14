/**
 * PAR-01 — Typed channel name helpers
 *
 * Central registry for all channel name patterns.
 * Change a channel naming convention here and every hook updates automatically.
 */

export const realtimeChannel = {
  board:    (boardId: string)    => `board:${boardId}`,
  document: (documentId: string) => `document:${documentId}`,
  mesh:     (meshId: string)     => `board:${meshId}`,   // meshes share the board channel namespace
  room:     (roomId: string)     => `room:${roomId}`,
  user:     (userId: string)     => `user:${userId}`,
  team:     (teamId: string)     => `team:${teamId}`,
  script:      (scriptId: string) => `script:${scriptId}`,
  roomSignal:  (roomId: string)   => `room:${roomId}:signal`,
} as const;
