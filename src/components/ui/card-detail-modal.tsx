"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { X, AlignLeft, Image as ImageIcon, CheckSquare, MessageSquare, Plus, GripVertical, FileText, CornerDownRight, Calendar, AlertCircle, Tag as TagIcon, Users, UserPlus } from "lucide-react";
import { updateCard, addCardTag, removeCardTag, createCardBrick, updateCardBrick, deleteCardBrick, reorderCardBricks, createCard, getTagsByScope, getBoardMembers } from "../../lib/api/contracts";
import type { BoardBrick } from "../../lib/api/contracts";
import { useSession } from "../providers/session-provider";

import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

function SortableBrickItem({
  block,
  handleCreateBlock,
  handleUpdateBlockContent,
  handleBlockKeyDown,
  handleDeleteBlock
}: any) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: block.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 1,
    opacity: isDragging ? 0.8 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="group relative flex items-start -ml-8 pl-8">
      {/* Block Drag Handle (Hover) */}
      <div className="absolute left-0 top-1.5 opacity-0 group-hover:opacity-100 flex items-center space-x-1 transition-opacity text-muted-foreground bg-background rounded border border-border shadow-sm">
        <button className="hover:bg-accent/10 rounded p-1" onClick={() => handleCreateBlock()}><Plus className="h-4 w-4" /></button>
        <button className="hover:bg-accent/10 rounded p-1 cursor-grab" {...attributes} {...listeners}><GripVertical className="h-4 w-4" /></button>
      </div>

      {/* Block Content Render */}
      <div className="flex-1 min-h-[1.5rem] py-1 outline-none text-foreground/90 leading-relaxed group-focus-within:bg-accent/5 rounded px-2 -mx-2 transition-colors">
        {block.kind === "text" && (
          <textarea
            className="w-full bg-transparent border-none resize-none outline-none focus:ring-0 p-0 m-0 overflow-hidden break-words"
            value={block.markdown}
            onChange={(e) => {
              e.target.style.height = 'auto';
              e.target.style.height = `${e.target.scrollHeight}px`;
              handleUpdateBlockContent(block.id, e.target.value);
            }}
            onKeyDown={(e) => handleBlockKeyDown(e, block.id, block.markdown)}
            rows={1}
          />
        )}
        {block.kind === "media" && block.mediaType === "image" && (
          <div className="my-4 relative rounded-lg overflow-hidden border border-border group/img">
            <img src={block.url || ""} alt={block.title || "Block image"} className="w-full h-auto object-cover" />
            <div className="absolute top-2 right-2 opacity-0 group-hover/img:opacity-100 flex gap-2 transition-opacity">
              <button 
                className="bg-red-500/80 hover:bg-red-500 text-white backdrop-blur text-xs px-2 py-1 rounded border border-red-500/50"
                onClick={() => handleDeleteBlock(block.id)}
              >
                Delete
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function CardDetailModal({ 
  isOpen, 
  onClose, 
  card,
  listId,
  listName,
  boardName,
  boardId
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  card?: any;
  listId?: string;
  listName?: string;
  boardName?: string;
  boardId?: string;
}) {
  const { accessToken } = useSession();
  const [localTitle, setLocalTitle] = useState(card?.title || "");
  const [localSummary, setLocalSummary] = useState(card?.summary || "");
  const [localDueAt, setLocalDueAt] = useState(card?.dueAt || "");
  const [localUrgency, setLocalUrgency] = useState(card?.urgency || "normal");
  const [localTags, setLocalTags] = useState<any[]>(card?.tags || []);
  const [localAssignees, setLocalAssignees] = useState<any[]>(card?.assignees || []);
  const [blocks, setBlocks] = useState<BoardBrick[]>(card?.blocks || []);
  
  const [isTagDropdownOpen, setIsTagDropdownOpen] = useState(false);
  const [isAssigneeDropdownOpen, setIsAssigneeDropdownOpen] = useState(false);
  const [tagSearch, setTagSearch] = useState("");
  const [activeTab, setActiveTab] = useState<'comments' | 'activity'>('comments');

  const [availableTags, setAvailableTags] = useState<any[]>([]);
  const [boardMembers, setBoardMembers] = useState<any[]>([]);

  useEffect(() => {
    if (isOpen && boardId && accessToken) {
      getTagsByScope('board', boardId, accessToken).then((res) => {
        setAvailableTags(res);
      }).catch(console.error);

      getBoardMembers(boardId, accessToken).then((res) => {
        setBoardMembers(res.map((m: any) => ({
          id: m.userId,
          name: m.userEmail, // Mock initials/names for UI
          initials: m.userEmail.substring(0, 2).toUpperCase()
        })));
      }).catch(console.error);
    }
  }, [isOpen, boardId, accessToken]);

  useEffect(() => {
    if (isOpen && card) {
      setLocalTitle(card.title || "");
      setLocalSummary(card.summary || "");
      setLocalDueAt(card.dueAt || "");
      setLocalUrgency(card.urgency || "normal");
      setLocalTags(card.tags || []);
      setLocalAssignees(card.assignees || []);
      
      const sortedBlocks = (card.blocks || []).sort((a: any, b: any) => (a.position || 0) - (b.position || 0));
      setBlocks(sortedBlocks);
    }
  }, [isOpen, card]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = blocks.findIndex((b) => b.id === active.id);
      const newIndex = blocks.findIndex((b) => b.id === over.id);
      
      const newBlocks = arrayMove(blocks, oldIndex, newIndex);
      setBlocks(newBlocks);

      if (card?.id && accessToken) {
        try {
          const brickIds = newBlocks.map(b => b.id);
          const mockClientId = `reorder-${Date.now()}`;
          await reorderCardBricks(card.id, { clientId: mockClientId, brickIds }, accessToken);
        } catch (err) {
          console.error("Failed to reorder logic", err);
        }
      }
    }
  };

  const handleAddTag = async (tag: any) => {
    if (localTags.find(t => (t.id || t.name || t) === tag.id || (t.name || t) === tag.name)) return;
    setLocalTags(prev => [...prev, tag]);
    setIsTagDropdownOpen(false);
    if (card?.id && accessToken) {
      try {
        await addCardTag(card.id, tag.id, accessToken);
      } catch (err) {
        console.error("Failed to add tag", err);
      }
    }
  };

  const handleRemoveTag = async (tagToRemove: any) => {
    setLocalTags(prev => prev.filter(t => t !== tagToRemove));
    if (card?.id && accessToken && tagToRemove.id) {
      try {
        await removeCardTag(card.id, tagToRemove.id, accessToken);
      } catch (err) {
        console.error("Failed to remove tag", err);
      }
    }
  };

  const toggleAssignee = async (user: any) => {
    const isAssigned = localAssignees.find(a => a.id === user.id);
    if (isAssigned) {
      setLocalAssignees(prev => prev.filter(a => a.id !== user.id));
      // TODO: Call removeAssignee contract if/when available
    } else {
      setLocalAssignees(prev => [...prev, user]);
      // TODO: Call addAssignee contract if/when available
    }
  };

  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

  const handleUpdateField = useCallback((field: string, value: any) => {
    if (field === 'title') setLocalTitle(value);
    if (field === 'summary') setLocalSummary(value);
    if (field === 'due_at') setLocalDueAt(value);
    if (field === 'urgency_state') setLocalUrgency(value);

    if (!card?.id) return;

    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    
    debounceTimer.current = setTimeout(async () => {
      try {
        await updateCard(card.id, { [field]: value }, accessToken);
      } catch (err) {
        console.error("Failed to update card", err);
      }
    }, 500);
  }, [card?.id, accessToken]);

  const updateBrickDebounceTimer = useRef<Record<string, NodeJS.Timeout>>({});

  const handleCreateBlock = async () => {
    const optimisticId = `temp-${Date.now()}`;
    const newBrick: BoardBrick = { 
      id: optimisticId, 
      kind: 'text', 
      displayStyle: 'paragraph', 
      markdown: '', 
      position: blocks.length, 
      parentBlockId: null,
      tasks: []
    } as BoardBrick;
    
    setBlocks(prev => [...prev, newBrick]);

    if (!card?.id || !accessToken) return;
    
    try {
      const res = await createCardBrick(card.id, { kind: 'text', displayStyle: 'paragraph', markdown: '' }, accessToken);
      setBlocks(prev => prev.map(b => b.id === optimisticId ? res.brick : b));
    } catch (err) {
      console.error("Failed to create block", err);
      setBlocks(prev => prev.filter(b => b.id !== optimisticId));
    }
  };

  const handleUpdateBlockContent = (brickId: string, newContent: string) => {
    setBlocks(prev => prev.map(b => {
      if (b.id === brickId && b.kind === 'text') {
        return { ...b, markdown: newContent };
      }
      return b;
    }));

    if (!card?.id || !accessToken) return;

    if (updateBrickDebounceTimer.current[brickId]) {
      clearTimeout(updateBrickDebounceTimer.current[brickId]);
    }

    updateBrickDebounceTimer.current[brickId] = setTimeout(async () => {
      try {
        await updateCardBrick(card.id, brickId, { kind: 'text', displayStyle: 'paragraph', markdown: newContent }, accessToken);
      } catch (err) {
        console.error("Failed to update block", err);
      }
    }, 500);
  };

  const handleDeleteBlock = async (brickId: string) => {
    setBlocks(prev => prev.filter(b => b.id !== brickId));
    if (!card?.id || !accessToken || brickId.startsWith("temp-")) return;
    try {
      await deleteCardBrick(card.id, brickId, accessToken);
    } catch (err) {
      console.error("Failed to delete block", err);
    }
  };

  const handleBlockKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>, brickId: string, content: string) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleCreateBlock();
    } else if (e.key === 'Backspace' && content === '') {
      e.preventDefault();
      handleDeleteBlock(brickId);
    }
  };

  const submitCreate = async () => {
    if (!listId || !accessToken) return;
    try {
      const newCard = await createCard({
        listId,
        title: localTitle || "New Card",
        summary: localSummary,
        dueAt: localDueAt || undefined,
        urgency: localUrgency,
        tags: localTags.map(t => t.id),
        assignees: localAssignees.map(a => a.id)
      }, accessToken);

      // Save blocks sequentially
      if (blocks.length > 0) {
        for (let i = 0; i < blocks.length; i++) {
          await createCardBrick(newCard.id, {
            kind: blocks[i].kind as 'text'|'media', 
            displayStyle: blocks[i].displayStyle as any, 
            markdown: blocks[i].markdown 
          } as any, accessToken);
        }
      }

      onClose(); // Then it can refresh or reload implicitly.
      window.location.reload();
    } catch (err) {
      console.error("Failed to create card", err);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4 sm:p-6 overflow-y-auto">
      <div className="relative w-full max-w-5xl rounded-xl border border-border bg-background shadow-2xl flex flex-col max-h-[95vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border bg-card/50">
          <div className="flex items-center space-x-2 text-sm text-muted-foreground">
              <span className="hover:text-foreground cursor-pointer transition-colors">{boardName || "Board"}</span>
              <span className="text-border">/</span>
              <span className="hover:text-foreground cursor-pointer transition-colors">{listName || "List"}</span>
            <span className="text-border">/</span>
            <span className="font-semibold text-foreground truncate max-w-[200px]">{localTitle || card?.title || "Untitled Card"}</span>
          </div>
          <div className="flex items-center space-x-2">
            {!card?.id && (
              <button
                onClick={submitCreate}
                className="bg-primary text-primary-foreground hover:bg-primary/90 px-3 py-1 rounded text-sm font-medium transition-colors"
              >
                Create
              </button>
            )}
            <button
              onClick={onClose}
              className="rounded-full p-1.5 hover:bg-accent/10 hover:text-foreground transition-colors text-muted-foreground"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content Body - Split View */}
        <div className="flex flex-1 overflow-hidden flex-col md:flex-row">
          
          {/* Main Notion Body */}
          <div className="flex-1 overflow-y-auto p-6 md:p-10 hide-scrollbar border-r border-border min-h-[500px]">
            <div className="max-w-2xl mx-auto space-y-6">
              
              {/* Title Area */}
              <div className="group relative">
                <h1 
                  className="text-3xl md:text-3xl font-bold tracking-tight text-foreground outline-none border-l-2 border-transparent focus:border-accent pl-2 -ml-2 transition-colors" 
                  contentEditable 
                  suppressContentEditableWarning
                  onBlur={(e) => handleUpdateField('title', e.currentTarget.textContent || "")}
                >
                  {localTitle}
                </h1>
                
                {/* Metadata Fields */}
                <div className="flex flex-wrap items-center gap-4 mt-4 text-sm text-muted-foreground border-b border-border/50 pb-4">
                  <div className="flex items-center space-x-2">
                    <AlertCircle className="w-4 h-4" />
                    <select 
                      value={localUrgency} 
                      onChange={(e) => handleUpdateField('urgency_state', e.target.value)}
                      className="bg-transparent border-none text-sm outline-none focus:ring-1 focus:ring-accent rounded px-1"
                    >
                      <option value="normal">Normal</option>
                      <option value="urgent">Urgent</option>
                    </select>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Calendar className="w-4 h-4" />
                    <input 
                      type="date" 
                      value={localDueAt}
                      onChange={(e) => handleUpdateField('due_at', e.target.value)}
                      className="bg-transparent border-none text-sm outline-none focus:ring-1 focus:ring-accent rounded px-1 text-muted-foreground"
                    />
                  </div>

                  {/* Assignees Area */}
                  <div className="flex items-center space-x-2 relative ml-auto">
                    <Users className="w-4 h-4" />
                    <div className="flex -space-x-2 overflow-hidden">
                      {localAssignees.map(user => (
                        <div key={user.id} className="inline-block h-6 w-6 rounded-full border-2 border-background bg-accent flex items-center justify-center text-[10px] font-bold text-foreground" title={user.name}>
                          {user.initials || user.name.substring(0,2).toUpperCase()}
                        </div>
                      ))}
                    </div>
                    <button 
                      onClick={() => setIsAssigneeDropdownOpen(!isAssigneeDropdownOpen)}
                      className="h-6 w-6 rounded-full border border-dashed border-border flex items-center justify-center hover:bg-accent/10 transition-colors ml-1"
                      title="Add Assignee"
                    >
                      <UserPlus className="h-3 w-3" />
                    </button>

                    {isAssigneeDropdownOpen && (
                      <div className="absolute top-full right-0 mt-1 w-48 bg-card border border-border rounded-md shadow-lg z-10 overflow-hidden">
                        <div className="p-2 border-b border-border text-xs font-semibold">Assign to...</div>
                        <div className="max-h-40 overflow-y-auto p-1">
                            {boardMembers.map(user => {
                            const isSelected = localAssignees.some(a => a.id === user.id);
                            return (
                              <button
                                key={user.id}
                                onClick={() => toggleAssignee(user)}
                                className="w-full text-left px-2 py-1.5 text-xs hover:bg-accent/10 rounded flex items-center justify-between text-foreground/90"
                              >
                                <div className="flex items-center space-x-2">
                                  <div className="h-5 w-5 rounded-full bg-accent flex items-center justify-center text-[9px] font-bold">
                                    {user.initials}
                                  </div>
                                  <span>{user.name}</span>
                                </div>
                                {isSelected && <CheckSquare className="h-3 w-3 text-primary" />}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-4">
                  <textarea 
                    value={localSummary}
                    onChange={(e) => handleUpdateField('summary', e.target.value)}
                    placeholder="Add a description..."
                    className="w-full bg-transparent border-none resize-none outline-none focus:ring-1 focus:ring-accent rounded p-2 text-foreground/80 placeholder:text-muted-foreground min-h-[60px]"
                  />
                </div>

                {/* Tags Area */}
                <div className="flex items-center flex-wrap gap-2 mt-2 text-sm text-muted-foreground">
                  {localTags.map((tag: any) => (
                    <span key={tag.id || tag.name || tag} className="bg-primary/10 text-foreground/80 px-2 py-0.5 rounded text-[10px] font-semibold tracking-wider uppercase flex items-center space-x-1 group">
                      <span>{tag.name || tag}</span>
                      <button 
                        onClick={() => handleRemoveTag(tag)}
                        className="opacity-0 group-hover:opacity-100 hover:text-red-500 transition-opacity"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                  
                  <div className="relative">
                    <button 
                      onClick={() => setIsTagDropdownOpen(prev => !prev)}
                      className="flex items-center space-x-1 border border-dashed border-border px-2 py-0.5 rounded text-[10px] uppercase font-semibold text-muted-foreground hover:bg-accent/5 hover:text-foreground transition-colors"
                    >
                      <Plus className="h-3 w-3" />
                      <span>Add Tag</span>
                    </button>
                    
                    {isTagDropdownOpen && (
                      <div className="absolute top-full left-0 mt-1 w-48 bg-card border border-border rounded-md shadow-lg z-10 overflow-hidden">
                        <div className="p-2 border-b border-border">
                          <input
                            type="text"
                            placeholder="Search tags..."
                            value={tagSearch}
                            onChange={e => setTagSearch(e.target.value)}
                            className="w-full bg-transparent border border-border rounded px-2 py-1 text-xs outline-none focus:border-accent text-foreground"
                            autoFocus
                          />
                        </div>
                        <div className="max-h-40 overflow-y-auto p-1">
                            {availableTags.filter(t => t.name.toLowerCase().includes(tagSearch.toLowerCase())).map(tag => (
                            <button
                              key={tag.id}
                              onClick={() => handleAddTag(tag)}
                              className="w-full text-left px-2 py-1.5 text-xs hover:bg-accent/10 rounded flex items-center space-x-2 text-foreground/90"
                            >
                              <TagIcon className="h-3 w-3 text-muted-foreground" />
                              <span>{tag.name}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Notion Bricks / Blocks DnD Context */}
              <div className="mt-8 space-y-2 pb-12">
                <DndContext 
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext 
                    items={blocks.map(b => b.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {blocks.map((block) => (
                      <SortableBrickItem 
                        key={block.id} 
                        block={block} 
                        handleCreateBlock={handleCreateBlock}
                        handleUpdateBlockContent={handleUpdateBlockContent}
                        handleBlockKeyDown={handleBlockKeyDown}
                        handleDeleteBlock={handleDeleteBlock}
                      />
                    ))}
                  </SortableContext>
                </DndContext>

                {/* Empty placeholder for new block */}
                <div 
                  className="group relative flex items-center -ml-8 pl-8 mt-2 opacity-50 text-muted-foreground hover:opacity-100 transition-opacity cursor-text"
                  onClick={() => handleCreateBlock()}
                >
                  <div className="absolute left-2 top-1.5 opacity-0 group-hover:opacity-100"><Plus className="h-4 w-4" /></div>
                  <div className="flex-1 py-1 px-2 -mx-2 text-sm italic">
                    Type '/' for commands or click to start typing...
                  </div>
                </div>
              </div>

            </div>
          </div>

          {/* Right Sidebar - Comments & Activity */}
          <div className="w-full md:w-80 flex flex-col bg-card/20 border-t md:border-t-0 z-10">
            <div className="p-4 border-b border-border flex space-x-6 text-sm font-medium shrink-0 bg-background/50 backdrop-blur-sm">
              <button 
                onClick={() => setActiveTab('comments')}
                className={`transition-colors flex items-center space-x-2 pb-1 ${activeTab === 'comments' ? 'text-foreground border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground'}`}
              >
                <MessageSquare className="h-4 w-4" />
                <span>Comments</span>
              </button>
              <button 
                onClick={() => setActiveTab('activity')}
                className={`transition-colors flex items-center space-x-2 pb-1 ${activeTab === 'activity' ? 'text-foreground border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground'}`}
              >
                <AlignLeft className="h-4 w-4" />
                <span>Activity</span>
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {activeTab === 'comments' ? (
                <>
                  <div className="text-sm text-muted-foreground text-center mt-10 p-4 border border-dashed border-border rounded-lg bg-background/50">
                    No comments yet. Start a discussion!
                  </div>
                  {/* Example placeholder comment bubble */}
                  {/* <div className="flex space-x-3 mt-4">
                    <div className="h-8 w-8 rounded-full bg-accent flex items-center justify-center font-bold text-xs shrink-0">JD</div>
                    <div className="bg-background border border-border p-3 rounded-lg rounded-tl-none text-sm space-y-1 w-full">
                      <div className="font-semibold text-xs">Jane Doe <span className="text-muted-foreground font-normal ml-2">2h ago</span></div>
                      <p>We need to refactor the database schema before landing this.</p>
                    </div>
                  </div> */}
                </>
              ) : (
                <div className="space-y-4 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-border before:to-transparent">
                  <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                    <div className="flex items-center justify-center w-4 h-4 rounded-full border border-primary bg-background shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow ml-3 md:ml-0"></div>
                    <div className="w-[calc(100%-3rem)] md:w-[calc(50%-1.5rem)] p-3 rounded-lg border border-border bg-background shadow-sm">
                      <div className="flex items-center justify-between space-x-2 mb-1">
                        <div className="font-bold text-xs">System</div>
                        <time className="text-xs text-muted-foreground">Today</time>
                      </div>
                      <div className="text-xs text-muted-foreground">Card created.</div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Input area for comments */}
            <div className="p-4 border-t border-border bg-background/50 shrink-0">
              <div className="relative">
                <textarea 
                  placeholder={activeTab === 'comments' ? "Write a comment..." : "Take a note..."}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 pr-10 text-sm outline-none focus:border-primary resize-none placeholder:text-muted-foreground"
                  rows={2}
                />
                <button className="absolute right-2 bottom-2 p-1.5 bg-primary text-primary-foreground rounded-md hover:opacity-90">
                  <CornerDownRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
          
        </div>

        {/* Action Sidebar / Footer for Mobile - simplified since we integrated into tabs/header */}
        {/* <div className="border-t border-border bg-card/30 p-2 flex items-center justify-between sm:hidden overflow-x-auto shrink-0 hide-scrollbar">
          ...
        </div> */}
        
      </div>
    </div>
  );
}
