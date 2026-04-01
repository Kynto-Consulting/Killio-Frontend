const fs = require('fs');

const fileP = 'src/app/(dashboard)/d/page.tsx';
let old = fs.readFileSync(fileP, 'utf8');

old = old.replace('import { MOCK_FOLDERS, MOCK_FOLDER_CARDS } from "@/lib/mock-folders";', 'import { Folder, listFolders, createFolder } from "@/lib/api/folders";\nimport { FolderNode } from "@/components/folders/FolderTree";');

const stateStr = `  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);`;
const newStateStr = `  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [isCreateFolderModalOpen, setIsCreateFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");`;

old = old.replace(stateStr, newStateStr);

const eff1 = `  useEffect(() => {
    if (!accessToken || !activeTeamId) return;
    
    setIsLoading(true);
    // TODO: update api to accept folder_id filtering
    listDocuments(activeTeamId, accessToken)
      .then(setDocuments)
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, [accessToken, activeTeamId, activeFolderId]);`;

const eff2 = `  useEffect(() => {
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

  const handleCreateFolder = async () => {
    if (!accessToken || !activeTeamId || !newFolderName.trim()) return;
    try {
      const f = await createFolder({ teamId: activeTeamId, name: newFolderName, parentFolderId: activeFolderId || undefined }, accessToken);
      setFolders([...folders, f]);
      setNewFolderName("");
      setIsCreateFolderModalOpen(false);
      toast("Carpeta creada", "success");
    } catch (e) {
      console.error(e);
      toast("Error al crear carpeta", "error");
    }
  };

  const buildTree = (allF: Folder[], parentId: string | null = null): FolderNode[] => {
    return allF
      .filter(f => (f.parentFolderId || null) === parentId)
      .map(f => ({
        id: f.id,
        name: f.name,
        children: buildTree(allF, f.id)
      }));
  };
  
  const folderTree = buildTree(folders);
  const activeChildrenFolders = folders.filter(f => (f.parentFolderId || null) === activeFolderId);
  const currentFolder = folders.find(f => f.id === activeFolderId);
`;

old = old.replace(eff1, eff2);

const handleCreStr = `  const handleCreateDocument = async (title: string) => {
    if (!accessToken || !activeTeamId) return;

    try {
      // TODO: send activeFolderId when server supports it
      const doc = await createDocument({ teamId: activeTeamId, title }, accessToken);`;

const handleCreNewStr = `  const handleCreateDocument = async (title: string) => {
    if (!accessToken || !activeTeamId) return;

    try {
      const doc = await createDocument({ teamId: activeTeamId, title, folderId: activeFolderId || undefined }, accessToken);`;

old = old.replace(handleCreStr, handleCreNewStr);

old = old.replace('folders={MOCK_FOLDERS}', 'folders={folderTree}');

old = old.replace(
  `{activeFolderId \n                  ? MOCK_FOLDERS.find(f => f.id === activeFolderId)?.name || MOCK_FOLDERS.flatMap(f => f.children || []).find(f => f.id === activeFolderId)?.name || t("title")\n                  : t("title")}`,
  `{currentFolder ? currentFolder.name : t("title")}`
);

const mb8 = `          <div className="mb-8 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {MOCK_FOLDER_CARDS.map(folder => (`;
const mb8New = `          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setIsCreateFolderModalOpen(true)}
              className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring bg-secondary hover:bg-secondary/80 text-secondary-foreground shadow-sm h-9 px-4"
            >
              <Plus className="mr-2 h-4 w-4" />
              Nueva Carpeta
            </button>
            {activeFolderId && (
               <button
                 onClick={() => {
                   const cf = folders.find(f => f.id === activeFolderId);
                   setActiveFolderId(cf?.parentFolderId || null);
                 }}
                 className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors bg-secondary hover:bg-secondary/80 text-secondary-foreground h-9 px-4"
               >
                 Subir de nivel
               </button>
            )}
          </div>
          {activeChildrenFolders.length > 0 && (
            <div className="mb-8 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {activeChildrenFolders.map(folder => (`;

old = old.replace(mb8, mb8New);

const closeStr = `          {documents.length === 0 && !isLoading ? (`;
const closeNewStr = `            </div>
          )}

          {documents.length === 0 && !isLoading ? (`;
old = old.replace(closeStr, closeNewStr);

const modalStr = `      <CreateDocumentModal 
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSubmit={handleCreateDocument}
      />
    </div>`;
const modalNewStr = `      <CreateDocumentModal 
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSubmit={handleCreateDocument}
      />

      {isCreateFolderModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl relative animate-in fade-in zoom-in-95 duration-200">
            <h2 className="text-xl font-semibold mb-4">Nueva Carpeta</h2>
            <input 
              type="text" 
              placeholder="Nombre de la carpeta"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              className="w-full mb-4 px-3 py-2 rounded-md border border-input bg-card shadow-sm"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button 
                onClick={() => setIsCreateFolderModalOpen(false)}
                className="px-4 py-2 rounded-md border border-border text-sm font-medium hover:bg-accent hover:text-accent-foreground"
              >
                Cancelar
              </button>
              <button 
                onClick={handleCreateFolder}
                className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
              >
                Crear
              </button>
            </div>
          </div>
        </div>
      )}
    </div>`;
old = old.replace(modalStr, modalNewStr);

fs.writeFileSync(fileP, old);
console.log('Done replacement');
