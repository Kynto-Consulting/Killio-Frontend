"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRealtime } from "@/components/providers/realtime-provider";
import { realtimeChannel } from "@/lib/realtime/channels";
import {
  createCallRecord,
  endCallRecord,
  getActiveCall,
  submitCallTranscript,
  CallTranscriptSegment,
} from "@/lib/api/rooms";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
import { getFilterStyle } from "@/components/rooms/RoomCallEffectsPanel";
import { VideoEffectsProcessor } from "@/lib/video-effects-processor";

export type VideoFilter = "none" | "blur" | "grayscale" | "warm" | "cool" | "sepia" | "vivid" | "neon" | "vintage" | "noir" | "vaporwave" | "glow";

export interface CallPeer {
  peerId: string;
  displayName: string;
  avatarUrl?: string;
  stream?: MediaStream;
  audioMuted: boolean;
  videoMuted: boolean;
  isScreenSharing: boolean;
}

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

  let realtime: ReturnType<typeof useRealtime> | null = null;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    realtime = useRealtime();
  } catch {}

  const [isInCall, setIsInCall] = useState(false);
  const [callId, setCallId] = useState<string | null>(null);
  const [callStartTime, setCallStartTime] = useState<number | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [peers, setPeers] = useState<CallPeer[]>([]);
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

  // Tab-stable suffix so the same user on multiple devices gets distinct peer IDs
  const tabIdRef = useRef(Math.random().toString(36).slice(2, 8));
  const myPeerId = user?.id ? `${user.id}-${tabIdRef.current}` : "";
  const myDisplayName = user?.displayName || user?.username || user?.email || "Unknown";

  const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map());
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
          prev.map((p) => (p.peerId === peerId ? { ...p, stream } : p))
        );
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
          peerConnections.current.delete(peerId);
          setPeers((prev) => prev.filter((p) => p.peerId !== peerId));
          pc.close();
        }
      };

      const stream = localStreamRef.current;
      if (stream) {
        stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      }

      peerConnections.current.set(peerId, pc);
      return pc;
    },
    [roomId, accessToken, myPeerId]
  );

  // ── send offer to peerId ──
  const sendOffer = useCallback(
    async (peerId: string) => {
      if (!roomId || !accessToken) return;
      const pc = getOrCreatePC(peerId);
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        realtime?.getChannel(realtimeChannel.roomSignal(roomId!)).publish("call.offer", {
          fromPeerId: myPeerId,
          targetPeerId: peerId,
          sdp: offer,
        }).catch(() => {});
      } catch (e) {
        console.error("[RTC] sendOffer failed", e);
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
        return [...prev, { peerId, displayName, avatarUrl, audioMuted: false, videoMuted: false, isScreenSharing: false }];
      });
      await sendOffer(peerId);
    };

    const onLeave = (msg: any) => {
      const { peerId } = msg.data;
      const pc = peerConnections.current.get(peerId);
      if (pc) { pc.close(); peerConnections.current.delete(peerId); }
      setPeers((prev) => {
        const next = prev.filter((p) => p.peerId !== peerId);
        if (next.length === 0 && isInCallRef.current) {
          setTimeout(() => leaveCallRef.current?.(), 500);
        }
        return next;
      });
    };

    const onOffer = async (msg: any) => {
      const { fromPeerId, targetPeerId, sdp } = msg.data;
      if (targetPeerId !== myPeerId || !isInCallRef.current) return;
      const pc = getOrCreatePC(fromPeerId);
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
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
        console.error("[RTC] onIce failed", e);
      }
    };

    const onMute = (msg: any) => {
      const { peerId, audioMuted, videoMuted } = msg.data;
      setPeers((prev) =>
        prev.map((p) => (p.peerId === peerId ? { ...p, audioMuted, videoMuted } : p))
      );
    };

    const onScreen = (msg: any) => {
      const { peerId, active } = msg.data;
      setPeers((prev) =>
        prev.map((p) => (p.peerId === peerId ? { ...p, isScreenSharing: active } : p))
      );
    };

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
      // Stop screen share by stopping tracks (triggers onended handler)
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
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
        const sender = pc.getSenders().find((s) => s.track?.kind === "video");
        if (sender && filtered.getVideoTracks()[0]) {
          sender.replaceTrack(filtered.getVideoTracks()[0]).catch(console.error);
        }
      });
    }
  }, [activeFilter, backgroundBlur, skinSmooth]);

  const stopFilterLoop = useCallback(() => {
    if (filterRafRef.current) {
      cancelAnimationFrame(filterRafRef.current);
      filterRafRef.current = null;
    }
    const original = localStreamRef.current?.getVideoTracks()[0];
    if (original) {
      peerConnections.current.forEach((pc) => {
        const sender = pc.getSenders().find((s) => s.track?.kind === "video");
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
    if (callIdRef.current && roomId && accessToken) {
      const remaining = localSegments.current.slice(lastSubmittedSegmentIndex.current);
      if (remaining.length > 0) {
        submitCallTranscript(roomId, callIdRef.current, remaining, accessToken).catch(console.error);
      }
      endCallRecord(roomId, callIdRef.current, accessToken).catch(console.error);
    }

    // Close all peer connections
    peerConnections.current.forEach((pc) => pc.close());
    peerConnections.current.clear();

    stopFilterLoop();

    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());

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

  // ── joinCall ──
  const joinCall = useCallback(async () => {
    if (!roomId || !accessToken || !user || isInCallRef.current) return;
    if (peers.length >= MAX_PARTICIPANTS) return;

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    } catch (e) {
      console.error("[RTC] getUserMedia failed", e);
      throw e;
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

    let call;
    try {
      // Join existing active call if one is ongoing, otherwise start a new one
      const existing = await getActiveCall(roomId, accessToken);
      call = existing ?? await createCallRecord(roomId, accessToken);
    } catch {
      call = { id: `local-${Date.now()}`, roomId, startedAt: new Date().toISOString(), participants: [], transcriptStatus: "none" as const, initiatorUserId: user.id ?? myPeerId };
    }
    callIdRef.current = call.id;
    callStartTimeRef.current = Date.now();
    setCallId(call.id);
    setCallStartTime(Date.now());
    isInCallRef.current = true;
    setIsInCall(true);

    realtime?.getChannel(realtimeChannel.roomSignal(roomId)).publish("call.join", {
      peerId: myPeerId,
      displayName: myDisplayName,
      avatarUrl: user.avatarUrl,
      callId: call.id,
    }).catch(() => {});

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
        const sender = pc.getSenders().find((s) => s.track?.kind === "video");
        if (sender) sender.replaceTrack(newVideoTrack).catch(console.error);
      });

      setCurrentVideoDeviceId(deviceId);
      setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
    } catch (e) {
      console.error("[RTC] switchCamera failed", e);
    }
  }, [localStream]);

  // ── toggleScreenShare ──
  const toggleScreenShare = useCallback(async () => {
    if (!roomId || !realtime) return;
    const signal = realtime.getChannel(realtimeChannel.roomSignal(roomId));

    if (!isScreenSharingRef.current) {
      try {
        const screen = await navigator.mediaDevices.getDisplayMedia({ video: true });
        screenStreamRef.current = screen;
        setScreenStream(screen);
        setIsScreenSharing(true);

        const screenTrack = screen.getVideoTracks()[0];
        peerConnections.current.forEach((pc) => {
          const sender = pc.getSenders().find((s) => s.track?.kind === "video");
          if (sender) sender.replaceTrack(screenTrack).catch(console.error);
        });

        screen.getVideoTracks()[0].onended = () => { toggleScreenShare(); };
        signal.publish("call.screen", { peerId: myPeerId, active: true }).catch(() => {});
      } catch (e) {
        console.error("[RTC] getDisplayMedia failed", e);
      }
    } else {
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
      setScreenStream(null);
      setIsScreenSharing(false);

      const cameraTrack = localStreamRef.current?.getVideoTracks()[0];
      if (cameraTrack) {
        peerConnections.current.forEach((pc) => {
          const sender = pc.getSenders().find((s) => s.track?.kind === "video");
          if (sender) sender.replaceTrack(cameraTrack).catch(console.error);
        });
      }
      signal.publish("call.screen", { peerId: myPeerId, active: false }).catch(() => {});
    }
  }, [roomId, realtime, myPeerId]);

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
      fetch(`${API_BASE_URL}/rooms/${roomId}/calls/${cId}`, {
        method: "PATCH",
        keepalive: true,
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ endedAt: new Date().toISOString() }),
      }).catch(() => {});
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [roomId, accessToken]);

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
    canParticipate: peers.length < MAX_PARTICIPANTS,
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
