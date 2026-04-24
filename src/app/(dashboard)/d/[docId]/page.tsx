"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { FolderIconDisplay } from "@/components/folders/FolderIconPicker";
import { Folder as FolderIcon, FileText, Loader2, ArrowLeft, Plus, MoreVertical, GripVertical, Trash2, MessageSquare, Share2, Users, X, Check, Download, Printer, Settings } from "lucide-react";
import { useSession } from "@/components/providers/session-provider";
import { useDocumentRealtime } from "@/hooks/useDocumentRealtime";
import { getDocument, createDocumentBrick, updateDocumentBrick, deleteDocumentBrick, DocumentView, DocumentBrick, reorderDocumentBricks, listDocuments, DocumentSummary, patchBrickCell } from "@/lib/api/documents";
import { listFolders, Folder } from "@/lib/api/folders";
import { listTeamBoards, BoardSummary, listTeamMembers, TeamMemberSummary, uploadFile } from "@/lib/api/contracts";
import Link from "next/link";
import { UnifiedBrickList } from "@/components/bricks/unified-brick-list";
import { cn } from "@/lib/utils";
import { useDocumentPresence } from "@/hooks/useDocumentPresence";
import { getUserAvatarUrl } from "@/lib/gravatar";
import { updateDocumentTitle } from "@/lib/api/documents";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DocumentCommentsDrawer } from "@/components/ui/document-comments-drawer";
import { Sparkles } from "lucide-react";
import { toast } from "@/lib/toast";
import { useTranslations } from "@/components/providers/i18n-provider";
import { MediaCarouselItem, parseMediaMeta, buildMediaCaption, uploadFilesAsMediaItems } from "@/lib/media-bricks";
import { getContainerChildIds, getTopLevelBrickIds, insertChildId, resolveNestedBricks, sanitizeChildrenByContainer, setContainerChildIds } from "@/lib/bricks/nesting";
import { toReferenceUsers } from "@/lib/workspace-members";
import { DocumentShareModal } from "@/components/ui/document-share-modal";

