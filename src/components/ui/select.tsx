"use client";

import { ChevronDown } from "lucide-react";
import { forwardRef } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "size"> {
  options: SelectOption[];
  /**
   * Placeholder shown as the first disabled option when value is empty.
   * The native select value must be "" for this to appear selected.
   */
  placeholder?: string;
  /**
   * Visual size variant.
   * "sm" → h-8 / text-xs | "md" → h-10 / text-sm (default)
   */
  sizeVariant?: "sm" | "md";
  wrapperClassName?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      options,
      placeholder,
      sizeVariant = "md",
      wrapperClassName = "",
      className = "",
      ...props
    },
    ref,
  ) => {
    const heightCls = sizeVariant === "sm" ? "h-8 text-xs" : "h-10 text-sm";

    return (
      <div className={`relative ${wrapperClassName}`}>
        <select
          ref={ref}
          {...props}
          className={[
            "w-full appearance-none rounded-md border border-input bg-background",
            "pl-3 pr-8 font-medium",
            heightCls,
            "ring-offset-background",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "transition-colors",
            className,
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {placeholder !== undefined && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value} disabled={opt.disabled}>
              {opt.label}
            </option>
          ))}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
      </div>
    );
  },
);

Select.displayName = "Select";
