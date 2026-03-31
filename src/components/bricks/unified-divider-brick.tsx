"use client";

import React from "react";
import { cn } from "@/lib/utils";

interface DividerBrickProps {
  id: string;
  readonly?: boolean;
}

export const UnifiedDividerBrick: React.FC<DividerBrickProps> = ({ id, readonly }) => {
  return (
    <div className={cn("py-4 select-none", !readonly && "cursor-pointer")} contentEditable={false}>
      <hr className="border-t-2 border-muted-foreground/20 rounded-full" />
    </div>
  );
};
