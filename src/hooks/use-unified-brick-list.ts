"use client";

import { useState, useEffect } from "react";
import type { DragEndEvent } from "@dnd-kit/core";
import { type SlashCommand } from "@/components/bricks/slash-commands";
import type { ReferencePickerSelection } from "@/components/documents/reference-picker";

export type AddableKind = 'text' | 'table' | 'database' | 'graph' | 'checklist' | 'accordion' | 'tabs' | 'columns' | 'image' | 'video' | 'audio' | 'file' | 'code' | 'bookmark' | 'math';

export interface UseUnifiedBrickListProps {
  bricks: any[];
  addableKinds?: AddableKind[];
  onAddBrick: (kind: string, afterBrickId?: string, initialContent?: any) => void;
  onUpdateBrick: (id: string, content: any) => void;
  onDeleteBrick: (id: string) => void;
  onReorderBricks: (ids: string[]) => void;
  onCrossContainerDrop?: (activeId: string, overId: string) => void;
  slashCommands: SlashCommand[];
  hasExternalDndContext?: boolean;
}

export const useUnifiedBrickList = ({
  bricks,
  addableKinds,
  onAddBrick,
  onUpdateBrick,
  onDeleteBrick,
  onReorderBricks,
  onCrossContainerDrop,
  slashCommands,
  hasExternalDndContext = false,
}: UseUnifiedBrickListProps) => {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [plusMenuState, setPlusMenuState] = useState<{ brickId: string; top: number; left: number } | null>(null);
  const [plusMenuHoverIndex, setPlusMenuHoverIndex] = useState<number>(0);
  const [pickerState, setPickerState] = useState<{ isOpen: boolean; filter: string[]; triggerBrickId: string } | null>(null);

  const enabledKinds = addableKinds && addableKinds.length > 0
    ? addableKinds
    : ['text', 'table', 'graph', 'checklist', 'accordion'];

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (plusMenuState) {
        setPlusMenuState(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [plusMenuState]);

  const handleApplyPlusCommand = (command: SlashCommand, afterBrickId: string) => {
    if (command.id === "mention-person" || command.id === "mention-page") {
      setPickerState({
        isOpen: true,
        filter: command.id === "mention-person" ? ["user"] : ["document", "board", "mesh"],
        triggerBrickId: afterBrickId,
      });
      return;
    }

    const kindToInsert = command.blockKind || "text";
    onAddBrick(kindToInsert, afterBrickId);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = bricks.findIndex((b) => b.id === active.id);
      const newIndex = bricks.findIndex((b) => b.id === over.id);

      if (oldIndex === -1 || newIndex === -1) {
        if (onCrossContainerDrop) {
          onCrossContainerDrop(active.id as string, over.id as string);
        }
        return;
      }

      const newOrder = [...bricks];
      const [moved] = newOrder.splice(oldIndex, 1);
      newOrder.splice(newIndex, 0, moved);

      onReorderBricks(newOrder.map((b) => b.id));
    }
  };

  const handleAddBelow = (brickId: string, rect?: DOMRect | null) => {
    if (rect) {
      let top = rect.bottom + 8;
      let left = rect.left;

      const menuHeight = 320;
      const menuWidth = 320;
      if (typeof window !== "undefined") {
        if (top + menuHeight > window.innerHeight) {
          top = Math.max(12, rect.top - menuHeight - 8);
        }
        if (left + menuWidth > window.innerWidth) {
          left = window.innerWidth - menuWidth - 12;
        }
      }

      setPlusMenuState({ brickId, top, left });
    } else {
      onAddBrick("text", brickId);
    }
  };

  const handlePickerSelect = (item: ReferencePickerSelection) => {
    const targetBrick = bricks.find((b) => b.id === pickerState?.triggerBrickId);
    if (targetBrick && targetBrick.kind === "text") {
      const currentText = targetBrick.content?.text || targetBrick.markdown || "";
      const newText = currentText ? `${currentText} ${item.token}` : item.token;
      onUpdateBrick(targetBrick.id, { ...targetBrick.content, text: newText, markdown: newText });
    } else {
      onAddBrick("text", pickerState?.triggerBrickId, { text: item.token, markdown: item.token });
    }
    setPickerState(null);
  };

  const sortedBricks = [...bricks].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

  return {
    activeId,
    setActiveId,
    plusMenuState,
    setPlusMenuState,
    plusMenuHoverIndex,
    setPlusMenuHoverIndex,
    pickerState,
    setPickerState,
    enabledKinds,
    sortedBricks,
    handleApplyPlusCommand,
    handleDragEnd,
    handleAddBelow,
    handlePickerSelect,
  };
};
