const fs = require('fs');
let content = fs.readFileSync('src/components/bricks/unified-media-brick.tsx', 'utf8');

const regex = /\) :\s*\(\s*<div className="w-full max-w-2xl border border-border\/70(?:.|\n|\r)*?<\/div>\s*<\/div>\s*\)/;
const match = content.match(regex);
if (!match) {
    console.log('NO MATCH FOUND.');
    process.exit(1);
}

const newPart = `) : (
          <div className="w-full relative group/empty mt-1 mb-1 max-w-[800px]">
            <div className="flex items-center gap-3 py-1.5 px-2 rounded-sm bg-muted/10 border border-transparent hover:border-border/40 hover:bg-muted/30 transition-all text-[15px] group-hover/empty:bg-muted/20">
              <div className="text-muted-foreground flex items-center justify-center p-1 rounded-sm">
                {kind === "image" ? <ImageIcon className="w-[18px] h-[18px]" /> : kind === "video" ? <Video className="w-[18px] h-[18px]" /> : kind === "audio" ? <Music className="w-[18px] h-[18px]" /> : kind === "bookmark" ? <Bookmark className="w-[18px] h-[18px]" /> : <FileText className="w-[18px] h-[18px]" />}
              </div>
              
              <div className="flex-1 flex items-center gap-4 text-muted-foreground min-w-0">
                {kind !== "bookmark" && canEdit && (
                  <label className="cursor-pointer hover:text-foreground transition-colors whitespace-nowrap">
                    {kind === "image" ? t("brickRenderer.chooseImage") ?? "Upload image" : kind === "video" ? t("brickRenderer.chooseVideo") ?? "Upload video" : kind === "audio" ? t("brickRenderer.chooseAudio") ?? "Upload audio" : t("brickRenderer.chooseFile") ?? "Upload file"}
                    <input
                      type="file"
                      multiple
                      accept={kind === "image" ? "image/*" : kind === "video" ? "video/*" : kind === "audio" ? "audio/*" : "image/*,video/*,audio/*,.svg,.pdf,.txt,.csv,.doc,.docx,.ppt,.pptx,.xls,.xlsx"}
                      className="hidden"
                      onChange={(event) => {
                        const files = Array.from(event.target.files || []);
                        if (files.length === 0) return;
                        if (onUploadMediaFiles) {
                          void Promise.resolve(onUploadMediaFiles({ brickId, files }));
                        }
                        event.currentTarget.value = "";
                      }}
                    />
                  </label>
                )}
                
                {canEdit && (
                  <form 
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!canEdit || !linkInput.trim()) return;
                      
                      const newItem = {
                        url: linkInput.trim(),
                        title: kind === "bookmark" ? "Bookmark" : "",
                        mimeType: kind === "bookmark" ? "text/html" : undefined,
                        sizeBytes: null,
                        assetId: null,
                      };
                      
                      if (meta.items.length === 0) {
                        updateMeta({ ...meta, items: [newItem] }, 0);
                      } else {
                        updateMeta({ ...meta, items: [...meta.items, newItem] }, meta.items.length);
                      }
                    }}
                    className="flex-1 flex items-center min-w-0"
                  >
                    <span className="text-muted-foreground/40 mr-3 hidden sm:inline-block">/</span>
                    <input
                       type="url"
                       value={linkInput}
                       onChange={(e) => setLinkInput(e.target.value)}
                       placeholder={t("brickRenderer.embedPlaceholder") ?? "Embed link..."}
                       className="flex-1 bg-transparent border-none outline-none focus:ring-0 text-foreground placeholder:text-muted-foreground/50 py-0.5 min-w-0 px-0 h-auto"
                    />
                     {linkInput.trim() && (
                      <button
                        type="submit"
                        className="ml-2 px-3 py-1 bg-primary text-primary-foreground text-xs rounded font-medium hover:bg-primary/90 transition-colors shrink-0"
                      >
                        {kind === "bookmark" ? t("brickRenderer.bookmarkButton") ?? "Add bookmark" : t("brickRenderer.embedButton") ?? "Embed"}
                      </button>
                    )}
                  </form>
                )}
                
                {!canEdit && (
                  <span className="text-muted-foreground">{t("brickRenderer.attachPrompt")}</span>
                )}
              </div>
            </div>
          </div>
        )`;

content = content.replace(match[0], newPart);
fs.writeFileSync('src/components/bricks/unified-media-brick.tsx', content, 'utf8');
console.log('REPLACEMENT SUCCESS', match[0].length);
