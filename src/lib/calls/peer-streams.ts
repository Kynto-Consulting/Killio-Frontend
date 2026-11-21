/**
 * A peer sends two kinds of video over the same connection: the camera and (while sharing) the screen. They arrive as separate
 * MediaStreams; the sharer announces the id of the screen one. The track can land BEFORE the announcement, so which stream is
 * which is resolved at read time from (arrival order, announced id), never frozen when the track arrives.
 */

export interface HasId {
  id: string;
}

export function addStream<T extends HasId>(streams: T[], stream: T): T[] {
  return streams.some((s) => s.id === stream.id) ? streams : [...streams, stream];
}

export function removeStream<T extends HasId>(streams: T[], streamId: string): T[] {
  return streams.some((s) => s.id === streamId) ? streams.filter((s) => s.id !== streamId) : streams;
}

export function resolvePeerStreams<T extends HasId>(
  streams: T[],
  screenStreamId: string | undefined,
  isSharing: boolean,
): { camera: T | undefined; screen: T | undefined } {
  const screen = isSharing && screenStreamId ? streams.find((s) => s.id === screenStreamId) : undefined;
  // The camera is the first stream that is not the announced screen. A screen stream that arrived before its announcement sits
  // behind the camera (the camera is negotiated with the connection), so "first" is right even before the id is known.
  const camera = streams.find((s) => s.id !== screenStreamId);
  return { camera, screen };
}
