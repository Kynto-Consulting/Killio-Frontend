"use client";

import { useState, useEffect, useRef } from "react";
import { X, Send, Bot, CheckCircle2, Loader2 } from "lucide-react";
import { useBoardRealtime, BoardEvent } from "@/hooks/useBoardRealtime";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type Message = {
  id: number;
  role: "system" | "bot" | "user";
  content: string;
  avatar?: string;
  loading?: boolean;
};

export function BoardChatDrawer({
  isOpen,
  onClose,
  boardId,
}: {
  isOpen: boolean;
  onClose: () => void;
  boardId?: string;
}) {
  const [messages, setMessages] = useState<Message[]>([
    { id: 0, role: "system", content: "Board Copilot connected. Ask me anything about this board." },
    {
      id: 1,
      role: "bot",
      content: "Hi! I'm your AI Copilot for this board. Ask me about tasks, blockers, or priorities.",
    },
  ]);
  const [inputVal, setInputVal] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Subscribe to Ably realtime events for this board
  useBoardRealtime(boardId, (event: BoardEvent) => {
    const msg: Message = {
      id: Date.now(),
      role: "bot",
      content: `🔔 Realtime: ${event.type.replace(".", " ")} — ${JSON.stringify(event.payload)}`,
    };
    setMessages((prev) => [...prev, msg]);
  });

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
      const res = await fetch(`${API}/ai/scope/board/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scopeId: boardId ?? "unknown",
          message: inputVal,
          contextSummary: "Kanban board with To Do, In Progress, and Done lists.",
        }),
      });
      const data = await res.json();
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
          <h3 className="font-semibold text-sm">Board Copilot & Chat</h3>
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
                    msg.content
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
            placeholder="Ask AI or chat with team..."
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
