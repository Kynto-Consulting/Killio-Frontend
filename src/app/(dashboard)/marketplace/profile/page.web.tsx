"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ChevronRight,
  ChevronDown,
  FileText,
  GitBranch,
  Globe,
  Layout,
  Link2,
  Lock,
  Package,
  Plus,
  RefreshCcw,
  Search,
  Sparkles,
  Upload,
  X,
  Zap,
  Check,
} from "lucide-react";

import { useI18n, useTranslations } from "@/components/providers/i18n-provider";
import { useSession } from "@/components/providers/session-provider";
import { BoardSummary, listTeamBoards, listTeamCatalog, TeamCatalog } from "@/lib/api/contracts";
import {
  createMarketplacePack,
  createMarketplaceSnapshot,
  listMarketplaceAssetSuggestions,
  listMyMarketplacePacks,
  MarketplaceAssetType,
  MarketplacePack,
  MarketplacePublishMode,
  MarketplaceVersionStatus,
  updateMarketplacePublishMode,
} from "@/lib/api/marketplace";
import { listScripts, ScriptSummary } from "@/lib/api/scripts";

/* ── types ── */
type SourceAsset = {
  key: string;
  assetType: MarketplaceAssetType;
  sourceEntityId: string;
  logicalKey: string;
  label: string;
};

type WizardStep = 1 | 2 | 3;

type WizardState = {
  step: WizardStep;
  title: string;
  slug: string;
  summary: string;
  publishMode: MarketplacePublishMode;
  selectedAssetKeys: string[];
  version: string;
  locale: string;
  snapshotStatus: MarketplaceVersionStatus;
  submitting: boolean;
  error: string | null;
};

type SnapModal = {
  pack: MarketplacePack;
  selectedAssetKeys: string[];
  version: string;
  status: MarketplaceVersionStatus;
  locale: string;
  title: string;
  submitting: boolean;
  error: string | null;
};

/* ── helpers ── */
function slugify(v: string) {
  return v.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 48);
}
function logicalPrefix(t: MarketplaceAssetType) {
  return t === "document" ? "doc" : t === "board" ? "board" : t === "mesh" ? "mesh" : "script";
}
function buildSourceAssets(catalog: TeamCatalog, boards: BoardSummary[], scripts: ScriptSummary[]): SourceAsset[] {
  const items: SourceAsset[] = [];
  const used = new Set<string>();
  const push = (assetType: MarketplaceAssetType, id: string, label: string) => {
    const base = `${logicalPrefix(assetType)}-${slugify(label) || id.slice(0, 8)}`;
    let key = base; let n = 2;
    while (used.has(key)) { key = `${base}-${n}`; n++; }
    used.add(key);
    items.push({ key: `${assetType}:${id}`, assetType, sourceEntityId: id, logicalKey: key, label });
  };
  for (const doc of catalog.documents) push("document", doc.id, doc.title);
  for (const b of boards) push(b.boardType === "kanban" ? "board" : "mesh", b.id, b.name);
  for (const s of scripts) push("script", s.id, s.name);
  return items;
}

function buildLocalizedReleaseKey(version: string, localeCode: string): string {
  const versionPart = version.trim() || "v1.0";
  const localePart = localeCode.trim().toLowerCase() || "en";
  return `${versionPart}@${localePart}`;
}

const LOCALE_PRESETS: Array<{ code: string; label: string }> = [
  { code: "en", label: "English" },
  { code: "es", label: "Espanol" },
  { code: "pt", label: "Portugues" },
  { code: "fr", label: "Francais" },
  { code: "de", label: "Deutsch" },
  { code: "it", label: "Italiano" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },
  { code: "zh-cn", label: "Chinese (Simplified)" },
  { code: "zh-tw", label: "Chinese (Traditional)" },
];

function sanitizeLocaleCode(input: string): string {
  return input.trim().toLowerCase();
}

function getLocaleOptions(locales: string[]): string[] {
  const valid = /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i;
  const unique = new Set<string>();
  for (const localeCode of locales) {
    const normalized = sanitizeLocaleCode(localeCode);
    if (!normalized || !valid.test(normalized)) continue;
    unique.add(normalized);
  }
  return Array.from(unique);
}

function getLocaleLabel(localeCode: string): string {
  const normalized = sanitizeLocaleCode(localeCode);
  const preset = LOCALE_PRESETS.find((p) => p.code === normalized);
  return preset ? `${preset.label} (${normalized})` : normalized;
}

function parseAssetKey(assetKey: string): { assetType: MarketplaceAssetType; sourceEntityId: string } | null {
  const parts = assetKey.split(":");
  if (parts.length !== 2) return null;
  const [assetType, sourceEntityId] = parts;
  if (!assetType || !sourceEntityId) return null;
  if (!(["document", "board", "mesh", "script"] as string[]).includes(assetType)) return null;
  return { assetType: assetType as MarketplaceAssetType, sourceEntityId };
}

/* ── asset type config ── */
const ASSET_TYPES: { type: MarketplaceAssetType; label: string; icon: typeof FileText; color: string }[] = [
  { type: "document", label: "Documents", icon: FileText,  color: "#818cf8" },
  { type: "board",    label: "Kanban",    icon: Layout,    color: "#f472b6" },
  { type: "mesh",     label: "Meshes",    icon: GitBranch, color: "#22d3ee" },
  { type: "script",   label: "Scripts",   icon: Zap,       color: "#fbbf24" },
];

const ASSET_TYPE_MAP: Record<MarketplaceAssetType, { label: string; icon: typeof FileText; color: string }> = {
  document: { label: "Documents", icon: FileText, color: "#818cf8" },
  board: { label: "Kanban", icon: Layout, color: "#f472b6" },
  mesh: { label: "Meshes", icon: GitBranch, color: "#22d3ee" },
  script: { label: "Scripts", icon: Zap, color: "#fbbf24" },
};

