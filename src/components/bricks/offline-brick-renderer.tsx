"use client";

// Custom brick renderer for OFFLINE (Local workspace) mode. Backend-free: full
// kinds render from file content, degraded kinds show what they can with a
// notice, and unsupported kinds (ai/payment/database) show a placeholder.
// Asset refs (asset:<name>) resolve to object URLs from the workspace folder.

import { useEffect, useState } from "react";
import { Ban, CloudOff, FileWarning } from "lucide-react";
import { offlineBrickSupport } from "@/lib/local-workspace/offline-bricks";
import { isAssetRef, resolveAssetUrl } from "@/lib/local-workspace/assets";
import { useLocalWorkspace } from "@/components/providers/local-workspace-provider";

type Brick = { id: string; kind: string; content?: unknown };

function rec(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

function AssetImage({ src, alt }: { src: string; alt?: string }) {
  const { getDir } = useLocalWorkspace();
  const [url, setUrl] = useState<string | null>(isAssetRef(src) ? null : src);
  useEffect(() => {
    if (!isAssetRef(src)) { setUrl(src); return; }
    const dir = getDir();
    if (!dir) return;
    let revoked: string | null = null;
    resolveAssetUrl(dir, src).then((u) => { revoked = u; setUrl(u); }).catch(() => setUrl(null));
    return () => { if (revoked) URL.revokeObjectURL(revoked); };
  }, [src, getDir]);
  if (!url) return <div className="rounded bg-muted/40 p-4 text-center text-xs text-muted-foreground">image…</div>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={alt ?? ""} className="max-h-[480px] max-w-full rounded" />;
}

function Notice({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-dashed border-amber-400/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-200/80">
      {icon} {text}
    </div>
  );
}

export function OfflineBrickRenderer({ brick }: { brick: Brick }) {
  const c = rec(brick.content);
  const support = offlineBrickSupport(brick.kind);

  if (support === "unsupported") {
    return <Notice icon={<Ban className="h-3.5 w-3.5" />} text={`"${brick.kind}" is not available offline.`} />;
  }

  switch (brick.kind) {
    case "text":
    case "quote":
    case "callout": {
      const md = typeof c.markdown === "string" ? c.markdown : "";
      const cls = brick.kind === "quote"
        ? "border-l-2 border-accent/50 pl-3 italic text-muted-foreground"
        : brick.kind === "callout"
          ? "rounded-lg border border-border bg-accent/5 p-3"
          : "";
      return <div className={`whitespace-pre-wrap text-sm text-foreground ${cls}`}>{md}</div>;
    }
    case "code":
    case "math":
      return <pre className="overflow-auto rounded-lg bg-slate-900/60 p-3 font-mono text-[12px] text-slate-200">{typeof c.markdown === "string" ? c.markdown : typeof c.code === "string" ? c.code : ""}</pre>;
    case "divider":
      return <hr className="border-border" />;
    case "checklist": {
      const items = Array.isArray(c.items) ? (c.items as Array<Record<string, unknown>>) : [];
      return (
        <ul className="space-y-1 text-sm">
          {items.map((it, i) => (
            <li key={i} className="flex items-center gap-2">
              <input type="checkbox" checked={!!it.checked} readOnly className="accent-accent" />
              <span className={it.checked ? "text-muted-foreground line-through" : ""}>{String(it.label ?? "")}</span>
            </li>
          ))}
        </ul>
      );
    }
    case "table":
    case "beautiful_table": {
      const rows = Array.isArray(c.rows) ? (c.rows as unknown[][]) : [];
      return (
        <div className="overflow-auto">
          <table className="w-full border-collapse text-sm">
            <tbody>
              {rows.map((row, ri) => (
                <tr key={ri}>
                  {(Array.isArray(row) ? row : []).map((cell, ci) => (
                    <td key={ci} className="border border-border px-2 py-1">{String(cell ?? "")}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    case "image":
    case "media": {
      const url = typeof c.url === "string" ? c.url : typeof c.src === "string" ? c.src : "";
      if (!url) return <Notice icon={<FileWarning className="h-3.5 w-3.5" />} text="Missing media reference." />;
      return <AssetImage src={url} alt={typeof c.caption === "string" ? c.caption : ""} />;
    }
    case "bookmark": {
      const url = typeof c.url === "string" ? c.url : "";
      return (
        <div>
          <Notice icon={<CloudOff className="h-3.5 w-3.5" />} text="Bookmark preview unavailable offline." />
          {url && <a href={url} className="mt-1 block break-all text-xs text-accent underline" target="_blank" rel="noreferrer">{url}</a>}
        </div>
      );
    }
    case "form":
      return <Notice icon={<CloudOff className="h-3.5 w-3.5" />} text="Form is view-only offline (submissions need the backend)." />;
    case "popup_document":
      return <Notice icon={<CloudOff className="h-3.5 w-3.5" />} text="Linked document can't be opened offline." />;
    case "graph": {
      const type = typeof c.type === "string" ? c.type : "chart";
      return <div className="rounded-lg border border-border bg-card/40 p-3 text-xs text-muted-foreground">📊 {type} chart</div>;
    }
    default:
      // accordion/tabs/columns containers + unknown: show a light summary
      return <div className="rounded-lg border border-border bg-card/30 p-2 text-xs text-muted-foreground">{brick.kind}</div>;
  }
}
