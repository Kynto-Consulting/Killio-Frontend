"use client";

import { useState, useRef, useEffect } from "react";
import { X, Loader2, FileText, Folder as FolderIcon } from "lucide-react";
import { useTranslations } from "@/components/providers/i18n-provider";
import { Folder } from "@/lib/api/folders";
import { DocumentSummary } from "@/lib/api/documents";
import { FolderSelect } from "@/components/ui/folder-select";
import { useForm } from "@/hooks/ui";

interface EditDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  document: DocumentSummary | null;
  folders: Folder[];
  onSubmit: (documentId: string, updates: { title?: string; folderId?: string | null }) => Promise<void>;
}

export function EditDocumentModal({ isOpen, onClose, document, folders, onSubmit }: EditDocumentModalProps) {
  const t = useTranslations("documents");
  const tCommon = useTranslations("common");
  const [folderId, setFolderId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const form = useForm({
    fields: {
      title: { type: "text", transform: "trim", constraints: { required: true, minLength: 1 } },
    },
    submit: async ({ values, reset }) => {
      await onSubmit(document!.id, { title: values.title, folderId });
      reset();
      onClose();
    },
  });

  useEffect(() => {
    if (!isOpen || !document) return;
    // Seed the title field value through the inputProps onChange
    form.fields.title.inputProps.onChange?.({ target: { value: document.title || "" } } as any);
    setFolderId(document.folderId || null);
    const id = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(id);
  }, [isOpen, document]);

  if (!isOpen || !document) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl animate-in zoom-in-95 duration-200">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 z-10 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="mb-6 flex flex-col items-center justify-center gap-3">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent/10">
            <FileText className="h-6 w-6 text-accent" />
          </div>
          <h2 className="text-xl font-semibold">{t("editDocumentTitle")}</h2>
          <p className="text-sm text-muted-foreground text-center">
            {t("editDocumentDesc")}
          </p>
        </div>

        <form onSubmit={form.submit} className="space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-medium">{t("documentName")}</label>
            <input
              ref={inputRef}
              type="text"
              {...form.fields.title.inputProps}
              disabled={form.isSubmitting}
              className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center"><FolderIcon className="w-4 h-4 mr-2"/> {t("selectDestinationFolder")}</label>
            <FolderSelect
              value={folderId}
              onChange={setFolderId}
              folders={folders}
              disabled={form.isSubmitting}
            />
            {(form.fields.title.error || form.formError) && (
              <p className="text-sm text-destructive font-medium">{form.fields.title.error || form.formError}</p>
            )}
          </div>

          <div className="flex w-full items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={form.isSubmitting}
              className="h-10 px-4 py-2 rounded-md border border-input hover:bg-accent/10 transition-colors"
            >
              {t("cancel")}
            </button>
            <button
              type="submit"
              disabled={!form.fields.title.inputProps.value?.toString().trim() || form.isSubmitting}
              className="h-10 px-4 py-2 rounded-md bg-accent text-accent-foreground hover:bg-accent/90 text-sm font-medium flex transition-colors"
            >
              {form.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("saveChanges")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

