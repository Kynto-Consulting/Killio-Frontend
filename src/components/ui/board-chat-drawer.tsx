"use client";

import { Fragment, useState, useEffect, useRef, type ReactNode } from "react";
import { X, Send, Bot, CheckCircle2, Loader2 } from "lucide-react";
import { useBoardRealtime, BoardEvent } from "@/hooks/useBoardRealtime";
import { useSession } from "../providers/session-provider";
import { getBoard, listTeamActivity, chatWithAiScope, type BoardView, type ActivityLogEntry } from "@/lib/api/contracts";

type Message = {
  id: number;
  role: "system" | "bot" | "user";
  content: string;
  avatar?: string;
  loading?: boolean;
};

function renderInlineMarkdown(text: string): ReactNode {
  const chunks = text.split(/(\*\*[^*]+\*\*)/g);

  return chunks.map((chunk, index) => {
    if (chunk.startsWith("**") && chunk.endsWith("**") && chunk.length > 4) {
      return <strong key={`bold-${index}`}>{chunk.slice(2, -2)}</strong>;
    }

    return <Fragment key={`text-${index}`}>{chunk}</Fragment>;
  });
}

function renderChatMessage(content: string): ReactNode {
  const lines = content.split(/\r?\n/);

  return lines.map((line, index) => (
    <Fragment key={`line-${index}`}>
      {renderInlineMarkdown(line)}
      {index < lines.length - 1 ? <br /> : null}
    </Fragment>
  ));
}

