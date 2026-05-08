"use client";

import { useState } from "react";
import { X, Loader2, ChevronDown, Hash } from "lucide-react";
import { createRoom, type CreateRoomInput, type RoomGroup } from "@/lib/api/rooms";

type TFn = (key: string) => string;

interface CreateRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  teamId: string;
  accessToken: string;
  groups?: RoomGroup[];
  initialGroupId?: string;
  onCreated: (roomId: string) => void;
  t: TFn;
}

export function CreateRoomModal({
  isOpen,
  onClose,
  teamId,
  accessToken,
  groups = [],
  initialGroupId,
  onCreated,
  t,
}: CreateRoomModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [groupId, setGroupId] = useState<string | undefined>(initialGroupId);
  const [isCreating, setIsCreating] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setIsCreating(true);
    try {
      const input: CreateRoomInput = {
        name: name.trim().toLowerCase().replace(/\s+/g, "-"),
        type: "channel",
        groupId,
        description: description.trim() || undefined,
      };
      const room = await createRoom(teamId, input, accessToken);
      setName("");
      setDescription("");
      setGroupId(initialGroupId);
      onCreated(room.id);
    } catch (e) {
      console.error(e);
    } finally {
      setIsCreating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Hash className="w-4 h-4 text-accent" />
            <h3 className="text-sm font-semibold">{t("createRoom.title")}</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-accent/10 text-muted-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Group selector */}
          {groups.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {t("createRoom.groupLabel")}
              </label>
              <div className="relative">
                <select
                  value={groupId ?? ""}
                  onChange={(e) => setGroupId(e.target.value || undefined)}
                  className="w-full appearance-none px-3 py-2 text-sm rounded-xl border border-border bg-background focus:outline-none focus:ring-1 focus:ring-accent pr-8"
                >
                  <option value="">{t("createRoom.noGroup")}</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.emoji ? `${g.emoji} ${g.name}` : g.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              </div>
            </div>
          )}

          {/* Name */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {t("createRoom.nameLabel")}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("createRoom.namePlaceholder")}
              className="w-full px-3 py-2 text-sm rounded-xl border border-border bg-background focus:outline-none focus:ring-1 focus:ring-accent"
              required
              autoFocus
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {t("createRoom.descriptionLabel")}
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("createRoom.descriptionPlaceholder")}
              className="w-full px-3 py-2 text-sm rounded-xl border border-border bg-background focus:outline-none focus:ring-1 focus:ring-accent"
            />
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
