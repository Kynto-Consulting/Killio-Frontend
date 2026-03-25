"use client";

import React, { useState, useEffect, useRef } from "react";
import { Search, FileText, LayoutDashboard, CreditCard, Loader2, User } from "lucide-react";
import { BoardSummary } from "@/lib/api/contracts";
import { DocumentSummary } from "@/lib/api/documents";

interface ReferenceItem {
  type: 'board' | 'doc' | 'card' | 'user';
  id: string;
  name: string;
  avatarUrl?: string | null;
}

interface ReferencePickerProps {
  onSelect: (item: ReferenceItem) => void;
  onClose: () => void;
  boards: BoardSummary[];
  documents: DocumentSummary[];
  users: Array<{ id: string; name: string; avatarUrl?: string | null }>;
  cards?: Array<{ id: string; title: string }>;
}

export function ReferencePicker({ onSelect, onClose, boards, documents, users, cards = [] }: ReferencePickerProps) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [results, setResults] = useState<ReferenceItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    // Small delay to ensure the portal and input are ready
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const q = query.toLowerCase();
    const items: ReferenceItem[] = [
      ...boards.map(b => ({ type: 'board' as const, id: b.id, name: b.name })),
      ...documents.map(d => ({ type: 'doc' as const, id: d.id, name: d.title })),
      ...users.map(u => ({ type: 'user' as const, id: u.id, name: u.name, avatarUrl: u.avatarUrl })),
      ...cards.map(c => ({ type: 'card' as const, id: c.id, name: c.title })),
    ].filter(item => (item.name && item.name.toLowerCase().includes(q)));

    setResults(items);
    setSelectedIndex(0);
  }, [query, boards, documents, users]);

  // Handle selected item visibility
  const itemRefs = useRef<Map<number, HTMLButtonElement>>(new Map());
  useEffect(() => {
    const selectedItem = itemRefs.current.get(selectedIndex);
    if (selectedItem) {
      selectedItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [selectedIndex]);

  const handleKeyDown = (e: React.KeyboardEvent | KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (results.length > 0 ? (prev + 1) % results.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (results.length > 0 ? (prev - 1 + results.length) % results.length : 0));
    } else if (e.key === 'Enter' && results[selectedIndex]) {
      e.preventDefault();
      onSelect(results[selectedIndex]);
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  // Global listener to capture events if input isn't perfectly focused
  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [results, selectedIndex]);

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-20 bg-background/20 backdrop-blur-[2px]">
      <div className="bg-card w-full max-w-md border border-border shadow-2xl rounded-xl overflow-hidden animate-in fade-in slide-in-from-top-4 duration-200">
        <div className="p-3 border-b border-border flex items-center space-x-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            ref={inputRef}
            className="flex-1 bg-transparent border-none outline-none text-sm placeholder:text-muted-foreground/50"
            placeholder="Search boards, documents..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>
        <div className="max-h-60 overflow-y-auto p-1">
          {results.length > 0 ? (
            results.map((item, idx) => (
              <button
                key={`${item.type}-${item.id}`}
                ref={el => { if (el) itemRefs.current.set(idx, el); else itemRefs.current.delete(idx); }}
                onClick={() => onSelect(item)}
                onMouseEnter={() => setSelectedIndex(idx)}
                className={`w-full text-left flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors ${idx === selectedIndex ? "bg-accent text-accent-foreground" : "hover:bg-accent/10"
                  }`}
              >
                {item.type === 'board' && <LayoutDashboard className="h-4 w-4 opacity-70" />}
                {item.type === 'doc' && <FileText className="h-4 w-4 opacity-70" />}
                {item.type === 'card' && <CreditCard className="h-4 w-4 opacity-70" />}
                {item.type === 'user' && (
                  item.avatarUrl ? (
                    <img src={item.avatarUrl} className="h-4 w-4 rounded-full" />
                  ) : (
                    <User className="h-4 w-4 opacity-70" />
                  )
                )}
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{item.name}</span>
                  <span className="text-[10px] uppercase tracking-wider opacity-50">{item.type}</span>
                </div>
              </button>
            ))
          ) : (
            <div className="p-8 text-center text-muted-foreground text-sm">
              No results found for "{query}"
            </div>
          )}
        </div>
        <div className="p-2 bg-accent/5 border-t border-border flex items-center justify-between text-[10px] text-muted-foreground uppercase tracking-widest px-4">
          <span>↑↓ to navigate</span>
          <span>↵ to select</span>
          <span>esc to close</span>
        </div>
      </div>
    </div>
  );
}
