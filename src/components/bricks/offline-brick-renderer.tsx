"use client";

// Offline (Local workspace) brick renderer. Reuses the REAL online renderer
// (UnifiedBrickRenderer) so markdown + every special format renders identically.
// Only the backend-dependent parts are swapped: unsupported kinds (ai/payment/
// database) show a placeholder, and asset:<name> media refs are resolved to
// object URLs from the workspace folder before delegating.

import { useEffect, useMemo, useState } from "react";
import { Ban } from "lucide-react";
import type { DocumentBrick, DocumentSummary } from "@/lib/api/documents";
import type { BoardSummary } from "@/lib/api/contracts";
import { UnifiedBrickRenderer } from "@/components/bricks/brick-renderer";
import { localDocsForPicker, localBoardsForPicker } from "@/lib/local-workspace/local-references";
import { offlineBrickSupport } from "@/lib/local-workspace/offline-bricks";
import { isAssetRef, resolveAssetUrl, writeAsset, assetFilenameForFile, makeAssetRef } from "@/lib/local-workspace/assets";
import { useLocalWorkspace } from "@/components/providers/local-workspace-provider";
import { uploadFilesAsMediaItems, parseMediaMeta, buildMediaCaption, type MediaCarouselItem } from "@/lib/media-bricks";

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
  const { getDir, files } = useLocalWorkspace();
  // @-mention picker targets = other files in the local workspace.
  const documents = useMemo(() => localDocsForPicker(files).map((d) => ({
    id: d.id, title: d.title, teamId: "local", visibility: "private", createdByUserId: "", createdAt: "", updatedAt: "",
  })) as unknown as DocumentSummary[], [files]);
  const boards = useMemo(() => localBoardsForPicker(files).map((b) => ({
    id: b.id, name: b.title, teamId: "local", boardType: b.kind === "km" ? "mesh" : "kanban", visibility: "private", createdAt: "", updatedAt: "",
  })) as unknown as BoardSummary[], [files]);
  const content = useMemo<Record<string, unknown>>(() => (brick.content && typeof brick.content === "object" ? brick.content as Record<string, unknown> : {}), [brick.content]);
  const support = offlineBrickSupport(brick.kind);
  const resolvedContent = useResolvedContent(content);

  // Offline media upload: write the file into the workspace assets/ folder and
  // store an asset:<name> ref instead of uploading to the cloud.
  const handleUploadMedia = async ({ files }: { files: File[] }) => {
    const dir = getDir();
    if (!dir || files.length === 0) return;
    const items = await uploadFilesAsMediaItems({
      files,
      accessToken: "offline",
      allowLocalBlobFallback: false,
      uploadFile: async (file: File) => {
        const name = assetFilenameForFile(file, (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}`);
        await writeAsset(dir, name, file);
        return { key: name, url: makeAssetRef(name), isPrivate: false };
      },
    });
    if (items.length === 0) return;
    const fallback: MediaCarouselItem = { url: typeof content.url === "string" ? content.url : "" };
    const existing = parseMediaMeta(typeof content.caption === "string" ? content.caption : "", fallback);
    const next = [...existing.items.filter((it) => it.url), ...items];
    const first = next[0];
    onUpdate?.({
      ...content,
      mediaType: first?.mimeType?.startsWith("image/") ? "image" : "file",
      title: first?.title || content.title || "Media",
      url: first?.url || content.url || "",
      mimeType: first?.mimeType || null,
      sizeBytes: first?.sizeBytes || null,
      caption: buildMediaCaption({ subtitle: existing.subtitle || "", items: next }),
    });
  };

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
      onUploadMediaFiles={handleUploadMedia}
      documents={documents}
      boards={boards}
      activeBricks={[]}
      users={[]}
    />
  );
}
