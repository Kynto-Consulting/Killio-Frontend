import React from "react";
import { cn } from "@/lib/utils";

interface ColumnsBrickProps {
  id: string;
  columns: { id: string; content: string }[];
  onUpdate: (data: { columns: { id: string; content: string }[] }) => void;
  readonly?: boolean;
}

export const UnifiedColumnsBrick: React.FC<ColumnsBrickProps> = ({ id, columns = [], onUpdate, readonly }) => {
  const safeColumns = columns.length > 0 ? columns : [
    { id: "1", content: "" },
    { id: "2", content: "" }
  ];

  const updateColumn = (colId: string, content: string) => {
    onUpdate({
      columns: safeColumns.map((c) => (c.id === colId ? { ...c, content } : c)),
    });
  };

  const addColumn = () => {
    if (safeColumns.length >= 5) return;
    const newId = Math.random().toString(36).substring(7);
    onUpdate({
      columns: [...safeColumns, { id: newId, content: "" }],
    });
  };

  const removeColumn = (colId: string) => {
    if (safeColumns.length <= 2) return;
    onUpdate({ columns: safeColumns.filter((c) => c.id !== colId) });
  };

  return (
    <div className="flex flex-col group my-2 relative">
      <div className="flex flex-col md:flex-row gap-4 w-full">
        {safeColumns.map((col, index) => (
          <div key={col.id} className="flex-1 flex flex-col min-w-0 group/col relative bg-muted/5 border border-transparent hover:border-border/50 rounded-lg p-2 transition-colors">
             {!readonly ? (
               <textarea
                 value={col.content}
                 onChange={(e) => updateColumn(col.id, e.target.value)}
                 placeholder={`Columna ${index + 1}...`}
                 className="w-full resize-none bg-transparent outline-none min-h-[100px] text-sm leading-relaxed"
               />
             ) : (
                <div className="text-sm leading-relaxed whitespace-pre-wrap">{col.content}</div>
             )}
             {!readonly && safeColumns.length > 2 && (
               <button 
                 onClick={() => removeColumn(col.id)}
                 className="absolute -top-2 -right-2 bg-background border border-border rounded-full p-1 opacity-0 group-hover/col:opacity-100 text-destructive shadow-sm"
               >
                 <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-x"><line x1="18" x2="6" y1="6" y2="18"/><line x1="6" x2="18" y1="6" y2="18"/></svg>
               </button>
             )}
          </div>
        ))}
      </div>
      {!readonly && safeColumns.length < 5 && (
        <button 
          onClick={addColumn}
          className="absolute -right-8 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-background border border-border rounded-full p-1.5 shadow-sm hover:bg-muted text-muted-foreground"
          title="Añadir columna"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-plus"><line x1="12" x2="12" y1="5" y2="19"/><line x1="5" x2="19" y1="12" y2="12"/></svg>
        </button>
      )}
    </div>
  );
};