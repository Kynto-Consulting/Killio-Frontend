"use client";

import { useState } from "react";
import { X, Loader2 } from "lucide-react";
import { usePlatform } from "@/components/providers/platform-provider";
import { createRoomGroup, type RoomGroup } from "@/lib/api/rooms";

type TFn = (key: string) => string;

interface CreateRoomGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  teamId: string;
  accessToken: string;
  onCreated: (group: RoomGroup) => void;
  t: TFn;
}

export function CreateRoomGroupModal({
  isOpen,
  onClose,
  teamId,
  accessToken,
  onCreated,
  t,
}: CreateRoomGroupModalProps) {
  const platform = usePlatform();
  const isMobile = platform === "mobile";
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setIsCreating(true);
    try {
      const group = await createRoomGroup(teamId, { name: name.trim(), emoji: emoji.trim() || undefined }, accessToken);
      setName("");
      setEmoji("");
      onCreated(group);
    } catch (err) {
      console.error(err);
    } finally {
      setIsCreating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className={`fixed inset-0 z-[260] flex ${isMobile ? "items-end justify-stretch" : "items-center justify-center"} bg-black/50 backdrop-blur-sm`}>
      <div className={`bg-card border border-border shadow-2xl w-full overflow-hidden ${isMobile ? "rounded-t-2xl max-h-[92vh]" : "max-w-xs rounded-2xl"}`}>
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="text-sm font-semibold">{t("createGroup.title")}</h3>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-accent/10 text-muted-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div className="flex gap-2">
            {/* Emoji */}
            <div className="space-y-1.5 w-16">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {t("createGroup.emojiLabel")}
              </label>
              <input
                type="text"
                value={emoji}
                onChange={(e) => setEmoji(e.target.value)}
                placeholder="📁"
                maxLength={4}
                className="w-full px-2 py-2 text-center text-lg rounded-xl border border-border bg-background focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>

            {/* Name */}
            <div className="space-y-1.5 flex-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {t("createGroup.nameLabel")}
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("createGroup.namePlaceholder")}
                className="w-full px-3 py-2 text-sm rounded-xl border border-border bg-background focus:outline-none focus:ring-1 focus:ring-accent"
                required
                autoFocus
              />
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 text-sm rounded-xl border border-border text-muted-foreground hover:bg-accent/5 transition-colors"
            >
              {t("createRoom.cancel")}
            </button>
            <button
              type="submit"
              disabled={!name.trim() || isCreating}
              className="flex-1 py-2 text-sm rounded-xl bg-accent text-accent-foreground font-medium hover:bg-accent/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
            >
              {isCreating && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {t("createRoom.submitButton")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
