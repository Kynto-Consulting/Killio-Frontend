"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, BrainCircuit, CheckCircle2, Clock, Layout, Loader2, Plus, ShieldCheck, Sparkles, Trash2, Workflow } from "lucide-react";
import { AiGenerationPanel } from "@/components/ui/ai-generation-panel";
import { CreateBoardModal } from "@/components/ui/create-board-modal";
import { ConfirmDeleteModal } from "@/components/ui/confirm-delete-modal";
import { useSession } from "@/components/providers/session-provider";
import { listTeamBoards, BoardSummary, createBoard, deleteBoard } from "@/lib/api/contracts";
import { listDocuments, DocumentSummary, createDocument } from "@/lib/api/documents";
import { FileText } from "lucide-react";
import { toast } from "@/lib/toast";
import { useTranslations } from "@/components/providers/i18n-provider";

type TFunction = (key: string, params?: Record<string, string | number>) => string;

function PublicLanding({ t }: { t: TFunction }) {
  const features = [
    { key: "focus", icon: Workflow },
    { key: "ai", icon: BrainCircuit },
    { key: "trust", icon: ShieldCheck },
  ] as const;

  const steps = ["one", "two", "three"] as const;
  const metrics = ["teams", "actions", "uptime"] as const;

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -left-20 top-10 h-72 w-72 rounded-full bg-accent/20 blur-3xl" />
        <div className="absolute right-0 top-40 h-96 w-96 rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
      </div>

      <header className="sticky top-0 z-30 border-b border-border/50 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 transition-opacity hover:opacity-80">
            <img src="/killio_white.webp" alt="Killio" className="h-7 w-auto" />
            <span className="text-lg font-semibold tracking-tight">Killio</span>
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="inline-flex h-9 items-center justify-center rounded-md border border-border px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent/10"
            >
              {t("cta.secondary")}
            </Link>
            <Link
              href="/signup"
              className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              {t("cta.primary")}
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-6 pb-20 pt-10 md:pt-16">
        <section className="grid items-center gap-10 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <span className="inline-flex rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-accent">
              {t("badge")}
            </span>
            <h1 className="mt-5 text-4xl font-semibold leading-tight tracking-tight md:text-6xl">
              {t("headline")}
            </h1>
            <p className="mt-5 max-w-xl text-base text-muted-foreground md:text-lg">
              {t("subheadline")}
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/signup"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-primary px-6 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                {t("cta.primary")}
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="#auth"
                className="inline-flex h-11 items-center justify-center rounded-md border border-border px-6 text-sm font-medium transition-colors hover:bg-accent/10"
              >
                {t("cta.tertiary")}
              </Link>
            </div>

            <div className="mt-10 grid gap-3 sm:grid-cols-3">
              {metrics.map((metric) => (
                <div key={metric} className="rounded-xl border border-border/70 bg-card/60 p-4 backdrop-blur-sm">
                  <p className="text-2xl font-semibold">{t(`metrics.${metric}.value`)}</p>
                  <p className="text-sm text-muted-foreground">{t(`metrics.${metric}.label`)}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-border/70 bg-card/70 p-5 shadow-xl shadow-black/20 backdrop-blur-sm">
            <div className="rounded-xl border border-border/70 bg-background/80 p-4">
              <div className="flex items-center justify-between border-b border-border/60 pb-3">
                <p className="text-sm font-semibold">Killio Flow</p>
                <span className="rounded-full bg-accent/15 px-2 py-0.5 text-xs text-accent">LIVE</span>
              </div>
              <div className="space-y-3 pt-4">
                {steps.map((step) => (
                  <div key={step} className="rounded-lg border border-border/60 bg-card/60 p-3">
                    <p className="text-sm font-semibold">{t(`steps.${step}.title`)}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{t(`steps.${step}.description`)}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="mt-16">
          <h2 className="text-2xl font-semibold tracking-tight">{t("features.title")}</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {features.map(({ key, icon: Icon }) => (
              <article key={key} className="rounded-xl border border-border/70 bg-card/60 p-5 transition-colors hover:border-accent/60 hover:bg-card">
                <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-accent/15 text-accent">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-semibold">{t(`features.${key}.title`)}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{t(`features.${key}.description`)}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="auth" className="mt-16 rounded-2xl border border-border/70 bg-card/70 p-6 backdrop-blur-sm md:p-8">
          <h2 className="text-2xl font-semibold tracking-tight">{t("auth.title")}</h2>
          <p className="mt-2 max-w-3xl text-muted-foreground">{t("auth.description")}</p>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <article className="rounded-xl border border-border/70 bg-background/80 p-5">
              <p className="text-lg font-semibold">{t("auth.loginTitle")}</p>
              <p className="mt-2 text-sm text-muted-foreground">{t("auth.loginDescription")}</p>
              <Link
                href="/login"
                className="mt-5 inline-flex h-10 items-center justify-center rounded-md border border-border px-4 text-sm font-medium transition-colors hover:bg-accent/10"
              >
                {t("auth.loginCta")}
              </Link>
            </article>

            <article className="rounded-xl border border-border/70 bg-background/80 p-5">
              <p className="text-lg font-semibold">{t("auth.signupTitle")}</p>
              <p className="mt-2 text-sm text-muted-foreground">{t("auth.signupDescription")}</p>
              <Link
                href="/signup"
                className="mt-5 inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                {t("auth.signupCta")}
              </Link>
            </article>
          </div>

          <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-accent" />
            <span>{t("footer")}</span>
          </div>
        </section>
      </main>
    </div>
  );
}

export default function WorkspacesPage() {
  const t = useTranslations("workspace");
  const tLanding = useTranslations("landing");
  const [isAiPanelOpen, setIsAiPanelOpen] = useState(false);
  const { accessToken, activeTeamId, isLoading: isSessionLoading } = useSession();
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreateBoardModalOpen, setIsCreateBoardModalOpen] = useState(false);
  const [boardToDelete, setBoardToDelete] = useState<{ id: string; name: string } | null>(null);
  const [activeTab, setActiveTab] = useState<'boards' | 'documents'>('boards');

  useEffect(() => {
    if (!accessToken || !activeTeamId) return;

    setIsLoading(true);
    Promise.all([
      listTeamBoards(activeTeamId, accessToken).catch(e => { console.error(e); return [] as BoardSummary[]; }),
      listDocuments(activeTeamId, accessToken).catch(e => { console.error(e); return [] as DocumentSummary[]; })
    ]).then(([fetchedBoards, fetchedDocs]) => {
      setBoards(fetchedBoards);
      setDocuments(fetchedDocs);
    }).finally(() => setIsLoading(false));
  }, [accessToken, activeTeamId]);

  const handleCreateBoardClick = () => {
    if (!accessToken) return;
    if (!activeTeamId) {
      toast(t("noActiveWorkspace"), "info");
      return;
    }
    setIsCreateBoardModalOpen(true);
  };

  const handleCreateBoardSubmit = async (payload: { name: string; coverImageUrl: string }) => {
    if (!accessToken || !activeTeamId) return;

    const slug = payload.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || `board-${Date.now()}`;
    const newBoard = await createBoard({ name: payload.name, slug, coverImageUrl: payload.coverImageUrl }, activeTeamId, accessToken);
    setBoards([...boards, newBoard]);
  };

  const handleCreateDocumentClick = async () => {
    if (!accessToken || !activeTeamId) return;
    const title = prompt(t("createDocPrompt"));
    if (!title || !title.trim()) return;

    try {
      const doc = await createDocument({ teamId: activeTeamId, title }, accessToken);
      setDocuments([doc, ...documents]);
    } catch (e) {
      console.error(e);
      toast(t("createDocError"), "error");
    }
  };

  const handleDeleteBoard = async () => {
    if (!accessToken || !boardToDelete) return;

    try {
      await deleteBoard(boardToDelete.id, accessToken);
      setBoards(boards.filter(b => b.id !== boardToDelete.id));
      setBoardToDelete(null);
    } catch (error) {
      console.error(t("deleteBoardError"), error);
      toast(t("deleteBoardError"), "error");
    }
  };

  if (!accessToken) {
    if (isSessionLoading) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      );
    }

    return <PublicLanding t={tLanding} />;
  }

  return (
    <div className="container mx-auto p-6 lg:p-10 max-w-6xl">
      <ConfirmDeleteModal
        isOpen={!!boardToDelete}
        onClose={() => setBoardToDelete(null)}
        onConfirm={handleDeleteBoard}
        title={t("deleteBoardTitle")}
        description={t("deleteBoardDescription", { name: boardToDelete?.name || "" })}
      />
      <CreateBoardModal
        isOpen={isCreateBoardModalOpen}
        onClose={() => setIsCreateBoardModalOpen(false)}
        onSubmit={handleCreateBoardSubmit}
      />
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">{t("title")}</h1>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsAiPanelOpen(true)}
            className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-card hover:bg-accent/10 hover:text-foreground shadow-sm h-9 px-4 group"
          >
            <Sparkles className="mr-2 h-4 w-4 text-accent" />
            {t("aiStudio")}
          </button>
          <button onClick={handleCreateBoardClick} className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-primary/90 hover:bg-primary text-primary-foreground shadow h-9 px-4 group">
            <Plus className="mr-2 h-4 w-4 opacity-70 group-hover:scale-110 transition-transform" />
            {t("newBoard")}
          </button>
        </div>
      </div>

      <div className="flex space-x-4 border-b border-border/50 mb-6 px-1">
        <button
          onClick={() => setActiveTab('boards')}
          className={`pb-3 text-sm font-medium transition-all relative ${activeTab === 'boards' ? 'text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-accent/5'}`}
        >
          <div className="flex items-center space-x-2 px-2">
            <Layout className="h-4 w-4" />
            <span>{t("boards")}</span>
          </div>
          {activeTab === 'boards' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent rounded-t-full shadow-[0_-2px_8px_rgba(var(--accent),0.5)]"></div>
          )}
        </button>
        <button
          onClick={() => setActiveTab('documents')}
          className={`pb-3 text-sm font-medium transition-all relative ${activeTab === 'documents' ? 'text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-accent/5'}`}
        >
          <div className="flex items-center space-x-2 px-2">
            <FileText className="h-4 w-4" />
            <span>{t("documents")}</span>
          </div>
          {activeTab === 'documents' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent rounded-t-full shadow-[0_-2px_8px_rgba(var(--accent),0.5)]"></div>
          )}
        </button>
      </div>

      {activeTab === 'boards' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div onClick={handleCreateBoardClick} className="group relative rounded-xl border border-dashed border-border/60 bg-transparent hover:border-accent hover:bg-accent/5 transition-all cursor-pointer flex flex-col items-center justify-center p-8 text-center min-h-[220px]">
            <div className="mb-4 rounded-full bg-accent/10 p-3 text-accent group-hover:bg-accent/20 transition-colors">
              <Plus className="h-6 w-6" />
            </div>
            <h3 className="font-medium">{t("newBoard")}</h3>
            <p className="text-sm text-muted-foreground mt-1">{t("startFromScratch")}</p>
          </div>

          {isLoading ? (
            <div className="col-span-full py-12 flex flex-col items-center justify-center text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin mb-4 text-primary/50" />
              <p>{t("gatheringWorkspaces")}</p>
            </div>
          ) : boards.map((board) => (
            <Link href={`/b/${board.id}`} key={board.id} className="group relative rounded-xl border border-border bg-card shadow-sm hover:border-accent/40 hover:shadow-md transition-all flex flex-col min-h-[220px] overflow-hidden">
              <div className={`h-24 ${board.coverImageUrl || 'bg-gradient-to-tr from-accent to-primary/60'} w-full border-b border-border/50 relative`}>
                <div className="absolute inset-0 bg-black/10 transition-opacity group-hover:bg-black/0"></div>
              </div>
              <div className="p-5 flex flex-col flex-1">
                <div className="flex items-start justify-between">
                  <h3 className="text-xl font-semibold mb-2 group-hover:text-accent transition-colors">{board.name}</h3>
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setBoardToDelete({ id: board.id, name: board.name });
                    }}
                    className="opacity-0 group-hover:opacity-100 p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive rounded transition-all focus:opacity-100"
                    aria-label="Delete board"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-auto pt-4 border-t border-border/50 flex items-center justify-between text-sm text-muted-foreground">
                  <div className="flex items-center">
                    <Layout className="mr-1.5 h-3.5 w-3.5" />
                    {t("board")}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {activeTab === 'documents' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div onClick={handleCreateDocumentClick} className="group relative rounded-xl border border-dashed border-border/60 bg-transparent hover:border-accent hover:bg-accent/5 transition-all cursor-pointer flex flex-col items-center justify-center p-8 text-center min-h-[220px]">
            <div className="mb-4 rounded-full bg-accent/10 p-3 text-accent group-hover:bg-accent/20 transition-colors">
              <Plus className="h-6 w-6" />
            </div>
            <h3 className="font-medium">{t("newDocument")}</h3>
            <p className="text-sm text-muted-foreground mt-1">{t("startWriting")}</p>
          </div>

          {isLoading ? (
            <div className="col-span-full py-12 flex flex-col items-center justify-center text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin mb-4 text-primary/50" />
              <p>{t("gatheringDocuments")}</p>
            </div>
          ) : documents.map((doc) => (
            <Link href={`/d/${doc.id}`} key={doc.id} className="group relative rounded-xl border border-border bg-card shadow-sm hover:border-accent/40 hover:shadow-md transition-all flex flex-col min-h-[220px] overflow-hidden">
              <div className="p-5 flex flex-col flex-1">
                <div className="flex items-start justify-between h-full pt-2">
                  <div className="flex items-center">
                    <FileText className="mr-3 h-6 w-6 text-accent" />
                    <h3 className="text-xl font-semibold group-hover:text-accent transition-colors">{doc.title}</h3>
                  </div>
                </div>

                <div className="mt-auto pt-4 border-t border-border/50 flex items-center justify-between text-sm text-muted-foreground">
                  <div className="flex items-center">
                    <FileText className="mr-1.5 h-3.5 w-3.5" />
                    {t("document")}
                  </div>
                  <span>{new Date(doc.updatedAt).toLocaleDateString()}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      <div className="mt-12">
        <h2 className="text-xl font-semibold mb-6 flex items-center">
          <Clock className="mr-2 h-5 w-5 text-muted-foreground" />
          {t("recentlyViewed")}
        </h2>
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="divide-y divide-border/50">
            {[
              ...boards.map(b => ({ ...b, type: 'board' as const })),
              ...documents.map(d => ({ ...d, type: 'document' as const }))
            ]
            .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
            .slice(0, 10)
            .map((item, i) => (
              <Link href={item.type === 'board' ? `/b/${item.id}` : `/d/${item.id}`} key={i} className="flex items-center px-4 py-3 hover:bg-accent/5 transition-colors group">
                <div className={`h-8 w-8 rounded flex items-center justify-center mr-4 transition-colors ${item.type === 'board' ? 'bg-primary/20 group-hover:bg-primary/30' : 'bg-accent/20 group-hover:bg-accent/30'}`}>
                  {item.type === 'board' ? <Layout className="h-4 w-4 text-foreground/70" /> : <FileText className="h-4 w-4 text-foreground/70" />}
                </div>
                <div className="flex-1">
                  <span className="text-sm font-medium">{item.type === 'board' ? (item as BoardSummary).name : (item as DocumentSummary).title}</span>
                  <div className="text-xs text-muted-foreground flex items-center mt-0.5">
                    {item.type === 'board' ? t("teamBoard") : t("document")} <span className="mx-1">•</span> {t("updated")} {new Date(item.updatedAt).toLocaleDateString()}
                  </div>
                </div>
                <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                  <Plus className="h-4 w-4 text-muted-foreground" />
                </div>
              </Link>
            ))}
            {boards.length === 0 && documents.length === 0 && (
              <div className="px-4 py-3 text-sm text-muted-foreground">{t("noRecentActivity")}</div>
            )}
          </div>
        </div>
      </div>

      <AiGenerationPanel isOpen={isAiPanelOpen} onClose={() => setIsAiPanelOpen(false)} />
    </div>
  );
}
