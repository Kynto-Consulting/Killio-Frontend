"use client";

import { useState, useEffect, useRef, useCallback, useMemo, useReducer } from "react";
import { useRealtime } from "@/components/providers/realtime-provider";
import { realtimeChannel } from "@/lib/realtime/channels";
import {
  createCallRecord,
  endCallRecord,
  getActiveCall,
  submitCallTranscript,
  CallTranscriptSegment,
  CallApiError,
  claimScreenShare,
  joinCallPresence,
  leaveCallPresence,
  releaseScreenShare,
  type CallPresence,
} from "@/lib/api/rooms";
import { noticeFromApiError, noticeFromMediaError, type CallNotice } from "@/lib/calls/call-errors";
import { isPolite, shouldIgnoreOffer } from "@/lib/calls/negotiation";
import { addStream, removeStream, resolvePeerStreams } from "@/lib/calls/peer-streams";
import {
  CAMERA_BITRATE_WHILE_SHARING_BPS, classifyCaptureError, screenBitratePerViewer, screenCaptureRequest, screenFramerate,
} from "@/lib/calls/screen-quality";
import {
  actionFromSignal, canStartShare, initialScreenShareState, screenShareReducer, snapshotFromState,
} from "@/lib/calls/screenshare-state";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
import { getFilterStyle } from "@/components/rooms/RoomCallEffectsPanel";
import { VideoEffectsProcessor } from "@/lib/video-effects-processor";

export type VideoFilter = "none" | "blur" | "grayscale" | "warm" | "cool" | "sepia" | "vivid" | "neon" | "vintage" | "noir" | "vaporwave" | "glow";

export interface CallPeer {
  peerId: string;
  displayName: string;
  avatarUrl?: string;
  /** Camera + microphone. */
  stream?: MediaStream;
  /** The shared screen (and its audio, when the sharer sent it). Only while the peer is sharing. */
  screenStream?: MediaStream;
  screenWithAudio?: boolean;
  audioMuted: boolean;
  videoMuted: boolean;
  isScreenSharing: boolean;
}

/** What the hook stores per peer; `stream` / `screenStream` / `isScreenSharing` are derived from `streams` + the share state. */
interface RawPeer {
  peerId: string;
  displayName: string;
  avatarUrl?: string;
  streams: MediaStream[];
  audioMuted: boolean;
  videoMuted: boolean;
}

/** Presence heartbeat toward the server: a participant that misses ~3 of them is out of the call. */
const PRESENCE_HEARTBEAT_MS = 15_000;

interface UserInfo {
  id?: string;
  displayName?: string;
  username?: string;
  email?: string;
  avatarUrl?: string;
}

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    ...(process.env.NEXT_PUBLIC_TURN_URL
      ? [
          {
            urls: process.env.NEXT_PUBLIC_TURN_URL,
            username: process.env.NEXT_PUBLIC_TURN_USERNAME ?? "",
            credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL ?? "",
          },
        ]
      : []),
  ],
};

const MAX_PARTICIPANTS = 6;