/* ── publish mode config ── */
const PUB_MODES: { mode: MarketplacePublishMode; label: string; sub: string; icon: typeof Lock; color: string }[] = [
  { mode: "private", label: "Private",  sub: "Only you",              icon: Lock,  color: "#94a3b8" },
  { mode: "link",    label: "Link only", sub: "Shared via link",       icon: Link2, color: "#fbbf24" },
  { mode: "public",  label: "Public",   sub: "Anyone can install",    icon: Globe, color: "#4ade80" },
];

function modeStyle(mode: MarketplacePublishMode) {
  if (mode === "public") return "border-[#4ade80]/30 bg-[#4ade80]/10 text-[#4ade80]";
  if (mode === "link")   return "border-[#fbbf24]/30 bg-[#fbbf24]/10 text-[#fbbf24]";
  return "border-white/10 bg-white/5 text-white/50";
}
function modeIcon(mode: MarketplacePublishMode) {
  if (mode === "public") return <Globe className="h-3 w-3" />;
  if (mode === "link")   return <Link2 className="h-3 w-3" />;
  return <Lock className="h-3 w-3" />;
}

/* ── custom dropdown components ── */
function LocaleDropdown({
  value,
  options,
  onChange,
}: {
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white transition-colors hover:border-white/20 focus:border-[#d8ff72]/40 focus:outline-none"
      >
        <span className="truncate">{getLocaleLabel(value)}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute top-full z-50 mt-1 w-full rounded-xl border border-white/10 bg-[#0c1018] shadow-lg">
          {options.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => {
                onChange(opt);
                setOpen(false);
              }}
              className={`w-full px-3 py-2 text-left text-sm transition-colors ${
                opt === value
                  ? "bg-[#d8ff72]/15 text-[#d8ff72]"
                  : "text-white hover:bg-white/5"
              } first:rounded-t-lg last:rounded-b-lg`}
            >
              {getLocaleLabel(opt)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusDropdown({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const label = options.find((o) => o.value === value)?.label || value;
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white transition-colors hover:border-white/20 focus:border-[#d8ff72]/40 focus:outline-none"
      >
        <span className="truncate capitalize">{label}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute top-full z-50 mt-1 w-full rounded-xl border border-white/10 bg-[#0c1018] shadow-lg">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
              className={`w-full px-3 py-2 text-left text-sm capitalize transition-colors ${
                opt.value === value
                  ? "bg-[#d8ff72]/15 text-[#d8ff72]"
                  : "text-white hover:bg-white/5"
              } first:rounded-t-lg last:rounded-b-lg`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PublishModeDropdown({
  value,
  onChange,
}: {
  value: MarketplacePublishMode;
  onChange: (value: MarketplacePublishMode) => void;
}) {
  const [open, setOpen] = useState(false);
  const modes = [
    { mode: "private" as const, label: "Private", icon: Lock },
    { mode: "link" as const, label: "Link", icon: Link2 },
    { mode: "public" as const, label: "Public", icon: Globe },
  ];
  const current = modes.find((m) => m.mode === value);
  const CurrentIcon = current?.icon || Lock;
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold transition-colors ${modeStyle(value)} hover:border-white/20`}
      >
        <CurrentIcon className="h-3 w-3" />
        <span>{current?.label || "Select"}</span>
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-40 rounded-xl border border-white/10 bg-[#0c1018] shadow-lg">
          {modes.map((m) => {
            const Icon = m.icon;
            return (
              <button
                key={m.mode}
                type="button"
                onClick={() => {
                  onChange(m.mode);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors ${
                  m.mode === value
                    ? "bg-[#d8ff72]/15 text-[#d8ff72]"
                    : "text-white hover:bg-white/5"
                } first:rounded-t-lg last:rounded-b-lg`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{m.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── asset picker ── */
function AssetPicker({
  assets,
  selectedKeys,
  onSelectionChange,
  loading,
  accessToken,
  teamId,
}: {
  assets: SourceAsset[];
  selectedKeys: string[];
  onSelectionChange: (next: string[]) => void;
  loading: boolean;
  accessToken?: string | null;
  teamId?: string | null;
}) {
  const [openType, setOpenType] = useState<MarketplaceAssetType | null>(null);
  const [search, setSearch] = useState("");
  const [suggestedKeys, setSuggestedKeys] = useState<string[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionsError, setSuggestionsError] = useState<string | null>(null);

  const selectedSet = useMemo(() => new Set(selectedKeys), [selectedKeys]);
  const assetsByKey = useMemo(() => new Map(assets.map((asset) => [asset.key, asset])), [assets]);

  const assetsByType = useMemo(() => {
    const grouped: Record<MarketplaceAssetType, SourceAsset[]> = {
      document: [],
      board: [],
      mesh: [],
      script: [],
    };
    for (const asset of assets) {
      grouped[asset.assetType].push(asset);
    }
    return grouped;
  }, [assets]);

  const selectedCountByType = useMemo(() => {
    const grouped: Record<MarketplaceAssetType, number> = {
      document: 0,
      board: 0,
      mesh: 0,
      script: 0,
    };
    for (const selectedKey of selectedKeys) {
      const parsed = parseAssetKey(selectedKey);
      if (!parsed) continue;
      grouped[parsed.assetType] += 1;
    }
    return grouped;
  }, [selectedKeys]);

  const openTypeAssets = useMemo(() => {
    if (!openType) return [];
    const query = search.trim().toLowerCase();
    const base = assetsByType[openType] ?? [];
    if (!query) return base;
    return base.filter((asset) => `${asset.label} ${asset.logicalKey}`.toLowerCase().includes(query));
  }, [assetsByType, openType, search]);

  const suggestedAssets = useMemo(
    () => suggestedKeys.map((assetKey) => assetsByKey.get(assetKey)).filter((asset): asset is SourceAsset => Boolean(asset)),
    [assetsByKey, suggestedKeys],
  );

  const toggleAsset = useCallback((assetKey: string) => {
    const nextSet = new Set(selectedKeys);
    if (nextSet.has(assetKey)) nextSet.delete(assetKey);
    else nextSet.add(assetKey);
    onSelectionChange(Array.from(nextSet));
  }, [onSelectionChange, selectedKeys]);

  const addMany = useCallback((assetKeys: string[]) => {
    const nextSet = new Set(selectedKeys);
    for (const assetKey of assetKeys) {
      nextSet.add(assetKey);
    }
    onSelectionChange(Array.from(nextSet));
  }, [onSelectionChange, selectedKeys]);

  useEffect(() => {
    if (!openType) {
      setSearch("");
      setSuggestedKeys([]);
      setSuggestionsError(null);
      setSuggestionsLoading(false);
      return;
    }

    if (!teamId || !accessToken) {
      setSuggestedKeys([]);
      setSuggestionsError(null);
      return;
    }

    const selectedAssets = selectedKeys
      .map((assetKey) => assetsByKey.get(assetKey))
      .filter((asset): asset is SourceAsset => Boolean(asset))
      .map((asset) => ({ assetType: asset.assetType, sourceEntityId: asset.sourceEntityId }));

    if (selectedAssets.length === 0) {
      setSuggestedKeys([]);
      setSuggestionsError(null);
      return;
    }

    let cancelled = false;
    setSuggestionsLoading(true);
    setSuggestionsError(null);

    listMarketplaceAssetSuggestions(
      teamId,
      {
        selectedAssets,
        targetType: openType,
        limit: 16,
      },
      accessToken,
    )
      .then((response) => {
        if (cancelled) return;
        const keys = response.suggestions
          .map((item) => `${item.assetType}:${item.sourceEntityId}`)
          .filter((assetKey) => assetsByKey.has(assetKey) && !selectedSet.has(assetKey));
        setSuggestedKeys(Array.from(new Set(keys)));
      })
      .catch((error) => {
        if (cancelled) return;
        setSuggestedKeys([]);
        setSuggestionsError(error instanceof Error ? error.message : "Could not load suggestions");
      })
      .finally(() => {
        if (cancelled) return;
        setSuggestionsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, assetsByKey, openType, selectedKeys, selectedSet, teamId]);

  if (loading) {
    return <div className="flex items-center justify-center py-8 text-sm text-white/30"><RefreshCcw className="mr-2 h-4 w-4 animate-spin" />Loading workspace assets…</div>;
  }
  if (assets.length === 0) {
    return <div className="flex flex-col items-center py-8 text-center"><Package className="h-8 w-8 text-white/15" /><p className="mt-2 text-sm text-white/30">No assets found in this workspace.</p></div>;
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {ASSET_TYPES.map((assetType) => {
          const Icon = assetType.icon;
          const selectedCount = selectedCountByType[assetType.type];
          const totalCount = assetsByType[assetType.type].length;
          return (
            <button
              key={assetType.type}
              type="button"
              onClick={() => setOpenType(assetType.type)}
              className="group flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-left transition-all hover:border-white/20 hover:bg-white/[0.06]"
            >
              <div
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border"
                style={{ background: `${assetType.color}18`, borderColor: `${assetType.color}40`, color: assetType.color }}
              >
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-white">{assetType.label}</p>
                <p className="mt-0.5 text-xs text-white/40">{selectedCount} selected of {totalCount}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-white/35 transition-transform group-hover:translate-x-0.5" />
            </button>
          );
        })}
      </div>

      {selectedKeys.length > 0 ? (
        <div className="rounded-xl border border-white/8 bg-black/20 p-3">
          <p className="text-xs font-semibold text-white/45">Selected assets</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {selectedKeys.slice(0, 12).map((selectedKey) => {
              const selectedAsset = assetsByKey.get(selectedKey);
              if (!selectedAsset) return null;
              return (
                <button
                  key={selectedKey}
                  type="button"
                  onClick={() => toggleAsset(selectedKey)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[#d8ff72]/35 bg-[#d8ff72]/10 px-3 py-1 text-xs font-semibold text-[#d8ff72] transition-colors hover:bg-[#d8ff72]/20"
                >
                  <X className="h-3 w-3" />
                  {selectedAsset.label}
                </button>
              );
            })}
            {selectedKeys.length > 12 ? (
              <span className="inline-flex items-center rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-white/45">
                +{selectedKeys.length - 12} more
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      {openType ? (
        <div
          className="fixed inset-0 z-[190] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setOpenType(null);
            }
          }}
        >
          <div className="flex max-h-[86vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/12 bg-[#0c1018] shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-white/8 px-5 py-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/30">Choose assets</p>
                <h3 className="mt-1 text-lg font-extrabold text-white">{ASSET_TYPE_MAP[openType].label}</h3>
                <p className="mt-1 text-xs text-white/40">Pick items and get smart suggestions from real workspace references.</p>
              </div>
              <button
                type="button"
                onClick={() => setOpenType(null)}
                className="rounded-xl border border-white/10 bg-white/5 p-2 text-white/40 transition-colors hover:border-white/20 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="relative w-full sm:max-w-sm">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/30" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder={`Search ${ASSET_TYPE_MAP[openType].label.toLowerCase()}`}
                    className="w-full rounded-xl border border-white/10 bg-black/30 py-2 pl-8 pr-3 text-sm text-white outline-none transition-colors placeholder:text-white/25 focus:border-[#d8ff72]/40"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-white/45">
                    {openTypeAssets.length} visible
                  </span>
                  <button
                    type="button"
                    onClick={() => addMany(openTypeAssets.map((asset) => asset.key))}
                    className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/60 transition-colors hover:border-white/20 hover:text-white"
                  >
                    Add visible
                  </button>
                </div>
              </div>

              {suggestionsLoading ? (
                <div className="flex items-center text-xs text-white/45">
                  <RefreshCcw className="mr-2 h-3.5 w-3.5 animate-spin" /> Loading suggestions...
                </div>
              ) : null}

              {suggestionsError ? (
                <div className="rounded-xl border border-red-400/25 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                  {suggestionsError}
                </div>
              ) : null}

              {suggestedAssets.length > 0 ? (
                <div className="rounded-2xl border border-[#d8ff72]/20 bg-[#d8ff72]/8 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-[#d8ff72]">Suggested from your current selection</p>
                    <button
                      type="button"
                      onClick={() => addMany(suggestedAssets.map((asset) => asset.key))}
                      className="rounded-lg border border-[#d8ff72]/40 bg-[#d8ff72]/15 px-2.5 py-1 text-[11px] font-bold text-[#d8ff72] transition-colors hover:bg-[#d8ff72]/25"
                    >
                      Add all suggested
                    </button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {suggestedAssets.map((asset) => (
                      <button
                        key={`suggested-${asset.key}`}
                        type="button"
                        onClick={() => toggleAsset(asset.key)}
                        className="inline-flex items-center gap-1.5 rounded-full border border-[#d8ff72]/35 bg-[#d8ff72]/10 px-3 py-1 text-xs font-semibold text-[#d8ff72] transition-colors hover:bg-[#d8ff72]/20"
                      >
                        <Plus className="h-3 w-3" />
                        {asset.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {openTypeAssets.length === 0 ? (
                <div className="flex flex-col items-center rounded-2xl border border-dashed border-white/10 py-10 text-center">
                  <Package className="h-8 w-8 text-white/20" />
                  <p className="mt-2 text-sm text-white/35">No assets found for this filter.</p>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {openTypeAssets.map((asset) => {
                    const isSelected = selectedSet.has(asset.key);
                    const typeMeta = ASSET_TYPE_MAP[asset.assetType];
                    const Icon = typeMeta.icon;
                    return (
                      <button
                        key={asset.key}
                        type="button"
                        onClick={() => toggleAsset(asset.key)}
                        className={`flex items-start gap-3 rounded-2xl border p-3 text-left transition-all ${isSelected ? "border-[#d8ff72]/40 bg-[#d8ff72]/10" : "border-white/8 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]"}`}
                      >
                        <div
                          className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border"
                          style={{ background: `${typeMeta.color}18`, borderColor: `${typeMeta.color}3a`, color: typeMeta.color }}
                        >
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className={`truncate text-sm font-semibold ${isSelected ? "text-[#d8ff72]" : "text-white"}`}>{asset.label}</p>
                            {isSelected ? <Check className="h-4 w-4 shrink-0 text-[#d8ff72]" /> : null}
                          </div>
                          <p className="mt-1 text-xs text-white/35">{typeMeta.label}</p>
                          <p className="mt-1 truncate font-mono text-[11px] text-white/30">{asset.logicalKey}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-white/8 px-5 py-3">
              <span className="text-xs text-white/40">{selectedKeys.length} assets selected</span>
              <button
                type="button"
                onClick={() => setOpenType(null)}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-white/65 transition-colors hover:border-white/20 hover:text-white"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════════════════════ */
export function MarketplaceSellerProfilePageView({ compact = false }: { compact?: boolean } = {}) {
  const { locale } = useI18n();
  const t = useTranslations("marketplace");
  const { accessToken, activeTeamId, user } = useSession();

  const [packs, setPacks] = useState<MarketplacePack[]>([]);
  const [packsLoading, setPacksLoading] = useState(false);
  const [sourceAssets, setSourceAssets] = useState<SourceAsset[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyByPack, setBusyByPack] = useState<Record<string, boolean>>({});
  const [msgByPack, setMsgByPack] = useState<Record<string, string | null>>({});

  /* wizard */
  const [wizard, setWizard] = useState<WizardState | null>(null);
  /* snapshot modal */
  const [snapModal, setSnapModal] = useState<SnapModal | null>(null);

  /* ── loaders ── */
  const loadPacks = useCallback(async () => {
    if (!accessToken) return;
    setPacksLoading(true);
    try {
      const items = await listMyMarketplacePacks(accessToken);
      setPacks(items);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errors.loadTeam"));
    } finally {
      setPacksLoading(false);
    }
  }, [accessToken, t]);

  const loadAssets = useCallback(async () => {
    if (!accessToken || !activeTeamId) { setSourceAssets([]); return; }
    setAssetsLoading(true);
    try {
      const [catalog, boards, scripts] = await Promise.all([
        listTeamCatalog(activeTeamId, accessToken),
        listTeamBoards(activeTeamId, accessToken),
        listScripts(activeTeamId, accessToken),
      ]);
      setSourceAssets(buildSourceAssets(catalog, boards, scripts));
    } catch {
      setSourceAssets([]);
    } finally {
      setAssetsLoading(false);
    }
  }, [accessToken, activeTeamId]);

  useEffect(() => { loadPacks().catch(() => undefined); }, [loadPacks]);
  useEffect(() => { loadAssets().catch(() => undefined); }, [loadAssets]);

  const localeOptions = useMemo(
    () => getLocaleOptions([locale, ...LOCALE_PRESETS.map((preset) => preset.code), ...packs.map((pack) => pack.defaultLocale)]),
    [locale, packs],
  );

  /* ── open wizard ── */
  const openWizard = () => {
    setWizard({
      step: 1,
      title: "",
      slug: "",
      summary: "",
      publishMode: "private",
      selectedAssetKeys: [],
      version: "v1.0",
      locale,
      snapshotStatus: "published",
      submitting: false,
      error: null,
    });
  };

  /* ── wizard submit ── */
  const handleWizardSubmit = useCallback(async () => {
    if (!wizard || !accessToken || !activeTeamId) return;
    setWizard((w) => w ? { ...w, submitting: true, error: null } : w);
    try {
      const localeCode = sanitizeLocaleCode(wizard.locale || locale);
      const pack = await createMarketplacePack({ teamId: activeTeamId, slug: wizard.slug, title: wizard.title, summary: wizard.summary || undefined, publishMode: wizard.publishMode, defaultLocale: localeCode }, accessToken);

      if (wizard.selectedAssetKeys.length > 0) {
        const assetByKey = new Map(sourceAssets.map((a) => [a.key, a]));
        const assets = wizard.selectedAssetKeys.map((k) => assetByKey.get(k)).filter(Boolean).map((a) => ({ assetType: a!.assetType, sourceEntityId: a!.sourceEntityId, logicalKey: a!.logicalKey, displayName: a!.label }));
        await createMarketplaceSnapshot(
          pack.id,
          {
            version: wizard.version,
            status: wizard.snapshotStatus,
            assets,
            localizations: [{
              locale: localeCode,
              title: wizard.title,
              summary: wizard.summary || undefined,
              metadata: {
                releaseKey: buildLocalizedReleaseKey(wizard.version, localeCode),
              },
              isDefault: true,
            }],
          },
          accessToken,
        );
      }

      setWizard(null);
      await loadPacks();
    } catch (e) {
      setWizard((w) => w ? { ...w, submitting: false, error: e instanceof Error ? e.message : t("errors.createPack") } : w);
    }
  }, [accessToken, activeTeamId, locale, loadPacks, sourceAssets, t, wizard]);

  /* ── publish mode change ── */
  const handleModeChange = useCallback(async (packId: string, mode: MarketplacePublishMode) => {
    if (!accessToken) return;
    setBusyByPack((p) => ({ ...p, [packId]: true }));
    setMsgByPack((p) => ({ ...p, [packId]: null }));
    try {
      await updateMarketplacePublishMode(packId, mode, accessToken);
      await loadPacks();
      setMsgByPack((p) => ({ ...p, [packId]: t("feedback.modeUpdated") }));
    } catch (e) {
      setMsgByPack((p) => ({ ...p, [packId]: e instanceof Error ? e.message : t("errors.updateMode") }));
    } finally {
      setBusyByPack((p) => ({ ...p, [packId]: false }));
    }
  }, [accessToken, loadPacks, t]);

  /* ── snapshot submit ── */
  const handleSnapSubmit = useCallback(async () => {
    if (!snapModal || !accessToken) return;
    setSnapModal((s) => s ? { ...s, submitting: true, error: null } : s);
    try {
      const localeCode = sanitizeLocaleCode(snapModal.locale || locale);
      const assetByKey = new Map(sourceAssets.map((a) => [a.key, a]));
      const assets = snapModal.selectedAssetKeys.map((k) => assetByKey.get(k)).filter(Boolean).map((a) => ({ assetType: a!.assetType, sourceEntityId: a!.sourceEntityId, logicalKey: a!.logicalKey, displayName: a!.label }));
      await createMarketplaceSnapshot(
        snapModal.pack.id,
        {
          version: snapModal.version,
          status: snapModal.status,
          assets,
          localizations: [{
            locale: localeCode,
            title: snapModal.title,
            metadata: {
              releaseKey: buildLocalizedReleaseKey(snapModal.version, localeCode),
            },
            isDefault: true,
          }],
        },
        accessToken,
      );
      setMsgByPack((p) => ({ ...p, [snapModal.pack.id]: t("feedback.snapshotOk") }));
      setSnapModal(null);
      await loadPacks();
    } catch (e) {
      setSnapModal((s) => s ? { ...s, submitting: false, error: e instanceof Error ? e.message : t("errors.snapshot") } : s);
    }
  }, [accessToken, loadPacks, locale, snapModal, sourceAssets, t]);

  const cols = compact ? "grid-cols-1" : "grid-cols-1 xl:grid-cols-2";
  const displayName = user?.displayName || user?.username || "You";
  const initial = (displayName[0] ?? "U").toUpperCase();
  const totalInstalls = packs.reduce((s) => s, 0);

  return (
    <>
      <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">

        {/* ── HERO ── */}
        <div className="relative overflow-hidden rounded-2xl border border-white/8 bg-gradient-to-br from-[#060b12] to-[#020408] p-6 shadow-xl">
          <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[#d8ff72]/5 blur-3xl" />
          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#d8ff72]/30 bg-[#d8ff72]/10 px-3 py-0.5 text-[11px] font-bold uppercase tracking-[0.18em] text-[#d8ff72]">
                <Sparkles className="h-3 w-3" />
                {t("eyebrow")}
              </span>
              <h1 className="mt-2.5 text-2xl font-extrabold tracking-tight text-white">Sell &amp; Publish</h1>
              <p className="mt-1 text-sm text-white/45">Publish packs and share them with the world.</p>
            </div>
            <button
              type="button"
              onClick={() => { loadPacks().catch(() => undefined); loadAssets().catch(() => undefined); }}
              className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-semibold text-white/50 transition-all hover:border-white/20 hover:text-white"
            >
              <RefreshCcw className={`h-3.5 w-3.5 ${packsLoading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* ── PROFILE CARD ── */}
        <div className="flex flex-wrap items-center gap-5 rounded-2xl border border-white/8 bg-white/[0.03] p-5">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border-2 border-[#d8ff72]/30 bg-[#d8ff72]/10 text-[22px] font-extrabold text-[#d8ff72]">
            {initial}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-lg font-extrabold tracking-tight text-white">{displayName}</p>
            <p className="text-[13px] text-white/40">{user?.email ?? "Publisher"}</p>
          </div>
          <div className="flex items-center gap-8">
            <div className="text-center">
              <p className="text-xl font-extrabold text-white">{packs.length}</p>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-white/30">Packs</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-extrabold text-white">{totalInstalls}</p>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-white/30">Installs</p>
            </div>
          </div>
          <button
            type="button"
            onClick={openWizard}
            className="inline-flex items-center gap-2 rounded-xl bg-[#d8ff72] px-5 py-2.5 text-[13px] font-bold text-[#0a1200] shadow-sm transition-all hover:bg-[#c8ef60]"
          >
            <Plus className="h-4 w-4" />
            New pack
          </button>
        </div>

        {/* ── ERROR ── */}
        {error ? (
          <div className="flex items-start gap-2 rounded-xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </div>
        ) : null}

        {/* ── MY PACKS ── */}
        <section>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-[15px] font-bold text-white">My Packs</h2>
              <p className="mt-0.5 text-xs text-white/35">{packsLoading ? "Loading…" : `${packs.length} packs published`}</p>
            </div>
          </div>

          {packsLoading ? (
            <div className="flex items-center justify-center py-20 text-sm text-white/30">
              <RefreshCcw className="mr-2 h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : packs.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 py-20 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03]">
                <Package className="h-7 w-7 text-white/20" />
              </div>
              <p className="mt-4 text-[14px] font-semibold text-white/40">No packs yet.</p>
              <p className="mt-1 text-xs text-white/25">Create your first pack and share it with the world.</p>
              <button type="button" onClick={openWizard} className="mt-5 inline-flex items-center gap-1.5 rounded-xl bg-[#d8ff72] px-4 py-2 text-[13px] font-bold text-[#0a1200]">
                <Plus className="h-3.5 w-3.5" /> New pack
              </button>
            </div>
          ) : (
            <div className={`grid gap-4 ${cols}`}>
              {packs.map((pack) => {
                const busy = busyByPack[pack.id];
                return (
                  <article key={pack.id} className="flex flex-col overflow-hidden rounded-2xl border border-white/8 bg-white/[0.03] transition-all hover:border-white/12">
                    {/* head */}
                    <div className="flex items-start gap-3 p-5">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-[#d8ff72]">
                        <Sparkles className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate text-[15px] font-bold text-white">{pack.title}</h3>
                        <p className="mt-0.5 font-mono text-[11px] text-white/30">{pack.slug}</p>
                        <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-white/45">
                          {pack.summary ?? <span className="italic text-white/25">No description</span>}
                        </p>
                      </div>
                      {/* publish mode badge */}
                      <PublishModeDropdown
                        value={pack.publishMode}
                        onChange={(mode) => handleModeChange(pack.id, mode)}
                      />
                    </div>

                    {/* feedback */}
                    {msgByPack[pack.id] ? (
                      <div className="mx-5 mb-3 rounded-lg border border-[#4ade80]/20 bg-[#4ade80]/10 px-3 py-1.5 text-[12px] text-[#4ade80]">
                        {msgByPack[pack.id]}
                      </div>
                    ) : null}

                    {/* footer */}
                    <div className="mt-auto border-t border-white/6 p-4">
                      <button
                        type="button"
                        onClick={() => setSnapModal({ pack, selectedAssetKeys: [], version: "v1.0", status: "published", locale: sanitizeLocaleCode(pack.defaultLocale || locale), title: pack.title, submitting: false, error: null })}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-[13px] font-semibold text-white/60 transition-all hover:border-white/20 hover:text-white"
                      >
                        <Upload className="h-4 w-4" />
                        Publish snapshot
                        <ChevronRight className="ml-auto h-4 w-4" />
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* ════════════════════════════════════════════════════
          CREATE WIZARD MODAL
      ════════════════════════════════════════════════════ */}
      {wizard ? (
        <div className="fixed inset-0 z-[180] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/12 bg-[#0c1018] shadow-2xl">

            {/* wizard header */}
            <div className="flex shrink-0 items-center justify-between gap-4 border-b border-white/8 px-6 py-5">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/30">New pack</p>
                <h2 className="mt-0.5 text-[18px] font-extrabold tracking-tight text-white">
                  {wizard.step === 1 ? "Pack details" : wizard.step === 2 ? "Choose assets" : "First version"}
                </h2>
              </div>
              {/* step pills */}
              <div className="flex items-center gap-2">
                {([1, 2, 3] as WizardStep[]).map((s) => (
                  <div key={s} className={`flex h-7 w-7 items-center justify-center rounded-full text-[12px] font-bold transition-colors ${wizard.step === s ? "bg-[#d8ff72] text-[#0a1200]" : wizard.step > s ? "bg-[#d8ff72]/20 text-[#d8ff72]" : "bg-white/8 text-white/30"}`}>
                    {wizard.step > s ? <Check className="h-3.5 w-3.5" /> : s}
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => setWizard(null)} className="rounded-xl border border-white/10 bg-white/5 p-2 text-white/40 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* wizard body */}
            <div className="flex-1 overflow-y-auto px-6 py-5">

              {/* ── STEP 1: details ── */}
              {wizard.step === 1 && (
                <div className="space-y-5">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-white/35">Title</label>
                      <input
                        value={wizard.title}
                        onChange={(e) => setWizard((w) => w ? { ...w, title: e.target.value, slug: w.slug || slugify(e.target.value) } : w)}
                        className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-sm text-white outline-none transition-colors focus:border-[#d8ff72]/40"
                        placeholder="Ops Automation Kit"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-white/35">Slug</label>
                      <div className="relative mt-1.5">
                        <input
                          value={wizard.slug}
                          onChange={(e) => setWizard((w) => w ? { ...w, slug: slugify(e.target.value) } : w)}
                          className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 pr-8 text-sm text-white font-mono outline-none transition-colors focus:border-[#d8ff72]/40"
                          placeholder="ops-automation-kit"
                        />
                        {wizard.slug && <Check className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#4ade80]" />}
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-baseline justify-between">
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-white/35">Summary <span className="normal-case font-normal text-white/20">(optional)</span></label>
                      <span className="text-[10px] text-white/25">{wizard.summary.length} / 120</span>
                    </div>
                    <textarea
                      value={wizard.summary}
                      onChange={(e) => setWizard((w) => w ? { ...w, summary: e.target.value } : w)}
                      rows={3}
                      maxLength={120}
                      className="mt-1.5 w-full resize-none rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-sm text-white placeholder:text-white/25 outline-none transition-colors focus:border-[#d8ff72]/40"
                      placeholder="One-line description for discoverability"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-white/35">Visibility</label>
                    <div className="mt-2 grid grid-cols-3 gap-3">
                      {PUB_MODES.map(({ mode, label, sub, icon: Icon, color }) => {
                        const on = wizard.publishMode === mode;
                        return (
                          <button
                            key={mode}
                            type="button"
                            onClick={() => setWizard((w) => w ? { ...w, publishMode: mode } : w)}
                            className={`flex flex-col items-center gap-2 rounded-xl border py-4 text-center transition-all ${on ? "" : "border-white/8 bg-white/[0.03] hover:border-white/15"}`}
                            style={on ? { borderColor: `${color}40`, background: `${color}12` } : undefined}
                          >
                            <Icon className="h-5 w-5" style={{ color: on ? color : "#ffffff50" }} />
                            <div>
                              <p className="text-[13px] font-bold" style={{ color: on ? color : "#ffffff80" }}>{label}</p>
                              <p className="text-[10px] text-white/30">{sub}</p>
                            </div>
                            {on && <Check className="h-3.5 w-3.5" style={{ color }} />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* ── STEP 2: assets ── */}
              {wizard.step === 2 && (
                <div>
                  <div className="mb-4 flex items-center justify-between">
                    <p className="text-[13px] text-white/50">Select the assets to include in the first snapshot of your pack.</p>
                    {wizard.selectedAssetKeys.length > 0 && (
                      <span className="rounded-full border border-[#d8ff72]/30 bg-[#d8ff72]/10 px-2.5 py-0.5 text-[11px] font-bold text-[#d8ff72]">
                        {wizard.selectedAssetKeys.length} selected
                      </span>
                    )}
                  </div>
                  <AssetPicker
                    assets={sourceAssets}
                    selectedKeys={wizard.selectedAssetKeys}
                    onSelectionChange={(next) => setWizard((w) => (w ? { ...w, selectedAssetKeys: next } : w))}
                    loading={assetsLoading}
                    accessToken={accessToken}
                    teamId={activeTeamId}
                  />
                  <p className="mt-4 text-[12px] text-white/25">You can always add more assets later by publishing a new snapshot.</p>
                </div>
              )}

              {/* ── STEP 3: version ── */}
              {wizard.step === 3 && (
                <div className="space-y-5">
                  {/* review */}
                  <div className="rounded-xl border border-white/8 bg-white/[0.03] p-4">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-white/30">Pack summary</p>
                    <p className="mt-2 text-[15px] font-bold text-white">{wizard.title}</p>
                    <p className="mt-0.5 font-mono text-[11px] text-white/30">{wizard.slug}</p>
                    {wizard.summary && <p className="mt-2 text-[13px] text-white/45">{wizard.summary}</p>}
                    <div className="mt-3 flex items-center gap-3">
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${modeStyle(wizard.publishMode)}`}>
                        {modeIcon(wizard.publishMode)} {wizard.publishMode}
                      </span>
                      {wizard.selectedAssetKeys.length > 0 && (
                        <span className="text-[12px] text-white/35">{wizard.selectedAssetKeys.length} asset{wizard.selectedAssetKeys.length !== 1 ? "s" : ""} selected</span>
                      )}
                    </div>
                  </div>

                  {wizard.selectedAssetKeys.length > 0 && (
                    <div className="grid gap-4 sm:grid-cols-4">
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-white/35">Version</label>
                        <input
                          value={wizard.version}
                          onChange={(e) => setWizard((w) => w ? { ...w, version: e.target.value } : w)}
                          className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-[#d8ff72]/40"
                          placeholder="v1.0"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-white/35">Locale</label>
                        <LocaleDropdown
                          value={wizard.locale}
                          options={localeOptions}
                          onChange={(val) => setWizard((w) => (w ? { ...w, locale: sanitizeLocaleCode(val) } : w))}
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-white/35">Status</label>
                        <StatusDropdown
                          value={wizard.snapshotStatus}
                          options={[
                            { value: "published", label: "Published" },
                            { value: "draft", label: "Draft" },
                          ]}
                          onChange={(val) => setWizard((w) => w ? { ...w, snapshotStatus: val as MarketplaceVersionStatus } : w)}
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-white/35">Release key</label>
                        <input
                          value={buildLocalizedReleaseKey(wizard.version, wizard.locale)}
                          readOnly
                          className="mt-1.5 w-full rounded-xl border border-white/8 bg-black/20 px-3 py-2 font-mono text-xs text-white/55 outline-none"
                        />
                      </div>
                    </div>
                  )}

                  {wizard.selectedAssetKeys.length === 0 && (
                    <div className="rounded-xl border border-white/8 bg-white/[0.02] px-4 py-3 text-[13px] text-white/35">
                      No assets selected — the pack will be created without a first snapshot. You can publish a snapshot later.
                    </div>
                  )}
                </div>
              )}

              {wizard.error ? (
                <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {wizard.error}
                </div>
              ) : null}
            </div>

            {/* wizard footer */}
            <div className="flex shrink-0 items-center justify-between border-t border-white/8 px-6 py-4">
              <button
                type="button"
                onClick={() => wizard.step === 1 ? setWizard(null) : setWizard((w) => w ? { ...w, step: (w.step - 1) as WizardStep } : w)}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white/50 transition-colors hover:border-white/20 hover:text-white"
              >
                {wizard.step === 1 ? "Cancel" : "Back"}
              </button>

              {wizard.step < 3 ? (
                <button
                  type="button"
                  disabled={wizard.step === 1 && (!wizard.title.trim() || !wizard.slug.trim())}
                  onClick={() => setWizard((w) => w ? { ...w, step: (w.step + 1) as WizardStep } : w)}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#d8ff72] px-5 py-2 text-sm font-bold text-[#0a1200] shadow-sm transition-all hover:bg-[#c8ef60] disabled:opacity-40"
                >
                  Continue
                  <ChevronRight className="h-4 w-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleWizardSubmit}
                  disabled={wizard.submitting}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#d8ff72] px-5 py-2 text-sm font-bold text-[#0a1200] shadow-sm transition-all hover:bg-[#c8ef60] disabled:opacity-40"
                >
                  <Plus className="h-4 w-4" />
                  {wizard.submitting ? "Creating…" : "Create pack"}
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* ════════════════════════════════════════════════════
          SNAPSHOT MODAL
      ════════════════════════════════════════════════════ */}
      {snapModal ? (
        <div className="fixed inset-0 z-[180] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-white/12 bg-[#0c1018] shadow-2xl">

            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-white/8 px-6 py-5">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/30">Publish snapshot</p>
                <h2 className="mt-0.5 text-[17px] font-extrabold tracking-tight text-white">{snapModal.pack.title}</h2>
                <p className="mt-0.5 font-mono text-[11px] text-white/30">{snapModal.pack.slug}</p>
              </div>
              <button type="button" onClick={() => setSnapModal(null)} className="rounded-xl border border-white/10 bg-white/5 p-2 text-white/40 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              {/* version meta */}
              <div className="grid gap-3 sm:grid-cols-4">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-white/35">Version</label>
                  <input
                    value={snapModal.version}
                    onChange={(e) => setSnapModal((s) => s ? { ...s, version: e.target.value } : s)}
                    className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-[#d8ff72]/40"
                    placeholder="v1.0"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-white/35">Locale</label>
                  <LocaleDropdown
                    value={snapModal.locale}
                    options={localeOptions}
                    onChange={(val) => setSnapModal((s) => s ? { ...s, locale: sanitizeLocaleCode(val) } : s)}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-white/35">Status</label>
                  <StatusDropdown
                    value={snapModal.status}
                    options={[
                      { value: "published", label: "Published" },
                      { value: "draft", label: "Draft" },
                      { value: "archived", label: "Archived" },
                    ]}
                    onChange={(val) => setSnapModal((s) => s ? { ...s, status: val as MarketplaceVersionStatus } : s)}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-white/35">Release key</label>
                  <input
                    value={buildLocalizedReleaseKey(snapModal.version, snapModal.locale)}
                    readOnly
                    className="mt-1.5 w-full rounded-xl border border-white/8 bg-black/20 px-3 py-2 font-mono text-xs text-white/55 outline-none"
                  />
                </div>
              </div>

              {/* title */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-white/35">Snapshot title</label>
                <input
                  value={snapModal.title}
                  onChange={(e) => setSnapModal((s) => s ? { ...s, title: e.target.value } : s)}
                  className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-[#d8ff72]/40"
                />
              </div>

              {/* asset picker */}
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-white/35">Include assets</label>
                  {snapModal.selectedAssetKeys.length > 0 && (
                    <span className="rounded-full border border-[#d8ff72]/30 bg-[#d8ff72]/10 px-2 py-0.5 text-[10px] font-bold text-[#d8ff72]">
                      {snapModal.selectedAssetKeys.length} selected
                    </span>
                  )}
                </div>
                <AssetPicker
                  assets={sourceAssets}
                  selectedKeys={snapModal.selectedAssetKeys}
                  onSelectionChange={(next) => setSnapModal((s) => (s ? { ...s, selectedAssetKeys: next } : s))}
                  loading={assetsLoading}
                  accessToken={accessToken}
                  teamId={activeTeamId}
                />
              </div>

              {snapModal.error ? (
                <div className="flex items-start gap-2 rounded-xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {snapModal.error}
                </div>
              ) : null}
            </div>

            <div className="flex shrink-0 items-center justify-end gap-3 border-t border-white/8 px-6 py-4">
              <button type="button" onClick={() => setSnapModal(null)} className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white/50 transition-colors hover:border-white/20 hover:text-white">
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSnapSubmit}
                disabled={snapModal.submitting || !snapModal.version.trim()}
                className="inline-flex items-center gap-2 rounded-xl bg-[#d8ff72] px-5 py-2 text-sm font-bold text-[#0a1200] shadow-sm transition-all hover:bg-[#c8ef60] disabled:opacity-40"
              >
                <Upload className="h-4 w-4" />
                {snapModal.submitting ? "Publishing…" : "Publish snapshot"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

export default MarketplaceSellerProfilePageView;
