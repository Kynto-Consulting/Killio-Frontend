import React, { useState, useEffect } from "react";
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import Link from 'next/link';
import { DocumentBrick, DocumentSummary } from "@/lib/api/documents";
import { BoardSummary } from "@/lib/api/contracts";
import { CheckSquare, Table as TableIcon, ChevronDown, ChevronRight, BarChart2, Trash2, Plus, LayoutDashboard, FileText, CreditCard } from "lucide-react";
import { ReferencePicker } from "./reference-picker";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import { WorkspaceMemberLike } from "@/lib/workspace-members";

interface BrickRendererProps {
  brick: DocumentBrick;
  canEdit: boolean;
  onUpdate: (content: any) => void;
  documents?: DocumentSummary[];
  boards?: BoardSummary[];
  folders?: any[];
  users?: WorkspaceMemberLike[];
}

export function BrickRenderer({ brick, canEdit, onUpdate, documents = [], boards = [], folders = [], users = [] }: BrickRendererProps) {
  const { kind, content } = brick;
  const [isEditingText, setIsEditingText] = useState(false);
  const [isExpanded, setIsExpanded] = useState(content.isExpanded ?? false);
  const [isReferencePickerOpen, setIsReferencePickerOpen] = useState(false);

  const renderMarkdown = (text: string) => {
    // Advanced @[type:id:name] parsing
    // Format: @[doc:uuid:Title] or @[board:uuid:Name]
    const regex = /@\[(doc|board|card):([^:]+):([^\]]+)\]/g;
    const processed = text.replace(regex, (match, type, id, name) => {
       const href = type === 'doc' ? `/d/${id}` : type === 'board' ? `/b/${id}` : `/c/${id}`;
       return `[${name}](${href})`;
    });

    return (
      <ReactMarkdown 
        rehypePlugins={[rehypeRaw]}
        components={{
          a: ({ node, ...props }) => {
            const href = props.href || '#';
            const isDoc = href.startsWith('/d/');
            const isBoard = href.startsWith('/b/');
            const isInternal = isDoc || isBoard;
            
            return (
              <Link 
                href={href} 
                className={`inline-flex items-center space-x-1 text-accent hover:underline font-medium px-1.5 py-0.5 rounded-md transition-colors ${
                  isInternal ? 'bg-accent/10 hover:bg-accent/20 border border-accent/20' : ''
                }`} 
                {...props} 
              >
                {isDoc && <FileText className="h-3 w-3 opacity-70 mr-1" />}
                {isBoard && <LayoutDashboard className="h-3 w-3 opacity-70 mr-1" />}
                <span>{props.children}</span>
              </Link>
            );
          }
        }}
      >
        {processed}
      </ReactMarkdown>
    );
  };

  if (kind === 'text') {
    return (
      <div 
        className="w-full min-h-[1.5em] group relative" 
      >
        {isEditingText && canEdit ? (
          <textarea
            autoFocus
            className="w-full bg-transparent border-none focus:ring-0 resize-none outline-none focus:bg-accent/5 p-2 rounded-md transition-colors font-mono text-sm"
            placeholder="Type markdown..."
            value={content.text || ''}
            onChange={(e) => {
              const val = e.target.value;
              onUpdate({ ...content, text: val });
              if (val.endsWith("@")) {
                setIsReferencePickerOpen(true);
              }
            }}
            onBlur={() => {
              // Delay blur to allow picker clicks
              setTimeout(() => {
                if (!isReferencePickerOpen) setIsEditingText(false);
              }, 200);
            }}
            rows={Math.max(2, (content.text || '').split('\n').length)}
          />
        ) : (
          <div 
            className={`w-full prose prose-sm max-w-none dark:prose-invert p-2 ${!content.text ? 'text-muted-foreground' : ''}`}
            onClick={() => canEdit && setIsEditingText(true)}
          >
             {content.text ? (
               renderMarkdown(content.text)
             ) : (
               <span className="cursor-text opacity-50">Type content or '@' to link...</span>
             )}
          </div>
        )}

        {isReferencePickerOpen && (
          <ReferencePicker 
            boards={boards}
            documents={documents}
            folders={folders}
            users={users}
            onClose={() => setIsReferencePickerOpen(false)}
            onSelect={(item) => {
              const newText = (content.text || "").slice(0, -1) + `${item.token} `;
              onUpdate({ ...content, text: newText });
              setIsReferencePickerOpen(false);
              // Maintain editing state
            }}
          />
        )}
      </div>
    );
  }

  if (kind === 'checklist') {
    const items = content.items || [];
    return (
      <div className="w-full space-y-1 py-1 p-2">
        {items.map((item: any, idx: number) => (
          <div key={idx} className="flex items-start space-x-3 group/item relative">
             <input 
               type="checkbox"
               checked={!!item.checked}
               disabled={!canEdit}
               onChange={(e) => {
                 const newItems = [...items];
                 newItems[idx] = { ...newItems[idx], checked: e.target.checked };
                 onUpdate({ ...content, items: newItems });
               }}
               className="mt-1 h-4 w-4 rounded border-border text-accent focus:ring-accent"
             />
             <input
               className={`flex-1 bg-transparent border-none focus:ring-0 outline-none p-1 rounded transition-colors ${item.checked ? 'line-through text-muted-foreground' : ''} hover:bg-black/5 dark:hover:bg-white/5 focus:bg-accent/10`}
               value={item.text || ''}
               placeholder="To-do item"
               disabled={!canEdit}
               onKeyDown={(e) => {
                 if (e.key === 'Enter') {
                   e.preventDefault();
                   const newItems = [...items];
                   newItems.splice(idx + 1, 0, { text: '', checked: false });
                   onUpdate({ ...content, items: newItems });
                   // Focus next is hard without refs, but we can rely on React's re-render
                 }
                 if (e.key === 'Backspace' && !item.text && items.length > 1) {
                   e.preventDefault();
                   const newItems = items.filter((_: any, i: number) => i !== idx);
                   onUpdate({ ...content, items: newItems });
                 }
               }}
               onChange={(e) => {
                 const newItems = [...items];
                 newItems[idx] = { ...newItems[idx], text: e.target.value };
                 onUpdate({ ...content, items: newItems });
               }}
             />
             {canEdit && (
               <button 
                 onClick={() => {
                   const newItems = items.filter((_: any, i: number) => i !== idx);
                   onUpdate({ ...content, items: newItems });
                 }}
                 className="opacity-0 group-hover/item:opacity-100 p-1 text-muted-foreground hover:text-destructive transition-all"
               >
                 <Trash2 className="h-3 w-3" />
               </button>
             )}
          </div>
        ))}
        {canEdit && (
          <button 
            onClick={() => onUpdate({ ...content, items: [...items, { text: '', checked: false }] })}
            className="text-xs text-muted-foreground hover:text-accent mt-2 flex items-center space-x-1 ml-1 opacity-50 hover:opacity-100 transition-opacity"
          >
            <Plus className="h-3 w-3" />
            <span>Add Item</span>
          </button>
        )}
      </div>
    );
  }

  if (kind === 'table') {
    const rows = content.rows || [['Header 1', 'Header 2'], ['Cell 1', 'Cell 2']];
    return (
      <div className="w-full overflow-x-auto p-2 my-2">
         <table className="w-full border-collapse border border-border text-sm">
            <tbody>
              {rows.map((row: string[], rIdx: number) => (
                <tr key={rIdx} className={rIdx === 0 ? "bg-muted/50 font-medium" : "bg-card hover:bg-muted/20"}>
                  {row.map((cell: string, cIdx: number) => (
                    <td key={cIdx} className="border border-border p-0 relative min-w-[120px]">
                      <input 
                        className={`w-full h-full p-2 bg-transparent border-none focus:ring-2 focus:ring-inset focus:ring-accent outline-none ${rIdx === 0 ? "font-semibold" : ""}`}
                        value={cell}
                        disabled={!canEdit}
                        onChange={(e) => {
                           const newRows = rows.map((r: string[]) => [...r]);
                           newRows[rIdx][cIdx] = e.target.value;
                           onUpdate({ ...content, rows: newRows });
                        }}
                      />
                    </td>
                  ))}
                  {canEdit && rIdx === 0 && (
                    <td className="w-8 border-none p-1 align-middle text-center">
                      <button onClick={() => {
                          const newRows = rows.map((r: string[]) => [...r, '']);
                          onUpdate({ ...content, rows: newRows });
                      }} className="text-muted-foreground hover:text-accent font-bold">+</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
         </table>
         {canEdit && (
           <button onClick={() => {
              const newRows = [...rows, new Array(rows[0]?.length || 1).fill('')];
              onUpdate({ ...content, rows: newRows });
           }} className="text-xs mt-2 text-muted-foreground hover:text-accent transition-colors">
              + Add Row
           </button>
         )}
      </div>
    );
  }

  if (kind === 'graph') {
    const type = content.type || 'line';
    const data = content.data || [
      { name: 'Jan', value: 400 },
      { name: 'Feb', value: 300 },
      { name: 'Mar', value: 600 },
    ];
    
    return (
      <div className="w-full p-4 border border-border rounded-lg bg-card my-4 relative group">
        <div className="flex justify-between items-center mb-4">
           <h4 className="font-semibold text-sm flex items-center"><BarChart2 className="w-4 h-4 mr-2 text-accent"/> {content.title || 'Chart'}</h4>
           {canEdit && (
             <div className="flex gap-2">
                <select 
                  value={type} 
                  onChange={(e) => onUpdate({ ...content, type: e.target.value })}
                  className="text-xs bg-muted border-none rounded p-1 outline-none focus:ring-1 focus:ring-accent"
                >
                  <option value="line">Line</option>
                  <option value="bar">Bar</option>
                </select>
             </div>
           )}
        </div>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            {type === 'bar' ? (
              <BarChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#888888" opacity={0.2} />
                <XAxis dataKey="name" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                <RechartsTooltip cursor={{fill: 'transparent'}} contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }} />
                <Bar dataKey="value" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
              </BarChart>
            ) : (
              <LineChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#888888" opacity={0.2} />
                <XAxis dataKey="name" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                <RechartsTooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }} />
                <Line type="monotone" dataKey="value" stroke="hsl(var(--accent))" strokeWidth={2} dot={{ r: 4, fill: 'hsl(var(--background))', strokeWidth: 2 }} activeDot={{ r: 6 }} />
              </LineChart>
            )}
          </ResponsiveContainer>
        </div>
        {canEdit && (
           <p className="text-[10px] text-muted-foreground mt-2 italic text-center opacity-0 group-hover:opacity-100 transition-opacity">
             Note: Graph data editing JSON directly is not shown for simplicity.
           </p>
        )}
      </div>
    );
  }

  if (kind === 'accordion') {
    const title = content.title || 'Toggle Header';
    const body = content.body || '';

    return (
      <div className="w-full border-b border-border/50 py-2">
        <button 
          className="flex items-center w-full focus:outline-none" 
          onClick={() => {
             const newVal = !isExpanded;
             setIsExpanded(newVal);
             if (canEdit && content.isExpanded !== newVal) {
               onUpdate({ ...content, isExpanded: newVal });
             }
          }}
        >
          <div className="p-1 hover:bg-accent/10 rounded mr-1 transition-colors text-muted-foreground hover:text-foreground">
             {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </div>
          {canEdit ? (
            <input 
              className="flex-1 bg-transparent font-medium border-none focus:ring-0 outline-none p-1 rounded" 
              value={title} 
              onChange={(e) => onUpdate({ ...content, title: e.target.value })} 
              onClick={e => e.stopPropagation()}
            />
          ) : (
            <div className="font-medium p-1 select-none">{title}</div>
          )}
        </button>
        {isExpanded && (
           <div className="pl-8 pr-2 py-2 mt-1">
             {isEditingText && canEdit ? (
                <textarea
                  autoFocus
                  className="w-full bg-transparent border-none focus:ring-0 resize-none outline-none focus:bg-accent/5 p-2 rounded-md transition-colors font-mono text-sm"
                  placeholder="Type markdown details..."
                  value={body}
                  onChange={(e) => onUpdate({ ...content, body: e.target.value })}
                  onBlur={() => setIsEditingText(false)}
                  rows={Math.max(2, body.split('\n').length)}
                />
             ) : (
                <div 
                  className={`w-full prose prose-sm max-w-none dark:prose-invert min-h-[1.5em] ${!body ? 'text-muted-foreground' : ''}`}
                  onClick={(e) => {
                     if (canEdit) {
                       e.stopPropagation();
                       setIsEditingText(true);
                     }
                  }}
                >
                  {body ? (
                    renderMarkdown(body)
                  ) : (
                    <span className="cursor-text text-sm opacity-60">Empty toggle details...</span>
                  )}
                </div>
             )}
           </div>
        )}
      </div>
    );
  }

  if (kind === 'image') {
    return (
      <div className="w-full py-4 flex flex-col items-center">
        {content.url ? (
          <img src={content.url} alt="Document upload" className="max-w-full rounded-md border border-border/50 max-h-[600px] object-contain shadow-sm" />
        ) : (
          <div className="w-full border-2 border-dashed border-border/60 rounded-lg p-10 flex flex-col items-center justify-center bg-muted/5">
             <p className="text-sm text-muted-foreground mb-4">Drag an image or paste here</p>
             {canEdit && (
               <label className="text-xs bg-accent text-accent-foreground px-4 py-2 rounded-md hover:bg-accent/90 cursor-pointer font-medium transition-colors">
                  Upload Image
                  <input 
                    type="file" 
                    accept="image/*" 
                    className="hidden" 
                    onChange={async (e) => {
                      if (!e.target.files?.length) return;
                      const file = e.target.files[0];
                      // Assume a simple upload flow utilizing the already existing Uploads endpoint...
                      // For now, base64 data URI simulation if standard endpoint is disconnected:
                      const reader = new FileReader();
                      reader.onload = (ev) => {
                        onUpdate({ ...content, url: ev.target?.result as string });
                      };
                      reader.readAsDataURL(file);
                    }}
                  />
               </label>
             )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-4 border border-border/50 rounded bg-muted/20 text-muted-foreground italic text-sm">
      Unsupported block type: {kind}
    </div>
  );
}
