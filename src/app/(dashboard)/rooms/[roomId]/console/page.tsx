"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "@/components/providers/session-provider";
import { useRoomPermissions } from "@/hooks/use-room-permissions";
import { executeOsCommand } from "@/lib/api/os";
import { Terminal as TerminalIcon, ShieldAlert, Loader2, ChevronRight, ArrowLeft, Trash2 } from "lucide-react";
import Link from "next/link";
import { AnsiText } from "@/components/terminal/AnsiText";

interface TerminalLine {
  type: 'input' | 'output' | 'error' | 'system';
  content: string;
}

export default function RoomConsolePage() {
  const params = useParams();
  const router = useRouter();
  const roomId = params.roomId as string;
  const { accessToken, activeTeamId, user } = useSession();
  const { permissions, isLoading: isLoadingPerms } = useRoomPermissions(roomId, accessToken);

  const [history, setHistory] = useState<TerminalLine[]>([
    { type: 'system', content: 'Killio-OS Kernel v1.2.0 initialized.' },
    { type: 'system', content: `Authenticated as ${user?.username || 'agent'}. Type 'help' for commands.` },
  ]);
  const [input, setInput] = useState("");
  const [isExecuting, setIsExecuting] = useState(false);
  const [cwd, setCwd] = useState("/");
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [history]);

  // Focus input on click
  const handleTerminalClick = () => {
    inputRef.current?.focus();
  };

  const handleCommand = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isExecuting || !accessToken || !activeTeamId) return;

    const command = input.trim();
    setInput("");
    setHistory(prev => [...prev, { type: 'input', content: `${cwd} $ ${command}` }]);
    setIsExecuting(true);

    try {
      const result = await executeOsCommand(roomId, activeTeamId, command, accessToken);
      
      if (result.output) {
        setHistory(prev => [...prev, { type: 'output', content: result.output }]);
      }
      
      if (result.cwd) {
        setCwd(result.cwd);
      }

      if (result.exitCode !== 0 && !result.output) {
        setHistory(prev => [...prev, { type: 'error', content: `Command exited with code ${result.exitCode}` }]);
      }
    } catch (err: any) {
      // Clean up stack traces for the UI
      const errorMessage = err.message?.split('\n')[0] || 'Unknown execution error';
      setHistory(prev => [...prev, { type: 'error', content: `Error: ${errorMessage}` }]);
    } finally {
      setIsExecuting(false);
    }
  }, [input, isExecuting, accessToken, activeTeamId, roomId, cwd]);

  if (isLoadingPerms) {
    return (
      <div className="flex h-screen items-center justify-center bg-black text-zinc-500 font-mono">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Loading kernel...
      </div>
    );
  }

  if (!permissions.canPost) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-black text-zinc-400 font-mono p-6 text-center">
        <ShieldAlert className="w-12 h-12 text-red-500 mb-4" />
        <h1 className="text-xl font-bold text-white mb-2">Access Denied</h1>
        <p className="max-w-md text-sm mb-6">
          You do not have administrative or write permissions to access the OS console for this room.
        </p>
        <Link 
          href={`/rooms/${roomId}`}
          className="flex items-center text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
        >
          <ArrowLeft className="w-3 h-3 mr-2" />
          Return to Room
        </Link>
      </div>
    );
  }

  return (
    <div 
      className="flex h-screen flex-col bg-[#000000] text-[#e0e0e0] selection:bg-indigo-500/30 overflow-hidden"
      style={{ fontFamily: "'JetBrains Mono', monospace" }}
      onClick={handleTerminalClick}
    >
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-2 border-b border-white/5 bg-[#0a0a0a]">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-[#ff5f56]" />
            <div className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
            <div className="w-3 h-3 rounded-full bg-[#27c93f]" />
          </div>
          <div className="h-4 w-px bg-white/10 mx-1" />
          <div className="flex items-center text-[11px] font-bold tracking-tight text-zinc-500 uppercase">
            <TerminalIcon className="w-3 h-3 mr-2" />
            Killio-OS Console — Room {roomId.slice(0, 8)}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={(e) => { e.stopPropagation(); setHistory([]); }}
            className="flex items-center gap-1.5 text-[10px] text-zinc-500 hover:text-red-400 transition-colors"
          >
            <Trash2 className="w-3 h-3" />
            CLEAR
          </button>
          <Link 
            href={`/rooms/${roomId}`}
            className="text-[10px] text-zinc-500 hover:text-white transition-colors"
          >
            EXIT_SESSION
          </Link>
        </div>
      </header>

      {/* Terminal View */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-1 text-[13px] leading-relaxed custom-scrollbar"
      >
        {history.map((line, i) => (
          <div key={i} className="whitespace-pre-wrap break-all">
            {line.type === 'input' && (
              <span className="text-indigo-400 font-bold">{line.content}</span>
            )}
            {line.type === 'output' && (
              <AnsiText text={line.content} />
            )}
            {line.type === 'error' && (
              <span className="text-red-400">!! {line.content}</span>
            )}
            {line.type === 'system' && (
              <span className="text-emerald-500/80 italic text-[12px]"># {line.content}</span>
            )}
          </div>
        ))}
        {isExecuting && (
          <div className="flex items-center text-zinc-500 italic animate-pulse text-[12px]">
            <Loader2 className="w-3 h-3 animate-spin mr-2" />
            Executing...
          </div>
        )}
      </div>

      {/* Input Area */}
      <form 
        onSubmit={handleCommand}
        className="flex items-center gap-2 px-4 py-3 bg-[#0a0a0a] border-t border-white/5"
      >
        <div className="flex items-center text-indigo-400 font-bold shrink-0">
          <span className="text-emerald-500/70 mr-1">agent@killio</span>
          <span className="text-zinc-500">:</span>
          <span className="text-indigo-400 ml-1">{cwd}</span>
          <ChevronRight className="w-4 h-4 ml-1 text-zinc-500" />
        </div>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={isExecuting}
          className="flex-1 bg-transparent border-none outline-none text-[#e0e0e0] placeholder:text-zinc-800"
          placeholder="system_call..."
          autoFocus
          autoComplete="off"
          spellCheck="false"
        />
      </form>

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #000;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #1a1a1a;
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #252525;
        }
      `}</style>
    </div>
  );
}
