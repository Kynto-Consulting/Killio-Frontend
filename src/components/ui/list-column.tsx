"use client";

import dynamic from "next/dynamic";
import { usePlatform } from "@/components/providers/platform-provider";

interface ListData {
  id: string;
  title: string;
  cards: any[];
}

interface ListColumnProps {
  list: ListData;
  boardName?: string;
  boardId: string;
  isDropTarget?: boolean;
  dropHintIndex?: number | null;
  draggingCardId?: string | null;
  canEdit?: boolean;
  canComment?: boolean;
  teamDocs?: any[];
  teamBoards?: any[];
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
