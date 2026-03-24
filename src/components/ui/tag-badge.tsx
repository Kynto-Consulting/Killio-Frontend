import { getClientLocale, translateNativeTagName } from "@/lib/native-tags";

export function TagBadge({ tag, className = "" }: { tag: any; className?: string }) {
  const normalizeColor = (raw?: string) => {
    if (!raw) return '#64748b';
    if (raw.startsWith('#')) return raw;
    return `#${raw}`;
  };

  const tagColorPalette = ['#ef4444', '#f59e0b', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899'];

  const pickColorForName = (name: string) => {
    let hash = 0;
    for (let i = 0; i < name.length; i += 1) {
      hash = (hash << 5) - hash + name.charCodeAt(i);
      hash |= 0;
    }
    const idx = Math.abs(hash) % tagColorPalette.length;
    return tagColorPalette[idx];
  };

  const color = normalizeColor(tag?.color) || pickColorForName(tag?.name || "tag");

  const style = {
    borderColor: `${color}66`,
    backgroundColor: `${color}22`,
    color,
  } as const;

  const locale = getClientLocale();
  const rawName = String(tag?.name || tag || '');
  const label = translateNativeTagName(rawName, locale);

  return (
    <span
      style={style}
      className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${className}`}
    >
      {label}
    </span>
  );
}
