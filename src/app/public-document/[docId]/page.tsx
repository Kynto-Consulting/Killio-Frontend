"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, FileText, Loader2, Lock, LogIn, UserPlus } from "lucide-react";
import { getPublicDocument, type DocumentBrick, type DocumentView } from "@/lib/api/documents";
import { UnifiedBrickRenderer } from "@/components/bricks/brick-renderer";
import { getTopLevelBrickIds } from "@/lib/bricks/nesting";
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

  const topLevelBricks = useMemo(() => {
    if (!document) return [];
    const topLevelIds = getTopLevelBrickIds(document.bricks);
    return document.bricks
      .filter((brick) => topLevelIds.has(brick.id))
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  }, [document]);

  if (isLoading) {
    return (
      <main className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
        <div className="flex items-center gap-3 rounded-full border border-border bg-card px-4 py-3 shadow-sm">
          <Loader2 className="h-4 w-4 animate-spin text-accent" />
          <span className="text-sm text-muted-foreground">{t("publicView.loading")}</span>
        </div>
      </main>
    );
  }

  if (error || !document || document.visibility !== "public_link") {
    return (
      <main className="min-h-screen bg-background text-foreground p-6 md:p-10">
        <div className="mx-auto max-w-3xl rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Lock className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-[0.2em]">{t("publicView.publicLabel")}</span>
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">{t("publicView.notAvailableTitle")}</h1>
          <p className="mt-2 text-muted-foreground">{t("publicView.notAvailableDescription")}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/login" className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              <LogIn className="h-4 w-4" />
              {t("publicView.login")}
            </Link>
            <Link href="/signup" className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-accent/10">
              <UserPlus className="h-4 w-4" />
              {t("publicView.signup")}
            </Link>
            <Link href="/" className="inline-flex items-center rounded-md border border-border bg-background px-4 py-2 text-sm font-medium">
              {t("publicView.home")}
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-card/70 px-4 backdrop-blur-md shadow-sm">
        <div className="flex items-center gap-2 min-w-0">
          <Link href="/" className="text-muted-foreground hover:text-foreground hover:bg-accent/10 p-1.5 rounded-md transition-colors group">
            <ArrowLeft className="h-4 w-4 group-hover:-translate-x-1 transition-transform" />
          </Link>
          <div className="h-4 w-px bg-border/80 mx-1" />
          <div className="flex items-center gap-1.5 text-foreground bg-accent/5 px-2 py-1 rounded-md min-w-0">
            <FileText className="h-4 w-4 text-accent shrink-0" />
            <h1 className="font-semibold tracking-tight truncate max-w-[40vw] sm:max-w-[320px]">{document.title}</h1>
          </div>
          <span className="hidden md:inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
            <Lock className="h-3 w-3" />
            {t("publicView.readOnly")}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/signup" className="hidden sm:inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-semibold hover:bg-accent/10">
            <UserPlus className="h-3.5 w-3.5" />
            {t("publicView.headerSignup")}
          </Link>
          <Link href="/login" className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90">
            <LogIn className="h-3.5 w-3.5" />
            {t("publicView.headerLogin")}
          </Link>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto w-full flex justify-center py-10 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl w-full">
          <div className="mb-8 border-b border-border/50 pb-5">
            <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-foreground">{document.title}</h2>
            <p className="mt-3 text-sm text-muted-foreground">{t("publicView.sharedDescription")}</p>
          </div>

          <div className="pb-32 space-y-2">
            {topLevelBricks.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-muted/20 p-6 text-sm text-muted-foreground">
                {t("publicView.empty")}
              </div>
            ) : (
              topLevelBricks.map((brick: DocumentBrick) => (
                <UnifiedBrickRenderer
                  key={brick.id}
                  brick={brick}
                  canEdit={false}
                  onUpdate={() => undefined}
                  activeBricks={document.bricks}
                  isCompact
                />
              ))
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
