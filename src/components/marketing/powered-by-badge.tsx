"use client";

import { useTenant } from "@/components/providers/tenant-provider";

/** Small "Powered by Killio" mark, shown only in tenant mode (and only if poweredBy.show). */
export function PoweredByBadge() {
  const tenant = useTenant();
  if (tenant.mode !== "tenant" || !tenant.poweredBy.show) return null;

  const side = tenant.poweredBy.position === "bottom-left" ? "left-3" : "right-3";
  return (
    <a
      href="https://www.killio.dev"
      target="_blank"
      rel="noopener noreferrer"
      className={`fixed bottom-2 ${side} z-30 rounded-full border border-border/60 bg-card/80 px-2.5 py-1 text-[10px] text-muted-foreground opacity-70 backdrop-blur transition-opacity hover:opacity-100 print:hidden`}
    >
      Powered by <span className="font-semibold text-foreground">Killio</span>
    </a>
  );
}
