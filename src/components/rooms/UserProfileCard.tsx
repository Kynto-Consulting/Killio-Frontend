"use client";

import { useState, useRef, useEffect } from "react";
import { MessageSquare, Mail, Building2, Loader2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useSession } from "@/components/providers/session-provider";
import { findOrCreateDm } from "@/lib/api/rooms";
import { Portal } from "@/components/ui/portal";

interface UserProfileCardProps {
  userId: string;
  displayName: string;
  email?: string;
  avatarUrl?: string;
  teamId: string;
  anchor: { x: number; y: number };
  onClose: () => void;
}

export function UserProfileCard({
  userId,
  displayName,
  email,
  avatarUrl,
  teamId,
  anchor,
  onClose,
}: UserProfileCardProps) {
  const router = useRouter();
  const { accessToken } = useSession();
  const [isOpening, setIsOpening] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) onClose();
    };
    const handleEsc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", handleOutside, true);
    document.addEventListener("keydown", handleEsc, true);
    return () => {
      document.removeEventListener("mousedown", handleOutside, true);
      document.removeEventListener("keydown", handleEsc, true);
    };
  }, [onClose]);

  const openDm = async () => {
    if (!accessToken) return;
    setIsOpening(true);
    try {
      const room = await findOrCreateDm(teamId, userId, accessToken);
      router.push(`/rooms/${room.id}`);
      onClose();
    } catch (e) {
      console.error(e);
    } finally {
      setIsOpening(false);
    }
  };

  const initials = displayName
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <Portal>
      <div
        ref={cardRef}
        className="fixed z-[500] w-64 bg-card border border-border rounded-2xl shadow-2xl overflow-hidden"
        style={{ left: anchor.x, top: anchor.y }}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-accent/20 to-accent/5 px-4 pt-4 pb-3 relative">
          <button
            onClick={onClose}
            className="absolute top-2 right-2 p-1 rounded-md hover:bg-black/10 text-muted-foreground"
          >
            <X className="w-3.5 h-3.5" />
          </button>
          <div className="flex items-center gap-3">
            {avatarUrl ? (
              <img src={avatarUrl} alt={displayName} className="w-12 h-12 rounded-full object-cover ring-2 ring-background" />
            ) : (
              <div className="w-12 h-12 rounded-full bg-accent text-accent-foreground flex items-center justify-center text-sm font-bold ring-2 ring-background">
                {initials}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">{displayName}</p>
              {email && <p className="text-xs text-muted-foreground truncate">{email}</p>}
            </div>
          </div>
        </div>

        {/* Info rows */}
        <div className="px-4 py-3 space-y-2">
          {email && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Mail className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{email}</span>
            </div>
          )}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Building2 className="w-3.5 h-3.5 shrink-0" />
            <span>Same workspace</span>
          </div>
        </div>

        {/* Actions */}
        <div className="px-4 pb-4">
          <button
            onClick={openDm}
            disabled={isOpening}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-accent text-accent-foreground text-sm font-medium hover:bg-accent/90 disabled:opacity-50 transition-colors"
          >
            {isOpening ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <MessageSquare className="w-3.5 h-3.5" />
            )}
            Send message
          </button>
        </div>
      </div>
    </Portal>
  );
}
