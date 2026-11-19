"use client";

import { Skeleton } from "@/components/ui/skeleton";

/**
 * Shown while a board has neither a cached copy nor a first answer from the API. It uses only the app's own tokens
 * (background, border, card, muted), so it is light in a light tenant, dark in a dark one, and never the near-black the
 * board shell used to paint before its data arrived. Measures match the real header and the 288 px list columns, so the
 * board replaces it without moving anything.
 */
export function BoardSkeleton() {
  return (
    <div
      data-board-scroll
      data-testid="board-skeleton"
      aria-busy="true"
      className="flex flex-col h-full overflow-hidden relative bg-background text-foreground"
    >
      <header className="flex items-center justify-between px-6 py-3 border-b border-border bg-card/40 w-full shrink-0">
        <div className="flex items-center space-x-4">
          <Skeleton className="h-7 w-48 rounded-md" />
          <div className="h-4 w-[1px] bg-border" />
          <Skeleton className="h-8 w-24 rounded-md" />
          <Skeleton className="h-8 w-20 rounded-md" />
        </div>
        <div className="flex items-center space-x-2">
          <Skeleton className="h-8 w-8 rounded-full" />
          <Skeleton className="h-8 w-24 rounded-md" />
          <Skeleton className="h-8 w-8 rounded-md" />
        </div>
      </header>
      <main className="flex-1 overflow-hidden">
        <div className="h-full p-6 inline-flex items-start space-x-4">
          {[3, 2, 3, 1].map((cards, column) => (
            <div
              key={column}
              className="w-72 shrink-0 rounded-xl border border-border bg-card/60 p-3 space-y-3"
              style={{ opacity: 1 - column * 0.15 }}
            >
              <div className="flex items-center gap-2 px-1">
                <Skeleton className="h-4 w-28 rounded" />
                <Skeleton className="h-4 w-5 rounded-full ml-auto" />
              </div>
              {Array.from({ length: cards }).map((_, i) => (
                <div key={i} className="rounded-lg border border-border bg-card p-3 space-y-2">
                  <Skeleton className="h-3 w-3/4 rounded" />
                  <Skeleton className="h-3 w-1/2 rounded" />
                  {i === 0 ? (
                    <div className="flex items-center gap-2 pt-1">
                      <Skeleton className="h-5 w-5 rounded-full shrink-0" />
                      <Skeleton className="h-3 w-16 rounded" />
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
