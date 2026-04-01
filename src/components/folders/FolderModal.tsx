"use client";
import { useState, useEffect } from "react";
import { Folder } from "@/lib/api/folders";

interface FolderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: { name: string; icon: string; color: string; parentFolderId: string | null }) => void;
  initialData?: Folder | null;
  folders: Folder[];
  currentParentId?: string | null;
}

export function FolderModal({ isOpen, onClose, onSubmit, initialData, folders, currentParentId }: FolderModalProps) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("");
  const [color, setColor] = useState("");
  const [parentFolderId, setParentFolderId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setName(initialData?.name || "");
      setIcon(initialData?.icon || "");
      setColor(initialData?.color || "");
      setParentFolderId(initialData ? (initialData.parentFolderId || null) : (currentParentId || null));
    }
  }, [isOpen, initialData, currentParentId]);

  if (!isOpen) return null;

  const handleSubmit = () => {
    onSubmit({ name, icon, color, parentFolderId });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl relative animate-in fade-in zoom-in-95 duration-200">
        <h2 className="text-xl font-semibold mb-4">{initialData ? "Editar Carpeta" : "Nueva Carpeta"}</h2>
        
        <div className="space-y-4 mb-6">
          <div>
            <label className="text-sm font-medium mb-1 block">Nombre</label>
            <input 
              type="text" 
              placeholder="Nombre"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-input bg-card shadow-sm"
              autoFocus
            />
          </div>
          
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="text-sm font-medium mb-1 block">Icono (Emoji)</label>
              <input 
                type="text" 
                placeholder="📁"
                value={icon}
                maxLength={2}
                onChange={(e) => setIcon(e.target.value)}
                className="w-full px-3 py-2 rounded-md border border-input bg-card shadow-sm text-center"
              />
            </div>
            <div className="flex-1">
              <label className="text-sm font-medium mb-1 block">Color</label>
              <div className="flex gap-2">
                 <input 
                   type="color" 
                   value={color || "#000000"}
                   onChange={(e) => setColor(e.target.value)}
                   className="h-10 w-10 p-1 rounded-md border border-input bg-card shadow-sm"
                 />
                 <input 
                   type="text" 
                   placeholder="#000000"
                   value={color}
                   onChange={(e) => setColor(e.target.value)}
                   className="w-full px-3 py-2 rounded-md border border-input bg-card shadow-sm"
                 />
              </div>
            </div>
          </div>

          <div>
             <label className="text-sm font-medium mb-1 block">Ubicación (Carpeta Padre)</label>
             <select 
               value={parentFolderId || ""}
               onChange={(e) => setParentFolderId(e.target.value || null)}
               className="w-full px-3 py-2 rounded-md border border-input bg-card shadow-sm"
             >
               <option value="">(Raíz) Todos los documentos</option>
               {folders.filter((f) => f.id !== initialData?.id).map((f) => (
                 <option key={f.id} value={f.id}>{f.name}</option>
               ))}
             </select>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button 
            onClick={onClose}
            className="px-4 py-2 rounded-md border border-border text-sm font-medium hover:bg-accent hover:text-accent-foreground"
          >
            Cancelar
          </button>
          <button 
            onClick={handleSubmit}
            disabled={!name.trim()}
            className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            {initialData ? "Guardar Cambios" : "Crear"}
          </button>
        </div>
      </div>
    </div>
  );
}