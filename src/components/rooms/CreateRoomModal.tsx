"use client";

import type { Room, RoomGroup } from "@/lib/api/rooms";
import { ChannelSettingsModal } from "./ChannelSettingsModal";

type TFn = (key: string, params?: Record<string, string | number>) => string;

interface CreateRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  teamId: string;
  accessToken: string;
  groups?: RoomGroup[];
  /** Existing rooms in the team: blocks creating a duplicate-named room. */
  rooms?: Room[];
  initialGroupId?: string;
  /** Show the permissions tab (type, presets and who-can-do-what) while creating. */
  canEditPermissions?: boolean;
  onCreated: (roomId: string) => void;
  t: TFn;
}

/** "New channel" dialog. The form itself is ChannelSettingsModal in create mode (one component for create and edit). */
export function CreateRoomModal({
  isOpen, onClose, teamId, accessToken, groups = [], rooms = [], initialGroupId, canEditPermissions = false, onCreated, t,
}: CreateRoomModalProps) {
  return (
    <ChannelSettingsModal
      open={isOpen}
      onClose={onClose}
      teamId={teamId}
      accessToken={accessToken}
      groups={groups}
      rooms={rooms}
      initialGroupId={initialGroupId}
      canEditPermissions={canEditPermissions}
      onCreated={(room) => onCreated(room.id)}
      t={t}
    />
  );
}
