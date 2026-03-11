"use client";

import { useState } from "react";
import { X, UploadCloud, FileText, FileAudio, Bot, AlignLeft, Sparkles, Send, Loader2 } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

interface GeneratedCard {
  title: string;
  description: string;
  suggestedBoard?: string;
  suggestedList?: string;
}

export function AiGenerationPanel({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileText, setFileText] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [previewCards, setPreviewCards] = useState<GeneratedCard[]>([]);

  if (!isOpen) return null;

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setSelectedFile(e.dataTransfer.files[0]);
    }
  };

  const handleGenerate = async () => {
    if (!selectedFile) return;
    setIsGenerating(true);
    setPreviewCards([]);
    try {
      // In production: extract text from file server-side
      // Here we pass the filename + any user context as the raw content
      const rawContent = fileText || `File: ${selectedFile.name} (${(selectedFile.size / 1024).toFixed(1)} KB). Extract actionable tasks from this file.`;
      const res = await fetch(`${API}/ai/scope/personal/generate-cards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scopeId: "personal", rawContent }),
      });
      const cards: GeneratedCard[] = await res.json();
      setPreviewCards(Array.isArray(cards) ? cards : []);
    } catch {
      setPreviewCards([{ title: "Error connecting to AI", description: "Check your API config.", suggestedList: "To Do" }]);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4 sm:p-6 overflow-y-auto">
      <div className="relative w-full max-w-4xl rounded-xl border border-border bg-card shadow-2xl flex flex-col md:flex-row overflow-hidden animate-in fade-in zoom-in-95 duration-200 min-h-[500px]">
        
        {/* Left Panel: Upload & Input */}
        <div className="flex-1 border-r border-border p-6 flex flex-col">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold flex items-center">
              <Bot className="mr-2 h-6 w-6 text-accent" />
              AI Draft Studio
            </h2>
            <button onClick={onClose} className="md:hidden rounded-full p-1.5 hover:bg-accent/10 text-muted-foreground">
              <X className="h-5 w-5" />
            </button>
          </div>

          <p className="text-sm text-muted-foreground mb-6">
            Upload meetings recordings, PDFs, Excel sheets, or handwriting. AI will extract actionable cards automatically.
          </p>

          {!selectedFile ? (
            <div 
              className={`flex-1 border-2 border-dashed rounded-xl flex flex-col items-center justify-center p-6 transition-colors ${
                dragActive ? "border-accent bg-accent/5" : "border-border/60 hover:border-accent hover:bg-accent/5"
              }`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <div className="h-16 w-16 mb-4 rounded-full bg-accent/10 flex items-center justify-center text-accent">
                <UploadCloud className="h-8 w-8" />
              </div>
              <h3 className="font-semibold text-foreground mb-1">Drag and drop files</h3>
              <p className="text-xs text-muted-foreground text-center">PDF, CSV, Audio (MP3/WAV), or Images.</p>
              
              <div className="mt-6 flex items-center space-x-4">
                <label className="cursor-pointer inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground">
                  <FileText className="mr-1.5 h-4 w-4" /> Browse Files
                  <input type="file" className="hidden" onChange={(e) => setSelectedFile(e.target.files?.[0] || null)} />
                </label>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col border rounded-xl border-border bg-background p-4 relative">
              <button 
                onClick={() => { setSelectedFile(null); setPreviewCards([]); }}
                className="absolute top-2 right-2 p-1 rounded-md text-muted-foreground hover:bg-accent/10 hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
              <div className="flex items-center mb-4">
                <FileAudio className="h-10 w-10 text-accent mr-3" />
                <div>
                  <h4 className="font-medium text-sm truncate w-48">{selectedFile.name}</h4>
                  <p className="text-xs text-muted-foreground">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
              </div>
              <textarea 
                placeholder="Optional: Provide context. ('Extract only marketing tasks from this audio')" 
                className="flex-1 w-full bg-transparent border-t border-border focus:outline-none resize-none pt-4 text-sm"
              />
              <button 
                onClick={handleGenerate}
                disabled={isGenerating}
                className="mt-4 w-full inline-flex items-center justify-center h-10 rounded-md bg-accent text-accent-foreground font-medium hover:bg-accent/90 disabled:opacity-50"
              >
                {isGenerating ? (
                  <span className="flex items-center">
                    <span className="w-4 h-4 mr-2 border-2 border-current border-t-transparent rounded-full animate-spin"></span>
                    Analyzing content...
                  </span>
                ) : (
                  <span className="flex items-center">
                    <Sparkles className="h-4 w-4 mr-2" />
                    Generate Action Items
                  </span>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Right Panel: Preview Area */}
        <div className="flex-1 bg-background/50 flex flex-col relative w-full md:max-w-md">
          <div className="hidden md:flex absolute top-4 right-4 z-10">
            <button onClick={onClose} className="rounded-full p-1.5 hover:bg-accent/10 text-muted-foreground transition-colors">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="p-6 flex-1 flex flex-col h-[400px] md:h-auto overflow-y-auto hide-scrollbar">
            <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground mb-4">Preview Cards</h3>
            
            {previewCards.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center opacity-50">
                <Bot className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-sm text-center">AI will populate draft cards here for your review.</p>
              </div>
            ) : (
              <div className="space-y-3 flex-1">
                {previewCards.map((card, i) => (
                   <div key={i} className="group relative rounded-lg border border-border bg-card p-3 shadow-sm hover:border-accent/40 transition-all">
                    <p className="text-sm font-medium leading-tight text-foreground/90">
                      {card.title}
                    </p>
                    <div className="flex flex-col mt-2 space-y-1.5">
                      <div className="flex items-center text-xs text-muted-foreground">
                        <span className="font-semibold w-20">Board:</span>
                        <span className="px-2 py-0.5 rounded bg-primary/10 truncate">{card.suggestedBoard ?? "—"}</span>
                      </div>
                      <div className="flex items-center text-xs text-muted-foreground">
                        <span className="font-semibold w-20">List:</span>
                        <span className="px-2 py-0.5 rounded bg-primary/10 truncate">{card.suggestedList ?? "To Do"}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          
          {previewCards.length > 0 && (
            <div className="p-4 border-t border-border bg-card/80 backdrop-blur-sm shrink-0">
               <button className="w-full inline-flex items-center justify-center h-10 rounded-md bg-primary text-primary-foreground font-medium hover:bg-primary/90">
                <Send className="h-4 w-4 mr-2" />
                Dispatch Cards to Boards
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
