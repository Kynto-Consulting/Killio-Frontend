const fs = require('fs');
let code = fs.readFileSync('src/components/bricks/inline-format-toolbar.tsx', 'utf8');

const sIdx = code.indexOf(`export const InlineFormatToolbar: React.FC<InlineFormatToolbarProps> = ({`);

const importReplaceCode = code.substring(0, sIdx).replace('import React, { useState } from "react";', 'import React, { useState, useRef, useLayoutEffect } from "react";');

const beforeCode = `export const InlineFormatToolbar: React.FC<InlineFormatToolbarProps> = ({
  position,
  onFormat,
  onAction,
  isVisible,
}) => {
  const t = useTranslations("document-detail");

  if (!isVisible) return null;

  return (
    <div
      className="absolute z-[999] flex flex-col gap-2 rounded-xl border border-border bg-popover/95 backdrop-blur-md p-2 shadow-2xl w-[260px] animate-in fade-in zoom-in-95 duration-100"
      style={{
        top: position.top,
        left: position.left,
        transform: "translate(-50%, -100%)",
        marginTop: "-12px",
      }}`;

const afterCode = `export const InlineFormatToolbar: React.FC<InlineFormatToolbarProps> = ({
  position,
  onFormat,
  onAction,
  isVisible,
}) => {
  const t = useTranslations("document-detail");
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [adjustedPos, setAdjustedPosition] = useState(position);

  useLayoutEffect(() => {
    if (isVisible && toolbarRef.current) {
      const rect = toolbarRef.current.getBoundingClientRect();
      const screenWidth = window.innerWidth;
      
      let newLeft = position.left;
      let newTop = position.top;

      if (newLeft - rect.width / 2 < 12) {
        newLeft = rect.width / 2 + 12;
      } else if (newLeft + rect.width / 2 > screenWidth - 12) {
        newLeft = screenWidth - rect.width / 2 - 12;
      }

      if (newTop - rect.height - 12 < 12) {
         newTop = 12 + rect.height + 12; 
      }
      
      setAdjustedPosition({ top: newTop, left: newLeft });
    } else {
      setAdjustedPosition(position);
    }
  }, [position, isVisible]);

  if (!isVisible) return null;

  return (
    <div
      ref={toolbarRef}
      className="absolute z-[999] flex flex-col gap-2 rounded-xl border border-border bg-popover/95 backdrop-blur-md p-2 shadow-xl w-[260px] animate-in fade-in zoom-in-95 duration-100"
      style={{
        top: adjustedPos.top,
        left: adjustedPos.left,
        transform: "translate(-50%, -100%)",
        marginTop: "-12px",
      }}`;

if (code.includes(beforeCode)) {
  code = importReplaceCode + code.substring(sIdx).replace(beforeCode, afterCode);
  fs.writeFileSync('src/components/bricks/inline-format-toolbar.tsx', code);
  console.log('Fixed inline toolbar bounding');
} else {
  console.log('Could not find beforeCode');
}
