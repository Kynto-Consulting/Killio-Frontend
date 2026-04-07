"use client";

import { useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { AlignLeft, ArrowRight, ArrowRightLeft, Bot, BrainCircuit, CheckCircle2, CheckSquare, Clock, FileText, GitBranch, Layout, Loader2, MessageSquare, Plus, ShieldCheck, Sparkles, Trash2, Users, Webhook, Workflow } from "lucide-react";
import { AiGenerationPanel } from "@/components/ui/ai-generation-panel";
import { CreateBoardModal, type CreateBoardSubmitPayload } from "@/components/ui/create-board-modal";
import { ConfirmDeleteModal } from "@/components/ui/confirm-delete-modal";
import { PublicFooter } from "@/components/marketing/public-footer";
import { useSession } from "@/components/providers/session-provider";
import { listTeamBoards, BoardSummary, createBoard, deleteBoard, uploadFile } from "@/lib/api/contracts";
import { listDocuments, DocumentSummary, createDocument } from "@/lib/api/documents";
import { toast } from "@/lib/toast";
import { useTranslations } from "@/components/providers/i18n-provider";

type TFunction = (key: string, params?: Record<string, string | number>) => string;

function PublicLanding({ t }: { t: TFunction }) {
  const features = [
    { key: "focus", icon: Workflow },
    { key: "ai", icon: BrainCircuit },
    { key: "trust", icon: ShieldCheck },
  ] as const;
  const integrations = [
    { key: "github", icon: GitBranch },
    { key: "webhook", icon: Webhook },
    { key: "conditions", icon: Workflow },
    { key: "actions", icon: ArrowRightLeft },
  ] as const;

  const steps = ["one", "two", "three"] as const;
  const metrics = ["teams", "actions", "uptime"] as const;
  const showcaseRows = [
    { label: t("showcase.signal"), value: t("showcase.signalValue") },
    { label: t("showcase.momentum"), value: t("showcase.momentumValue") },
    { label: t("showcase.governance"), value: t("showcase.governanceValue") },
  ] as const;
  const workspaceColumns = [
    {
      name: t("showcase.workspace.columns.backlog"),
      cards: [
        {
          title: t("showcase.workspace.cards.alignment.title"),
          body: t("showcase.workspace.cards.alignment.body"),
          tag: t("showcase.workspace.cards.alignment.tag"),
          checklist: "3/5",
          comments: "8",
        },
      ],
    },
    {
      name: t("showcase.workspace.columns.doing"),
      cards: [
        {
          title: t("showcase.workspace.cards.bricks.title"),
          body: t("showcase.workspace.cards.bricks.body"),
          tag: t("showcase.workspace.cards.bricks.tag"),
          checklist: "6/7",
          comments: "4",
        },
      ],
    },
    {
      name: t("showcase.workspace.columns.review"),
      cards: [
        {
          title: t("showcase.workspace.cards.launch.title"),
          body: t("showcase.workspace.cards.launch.body"),
          tag: t("showcase.workspace.cards.launch.tag"),
          checklist: "2/2",
          comments: "3",
        },
      ],
    },
  ] as const;
  const documentBricks = [
    t("showcase.document.bricks.summary"),
    t("showcase.document.bricks.checklistOne"),
    t("showcase.document.bricks.checklistTwo"),
  ] as const;
  const copilotActions = [
    t("showcase.copilot.actions.board"),
    t("showcase.copilot.actions.document"),
    t("showcase.copilot.actions.summary"),
  ] as const;

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-x-0 top-0 h-[34rem] bg-[radial-gradient(circle_at_top,rgba(216,255,114,0.16),transparent_58%)]" />
        <div className="absolute -left-24 top-20 h-80 w-80 rounded-full bg-[#d8ff72]/10 blur-3xl" />
        <div className="absolute right-0 top-24 h-[28rem] w-[28rem] rounded-full bg-[#3a4722]/30 blur-3xl" />
        <div className="absolute inset-y-0 inset-x-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:80px_80px] [mask-image:radial-gradient(circle_at_center,black,transparent_78%)]" />
      </div>

      <header className="sticky top-0 z-30 border-b border-border/50 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 w-full flex items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2 transition-opacity hover:opacity-80">
            <img src="/killio_white.webp" alt="Killio" className="h-7 w-auto" />
            <span className="text-base font-bold tracking-tight">Killio</span>
          </Link>
          
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="inline-flex h-9 items-center justify-center rounded-full border border-border px-3 text-xs font-medium text-foreground transition-colors hover:bg-accent/10"
            >
              {t("cta.secondary")}
            </Link>
            <Link
              href="/signup"
              className="inline-flex h-9 items-center justify-center rounded-full bg-primary px-3 text-xs font-bold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              {t("cta.primary")}
            </Link>
          </div>
        </div>
      </header>

      <main className="w-full px-4 pb-16 pt-6">
        <section className="flex flex-col gap-6 items-stretch">
          <div className="rounded-[30px] border border-border/70 bg-card/60 p-6 shadow-[0_30px_100px_rgba(0,0,0,0.24)] backdrop-blur-sm md:p-8">
            <span className="inline-flex rounded-full border border-[#d8ff72]/30 bg-[#d8ff72]/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#d8ff72]">
              {t("badge")}
            </span>
            <h1 className="mt-5 max-w-2xl text-4xl font-semibold leading-tight tracking-tight md:text-6xl">
              {t("headline")}
            </h1>
            <p className="mt-5 max-w-2xl text-base text-muted-foreground md:text-lg">
              {t("subheadline")}
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/signup"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                {t("cta.primary")}
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="#showcase"
                className="inline-flex h-11 items-center justify-center rounded-full border border-border px-6 text-sm font-medium transition-colors hover:bg-accent/10"
              >
                {t("cta.tertiary")}
              </Link>
            </div>
          </div>

          <div className="rounded-[30px] border border-border/70 bg-card/60 p-6 shadow-[0_30px_100px_rgba(0,0,0,0.24)] backdrop-blur-sm md:p-8">
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">{t("showcase.surfaceLabel")}</p>
            <div className="mt-5 space-y-3">
              {steps.map((step, index) => (
                <article key={step} className="rounded-2xl border border-border/60 bg-background/80 p-4">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-[#d8ff72]/25 bg-[#d8ff72]/10 text-xs font-semibold text-[#d8ff72]">{index + 1}</span>
                    <p className="text-sm font-semibold text-foreground">{t(`steps.${step}.title`)}</p>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{t(`steps.${step}.description`)}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-8 grid gap-3 sm:grid-cols-3">
          {metrics.map((metric) => (
            <article key={metric} className="rounded-2xl border border-border/70 bg-card/60 p-4 shadow-[0_20px_60px_rgba(0,0,0,0.18)] backdrop-blur-sm">
              <p className="text-2xl font-semibold">{t(`metrics.${metric}.value`)}</p>
              <p className="text-sm text-muted-foreground">{t(`metrics.${metric}.label`)}</p>
            </article>
          ))}
        </section>

        <section id="showcase" className="mt-14 rounded-[32px] border border-border/70 bg-card/70 p-5 shadow-[0_30px_120px_rgba(0,0,0,0.32)] backdrop-blur-sm md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">{t("showcase.surfaceLabel")}</p>
              <h2 className="mt-3 max-w-2xl text-2xl font-semibold tracking-tight md:text-3xl">{t("showcase.title")}</h2>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground md:text-base">{t("showcase.description")}</p>
            </div>
            <div className="rounded-full border border-[#d8ff72]/20 bg-[#d8ff72]/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#d8ff72]">
              {t("showcase.signalValue")}
            </div>
          </div>

          <div className="mt-6 rounded-[26px] border border-border/70 bg-background/80 p-5">
            <div className="rounded-2xl border border-border/60 bg-card/60 p-4">
              <div className="flex items-center justify-between border-b border-border/60 pb-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">{t("showcase.workspace.label")}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{t("showcase.workspace.name")}</p>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Users className="h-3.5 w-3.5" />
                  <span>{t("showcase.workspace.teamSize")}</span>
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {workspaceColumns.flatMap((column) =>
                  column.cards.map((card) => (
                    <article key={`${column.name}-${card.title}`} className="rounded-2xl border border-border/50 bg-background/70 p-4 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{column.name}</p>
                          <p className="mt-3 text-base font-semibold leading-tight text-foreground">{card.title}</p>
                        </div>
                        <div className="inline-flex rounded-full border border-[#d8ff72]/20 bg-[#d8ff72]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#d8ff72]">
                          {card.tag}
                        </div>
                      </div>
                      <p className="mt-4 text-sm leading-6 text-muted-foreground">{card.body}</p>
                      <div className="mt-4 flex items-center gap-3 text-[11px] text-muted-foreground">
                        <span className="inline-flex items-center gap-1"><CheckSquare className="h-3.5 w-3.5" />{card.checklist}</span>
                        <span className="inline-flex items-center gap-1"><MessageSquare className="h-3.5 w-3.5" />{card.comments}</span>
                      </div>
                    </article>
                  ))
                )}
              </div>
            </div>

            <div className="mt-4 grid gap-4 xl:grid-cols-2">
              <div className="rounded-2xl border border-border/60 bg-card/60 p-4">
                <div className="flex items-center justify-between border-b border-border/60 pb-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{t("showcase.document.label")}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{t("showcase.document.name")}</p>
                  </div>
                  <FileText className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="mt-4 space-y-3 rounded-2xl border border-border/50 bg-background/70 p-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <AlignLeft className="h-4 w-4 text-[#d8ff72]" />
                    {t("showcase.document.heading")}
                  </div>
                  <p className="text-xs leading-6 text-muted-foreground">{documentBricks[0]}</p>
                  <div className="rounded-xl border border-border/50 bg-card/60 p-3 text-xs text-muted-foreground">
                    <div className="flex items-center gap-2 text-foreground"><CheckSquare className="h-3.5 w-3.5 text-[#d8ff72]" />{documentBricks[1]}</div>
                    <div className="mt-2 flex items-center gap-2 text-foreground"><CheckSquare className="h-3.5 w-3.5 text-[#d8ff72]" />{documentBricks[2]}</div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-border/60 bg-card/60 p-4">
                <div className="flex items-center justify-between border-b border-border/60 pb-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{t("showcase.copilot.label")}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{t("showcase.copilot.name")}</p>
                  </div>
                  <Bot className="h-4 w-4 text-[#d8ff72]" />
                </div>
                <div className="mt-4 space-y-3">
                  <div className="ml-auto max-w-[90%] rounded-2xl rounded-br-md bg-primary px-3 py-2 text-xs leading-5 text-primary-foreground">
                    {t("showcase.copilot.userPrompt")}
                  </div>
                  <div className="max-w-[92%] rounded-2xl rounded-bl-md border border-border/60 bg-background/70 px-3 py-3 text-xs leading-5 text-muted-foreground">
                    <p className="font-medium text-foreground">{t("showcase.copilot.assistantReply")}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {copilotActions.map((action) => (
                        <span key={action} className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-card/70 px-2.5 py-1 text-[11px] text-foreground">
                          <Sparkles className="h-3 w-3 text-[#d8ff72]" />
                          {action}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {showcaseRows.map((row) => (
                <div key={row.label} className="rounded-xl border border-border/60 bg-card/60 px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{row.label}</p>
                  <p className="mt-2 text-sm font-semibold text-foreground">{row.value}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-14 rounded-[28px] border border-border/70 bg-card/70 p-6 backdrop-blur-sm">
          <h2 className="text-2xl font-semibold tracking-tight">{t("integrations.title")}</h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">{t("integrations.description")}</p>

          <div className="mt-6 grid gap-3">
            {integrations.map(({ key, icon: Icon }) => (
              <article key={key} className="rounded-2xl border border-border/70 bg-background/70 p-4">
                <div className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[#d8ff72]/10 text-[#d8ff72]">
                  <Icon className="h-4 w-4" />
                </div>
                <h3 className="mt-3 text-sm font-semibold text-foreground">{t(`integrations.items.${key}.title`)}</h3>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{t(`integrations.items.${key}.description`)}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-16 grid gap-6 xl:grid-cols-[minmax(0,1.02fr)_minmax(0,0.98fr)]">
          <article className="rounded-[28px] border border-border/70 bg-card/70 p-6 backdrop-blur-sm md:p-8">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#d8ff72]">Killio by Kynto</p>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight">{t("proof.title")}</h2>
            <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">{t("proof.description")}</p>

            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {features.map(({ key, icon: Icon }) => (
                <article key={key} className="rounded-2xl border border-border/70 bg-background/70 p-5 transition-colors hover:border-[#d8ff72]/40 hover:bg-card">
                  <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-[#d8ff72]/10 text-[#d8ff72]">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-lg font-semibold">{t(`features.${key}.title`)}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{t(`features.${key}.description`)}</p>
                </article>
              ))}
            </div>
          </article>

          <article id="auth" className="rounded-2xl border border-border/70 bg-card/70 p-6 backdrop-blur-sm md:p-8">
            <h2 className="text-2xl font-semibold tracking-tight">{t("auth.title")}</h2>
            <p className="mt-2 max-w-3xl text-muted-foreground">{t("auth.description")}</p>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <article className="rounded-xl border border-border/70 bg-background/80 p-5">
                <p className="text-lg font-semibold">{t("auth.loginTitle")}</p>
                <p className="mt-2 text-sm text-muted-foreground">{t("auth.loginDescription")}</p>
                <Link
                  href="/login"
                  className="mt-5 inline-flex h-10 items-center justify-center rounded-full border border-border px-3 text-xs font-medium transition-colors hover:bg-accent/10"
                >
                  {t("auth.loginCta")}
                </Link>
              </article>

              <article className="rounded-xl border border-border/70 bg-background/80 p-5">
                <p className="text-lg font-semibold">{t("auth.signupTitle")}</p>
                <p className="mt-2 text-sm text-muted-foreground">{t("auth.signupDescription")}</p>
                <Link
                  href="/signup"
                  className="mt-5 inline-flex h-10 items-center justify-center rounded-full bg-primary px-3 text-xs font-bold text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  {t("auth.signupCta")}
                </Link>
              </article>
            </div>

            <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-accent" />
              <span>{t("footer")}</span>
            </div>
          </article>
        </section>

        <section className="mt-16 rounded-[30px] border border-border/70 bg-[linear-gradient(135deg,rgba(216,255,114,0.08),rgba(255,255,255,0.02))] p-6 md:p-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#d8ff72]">Launch with intent</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight">{t("final.title")}</h2>
              <p className="mt-4 text-base leading-7 text-muted-foreground">{t("final.description")}</p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/signup"
                className="inline-flex h-11 items-center justify-center rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                {t("cta.finalPrimary")}
              </Link>
              <Link
                href="/terms"
                className="inline-flex h-11 items-center justify-center rounded-full border border-border px-6 text-sm font-medium transition-colors hover:bg-accent/10"
              >
                {t("cta.finalSecondary")}
              </Link>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
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

  const handleCreateBoardSubmit = async (payload: CreateBoardSubmitPayload) => {
    if (!accessToken || !activeTeamId) return;

    const slug = payload.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || `board-${Date.now()}`;
    const newBoard = await createBoard({ ...payload, slug }, activeTeamId, accessToken);
    setBoards([...boards, newBoard]);
  };

  const handleUploadBoardCover = async (file: File): Promise<string> => {
    if (!accessToken) {
      throw new Error("Sesion expirada. Inicia sesion nuevamente.");
    }
    const uploaded = await uploadFile(file, accessToken);
    return uploaded.url;
  };

  const resolveSerializedCover = (raw?: string | null): { className: string; style?: CSSProperties } | null => {
    if (!raw) return null;
    const source = raw.trim();
    if (!source) return null;

    const separatorIndex = source.indexOf("::");
    let kind = "";
    let value = source;

    if (separatorIndex > 0) {
      kind = source.slice(0, separatorIndex);
      value = source.slice(separatorIndex + 2);
    }

    if (!kind) {
      if (/^https?:\/\//i.test(source) || source.startsWith("/") || source.startsWith("data:image/")) {
        kind = "image";
      } else if (source.startsWith("bg-")) {
        kind = "preset";
      } else if (source.startsWith("#")) {
        kind = "color";
      } else {
        kind = "gradient";
      }
    }

    if (kind === "none") return null;

    if (kind === "image") {
      if (!(/^https?:\/\//i.test(value) || value.startsWith("/") || value.startsWith("data:image/"))) {
        return null;
      }

      return {
        className: "bg-slate-800 bg-cover bg-center",
        style: { backgroundImage: `url(${value})` },
      };
    }

    if (kind === "preset") {
      return { className: value };
    }

    if (kind === "color") {
      return {
        className: "bg-slate-800",
        style: { backgroundColor: value },
      };
    }

    if (value.startsWith("bg-")) {
      return { className: value };
    }

    return {
      className: "bg-slate-800",
      style: { background: value },
    };
  };

  const resolveBoardCover = (board: BoardSummary): { className: string; style?: CSSProperties } => {
    if (board.backgroundKind === "image" && board.backgroundImageUrl) {
      return {
        className: "bg-slate-800 bg-cover bg-center",
        style: { backgroundImage: `url(${board.backgroundImageUrl})` },
      };
    }

    if (board.backgroundKind === "color" && board.backgroundValue) {
      return {
        className: "bg-slate-800",
        style: { backgroundColor: board.backgroundValue },
      };
    }

    if (board.backgroundKind === "gradient" && board.backgroundGradient) {
      if (board.backgroundGradient.startsWith("bg-")) {
        return { className: board.backgroundGradient };
      }

      return {
        className: "bg-slate-800",
        style: { background: board.backgroundGradient },
      };
    }

    if (board.backgroundKind === "preset" && board.backgroundValue) {
      return { className: board.backgroundValue };
    }

    const cover = resolveSerializedCover(board.coverImageUrl);
    if (cover) return cover;

    return { className: "bg-gradient-to-tr from-accent to-primary/60" };
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
        onUploadCoverImage={handleUploadBoardCover}
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
        <div className="grid flex flex-col gap-4">
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
            (() => {
              const cover = resolveBoardCover(board);
              return (
            <Link href={`/b/${board.id}`} key={board.id} className="group relative rounded-xl border border-border bg-card shadow-sm hover:border-accent/40 hover:shadow-md transition-all flex flex-col min-h-[220px] overflow-hidden">
              <div
                className={`h-24 ${cover.className} w-full border-b border-border/50 relative`}
                style={cover.style}
              >
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
              );
            })()
          ))}
        </div>
      )}

      {activeTab === 'documents' && (
        <div className="grid flex flex-col gap-4">
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
