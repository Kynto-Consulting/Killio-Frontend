export type FolderNode = {
  id: string;
  name: string;
  children?: FolderNode[];
  documentCount?: number;
};

export const MOCK_FOLDERS: FolderNode[] = [
  {
    id: "f1",
    name: "Engineering",
    children: [
      { id: "f1-1", name: "Architecture", documentCount: 5 },
      { id: "f1-2", name: "Specs", documentCount: 2 }
    ]
  },
  {
    id: "f2",
    name: "Marketing",
    children: [
      { id: "f2-1", name: "Campaigns", documentCount: 10 }
    ],
    documentCount: 3
  },
  {
    id: "f3",
    name: "Personal",
    documentCount: 1
  }
];

export const MOCK_FOLDER_CARDS: FolderNode[] = [
  { id: "f1", name: "Engineering", documentCount: 7 },
  { id: "f2", name: "Marketing", documentCount: 13 },
  { id: "f3", name: "Personal", documentCount: 1 }
];