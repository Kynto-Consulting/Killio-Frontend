"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { X, AlignLeft, Image as ImageIcon, CheckSquare, MessageSquare, Plus, GripVertical, FileText, CornerDownRight, Calendar, AlertCircle, Tag as TagIcon, Users, UserPlus } from "lucide-react";
import { updateCard, addCardTag, removeCardTag, createCardBrick, updateCardBrick, deleteCardBrick, reorderCardBricks, createCard, getTagsByScope, getBoardMembers, getCardActivity, addCardComment } from "../../lib/api/contracts";
import type { BoardBrick } from "../../lib/api/contracts";
import { useSession } from "../providers/session-provider";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

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

  const [isTagDropdownOpen, setIsTagDropdownOpen] = useState(false);
  const [isAssigneeDropdownOpen, setIsAssigneeDropdownOpen] = useState(false);
  const [tagSearch, setTagSearch] = useState("");
  const [activeTab, setActiveTab] = useState<'comments' | 'activity'>('comments');
  const [activities, setActivities] = useState<any[]>([]);
  const [newComment, setNewComment] = useState("");
  const router = useRouter();

  const [availableTags, setAvailableTags] = useState<any[]>([]);
  const [boardMembers, setBoardMembers] = useState<any[]>([]);
  const [isCreating, setIsCreating] = useState(false);

  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);

  const handleSaveDescription = async (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (editorRef.current) {
      const html = editorRef.current.innerHTML;
      setLocalSummary(html);
      setIsEditingDescription(false);
      
      if (card?.id && accessToken) {
        try {
          await updateCard(card.id, { summary: html === "" ? null : html }, accessToken);
          router.refresh();
      window.dispatchEvent(new Event('board:refresh'));

        } catch (err) {
          console.error("Failed to update summary", err);
        }
      }
    } else {
      setIsEditingDescription(false);
    }
  };

  const handlePasteDescription = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    let hasImage = false;
    for (const item of items) {
      if (item.type.indexOf('image') === 0) {
        hasImage = true;
        const blob = item.getAsFile();
        if (blob) {
          const reader = new FileReader();
          reader.onload = (event) => {
            const img = `<img src="${event.target?.result}" class="my-4 max-w-full rounded-lg border border-border" />`;
            document.execCommand('insertHTML', false, img);
          };
          reader.readAsDataURL(blob);
        }
      }
    }
    if (hasImage) {
      e.preventDefault();
    }
  };

  useEffect(() => {
    if (isOpen && boardId && accessToken) {
      getTagsByScope('board', boardId, accessToken).then((res) => {
        setAvailableTags(res);
      }).catch(console.error);

      getBoardMembers(boardId, accessToken).then((res) => {
        setBoardMembers(res.map((m: any) => ({
          id: m.id,
          name: m.displayName || m.email,
          initials: (m.displayName || m.email || '??').substring(0, 2).toUpperCase()
        })));
      }).catch(console.error);
      
      if (card?.id) {
        getCardActivity(card.id, accessToken).then(setActivities).catch(console.error);
      }
    }
  }, [isOpen, boardId, accessToken]);

  useEffect(() => {
    if (isOpen) {
      if (card) {
        setLocalTitle(card.title || "");
        setLocalSummary(card.summary || "");
        setLocalDueAt(card.dueAt || "");
        setLocalUrgency(card.urgency || "normal");
        setLocalTags(card.tags || []);
        setLocalAssignees(card.assignees || []);
      } else {
        setLocalTitle("New Card");
        setLocalSummary("");
        setLocalDueAt("");
        setLocalUrgency("normal");
        setLocalTags([]);
        setLocalAssignees([]);
      }
      setIsEditingDescription(!card?.id);
    }
  }, [isOpen, card]);

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

  const handleAddComment = async () => {
    if (!newComment.trim() || !card?.id || !accessToken) return;
    try {
      await addCardComment(card.id, newComment.trim(), accessToken);
      setNewComment("");
      const logs = await getCardActivity(card.id, accessToken);
      setActivities(logs);
      router.refresh();
      window.dispatchEvent(new Event('board:refresh'));
    } catch (err) {
      console.error("Failed to add comment", err);
    }
  };

  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

