/**
 * Perfect negotiation (the pattern in the WebRTC spec) for renegotiating a live connection when a screen track is added or
 * removed. Both sides may start an offer at the same time ("glare"); one of them has to yield:
 *   - the polite peer rolls its own offer back and accepts the other one,
 *   - the impolite peer ignores the incoming offer and keeps its own.
 * Politeness is derived from the two peer ids, so both sides agree without talking.
 */

export function isPolite(myPeerId: string, remotePeerId: string): boolean {
  return myPeerId > remotePeerId;
}

export type SignalingState = "stable" | "have-local-offer" | "have-remote-offer" | "have-local-pranswer" | "have-remote-pranswer" | "closed";

export function offerCollision(input: { makingOffer: boolean; signalingState: SignalingState }): boolean {
  return input.makingOffer || input.signalingState !== "stable";
}

/** True when the incoming offer must be dropped (we are impolite and our own offer is in flight). */
export function shouldIgnoreOffer(input: { polite: boolean; makingOffer: boolean; signalingState: SignalingState }): boolean {
  return !input.polite && offerCollision(input);
}
