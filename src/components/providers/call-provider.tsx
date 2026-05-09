"use client";

import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { useSession } from "./session-provider";
import { useRoomCall, type VideoFilter } from "@/hooks/use-room-call";
import { useTranslations } from "./i18n-provider";

interface CallContextType {
  activeRoomId: string | null;
  joinRoomCall: (roomId: string) => void;
  leaveRoomCall: () => void;
  call: ReturnType<typeof useRoomCall>;
  settingsModalOpen: boolean;
  setSettingsModalOpen: (open: boolean) => void;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  localVideoRef: React.RefObject<HTMLVideoElement | null>;
}

const CallContext = createContext<CallContextType | undefined>(undefined);

export function CallProvider({ children }: { children: React.ReactNode }) {
  const { user, accessToken } = useSession();
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const t = useTranslations("rooms");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);

  const userInfo = user ? {
    id: user.id,
    displayName: user.displayName || undefined,
    username: user.username || undefined,
    email: user.email || undefined,
  } : null;

  const call = useRoomCall(activeRoomId, userInfo, accessToken);

  const joinRoomCall = (roomId: string) => {
    setActiveRoomId(roomId);
    // The hook will see activeRoomId change and be ready, 
    // but joinCall needs to be called manually or via useEffect in the component
  };

  const leaveRoomCall = () => {
    call.leaveCall();
    setActiveRoomId(null);
  };

  // Synchronize activeRoomId with call.isInCall
  useEffect(() => {
    if (!call.isInCall && activeRoomId) {
      // If we were in a call and it ended (e.g. kicked or leaveCall finished), reset
      setActiveRoomId(null);
    }
  }, [call.isInCall, activeRoomId]);

  return (
    <CallContext.Provider value={{
      activeRoomId,
      joinRoomCall,
      leaveRoomCall,
      call,
      settingsModalOpen,
      setSettingsModalOpen,
      canvasRef,
      localVideoRef
    }}>
      {children}
    </CallContext.Provider>
  );
}

export function useCall() {
  const context = useContext(CallContext);
  if (!context) {
    throw new Error("useCall must be used within a CallProvider");
  }
  return context;
}
