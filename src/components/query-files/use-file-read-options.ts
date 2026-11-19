"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useSession } from "@/components/providers/session-provider";
import {
  getReadOptions,
  previewFile,
  saveReadOptions,
  type FileKind,
  type PreviewResponse,
} from "@/lib/api/file-read-options";
import type { FileColumnType, FileReadOptions } from "@/lib/query/file-read-options";
import {
  diffOptions,
  initialState,
  isDirty,
  mergeOverDefaults,
  readOptionsReducer,
} from "@/lib/query/file-read-options-state";

export const PREVIEW_DEBOUNCE_MS = 400;
export const PREVIEW_LIMIT = 50;

const sessionKey = (teamId: string, fileId: string) => `killio:file-read-options:${teamId}:${fileId}`;

/** Options a viewer without edit rights chose for this browser session (null when none / storage unavailable). */
export function readSessionOptions(teamId: string, fileId: string): Partial<FileReadOptions> | null {
  try {
    const raw = window.sessionStorage.getItem(sessionKey(teamId, fileId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Partial<FileReadOptions>) : null;
  } catch {
    return null;
  }
}

export function writeSessionOptions(teamId: string, fileId: string, options: FileReadOptions | null): void {
  try {
    if (options) window.sessionStorage.setItem(sessionKey(teamId, fileId), JSON.stringify(options));
    else window.sessionStorage.removeItem(sessionKey(teamId, fileId));
  } catch {
    /* storage unavailable: the options simply are not remembered */
  }
}

export interface PreviewState {
  /** The last good response (kept while a new one loads or after an error). */
  data: PreviewResponse | null;
  loading: boolean;
  error: string | null;
}

function safePreview(value: PreviewResponse | null | undefined): PreviewResponse | null {
  if (!value || typeof value !== "object") return null;
  return {
    columns: Array.isArray(value.columns) ? value.columns.filter((c) => c && typeof c === "object") : [],
    rows: Array.isArray(value.rows) ? value.rows.filter(Array.isArray) : [],
    rawRows: Array.isArray(value.rawRows) ? value.rawRows.filter(Array.isArray) : [],
    encodingUsed: typeof value.encodingUsed === "string" ? value.encodingUsed : "",
    delimiterUsed: typeof value.delimiterUsed === "string" ? value.delimiterUsed : "",
    totalRowsSeen: typeof value.totalRowsSeen === "number" ? value.totalRowsSeen : 0,
    truncated: !!value.truncated,
    warnings: Array.isArray(value.warnings) ? value.warnings.filter((w) => typeof w === "string") : [],
  };
}

export function useFileReadOptions(teamId: string, fileId: string, enabled = true) {
  const { accessToken } = useSession();
  const [state, dispatch] = useReducer(readOptionsReducer, undefined, () => initialState());
  const [meta, setMeta] = useState<{ kind: FileKind | null; sheets: string[]; saved: boolean }>({ kind: null, sheets: [], saved: false });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [preview, setPreview] = useState<PreviewState>({ data: null, loading: false, error: null });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const previewAbort = useRef<AbortController | null>(null);

  // Load the saved options.
  useEffect(() => {
    if (!enabled || !accessToken || !teamId || !fileId) return;
    const ctrl = new AbortController();
    setLoading(true);
    setLoadError(null);
    setLoaded(false);
    setPreview({ data: null, loading: false, error: null });
    getReadOptions(teamId, fileId, accessToken, ctrl.signal)
      .then((res) => {
        if (ctrl.signal.aborted) return;
        dispatch({ type: "load", options: res?.options });
        const sessionPatch = readSessionOptions(teamId, fileId);
        if (sessionPatch) dispatch({ type: "set", patch: sessionPatch });
        setMeta({ kind: res?.kind ?? null, sheets: Array.isArray(res?.sheets) ? res.sheets : [], saved: !!res?.saved });
        setLoaded(true);
      })
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        setLoadError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
  }, [enabled, accessToken, teamId, fileId]);

  // Preview, debounced; the previous request is aborted; the last good grid stays.
  const draftKey = useMemo(() => JSON.stringify(state.draft), [state.draft]);
  const firstPreview = useRef(true);
  useEffect(() => {
    if (!enabled || !loaded || !accessToken || !teamId || !fileId) return;
    const delay = firstPreview.current ? 0 : PREVIEW_DEBOUNCE_MS;
    const timer = setTimeout(() => {
      firstPreview.current = false;
      previewAbort.current?.abort();
      const ctrl = new AbortController();
      previewAbort.current = ctrl;
      setPreview((p) => ({ ...p, loading: true, error: null }));
      previewFile(teamId, fileId, { options: state.draft, limit: PREVIEW_LIMIT }, accessToken, ctrl.signal)
        .then((res) => {
          if (ctrl.signal.aborted) return;
          const safe = safePreview(res);
          if (!safe) throw new Error("Malformed preview response");
          setPreview({ data: safe, loading: false, error: null });
        })
        .catch((e: unknown) => {
          if (ctrl.signal.aborted) return;
          setPreview((p) => ({ data: p.data, loading: false, error: e instanceof Error ? e.message : String(e) }));
        });
    }, delay);
    return () => clearTimeout(timer);
    // draftKey stands for state.draft
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, loaded, accessToken, teamId, fileId, draftKey]);

  useEffect(() => () => previewAbort.current?.abort(), []);
  useEffect(() => {
    if (!enabled) firstPreview.current = true;
  }, [enabled]);

  const set = useCallback((patch: Partial<FileReadOptions>) => dispatch({ type: "set", patch }), []);
  const setColumnType = useCallback((column: string, value: FileColumnType | null) => dispatch({ type: "setColumnType", column, value }), []);
  const setColumnName = useCallback((column: string, value: string | null) => dispatch({ type: "setColumnName", column, value }), []);
  const reset = useCallback(() => dispatch({ type: "reset" }), []);

  /** canEdit: PUT the minimal patch; otherwise keep the draft in sessionStorage only. Returns the options in force, or null on failure. */
  const save = useCallback(
    async (canEdit: boolean): Promise<FileReadOptions | null> => {
      setSaveError(null);
      if (!canEdit) {
        writeSessionOptions(teamId, fileId, state.draft);
        return state.draft;
      }
      if (!accessToken) {
        setSaveError("No session");
        return null;
      }
      setSaving(true);
      try {
        const patch = diffOptions(state.baseline, state.draft);
        const res = await saveReadOptions(teamId, fileId, patch, accessToken);
        const options = mergeOverDefaults(res?.options ?? state.draft);
        dispatch({ type: "load", options });
        writeSessionOptions(teamId, fileId, null);
        setMeta((m) => ({ ...m, saved: true }));
        return options;
      } catch (e) {
        setSaveError(e instanceof Error ? e.message : String(e));
        return null;
      } finally {
        setSaving(false);
      }
    },
    [accessToken, teamId, fileId, state.baseline, state.draft],
  );

  return {
    draft: state.draft,
    baseline: state.baseline,
    dirty: isDirty(state.baseline, state.draft),
    kind: meta.kind,
    sheets: meta.sheets,
    savedOnServer: meta.saved,
    loading,
    loadError,
    preview,
    saving,
    saveError,
    set,
    setColumnType,
    setColumnName,
    reset,
    save,
  };
}
