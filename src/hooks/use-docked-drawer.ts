"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Docks a right-hand drawer next to the page instead of over it. The dashboard layout owns an empty slot
 * (`#right-drawer-slot`) whose width is the CSS variable `--right-drawer-width`, and the page content gets the same
 * amount of right padding, so opening the drawer shrinks the content and nothing is covered. On narrow screens the
 * drawer stays an overlay.
 */
export function useDockedDrawer(isOpen: boolean, width: number) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [wide, setWide] = useState(true);

  useEffect(() => {
    setSlot(document.getElementById("right-drawer-slot"));
    const query = window.matchMedia("(min-width: 768px)");
    const sync = () => setWide(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  const docked = isOpen && wide && !!slot;

  useEffect(() => {
    if (!docked) return;
    const root = document.documentElement;
    root.style.setProperty("--right-drawer-width", `${width}px`);
    return () => {
      root.style.removeProperty("--right-drawer-width");
    };
  }, [docked, width]);

  const place = (node: ReactNode): ReactNode => (docked && slot ? createPortal(node, slot) : node);
  return { docked, place };
}
