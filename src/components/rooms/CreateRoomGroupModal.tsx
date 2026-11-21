"use client";

import type { RoomGroup } from "@/lib/api/rooms";
import { CategorySettingsModal } from "./CategorySettingsModal";

type TFn = (key: string, params?: Record<string, string | number>) => string;

interface CreateRoomGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  teamId: string;
  accessToken: string;
  onCreated: (group: RoomGroup) => void;
  t: TFn;
}

/** "New category" dialog: CategorySettingsModal in create mode. */
export function CreateRoomGroupModal({ isOpen, onClose, teamId, accessToken, onCreated, t }: CreateRoomGroupModalProps) {
  return (
    <CategorySettingsModal
      open={isOpen}
      onClose={onClose}
      teamId={teamId}
      accessToken={accessToken}
      canEditPermissions={false}
      onSaved={(group) => onCreated(group)}
      t={t}
    />
  );
}
