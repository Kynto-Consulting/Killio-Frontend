"use client";

import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

/** Base skeleton block — animated pulse, matches bg-muted */
export function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-muted",
        className,
      )}
      style={style}
    />
  );
}

/** One sidebar nav item (icon + label) */
export function SkeletonSidebarItem({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-3 px-3 py-2", className)}>
      <Skeleton className="h-4 w-4 rounded shrink-0" />
      <Skeleton className="h-3 flex-1 rounded" />
    </div>
  );
}

/** Compact sidebar link (no icon) */
export function SkeletonSidebarLink({ className }: { className?: string }) {
  return (
    <div className={cn("px-3 py-1.5", className)}>
      <Skeleton className="h-3 w-4/5 rounded" />
    </div>
  );
}

/** A single kanban card placeholder */
export function SkeletonKanbanCard({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-xl border border-border bg-card p-3 space-y-2", className)}>
      <Skeleton className="h-3 w-3/4 rounded" />
      <Skeleton className="h-3 w-1/2 rounded" />
      <div className="flex items-center gap-2 pt-1">
        <Skeleton className="h-5 w-5 rounded-full shrink-0" />
        <Skeleton className="h-3 w-16 rounded" />
      </div>
    </div>
  );
}

/** A kanban column placeholder (header + 3 cards) */
export function SkeletonKanbanColumn({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-col gap-3 min-w-[260px] w-[260px]", className)}>
      <div className="flex items-center gap-2 px-1">
        <Skeleton className="h-4 w-24 rounded" />
        <Skeleton className="h-4 w-5 rounded-full ml-auto" />
      </div>
      <SkeletonKanbanCard />
      <SkeletonKanbanCard />
      <SkeletonKanbanCard />
    </div>
  );
}

/** Board/mesh card in a grid */
export function SkeletonBoardCard({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-2xl border border-border bg-card overflow-hidden", className)}>
      <Skeleton className="h-28 w-full rounded-none" />
      <div className="p-3 space-y-2">
        <Skeleton className="h-4 w-2/3 rounded" />
        <Skeleton className="h-3 w-1/3 rounded" />
      </div>
    </div>
  );
}

/** Document row in a list */
export function SkeletonDocumentRow({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-3 px-4 py-3", className)}>
      <Skeleton className="h-8 w-8 rounded-lg shrink-0" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-3 w-2/3 rounded" />
        <Skeleton className="h-3 w-1/3 rounded" />
      </div>
    </div>
  );
}

/** Room list row */
export function SkeletonRoomRow({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-3 px-4 py-3", className)}>
      <Skeleton className="h-9 w-9 rounded-full shrink-0" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-3 w-1/2 rounded" />
        <Skeleton className="h-3 w-1/4 rounded" />
      </div>
      <Skeleton className="h-5 w-5 rounded shrink-0" />
    </div>
  );
}
