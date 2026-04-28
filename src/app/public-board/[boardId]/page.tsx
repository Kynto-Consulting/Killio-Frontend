import Link from "next/link";

// ─── Types ────────────────────────────────────────────────────────────────────

type Tag = { id: string; name: string; color: string | null };

type Assignee = {
  id: string;
  name: string | null;
  alias: string | null;
  avatarUrl: string | null;
};

type PublicCard = {
  id: string;
  title: string;
  summary?: string | null;
  status: "draft" | "active" | "done" | "archived";
  dueAt?: string | null;
  completedAt?: string | null;
  archivedAt?: string | null;
  tags?: Tag[];
  assignees?: Assignee[];
};

type PublicList = {
  id: string;
  name: string;
  cards: PublicCard[];
};

type PublicBoardView = {
  id: string;
  name: string;
  description: string | null;
  visibility: "private" | "team" | "public_link";
  backgroundKind: "none" | "preset" | "image" | "color" | "gradient";
  backgroundValue: string | null;
  backgroundImageUrl: string | null;
  backgroundGradient: string | null;
  themeKind: "preset" | "custom";
  themePreset: string | null;
  themeCustom: Record<string, unknown>;
  lists: PublicList[];
};

// ─── Theme helpers (mirrors b/[boardId]/page.tsx) ─────────────────────────────

type BoardThemeTokens = {
  accent: string;
  accentForeground: string;
  surface: string;
  text: string;
  border: string;
  panel: string;
  panelStrong: string;
};

const THEME_PRESETS: Record<string, { accent: string; surface: string }> = {
  "killio-default": { accent: "#d8ff72", surface: "#0b0f14" },
  "trello-ocean": { accent: "#67e8f9", surface: "#0c2233" },
  "trello-forest": { accent: "#86efac", surface: "#10251f" },
  "trello-sunrise": { accent: "#fcd34d", surface: "#3b1f10" },
};

function normalizeHex(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const t = value.trim();
  if (!/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(t)) return fallback;
  if (t.length === 7) return t.toLowerCase();
  return `#${t[1]}${t[1]}${t[2]}${t[2]}${t[3]}${t[3]}`.toLowerCase();
}

function hexToRgb(hex: string) {
  const h = normalizeHex(hex, "#000000");
  return { r: parseInt(h.slice(1, 3), 16), g: parseInt(h.slice(3, 5), 16), b: parseInt(h.slice(5, 7), 16) };
}

function rgba(hex: string, a: number) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

function mixHex(base: string, target: string, ratio: number): string {
  const r = Math.max(0, Math.min(1, ratio));
  const a = hexToRgb(base), b = hexToRgb(target);
  const mr = Math.round(a.r + (b.r - a.r) * r);
  const mg = Math.round(a.g + (b.g - a.g) * r);
  const mb = Math.round(a.b + (b.b - a.b) * r);
  return `#${mr.toString(16).padStart(2, "0")}${mg.toString(16).padStart(2, "0")}${mb.toString(16).padStart(2, "0")}`;
}

function isLight(hex: string): boolean {
  const { r, g, b } = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62;
}

function resolveTheme(board: Pick<PublicBoardView, "themeKind" | "themePreset" | "themeCustom">): BoardThemeTokens {
  const presetKey = board.themePreset && THEME_PRESETS[board.themePreset] ? board.themePreset : "killio-default";
  const preset = THEME_PRESETS[presetKey];
  const custom = board.themeKind === "custom" ? board.themeCustom : undefined;
  const accent = normalizeHex(custom?.accent, preset.accent);
  const surface = normalizeHex(custom?.surface, preset.surface);
  const text = isLight(surface) ? "#111827" : "#f8fafc";
  const isDefault = board.themeKind !== "custom" && presetKey === "killio-default";
  const border = isDefault ? mixHex(surface, "#ffffff", 0.1) : rgba(accent, 0.35);
  return {
    accent,
    accentForeground: isLight(accent) ? "#0f172a" : "#f8fafc",
    surface,
    text,
    border,
    panel: rgba(surface, isLight(surface) ? 0.8 : 0.68),
    panelStrong: rgba(surface, isLight(surface) ? 0.9 : 0.84),
  };
}

// ─── Background style ─────────────────────────────────────────────────────────

