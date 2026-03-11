"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Clock, Layout, Users, Sparkles } from "lucide-react";
import { AiGenerationPanel } from "@/components/ui/ai-generation-panel";

export default function WorkspacesPage() {
  const [isAiPanelOpen, setIsAiPanelOpen] = useState(false);
  
  const recentWorkspaces = [
    { id: "wd1", name: "Engineering Team", boards: 12, members: 8 },
    { id: "wd2", name: "Marketing Campaign", boards: 4, members: 3 },
    { id: "wd3", name: "Personal Private", boards: 2, members: 1 },
  ];

  return (
    <div className="container mx-auto p-6 lg:p-10 max-w-6xl">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">Workspaces</h1>
          <p className="text-muted-foreground">Manage your boards, teams, and projects.</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setIsAiPanelOpen(true)}
            className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-card hover:bg-accent/10 hover:text-foreground shadow-sm h-9 px-4 group"
          >
            <Sparkles className="mr-2 h-4 w-4 text-accent" />
            AI Draft Studio
          </button>
          <button className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-primary/90 hover:bg-primary text-primary-foreground shadow h-9 px-4 group">
            <Plus className="mr-2 h-4 w-4 opacity-70 group-hover:scale-110 transition-transform" />
            Create Workspace
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Create new card */}
        <div className="group relative rounded-xl border border-dashed border-border/60 bg-transparent hover:border-accent hover:bg-accent/5 transition-all cursor-pointer flex flex-col items-center justify-center p-8 text-center min-h-[220px]">
          <div className="mb-4 rounded-full bg-accent/10 p-3 text-accent group-hover:bg-accent/20 transition-colors">
            <Plus className="h-6 w-6" />
          </div>
          <h3 className="font-medium">New Board</h3>
          <p className="text-sm text-muted-foreground mt-1">Start from scratch or a template</p>
        </div>

        {/* Workspace Cards */}
        {recentWorkspaces.map((ws) => (
          <Link href={`/b/${ws.id}`} key={ws.id} className="group relative rounded-xl border border-border bg-card p-6 shadow-sm hover:border-accent/40 hover:shadow-md transition-all flex flex-col min-h-[220px]">
            <div className="flex items-start justify-between mb-4">
              <div className="p-2.5 rounded-lg bg-primary/10 text-primary-foreground border border-border/50">
                <Layout className="h-5 w-5" />
              </div>
            </div>
            
            <h3 className="text-xl font-semibold mb-2 group-hover:text-accent transition-colors">{ws.name}</h3>
            
            <div className="mt-auto pt-4 border-t border-border/50 flex items-center justify-between text-sm text-muted-foreground">
              <div className="flex items-center">
                <Layout className="mr-1.5 h-3.5 w-3.5" />
                {ws.boards} boards
              </div>
              <div className="flex items-center">
                <Users className="mr-1.5 h-3.5 w-3.5" />
                {ws.members} members
              </div>
            </div>
          </Link>
        ))}
      </div>

      <div className="mt-12">
        <h2 className="text-xl font-semibold mb-6 flex items-center">
          <Clock className="mr-2 h-5 w-5 text-muted-foreground" />
          Recently viewed
        </h2>
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="divide-y divide-border/50">
            {["Frontend Architecture", "Q3 Marketing Docs", "Weekly Sync Agenda"].map((item, i) => (
              <Link href={`/b/board_${i}`} key={i} className="flex items-center px-4 py-3 hover:bg-accent/5 transition-colors group">
                <div className="h-8 w-8 rounded bg-primary/20 flex items-center justify-center mr-4 group-hover:bg-primary/30 transition-colors">
                  <Layout className="h-4 w-4 text-foreground/70" />
                </div>
                <div className="flex-1">
                  <span className="text-sm font-medium">{item}</span>
                  <div className="text-xs text-muted-foreground flex items-center mt-0.5">
                    Engineering Team <span className="mx-1">•</span> Accessed 2 hours ago
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
      
      <AiGenerationPanel isOpen={isAiPanelOpen} onClose={() => setIsAiPanelOpen(false)} />
    </div>
  );
}
