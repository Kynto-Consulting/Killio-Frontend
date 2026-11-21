"use client";

import dynamic from "next/dynamic";
import { usePlatform } from "@/components/providers/platform-provider";
import type { ListViewConfig } from "@/lib/boards/categories";
import type { SortRule, TagGroup } from "@/lib/boards/sorting";
import type { KqlContext } from "@/lib/query/kql";

interface ListData {
  id: string;
  title: string;
  cards: any[];
  allCards?: any[];
  totalCount?: number;
  systemKey?: string | null;
  assignedGroupId?: string | null;
}

interface ListColumnProps {
  list: ListData;
  boardName?: string;
  boardId: string;
  teamId?: string;
  isDropTarget?: boolean;
  dropHintIndex?: number | null;
  draggingCardId?: string | null;
  canEdit?: boolean;
  canComment?: boolean;
  teamDocs?: any[];
  teamBoards?: any[];
  accentColor?: string;
  viewConfig?: ListViewConfig;
  onViewConfigChange?: (config: ListViewConfig) => void;
  kqlContext?: KqlContext;
  tagGroups?: TagGroup[];
  effectiveSort?: SortRule[];
  sortFromBoard?: boolean;
  onResetBoardSort?: () => void;
  filterError?: string | null;
  onAssignGroup?: (listId: string, groupId: string | null) => void | Promise<void>;
}

const WebVariant = dynamic(() => import("./list-column.web").then((m) => m.ListColumnWeb));
const MobileVariant = dynamic(() => import("./list-column.mobile").then((m) => m.ListColumnMobile));

export function ListColumn(props: ListColumnProps) {
  const platform = usePlatform();

  if (platform === "mobile") {
    return <MobileVariant {...props} />;
  }

  return <WebVariant {...props} />;
}