export default function DocumentPage() {
  const t = useTranslations("document-detail");
  const { docId } = useParams() as { docId: string };
  const { accessToken, user } = useSession();
  const router = useRouter();

  const [document, setDocument] = useState<DocumentView | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [teamDocs, setTeamDocs] = useState<DocumentSummary[]>([]);
  const [teamBoards, setTeamBoards] = useState<BoardSummary[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMemberSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [tempTitle, setTempTitle] = useState("");
  const [isCommentsOpen, setIsCommentsOpen] = useState(false);
  const [aiInitialInput, setAiInitialInput] = useState("");
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<'pdf' | 'docx'>('pdf');
  const [exportStyle, setExportStyle] = useState<'carta' | 'harvard'>('carta');
  const [exportSize, setExportSize] = useState<'letter' | 'A4'>('A4');
  const [isExporting, setIsExporting] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<'copilot' | 'comments' | 'activity'>('comments');

  const { activeTeamId } = useSession();
  const presenceMembers = useDocumentPresence(docId, user, accessToken);

  const sanitizeDocumentBricks = useCallback((bricks: DocumentBrick[]): DocumentBrick[] => {
    const ids = new Set(bricks.map((brick) => brick.id));
    return bricks.map((brick) => ({
      ...brick,
      content: sanitizeChildrenByContainer(brick.content || {}, ids),
    }));
  }, []);

  const fetchDoc = useCallback(async () => {
    if (!accessToken) return;
    try {
      setIsLoading(true);
      const doc = await getDocument(docId, accessToken);
      setDocument({ ...doc, bricks: sanitizeDocumentBricks(doc.bricks) });

      if (activeTeamId) {
        const [docs, boards, members, flds] = await Promise.all([
          listDocuments(activeTeamId, accessToken),
          listTeamBoards(activeTeamId, accessToken),
          listTeamMembers(activeTeamId, accessToken),
          listFolders(activeTeamId, accessToken)
        ]);
        setTeamDocs(docs);
        setTeamBoards(boards);
        setTeamMembers(members);
        
        let parsedFlds = [];
        if (Array.isArray(flds)) parsedFlds = flds;
        else if (flds && typeof flds === 'object' && Array.isArray((flds as any).data)) parsedFlds = (flds as any).data;
        setFolders(parsedFlds);
      }
    } catch (e: any) {
      setError(e.message || t("loadError"));
    } finally {
      setIsLoading(false);
    }
  }, [docId, accessToken, activeTeamId, sanitizeDocumentBricks, t]);

  useEffect(() => {
    fetchDoc();
  }, [fetchDoc]);

  useDocumentRealtime(docId, (event) => {
    if (event.type === "brick.created") {
      setDocument((prev) => {
        if (!prev) return prev;
        const exists = prev.bricks.some((b) => b.id === event.payload.id);
        if (exists) return prev;
        const nextBricks = sanitizeDocumentBricks([...prev.bricks, event.payload]).sort((a, b) => a.position - b.position);
        return { ...prev, bricks: nextBricks };
      });
    } else if (event.type === "brick.updated") {
      if (event.payload?.fullSyncRequired) {
        fetchDoc();
      } else if (event.payload?.contentPatch && event.payload?.id) {
        setDocument((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            bricks: prev.bricks.map((b) =>
              b.id === event.payload.id
                ? {
                    ...b,
                    content: { ...(b.content || {}), ...(event.payload.contentPatch || {}) },
                    updatedAt: event.payload.updatedAt || b.updatedAt,
                  }
                : b
            ),
          };
        });
      } else {
        setDocument((prev) => {
          if (!prev) return prev;
          const nextBricks = sanitizeDocumentBricks(
            prev.bricks.map((b) => (b.id === event.payload.id ? event.payload : b)),
          );
          return {
            ...prev,
            bricks: nextBricks,
          };
        });
      }
    } else if (event.type === "brick.deleted") {
      setDocument((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          bricks: prev.bricks.filter((b) => b.id !== event.payload.brickId),
        };
      });
    } else if (event.type === "document.updated") {
      setDocument((prev) => {
        if (!prev) return prev;
        return { ...prev, title: event.payload.title };
      });
    } else if (event.type === "brick.reordered") {
      setDocument((prev) => {
        if (!prev) return prev;
        const updates = event.payload.updates as { id: string, position: number }[];
        const newBricks = prev.bricks.map(b => {
          const u = updates.find(x => x.id === b.id);
          return u ? { ...b, position: u.position } : b;
        }).sort((a, b) => a.position - b.position);
        return { ...prev, bricks: newBricks };
      });
    } else if ((event.type as string) === "brick.cell_patched") {
      const p = event.payload;
      if (!p?.id || !p?.cellPatch) return;
      setDocument((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          bricks: prev.bricks.map((b) => {
            if (b.id !== p.id) return b;
            const content = b.content as any;
            const cp = p.cellPatch as any;
            if (cp.rowId && cp.colId) {
              const rows = (content.rows || []).map((r: any) =>
                r.id !== cp.rowId ? r : { ...r, ...(cp.rowMeta ?? {}), cells: { ...(r.cells || {}), [cp.colId]: cp.cell } }
              );
              return { ...b, content: { ...content, rows } };
            } else if (cp.rowIndex !== undefined && cp.colIndex !== undefined) {
              const rows = (content.rows || []).map((row: string[], i: number) => {
                if (i !== cp.rowIndex) return row;
                const r = [...row];
                r[cp.colIndex] = cp.value;
                return r;
              });
              return { ...b, content: { ...content, rows } };
            }
            return b;
          }),
        };
      });
    } else if ((event.type as string) === "brick.column_patched") {
      const p = event.payload;
      if (!p?.id || !p?.colPatch) return;
      setDocument((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          bricks: prev.bricks.map((b) => {
            if (b.id !== p.id) return b;
            const content = b.content as any;
            const cp = p.colPatch as any;
            if (cp.kind === 'bountiful_table_column' && cp.colId) {
              const columns = (content.columns || []).map((c: any) =>
                c.id !== cp.colId ? c : { ...c, ...cp.updates }
              );
              return { ...b, content: { ...content, columns } };
            } else if (cp.kind === 'bountiful_table_add_column' && cp.column) {
              const cols = [...(content.columns || [])];
              cols.splice(cp.atIndex ?? cols.length, 0, cp.column);
              const rows = (content.rows || []).map((r: any) => ({
                ...r, cells: { ...(r.cells || {}), [cp.column.id]: null }
              }));
              return { ...b, content: { ...content, columns: cols, rows } };
            } else if (cp.kind === 'bountiful_table_remove_column' && cp.colId) {
              const columns = (content.columns || []).filter((c: any) => c.id !== cp.colId);
              const rows = (content.rows || []).map((r: any) => {
                const { [cp.colId]: _, ...cells } = r.cells || {};
                return { ...r, cells };
              });
              return { ...b, content: { ...content, columns, rows } };
            } else if (cp.kind === 'bountiful_table_duplicate_column' && cp.srcColId && cp.newColId) {
              const srcIdx = (content.columns || []).findIndex((c: any) => c.id === cp.srcColId);
              if (srcIdx < 0) return b;
              const src = content.columns[srcIdx];
              const newCol = { ...src, id: cp.newColId, name: cp.newName || `${src.name} (copy)` };
              const columns = [...(content.columns || [])];
              columns.splice(cp.atIndex !== undefined ? cp.atIndex : srcIdx + 1, 0, newCol);
              const rows = (content.rows || []).map((r: any) => ({
                ...r, cells: { ...(r.cells || {}), [cp.newColId]: r.cells[cp.srcColId] ? { ...r.cells[cp.srcColId]! } : null }
              }));
              return { ...b, content: { ...content, columns, rows } };
            } else if (cp.kind === 'table_add_row') {
              const rows = content.rows as string[][];
              const cols = rows[0]?.length || 1;
              return { ...b, content: { ...content, rows: [...rows, new Array(cols).fill('')] } };
            } else if (cp.kind === 'table_remove_row' && cp.index !== undefined) {
              const rows = (content.rows as string[][]).filter((_: any, i: number) => i !== cp.index);
              return { ...b, content: { ...content, rows } };
            } else if (cp.kind === 'table_add_col') {
              const rows = (content.rows as string[][]).map((row: string[]) => [...row, '']);
              return { ...b, content: { ...content, rows } };
            } else if (cp.kind === 'table_remove_col' && cp.index !== undefined) {
              const rows = (content.rows as string[][]).map((row: string[]) => row.filter((_: any, i: number) => i !== cp.index));
              return { ...b, content: { ...content, rows } };
            }
            return b;
          }),
        };
      });
    }
  });

  const handleAddBrick = async (kind: string, afterBrickId?: string, parentProps?: { parentId: string, containerId: string }, initialContent?: any) => {
    if (!accessToken || !document) return;

    const parentBrick = parentProps ? document.bricks.find((b) => b.id === parentProps.parentId) : null;
    const contextBricks = parentProps && parentBrick
      ? (resolveNestedBricks(parentBrick.content, parentProps.containerId, document.bricks as any[]) as DocumentBrick[])
      : document.bricks
          .filter((b) => getTopLevelBrickIds(document.bricks).has(b.id))
          .sort((a, b) => a.position - b.position);

    let position = 1000;
    if (afterBrickId) {
      const idx = contextBricks.findIndex(b => b.id === afterBrickId);
      if (idx >= 0) {
        if (idx === contextBricks.length - 1) {
          position = contextBricks[idx].position + 1000;
        } else {
          position = (contextBricks[idx].position + contextBricks[idx + 1].position) / 2;
        }
      }
    } else {
      position = contextBricks.length > 0 ? contextBricks[contextBricks.length - 1].position + 1000 : 1000;
    }

    // Default empty content based on kind
    let content: any = initialContent || {}; if(!initialContent) {
    if (kind === 'text') content = { text: '' };
    if (kind === 'checklist') content = { items: [] };
    if (kind === 'graph') content = { type: 'line', data: [{ name: 'Jan', value: 400 }, { name: 'Feb', value: 300 }], title: 'New Chart' };
    if (kind === 'accordion') content = { title: 'Toggle Header', isExpanded: true, childrenByContainer: { body: [] } };
    if (kind === 'table') content = { rows: [['Header 1', 'Header 2'], ['Row 1 Cell 1', 'Row 1 Cell 2']] };
    if (kind === 'database' || kind === 'beautiful_table' || kind === 'bountiful') {
      const colNameId = 'col-name';
      const colStatusId = 'col-status';
      const now = Date.now();
      const isonow = new Date(now).toISOString();
      content = {
        title: 'Database',
        columns: [
          { id: colNameId, name: 'Nombre', type: 'title' },
          {
            id: colStatusId,
            name: 'Estado',
            type: 'status',
            options: [
              { id: 'opt-pendiente', name: 'Pendiente', color: 'yellow' },
              { id: 'opt-activo', name: 'Activo', color: 'green' },
              { id: 'opt-cerrado', name: 'Cerrado', color: 'gray' },
            ],
          },
        ],
        rows: [
          {
            id: `row-${now}`,
            cells: {
              [colNameId]: { type: 'text', text: '' },
              [colStatusId]: { type: 'select', name: '', color: 'default' },
            },
      _createdAt: isonow,
      _lastEditedAt: isonow,
      _createdBy: user?.id ||'',
      _lastEditedBy: user?.id ||'',
          },
        ],
      };
    }
    if (kind === 'image') content = { url: '', mediaType: 'image' };
    if (kind === 'video') content = { url: '', mediaType: 'video' };
    if (kind === 'audio') content = { url: '', mediaType: 'audio' };
    if (kind === 'file') content = { url: '', mediaType: 'file' };
    if (kind === 'bookmark') content = { url: '', mediaType: 'bookmark' };
    if (kind === 'code') content = { text: '```\n// Ingresa tu código aquí\n```', markdown: '```\n// Ingresa tu código aquí\n```' };
    if (kind === 'math') content = { text: '$$ \n\\int_0^T f(t) dt \n$$', markdown: '$$ \n\\int_0^T f(t) dt \n$$' };
    if (kind === 'tabs') content = { tabs: [{ id: '1', label: 'Tab 1' }], childrenByContainer: { '1': [] } };
    if (kind === 'columns') content = { columns: [{ id: '1' }, { id: '2' }], childrenByContainer: { '1': [], '2': [] } };
    if (kind === 'form' && !initialContent) {
      content = {
        title: 'Formulario',
        description: '',
        webhookUrl: '',
        submitLabel: 'Enviar',
        successMessage: 'Enviado correctamente.',
        fields: [
          {
            id: 'field-1',
            label: 'Nombre',
            type: 'text',
            placeholder: 'Escribe tu nombre',
            required: true,
          },
        ],
      };
    }

    let finalKind = kind;
    if (['video', 'audio', 'file', 'bookmark'].includes(kind)) finalKind = 'media';
    if (kind === 'code' || kind === 'math') finalKind = 'text';
    if (kind === 'database' || kind === 'bountiful' || kind === 'beautiful_table') finalKind = 'beautiful_table';

    try {
      const newBrick = await createDocumentBrick(docId, { kind: finalKind, position, content }, accessToken);
      // Wait for WS OR optimistic update:
      setDocument((prev) => {
        if (!prev) return prev;
        if (prev.bricks.some((b) => b.id === newBrick.id)) return prev;
        return { ...prev, bricks: [...prev.bricks, newBrick].sort((a, b) => a.position - b.position) };
      });

      if (parentProps && parentBrick) {
        const parentInLatest = (document.bricks.find((b) => b.id === parentBrick.id) || parentBrick) as DocumentBrick;
        const siblings = resolveNestedBricks(parentInLatest.content, parentProps.containerId, document.bricks as any[]) as DocumentBrick[];
        const afterIndex = afterBrickId ? siblings.findIndex((b) => b.id === afterBrickId) : -1;
        const insertIndex = afterIndex >= 0 ? afterIndex + 1 : siblings.length;
        const updatedParentContent = insertChildId(parentInLatest.content || {}, parentProps.containerId, newBrick.id, insertIndex);

        setDocument((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            bricks: prev.bricks.map((b) => (b.id === parentInLatest.id ? { ...b, content: updatedParentContent } : b)),
          };
        });

        try {
          await updateDocumentBrick(docId, parentInLatest.id, updatedParentContent, accessToken);
        } catch {
          fetchDoc();
        }
      }
      
      // If we just created a tabs, accordion, or columns container, scaffold an initial text brick inside it
      if (['tabs', 'accordion', 'columns'].includes(kind)) {
        const defaultContainerId = kind === 'tabs' ? '1' : kind === 'columns' ? '1' : 'body';
        const textContent = { text: '' };
        const innerBrick = await createDocumentBrick(docId, { kind: 'text', position: 1000, content: textContent }, accessToken);
        
        // For columns, scaffold a second one immediately
        let innerBrick2: any = null;
        if (kind === 'columns') {
          const textContent2 = { text: '' };
          innerBrick2 = await createDocumentBrick(docId, { kind: 'text', position: 1000, content: textContent2 }, accessToken);
        }

        let updatedContainerContent = insertChildId(newBrick.content || {}, defaultContainerId, innerBrick.id);
        if (innerBrick2) {
          updatedContainerContent = insertChildId(updatedContainerContent, '2', innerBrick2.id);
        }

        const updatedContainer = await updateDocumentBrick(docId, newBrick.id, updatedContainerContent, accessToken);

        setDocument((prev) => {
          if (!prev) return prev;
          let newBricks = [...prev.bricks];
          if (!newBricks.some((b) => b.id === innerBrick.id)) newBricks.push(innerBrick);
          if (innerBrick2 && !newBricks.some((b) => b.id === innerBrick2.id)) newBricks.push(innerBrick2);
          newBricks = newBricks.map((b) => (b.id === newBrick.id ? updatedContainer : b));
          return { ...prev, bricks: newBricks.sort((a, b) => a.position - b.position) };
        });
      }
    } catch (e) {
      console.error(e);
      toast(t("createBlockError"), "error");
    }
  };

  const handleUpdateBrick = async (brickId: string, content: any) => {
    if (!accessToken || !document) return;

    // Optimistic update
    setDocument((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        bricks: prev.bricks.map((b) => (b.id === brickId ? { ...b, content } : b)),
      };
    });

    try {
      await updateDocumentBrick(docId, brickId, content, accessToken);
    } catch (e) {
      console.error(e);
      // Revert or show error
    }
  };

  const handlePatchBrickCell = async (brickId: string, patch: Record<string, any>) => {
    if (!accessToken) return;
    try {
      await patchBrickCell(docId, brickId, patch as any, accessToken);
    } catch (e) {
      console.error('Cell patch failed, falling back to full update', e);
    }
  };

  const handlePatchBrickColumn = async (brickId: string, patch: Record<string, any>) => {
    if (!accessToken) return;
    try {
      await patchBrickCell(docId, brickId, patch as any, accessToken);
    } catch (e) {
      console.error('Column patch failed', e);
    }
  };

  const handleAiAction = useCallback((action: string, selectedText: string) => {
    let prompt = "";
    if (action === "ai-improve") prompt = `Mejora este texto:\n\n${selectedText}`;
    else if (action === "ai-fix") prompt = `Corrige la ortografía y gramática de este texto:\n\n${selectedText}`;
    else if (action === "ai-shorter") prompt = `Resume y acorta este texto:\n\n${selectedText}`;
    else if (action === "ai-explain") prompt = `Explica en detalle este texto:\n\n${selectedText}`;
    else if (action === "ai-format") prompt = `Modifica el formato de este texto (usa Markdown, negritas, viñetas, etc.):\n\n${selectedText}`;
    else prompt = `${action}:\n\n${selectedText}`;

    setSidebarTab('copilot');
    setAiInitialInput(prompt);
    setIsCommentsOpen(true);
  }, []);

  const handleDeleteBrick = async (brickId: string) => {
    if (!accessToken || !document) return;

    setDocument((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        bricks: prev.bricks.filter((b) => b.id !== brickId),
      };
    });

    try {
      await deleteDocumentBrick(docId, brickId, accessToken);
    } catch (e) {
      console.error(e);
    }
  };

  const handleReorderBricks = async (brickIds: string[]) => {
    if (!accessToken || !document) return;

    const updates = brickIds.map((id, index) => ({ id, position: index * 1000 + 1000 }));

    // Optimistic update
    setDocument((prev) => {
      if (!prev) return prev;
      const newBricks = prev.bricks.map((b) => {
        const u = updates.find((x) => x.id === b.id);
        return u ? { ...b, position: u.position } : b;
      });
      return { ...prev, bricks: newBricks };
    });

    try {
      await reorderDocumentBricks(docId, updates, accessToken);
    } catch (e) {
      console.error(e);
      fetchDoc(); // Rollback on error
    }
  };

  const handleCrossContainerDrop = async (activeId: string, overId: string) => {
    if (!accessToken || !document) return;
    const activeBrick = document.bricks.find(b => b.id === activeId);
    if (!activeBrick) return;

    const overBrick = document.bricks.find((b) => b.id === overId);
    const sourceRef = document.bricks
      .map((parent) => {
        const map = parent.content?.childrenByContainer as Record<string, string[]> | undefined;
        if (!map) return null;
        for (const [containerId, ids] of Object.entries(map)) {
          if (Array.isArray(ids) && ids.includes(activeId)) return { parentId: parent.id, containerId };
        }
        return null;
      })
      .find(Boolean) as { parentId: string; containerId: string } | undefined;

    let targetRef: { parentId: string; containerId: string } | null = null;
    if (overId.includes(":")) {
      const [parentId, containerId] = overId.split(":");
      if (parentId && containerId) targetRef = { parentId, containerId };
    } else if (overBrick) {
      const nestedOver = document.bricks
        .map((parent) => {
          const map = parent.content?.childrenByContainer as Record<string, string[]> | undefined;
          if (!map) return null;
          for (const [containerId, ids] of Object.entries(map)) {
            if (Array.isArray(ids) && ids.includes(overBrick.id)) return { parentId: parent.id, containerId };
          }
          return null;
        })
        .find(Boolean) as { parentId: string; containerId: string } | undefined;
      if (nestedOver) targetRef = nestedOver;
    }

    if (!sourceRef && !targetRef) return;

    const updates: Array<{ parentId: string; content: Record<string, any> }> = [];
    const nextById = new Map(document.bricks.map((b) => [b.id, b]));

    if (sourceRef) {
      const sourceParent = nextById.get(sourceRef.parentId);
      if (sourceParent) {
        const sourceIds = getContainerChildIds(sourceParent.content, sourceRef.containerId).filter((id) => id !== activeId);
        const nextContent = setContainerChildIds(sourceParent.content, sourceRef.containerId, sourceIds);
        updates.push({ parentId: sourceParent.id, content: nextContent });
        nextById.set(sourceParent.id, { ...sourceParent, content: nextContent });
      }
    }

    if (targetRef) {
      const targetParent = nextById.get(targetRef.parentId);
      if (targetParent) {
        const targetIds = getContainerChildIds(targetParent.content, targetRef.containerId).filter((id) => id !== activeId);
        const insertAt = overBrick ? Math.max(0, targetIds.indexOf(overBrick.id) + 1) : targetIds.length;
        targetIds.splice(insertAt, 0, activeId);
        const nextContent = setContainerChildIds(targetParent.content, targetRef.containerId, targetIds);
        const existing = updates.find((u) => u.parentId === targetParent.id);
        if (existing) existing.content = nextContent;
        else updates.push({ parentId: targetParent.id, content: nextContent });
      }
    }

    setDocument((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        bricks: prev.bricks.map((b) => {
          const hit = updates.find((u) => u.parentId === b.id);
          return hit ? { ...b, content: hit.content } : b;
        }),
      };
    });

    try {
      for (const update of updates) {
        await updateDocumentBrick(docId, update.parentId, update.content, accessToken);
      }
    } catch (e) {
      toast(t("brickError") || "Error moving brick", "error");
      fetchDoc();
    }
  };

  const handleUploadMediaFiles = useCallback(async ({
    brickId,
    files,
  }: {
    brickId: string;
    files: File[];
  }) => {
    if (!accessToken || !document || files.length === 0) return;

    const target = document.bricks.find((brick) => brick.id === brickId);
    if (!target) return;

    if (target.kind !== 'image' && target.kind !== 'media' && target.kind !== 'file') {
      return;
    }

    const fallback: MediaCarouselItem = {
      url: target.content?.url || '',
      title: target.content?.title || '',
      mimeType: target.content?.mimeType || null,
      sizeBytes: target.content?.sizeBytes || null,
      assetId: target.content?.assetId || null,
    };

    const existingMeta = parseMediaMeta(target.content?.caption, fallback);

    const uploadedItems = await uploadFilesAsMediaItems({
      files,
      accessToken,
      uploadFile,
      onUploadError: (err) => {
        console.error('Failed to upload media file for document brick', err);
        toast('No se pudo subir uno de los archivos. Se mostrara localmente en esta sesion.', 'error');
      },
      allowLocalBlobFallback: true,
    });

    if (uploadedItems.length === 0) {
      toast(t("createBlockError"), "error");
      return;
    }

    const nextItems = [...existingMeta.items.filter((it: MediaCarouselItem) => it.url), ...uploadedItems];
    const first = nextItems[0];

    const updatedBrick = await updateDocumentBrick(docId, brickId, {
      ...target.content,
      mediaType: first?.mimeType?.startsWith('image/') ? 'image' : 'file',
      title: first?.title || target.content?.title || 'Media',
      url: first?.url || target.content?.url || '',
      mimeType: first?.mimeType || null,
      sizeBytes: first?.sizeBytes || null,
      assetId: first?.assetId || null,
      caption: buildMediaCaption({ subtitle: existingMeta.subtitle || '', items: nextItems }),
    }, accessToken);

    setDocument((current) => {
      if (!current) return current;
      return {
        ...current,
        bricks: current.bricks.map((brick) => (
          brick.id === brickId ? updatedBrick : brick
        )),
      };
    });
  }, [accessToken, docId, document, t]);

  const handlePasteImageInTextBrick = useCallback(async ({
    brickId,
    file,
    cursorOffset,
    markdown,
  }: {
    brickId: string;
    file: File;
    cursorOffset: number;
    markdown: string;
  }) => {
    if (process.env.NODE_ENV !== 'production') {
      console.log('[DocumentTextPaste] start', {
        brickId,
        fileName: file?.name,
        fileType: file?.type,
        fileSize: file?.size,
        cursorOffset,
        markdownLength: markdown?.length ?? 0,
      });
    }

    if (!accessToken || !document) return;

    const targetIndex = document.bricks.findIndex((brick) => brick.id === brickId);
    if (targetIndex < 0) return;

    const target = document.bricks[targetIndex];
    if (target.kind !== 'text') return;

    const sourceMarkdown = typeof markdown === 'string'
      ? markdown
      : String(target.content?.markdown ?? target.content?.text ?? '');
    const safeCursor = Math.max(0, Math.min(cursorOffset, sourceMarkdown.length));
    const beforeText = sourceMarkdown.slice(0, safeCursor);
    const afterText = sourceMarkdown.slice(safeCursor);
    const isAtStart = safeCursor === 0;
    const isAtEnd = safeCursor >= sourceMarkdown.length;
    const isAtMiddle = !isAtStart && !isAtEnd;

    try {
      const uploaded = await uploadFile(file, accessToken);
      if (process.env.NODE_ENV !== 'production') {
        console.log('[DocumentTextPaste] upload complete', {
          url: uploaded.url,
          key: uploaded.key,
        });
      }

      const mediaContent = {
        mediaType: 'image',
        title: (file.name || 'Imagen').trim() || 'Imagen',
        url: uploaded.url,
        mimeType: file.type || null,
        sizeBytes: file.size || null,
        caption: '',
        assetId: uploaded.key,
      };

      if (isAtMiddle) {
        const updatedTextBrick = await updateDocumentBrick(docId, brickId, {
          ...target.content,
          text: beforeText,
          markdown: beforeText,
        }, accessToken);

        const mediaBrick = await createDocumentBrick(docId, {
          kind: 'image',
          position: target.position + 0.5,
          content: mediaContent,
        }, accessToken);

        const afterBrick = afterText.length > 0
          ? await createDocumentBrick(docId, {
              kind: 'text',
              position: target.position + 1,
              content: { text: afterText, markdown: afterText },
            }, accessToken)
          : null;

        setDocument((current) => {
          if (!current) return current;
          const merged = current.bricks
            .map((brick) => (brick.id === brickId ? updatedTextBrick : brick))
            .concat([mediaBrick, ...(afterBrick ? [afterBrick] : [])]);
          const nextBricks = Array.from(new Map(merged.map((brick) => [brick.id, brick])).values())
            .sort((a, b) => a.position - b.position);
          return { ...current, bricks: nextBricks };
        });
      } else {
        const mediaBrick = await createDocumentBrick(docId, {
          kind: 'image',
          position: isAtStart ? target.position - 0.5 : target.position + 0.5,
          content: mediaContent,
        }, accessToken);

        setDocument((current) => {
          if (!current) return current;
          const merged = [...current.bricks, mediaBrick];
          const nextBricks = Array.from(new Map(merged.map((brick) => [brick.id, brick])).values())
            .sort((a, b) => a.position - b.position);
          return {
            ...current,
            bricks: nextBricks,
          };
        });
      }

      return;
    } catch (err) {
      console.error('Failed to paste image into document text brick', err);
      if (process.env.NODE_ENV !== 'production') {
        console.error('[DocumentTextPaste] failed', {
          brickId,
          fileName: file?.name,
        });
      }
      toast(t("createBlockError"), "error");
      return;
    }
  }, [accessToken, docId, document, t]);

  const handleExport = async () => {
    if (!accessToken || !document) return;
    setIsExporting(true);
    try {
      const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
      const url = `${API_BASE_URL}/documents/${docId}/export?format=${exportFormat}&style=${exportStyle}&paperSize=${exportSize}`;
      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      if (!res.ok) throw new Error("Error en la exportación");

      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = window.document.createElement('a');
      a.href = downloadUrl;
      a.download = `${document.title || 'Document'}.${exportFormat}`;
      window.document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(downloadUrl);
      
      toast("Exportación completada", "success");
      setIsExportModalOpen(false);
    } catch (e: any) {
      toast(e.message || "Error al exportar", "error");
    } finally {
      setIsExporting(false);
    }
  };

  const handleUpdateTitle = async () => {
    if (!accessToken || !document || !tempTitle.trim()) {
      setIsEditingTitle(false);
      return;
    }
    const originalTitle = document.title;
    setDocument(prev => prev ? { ...prev, title: tempTitle } : null);
    setIsEditingTitle(false);
    try {
      await updateDocumentTitle(docId, tempTitle, accessToken);
    } catch (e) {
      setDocument(prev => prev ? { ...prev, title: originalTitle } : null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !document) {
    return (
      <div className="flex h-full flex-col items-center justify-center">
        <FileText className="h-12 w-12 text-muted-foreground/50 mb-4" />
        <h2 className="text-xl font-semibold">{t("notFoundTitle")}</h2>
        <p className="text-muted-foreground mt-2 mb-6">{error || t("notFoundDescription")}</p>
        <Link href="/" className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors">
          {t("returnDashboard")}
        </Link>
      </div>
    );
  }

  const canEdit = document.role === 'owner' || document.role === 'editor';
  const canManageDocument = document.role === 'owner';

  // Build breadcrumb path
  const getBreadcrumbs = () => {
    if (!document.folderId) return null;
    const breadcrumbs = [];
    let currentId = document.folderId;
    while (currentId) {
      const f = folders.find(folder => folder.id === currentId);
      if (f) {
        breadcrumbs.unshift(f);
        currentId = f.parentFolderId || "";
      } else {
        break;
      }
    }
    return breadcrumbs;
  };
  const docBreadcrumbs = getBreadcrumbs();

  return (
    <div className="flex flex-col h-full bg-background relative overflow-hidden">
      {/* Header */}
      <header className="flex h-14 items-center justify-between border-b border-border bg-card/50 px-4 backdrop-blur-md z-40 shrink-0 shadow-sm sticky top-0">
<div className="flex items-center space-x-2">
            <Link href={`/d${document.folderId ? `?folderId=${document.folderId}` : ''}`} className="text-muted-foreground hover:text-foreground hover:bg-accent/10 p-1.5 rounded-md transition-colors group">
              <ArrowLeft className="h-4 w-4 group-hover:-translate-x-1 transition-transform" />
            </Link>
            <div className="h-4 w-px bg-border/80 mx-2"></div>

            <div className="flex items-center text-sm">
              <Link href="/d" className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors mr-2">
                 <FolderIcon className="h-4 w-4 opacity-70" />
                 <span className="hidden sm:inline">{t("allDocuments") || "Todos los documentos"}</span>
              </Link>

              {docBreadcrumbs && docBreadcrumbs.map((f, i) => (
                <div key={f.id} className="flex items-center">
                  <span className="text-muted-foreground/40 mx-1">/</span>
                  <Link 
                    href={`/d?folderId=${f.id}`}
                    className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground hover:bg-accent/10 px-1.5 py-1 rounded-md transition-colors" 
                    title={f.name}
                  >
                    <FolderIconDisplay icon={f.icon} color={f.color} className="h-3.5 w-3.5" isTextFallback />
                    <span className="hidden sm:inline max-w-[100px] truncate">{f.name}</span>
                  </Link>
                </div>
              ))}

              <span className="text-muted-foreground/40 mx-2.5">/</span>
              <div className="flex items-center gap-1.5 text-foreground bg-accent/5 px-2 py-1 rounded-md">
                <FileText className="h-4 w-4 text-accent" />
                <h1 className="font-semibold tracking-tight truncate max-w-[150px] sm:max-w-[200px]">{document.title}</h1>
              </div>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          {/* Presence */}
          <div className="flex -space-x-1.5 mr-2">
            {presenceMembers.map((member) => (
              <img
                key={member.clientId}
                src={getUserAvatarUrl(member.data.avatar_url, member.data.email, 24)}
                alt={member.data.displayName}
                title={t("presenceViewing", { name: member.data.displayName })}
                className="h-6 w-6 rounded-full border border-background ring-1 ring-border/50 object-cover bg-muted"
              />
            ))}
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSidebarTab('copilot');
              setIsCommentsOpen(true);
            }}
            className={cn("h-8 gap-2 text-xs font-semibold", isCommentsOpen && sidebarTab === 'copilot' && "bg-accent/10 text-accent")}
          >
            <Sparkles className="h-3.5 w-3.5" />
            {t("header.copilot")}
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSidebarTab('comments');
              setIsCommentsOpen(true);
            }}
            className={cn("h-8 gap-2 text-xs font-semibold", isCommentsOpen && sidebarTab === 'comments' && "bg-accent/10 text-accent")}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            {t("header.comments")}
          </Button>

          <Button variant="ghost" size="sm" onClick={() => setIsExportModalOpen(true)} className="h-8 gap-2 text-xs font-semibold">
            <Download className="h-3.5 w-3.5" />
            Descargar
          </Button>

          {canManageDocument && (
            <Button variant="ghost" size="sm" onClick={() => setIsShareModalOpen(true)} className="h-8 gap-2 text-xs font-semibold">
              <Share2 className="h-3.5 w-3.5" />
              {t("header.share")}
            </Button>
          )}

          <div className="h-7 w-7 rounded-full ring-2 ring-background bg-gradient-to-tr from-accent to-primary/60 flex items-center justify-center text-[10px] font-bold text-white shadow-sm" title={user?.alias || user?.name || "Usuario"}>
            {(user?.alias || user?.name || "U").charAt(0).toUpperCase()}
          </div>
        </div>
      </header>

      {/* Export Modal Backdrop */}
      {isExportModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/60 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={() => setIsExportModalOpen(false)}>
          <div className="bg-card w-full max-w-sm border border-border shadow-2xl rounded-xl overflow-hidden p-6 animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Download className="h-5 w-5 text-accent" />
                Exportar o Imprimir
              </h2>
              <button onClick={() => setIsExportModalOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Formato de Exportación</label>
                <div className="flex gap-2">
                  <Button variant={exportFormat === 'pdf' ? 'default' : 'outline'} className="flex-1" onClick={() => setExportFormat('pdf')}>PDF</Button>
                  <Button variant={exportFormat === 'docx' ? 'default' : 'outline'} className="flex-1" onClick={() => setExportFormat('docx')}>Word (DOCX)</Button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Estilo Visual</label>
                <div className="flex gap-2">
                  <Button variant={exportStyle === 'carta' ? 'default' : 'outline'} className="flex-1 text-xs px-2" onClick={() => setExportStyle('carta')}>Reporte Técnico</Button>
                  <Button variant={exportStyle === 'harvard' ? 'default' : 'outline'} className="flex-1 text-xs px-2" onClick={() => setExportStyle('harvard')}>Estilo Harvard</Button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Tamaño de Hoja</label>
                <div className="flex gap-2">
                  <Button variant={exportSize === 'A4' ? 'default' : 'outline'} className="flex-1" onClick={() => setExportSize('A4')}>A4</Button>
                  <Button variant={exportSize === 'letter' ? 'default' : 'outline'} className="flex-1" onClick={() => setExportSize('letter')}>Carta</Button>
                </div>
              </div>
            </div>

            <div className="mt-8 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setIsExportModalOpen(false)}>Cancelar</Button>
              <Button onClick={handleExport} disabled={isExporting}>
                {isExporting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Download className="w-4 h-4 mr-2" />}
                Descargar Documento
              </Button>
            </div>
          </div>
        </div>
      )}

      <DocumentShareModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        documentId={docId}
        documentName={document.title}
        initialVisibility={document.visibility}
        accessToken={accessToken!}
      />

      {/* Editor Content Area */}
      <main className="flex-1 overflow-y-auto w-full flex justify-center py-10 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl w-full">
          {isEditingTitle ? (
            <div className="flex items-center gap-2 mb-8 animate-in slide-in-from-left-2 duration-200">
              <Input
                autoFocus
                value={tempTitle}
                onChange={(e: any) => setTempTitle(e.target.value)}
                onBlur={handleUpdateTitle}
                onKeyDown={(e: any) => e.key === 'Enter' && handleUpdateTitle()}
                className="text-4xl md:text-5xl h-auto py-2 font-bold tracking-tight bg-transparent border-none focus-visible:ring-0 px-0"
              />
              <Button size="icon" variant="ghost" className="h-10 w-10 text-accent" onClick={handleUpdateTitle}>
                <Check className="h-6 w-6" />
              </Button>
            </div>
          ) : (
            <h1
              onClick={() => {
                if (canEdit) {
                  setTempTitle(document.title);
                  setIsEditingTitle(true);
                }
              }}
              className={`text-4xl md:text-5xl font-bold tracking-tight mb-8 text-foreground pb-4 border-b border-border/50 group cursor-pointer hover:border-accent/40 transition-colors ${!canEdit && 'cursor-default'}`}
            >
              {document.title}
              {canEdit && (
                <span className="ml-4 opacity-0 group-hover:opacity-30 transition-opacity text-xl font-normal text-muted-foreground whitespace-nowrap">{t("title.editHint")}</span>
              )}
            </h1>
          )}

          <div className="pb-32">
            <UnifiedBrickList
              bricks={document.bricks.filter((b) => getTopLevelBrickIds(document.bricks).has(b.id))}
              activeBricks={document.bricks}
              canEdit={canEdit}
              documents={teamDocs}
              boards={teamBoards}
              users={teamMembers}
              addableKinds={['text', 'table', 'database', 'graph', 'checklist', 'accordion', 'tabs', 'columns', 'image', 'video', 'audio', 'file', 'code', 'bookmark', 'math', 'form']}
              onAddBrick={handleAddBrick}
              onUpdateBrick={handleUpdateBrick}
              onPatchCell={handlePatchBrickCell}
              onPatchColumn={handlePatchBrickColumn}
              onDeleteBrick={handleDeleteBrick}
              onReorderBricks={handleReorderBricks}
              onCrossContainerDrop={handleCrossContainerDrop}
              onPasteImageInTextBrick={handlePasteImageInTextBrick}
              onUploadMediaFiles={handleUploadMediaFiles}
              onAiAction={handleAiAction}
            />
          </div>
        </div>
      </main>

      <DocumentCommentsDrawer
        isOpen={isCommentsOpen}
        onClose={() => setIsCommentsOpen(false)}
        docId={docId}
        documents={teamDocs}
        boards={teamBoards}
        folders={folders}
        members={teamMembers}
        initialTab={sidebarTab}
        initialAiInput={aiInitialInput}
        onAiInputClear={() => setAiInitialInput("")}
        bricks={document?.bricks ?? []}
      />
    </div>
  );
}

}