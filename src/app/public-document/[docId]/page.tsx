"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { FileText, Loader2, Lock, Sparkles } from "lucide-react";
import { getPublicDocument, type DocumentView } from "@/lib/api/documents";
import { UnifiedBrickList } from "@/components/bricks/unified-brick-list";
import { useTranslations } from "@/components/providers/i18n-provider";

export default function PublicDocumentPage() {
  const t = useTranslations("document-detail");
  const { docId } = useParams() as { docId: string };
  const [document, setDocument] = useState<DocumentView | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadDocument = async () => {
      try {
        setIsLoading(true);
        const data = await getPublicDocument(docId);
        if (!isMounted) return;
        setDocument(data);
      } catch (loadError: any) {
        if (!isMounted) return;
        setError(loadError?.message || t("loadError"));
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    loadDocument();
    return () => {
      isMounted = false;
    };
  }, [docId, t]);

  if (isLoading) {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.14),_transparent_28%),linear-gradient(180deg,_rgba(255,255,255,0.98),_rgba(248,250,252,1))] text-foreground flex items-center justify-center p-6">
        <div className="flex items-center gap-3 rounded-full border border-border bg-card px-4 py-3 shadow-sm">
          <Loader2 className="h-4 w-4 animate-spin text-accent" />
          <span className="text-sm text-muted-foreground">Cargando documento público</span>
        </div>
      </main>
    );
  }

  if (error || !document || document.visibility !== "public_link") {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.14),_transparent_28%),linear-gradient(180deg,_rgba(255,255,255,0.98),_rgba(248,250,252,1))] text-foreground p-6 md:p-10">
        <div className="mx-auto max-w-3xl rounded-3xl border border-border bg-card/95 p-6 shadow-xl backdrop-blur">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Lock className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-[0.2em]">Documento público</span>
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">Documento no disponible</h1>
          <p className="mt-2 text-muted-foreground">Este documento no es público o el enlace no es válido.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/login" className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
              Iniciar sesión
            </Link>
            <Link href="/" className="inline-flex items-center rounded-md border border-border bg-background px-4 py-2 text-sm font-medium">
              Ir al inicio
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.14),_transparent_28%),linear-gradient(180deg,_rgba(255,255,255,0.98),_rgba(248,250,252,1))] text-foreground px-4 py-6 md:px-8 md:py-10">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="rounded-3xl border border-border bg-card/95 p-6 shadow-xl backdrop-blur">
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            <Sparkles className="h-4 w-4 text-accent" />
            <span>Documento público</span>
          </div>
          <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">{document.title}</h1>
              <p className="max-w-2xl text-sm text-muted-foreground">
                Este enlace permite ver el documento sin iniciar sesión.
              </p>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground">
              <Lock className="h-3.5 w-3.5" />
              Solo lectura
            </div>
          </div>
        </header>

        <section className="rounded-3xl border border-border bg-card/95 p-4 shadow-xl backdrop-blur md:p-6">
          <UnifiedBrickList
            bricks={document.bricks}
            canEdit={false}
            onUpdateBrick={() => undefined}
            onDeleteBrick={() => undefined}
            onReorderBricks={() => undefined}
            onAddBrick={() => undefined}
            addableKinds={[]}
          />
        </section>

        <footer className="pb-4 text-center text-xs text-muted-foreground">
          Creado en Killio · enlace público de solo lectura
        </footer>
      </div>
    </main>
  );
}
