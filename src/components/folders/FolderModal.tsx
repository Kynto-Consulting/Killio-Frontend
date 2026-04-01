"use client";
import React, { useState, useEffect } from "react";
import { Folder } from "@/lib/api/folders";
import { Folder as FolderIcon, Star, Heart, Briefcase, Book, Image as ImageIcon, Music, Video, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface FolderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: { name: string; icon: string; color: string; parentFolderId: string | null }) => void;
  initialData?: Folder | null;
  folders: Folder[];
  currentParentId?: string | null;
}

const PRESET_COLORS = [
  "#3b82f6", "#ef4444", "#22c55e", "#eab308", "#a855f7", // Blue, Red, Green, Yellow, Purple
  "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#6366f1"  // Pink, Cyan, Lime, Orange, Indigo
];

const PRESET_ICONS = [
  { id: "folder", icon: FolderIcon },
  { id: "star", icon: Star },
  { id: "heart", icon: Heart },
  { id: "briefcase", icon: Briefcase },
  { id: "book", icon: Book },
  { id: "image", icon: ImageIcon },
  { id: "music", icon: Music },
  { id: "video", icon: Video }
];

export function FolderModal({ isOpen, onClose, onSubmit, initialData, folders, currentParentId }: FolderModalProps) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("folder");
  const [color, setColor] = useState("#3b82f6");
  const [parentFolderId, setParentFolderId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setName(initialData?.name || "");
      setIcon(initialData?.icon || "folder");
      setColor(initialData?.color || "#3b82f6");
      setParentFolderId(initialData ? (initialData.parentFolderId || null) : (currentParentId || null));
    }
  }, [isOpen, initialData, currentParentId]);

  if (!isOpen) return null;

  const handleSubmit = () => {
    onSubmit({ name, icon, color, parentFolderId });
  };

  const SelectedIcon = PRESET_ICONS.find(i => i.id === icon)?.icon || FolderIcon;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="w-full max-w-[480px] rounded-2xl border border-border bg-card p-6 shadow-xl relative animate-in fade-in zoom-in-95 duration-200">
        
        <h2 className="text-2xl font-bold tracking-tight mb-6">{initialData ? "Editar Carpeta" : "Nueva Carpeta"}</h2>
        
        <div className="space-y-7">
          <div>
            <input 
              type="text" 
              placeholder="Nombre de la carpeta"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-3 text-base rounded-xl border border-input bg-card shadow-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
              autoFocus
            />
          </div>
          
          <div className="flex gap-8">
            <div className="flex-1">
              <label className="text-sm font-semibold mb-3 block">Color</label>
              <div className="grid grid-cols-5 gap-3">
                {PRESET_COLORS.map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center transition-transform hover:scale-110",
                      color === c ? "ring-2 ring-offset-2 ring-offset-card ring-primary" : "border-2 border-border/60"
                    )}
                    style={{ backgroundColor: c }}
                  >
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1">
              <label className="text-sm font-semibold mb-3 block">Icono</label>
              <div className="grid grid-cols-4 gap-3">
                {PRESET_ICONS.map(i => {
                  const IconComp = i.icon;
                  const isSelected = icon === i.id;
                  return (
                    <button
                      key={i.id}
                      type="button"
                      onClick={() => setIcon(i.id)}
                      className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center border transition-all hover:bg-accent",
                        isSelected 
                          ? "border-2 shadow-sm scale-110" 
                          : "border-border text-muted-foreground/70"
                      )}
                      style={isSelected && color ? { borderColor: color, color } : {}}
                    >
                      <IconComp className={cn("w-5 h-5", isSelected ? "" : "")} />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="pt-2">
             <label className="text-sm font-semibold mb-3 block">Vista previa</label>
             <div className="flex items-center gap-3 p-4 rounded-xl bg-accent/20 border border-accent/10">
               <SelectedIcon className="w-5 h-5" style={{ color }} />
               <span className="text-base font-medium" style={{ color }}>{name || "Carpeta global"}</span>
             </div>
          </div>

          <div>
             <label className="text-sm font-semibold mb-2 block text-muted-foreground">Ubicación</label>
             <select 
               value={parentFolderId || ""}
               onChange={(e) => setParentFolderId(e.target.value || null)}
               className="w-full px-4 py-3 rounded-xl border border-input bg-card shadow-sm text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
             >
               <option value="">Raíz</option>
               {folders.filter((f) => f.id !== initialData?.id).map((f) => (
                 <option key={f.id} value={f.id}>{f.name}</option>
               ))}
             </select>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-8">
          <button 
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            Cancelar
          </button>
          <button 
            onClick={handleSubmit}
            disabled={!name.trim()}
            className="px-6 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors shadow"
          >
            {initialData ? "Guardar" : "Crear"}
          </button>
        </div>
      </div>
    </div>
  );
}
