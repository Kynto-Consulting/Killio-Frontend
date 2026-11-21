"use client";

import { useEffect, useMemo } from "react";

import { useRoomPermissions } from "@/hooks/use-room-permissions";
import { callForcedOff, callRestrictions, type CallRestrictions } from "@/lib/rooms/call-rights";

interface CallSwitches {
  isInCall: boolean;
  isAudioMuted: boolean;
  isVideoMuted: boolean;
  isScreenSharing: boolean;
  toggleAudio: () => void;
  toggleVideo: () => void;
  toggleScreenShare: () => void | Promise<void>;
}

/**
 * What the room's rights (`GET /rooms/:id/permissions/me`) take away from the call bar of the call the person is in, and the
 * enforcement on this side: a feature the room does not allow is switched off if it is on (the call itself is peer to peer, the
 * server cannot cut a stream). While the answer is loading, or when it fails, nothing is restricted: the person already got in.
 */
export function useCallRestrictions(roomId: string | null | undefined, accessToken: string | null | undefined, call: CallSwitches): CallRestrictions {
  const { access, controls, isReady, error } = useRoomPermissions(roomId, accessToken);
  const restrictions = useMemo<CallRestrictions>(
    () => (roomId && isReady && !error ? callRestrictions(controls, access) : {}),
    [roomId, isReady, error, controls, access],
  );

  const { isInCall, isAudioMuted, isVideoMuted, isScreenSharing, toggleAudio, toggleVideo, toggleScreenShare } = call;
  useEffect(() => {
    if (!isInCall) return;
    const off = callForcedOff(restrictions, { audioOn: !isAudioMuted, videoOn: !isVideoMuted, screenOn: isScreenSharing });
    if (off.includes("speak")) toggleAudio();
    if (off.includes("video")) toggleVideo();
    if (off.includes("screenShare")) void toggleScreenShare();
    // The toggles are stable callbacks of the call hook; the effect must run when a right or a switch changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restrictions, isInCall, isAudioMuted, isVideoMuted, isScreenSharing]);

  return restrictions;
}
