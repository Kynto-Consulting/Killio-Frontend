"use client";

import React, { useEffect } from "react";
import { Palette, Maximize2 } from "lucide-react";

export interface PenToolbarProps {
  color: string;
  strokeWidth: number;
  onColorChange: (color: string) => void;
  onStrokeWidthChange: (width: number) => void;
}

export function PenToolbar({
  color,
  strokeWidth,
  onColorChange,
  onStrokeWidthChange,
}: PenToolbarProps) {
  return (
    <div className="absolute bottom-4 left-4 bg-white rounded-lg shadow-lg p-4 z-50 flex flex-col gap-3 border border-gray-200">
      <div className="text-xs font-bold text-gray-700">Pen Settings</div>

      {/* Color Picker */}
      <div className="flex items-center gap-2">
        <Palette className="h-4 w-4 text-gray-600" />
        <label className="text-xs font-semibold text-gray-600 min-w-12">Color:</label>
        <input
          type="color"
          value={color}
          onChange={(e) => onColorChange(e.target.value)}
          className="w-10 h-8 rounded cursor-pointer border border-gray-300"
          title="Select pen color"
        />
        <span className="text-xs text-gray-500 font-mono">{color}</span>
      </div>

      {/* Stroke Width Slider */}
      <div className="flex items-center gap-2">
        <Maximize2 className="h-4 w-4 text-gray-600" />
        <label className="text-xs font-semibold text-gray-600 min-w-12">Size:</label>
        <input
          type="range"
          min="0.5"
          max="10"
          step="0.5"
          value={strokeWidth}
          onChange={(e) => onStrokeWidthChange(parseFloat(e.target.value))}
          className="w-24 h-2 rounded-lg appearance-none cursor-pointer bg-gray-200"
          title="Adjust stroke width"
        />
        <span className="text-xs text-gray-600 font-mono min-w-8">
          {strokeWidth.toFixed(1)}px
        </span>
      </div>

      {/* Preview */}
      <div className="flex items-center gap-2 pt-2 border-t border-gray-200">
        <div className="text-xs text-gray-500">Preview:</div>
        <svg width={60} height={24} className="border border-gray-200 rounded">
          <line
            x1="5"
            y1="12"
            x2="55"
            y2="12"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
        </svg>
      </div>
    </div>
  );
}