export function useRoomCall(
  roomId: string | null | undefined,
  user: UserInfo | null | undefined,
  accessToken: string | null | undefined,
  options?: {
    canManage?: boolean;
    roomType?: string;
  }
) {
  const canManage = options?.canManage ?? false;
  const roomType = options?.roomType ?? "channel";
  const isDm = roomType === "dm";

  // Called unconditionally at top level to satisfy Rules of Hooks.
  // useRealtime() may return null when the provider is not yet mounted.
  const realtime = useRealtime();

  const [isInCall, setIsInCall] = useState(false);
  const [callId, setCallId] = useState<string | null>(null);
  const [callStartTime, setCallStartTime] = useState<number | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [basePeers, setPeers] = useState<RawPeer[]>([]);
  const [shareState, dispatchShare] = useReducer(screenShareReducer, initialScreenShareState);
  const [notice, setNotice] = useState<CallNotice | null>(null);
  const [maxParticipants, setMaxParticipants] = useState(MAX_PARTICIPANTS);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoMuted, setIsVideoMuted] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isCameraFilterActive, setIsCameraFilterActive] = useState(false);
  const [activeFilter, setActiveFilter] = useState<VideoFilter>("none");
  const [backgroundBlur, setBackgroundBlur] = useState(0);
  const [skinSmooth, setSkinSmooth] = useState(0);
  const [backgroundRemoval, setBackgroundRemoval] = useState(false);
  const [virtualBackgroundUrl, setVirtualBackgroundUrl] = useState<string | undefined>(undefined);
  const [backgroundColor, setBackgroundColor] = useState<string | undefined>(undefined);
  const [currentVideoDeviceId, setCurrentVideoDeviceId] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingElapsed, setRecordingElapsed] = useState(0);
  const [liveCaption, setLiveCaption] = useState("");
  const [transcriptSegments, setTranscriptSegments] = useState<{ text: string; ts: number; userId?: string }[]>([]);
  const [captionSettings, setCaptionSettings] = useState({
    enabled: false,
    mode: "subtitle" as "subtitle" | "sidebar",
    fontSize: "md" as "sm" | "md" | "lg" | "xl",
    color: "#ffffff",
    font: "sans" as "sans" | "serif" | "mono",
  });

  // Tab-stable suffix persisted in sessionStorage so page refresh keeps the same peerId
  const tabId = useMemo(() => {
    if (typeof window === "undefined") return Math.random().toString(36).slice(2, 8);
    const stored = sessionStorage.getItem("killio_call_tab_id");
    if (stored) return stored;
    const id = Math.random().toString(36).slice(2, 8);
    sessionStorage.setItem("killio_call_tab_id", id);
    return id;
  }, []);
  const myPeerId = user?.id ? `${user.id}-${tabId}` : "";
  const myDisplayName = user?.displayName || user?.username || user?.email || "Unknown";

  // Camera / shared screen of each peer, derived: the track can land before the sharer's announcement (see peer-streams.ts).
  const peers: CallPeer[] = useMemo(
    () =>
      basePeers.map((p) => {
        const share = shareState.shares.find((s) => s.peerId === p.peerId);
        const { camera, screen } = resolvePeerStreams(p.streams, share?.streamId, !!share);
        return {
          peerId: p.peerId,
          displayName: p.displayName,
          avatarUrl: p.avatarUrl,
          stream: camera,
          screenStream: screen,
          screenWithAudio: share?.withAudio,
          audioMuted: p.audioMuted,
          videoMuted: p.videoMuted,
          isScreenSharing: !!share,
        };
      }),
    [basePeers, shareState.shares],
  );

  const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map());
  // Which sender carries what: the camera and the shared screen are both "video", so "the first video sender" is ambiguous.
  const cameraSenders = useRef<WeakMap<RTCPeerConnection, RTCRtpSender>>(new WeakMap());
  const screenSenders = useRef<WeakMap<RTCPeerConnection, RTCRtpSender[]>>(new WeakMap());
  const makingOffer = useRef<Set<string>>(new Set());
  const ignoredOffer = useRef<Set<string>>(new Set());
  const iceRestarted = useRef<Set<string>>(new Set());
  const shareStateRef = useRef(shareState);
  const startingShareRef = useRef(false);
  const presenceActiveRef = useRef(false);
  const presenceTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const basePeersRef = useRef<RawPeer[]>([]);
  const stopScreenShareRef = useRef<((opts?: { announce?: boolean }) => void) | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const callIdRef = useRef<string | null>(null);
  const callStartTimeRef = useRef<number | null>(null);
  const isInCallRef = useRef(false);
  const isAudioMutedRef = useRef(false);
  const isVideoMutedRef = useRef(false);
  const isScreenSharingRef = useRef(false);

  // Recording
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const recordingChunks = useRef<Blob[]>([]);
  const recordingTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // STT + progressive transcript submission
  const recognition = useRef<any>(null);
  const localSegments = useRef<CallTranscriptSegment[]>([]);
  const lastSubmittedSegmentIndex = useRef(0);
  const transcriptSubmitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Timeout refs for cleanup
  const iceRestartTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const peersCheckTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const staleCallTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Canvas filter refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const filterRafRef = useRef<number | null>(null);
  const filteredStreamRef = useRef<MediaStream | null>(null);
  const effectsProcessor = useRef<VideoEffectsProcessor | null>(null);

  // Keep refs in sync for callbacks that close over stale state
  useEffect(() => { isAudioMutedRef.current = isAudioMuted; }, [isAudioMuted]);
  useEffect(() => { isVideoMutedRef.current = isVideoMuted; }, [isVideoMuted]);
  useEffect(() => { isScreenSharingRef.current = isScreenSharing; }, [isScreenSharing]);
  useEffect(() => { shareStateRef.current = shareState; }, [shareState]);
  useEffect(() => { basePeersRef.current = basePeers; }, [basePeers]);

  // ── bitrate: split the upload budget between viewers, keep the camera small while the screen is shared ──
  const applyQualityToPc = useCallback((pc: RTCPeerConnection) => {
    const viewers = Math.max(1, peerConnections.current.size);
    const sharing = !!screenStreamRef.current;
    const tune = (sender: RTCRtpSender | undefined, change: (enc: RTCRtpEncodingParameters) => void) => {
      if (!sender) return;
      try {
        const params = sender.getParameters();
        if (!params.encodings || params.encodings.length === 0) return; // not negotiated yet: retried when signaling is stable
        change(params.encodings[0]);
        sender.setParameters(params).catch(() => {});
      } catch { /* sender closed */ }
    };
    for (const sender of screenSenders.current.get(pc) ?? []) {
      if (sender.track?.kind !== "video") continue;
      tune(sender, (enc) => {
        enc.maxBitrate = screenBitratePerViewer(viewers);
        enc.maxFramerate = screenFramerate(viewers);
      });
    }
    tune(cameraSenders.current.get(pc), (enc) => {
      if (sharing) enc.maxBitrate = CAMERA_BITRATE_WHILE_SHARING_BPS;
      else delete enc.maxBitrate;
    });
  }, []);

  const attachScreenTracks = useCallback((pc: RTCPeerConnection, screen: MediaStream) => {
    const senders = screen.getTracks().map((t) => pc.addTrack(t, screen));
    screenSenders.current.set(pc, senders);
  }, []);

  // ── create or get a PeerConnection for peerId ──
  const getOrCreatePC = useCallback(
    (peerId: string): RTCPeerConnection => {
      if (peerConnections.current.has(peerId)) {
        return peerConnections.current.get(peerId)!;
      }

      const pc = new RTCPeerConnection(RTC_CONFIG);

      pc.onicecandidate = (e) => {
        if (!e.candidate || !roomId || !accessToken) return;
        realtime?.getChannel(realtimeChannel.roomSignal(roomId!)).publish("call.ice", {
          fromPeerId: myPeerId,
          targetPeerId: peerId,
          candidate: e.candidate.toJSON(),
        }).catch(() => {});
      };

      pc.ontrack = (e) => {
        const stream = e.streams[0];
        if (!stream) return;
        setPeers((prev) =>
          prev.map((p) => (p.peerId === peerId ? { ...p, streams: addStream(p.streams, stream) } : p))
        );
        // The sharer removes its screen tracks when it stops: forget the stream once it is empty.
        stream.onremovetrack = () => {
          if (stream.getTracks().length > 0) return;
          setPeers((prev) => prev.map((p) => (p.peerId === peerId ? { ...p, streams: removeStream(p.streams, stream.id) } : p)));
        };
      };

      // Renegotiation (a screen track added or removed). The first offer of a connection is sent explicitly (join / ICE restart),
      // so this only acts once the remote description exists.
      pc.onnegotiationneeded = () => {
        if (!pc.remoteDescription || pc.signalingState !== "stable") return;
        sendOffer(peerId).catch(() => {});
      };

      pc.onsignalingstatechange = () => {
        if (pc.signalingState === "stable") applyQualityToPc(pc);
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "connected") iceRestarted.current.delete(peerId);
        if (pc.connectionState === "disconnected") {
          // Give the network 4 seconds to recover before trying ICE restart
          if (iceRestartTimeoutRef.current) clearTimeout(iceRestartTimeoutRef.current);
          iceRestartTimeoutRef.current = setTimeout(() => {
            if (pc.connectionState !== "disconnected" && pc.connectionState !== "failed") return;
            pc.restartIce();
            sendOffer(peerId).catch(() => {});
          }, 4000);
        }
        if (pc.connectionState === "failed") {
          // One ICE restart before giving up on the peer (a Wi-Fi switch or a NAT rebind usually recovers).
          if (!iceRestarted.current.has(peerId) && peerConnections.current.get(peerId) === pc) {
            iceRestarted.current.add(peerId);
            pc.restartIce();
            sendOffer(peerId).catch(() => {});
            return;
          }
          iceRestarted.current.delete(peerId);
          peerConnections.current.delete(peerId);
          setPeers((prev) => prev.filter((p) => p.peerId !== peerId));
          dispatchShare({ type: "peerLeft", peerId });
          pc.close();
        }
      };

      const stream = localStreamRef.current;
      if (stream) {
        stream.getTracks().forEach((t) => {
          const sender = pc.addTrack(t, stream);
          if (t.kind === "video") cameraSenders.current.set(pc, sender);
        });
      }
      // A peer that joins while this tab is sharing gets the screen too.
      const screen = screenStreamRef.current;
      if (screen) attachScreenTracks(pc, screen);

      peerConnections.current.set(peerId, pc);
      return pc;
    },
    [roomId, accessToken, myPeerId, applyQualityToPc, attachScreenTracks]
  );

  // ── send offer to peerId ──
  const sendOffer = useCallback(
    async (peerId: string) => {
      if (!roomId || !accessToken) return;
      const pc = getOrCreatePC(peerId);
      if (makingOffer.current.has(peerId)) return;
      makingOffer.current.add(peerId);
      try {
        const offer = await pc.createOffer();
        if (pc.signalingState !== "stable") return; // an incoming offer won the race: answer it instead
        await pc.setLocalDescription(offer);
        realtime?.getChannel(realtimeChannel.roomSignal(roomId!)).publish("call.offer", {
          fromPeerId: myPeerId,
          targetPeerId: peerId,
          sdp: offer,
        }).catch(() => {});
      } catch (e) {
        console.error("[RTC] sendOffer failed", e);
      } finally {
        makingOffer.current.delete(peerId);
      }
    },
    [roomId, accessToken, myPeerId, getOrCreatePC]
  );

  // ── Progressive transcript submission ──
  const scheduleTranscriptSubmit = useCallback(() => {
    // 15–35s random interval per participant for variability
    const delay = 15000 + Math.floor(Math.random() * 20000);
    transcriptSubmitTimer.current = setTimeout(async () => {
      const cId = callIdRef.current;
      if (!cId || !roomId || !accessToken || !isInCallRef.current) return;
      const newSegments = localSegments.current.slice(lastSubmittedSegmentIndex.current);
      if (newSegments.length > 0) {
        try {
          await submitCallTranscript(roomId, cId, newSegments, accessToken);
          lastSubmittedSegmentIndex.current = localSegments.current.length;
        } catch {
          // will retry next interval
        }
      }
      if (isInCallRef.current) scheduleTranscriptSubmit();
    }, delay);
  }, [roomId, accessToken]);

  // ── In-call admin actions (publish to signal channel) ──
  const muteParticipant = useCallback(
    (targetPeerId: string) => {
      if (isDm || !canManage || !roomId || !accessToken) return;
      realtime?.getChannel(realtimeChannel.roomSignal(roomId!)).publish("call.force_mute", {
        fromPeerId: myPeerId,
        targetPeerId,
      }).catch(() => {});
    },
    [isDm, canManage, roomId, accessToken, myPeerId]
  );

  const kickParticipant = useCallback(
    (targetPeerId: string) => {
      if (isDm || !canManage || !roomId || !accessToken) return;
      realtime?.getChannel(realtimeChannel.roomSignal(roomId!)).publish("call.kick", {
        fromPeerId: myPeerId,
        targetPeerId,
      }).catch(() => {});
    },
    [isDm, canManage, roomId, accessToken, myPeerId]
  );

  const disableParticipantScreen = useCallback(
    (targetPeerId: string) => {
      if (isDm || !canManage || !roomId || !accessToken) return;
      realtime?.getChannel(realtimeChannel.roomSignal(roomId!)).publish("call.force_screen_off", {
        fromPeerId: myPeerId,
        targetPeerId,
      }).catch(() => {});
      // The server version is authoritative (room managers only) and announces `call.screenshare.stopped` with reason "forced".
      const cId = callIdRef.current;
      if (cId && presenceActiveRef.current) releaseScreenShare(roomId, cId, targetPeerId, accessToken).catch(() => {});
    },
    [isDm, canManage, roomId, accessToken, myPeerId]
  );

  // ── Realtime signaling subscription ──
  useEffect(() => {
    if (!roomId || !realtime) return;
    const signal = realtime.getChannel(realtimeChannel.roomSignal(roomId));

    const onJoin = async (msg: any) => {
      const { peerId, displayName, avatarUrl } = msg.data;
      if (peerId === myPeerId || !isInCallRef.current) return;
      setPeers((prev) => {
        if (prev.some((p) => p.peerId === peerId)) return prev;
        return [...prev, { peerId, displayName, avatarUrl, streams: [], audioMuted: false, videoMuted: false }];
      });
      // Tell the newcomer who we are and what we are doing: it has no other way to learn about people who were already here.
      const mine = shareStateRef.current.shares.find((s) => s.peerId === myPeerId);
      signal.publish("call.hello", {
        peerId: myPeerId,
        targetPeerId: peerId,
        displayName: myDisplayName,
        avatarUrl: user?.avatarUrl,
        audioMuted: isAudioMutedRef.current,
        videoMuted: isVideoMutedRef.current,
        screen: mine && screenStreamRef.current ? { streamId: screenStreamRef.current.id, withAudio: mine.withAudio, startedAt: new Date(mine.startedAt).toISOString() } : undefined,
      }).catch(() => {});
      await sendOffer(peerId);
    };

    const onHello = (msg: any) => {
      const { peerId, targetPeerId, displayName, avatarUrl, audioMuted, videoMuted, screen } = msg.data ?? {};
      if (!peerId || peerId === myPeerId || targetPeerId !== myPeerId || !isInCallRef.current) return;
      setPeers((prev) => {
        const known = prev.find((p) => p.peerId === peerId);
        if (!known) return [...prev, { peerId, displayName: displayName || peerId, avatarUrl, streams: [], audioMuted: !!audioMuted, videoMuted: !!videoMuted }];
        return prev.map((p) => (p.peerId === peerId ? { ...p, displayName: displayName || p.displayName, avatarUrl: avatarUrl ?? p.avatarUrl, audioMuted: !!audioMuted, videoMuted: !!videoMuted } : p));
      });
      if (screen) {
        const a = actionFromSignal("call.screen", { peerId, active: true, streamId: screen.streamId, audio: screen.withAudio, startedAt: screen.startedAt });
        if (a) dispatchShare(a);
      }
    };

    const onLeave = (msg: any) => {
      const { peerId } = msg.data;
      const pc = peerConnections.current.get(peerId);
      if (pc) { pc.close(); peerConnections.current.delete(peerId); }
      dispatchShare({ type: "peerLeft", peerId });
      setPeers((prev) => {
        const next = prev.filter((p) => p.peerId !== peerId);
        if (next.length === 0 && isInCallRef.current) {
          if (peersCheckTimeoutRef.current) clearTimeout(peersCheckTimeoutRef.current);
          peersCheckTimeoutRef.current = setTimeout(() => leaveCallRef.current?.(), 500);
        }
        return next;
      });
    };

    const onOffer = async (msg: any) => {
      const { fromPeerId, targetPeerId, sdp } = msg.data;
      if (targetPeerId !== myPeerId || !isInCallRef.current) return;
      const pc = getOrCreatePC(fromPeerId);
      // Both sides can renegotiate at once (one adds a screen while the other mutes): the polite side yields, the other ignores.
      const ignore = shouldIgnoreOffer({ polite: isPolite(myPeerId, fromPeerId), makingOffer: makingOffer.current.has(fromPeerId), signalingState: pc.signalingState });
      if (ignore) { ignoredOffer.current.add(fromPeerId); return; }
      ignoredOffer.current.delete(fromPeerId);
      // A peer we only know from its offer still gets a tile (its name arrives with its call.hello / call.join).
      setPeers((prev) => (prev.some((p) => p.peerId === fromPeerId) ? prev : [...prev, { peerId: fromPeerId, displayName: fromPeerId, streams: [], audioMuted: false, videoMuted: false }]));
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp)); // when we are polite and had an offer out, this rolls it back
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        if (!roomId || !realtime) return;
        realtime.getChannel(realtimeChannel.roomSignal(roomId)).publish("call.answer", {
          fromPeerId: myPeerId,
          targetPeerId: fromPeerId,
          sdp: answer,
        });
      } catch (e) {
        console.error("[RTC] onOffer failed", e);
      }
    };

    const onAnswer = async (msg: any) => {
      const { fromPeerId, targetPeerId, sdp } = msg.data;
      if (targetPeerId !== myPeerId) return;
      const pc = peerConnections.current.get(fromPeerId);
      if (!pc) return;
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      } catch (e) {
        console.error("[RTC] onAnswer failed", e);
      }
    };

    const onIce = async (msg: any) => {
      const { fromPeerId, targetPeerId, candidate } = msg.data;
      if (targetPeerId !== myPeerId) return;
      const pc = peerConnections.current.get(fromPeerId);
      if (!pc) return;
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        if (!ignoredOffer.current.has(fromPeerId)) console.error("[RTC] onIce failed", e);
      }
    };

    const onMute = (msg: any) => {
      const { peerId, audioMuted, videoMuted } = msg.data;
      setPeers((prev) =>
        prev.map((p) => (p.peerId === peerId ? { ...p, audioMuted, videoMuted } : p))
      );
    };

    // `call.screen` comes from the sharer, `call.screenshare.started|stopped` from the server: same reducer, idempotent.
    const onScreenSignal = (event: string) => (msg: any) => {
      const action = actionFromSignal(event, msg.data);
      if (!action) return;
      if (action.type === "stopped" && action.peerId === myPeerId) {
        // The server (a room manager) stopped our share: release the capture. Our own "stopped" echo finds nothing to stop.
        if (msg.data?.reason === "forced" && screenStreamRef.current) stopScreenShareRef.current?.({ announce: false });
        else if (screenStreamRef.current) return; // echo of an old stop while a new share is running: keep it
      }
      dispatchShare(action);
    };
    const onScreen = onScreenSignal("call.screen");
    const onScreenStarted = onScreenSignal("call.screenshare.started");
    const onScreenStopped = onScreenSignal("call.screenshare.stopped");

    // Admin force-actions targeting this participant
    const onForceMute = (msg: any) => {
      const { targetPeerId } = msg.data;
      if (targetPeerId !== myPeerId || !isInCallRef.current) return;
      const stream = localStreamRef.current;
      if (!stream) return;
      stream.getAudioTracks().forEach((t) => { t.enabled = false; });
      setIsAudioMuted(true);
      if (roomId && realtime) {
        realtime.getChannel(realtimeChannel.roomSignal(roomId)).publish("call.mute", {
          peerId: myPeerId,
          audioMuted: true,
          videoMuted: isVideoMutedRef.current,
        }).catch(() => {});
      }
    };

    const onKick = (msg: any) => {
      const { targetPeerId } = msg.data;
      if (targetPeerId !== myPeerId || !isInCallRef.current) return;
      // Trigger leave — use a synthetic call to the leave logic
      leaveCallRef.current?.();
    };

    const onForceScreenOff = (msg: any) => {
      const { targetPeerId } = msg.data;
      if (targetPeerId !== myPeerId || !isInCallRef.current || !isScreenSharingRef.current) return;
      stopScreenShareRef.current?.({ announce: true });
    };

    const onTranscript = (msg: any) => {
      const { text, userId } = msg.data;
      if (userId === myPeerId) return; // ignore own as we set it locally
      setTranscriptSegments((prev) => {
        // Keep last 50 segments to avoid bloat
        const next = [...prev, { text, ts: Date.now(), userId }];
        return next.slice(-50);
      });
    };

    signal.subscribe("call.join", onJoin);
    signal.subscribe("call.hello", onHello);
    signal.subscribe("call.screenshare.started", onScreenStarted);
    signal.subscribe("call.screenshare.stopped", onScreenStopped);
    signal.subscribe("call.leave", onLeave);
    signal.subscribe("call.offer", onOffer);
    signal.subscribe("call.answer", onAnswer);
    signal.subscribe("call.ice", onIce);
    signal.subscribe("call.mute", onMute);
    signal.subscribe("call.screen", onScreen);
    signal.subscribe("call.force_mute", onForceMute);
    signal.subscribe("call.kick", onKick);
    signal.subscribe("call.force_screen_off", onForceScreenOff);
    signal.subscribe("call.transcript", onTranscript);

    return () => {
      try { signal.unsubscribe("call.join", onJoin); } catch {}
      try { signal.unsubscribe("call.hello", onHello); } catch {}
      try { signal.unsubscribe("call.screenshare.started", onScreenStarted); } catch {}
      try { signal.unsubscribe("call.screenshare.stopped", onScreenStopped); } catch {}
      try { signal.unsubscribe("call.leave", onLeave); } catch {}
      try { signal.unsubscribe("call.offer", onOffer); } catch {}
      try { signal.unsubscribe("call.answer", onAnswer); } catch {}
      try { signal.unsubscribe("call.ice", onIce); } catch {}
      try { signal.unsubscribe("call.mute", onMute); } catch {}
      try { signal.unsubscribe("call.screen", onScreen); } catch {}
      try { signal.unsubscribe("call.force_mute", onForceMute); } catch {}
      try { signal.unsubscribe("call.kick", onKick); } catch {}
      try { signal.unsubscribe("call.force_screen_off", onForceScreenOff); } catch {}
      try { signal.unsubscribe("call.transcript", onTranscript); } catch {}
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, realtime, myPeerId, sendOffer, getOrCreatePC]);

  // ── Canvas filter loop ──
  const startFilterLoop = useCallback(() => {
    const canvas = canvasRef.current;
    const video = localVideoRef.current;
    if (!effectsProcessor.current) {
      effectsProcessor.current = new VideoEffectsProcessor();
    }

    const draw = async () => {
      if (!canvas || !video || video.readyState < 2) {
        filterRafRef.current = requestAnimationFrame(draw);
        return;
      }
      
      const processedCanvas = await effectsProcessor.current?.processFrame(video, {
        filter: getFilterStyle(activeFilter),
        backgroundBlur,
        backgroundRemoval,
        virtualBackgroundUrl,
        backgroundColor,
        skinSmooth,
      });

      if (processedCanvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          if (canvas.width !== processedCanvas.width) {
             canvas.width = processedCanvas.width;
             canvas.height = processedCanvas.height;
          }
          ctx.drawImage(processedCanvas, 0, 0);
        }
      }
      
      filterRafRef.current = requestAnimationFrame(draw);
    };
    filterRafRef.current = requestAnimationFrame(draw);

    if (canvas) {
      const filtered = canvas.captureStream(30);
      filteredStreamRef.current = filtered;

      peerConnections.current.forEach((pc) => {
        const sender = cameraSenders.current.get(pc);
        if (sender && filtered.getVideoTracks()[0]) {
          sender.replaceTrack(filtered.getVideoTracks()[0]).catch(console.error);
        }
      });
    }
  }, [activeFilter, backgroundBlur, skinSmooth, backgroundRemoval, virtualBackgroundUrl, backgroundColor]);

  const stopFilterLoop = useCallback(() => {
    if (filterRafRef.current) {
      cancelAnimationFrame(filterRafRef.current);
      filterRafRef.current = null;
    }
    const original = localStreamRef.current?.getVideoTracks()[0];
    if (original) {
      peerConnections.current.forEach((pc) => {
        const sender = cameraSenders.current.get(pc);
        if (sender) sender.replaceTrack(original).catch(console.error);
      });
    }
    effectsProcessor.current?.dispose();
    effectsProcessor.current = null;
    filteredStreamRef.current = null;
  }, []);

  // ── STT setup ──
  const startSTT = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const r = new SR();
    r.continuous = true;
    r.interimResults = true;
    r.lang = navigator.language;
    const t0 = callStartTimeRef.current ?? Date.now();

    r.onresult = (event: any) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          const text = result[0].transcript.trim();
          localSegments.current.push({
            userId: myPeerId,
            displayName: myDisplayName,
            text,
            startMs: Math.max(0, (event.timeStamp ?? Date.now()) - t0 - 3000),
            endMs: Date.now() - t0,
            confidence: result[0].confidence ?? 1,
          });
          setTranscriptSegments((prev) => [
            ...prev,
            { text, ts: Date.now(), userId: myPeerId },
          ]);
          setLiveCaption("");
          
          // Broadcast to others
          if (roomId && realtime) {
             realtime.getChannel(realtimeChannel.roomSignal(roomId)).publish("call.transcript", {
                text,
                userId: myPeerId,
                displayName: myDisplayName,
             }).catch(() => {});
          }
        } else {
          interim += result[0].transcript;
        }
      }
      if (interim) setLiveCaption(interim);
    };

    r.onerror = () => { /* silently ignore */ };
    try { r.start(); } catch { /* ignore if already running */ }
    recognition.current = r;
  }, [myPeerId, myDisplayName]);

  const stopSTT = useCallback(() => {
    try { recognition.current?.stop(); } catch { /* ignore */ }
    recognition.current = null;
  }, []);

  // ── leaveCall — defined early so onKick can reference it ──
  const leaveCallRef = useRef<(() => void) | null>(null);

  const leaveCall = useCallback(async () => {
    if (!isInCallRef.current) return;

    // Stop recording
    if (mediaRecorder.current?.state === "recording") {
      mediaRecorder.current.stop();
    }
    if (recordingTimer.current) {
      clearInterval(recordingTimer.current);
      recordingTimer.current = null;
    }
    setIsRecording(false);
    setRecordingElapsed(0);

    // Stop periodic transcript submission
    if (transcriptSubmitTimer.current) {
      clearTimeout(transcriptSubmitTimer.current);
      transcriptSubmitTimer.current = null;
    }

    // Stop STT then submit remaining segments
    stopSTT();
    if (presenceTimerRef.current) {
      clearInterval(presenceTimerRef.current);
      presenceTimerRef.current = null;
    }
    if (callIdRef.current && roomId && accessToken) {
      const remaining = localSegments.current.slice(lastSubmittedSegmentIndex.current);
      if (remaining.length > 0) {
        submitCallTranscript(roomId, callIdRef.current, remaining, accessToken).catch(console.error);
      }
      const leavingCallId = callIdRef.current;
      if (presenceActiveRef.current) {
        // The server ends the call by itself when the last participant leaves (and drops our screen share).
        leaveCallPresence(roomId, leavingCallId, myPeerId, accessToken).catch(() => endCallRecord(roomId, leavingCallId, accessToken).catch(console.error));
      } else {
        endCallRecord(roomId, leavingCallId, accessToken).catch(console.error);
      }
    }
    presenceActiveRef.current = false;

    // Close all peer connections
    peerConnections.current.forEach((pc) => pc.close());
    peerConnections.current.clear();

    stopFilterLoop();

    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current?.getTracks().forEach((t) => { t.onended = null; t.stop(); });

    if (roomId && realtime) {
      realtime.getChannel(realtimeChannel.roomSignal(roomId)).publish("call.leave", { peerId: myPeerId }).catch(() => {});
    }

    localStreamRef.current = null;
    screenStreamRef.current = null;
    callIdRef.current = null;
    callStartTimeRef.current = null;
    localSegments.current = [];
    lastSubmittedSegmentIndex.current = 0;
    isInCallRef.current = false;
    makingOffer.current.clear();
    ignoredOffer.current.clear();
    iceRestarted.current.clear();
    dispatchShare({ type: "reset" });

    setIsInCall(false);
    setCallId(null);
    setCallStartTime(null);
    setLocalStream(null);
    setScreenStream(null);
    setPeers([]);
    setIsAudioMuted(false);
    setIsVideoMuted(false);
    setIsScreenSharing(false);
    setIsCameraFilterActive(false);
    setActiveFilter("none");
  }, [roomId, accessToken, myPeerId, stopSTT, stopFilterLoop]);

  // Keep ref in sync so onKick handler can call it
  useEffect(() => { leaveCallRef.current = leaveCall; }, [leaveCall]);

  // ── presence heartbeat: keeps us "in the call" server-side, resyncs who is sharing, recovers a call closed under us ──
  const presenceBeatRef = useRef<(() => void) | null>(null);
  presenceBeatRef.current = () => {
    const cId = callIdRef.current;
    if (!isInCallRef.current || !cId || !roomId || !accessToken || !presenceActiveRef.current) return;
    joinCallPresence(roomId, cId, myPeerId, myDisplayName, accessToken)
      .then((presence) => {
        setMaxParticipants(presence.max);
        const snap = snapshotFromState(presence);
        if (!snap || snap.type !== "snapshot") return;
        const mine = screenStreamRef.current;
        if (mine && !snap.shares.some((s) => s.peerId === myPeerId)) {
          // We are sharing but the server does not know (it was unreachable when we started): claim again, keep our state.
          claimScreenShare(roomId, cId, myPeerId, mine.getAudioTracks().length > 0, accessToken).catch(() => {});
          return;
        }
        dispatchShare(snap);
      })
      .catch(async (e) => {
        if (e instanceof CallApiError && (e.body as { code?: string } | null)?.code === "call_ended") {
          // Our connection was down longer than the presence TTL and the call was closed: open a fresh record and re-enter it.
          try {
            const fresh = await createCallRecord(roomId, accessToken);
            callIdRef.current = fresh.id;
            setCallId(fresh.id);
            await joinCallPresence(roomId, fresh.id, myPeerId, myDisplayName, accessToken);
          } catch { /* next beat tries again */ }
        }
      });
  };

  // ── joinCall ──
  const joinCall = useCallback(async () => {
    if (!roomId || !accessToken || !user || isInCallRef.current) return;
    // Offline fallback of the server's limit (the server answers 409 call_full with the real one).
    if (peers.length >= MAX_PARTICIPANTS) {
      setNotice({ kind: "callFull", max: MAX_PARTICIPANTS });
      return;
    }
    setNotice(null);

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    } catch (e) {
      const name = (e as { name?: string } | null)?.name;
      if (name === "NotFoundError" || name === "OverconstrainedError") {
        // No camera (or one that cannot satisfy the request): still worth joining by voice.
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
          setNotice({ kind: "audioOnly" });
        } catch (e2) {
          console.error("[RTC] getUserMedia failed", e2);
          setNotice(noticeFromMediaError(e2));
          throw e2;
        }
      } else {
        console.error("[RTC] getUserMedia failed", e);
        setNotice(noticeFromMediaError(e));
        throw e;
      }
    }

    localStreamRef.current = stream;
    setLocalStream(stream);

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
      localVideoRef.current.play().catch(() => {});
    }
    if (canvasRef.current) {
      canvasRef.current.width = 480;
      canvasRef.current.height = 270;
    }

    let call: Awaited<ReturnType<typeof createCallRecord>>;
    let joinedExisting = false;
    try {
      // Join existing active call if one is ongoing, otherwise start a new one
      const existing = await getActiveCall(roomId, accessToken);
      if (existing) {
        call = existing;
        joinedExisting = true;
      } else {
        call = await createCallRecord(roomId, accessToken);
      }
    } catch {
      call = { id: `local-${Date.now()}`, roomId, startedAt: new Date().toISOString(), participants: [], transcriptStatus: "none" as const, initiatorUserId: user.id ?? myPeerId };
    }
    // Presence: the server counts who is in the call and refuses a newcomer over the limit. A server without the endpoint (404),
    // an unreachable one or a local-only call falls back to the old behaviour (no limit beyond MAX_PARTICIPANTS, no zombie cleanup).
    presenceActiveRef.current = false;
    if (!call.id.startsWith("local-")) {
      try {
        let presence: CallPresence;
        try {
          presence = await joinCallPresence(roomId, call.id, myPeerId, myDisplayName, accessToken);
        } catch (e) {
          if (e instanceof CallApiError && (e.body as { code?: string } | null)?.code === "call_ended") {
            call = await createCallRecord(roomId, accessToken); // the record we found was a zombie that just got closed
            joinedExisting = false;
            presence = await joinCallPresence(roomId, call.id, myPeerId, myDisplayName, accessToken);
          } else {
            throw e;
          }
        }
        presenceActiveRef.current = true;
        setMaxParticipants(presence.max);
        const snap = snapshotFromState(presence);
        if (snap) dispatchShare(snap);
      } catch (e) {
        if (e instanceof CallApiError && !e.isUnavailable) {
          const n = noticeFromApiError(e.status, e.body);
          if (n) {
            // Refused (full, no permission): give back the camera and microphone and stay out.
            stream.getTracks().forEach((t) => t.stop());
            localStreamRef.current = null;
            setLocalStream(null);
            setNotice(n);
            return;
          }
        }
        // anything else (network, 5xx): join without presence
      }
    }

    callIdRef.current = call.id;
    callStartTimeRef.current = Date.now();
    setCallId(call.id);
    setCallStartTime(Date.now());
    isInCallRef.current = true;
    setIsInCall(true);

    if (presenceActiveRef.current) {
      if (presenceTimerRef.current) clearInterval(presenceTimerRef.current);
      presenceTimerRef.current = setInterval(() => { presenceBeatRef.current?.(); }, PRESENCE_HEARTBEAT_MS);
    }

    realtime?.getChannel(realtimeChannel.roomSignal(roomId)).publish("call.join", {
      peerId: myPeerId,
      displayName: myDisplayName,
      avatarUrl: user.avatarUrl,
      callId: call.id,
    }).catch(() => {});

    // If we joined an existing call but nobody responds within 5s, the call was stale —
    // end that record and promote ourselves as the new call initiator.
    if (joinedExisting) {
      if (staleCallTimeoutRef.current) clearTimeout(staleCallTimeoutRef.current);
      staleCallTimeoutRef.current = setTimeout(async () => {
        if (!isInCallRef.current || peerConnections.current.size > 0) return;
        const staleId = callIdRef.current;
        if (!staleId || !roomId || !accessToken) return;
        try {
          await endCallRecord(roomId, staleId, accessToken);
          const fresh = await createCallRecord(roomId, accessToken);
          callIdRef.current = fresh.id;
          setCallId(fresh.id);
        } catch { /* keep going with the existing id if cleanup fails */ }
      }, 5000);
    }

    localSegments.current = [];
    lastSubmittedSegmentIndex.current = 0;
    startSTT();
    setCaptionSettings((prev) => ({ ...prev, enabled: true }));

    // Start progressive transcript submissions with per-participant jitter
    scheduleTranscriptSubmit();
  }, [roomId, accessToken, user, peers.length, myPeerId, myDisplayName, startSTT, scheduleTranscriptSubmit]);

  // ── toggleAudio ──
  const toggleAudio = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    stream.getAudioTracks().forEach((t) => { t.enabled = !t.enabled; });
    const muted = !stream.getAudioTracks()[0]?.enabled;
    setIsAudioMuted(muted);
    if (roomId && realtime) {
      realtime.getChannel(realtimeChannel.roomSignal(roomId)).publish("call.mute", {
        peerId: myPeerId,
        audioMuted: muted,
        videoMuted: isVideoMutedRef.current,
      }).catch(() => {});
    }
    setLocalStream(new MediaStream(stream.getTracks()));
  }, [roomId, realtime, myPeerId]);

  // ── toggleVideo ──
  const toggleVideo = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    stream.getVideoTracks().forEach((t) => { t.enabled = !t.enabled; });
    const muted = !stream.getVideoTracks()[0]?.enabled;
    setIsVideoMuted(muted);
    if (roomId && realtime) {
      realtime.getChannel(realtimeChannel.roomSignal(roomId)).publish("call.mute", {
        peerId: myPeerId,
        audioMuted: isAudioMutedRef.current,
        videoMuted: muted,
      }).catch(() => {});
    }
    setLocalStream(new MediaStream(stream.getTracks()));
  }, [roomId, realtime, myPeerId]);

  // ── switchCamera ──
  const switchCamera = useCallback(async (deviceId: string) => {
    if (!isInCallRef.current || !localStreamRef.current) {
       setCurrentVideoDeviceId(deviceId);
       return;
    }

    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: deviceId } },
        audio: !isAudioMutedRef.current,
      });

      const newVideoTrack = newStream.getVideoTracks()[0];
      const oldVideoTrack = localStreamRef.current.getVideoTracks()[0];

      if (oldVideoTrack) {
        oldVideoTrack.stop();
        localStreamRef.current.removeTrack(oldVideoTrack);
      }

      localStreamRef.current.addTrack(newVideoTrack);
      
      // Update peer connections
      peerConnections.current.forEach((pc) => {
        const sender = cameraSenders.current.get(pc);
        if (sender) sender.replaceTrack(newVideoTrack).catch(console.error);
      });

      setCurrentVideoDeviceId(deviceId);
      setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
    } catch (e) {
      console.error("[RTC] switchCamera failed", e);
    }
  }, [localStream]);

  // ── screen sharing ──
  // The screen is a SECOND set of tracks (its own MediaStream), added next to the camera: the camera keeps going and viewers tell
  // the two apart by the stream id announced in `call.screen`. Adding / removing tracks renegotiates (perfect negotiation).
  const screenShareSupported =
    typeof navigator !== "undefined" && typeof navigator.mediaDevices?.getDisplayMedia === "function" && (typeof window === "undefined" || window.isSecureContext);

  const stopScreenShare = useCallback(
    (opts?: { announce?: boolean }) => {
      const screen = screenStreamRef.current;
      if (!screen) return;
      screenStreamRef.current = null; // first: nothing below may see a half-stopped share
      screen.getTracks().forEach((t) => { t.onended = null; t.stop(); });
      peerConnections.current.forEach((pc) => {
        for (const sender of screenSenders.current.get(pc) ?? []) {
          try { pc.removeTrack(sender); } catch { /* connection closed */ }
        }
        screenSenders.current.delete(pc);
        applyQualityToPc(pc);
      });
      setScreenStream(null);
      setIsScreenSharing(false);
      dispatchShare({ type: "stopped", peerId: myPeerId });
      if (opts?.announce !== false && roomId && realtime) {
        realtime.getChannel(realtimeChannel.roomSignal(roomId)).publish("call.screen", { peerId: myPeerId, active: false }).catch(() => {});
      }
      const cId = callIdRef.current;
      if (cId && roomId && accessToken && presenceActiveRef.current) releaseScreenShare(roomId, cId, myPeerId, accessToken).catch(() => {});
    },
    [roomId, realtime, myPeerId, accessToken, applyQualityToPc],
  );
  useEffect(() => { stopScreenShareRef.current = stopScreenShare; }, [stopScreenShare]);

  const startScreenShare = useCallback(async () => {
    if (!roomId || !realtime || !isInCallRef.current || screenStreamRef.current || startingShareRef.current) return;
    const gate = canStartShare(shareStateRef.current, myPeerId);
    if (!gate.ok) {
      const sharer = basePeersRef.current.find((p) => p.peerId === gate.sharerPeerId);
      setNotice({ kind: "screenshareBusy", sharerName: sharer?.displayName ?? "" });
      return;
    }
    const env = { hasApi: typeof navigator.mediaDevices?.getDisplayMedia === "function", secure: window.isSecureContext };
    if (!env.hasApi || !env.secure) {
      setNotice({ kind: classifyCaptureError(null, env) === "insecure" ? "screenInsecure" : "screenUnsupported" });
      return;
    }
    startingShareRef.current = true;
    setNotice(null);
    const cId = callIdRef.current;
    let claimed = false;
    try {
      // 1. Claim the screen on the server BEFORE the picker: nobody should choose a window only to be told someone else has the stage.
      if (cId && accessToken && presenceActiveRef.current) {
        try {
          await claimScreenShare(roomId, cId, myPeerId, true, accessToken);
          claimed = true;
        } catch (e) {
          if (e instanceof CallApiError && !e.isUnavailable) {
            const n = noticeFromApiError(e.status, e.body);
            if (n) { setNotice(n); return; }
          }
          // server unreachable: share anyway, peers still learn about it through call.screen
        }
      }
      const release = () => {
        if (claimed && cId && accessToken) releaseScreenShare(roomId, cId, myPeerId, accessToken).catch(() => {});
      };

      // 2. The browser's picker. Closing it (or denying) throws NotAllowedError.
      let screen: MediaStream;
      try {
        screen = await navigator.mediaDevices.getDisplayMedia(screenCaptureRequest(true) as DisplayMediaStreamOptions);
      } catch (e) {
        release();
        const kind = classifyCaptureError(e, env);
        const map = { denied: "screenDenied", system: "screenSystem", noSource: "screenNoSource", unsupported: "screenUnsupported", insecure: "screenInsecure", other: "screenFailed" } as const;
        setNotice({ kind: map[kind] });
        return;
      }
      const videoTrack = screen.getVideoTracks()[0];
      if (!videoTrack || !isInCallRef.current) {
        screen.getTracks().forEach((t) => t.stop());
        release();
        if (!videoTrack) setNotice({ kind: "screenFailed" });
        return;
      }
      try { videoTrack.contentHint = "detail"; } catch { /* not supported */ }
      const withAudio = screen.getAudioTracks().length > 0;

      screenStreamRef.current = screen;
      setScreenStream(screen);
      setIsScreenSharing(true);
      // The browser's own "Stop sharing" bar ends the track: that is how a share normally ends.
      videoTrack.onended = () => { stopScreenShareRef.current?.({ announce: true }); };
      peerConnections.current.forEach((pc) => attachScreenTracks(pc, screen));
      dispatchShare({ type: "started", share: { peerId: myPeerId, streamId: screen.id, withAudio, startedAt: Date.now() } });
      realtime.getChannel(realtimeChannel.roomSignal(roomId)).publish("call.screen", {
        peerId: myPeerId,
        active: true,
        streamId: screen.id,
        audio: withAudio,
      }).catch(() => {});
      // The claim said "with audio" before we knew: correct the server's record (idempotent, no second announcement).
      if (claimed && !withAudio && cId && accessToken) claimScreenShare(roomId, cId, myPeerId, false, accessToken).catch(() => {});
    } finally {
      startingShareRef.current = false;
    }
  }, [roomId, realtime, myPeerId, accessToken, attachScreenTracks]);

  const toggleScreenShare = useCallback(async () => {
    if (screenStreamRef.current) stopScreenShare({ announce: true });
    else await startScreenShare();
  }, [startScreenShare, stopScreenShare]);

  // The upload budget is per viewer: re-split it when people come and go while sharing.
  useEffect(() => {
    if (!isScreenSharing) return;
    peerConnections.current.forEach((pc) => applyQualityToPc(pc));
  }, [isScreenSharing, basePeers.length, applyQualityToPc]);

  // ── setFilter ──
  const setFilter = useCallback(
    (filter: VideoFilter) => {
      setActiveFilter(filter);
      if (filter === "none") {
        setIsCameraFilterActive(false);
        stopFilterLoop();
      } else {
        setIsCameraFilterActive(true);
      }
    },
    [stopFilterLoop]
  );

  useEffect(() => {
    if (isCameraFilterActive && activeFilter !== "none" && isInCall) {
      stopFilterLoop();
      startFilterLoop();
    }
  }, [activeFilter, isCameraFilterActive, isInCall]);

  // ── toggleRecording ──
  const toggleRecording = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;

    if (!isRecording) {
      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
        ? "video/webm;codecs=vp9,opus"
        : "video/webm";
      try {
        const recorder = new MediaRecorder(stream, { mimeType });
        recordingChunks.current = [];
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) recordingChunks.current.push(e.data);
        };
        recorder.onstop = () => {
          const blob = new Blob(recordingChunks.current, { type: "video/webm" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          const name = myDisplayName.replace(/\s+/g, "_");
          a.download = `call-${callIdRef.current ?? "local"}-${name}-${Date.now()}.webm`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          recordingChunks.current = [];
        };
        recorder.start(1000);
        mediaRecorder.current = recorder;

        let elapsed = 0;
        recordingTimer.current = setInterval(() => {
          elapsed += 1;
          setRecordingElapsed(elapsed);
        }, 1000);

        setIsRecording(true);
      } catch (e) {
        console.error("[REC] MediaRecorder failed", e);
      }
    } else {
      if (recordingTimer.current) {
        clearInterval(recordingTimer.current);
        recordingTimer.current = null;
      }
      mediaRecorder.current?.stop();
      mediaRecorder.current = null;
      setIsRecording(false);
      setRecordingElapsed(0);
    }
  }, [isRecording, myDisplayName]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (iceRestartTimeoutRef.current) clearTimeout(iceRestartTimeoutRef.current);
      if (peersCheckTimeoutRef.current) clearTimeout(peersCheckTimeoutRef.current);
      if (staleCallTimeoutRef.current) clearTimeout(staleCallTimeoutRef.current);
      if (isInCallRef.current) {
        leaveCall();
      }
    };
  }, []);

  // End the call record when the tab/browser closes without an explicit leaveCall
  useEffect(() => {
    if (!roomId || !accessToken) return;
    const handleBeforeUnload = () => {
      const cId = callIdRef.current;
      if (!isInCallRef.current || !cId) return;
      if (presenceActiveRef.current) {
        // Leave the call, not end it: the others may still be talking (the server ends it when the last one goes).
        leaveCallPresence(roomId, cId, myPeerId, accessToken, true).catch(() => {});
        return;
      }
      fetch(`${API_BASE_URL}/rooms/${roomId}/calls/${cId}`, {
        method: "PATCH",
        keepalive: true,
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ endedAt: new Date().toISOString() }),
      }).catch(() => {});
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [roomId, accessToken, myPeerId]);

  return {
    isInCall,
    callId,
    callStartTime,
    localStream,
    screenStream,
    peers,
    isAudioMuted,
    isVideoMuted,
    isScreenSharing,
    isCameraFilterActive,
    activeFilter,
    isRecording,
    recordingElapsed,
    liveCaption,
    transcriptSegments,
    captionSettings,
    setCaptionSettings,
    canParticipate: peers.length < maxParticipants,
    maxParticipants,
    notice,
    dismissNotice: () => setNotice(null),
    screenShares: shareState.shares,
    screenShareSupported,
    /** Display name of whoever holds the screen when it is not us and the policy allows one sharer (null = free to share). */
    screenShareBusyBy: (() => {
      const gate = canStartShare(shareState, myPeerId);
      return gate.ok ? null : basePeers.find((p) => p.peerId === gate.sharerPeerId)?.displayName || gate.sharerPeerId;
    })(),
    joinCall,
    leaveCall,
    toggleAudio,
    toggleVideo,
    toggleScreenShare,
    toggleRecording,
    setFilter,
    backgroundBlur,
    setBackgroundBlur,
    skinSmooth,
    setSkinSmooth,
    backgroundRemoval,
    setBackgroundRemoval,
    virtualBackgroundUrl,
    setVirtualBackgroundUrl,
    backgroundColor,
    setBackgroundColor,
    switchCamera,
    currentVideoDeviceId,
    muteParticipant,
    kickParticipant,
    disableParticipantScreen,
    canManageCall: canManage && !isDm,
    canvasRef,
    localVideoRef,
  };
}
