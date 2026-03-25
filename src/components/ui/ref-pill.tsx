"use client";

import React from "react";
import { FileText, LayoutDashboard, User, Hash, Database, ExternalLink } from "lucide-react";
import { useRouter } from "next/navigation";
import { getCardContext } from "@/lib/api/contracts";
import { useSession } from "@/components/providers/session-provider";

interface RefPillProps {
  type: 'doc' | 'board' | 'card' | 'user' | 'deep' | 'mention';
  id: string;
  name: string;
  label?: string;
  prefix?: string;
  onClick?: () => void;
}

export function RefPill({ type, id, name, label, prefix, onClick }: RefPillProps) {
  const router = useRouter();
  const { accessToken } = useSession();

  const handleClick = async () => {
    if (onClick) {
      onClick();
      return;
    }

    // Default navigation
    if (type === 'doc') router.push(`/d/${id}`);
    if (type === 'board') router.push(`/b/${id}`);
    if (type === 'card' || (type as string) === 'mention' && id.startsWith('card:')) {
      const cardId = id.replace('card:', '');
      try {
        // Find board context for card
        const context = await getCardContext(cardId, accessToken!);
        router.push(`/b/${context.boardId}?cardId=${cardId}`);
      } catch (e) {
        console.error("Failed to navigate to card", e);
      }
    }
    if (type === 'deep') {
        const docId = id.split(':')[0];
        router.push(`/d/${docId}`);
    }
  };

  const colors: Record<string, string> = {
    doc: "bg-blue-500/10 border-blue-500/20 text-blue-600 hover:bg-blue-500/20",
    board: "bg-purple-500/10 border-purple-500/20 text-purple-600 hover:bg-purple-500/20",
    card: "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 hover:bg-emerald-500/20",
    user: "bg-primary/10 border-primary/20 text-primary hover:bg-primary/20",
    deep: "bg-amber-500/10 border-amber-500/20 text-amber-600 hover:bg-amber-500/20",
    mention: "bg-accent/10 border-accent/20 text-accent hover:bg-accent/20",
  };

  const Icons: Record<string, any> = {
    doc: FileText,
    board: LayoutDashboard,
    card: Hash,
    user: User,
    deep: Database,
    mention: Hash
  };

  const Icon = Icons[type] || Database;

  return (
    <button
      onClick={handleClick}
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-[10px] font-bold tracking-tight transition-all active:scale-95 group shadow-sm ${colors[type] || colors.deep}`}
    >
      <Icon className="h-3 w-3 transition-transform group-hover:scale-110" />
      <span>{prefix ? `${prefix} ${label || name}` : (label || name)}</span>
      <ExternalLink className="h-2.5 w-2.5 opacity-0 group-hover:opacity-100 transition-opacity ml-0.5" />
    </button>
  );
}
