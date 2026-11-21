"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

import { useTenant } from "@/components/providers/tenant-provider";

/**
 * Small "Powered by Killio" mark, shown only in tenant mode (and only if poweredBy.show).
 *
 * `inline` renders it inside the dashboard sidebar, above the account block, where it never collides with page content,
 * the timer widget or a message box. While an inline one is mounted the floating one (used on every other page, e.g.
 * login) is hidden through the `has-inline-powered-by` class on <body>.
 */
export function PoweredByBadge({ inline = false }: { inline?: boolean }) {
  const tenant = useTenant();
  const pathname = usePathname();
  const visible = tenant.mode === "tenant" && tenant.poweredBy.show;

  useEffect(() => {
    if (!inline || !visible) return;
    document.body.classList.add("has-inline-powered-by");
    return () => document.body.classList.remove("has-inline-powered-by");
  }, [inline, visible]);

  if (!visible) return null;

  const mark = (
    <>
      Powered by <span className="font-semibold text-foreground">Killio</span>
    </>
  );

  if (inline) {
    return (
      <a
        href="https://www.killio.dev"
        target="_blank"
        rel="noopener noreferrer"
        className="mb-2 block text-center text-[10px] text-muted-foreground opacity-70 transition-opacity hover:opacity-100 print:hidden"
      >
        {mark}
      </a>
    );
  }

  // Above the message box of a room, never over its send button.
  const inRooms = Boolean(pathname?.startsWith("/rooms/"));
  const side = tenant.poweredBy.position === "bottom-left" ? "left-3" : "";
  return (
    <a
      data-floating-powered-by
      href="https://www.killio.dev"
      target="_blank"
      rel="noopener noreferrer"
      style={{ ...(tenant.poweredBy.position === "bottom-left" ? {} : { right: "calc(0.75rem + var(--right-drawer-width, 0px))" }), ...(inRooms ? { bottom: 88 } : {}) }}
      className={`fixed bottom-2 ${side} z-30 rounded-full border border-border/60 bg-card/80 px-2.5 py-1 text-[10px] text-muted-foreground opacity-70 backdrop-blur transition-opacity hover:opacity-100 print:hidden`}
    >
      {mark}
    </a>
  );
}
