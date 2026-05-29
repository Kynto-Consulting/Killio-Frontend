"use client";

// Offline (Local workspace) brick renderer. Reuses the REAL online renderer
// (UnifiedBrickRenderer) so markdown + every special format renders identically.
// Only the backend-dependent parts are swapped: unsupported kinds (ai/payment/
// database) show a placeholder, and asset:<name> media refs are resolved to
// object URLs from the workspace folder before delegating.

import { useEffect, useMemo, useState } from "react";
import { Ban } from "lucide-react";
import type { DocumentBrick } from "@/lib/api/documents";
import { UnifiedBrickRenderer } from "@/components/bricks/brick-renderer";
import { offlineBrickSupport } from "@/lib/local-workspace/offline-bricks";
import { isAssetRef, resolveAssetUrl } from "@/lib/local-workspace/assets";
import { useLocalWorkspace } from "@/components/providers/local-workspace-provider";

type Brick = { id: string; kind: string; position?: number; content?: unknown };

export interface OfflineBrickRendererProps {
  brick: Brick;
  canEdit?: boolean;
  onUpdate?: (content: Record<string, unknown>) => void;
}

// Resolve any asset:<name> values inside content.url/src to object URLs from disk.
function useResolvedContent(content: Record<string, unknown>): Record<string, unknown> {
  const { getDir } = useLocalWorkspace();
  const [resolved, setResolved] = useState<Record<string, unknown>>(content);
  const url = (typeof content.url === "string" && content.url) || (typeof content.src === "string" && content.src) || "";
  useEffect(() => {
    if (!isAssetRef(url)) { setResolved(content); return; }
    const dir = getDir();
    if (!dir) { setResolved(content); return; }
    let obj: string | null = null;
    resolveAssetUrl(dir, url)
      .then((u) => { obj = u; setResolved({ ...content, url: u, src: u }); })
      .catch(() => setResolved(content));
    return () => { if (obj) URL.revokeObjectURL(obj); };
  }, [url, content, getDir]);
  return resolved;
}

function ToDocBrick(b: Brick, content: Record<string, unknown>): DocumentBrick {
  return {
    id: b.id,
    documentId: "local",
    kind: b.kind,
    position: b.position ?? 0,
    content,
    createdByUserId: null,
    createdAt: "",
    updatedAt: "",
  } as unknown as DocumentBrick;
}

export function OfflineBrickRenderer({ brick, canEdit = false, onUpdate }: OfflineBrickRendererProps) {
  const content = useMemo<Record<string, unknown>>(() => (brick.content && typeof brick.content === "object" ? brick.content as Record<string, unknown> : {}), [brick.content]);
  const support = offlineBrickSupport(brick.kind);
  const resolvedContent = useResolvedContent(content);

  if (support === "unsupported") {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-dashed border-amber-400/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-200/80">
        <Ban className="h-3.5 w-3.5" /> &quot;{brick.kind}&quot; needs an online connection and is unavailable offline.
      </div>
    );
  }

  return (
    <UnifiedBrickRenderer
      brick={ToDocBrick(brick, resolvedContent)}
      canEdit={canEdit}
      onUpdate={(next) => onUpdate?.(next as Record<string, unknown>)}
      documents={[]}
      boards={[]}
      activeBricks={[]}
      users={[]}
    />
  );
}
