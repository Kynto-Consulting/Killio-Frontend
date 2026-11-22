"use client";

/**
 * One profile card per screen. The rooms page mounts <UserProfileProvider> (with its composer, DM, mute and presence) and every
 * place that paints a person (members panel, message author, @mention, "X used /cmd") calls `useProfileOpener().open(...)`.
 * Surfaces without a provider (board and document chat drawers) still get a card: the hook then keeps its own state and offers
 * the direct-message action only.
 */

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { useSession } from "@/components/providers/session-provider";
import { findOrCreateDm } from "@/lib/api/rooms";
import type { AnchorRect, KnownProfile, Presence } from "@/lib/rooms/user-profile";
import { toAnchor } from "@/lib/rooms/user-profile";
import { UserProfileCard, type ProfileCardActions } from "./UserProfileCard";

export interface OpenProfileArgs {
  userId: string;
  anchor: AnchorRect;
  known?: KnownProfile;
}

interface Ctx {
  open: (args: OpenProfileArgs) => void;
}

const ProfileCtx = createContext<Ctx | null>(null);

/** Rect of the pressed element, in the shape the card positions itself from. */
export const anchorOf = (el: Element): AnchorRect => toAnchor(el.getBoundingClientRect());

interface Opened extends OpenProfileArgs {
  opener: HTMLElement | null;
}

function useOpened() {
  const [opened, setOpened] = useState<Opened | null>(null);
  const openedRef = useRef<Opened | null>(null);
  openedRef.current = opened;
  const open = useCallback((args: OpenProfileArgs) => {
    const active = typeof document !== "undefined" ? (document.activeElement as HTMLElement | null) : null;
    setOpened({ ...args, opener: active && active !== document.body ? active : null });
  }, []);
  const close = useCallback(() => {
    const opener = openedRef.current?.opener;
    setOpened(null);
    if (opener && opener.isConnected) requestAnimationFrame(() => opener.focus());
  }, []);
  return { opened, open, close };
}

export interface UserProfileProviderProps {
  teamId: string | null | undefined;
  roomId?: string | null;
  presenceOf?: (userId: string) => Presence | null;
  /** Anything the page already knows about the person (members panel, directory) to paint before the request answers. */
  knownOf?: (userId: string) => KnownProfile | undefined;
  actions?: ProfileCardActions;
  children: ReactNode;
}

export function UserProfileProvider({ teamId, roomId, presenceOf, knownOf, actions, children }: UserProfileProviderProps) {
  const { opened, open, close } = useOpened();
  const value = useMemo<Ctx>(() => ({ open }), [open]);
  return (
    <ProfileCtx.Provider value={value}>
      {children}
      {opened && teamId && (
        <UserProfileCard
          key={opened.userId}
          teamId={teamId}
          roomId={roomId}
          userId={opened.userId}
          anchor={opened.anchor}
          known={{ ...knownOf?.(opened.userId), ...opened.known }}
          presence={presenceOf?.(opened.userId) ?? null}
          actions={actions}
          onClose={close}
        />
      )}
    </ProfileCtx.Provider>
  );
}

/** `open` of the page-level provider, or null where there is none (e.g. a document): callers keep their own behaviour then. */
export const useProfileProviderOpen = (): Ctx["open"] | null => useContext(ProfileCtx)?.open ?? null;

/**
 * `open(...)` plus `card`: render `{card}` once next to the trigger. With a provider `card` is null (the provider renders it);
 * without one the hook owns the card, with the direct-message action.
 */
export function useProfileOpener(teamId?: string | null, extra: Pick<ProfileCardActions, "onOpenCopilot"> = {}): { open: (args: OpenProfileArgs) => void; card: ReactNode } {
  const ctx = useContext(ProfileCtx);
  const router = useRouter();
  const { accessToken } = useSession();
  const local = useOpened();

  const onMessage = useCallback(async (userId: string) => {
    if (!teamId || !accessToken) return;
    try {
      const room = await findOrCreateDm(teamId, userId, accessToken);
      router.push(`/rooms/${room.id}`);
    } catch {
      /* the card closes anyway; the DM list shows the failure where it can */
    }
  }, [teamId, accessToken, router]);
  const onOpenCopilot = extra.onOpenCopilot;
  const actions = useMemo<ProfileCardActions>(() => ({ onMessage: (id) => { void onMessage(id); }, onOpenCopilot }), [onMessage, onOpenCopilot]);

  if (ctx) return { open: ctx.open, card: null };
  const card = local.opened && teamId
    ? <UserProfileCard key={local.opened.userId} teamId={teamId} userId={local.opened.userId} anchor={local.opened.anchor} known={local.opened.known} actions={actions} onClose={local.close} />
    : null;
  return { open: local.open, card };
}
