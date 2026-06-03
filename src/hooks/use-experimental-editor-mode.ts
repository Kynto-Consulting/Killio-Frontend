"use client";

import { useCallback, useEffect, useState } from "react";

// Local-only, per-device flag. When ON, text bricks stop round-tripping the
// live DOM through markdown source on focus/format and edit DIRECTLY on the
// rendered HTML. Experimental — opt-in from App Preferences.
const KEY = "killio_experimental_editor_mode";
const EVT = "killio:experimental-editor-mode";

export function getExperimentalEditorMode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setExperimentalEditorModeValue(on: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, on ? "1" : "0");
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(EVT, { detail: on }));
}

/** Reactive accessor — re-renders the caller when the flag flips anywhere. */
export function useExperimentalEditorMode(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(false);

  useEffect(() => {
    setOn(getExperimentalEditorMode());
    const sync = () => setOn(getExperimentalEditorMode());
    window.addEventListener(EVT, sync);
    window.addEventListener("storage", sync); // cross-tab
    return () => {
      window.removeEventListener(EVT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const set = useCallback((value: boolean) => {
    setExperimentalEditorModeValue(value);
    setOn(value);
  }, []);

  return [on, set];
}