const handleUpdateField = useCallback((field: string, value: any, instant: boolean = true) => {
    if (field === 'title') setLocalTitle(value);
    if (field === 'summary') setLocalSummary(value);
    if (field === 'due_at') setLocalDueAt(value);
    if (field === 'urgency_state') setLocalUrgency(value);

    if (!card?.id || !accessToken) return;

    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    const doUpdate = async () => {
      try {
        await updateCard(card.id, { [field]: (value === null || value === "") ? null : value }, accessToken);
        router.refresh();
      window.dispatchEvent(new Event('board:refresh'));
      } catch (err) {
        console.error("Failed to update card", err);
      }
    };

    if (instant) {
      doUpdate();
    } else {
      debounceTimer.current = setTimeout(doUpdate, 500);
    }
  }, [card?.id, accessToken]);

  const submitCreate = async () => {
    if (!listId || !accessToken || isCreating) return;
    setIsCreating(true);

    let finalSummary = localSummary;
    if (isEditingDescription && editorRef.current) {
      finalSummary = editorRef.current.innerHTML;
    }

    try {
      const newCard = await createCard({
        listId,
        title: localTitle || "New Card",
        summary: finalSummary,
        dueAt: localDueAt || undefined,
        urgency: localUrgency,
        tags: localTags.map(t => t.id),
        assignees: localAssignees.map(a => a.id)
      }, accessToken);

      onClose(); // Then it can refresh or reload implicitly.
      window.location.reload();
    } catch (err) {
      console.error("Failed to create card", err);
    } finally {
      setIsCreating(false);
    }
  };

  const handleClose = async () => {
    if (isEditingDescription && editorRef.current && card?.id && accessToken) {
      const html = editorRef.current.innerHTML;
      try {
        await updateCard(card.id, { summary: html === "" ? null : html }, accessToken);
      } catch (err) {
        console.error("Failed to update card summary on close", err);
      }
    }
    router.refresh();
      window.dispatchEvent(new Event('board:refresh'));
    setTimeout(() => onClose(), 50);
  };

  if (!isOpen) return null;

  const content = (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4 sm:p-6 overflow-hidden"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div className="relative w-full max-w-5xl rounded-2xl border border-border/80 bg-background shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
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
                disabled={isCreating}
                className="bg-primary text-primary-foreground hover:bg-primary/90 px-3 py-1 rounded text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCreating ? "Creating..." : "Create"}
              </button>
            )}
            <button
              onClick={handleClose}
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

                <div className="mt-8 flex justify-between items-center">
                  <h3 className="font-semibold text-lg text-foreground">Description</h3>
                  {!isEditingDescription && (
                    <button 
                      onClick={() => setIsEditingDescription(true)}
                      className="px-3 py-1.5 text-sm bg-accent/20 hover:bg-accent/40 text-foreground font-medium rounded-md transition-colors border border-border"
                    >
                      Edit
                    </button>
                  )}
                  {isEditingDescription && (
                    <button 
                      onClick={handleSaveDescription}
                      className="px-3 py-1.5 text-sm bg-primary text-primary-foreground font-medium rounded-md transition-colors hover:bg-primary/90"
                    >
                      Save
                    </button>
                  )}
                </div>
                <div className="mt-4">
                  {isEditingDescription ? (
                    <div 
                      ref={editorRef}
                      contentEditable 
                      onPaste={handlePasteDescription}
                      className="w-full min-h-[150px] p-4 bg-background border border-accent rounded-lg outline-none focus:ring-2 focus:ring-primary/20 text-foreground text-base leading-relaxed break-words whitespace-pre-wrap"
                      dangerouslySetInnerHTML={{ __html: localSummary || '' }}
                    />
                  ) : (
                    <div 
                      className="w-full min-h-[100px] p-4 bg-background/50 border border-transparent rounded-lg text-foreground/90 text-base leading-relaxed break-words whitespace-pre-wrap"
                      dangerouslySetInnerHTML={{ __html: localSummary || '<p class="text-muted-foreground italic">Add a deeper description...</p>' }}
                    />
                  )}
                </div>

                {/* Tags Area */}
                <div className="flex flex-wrap items-center gap-1.5 mt-6 border-t border-border pt-4">
                  <div className="w-full text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <TagIcon className="h-3 w-3" /> Tags
                  </div>
                  {localTags.map((tag: any) => (
                    <span 
                      key={tag.id || tag.name || tag}
                      className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-secondary text-secondary-foreground border border-border/50 group transition-colors hover:bg-secondary/80"
                    >
                      <span>{tag.name || tag}</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleRemoveTag(tag); }}
                        className="ml-1.5 opacity-40 group-hover:opacity-100 hover:text-destructive transition-all"
                        title="Remove tag"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}

                  <div className="relative">
                    <button
                      onClick={(e) => { e.stopPropagation(); setIsTagDropdownOpen(prev => !prev); }}
                      className="inline-flex items-center justify-center h-6 w-6 rounded-md border border-dashed border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground transition-all hover:bg-secondary/50"
                      title="Add Tag"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>

                    {isTagDropdownOpen && (
                      <>
                        <div 
                          className="fixed inset-0 z-40" 
                          onClick={() => setIsTagDropdownOpen(false)}
                        />
                        <div className="absolute top-full left-0 mt-2 w-56 bg-popover text-popover-foreground border border-border rounded-lg shadow-xl z-50 overflow-hidden animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95">
                          <div className="p-2 border-b border-border/50 bg-muted/20">
                            <div className="relative flex items-center">
                              <input
                                type="text"
                                placeholder="Search or create tag..."
                                value={tagSearch}
                                onChange={e => setTagSearch(e.target.value)}
                                className="w-full bg-background border border-input rounded-md px-3 py-1.5 text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring transition-all placeholder:text-muted-foreground"
                                autoFocus
                              />
                            </div>
                          </div>
                          <div className="max-h-[200px] overflow-y-auto p-1.5 scrollbar-thin scrollbar-thumb-border">
                            {availableTags.filter(t => t.name.toLowerCase().includes(tagSearch.toLowerCase())).length === 0 ? (
                              <div className="px-2 py-3 text-center text-xs text-muted-foreground">
                                No tags found.
                              </div>
                            ) : (
                              availableTags.filter(t => t.name.toLowerCase().includes(tagSearch.toLowerCase())).map(tag => {
                                const isSelected = localTags.some((t: any) => (t.id || t) === tag.id || (t.name || t) === tag.name);
                                return (
                                  <button
                                    key={tag.id}
                                    onClick={() => {
                                      if (!isSelected) handleAddTag(tag);
                                      else handleRemoveTag(tag);
                                    }}
                                    className={`w-full text-left px-2.5 py-1.5 text-xs rounded-md flex items-center justify-between transition-colors mb-0.5 ${
                                      isSelected ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-accent hover:text-accent-foreground text-foreground/90'
                                    }`}
                                  >
                                    <div className="flex items-center space-x-2">
                                      <div className={`w-2 h-2 rounded-full ${isSelected ? 'bg-primary' : 'bg-muted-foreground/30'}`} />
                                      <span>{tag.name}</span>
                                    </div>
                                    {isSelected && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>}
                                  </button>
                                );
                              })
                            )}
                          </div>
                        </div>
                      </>
                    )}
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
                  {activities.filter(a => a.action === 'card.commented').length === 0 && (
                    <div className="text-sm text-muted-foreground text-center mt-10 p-4 border border-dashed border-border rounded-lg bg-background/50">
                      No comments yet. Start a discussion!
                    </div>
                  )}
                  {activities.filter(a => a.action === 'card.commented').map(log => {
                    const author = boardMembers.find(m => m.id === log.actorId);
                    return (
                      <div key={log.id} className="flex space-x-3 mt-4 animate-in fade-in zoom-in-95 duration-200">
                        <div className="h-8 w-8 rounded-full bg-accent flex items-center justify-center font-bold text-xs shrink-0 text-accent-foreground">
                          {author?.initials || '??'}
                        </div>
                        <div className="bg-background border border-border p-3 rounded-lg rounded-tl-none text-sm space-y-1 w-full">
                          <div className="font-semibold text-xs flex justify-between">
                            <span>{author?.name || log.actorId}</span>
                            <span className="text-muted-foreground font-normal ml-2">{new Date(log.createdAt).toLocaleDateString()}</span>
                          </div>
                          <p className="text-foreground/90 whitespace-pre-wrap mt-1">{log.payload?.text}</p>
                        </div>
                      </div>
                    );
                  })}
                </>
              ) : (
                <div className="space-y-4 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-border before:to-transparent">
                  {activities.map(log => {
                    const author = boardMembers.find(m => m.id === log.actorId);
                    return (
                    <div key={log.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active mt-4">
                      <div className="flex items-center justify-center w-4 h-4 rounded-full border border-primary bg-background shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow ml-3 md:ml-0 z-10"></div>
                      <div className="w-[calc(100%-3rem)] md:w-[calc(50%-1.5rem)] p-3 rounded-lg border border-border bg-background shadow-sm z-10">
                        <div className="flex items-center justify-between space-x-2 mb-1">
                          <div className="font-bold text-xs">{author?.name || log.actorId}</div>
                          <time className="text-xs text-muted-foreground">{new Date(log.createdAt).toLocaleDateString()}</time>
                        </div>
                        <div className="text-xs text-muted-foreground break-words">{log.action === 'card.commented' ? 'Commented' : log.action}</div>
                      </div>
                    </div>
                  )})}
                </div>
              )}
            </div>

            {/* Input area for comments */}
            <div className="p-4 border-t border-border bg-background/50 shrink-0">
              <div className="relative">
                <textarea
                  placeholder={activeTab === 'comments' ? "Write a comment..." : "Notes available in comments tab..."}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 pr-10 text-sm outline-none focus:border-primary resize-none placeholder:text-muted-foreground"
                  rows={2}
                  disabled={activeTab !== 'comments'}
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleAddComment();
                    }
                  }}
                />
                <button 
                  onClick={handleAddComment} 
                  disabled={activeTab !== 'comments' || !newComment.trim()} 
                  className="absolute right-2 bottom-2 p-1.5 bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed">
                  <CornerDownRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
          
        </div>
        
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(content, document.body) : null;
}
