"use client";

import { useEffect, useId, useRef, useSyncExternalStore } from "react";

import { useTranslations } from "@/components/providers/i18n-provider";
import type { KqlTable } from "@/lib/query/kql";
import {
  applySession, cancelSession, closeSession, getServerSnapshot, getSnapshot, isPrimaryHost, openSession, registerHost, registerOwner, subscribe, updateDraft, updateTables,
  type ApplyValue,
} from "@/lib/query-flow/session-store";
import { QueryFlowEditor } from "./QueryFlowEditor";
import { WorkspaceMount } from "./workspace-mount";

export interface QueryFlowDialogProps {
  /**
   * Opens (true) or closes (false) the editor for `ownerId`. Without it the component only draws whatever session is open, so one
   * instance mounted high in the app (the layout) keeps the editor alive across route changes and re-mounts of the brick.
   */
  open?: boolean;
  /** Who is asking (a brick id): the key of the session and of the autosaved draft. Stable per brick. */
  ownerId?: string;
  /** The script currently stored (opened as an Advanced KQL step when there is no `flow`). */
  initialScript?: string;
  /** The `source.flow` stored with it. */
  initialFlow?: unknown;
  tables?: KqlTable[];
  /** Close & Apply (the editor then closes) or, with `keepOpen`, the plain "Apply". */
  onApply?: (value: ApplyValue, options?: { keepOpen?: boolean }) => void;
  /** The editor was closed without applying. */
  onClose?: () => void;
  /**
   * Called with true when the editor of this owner shows and with false when it hides. Overlays that sit behind the workspace (the
   * KQL pill dialog) use it to hide while the editor is open.
   */
  onOpenChange?: (open: boolean) => void;
}

/**
 * The "Visual editor": Power Query's layout inside the app's workspace area (below the top bar, right of the sidebar), or full screen
 * when the page has no workspace slot. It is drawn from the session store, not from the state of the component that asked for it:
 * a re-mount of the brick, a refresh or a route change does not close it, and the draft survives.
 */
export function QueryFlowDialog({ open, ownerId: ownerProp, initialScript, initialFlow, tables, onApply, onClose, onOpenChange }: QueryFlowDialogProps) {
  const t = useTranslations("query-flow");
  const reactId = useId();
  const ownerId = ownerProp ?? `owner:${reactId}`;
  const hostId = `host:${reactId}`;
  const snap = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // this instance is a host; the first one that mounted draws the editor
  useEffect(() => registerHost(hostId), [hostId]);

  // the owner's latest callbacks (the owner may re-render or re-mount; the editor looks them up when the user acts)
  const handlers = useRef({ onApply, onClose });
  handlers.current = { onApply, onClose };
  const hasOwner = open !== undefined || !!onApply || !!onClose;
  useEffect(() => {
    if (!hasOwner) return;
    return registerOwner(ownerId, {
      onApply: (value, options) => handlers.current.onApply?.(value, options),
      onClose: () => handlers.current.onClose?.(),
    });
  }, [ownerId, hasOwner]);

  // open / close on request. Only a true -> false change closes: a re-mounted owner starts with open=false and must not close the session
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open === undefined) return;
    if (open) { openSession({ ownerId, initialScript, initialFlow, tables }); wasOpen.current = true; }
    else if (wasOpen.current) { closeSession(ownerId); wasOpen.current = false; }
    // the content of the session is decided when it opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ownerId]);
  useEffect(() => { if (tables) updateTables(ownerId, tables); }, [ownerId, tables]);

  const mine = snap.sessions.some((s) => s.ownerId === ownerId);
  const lastOpen = useRef<boolean | null>(null);
  useEffect(() => {
    if (lastOpen.current === mine) return;
    lastOpen.current = mine;
    if (onOpenChange) onOpenChange(mine);
  }, [mine, onOpenChange]);

  const session = snap.sessions[snap.sessions.length - 1] ?? null;
  if (!session || !isPrimaryHost(hostId, snap)) return null;
  return (
    <WorkspaceMount label={t("dialog.title")}>
      <QueryFlowEditor
        key={session.ownerId}
        ownerId={session.ownerId}
        initialScript={session.initialScript}
        initialFlow={session.initialFlow}
        draftGraph={session.draft}
        tables={session.tables}
        ownerPresent={!!snap.owners[session.ownerId]}
        onDraft={(graph, dirty) => updateDraft(session.ownerId, graph, dirty)}
        onApply={(value, options) => applySession(session.ownerId, value, options)}
        onClose={() => cancelSession(session.ownerId)}
      />
    </WorkspaceMount>
  );
}
