"use client";

import { useEffect, useState } from "react";
import { Command } from "cmdk";
import { Search, Plus, UserPlus, Settings, Layout, Clock, HelpCircle, Bot } from "lucide-react";
import { useRouter } from "next/navigation";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  // Toggle the menu when ⌘K is pressed
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  // Listen for custom event from the search bar
  useEffect(() => {
    const handleOpenCmdk = () => setOpen(true);
    window.addEventListener("open-cmdk", handleOpenCmdk);
    return () => window.removeEventListener("open-cmdk", handleOpenCmdk);
  }, []);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-background/80 backdrop-blur-sm p-4">
      {/* Overlay click to close */}
      <div className="absolute inset-0 -z-10" onClick={() => setOpen(false)} />
      
      <div className="w-full max-w-xl rounded-xl border border-border bg-card shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <Command label="Global Command Menu" className="flex flex-col w-full h-full">
          <div className="flex items-center border-b border-border px-4 py-3">
            <Search className="h-5 w-5 text-muted-foreground mr-3" />
            <Command.Input 
              autoFocus
              placeholder="Type a command or search..." 
              className="flex-1 bg-transparent outline-none placeholder:text-muted-foreground text-foreground"
            />
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground bg-accent/10 px-1.5 py-0.5 rounded border border-accent/20">esc</span>
              <span className="text-xs text-muted-foreground">to close</span>
            </div>
          </div>

          <Command.List className="max-h-[300px] overflow-y-auto p-2 pb-4 hide-scrollbar">
            <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
              No results found.
            </Command.Empty>

            <Command.Group heading="Suggestions" className="px-2 text-xs font-semibold text-muted-foreground mt-2 mb-1">
              <Command.Item 
                onSelect={() => { setOpen(false); router.push("/"); }}
                className="flex items-center px-3 py-2 text-sm rounded-md cursor-pointer hover:bg-accent/10 hover:text-foreground text-foreground/80 transition-colors aria-selected:bg-accent/10 aria-selected:text-foreground mt-1"
              >
                <Layout className="h-4 w-4 mr-3 text-muted-foreground" />
                Go to Workspaces
              </Command.Item>
              <Command.Item 
                onSelect={() => { setOpen(false); router.push("/teams"); }}
                className="flex items-center px-3 py-2 text-sm rounded-md cursor-pointer hover:bg-accent/10 hover:text-foreground text-foreground/80 transition-colors aria-selected:bg-accent/10 aria-selected:text-foreground mt-1"
              >
                <UserPlus className="h-4 w-4 mr-3 text-muted-foreground" />
                Manage Team
              </Command.Item>
              <Command.Item 
                onSelect={() => { setOpen(false); router.push("/history"); }}
                className="flex items-center px-3 py-2 text-sm rounded-md cursor-pointer hover:bg-accent/10 hover:text-foreground text-foreground/80 transition-colors aria-selected:bg-accent/10 aria-selected:text-foreground mt-1"
              >
                <Clock className="h-4 w-4 mr-3 text-muted-foreground" />
                Recent History
              </Command.Item>
            </Command.Group>

            <Command.Group heading="Actions" className="px-2 text-xs font-semibold text-muted-foreground mt-4 mb-1">
              <Command.Item 
                onSelect={() => setOpen(false)}
                className="flex items-center px-3 py-2 text-sm rounded-md cursor-pointer hover:bg-accent/10 hover:text-foreground text-foreground/80 transition-colors aria-selected:bg-accent/10 aria-selected:text-foreground mt-1"
              >
                <Plus className="h-4 w-4 mr-3 text-muted-foreground" />
                Create New Card...
              </Command.Item>
              <Command.Item 
                onSelect={() => setOpen(false)}
                className="flex items-center px-3 py-2 text-sm rounded-md cursor-pointer hover:bg-accent/10 hover:text-foreground text-foreground/80 transition-colors aria-selected:bg-accent/10 aria-selected:text-foreground mt-1"
              >
                <Bot className="h-4 w-4 mr-3 text-accent" />
                <span className="text-accent font-medium">Ask AI to organize...</span>
              </Command.Item>
            </Command.Group>
            
            <Command.Group heading="System" className="px-2 text-xs font-semibold text-muted-foreground mt-4 mb-1">
              <Command.Item 
                onSelect={() => setOpen(false)}
                className="flex items-center px-3 py-2 text-sm rounded-md cursor-pointer hover:bg-accent/10 hover:text-foreground text-foreground/80 transition-colors aria-selected:bg-accent/10 aria-selected:text-foreground mt-1"
              >
                <Settings className="h-4 w-4 mr-3 text-muted-foreground" />
                Settings
              </Command.Item>
              <Command.Item 
                onSelect={() => setOpen(false)}
                className="flex items-center px-3 py-2 text-sm rounded-md cursor-pointer hover:bg-accent/10 hover:text-foreground text-foreground/80 transition-colors aria-selected:bg-accent/10 aria-selected:text-foreground mt-1"
              >
                <HelpCircle className="h-4 w-4 mr-3 text-muted-foreground" />
                Help & Documentation
              </Command.Item>
            </Command.Group>
          </Command.List>
        </Command>
      </div>
    </div>
  );
}
