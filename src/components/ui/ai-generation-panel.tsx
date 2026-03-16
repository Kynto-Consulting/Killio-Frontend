"use client";

import { useState, useEffect } from "react";
import { X, UploadCloud, FileText, FileAudio, Bot, Sparkles, Send, Loader2, Edit3, Check, ChevronDown, List as ListIcon, Layout, ExternalLink } from "lucide-react";
import { useSession } from "@/components/providers/session-provider";
import { listTeamBoards, BoardSummary, getBoard, ListView, createCard } from "@/lib/api/contracts";
import { CardDetailModal } from "./card-detail-modal";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

interface GeneratedCard {
  title: string;
  description: string;
  suggestedBoard?: string;
  suggestedList?: string;
  // added local state
  selectedBoardId?: string;
  selectedListId?: string;
  availableLists?: ListView[];
}

export function AiGenerationPanel({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { accessToken, activeTeamId } = useSession();
  
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileText, setFileText] = useState<string>("");
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  
  const [previewCards, setPreviewCards] = useState<GeneratedCard[]>([]);
  
  // State for Global Dispatching Dropdowns
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [defaultBoardId, setDefaultBoardId] = useState<string>("");
  const [defaultLists, setDefaultLists] = useState<ListView[]>([]);
  const [defaultListId, setDefaultListId] = useState<string>("");

  // Target Card Modal states
  const [creatingCardIndex, setCreatingCardIndex] = useState<number | null>(null);
  const [activeCardDetails, setActiveCardDetails] = useState<{
    card: any;
    listId: string;
    listName: string;
    boardId: string;
    boardName: string;
  } | null>(null);

  useEffect(() => {
    if (isOpen && accessToken && activeTeamId) {
      listTeamBoards(activeTeamId, accessToken)
        .then(data => {
          setBoards(data);
          if (data.length > 0) {
            setDefaultBoardId(data[0].id);
          }
        })
        .catch(console.error);
    }
  }, [isOpen, accessToken, activeTeamId]);

  useEffect(() => {
    if (defaultBoardId && accessToken) {
      getBoard(defaultBoardId, accessToken)
        .then(data => {
          setDefaultLists(data.lists);
          if (data.lists.length > 0) {
            setDefaultListId(data.lists[0].id);
          } else {
            setDefaultListId("");
          }
        })
        .catch(console.error);
    }
  }, [defaultBoardId, accessToken]);


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
    if (!selectedFile && !fileText.trim()) return;
    setIsGenerating(true);
    setGenerationProgress(10);
    setPreviewCards([]);
    
    const progressInterval = setInterval(() => {
        setGenerationProgress(prev => {
            if (prev >= 90) return prev;
            return prev + Math.floor(Math.random() * 15);
        });
    }, 800);

    try {
      let extractedText = "";

      if (selectedFile) {
          const fileType = selectedFile.type;
          const fileName = selectedFile.name.toLowerCase();
          
          // Read plain text formats directly in the browser
          if (fileType.includes("text") || fileType.includes("json") || fileType.includes("csv") || fileName.endsWith(".md") || fileName.endsWith(".txt") || fileName.endsWith(".csv")) {
              extractedText = await selectedFile.text();
          } 
          // Parse PDF via Backend API
          else if (fileType === "application/pdf" || fileName.endsWith(".pdf")) {
              const formData = new FormData();
              formData.append("file", selectedFile);
              
              const pdfRes = await fetch(`${API}/ai/extract-pdf`, {
                 method: "POST",
                 headers: {
                    "Authorization": `Bearer ${accessToken}`
                 },
                 body: formData
              });
              
              if (pdfRes.ok) {
                 const pdfData = await pdfRes.json();
                 extractedText = pdfData.text || "";
              } else {
                 console.error("PDF extraction failed");
                 extractedText = `(No se pudo extraer el texto del PDF ${selectedFile.name})`;
              }
          } 
          // Unsupported formats
          else {
              extractedText = `(Archivo binario subido: ${selectedFile.name}. No se puede extraer el contenido en este formato de momento. Extrae lo que puedas basado en el contexto y título.)`;
          }
      }

      setGenerationProgress(20);

      // Combine user text context + extracted file logic
      let finalContent = "";
      if (fileText.trim()) {
         finalContent += `Contexto Adicional del Usuario:\n${fileText.trim()}\n\n`;
      }
      if (selectedFile && extractedText) {
         finalContent += `Contenido del Archivo (${selectedFile.name}):\n${extractedText}`;
      } else if (!selectedFile && fileText.trim()){
         finalContent = fileText;
      }

      // Fallback
      if (!finalContent.trim()) {
         finalContent = "El usuario no proporcionó información suficiente.";
      }

      const res = await fetch(`${API}/ai/scope/personal/generate-cards`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${accessToken}` },
        body: JSON.stringify({ scopeId: "personal", rawContent: finalContent }),
      });
      
      const cards: GeneratedCard[] = await res.json();
      
      // Initialize local state for each card to use the default board/list
      const enrichedCards = (Array.isArray(cards) ? cards : []).map(c => ({
          ...c,
          selectedBoardId: defaultBoardId,
          selectedListId: defaultListId,
          availableLists: defaultLists
      }));

      setPreviewCards(enrichedCards);
      setGenerationProgress(100);
    } catch {
      setPreviewCards([{ 
          title: "Error connecting to AI", 
          description: "No se pudo conectar con el servicio de Inteligencia Artificial. Revisa tu configuración.", 
      }]);
    } finally {
      clearInterval(progressInterval);
      setTimeout(() => {
          setIsGenerating(false);
          setGenerationProgress(0);
      }, 500);
    }
  };

  const handleCardBoardChange = async (index: number, boardId: string) => {
      const newCards = [...previewCards];
      newCards[index].selectedBoardId = boardId;
      setPreviewCards(newCards);

      if (boardId && accessToken) {
          try {
             const boardData = await getBoard(boardId, accessToken);
             const nextCards = [...previewCards];
             nextCards[index].availableLists = boardData.lists;
             nextCards[index].selectedListId = boardData.lists.length > 0 ? boardData.lists[0].id : "";
             setPreviewCards(nextCards);
          } catch(e) {
             console.error(e);
          }
      }
  };

  const handleCardListChange = (index: number, listId: string) => {
      const newCards = [...previewCards];
      newCards[index].selectedListId = listId;
      setPreviewCards(newCards);
  };


  const handleCreateAndEdit = async (index: number) => {
      const draftCard = previewCards[index];
      if (!draftCard.selectedBoardId || !draftCard.selectedListId || !accessToken) {
          alert("Selecciona un tablero y lista válidos para esta tarjeta.");
          return;
      }
      
      setCreatingCardIndex(index);
      try {
          // 1. Create the card in the backend
          const newCard = await createCard({
              listId: draftCard.selectedListId,
              title: draftCard.title,
              summary: draftCard.description, // HTML is fine, markdown is fine
              urgency: "normal"
          }, accessToken);
          
          // 2. Remove the draft from the preview list
          const nextCards = previewCards.filter((_, i) => i !== index);
          setPreviewCards(nextCards);

          // 3. Open the rich detail modal
          const boardName = boards.find(b => b.id === draftCard.selectedBoardId)?.name || 'Board';
          const listName = draftCard.availableLists?.find(l => l.id === draftCard.selectedListId)?.name || 'List';

          setActiveCardDetails({
              card: newCard,
              listId: draftCard.selectedListId,
              listName: listName,
              boardId: draftCard.selectedBoardId,
              boardName: boardName
          });

      } catch (err: any) {
          console.error("Error dispatching card:", err);
          alert("Hubo un error al enviar la tarjeta: " + (err.message || "Error desconocido"));
      } finally {
          setCreatingCardIndex(null);
      }
  };

  return (
    <>
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm p-4 sm:p-6 overflow-y-auto">
        <div className="relative w-full max-w-6xl rounded-2xl border border-border bg-card shadow-2xl flex flex-col md:flex-row overflow-hidden animate-in fade-in zoom-in-95 duration-200 min-h-[600px] max-h-[90vh]">
          
          {/* Left Panel: Upload & Input */}
          <div className="flex-1 lg:max-w-md border-r border-border p-6 flex flex-col bg-card/50">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-2xl font-bold flex items-center tracking-tight">
                <Bot className="mr-2 h-7 w-7 text-accent" />
                AI Draft Studio
              </h2>
              <button onClick={onClose} className="md:hidden rounded-full p-2 hover:bg-accent/10 text-muted-foreground transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 mb-6">
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Sube tus Pdfs, Excels, notas, audios o imágenes. Nuestra IA analizará el contenido estrictamente para extraer tarjetas descriptivas listas para refinar.
                </p>
            </div>

            <div className="flex-1 flex flex-col relative">
              {/* Dropzone or File Indicator */}
              {!selectedFile ? (
                <div 
                  className={`mb-4 border-2 border-dashed rounded-xl flex flex-col items-center justify-center p-6 transition-all duration-200 ${
                    dragActive ? "border-accent bg-accent/10" : "border-border/60 hover:border-accent/60 hover:bg-accent/5 cursor-pointer"
                  }`}
                  onDragEnter={handleDrag}
                  onDragLeave={handleDrag}
                  onDragOver={handleDrag}
                  onDrop={handleDrop}
                  onClick={() => document.getElementById("file-upload")?.click()}
                >
                  <UploadCloud className="h-6 w-6 text-accent mb-2" />
                  <h3 className="text-sm font-semibold text-foreground">Sube tu archivo PDF, CSV, Audio...</h3>
                  <input id="file-upload" type="file" className="hidden" onChange={(e) => setSelectedFile(e.target.files?.[0] || null)} />
                </div>
              ) : (
                <div className="mb-4 flex items-center justify-between border rounded-xl border-accent/30 bg-accent/5 p-4 shadow-sm relative">
                  <div className="flex items-center">
                    <FileAudio className="h-8 w-8 text-accent mr-3" />
                    <div>
                      <h4 className="font-medium text-sm truncate w-48 text-foreground" title={selectedFile.name}>{selectedFile.name}</h4>
                      <p className="text-xs text-muted-foreground mt-0.5">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => { setSelectedFile(null); }}
                    className="p-1.5 rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                    title="Eliminar archivo"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}

              {/* Text Area (Main Content or Extra Context) */}
              <div className="flex-1 flex flex-col">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">
                  {selectedFile ? "Contexto Adicional (Opcional)" : "Pega tus notas o requerimientos"}
                </label>
                <textarea 
                  value={fileText}
                  onChange={(e) => setFileText(e.target.value)}
                  placeholder={selectedFile ? "Ej. Filtra solo las tareas de backend..." : "Añade toda la información necesaria para crear las tarjetas..."}
                  className="flex-1 w-full min-h-[160px] rounded-xl border border-input bg-background px-4 py-3 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent resize-none transition-shadow"
                />
              </div>

              {/* Generate Action */}
              <div className="mt-6">
                {isGenerating ? (
                    <div className="space-y-3">
                        <div className="flex justify-between text-xs font-medium text-muted-foreground">
                            <span className="flex items-center"><Loader2 className="h-3 w-3 animate-spin mr-1.5" /> Analizando contenido...</span>
                            <span>{generationProgress}%</span>
                        </div>
                        <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                            <div 
                                className="h-full bg-accent transition-all duration-300 ease-out" 
                                style={{ width: `${generationProgress}%` }}
                            />
                        </div>
                    </div>
                ) : (
                    <button 
                        onClick={handleGenerate}
                        disabled={!selectedFile && !fileText.trim()}
                        className="w-full inline-flex items-center justify-center h-11 rounded-lg bg-accent text-accent-foreground font-medium hover:bg-accent/90 shadow-md transition-all active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
                    >
                        <Sparkles className="h-5 w-5 mr-2" />
                        Generar Tarjetas
                    </button>
                )}
              </div>
            </div>
          </div>

          {/* Right Panel: Preview Area */}
          <div className="flex-1 bg-background flex flex-col relative w-full overflow-hidden">
            <div className="hidden md:flex absolute top-4 right-4 z-10">
              <button onClick={onClose} className="rounded-full p-2 hover:bg-accent/10 text-muted-foreground transition-colors bg-background/50 backdrop-blur-sm border border-border/50 shadow-sm">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 md:p-8 flex-1 flex flex-col overflow-y-auto hide-scrollbar">
              <div className="flex items-center justify-between mb-6">
                  <h3 className="font-semibold text-lg text-foreground">Tarjetas de Borrador Generadas</h3>
                  {previewCards.length > 0 && (
                      <div className="flex items-center space-x-2">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
                              {previewCards.length} en espera
                          </span>
                      </div>
                  )}
              </div>
              
              {previewCards.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center opacity-70">
                  <div className="h-24 w-24 rounded-full bg-accent/5 flex items-center justify-center mb-6">
                      <Bot className="h-12 w-12 text-accent/40" />
                  </div>
                  <h4 className="text-lg font-medium mb-2">Aún no hay resultados</h4>
                  <p className="text-sm text-center text-muted-foreground max-w-sm">
                    Sube un archivo o pega texto y haz clic en "Generar Tarjetas" para extraer ítems procesables.
                  </p>
                </div>
              ) : (
                <div className="space-y-4 flex-1 pb-10">
                  <div className="bg-primary/5 border border-primary/20 text-primary-foreground/90 p-4 rounded-lg mb-6 text-sm flex items-start">
                      <Sparkles className="h-5 w-5 mr-3 shrink-0 text-primary" />
                      <p className="text-muted-foreground">Revisa las tarjetas creadas por la IA. Selecciona a qué lista pertenece cada una y haz clic en "<strong>Guardar y Detallar</strong>" para abrir el editor avanzado y añadir asignar, etiquetas o adjuntar imágenes.</p>
                  </div>

                  {previewCards.map((card, i) => (
                    <div key={i} className="relative rounded-xl border border-border bg-card shadow-sm hover:shadow-md transition-all p-5 overflow-hidden flex flex-col group">
                      <div className="flex justify-between items-start gap-4 mb-3">
                          <h4 className="text-base font-semibold leading-tight text-foreground/90 group-hover:text-accent transition-colors">
                            {card.title}
                          </h4>
                      </div>
                      
                      <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed mb-4">
                          {card.description || <span className="italic opacity-50">Sin descripción...</span>}
                      </p>

                      <div className="mt-auto pt-4 border-t border-border/50 flex flex-wrap lg:flex-nowrap items-center gap-3">
                          {/* Board Dropdown */}
                          <div className="flex-1 min-w-[140px] relative">
                              <select 
                                  className="w-full h-9 appearance-none bg-background border border-input rounded-md pl-3 pr-8 text-xs focus-visible:ring-1 focus-visible:ring-accent font-medium text-muted-foreground"
                                  value={card.selectedBoardId || ""}
                                  onChange={(e) => handleCardBoardChange(i, e.target.value)}
                              >
                                  <option value="" disabled>Tablero...</option>
                                  {boards.map(b => (
                                      <option key={b.id} value={b.id}>{b.name}</option>
                                  ))}
                              </select>
                              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
                          </div>

                          {/* List Dropdown */}
                          <div className="flex-1 min-w-[140px] relative">
                              <select 
                                  className="w-full h-9 appearance-none bg-background border border-input rounded-md pl-3 pr-8 text-xs focus-visible:ring-1 focus-visible:ring-accent disabled:opacity-50 font-medium text-muted-foreground"
                                  value={card.selectedListId || ""}
                                  onChange={(e) => handleCardListChange(i, e.target.value)}
                                  disabled={!card.selectedBoardId || (card.availableLists || []).length === 0}
                              >
                                  <option value="" disabled>
                                      {!card.selectedBoardId ? "Tablero primero" : (card.availableLists || []).length === 0 ? "Sin listas" : "Lista de destino..."}
                                  </option>
                                  {(card.availableLists || []).map(l => (
                                      <option key={l.id} value={l.id}>{l.name}</option>
                                  ))}
                              </select>
                              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
                          </div>

                          <button 
                              onClick={() => handleCreateAndEdit(i)}
                              disabled={creatingCardIndex === i || !card.selectedListId || !card.selectedBoardId}
                              className="inline-flex items-center justify-center h-9 px-4 rounded-md bg-accent/10 text-accent font-semibold hover:bg-accent hover:text-accent-foreground text-xs shadow-sm transition-all whitespace-nowrap disabled:opacity-50"
                          >
                              {creatingCardIndex === i ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                  <>
                                      <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Guardar y Detallar
                                  </>
                              )}
                          </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
          </div>

        </div>
      </div>

      {activeCardDetails && (
          <CardDetailModal 
            isOpen={true} 
            onClose={() => setActiveCardDetails(null)} 
            card={activeCardDetails.card} 
            listId={activeCardDetails.listId}
            listName={activeCardDetails.listName}
            boardId={activeCardDetails.boardId}
            boardName={activeCardDetails.boardName}
          />
      )}
    </>
  );
}