export function BoardChatDrawer({
  isOpen,
  onClose,
  boardId,
}: {
  isOpen: boolean;
  onClose: () => void;
  boardId?: string;
}) {
  const { accessToken, activeTeamId } = useSession();
  const [messages, setMessages] = useState<Message[]>([
    { id: 0, role: "system", content: "Team Chat conectado. Contexto completo del tablero habilitado." },
    {
      id: 1,
      role: "bot",
      content: "Hola. Puedo analizar todas las cards de este tablero. Preguntame por el plan de la semana, tareas de UX, riesgos o bloqueos.",
    },
  ]);
  const [inputVal, setInputVal] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [realtimeEvents, setRealtimeEvents] = useState<string[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  const cleanText = (value?: string | null) => {
    if (!value) return "";
    return value
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<[^>]*>/g, "")
      .replace(/\s+/g, " ")
      .trim();
  };

  const summarizeCard = (card: any) => {
    const tags = (card.tags || []).map((t: any) => t.name).filter(Boolean).join(", ") || "none";
    const assignees = (card.assignees || []).map((a: any) => a.name || a.displayName || a.email).filter(Boolean).join(", ") || "none";
    const textBricks = (card.blocks || []).filter((b: any) => b.kind === "text");
    const checklistBricks = textBricks.filter((b: any) => b.displayStyle === "checklist");
    const checklistTotal = checklistBricks.reduce((acc: number, b: any) => acc + (b.tasks?.length || 0), 0);
    const checklistDone = checklistBricks.reduce((acc: number, b: any) => acc + (b.tasks || []).filter((t: any) => t.checked).length, 0);
    const summary = cleanText(card.summary);
    const shortSummary = summary ? summary.slice(0, 220) : "No summary";

    return [
      `Card: ${card.title}`,
      `status: ${card.urgency || "normal"}`,
      `due: ${card.dueAt || "none"}`,
      `tags: ${tags}`,
      `assignees: ${assignees}`,
      `bricks: ${(card.blocks || []).length}`,
      `checklist: ${checklistDone}/${checklistTotal}`,
      `summary: ${shortSummary}`,
    ].join(" | ");
  };

  const buildBoardContextSummary = (
    board: BoardView,
    activity: ActivityLogEntry[],
    realtime: string[],
  ) => {
    const cardCount = board.lists.reduce((acc, l) => acc + l.cards.length, 0);

    const listLines = board.lists.map((list) => {
      const cards = list.cards.map((card) => `  - ${summarizeCard(card)}`).join("\n");
      return `List: ${list.name} (${list.cards.length} cards)\n${cards || "  - No cards"}`;
    });

    const activityLines = activity.slice(0, 40).map((entry) => {
      const payload = entry.payload && typeof entry.payload === "object" ? JSON.stringify(entry.payload).slice(0, 280) : "{}";
      return `- [${entry.createdAt}] ${entry.action} (${entry.scope}:${entry.scopeId}) payload=${payload}`;
    });

    const realtimeLines = realtime.slice(0, 20).map((e) => `- ${e}`);

    const summary = [
      `Board: ${board.name}`,
      `Description: ${board.description || "none"}`,
      `Visibility: ${board.visibility}`,
      `Totals: ${board.lists.length} lists, ${cardCount} cards`,
      "",
      "Board structure and cards:",
      ...listLines,
      "",
      "Recent board/card activity logs:",
      ...(activityLines.length > 0 ? activityLines : ["- No activity logs available"]),
      "",
      "Recent realtime events:",
      ...(realtimeLines.length > 0 ? realtimeLines : ["- No realtime events recorded in this session"]),
    ].join("\n");

    return summary.slice(0, 15000);
  };

  const filterBoardActivity = (all: ActivityLogEntry[], targetBoardId?: string) => {
    if (!targetBoardId) return [];
    return all.filter((entry) => {
      const payloadBoardId = (entry.payload as Record<string, unknown> | undefined)?.boardId;
      if (entry.scope === "board" && entry.scopeId === targetBoardId) return true;
      if (typeof payloadBoardId === "string" && payloadBoardId === targetBoardId) return true;
      return false;
    });
  };

  // Subscribe to Ably realtime events for this board
  useBoardRealtime(boardId, (event: BoardEvent) => {
    const compactEvent = `${event.type}: ${JSON.stringify(event.payload).slice(0, 240)}`;
    setRealtimeEvents((prev) => [compactEvent, ...prev].slice(0, 25));
    const msg: Message = {
      id: Date.now(),
      role: "bot",
      content: `🔔 Realtime: ${event.type.replace(".", " ")} — ${JSON.stringify(event.payload)}`,
    };
    setMessages((prev) => [...prev, msg]);
  }, accessToken);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (!isOpen) return null;

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!inputVal.trim() || isLoading) return;

    const userMsg: Message = { id: Date.now(), role: "user", content: inputVal, avatar: "RO" };
    const loadingMsg: Message = { id: Date.now() + 1, role: "bot", content: "", loading: true };
    setMessages((prev) => [...prev, userMsg, loadingMsg]);
    setInputVal("");
    setIsLoading(true);

    try {
      const [boardData, teamActivity] = await Promise.all([
        accessToken && boardId ? getBoard(boardId, accessToken) : Promise.resolve(null),
        accessToken && activeTeamId ? listTeamActivity(activeTeamId, accessToken) : Promise.resolve([] as ActivityLogEntry[]),
      ]);

      const scopedActivity = filterBoardActivity(teamActivity, boardId);
      const contextSummary = boardData
        ? buildBoardContextSummary(boardData, scopedActivity, realtimeEvents)
        : "No board context could be loaded.";

      const data = await chatWithAiScope(
        {
          scope: "board",
          scopeId: boardId ?? "unknown",
          message: inputVal,
          contextSummary,
        },
        accessToken ?? undefined,
      );

      const botMsg: Message = { id: Date.now() + 2, role: "bot", content: data.text ?? "Sorry, no response." };
      setMessages((prev) => [...prev.filter((m) => !m.loading), botMsg]);
    } catch {
      const errMsg: Message = { id: Date.now() + 2, role: "bot", content: "⚠️ AI unavailable. Please try again later." };
      setMessages((prev) => [...prev.filter((m) => !m.loading), errMsg]);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="absolute top-0 right-0 bottom-0 w-80 md:w-96 bg-card border-l border-border/60 shadow-2xl flex flex-col z-40 transform transition-transform animate-in slide-in-from-right duration-300">
      
      <div className="flex items-center justify-between p-4 border-b border-border/50 bg-background/50 backdrop-blur shrink-0">
        <div className="flex items-center space-x-2">
          <Bot className="h-5 w-5 text-accent" />
          <h3 className="font-semibold text-sm">Team Chat</h3>
          {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        </div>
        <button onClick={onClose} className="rounded-md p-1.5 hover:bg-accent/10 text-muted-foreground transition-colors">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 hide-scrollbar">
        {messages.map((msg) => {
          if (msg.role === "system") {
            return (
              <div key={msg.id} className="flex justify-center">
                <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground px-2 py-1 bg-muted/50 rounded-full">
                  {msg.content}
                </span>
              </div>
            );
          }

          if (msg.role === "bot") {
            return (
              <div key={msg.id} className="flex gap-3">
                <div className="h-8 w-8 shrink-0 rounded bg-accent/10 border border-accent/20 flex items-center justify-center text-accent">
                  <Bot className="h-4 w-4" />
                </div>
                <div className="bg-muted/50 rounded-xl rounded-tl-none border border-border/50 p-3 text-sm text-foreground/90 leading-relaxed shadow-sm min-w-0">
                  {msg.loading ? (
                    <span className="flex gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce" style={{ animationDelay: "0ms" }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce" style={{ animationDelay: "150ms" }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce" style={{ animationDelay: "300ms" }} />
                    </span>
                  ) : (
                    renderChatMessage(msg.content)
                  )}
                </div>
              </div>
            );
          }

          return (
            <div key={msg.id} className="flex gap-3 flex-row-reverse">
              <div className="h-8 w-8 shrink-0 rounded-full bg-gradient-to-tr from-accent to-primary/60 flex items-center justify-center text-primary-foreground font-semibold text-[10px] shadow-sm">
                {msg.avatar}
              </div>
              <div className="bg-primary text-primary-foreground rounded-xl rounded-tr-none p-3 text-sm leading-relaxed shadow-sm">
                {msg.content}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="p-4 border-t border-border/50 bg-background/30 shrink-0">
        <form className="relative flex items-center" onSubmit={sendMessage}>
          <input
            type="text"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            placeholder="Pregunta por plan semanal, UX, bloqueos, prioridades..."
            className="w-full bg-card border border-input rounded-full pr-10 pl-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-accent transition-all placeholder:text-muted-foreground"
          />
          <button
            type="submit"
            disabled={!inputVal.trim() || isLoading}
            className="absolute right-1.5 p-1.5 rounded-full bg-accent text-accent-foreground disabled:opacity-50 disabled:bg-muted disabled:text-muted-foreground transition-colors"
          >
            <Send className="h-3.5 w-3.5 ml-0.5" />
          </button>
        </form>
      </div>
    </div>
  );
}
