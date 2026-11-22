"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

const DOCK_MIN_WIDTH = 1100;

/**
 * Docks a right-hand drawer next to the page instead of over it. The dashboard layout owns an empty slot
 * (`#right-drawer-slot`) whose width is the CSS variable `--right-drawer-width`, and the page content gets the same
 * amount of right padding, so opening the drawer shrinks the content and nothing is covered. Below 1100px the
 * drawer stays an overlay (the sidebar and a 384px drawer would leave the page a sliver).
 */
export function useDockedDrawer(isOpen: boolean, width: number) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [wide, setWide] = useState(true);

  useEffect(() => {
    setSlot(document.getElementById("right-drawer-slot"));
    // Docking needs room for the sidebar, the drawer and a usable page: below this width the drawer overlays the page.
    const query = window.matchMedia(`(min-width: ${DOCK_MIN_WIDTH}px)`);
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

  // Overlay mode goes to <body>: a `fixed` drawer inside the page would sit under the top bar (stacking context of <main>).
  const place = (node: ReactNode): ReactNode => (docked && slot ? createPortal(node, slot) : typeof document !== "undefined" ? createPortal(node, document.body) : node);
  return { docked, place };
}
