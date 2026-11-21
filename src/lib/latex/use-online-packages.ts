"use client";
import { useEffect, useState } from "react";
import { findRemoteUrls } from "./latex-text";
import { fetchOnlinePackage } from "./online-packages";

/**
 * Fetches the online packages a text references and returns `{ ref → source }`
 * for `prepareLatex({ remote })`. Re-renders the caller once downloads settle.
 */
export function useOnlinePackages(text: string): Record<string, string> {
  const [sources, setSources] = useState<Record<string, string>>({});
  useEffect(() => {
    const refs = findRemoteUrls(text).filter((r) => !(r in sources));
    if (refs.length === 0) return;
    let alive = true;
    for (const ref of refs) {
      fetchOnlinePackage(ref).then((src) => {
        if (alive) setSources((prev) => (ref in prev ? prev : { ...prev, [ref]: src ?? "" }));
      });
    }
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);
  return sources;
}
