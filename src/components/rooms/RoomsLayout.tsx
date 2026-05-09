"use client";

import { useState } from "react";
import { Menu } from "lucide-react";

interface RoomsLayoutProps {
  sidebar: (onClose: () => void) => React.ReactNode;
  children: React.ReactNode;
}

export function RoomsLayout({ sidebar, children }: RoomsLayoutProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="flex h-full overflow-hidden relative">
      {/* Mobile overlay */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 md:hidden backdrop-blur-sm"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {/* Sidebar — slide-in drawer on mobile, static panel on desktop */}
      <div
        className={[
          "fixed inset-y-0 left-0 z-50 md:static md:z-auto md:translate-x-0",
          "transition-transform duration-300 ease-in-out md:transition-none",
          drawerOpen ? "translate-x-0" : "-translate-x-full",
        ].join(" ")}
      >
        {sidebar(() => setDrawerOpen(false))}
      </div>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        {/* Mobile top bar with hamburger */}
        <div className="md:hidden flex items-center gap-3 px-3 py-2.5 border-b border-border/40 bg-background/80 backdrop-blur shrink-0">
          <button
            onClick={() => setDrawerOpen(true)}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/10 transition-colors"
            aria-label="Open rooms menu"
          >
            <Menu className="w-4 h-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
