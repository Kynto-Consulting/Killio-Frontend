export type FolderNode = {
  id: string;
  name: string;
  children?: FolderNode[];
  documentCount?: number;
  icon?: string | null;
  color?: string | null;
  parentFolderId?: string | null;
};