function boardBgStyle(board: Pick<PublicBoardView, "backgroundKind" | "backgroundValue" | "backgroundImageUrl" | "backgroundGradient" | "themeKind" | "themePreset" | "themeCustom">): React.CSSProperties {
  switch (board.backgroundKind) {
    case "color":
      if (board.backgroundValue) return { backgroundColor: board.backgroundValue };
      break;
    case "gradient":
      if (board.backgroundGradient) return { background: board.backgroundGradient };
      break;
    case "image":
      if (board.backgroundImageUrl) return {
        backgroundImage: `url(${board.backgroundImageUrl})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      };
      break;
    case "preset":
      if (board.backgroundValue) return { background: board.backgroundValue };
      break;
  }
  const { surface } = resolveTheme(board);
  return { backgroundColor: surface };
}

// ─── Date helper ──────────────────────────────────────────────────────────────

function formatDue(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / 86400000);
  if (diffDays < 0) return "Vencida";
  if (diffDays === 0) return "Hoy";
  if (diffDays === 1) return "Mañana";
  return d.toLocaleDateString("es", { day: "numeric", month: "short" });
}

function dueColor(iso: string, completed: boolean): string {
  if (completed) return "#22c55e";
  const diffDays = Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
  if (diffDays < 0) return "#f87171";
  if (diffDays <= 1) return "#fb923c";
  return "#94a3b8";
}

// ─── Gravatar ─────────────────────────────────────────────────────────────────

function avatarUrl(a: Assignee, size = 24): string {
  if (a.avatarUrl) return a.avatarUrl;
  const initial = (a.alias ?? a.name ?? "?")[0].toUpperCase();
  // simple colored circle via DiceBear
  const seed = encodeURIComponent(a.id);
  return `https://api.dicebear.com/7.x/initials/svg?seed=${seed}&size=${size}&backgroundType=solid`;
}

// ─── API ──────────────────────────────────────────────────────────────────────

function getApiBase(): string {
  return (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000").replace(/\/$/, "");
}

async function fetchPublicBoard(boardId: string): Promise<PublicBoardView | null> {
  const res = await fetch(`${getApiBase()}/boards/${boardId}`, { cache: "no-store" });
  if (!res.ok) return null;
  return res.json();
}

// ─── React import (needed for CSSProperties type) ────────────────────────────

import React from "react";

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function PublicBoardPage({ params }: { params: Promise<{ boardId: string }> }) {
  const { boardId } = await params;
  const board = await fetchPublicBoard(boardId);

  if (!board || board.visibility !== "public_link") {
    return (
      <main className="min-h-screen bg-background text-foreground p-6 md:p-10">
        <div className="mx-auto max-w-3xl rounded-2xl border border-border bg-card p-6">
          <h1 className="text-2xl font-semibold">Board no disponible</h1>
          <p className="mt-2 text-muted-foreground">Este board no es público o el enlace no es válido.</p>
          <Link href="/login" className="inline-flex mt-5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
            Iniciar sesión
          </Link>
        </div>
      </main>
    );
  }

  const theme = resolveTheme(board);
  const bgStyle = boardBgStyle(board);
  const nonArchived = board.lists.map((l) => ({
    ...l,
    cards: l.cards.filter((c) => !c.archivedAt),
  }));

  return (
    <main className="flex min-h-screen flex-col" style={{ ...bgStyle, color: theme.text }}>
      {/* ── Sticky header ── */}
      <header
        className="sticky top-0 z-50 flex h-12 items-center justify-between border-b px-4 backdrop-blur-sm"
        style={{ borderColor: theme.border, backgroundColor: `${theme.panel}` }}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold truncate max-w-[200px] md:max-w-xs">{board.name}</span>
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider"
            style={{ backgroundColor: `${theme.panel}`, color: theme.accent, border: `1px solid ${theme.border}` }}
          >
            Público
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/login"
            className="rounded-md border px-3 py-1.5 text-xs font-medium transition-colors"
            style={{ borderColor: theme.border, color: theme.text }}
          >
            Iniciar sesión
          </Link>
          <Link
            href="/register"
            className="rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
            style={{ backgroundColor: theme.accent, color: theme.accentForeground }}
          >
            Registrarse
          </Link>
        </div>
      </header>

      {/* ── Board body ── */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Board name / description strip */}
        <div className="px-6 pt-5 pb-3">
          <h1 className="text-xl font-bold tracking-tight">{board.name}</h1>
          {board.description && (
            <p className="mt-1 text-sm opacity-70">{board.description}</p>
          )}
        </div>

        {/* ── Columns ── */}
        <div className="flex flex-1 gap-3 overflow-x-auto px-6 pb-8 pt-2 items-start">
          {nonArchived.map((list) => (
            <div
              key={list.id}
              className="flex-shrink-0 w-72 rounded-xl flex flex-col"
              style={{ backgroundColor: theme.panel, border: `1px solid ${theme.border}` }}
            >
              {/* Column header */}
              <div
                className="flex items-center justify-between px-3 py-2.5 rounded-t-xl border-b"
                style={{ borderColor: theme.border }}
              >
                <span className="text-sm font-semibold">{list.name}</span>
                <span
                  className="text-xs rounded-full px-2 py-0.5"
                  style={{ backgroundColor: theme.panelStrong, opacity: 0.7 }}
                >
                  {list.cards.length}
                </span>
              </div>

              {/* Cards */}
              <div className="flex flex-col gap-2 p-2">
                {list.cards.length === 0 ? (
                  <p className="py-4 text-center text-xs opacity-40">Sin cards</p>
                ) : (
                  list.cards.map((card) => (
                    <PublicCard key={card.id} card={card} theme={theme} />
                  ))
                )}
              </div>
            </div>
          ))}

          {nonArchived.length === 0 && (
            <div className="flex items-center justify-center w-full py-20 opacity-40 text-sm">
              Este board no tiene listas todavía.
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

// ─── Card component ───────────────────────────────────────────────────────────

function PublicCard({ card, theme }: { card: PublicCard; theme: BoardThemeTokens }) {
  const isCompleted = !!card.completedAt || card.status === "done";
  const hasDue = !!card.dueAt;
  const dueLabel = hasDue ? formatDue(card.dueAt!) : null;
  const dueClr = hasDue ? dueColor(card.dueAt!, isCompleted) : null;
  const tags = card.tags ?? [];
  const assignees = card.assignees ?? [];

  return (
    <div
      className="rounded-lg p-3 flex flex-col gap-2 transition-colors"
      style={{
        backgroundColor: theme.panelStrong,
        border: `1px solid ${theme.border}`,
        opacity: card.archivedAt ? 0.55 : 1,
      }}
    >
      {/* Title */}
      <p
        className="text-sm font-medium leading-snug"
        style={{
          textDecoration: isCompleted ? "line-through" : undefined,
          opacity: isCompleted ? 0.6 : 1,
        }}
      >
        {card.title}
      </p>

      {/* Summary */}
      {card.summary && (
        <p className="text-xs leading-relaxed" style={{ opacity: 0.6 }}>
          {card.summary}
        </p>
      )}

      {/* Tags */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {tags.map((tag) => (
            <span
              key={tag.id}
              className="rounded-full px-2 py-0.5 text-[10px] font-medium"
              style={{
                backgroundColor: tag.color ? `${tag.color}28` : `${theme.accent}22`,
                color: tag.color ?? theme.accent,
                border: `1px solid ${tag.color ? `${tag.color}50` : `${theme.accent}40`}`,
              }}
            >
              {tag.name}
            </span>
          ))}
        </div>
      )}

      {/* Footer: due date + assignees */}
      {(hasDue || assignees.length > 0) && (
        <div className="flex items-center justify-between mt-0.5">
          {/* Due date */}
          {hasDue ? (
            <span
              className="text-[10px] font-medium rounded px-1.5 py-0.5"
              style={{ backgroundColor: `${dueClr}22`, color: dueClr! }}
            >
              {dueLabel}
            </span>
          ) : <span />}

          {/* Assignees */}
          {assignees.length > 0 && (
            <div className="flex -space-x-1.5">
              {assignees.slice(0, 4).map((a) => (
                <img
                  key={a.id}
                  src={avatarUrl(a)}
                  alt={a.alias ?? a.name ?? ""}
                  title={a.alias ?? a.name ?? ""}
                  className="h-5 w-5 rounded-full ring-1"
                  style={{ ringColor: theme.border } as React.CSSProperties}
                />
              ))}
              {assignees.length > 4 && (
                <span
                  className="h-5 w-5 rounded-full text-[9px] font-bold flex items-center justify-center ring-1"
                  style={{ backgroundColor: theme.panel, color: theme.text, ringColor: theme.border } as React.CSSProperties}
                >
                  +{assignees.length - 4}
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
