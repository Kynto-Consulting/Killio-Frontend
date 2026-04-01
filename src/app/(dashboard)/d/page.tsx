"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Plus, Clock, Loader2, FileText, Search, Trash2 } from "lucide-react";
import { useSession } from "@/components/providers/session-provider";
import { listDocuments, DocumentSummary, createDocument, deleteDocument } from "@/lib/api/documents";
import { toast } from "@/lib/toast";
import { useTranslations } from "@/components/providers/i18n-provider";
import { CreateDocumentModal } from "@/components/ui/create-document-modal";
import { FolderTree, FolderNode } from "@/components/folders/FolderTree";
import { FolderCard } from "@/components/folders/FolderCard";
import { FolderModal } from "@/components/folders/FolderModal";
import { Folder, listFolders, createFolder, updateFolder } from "@/lib/api/folders";

export default function DocumentsPage() {
  const t = useTranslations("documents");
  const { accessToken, activeTeamId } = useSession();
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [deletingDocumentId, setDeletingDocumentId] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [editingFolder, setEditingFolder] = useState<Folder | null>(null);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);

  const buildTree = (allF: Folder[], parentId: string | null = null): FolderNode[] => {
    return allF
      .filter(f => (f.parentFolderId || null) === parentId)
      .map(f => ({
        id: f.id,
        name: f.name,
        icon: f.icon,
        color: f.color,
        children: buildTree(allF, f.id)
      }));
  };
  
  const folderTree = buildTree(folders);
  const activeChildrenFolders = folders.filter(f => (f.parentFolderId || null) === activeFolderId);
  const currentFolder = folders.find(f => f.id === activeFolderId);

  useEffect(() => {
    if (!accessToken || !activeTeamId) return;
    
    setIsLoading(true);
    
    Promise.all([
      listDocuments(activeTeamId, accessToken, activeFolderId || undefined),
      listFolders(activeTeamId, accessToken)
    ])
    .then(([docs, flds]) => {
      setDocuments(docs);
      setFolders(flds);
    })
    .catch(console.error)
    .finally(() => setIsLoading(false));
  }, [accessToken, activeTeamId, activeFolderId]);

  const handleFolderSubmit = async (data: { name: string; icon: string; color: string; parentFolderId: string | null }) => {
    if (!accessToken || !activeTeamId) return;
    try {
      if (editingFolder) {
        const f = await updateFolder(editingFolder.id, data, accessToken);
        setFolders(folders.map(folder => folder.id === editingFolder.id ? f : folder));
        toast("Carpeta actualizada", "success");
      } else {
        const f = await createFolder({ teamId: activeTeamId, ...data }, accessToken);
        setFolders([...folders, f]);
        toast("Carpeta creada", "success");
      }
      setIsFolderModalOpen(false);
    } catch (e) {
      console.error(e);
      toast("Error al guardar carpeta", "error");
    }
  };

  const handleCreateDocument = async (title: string) => {
    if (!accessToken || !activeTeamId) return;

    try {
      const doc = await createDocument({ teamId: activeTeamId, title, folderId: activeFolderId || undefined }, accessToken);
      setDocuments([doc, ...documents]);
    } catch (e) {
      console.error(e);
      toast(t("createError"), "error");
      throw e; 
    }
  };

  const filteredDocs = documents.filter(doc => 
    doc.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleDeleteDocument = async (doc: DocumentSummary) => {
    if (!accessToken || deletingDocumentId) return;

    const typed = window.prompt(t("deletePrompt", { title: doc.title }));
    if (typed !== doc.title) {
      if (typed !== null) {
        toast(t("deleteConfirmMismatch"), "error");
      }
      return;
    }

    const accepted = window.confirm(t("deleteFinalConfirm", { title: doc.title }));
    if (!accepted) return;

    setDeletingDocumentId(doc.id);
    try {
      await deleteDocument(doc.id, accessToken);
      setDocuments((prev) => prev.filter((item) => item.id !== doc.id));
      toast(t("deleteSuccess", { title: doc.title }), "success");
    } catch (error) {
      console.error(error);
      toast(t("deleteError"), "error");
    } finally {
      setDeletingDocumentId(null);
    }
  };

  return (
    <div className="container mx-auto p-4 lg:p-8 max-w-[1400px]">
      <div className="flex flex-col lg:flex-row gap-8">
        {/* Sidebar for Folder Tree */}
        <div className="lg:w-64 flex-shrink-0">
          <FolderTree 
            folders={folderTree} 
            activeFolderId={activeFolderId} 
            onSelectFolder={setActiveFolderId} 
          />
        </div>

        {/* Main Content Area */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
            <div>
              <h1 className="text-3xl font-bold tracking-tight mb-2">
                {currentFolder ? currentFolder.name : t("title")}
              </h1>
              <p className="text-muted-foreground">{t("subtitle")}</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input 
                  type="text"
                  placeholder={t("searchPlaceholder")}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-9 w-64 rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
                />
              </div>
              <button 
                onClick={() => setIsCreateModalOpen(true)} 
                className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring bg-primary/90 hover:bg-primary text-primary-foreground shadow h-9 px-4 group"
              >
                <Plus className="mr-2 h-4 w-4 opacity-70 group-hover:scale-110 transition-transform" />
                {t("newDocument")}
              </button>
            </div>
          </div>

          {/* Folders navigation/creation actions */}
          <div className="flex flex-wrap gap-2 mb-4">
            <button
              onClick={() => {
                setEditingFolder(null);
                setIsFolderModalOpen(true);
              }}
              className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring bg-secondary hover:bg-secondary/80 text-secondary-foreground shadow-sm h-9 px-4"
            >
              <Plus className="mr-2 h-4 w-4" />
              Nueva Carpeta
            </button>
            {activeFolderId && (
               <>
                 <button
                   onClick={() => {
                     setEditingFolder(currentFolder || null);
                     setIsFolderModalOpen(true);
                   }}
                   className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors border border-border bg-card hover:bg-accent hover:text-accent-foreground shadow-sm h-9 px-4"
                 >
                   Editar Carpeta
                 </button>
                 <button
                   onClick={() => {
                     setActiveFolderId(currentFolder?.parentFolderId || null);
                   }}
                   className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors border border-border bg-card hover:bg-accent hover:text-accent-foreground shadow-sm h-9 px-4"
                 >
                   Subir de nivel
                 </button>
               </>
            )}
          </div>

          <div className="mb-8">
            {activeChildrenFolders.length > 0 && (
              <>
                <h2 className="text-sm font-medium text-muted-foreground mb-4 uppercase tracking-wider">Carpetas</h2>
                <div className="flex flex-wrap gap-3">
                  {activeChildrenFolders.map(folder => (
                    <FolderCard 
                      key={folder.id} 
                      folder={folder} 
                      onClick={() => setActiveFolderId(folder.id)}
                      isActive={activeFolderId === folder.id}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
          
          <h2 className="text-sm font-medium text-muted-foreground mb-4 uppercase tracking-wider">Archivos</h2>

          {isLoading ? (
            <div className="py-12 flex flex-col items-center justify-center text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin mb-4 text-primary/50" />
              <p>{t("gathering")}</p>
            </div>
          ) : filteredDocs.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              <div 
                onClick={() => setIsCreateModalOpen(true)} 
                className="group relative rounded-xl border border-dashed border-border/60 bg-transparent hover:border-accent hover:bg-accent/5 transition-all cursor-pointer flex flex-col items-center justify-center p-8 text-center min-h-[160px]"
              >
                <div className="mb-4 rounded-full bg-accent/10 p-3 text-accent group-hover:bg-accent/20 transition-colors">
                  <Plus className="h-6 w-6" />
                </div>
                <h3 className="font-medium">{t("newDocument")}</h3>
                <p className="text-sm text-muted-foreground mt-1">{t("startWriting")}</p>
              </div>

              {filteredDocs.map((doc) => (
                <div 
                  key={doc.id}
                  className="group relative rounded-xl border border-border bg-card shadow-sm hover:border-accent/40 hover:shadow-md transition-all flex flex-col min-h-[160px] overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      void handleDeleteDocument(doc);
                    }}
                    disabled={deletingDocumentId === doc.id}
                    className="absolute right-3 top-3 z-10 inline-flex h-8 w-8 items-center justify-center rounded-md border border-border/60 bg-background/80 text-muted-foreground hover:text-destructive hover:border-destructive/40 disabled:opacity-60"
                    title={t("deleteDocument")}
                    aria-label={t("deleteDocument")}
                  >
                    {deletingDocumentId === doc.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  </button>

                  <Link 
                    href={`/d/${doc.id}`}
                    className="flex flex-1 flex-col"
                  >
                    <div className="p-5 flex flex-col flex-1">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center">
                          <div className="h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center mr-3 group-hover:bg-accent/20 transition-colors">
                            <FileText className="h-5 w-5 text-accent" />
                          </div>
                          <h3 className="text-lg font-semibold group-hover:text-accent transition-colors truncate max-w-[180px]">{doc.title}</h3>
                        </div>
                      </div>
                      
                      <div className="mt-auto pt-4 border-t border-border/50 flex items-center justify-between text-xs text-muted-foreground">
                        <div className="flex items-center">
                          <Clock className="mr-1.5 h-3 w-3" />
                          {t("updated")} {new Date(doc.updatedAt).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  </Link>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-20 flex flex-col items-center justify-center text-center border border-dashed border-border rounded-xl bg-card/30">
              <div className="h-16 w-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
                <FileText className="h-8 w-8 text-muted-foreground/50" />
              </div>
              <h3 className="text-xl font-semibold mb-1">{t("noDocumentsFound")}</h3>
              <p className="text-muted-foreground max-w-xs mb-6">
                {searchQuery ? t("noDocumentsMatch", { query: searchQuery }) : t("noDocumentsEmpty")}
              </p>
              <button 
                onClick={() => setIsCreateModalOpen(true)}
                className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors bg-accent/10 text-accent hover:bg-accent/20 h-9 px-4"
              >
                {t("createFirstDocument")}
              </button>
            </div>
          )}
        </div>
      </div>

      <CreateDocumentModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSubmit={async (title) => {
          await handleCreateDocument(title);
          setIsCreateModalOpen(false);
        }}
      />

      <FolderModal
        isOpen={isFolderModalOpen}
        onClose={() => setIsFolderModalOpen(false)}
        onSubmit={handleFolderSubmit}
        initialData={editingFolder}
        folders={folders}
        currentParentId={activeFolderId}
      />
    </div>
  );
}
