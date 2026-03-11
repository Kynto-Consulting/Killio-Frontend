"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Hexagon, LayoutDashboard, Settings, Users, History, Bell, Search, Plus } from "lucide-react";
import { CommandPalette } from "@/components/ui/command-palette";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const navigation = [
    { name: "Workspaces", href: "/", icon: LayoutDashboard },
    { name: "Teams", href: "/teams", icon: Users },
    { name: "History", href: "/history", icon: History },
    { name: "Settings", href: "/settings", icon: Settings },
  ];

  return (
    <div className="flex h-screen bg-background overflow-hidden selection:bg-accent/30 selection:text-foreground">
      <CommandPalette />
      {/* Sidebar */}
      <aside className="hidden w-64 flex-col border-r border-border bg-card/30 backdrop-blur-sm md:flex">
        <div className="flex h-14 items-center border-b border-border px-4">
          <Link href="/" className="flex items-center space-x-2 transition-opacity hover:opacity-80">
            <Hexagon className="h-6 w-6 text-accent" />
            <span className="font-semibold tracking-tight text-lg">Killio</span>
          </Link>
        </div>
        
        <div className="flex-1 overflow-y-auto py-4">
          <nav className="space-y-1 px-2">
            {navigation.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`flex items-center space-x-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    isActive 
                      ? "bg-accent/10 text-accent" 
                      : "text-muted-foreground hover:bg-accent/5 hover:text-foreground"
                  }`}
                >
                  <item.icon className={`h-4 w-4 ${isActive ? "opacity-100" : "opacity-70"}`} />
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </nav>

          <div className="mt-8 px-5">
            <h3 className="text-xs font-semibold tracking-wider text-muted-foreground/60 uppercase">
              Recent Boards
            </h3>
            <div className="mt-3 space-y-1">
              {["Marketing Q3", "Backend Overhaul", "Product Hunt Launch"].map((board) => (
                <Link
                  key={board}
                  href={`/b/board_${board.toLowerCase().replace(" ", "_")}`}
                  className="group flex items-center justify-between rounded-md py-1.5 px-3 text-sm text-muted-foreground hover:bg-accent/5 hover:text-foreground transition-all"
                >
                  <span className="truncate">{board}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>

        <div className="border-t border-border p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-accent to-primary/60 flex items-center justify-center text-primary-foreground font-semibold text-xs border border-border shadow-sm">
                RO
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-medium">Ronald</span>
                <span className="text-xs text-muted-foreground">Admin</span>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top Navbar */}
        <header className="flex h-14 items-center justify-between border-b border-border bg-background/60 px-4 backdrop-blur-md">
          <div className="flex flex-1 items-center">
            {/* Global Search / Command Palette trigger */}
            <button 
              onClick={() => window.dispatchEvent(new CustomEvent("open-cmdk"))}
              className="flex w-full max-w-sm items-center space-x-2 rounded-md border border-border bg-card/40 px-3 py-1.5 text-sm text-muted-foreground shadow-sm transition-colors hover:bg-accent/5 hover:text-foreground focus:outline-none focus:ring-1 focus:ring-accent md:w-80"
            >
              <Search className="h-4 w-4 opacity-70" />
              <span>Search or type a command...</span>
              <span className="ml-auto hidden rounded bg-muted/50 px-1.5 py-0.5 text-xs font-semibold tracking-widest text-muted-foreground md:inline-block">
                ⌘K
              </span>
            </button>
          </div>
          
          <div className="flex items-center space-x-4">
            <button className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-accent/10 hover:text-foreground transition-colors relative">
              <Bell className="h-4 w-4" />
              <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-accent ring-2 ring-background"></span>
            </button>
            <Link href="/login" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              Sign out
            </Link>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto bg-background/50">
          {children}
        </main>
      </div>
    </div>
  );
}
