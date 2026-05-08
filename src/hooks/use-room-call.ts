"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { getAblyClient } from "@/lib/ably";
import {
  createCallRecord,
  endCallRecord,
  submitCallTranscript,
  CallTranscriptSegment,
} from "@/lib/api/rooms";

export type VideoFilter = "none" | "blur" | "grayscale" | "warm";

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
  accessToken: string | null | undefined
) {
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
  const [isRecording, setIsRecording] = useState(false);
  const [recordingElapsed, setRecordingElapsed] = useState(0);

  const myPeerId = user?.id || "";
  const myDisplayName = user?.displayName || user?.username || user?.email || "Unknown";

  const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const callIdRef = useRef<string | null>(null);
  const callStartTimeRef = useRef<number | null>(null);
  const isInCallRef = useRef(false);

  // Recording
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const recordingChunks = useRef<Blob[]>([]);
  const recordingTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // STT
  const recognition = useRef<any>(null);
  const localSegments = useRef<CallTranscriptSegment[]>([]);

  // Canvas filter refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const filterRafRef = useRef<number | null>(null);
  const filteredStreamRef = useRef<MediaStream | null>(null);

  const getDisplayName = () => myDisplayName;

  // ── create or get a PeerConnection for peerId ──
  const getOrCreatePC = useCallback(
    (peerId: string): RTCPeerConnection => {
      if (peerConnections.current.has(peerId)) {
        return peerConnections.current.get(peerId)!;
      }

      const pc = new RTCPeerConnection(RTC_CONFIG);

      pc.onicecandidate = (e) => {
        if (!e.candidate || !roomId || !accessToken) return;
        const ably = getAblyClient(accessToken);
        ably.channels.get(`room:${roomId}:signal`).publish("call.ice", {
          fromPeerId: myPeerId,
          targetPeerId: peerId,
          candidate: e.candidate.toJSON(),
        });
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

      // Add existing local tracks
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
        const ably = getAblyClient(accessToken);
        ably.channels.get(`room:${roomId}:signal`).publish("call.offer", {
          fromPeerId: myPeerId,
          targetPeerId: peerId,
          sdp: offer,
        });
      } catch (e) {
        console.error("[RTC] sendOffer failed", e);
      }
    },
    [roomId, accessToken, myPeerId, getOrCreatePC]
  );

  // ── Ably signaling subscription ──
  useEffect(() => {
    if (!roomId || !accessToken) return;
    const ably = getAblyClient(accessToken);
    const signal = ably.channels.get(`room:${roomId}:signal`);

    const onJoin = async (msg: any) => {
      const { peerId, displayName, avatarUrl } = msg.data;
      if (peerId === myPeerId || !isInCallRef.current) return;
      // New peer joined — add to list and send them an offer
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
      setPeers((prev) => prev.filter((p) => p.peerId !== peerId));
    };

    const onOffer = async (msg: any) => {
      const { fromPeerId, targetPeerId, sdp } = msg.data;
      if (targetPeerId !== myPeerId || !isInCallRef.current) return;
      const pc = getOrCreatePC(fromPeerId);
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        if (!roomId || !accessToken) return;
        const ably2 = getAblyClient(accessToken);
        ably2.channels.get(`room:${roomId}:signal`).publish("call.answer", {
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

    signal.subscribe("call.join", onJoin);
    signal.subscribe("call.leave", onLeave);
    signal.subscribe("call.offer", onOffer);
    signal.subscribe("call.answer", onAnswer);
    signal.subscribe("call.ice", onIce);
    signal.subscribe("call.mute", onMute);
    signal.subscribe("call.screen", onScreen);

    return () => {
      signal.unsubscribe("call.join", onJoin);
      signal.unsubscribe("call.leave", onLeave);
      signal.unsubscribe("call.offer", onOffer);
      signal.unsubscribe("call.answer", onAnswer);
      signal.unsubscribe("call.ice", onIce);
      signal.unsubscribe("call.mute", onMute);
      signal.unsubscribe("call.screen", onScreen);
    };
  }, [roomId, accessToken, myPeerId, sendOffer, getOrCreatePC]);

  // ── Canvas filter loop ──
  const startFilterLoop = useCallback(() => {
    const canvas = canvasRef.current;
    const video = localVideoRef.current;
    if (!canvas || !video) return;

    const draw = () => {
      if (!canvas || !video || video.readyState < 2) {
        filterRafRef.current = requestAnimationFrame(draw);
        return;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const f = activeFilter;
      ctx.filter =
        f === "blur"
          ? "blur(10px)"
          : f === "grayscale"
          ? "grayscale(100%)"
          : f === "warm"
          ? "sepia(40%) saturate(120%)"
          : "none";
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      filterRafRef.current = requestAnimationFrame(draw);
    };
    filterRafRef.current = requestAnimationFrame(draw);

    const filtered = canvas.captureStream(30);
    filteredStreamRef.current = filtered;

    // Replace video track in all peer connections
    peerConnections.current.forEach((pc) => {
      const sender = pc.getSenders().find((s) => s.track?.kind === "video");
      if (sender && filtered.getVideoTracks()[0]) {
        sender.replaceTrack(filtered.getVideoTracks()[0]).catch(console.error);
      }
    });
  }, [activeFilter]);

  const stopFilterLoop = useCallback(() => {
    if (filterRafRef.current) {
      cancelAnimationFrame(filterRafRef.current);
      filterRafRef.current = null;
    }
    // Restore original camera track
    const original = localStreamRef.current?.getVideoTracks()[0];
    if (original) {
      peerConnections.current.forEach((pc) => {
        const sender = pc.getSenders().find((s) => s.track?.kind === "video");
        if (sender) sender.replaceTrack(original).catch(console.error);
      });
    }
    filteredStreamRef.current = null;
  }, []);

  // ── STT setup ──
  const startSTT = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const r = new SR();
    r.continuous = true;
    r.interimResults = false;
    r.lang = navigator.language;
    const t0 = callStartTimeRef.current ?? Date.now();

    r.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          localSegments.current.push({
            userId: myPeerId,
            displayName: getDisplayName(),
            text: result[0].transcript.trim(),
            startMs: Math.max(0, (event.timeStamp ?? Date.now()) - t0 - 3000),
            endMs: Date.now() - t0,
            confidence: result[0].confidence ?? 1,
          });
        }
      }
    };

    r.onerror = () => { /* silently ignore STT errors */ };
    try { r.start(); } catch { /* ignore if already running */ }
    recognition.current = r;
  }, [myPeerId]);

  const stopSTT = useCallback(() => {
    try { recognition.current?.stop(); } catch { /* ignore */ }
    recognition.current = null;
  }, []);

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

    // Attach to hidden video element for canvas filter
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
      localVideoRef.current.play().catch(() => {});
    }
    if (canvasRef.current) {
      canvasRef.current.width = 480;
      canvasRef.current.height = 270;
    }

    // Create call record
    let call;
    try {
      call = await createCallRecord(roomId, accessToken);
    } catch {
      call = { id: `local-${Date.now()}`, roomId, startedAt: new Date().toISOString(), participants: [], transcriptStatus: "none" as const, initiatorUserId: myPeerId };
    }
    callIdRef.current = call.id;
    callStartTimeRef.current = Date.now();
    setCallId(call.id);
    setCallStartTime(Date.now());
    isInCallRef.current = true;
    setIsInCall(true);

    // Publish join
    const ably = getAblyClient(accessToken);
    ably.channels.get(`room:${roomId}:signal`).publish("call.join", {
      peerId: myPeerId,
      displayName: myDisplayName,
      avatarUrl: user.avatarUrl,
      callId: call.id,
    });

    // Start STT
    localSegments.current = [];
    startSTT();
  }, [roomId, accessToken, user, peers.length, myPeerId, myDisplayName, startSTT]);

  // ── leaveCall ──
  const leaveCall = useCallback(async () => {
    if (!isInCallRef.current) return;

    // Stop recording if active
    if (mediaRecorder.current?.state === "recording") {
      mediaRecorder.current.stop();
    }
    if (recordingTimer.current) {
      clearInterval(recordingTimer.current);
      recordingTimer.current = null;
    }
    setIsRecording(false);
    setRecordingElapsed(0);

    // Stop STT and submit transcript
    stopSTT();
    if (callIdRef.current && roomId && accessToken && localSegments.current.length > 0) {
      submitCallTranscript(roomId, callIdRef.current, localSegments.current, accessToken).catch(console.error);
    }
    if (callIdRef.current && roomId && accessToken) {
      endCallRecord(roomId, callIdRef.current, accessToken).catch(console.error);
    }

    // Close all peer connections
    peerConnections.current.forEach((pc) => pc.close());
    peerConnections.current.clear();

    // Stop filter loop
    stopFilterLoop();

    // Stop local media
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());

    // Publish leave
    if (roomId && accessToken) {
      const ably = getAblyClient(accessToken);
      ably.channels.get(`room:${roomId}:signal`).publish("call.leave", { peerId: myPeerId }).catch(() => {});
    }

    localStreamRef.current = null;
    screenStreamRef.current = null;
    callIdRef.current = null;
    callStartTimeRef.current = null;
    localSegments.current = [];
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

  // ── toggleAudio ──
  const toggleAudio = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    stream.getAudioTracks().forEach((t) => { t.enabled = !t.enabled; });
    const muted = !stream.getAudioTracks()[0]?.enabled;
    setIsAudioMuted(muted);
    if (roomId && accessToken) {
      const ably = getAblyClient(accessToken);
      ably.channels.get(`room:${roomId}:signal`).publish("call.mute", {
        peerId: myPeerId,
        audioMuted: muted,
        videoMuted: isVideoMuted,
      }).catch(() => {});
    }
  }, [roomId, accessToken, myPeerId, isVideoMuted]);

  // ── toggleVideo ──
  const toggleVideo = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    stream.getVideoTracks().forEach((t) => { t.enabled = !t.enabled; });
    const muted = !stream.getVideoTracks()[0]?.enabled;
    setIsVideoMuted(muted);
    if (roomId && accessToken) {
      const ably = getAblyClient(accessToken);
      ably.channels.get(`room:${roomId}:signal`).publish("call.mute", {
        peerId: myPeerId,
        audioMuted: isAudioMuted,
        videoMuted: muted,
      }).catch(() => {});
    }
  }, [roomId, accessToken, myPeerId, isAudioMuted]);

  // ── toggleScreenShare ──
  const toggleScreenShare = useCallback(async () => {
    if (!roomId || !accessToken) return;
    const ably = getAblyClient(accessToken);
    const signal = ably.channels.get(`room:${roomId}:signal`);

    if (!isScreenSharing) {
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

        screen.getVideoTracks()[0].onended = () => {
          toggleScreenShare();
        };

        signal.publish("call.screen", { peerId: myPeerId, active: true }).catch(() => {});
      } catch (e) {
        console.error("[RTC] getDisplayMedia failed", e);
      }
    } else {
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
      setScreenStream(null);
      setIsScreenSharing(false);

      // Restore camera track
      const cameraTrack = localStreamRef.current?.getVideoTracks()[0];
      if (cameraTrack) {
        peerConnections.current.forEach((pc) => {
          const sender = pc.getSenders().find((s) => s.track?.kind === "video");
          if (sender) sender.replaceTrack(cameraTrack).catch(console.error);
        });
      }
      signal.publish("call.screen", { peerId: myPeerId, active: false }).catch(() => {});
    }
  }, [roomId, accessToken, myPeerId, isScreenSharing]);

  // ── setFilter ──
  const setFilter = useCallback(
    (filter: VideoFilter) => {
      setActiveFilter(filter);
      if (filter === "none") {
        setIsCameraFilterActive(false);
        stopFilterLoop();
      } else {
        setIsCameraFilterActive(true);
        // Loop will pick up new filter value on next render via activeFilter state
      }
    },
    [stopFilterLoop]
  );

  // Restart filter loop when activeFilter changes while active
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
        recorder.start(1000); // collect in 1s chunks
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
    canParticipate: peers.length < MAX_PARTICIPANTS,
    joinCall,
    leaveCall,
    toggleAudio,
    toggleVideo,
    toggleScreenShare,
    toggleRecording,
    setFilter,
    canvasRef,
    localVideoRef,
  };
}
