"use client";

import React, { createContext, useEffect, useState } from "react";
import { Loader2, AlertTriangle } from "lucide-react";
import { getDocument, getPublicDocument, type DocumentBrick, type DocumentView } from "@/lib/api/documents";
import { useSession } from "@/components/providers/session-provider";
import { useI18n } from "@/components/providers/i18n-provider";
import { sanitizeChildrenByContainer } from "@/lib/bricks/nesting";

/**
 * `chain`: documents already open above (for cycle detection). `depth`: how many embeds deep we are
 * (for the nesting limit — same number as the LaTeX export, so both agree on what is included).
 */
export const EmbedChainContext = createContext<{ chain: string[]; depth: number }>({ chain: [], depth: 0 });

/** At most 3 levels of documents inside documents. */
export const MAX_EMBED_DEPTH = 3;

const CACHE_TTL_MS = 20_000;
const cache = new Map<string, { at: number; job: Promise<DocumentView> }>();

function loadDocument(docId: string, accessToken: string | null | undefined): Promise<DocumentView> {
  const key = `${accessToken ? "u" : "p"}:${docId}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.job;
  const job = (accessToken ? getDocument(docId, accessToken) : getPublicDocument(docId)).then((doc) => {
    const bricks: DocumentBrick[] = Array.from(new Map(doc.bricks.map((b) => [b.id, b])).values());
    const ids = new Set(bricks.map((b) => b.id));
    return { ...doc, bricks: bricks.map((b) => ({ ...b, content: sanitizeChildrenByContainer(b.content || {}, ids) })) };
  });
  cache.set(key, { at: Date.now(), job });
  job.catch(() => cache.delete(key));
  return job;
}

let brickListPromise: Promise<React.ComponentType<any>> | null = null;
// Lazy: the brick list renders text bricks, which render this component — a static import would be circular.
const loadBrickList = () => (brickListPromise ??= import("@/components/bricks/unified-brick-list").then((m) => m.UnifiedBrickList));

const noop = () => {};

interface EmbeddedDocumentProps {
  docId: string;
  /** Documents open above the text brick that holds the `\input{doc:…}`. */
  chain: string[];
  /** Embed levels above that text brick (0 for the document the user is looking at). */
  depth: number;
}

/**
 * The live, read-only content of another document, inserted where `\input{doc:ID}` appears.
 * It goes through the normal API, so the viewer sees it only if they could open that document.
 */
export function EmbeddedDocument({ docId, chain, depth }: EmbeddedDocumentProps) {
  const { accessToken } = useSession();
  const { locale } = useI18n();
  const es = locale === "es";
  const [doc, setDoc] = useState<DocumentView | null>(null);
  const [error, setError] = useState<"load" | null>(null);
  const [BrickList, setBrickList] = useState<React.ComponentType<any> | null>(null);

  const circular = chain.includes(docId);
  const tooDeep = depth >= MAX_EMBED_DEPTH;
  const blocked = circular || tooDeep;

  useEffect(() => {
    if (blocked) return;
    let alive = true;
    setError(null);
    loadDocument(docId, accessToken)
      .then((d) => { if (alive) setDoc(d); })
      .catch(() => { if (alive) setError("load"); });
    loadBrickList().then((c) => { if (alive) setBrickList(() => c); });
    return () => { alive = false; };
  }, [docId, accessToken, blocked]);

  // The portal sits inside the text brick's React tree; keep clicks/keys from reaching its editor.
  const isolate = {
    onMouseDown: (e: React.SyntheticEvent) => e.stopPropagation(),
    onClick: (e: React.SyntheticEvent) => e.stopPropagation(),
    onKeyDown: (e: React.SyntheticEvent) => e.stopPropagation(),
    onPaste: (e: React.SyntheticEvent) => e.stopPropagation(),
  };

  if (blocked) {
    return (
      <div {...isolate} className="flex items-center gap-2 text-xs text-amber-400">
        <AlertTriangle className="h-3.5 w-3.5" />
        {circular
          ? (es ? "Inclusión circular: este documento ya está abierto más arriba." : "Circular include: this document is already open above.")
          : (es ? "Demasiados documentos anidados." : "Too many nested documents.")}
      </div>
    );
  }
  if (error) {
    return (
      <div {...isolate} className="flex items-center gap-2 text-xs text-muted-foreground">
        <AlertTriangle className="h-3.5 w-3.5" />
        {es ? "No se pudo cargar el documento (no existe o no tienes acceso)." : "Could not load the document (it does not exist or you have no access)."}
      </div>
    );
  }
  if (!doc || !BrickList) {
    return (
      <div {...isolate} className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        {es ? "Cargando documento…" : "Loading document…"}
      </div>
    );
  }

  return (
    <EmbedChainContext.Provider value={{ chain: [...chain, docId], depth: depth + 1 }}>
      <div {...isolate} data-embedded-document={docId}>
        {doc.title ? <div className="mb-1 text-sm font-semibold text-foreground/90">{doc.title}</div> : null}
        <BrickList
          bricks={doc.bricks}
          activeBricks={doc.bricks}
          canEdit={false}
          isCompact
          onUpdateBrick={noop}
          onDeleteBrick={noop}
          onReorderBricks={noop}
          onAddBrick={noop}
        />
      </div>
    </EmbedChainContext.Provider>
  );
}
