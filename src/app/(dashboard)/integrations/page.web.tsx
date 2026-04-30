"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useSession } from "@/components/providers/session-provider";
import { useI18n, useTranslations } from "@/components/providers/i18n-provider";
import {
  ApplyScriptPresetResult,
  SharedKillioTable,
  ScriptSummary,
  ScriptGraph,
  ScriptMonthlyUsage,
  ScriptPresetDefinition,
  applyScriptPreset,
  listScripts,
  listScriptPresets,
  createScript,
  toggleScript,
  deleteScript,
  saveScriptGraph,
  getScriptGraph,
  getScriptsUsage,
  listSharedTables,
  runManualScript,
} from "@/lib/api/scripts";
import {
  GithubAppInstallation,
  GithubInstallationBranch,
  GithubInstallationRepository,
  listGithubInstallationBranches,
  listGithubInstallationRepositories,
  listGithubInstallations,
} from "@/lib/api/integrations";
import {
  BoardSummary,
  ListView,
  getBoard,
  listTeamBoards,
} from "@/lib/api/contracts";
import { ScriptList } from "@/components/scripts/ScriptList";
import { ScriptCanvas } from "@/components/scripts/ScriptCanvas";
import { KillioTable } from "../../../components/scripts/KillioTable";
import { RunLogsPanel } from "@/components/scripts/RunLogsPanel";
import { GithubIntegrationPanel } from "@/components/scripts/GithubIntegrationPanel";
import { WhatsappIntegrationPanel } from "@/components/scripts/WhatsappIntegrationPanel";
import { SlackWebhookIntegrationPanel } from "@/components/scripts/SlackWebhookIntegrationPanel";
import { NotionIntegrationPanel } from "@/components/scripts/NotionIntegrationPanel";
import { TrelloIntegrationPanel } from "@/components/scripts/TrelloIntegrationPanel";
import { ScriptLogicGuide } from "@/components/scripts/ScriptLogicGuide";
import { useActiveTeamRole } from "@/hooks/use-active-team-role";
import scriptPresetsCatalog from "@/config/script-presets.json";
import { Zap, Loader2, BarChart3, Globe, SquareKanban, Clock3, X, CheckCircle2, AlertCircle, Trash2, CreditCard } from "lucide-react";

type Tab = "integrations" | "scripts" | "table";
type ScriptSubView = "canvas" | "runs";

interface CreateScriptForm {
  name: string;
  description: string;
}

type PresetRequirementType = "github_installation";
type PresetTableMode = "existing" | "new";

interface PresetRequirementConfig {
  type: PresetRequirementType;
  messageKey: string;
}

interface PresetFieldConfig {
  id: string;
  param: string;
  type: "text";
  required: boolean;
  labelKey: string;
  placeholderKey: string;
  defaultValue?: string;
}

interface PresetCatalogEntry {
  id: string;
  titleKey: string;
  descriptionKey: string;
  summaryKey: string;
  requirements: PresetRequirementConfig[];
  fields: PresetFieldConfig[];
}

const PRESET_CATALOG: PresetCatalogEntry[] = scriptPresetsCatalog.presets as PresetCatalogEntry[];

const TABS: { id: Tab; label: string }[] = [
  { id: "integrations", label: "tabs.integrations" },
  { id: "scripts", label: "tabs.scripts" },
  { id: "table", label: "tabs.table" },
];

function ComingSoonIntegrationCard({
  title,
  description,
  icon: Icon,
  badge,
  actionLabel,
  onAction,
  actionDisabled,
}: {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  badge: string;
  actionLabel?: string;
  onAction?: () => void;
  actionDisabled?: boolean;
}) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.035)",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 14,
      padding: 20,
      opacity: 0.65,
      transition: "border-color .15s, transform .15s",
      display: "flex",
      flexDirection: "column",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", flexShrink: 0,
            color: "rgba(255,255,255,0.45)",
          }}>
            <Icon className="h-4 w-4" />
          </div>
          <span style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>{title}</span>
        </div>
        <span style={{
          fontSize: 10, fontWeight: 700, padding: "3px 9px", borderRadius: 999, letterSpacing: "0.06em",
          textTransform: "uppercase", color: "rgba(255,255,255,0.45)",
          background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.08)",
        }}>{badge}</span>
      </div>
      <p style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", lineHeight: 1.55, marginBottom: 14, flex: 1 }}>{description}</p>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        {actionLabel ? (
          <button
            type="button"
            onClick={onAction}
            disabled={actionDisabled || !onAction}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6, height: 30, padding: "0 12px", borderRadius: 8,
              fontSize: 12, fontWeight: 600, cursor: "pointer", border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(255,255,255,0.035)", color: "rgba(255,255,255,0.6)",
            }}
          >
            <Clock3 className="h-3.5 w-3.5" />
            {actionLabel}
          </button>
        ) : (
          <button
            type="button"
            disabled
            style={{
              display: "inline-flex", alignItems: "center", gap: 6, height: 30, padding: "0 12px", borderRadius: 8,
              fontSize: 12, fontWeight: 600, cursor: "not-allowed", border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(255,255,255,0.035)", color: "rgba(255,255,255,0.4)", opacity: 0.6,
            }}
          >
            <Clock3 className="h-3.5 w-3.5" />
            Notify me
          </button>
        )}
      </div>
    </div>
  );
}

export function IntegrationsPageView({ mobileScriptsOptimized = false }: { mobileScriptsOptimized?: boolean } = {}) {
  const router = useRouter();
  const { locale } = useI18n();
  const t = useTranslations("integrations");
  const { user, accessToken, activeTeamId } = useSession();
  const { role, isAdmin, isLoading: isRoleLoading } = useActiveTeamRole(activeTeamId, accessToken, user?.id);

  const [tab, setTab] = useState<Tab>(mobileScriptsOptimized ? "scripts" : "integrations");
  const [scripts, setScripts] = useState<ScriptSummary[]>([]);
  const [scriptsLoading, setScriptsLoading] = useState(false);
  const [selectedScript, setSelectedScript] = useState<ScriptSummary | null>(null);

  // Portal targets
  const [sidebarOptionsEl, setSidebarOptionsEl] = useState<Element | null>(null);
  const [mobileSidebarOptionsEl, setMobileSidebarOptionsEl] = useState<Element | null>(null);
  const [navbarUsageSlotEl, setNavbarUsageSlotEl] = useState<Element | null>(null);

  useEffect(() => {
    const checkDomElements = () => {
      const side = document.getElementById("sidebar-scripts-options");
      const mobSide = document.getElementById("sidebar-scripts-options-mobile");
      const navSlot = document.getElementById("navbar-usage-slot");

      setSidebarOptionsEl((prev) => (prev === side ? prev : side));
      setMobileSidebarOptionsEl((prev) => (prev === mobSide ? prev : mobSide));
      setNavbarUsageSlotEl((prev) => (prev === navSlot ? prev : navSlot));
    };

    checkDomElements();

    const observer = new MutationObserver(checkDomElements);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, []);
  const [scriptSubView, setScriptSubView] = useState<ScriptSubView>("canvas");
  const [graph, setGraph] = useState<ScriptGraph | null>(null);
  const [graphLoading, setGraphLoading] = useState(false);
  const [usage, setUsage] = useState<ScriptMonthlyUsage | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const [presets, setPresets] = useState<ScriptPresetDefinition[]>([]);
  const [presetsLoading, setPresetsLoading] = useState(false);
  const [applyingPresetId, setApplyingPresetId] = useState<string | null>(null);
  const [presetError, setPresetError] = useState<string | null>(null);
  const [presetResult, setPresetResult] = useState<ApplyScriptPresetResult | null>(null);
  const [showPresetModal, setShowPresetModal] = useState(false);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [presetValues, setPresetValues] = useState<Record<string, string>>({});
  const [githubInstallations, setGithubInstallations] = useState<GithubAppInstallation[]>([]);
  const [presetTables, setPresetTables] = useState<SharedKillioTable[]>([]);
  const [presetBoards, setPresetBoards] = useState<BoardSummary[]>([]);
  const [presetListsByBoard, setPresetListsByBoard] = useState<Record<string, ListView[]>>({});
  const [presetRepositories, setPresetRepositories] = useState<GithubInstallationRepository[]>([]);
  const [presetBranches, setPresetBranches] = useState<GithubInstallationBranch[]>([]);
  const [presetReposLoading, setPresetReposLoading] = useState(false);
  const [presetBranchesLoading, setPresetBranchesLoading] = useState(false);
  const [presetTableMode, setPresetTableMode] = useState<PresetTableMode>("existing");
  const [presetContextLoading, setPresetContextLoading] = useState(false);
  const [showMetaTutorialModal, setShowMetaTutorialModal] = useState(false);
  const [showMobileScriptList, setShowMobileScriptList] = useState(true);

  // Create form state
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<CreateScriptForm>({
    name: "",
    description: "",
  });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    if (!mobileScriptsOptimized) return;
    setTab("scripts");
  }, [mobileScriptsOptimized]);

  useEffect(() => {
    if (!mobileScriptsOptimized) return;
    if (selectedScript) {
      setShowMobileScriptList(false);
    }
  }, [mobileScriptsOptimized, selectedScript]);

  useEffect(() => {
    if (!isRoleLoading && activeTeamId && accessToken && role && !isAdmin) {
      router.replace("/");
    }
  }, [isRoleLoading, activeTeamId, accessToken, role, isAdmin, router]);

  // ──────────────────────────────────────────────────────────────────────────
  // Load scripts when tab becomes active or team changes
  // ──────────────────────────────────────────────────────────────────────────

  const loadScripts = useCallback(async () => {
    if (!accessToken || !activeTeamId || !isAdmin) return;
    setScriptsLoading(true);
    try {
      const data = await listScripts(activeTeamId, accessToken);
      setScripts(data);
    } finally {
      setScriptsLoading(false);
    }
  }, [accessToken, activeTeamId, isAdmin]);

  useEffect(() => {
    if (isAdmin && (tab === "scripts" || tab === "table")) {
      loadScripts();
    }
  }, [tab, loadScripts, isAdmin]);

  useEffect(() => {
    if (!accessToken || !activeTeamId || !isAdmin) return;

    setUsageLoading(true);
    getScriptsUsage(activeTeamId, accessToken)
      .then(setUsage)
      .catch(() => setUsage(null))
      .finally(() => setUsageLoading(false));
  }, [accessToken, activeTeamId, isAdmin]);

  useEffect(() => {
    if (!accessToken || !activeTeamId || !isAdmin || tab !== "scripts") return;

    setPresetsLoading(true);
    listScriptPresets(activeTeamId, accessToken)
      .then(setPresets)
      .catch(() => setPresets([]))
      .finally(() => setPresetsLoading(false));
  }, [accessToken, activeTeamId, isAdmin, tab]);

  const presetCatalogById = useMemo(
    () => new Map(PRESET_CATALOG.map((entry) => [entry.id, entry])),
    [],
  );

  const selectedPresetCatalog = useMemo(
    () => (selectedPresetId ? (presetCatalogById.get(selectedPresetId) ?? null) : null),
    [presetCatalogById, selectedPresetId],
  );

  const activeGithubInstallations = useMemo(
    () => githubInstallations.filter((installation) => installation.isActive),
    [githubInstallations],
  );

  const isGithubPresetSelected = selectedPresetId === "github";
  const selectedInstallationId = Number(presetValues.installationId ?? "");
  const selectedBoardId = presetValues.boardId ?? "";
  const selectedListId = presetValues.listId ?? "";
  const selectedRepoFullName = presetValues.repoFullName ?? "";
  const selectedBranch = presetValues.branch ?? "";

  const selectedBoardLists = useMemo(
    () => (selectedBoardId ? (presetListsByBoard[selectedBoardId] ?? []) : []),
    [selectedBoardId, presetListsByBoard],
  );

  const selectedExistingTableName = useMemo(() => {
    const tableId = presetValues.existingTableId;
    if (!tableId) return "";
    return presetTables.find((table) => table.id === tableId)?.name ?? "";
  }, [presetValues.existingTableId, presetTables]);

  const initializePresetValues = useCallback((presetId: string | null) => {
    if (!presetId) {
      setPresetValues({});
      return;
    }

    const catalogPreset = presetCatalogById.get(presetId);
    if (!catalogPreset) {
      setPresetValues({});
      return;
    }

    const nextValues: Record<string, string> = {};
    for (const field of catalogPreset.fields) {
      nextValues[field.id] = field.defaultValue ?? "";
    }

    if (presetId === "github") {
      nextValues.installationId = "";
      nextValues.existingTableId = "";
      nextValues.newKillioTableName = nextValues.killioTableName ?? "GitHub Preset KillioTable";
      nextValues.repoFullName = nextValues.repoFullName ?? "";
      nextValues.branch = nextValues.branch ?? "";
      nextValues.boardId = nextValues.boardId ?? "";
      nextValues.listId = nextValues.listId ?? "";
    }

    setPresetValues(nextValues);
  }, [presetCatalogById]);

  useEffect(() => {
    if (!showPresetModal || !accessToken || !activeTeamId) return;

    setPresetContextLoading(true);
    setPresetRepositories([]);
    setPresetBranches([]);
    setPresetListsByBoard({});
    Promise.all([
      listGithubInstallations(activeTeamId, accessToken).catch(() => [] as GithubAppInstallation[]),
      listSharedTables(activeTeamId, accessToken).catch(() => [] as SharedKillioTable[]),
      listTeamBoards(activeTeamId, accessToken).catch(() => [] as BoardSummary[]),
    ])
      .then(([installations, tables, boards]) => {
        setGithubInstallations(installations);
        setPresetTables(tables);
        setPresetBoards(boards);
      })
      .finally(() => setPresetContextLoading(false));
  }, [showPresetModal, accessToken, activeTeamId]);

  useEffect(() => {
    if (presets.length === 0) {
      setSelectedPresetId(null);
      setPresetValues({});
      return;
    }
    if (!selectedPresetId || !presets.some((preset) => preset.id === selectedPresetId)) {
      const firstPresetId = presets[0]?.id ?? null;
      setSelectedPresetId(firstPresetId);
      initializePresetValues(firstPresetId);
    }
  }, [presets, selectedPresetId, initializePresetValues]);

  useEffect(() => {
    if (!showPresetModal || !isGithubPresetSelected) return;

    setPresetTableMode((prev) => {
      if (presetTables.length === 0) return "new";
      return prev;
    });

    setPresetValues((prev) => {
      const next = { ...prev };
      if (!next.installationId && activeGithubInstallations.length > 0) {
        next.installationId = String(activeGithubInstallations[0].installationId);
      }
      if (!next.existingTableId && presetTables.length > 0) {
        next.existingTableId = presetTables[0].id;
      }
      if (!next.newKillioTableName) {
        next.newKillioTableName = "GitHub Preset KillioTable";
      }
      if (!next.boardId && presetBoards.length > 0) {
        next.boardId = presetBoards[0].id;
      }
      return next;
    });
  }, [showPresetModal, isGithubPresetSelected, presetTables, activeGithubInstallations, presetBoards]);

  useEffect(() => {
    if (!showPresetModal || !isGithubPresetSelected || !activeTeamId || !accessToken) return;

    if (!Number.isFinite(selectedInstallationId) || selectedInstallationId <= 0) {
      setPresetRepositories([]);
      setPresetBranches([]);
      return;
    }

    setPresetReposLoading(true);
    setPresetError(null);
    listGithubInstallationRepositories(activeTeamId, selectedInstallationId, accessToken)
      .then((repositories) => {
        setPresetRepositories(repositories);
        setPresetValues((prev) => {
          const hasCurrentRepo = repositories.some((repo) => repo.fullName === prev.repoFullName);
          if (hasCurrentRepo) return prev;
          const firstRepo = repositories[0];
          if (!firstRepo) return { ...prev, repoFullName: "", branch: "" };
          return {
            ...prev,
            repoFullName: firstRepo.fullName,
            branch: firstRepo.defaultBranch || prev.branch || "main",
          };
        });
      })
      .catch((error) => {
        setPresetRepositories([]);
        const message = error instanceof Error && error.message
          ? error.message
          : t("presets.repositoriesLoadError");
        setPresetError(message);
      })
      .finally(() => setPresetReposLoading(false));
  }, [showPresetModal, isGithubPresetSelected, activeTeamId, accessToken, selectedInstallationId]);

  useEffect(() => {
    if (!showPresetModal || !isGithubPresetSelected || !activeTeamId || !accessToken) return;
    if (!selectedRepoFullName || !Number.isFinite(selectedInstallationId) || selectedInstallationId <= 0) {
      setPresetBranches([]);
      return;
    }

    setPresetBranchesLoading(true);
    setPresetError(null);
    listGithubInstallationBranches(activeTeamId, selectedInstallationId, selectedRepoFullName, accessToken)
      .then((branches) => {
        setPresetBranches(branches);
        setPresetValues((prev) => {
          const hasCurrentBranch = branches.some((branch) => branch.name === prev.branch);
          if (hasCurrentBranch) return prev;
          const repoDefaultBranch = presetRepositories.find((repo) => repo.fullName === selectedRepoFullName)?.defaultBranch;
          const fallbackBranch = repoDefaultBranch || branches[0]?.name || "main";
          return { ...prev, branch: fallbackBranch };
        });
      })
      .catch((error) => {
        setPresetBranches([]);
        const message = error instanceof Error && error.message
          ? error.message
          : t("presets.branchesLoadError");
        setPresetError(message);
      })
      .finally(() => setPresetBranchesLoading(false));
  }, [
    showPresetModal,
    isGithubPresetSelected,
    activeTeamId,
    accessToken,
    selectedInstallationId,
    selectedRepoFullName,
    presetRepositories,
  ]);

  useEffect(() => {
    if (!showPresetModal || !isGithubPresetSelected || !activeTeamId || !accessToken) return;
    if (!selectedBoardId) return;

    const cachedLists = presetListsByBoard[selectedBoardId];
    if (cachedLists) {
      if (!cachedLists.some((list) => list.id === selectedListId) && cachedLists.length > 0) {
        setPresetValues((prev) => ({ ...prev, listId: cachedLists[0].id }));
      }
      return;
    }

    getBoard(selectedBoardId, accessToken)
      .then((board) => {
        const lists = board.lists ?? [];
        setPresetListsByBoard((prev) => ({
          ...prev,
          [selectedBoardId]: lists,
        }));
        setPresetValues((prev) => {
          if (lists.some((list) => list.id === prev.listId)) return prev;
          return { ...prev, listId: lists[0]?.id ?? "" };
        });
      })
      .catch(() => {
        setPresetListsByBoard((prev) => ({ ...prev, [selectedBoardId]: [] }));
      });
  }, [
    showPresetModal,
    isGithubPresetSelected,
    activeTeamId,
    accessToken,
    selectedBoardId,
    selectedListId,
    presetListsByBoard,
  ]);

  // ──────────────────────────────────────────────────────────────────────────
  // Load graph when a script is selected
  // ──────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!selectedScript || !accessToken || !activeTeamId) return;
    setGraphLoading(true);
    setGraph(null);
    getScriptGraph(selectedScript.id, activeTeamId, accessToken)
      .then(setGraph)
      .catch(() => setGraph({ nodes: [], edges: [] }))
      .finally(() => setGraphLoading(false));
  }, [selectedScript?.id, accessToken, activeTeamId]);

  // ──────────────────────────────────────────────────────────────────────────
  // Handlers
  // ──────────────────────────────────────────────────────────────────────────

  const handleToggle = async (script: ScriptSummary) => {
    if (!accessToken || !activeTeamId) return;
    const result = await toggleScript(script.id, activeTeamId, !script.isActive, accessToken);
    setScripts((prev) =>
      prev.map((s) => (s.id === script.id ? { ...s, isActive: result.isActive } : s)),
    );
    if (selectedScript?.id === script.id) {
      setSelectedScript((prev) => prev ? { ...prev, isActive: result.isActive } : prev);
    }
  };

  const handleDelete = async (script: ScriptSummary) => {
    if (!accessToken || !activeTeamId) return;
    await deleteScript(script.id, activeTeamId, accessToken);
    setScripts((prev) => prev.filter((s) => s.id !== script.id));
    if (selectedScript?.id === script.id) setSelectedScript(null);
  };

  const handleSaveGraph = async (g: ScriptGraph) => {
    if (!selectedScript || !accessToken || !activeTeamId) return;
    const updatedScript = await saveScriptGraph(selectedScript.id, activeTeamId, g, accessToken);
    setGraph(g);
    setScripts((prev) => prev.map((script) => (script.id === updatedScript.id ? updatedScript : script)));
    setSelectedScript(updatedScript);
  };

  const handleToggleActive = async (isActive: boolean) => {
    if (!selectedScript) return;
    await handleToggle({ ...selectedScript, isActive: !isActive });
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken || !activeTeamId || !form.name.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      const newScript = await createScript(
        {
          teamId: activeTeamId,
          name: form.name.trim(),
          description: form.description.trim() || undefined,
        },
        accessToken,
      );
      setScripts((prev) => [newScript, ...prev]);
      setShowCreate(false);
      setForm({ name: "", description: "" });
      setSelectedScript(newScript);
      setScriptSubView("canvas");
    } catch {
      setCreateError(t("scripts.createError"));
    } finally {
      setCreating(false);
    }
  };

  const handleRunManual = async () => {
    if (!selectedScript || !accessToken || !activeTeamId) return;
    await runManualScript(selectedScript.id, activeTeamId, accessToken, {
      data: {
        source: "killio-ui",
        requestedByUserId: user?.id,
      },
    });
    setScriptSubView("runs");
    if (accessToken && activeTeamId) {
      getScriptsUsage(activeTeamId, accessToken).then(setUsage).catch(() => undefined);
    }
  };

  const handleOpenPresets = () => {
    setPresetError(null);
    setPresetResult(null);

    const firstPresetId = selectedPresetId ?? presets[0]?.id ?? null;
    setSelectedPresetId(firstPresetId);
    initializePresetValues(firstPresetId);
    setShowPresetModal(true);
  };

  const handleSelectPreset = (presetId: string) => {
    setSelectedPresetId(presetId);
    initializePresetValues(presetId);
    setPresetError(null);
    setPresetResult(null);
  };

  const handleApplyPreset = async () => {
    if (!accessToken || !activeTeamId || !selectedPresetId) return;

    const catalogPreset = presetCatalogById.get(selectedPresetId);
    const nextParams: {
      teamId: string;
      repoFullName?: string;
      branch?: string;
      boardId?: string;
      listId?: string;
      archiveListId?: string;
      killioTableName?: string;
    } = {
      teamId: activeTeamId,
    };

    if (selectedPresetId === "github") {
      const repoFullName = selectedRepoFullName.trim();
      const branch = selectedBranch.trim();
      const boardId = selectedBoardId.trim();
      const listId = selectedListId.trim();

      if (!repoFullName) {
        setPresetError(t("presets.missingRequiredField", { field: t("presets.fields.repoFullName.label") }));
        return;
      }
      if (!branch) {
        setPresetError(t("presets.missingRequiredField", { field: t("presets.fields.branch.label") }));
        return;
      }
      if (!boardId) {
        setPresetError(t("presets.missingRequiredField", { field: t("presets.fields.boardId.label") }));
        return;
      }
      if (!listId) {
        setPresetError(t("presets.missingRequiredField", { field: t("presets.fields.listId.label") }));
        return;
      }

      const killioTableName = presetTableMode === "existing"
        ? selectedExistingTableName.trim()
        : (presetValues.newKillioTableName ?? "").trim();
      if (!killioTableName) {
        setPresetError(t("presets.missingRequiredField", { field: t("presets.fields.killioTableName.label") }));
        return;
      }

      nextParams.repoFullName = repoFullName;
      nextParams.branch = branch;
      nextParams.boardId = boardId;
      nextParams.listId = listId;
      nextParams.killioTableName = killioTableName;
    }

    if (catalogPreset && selectedPresetId !== "github") {
      for (const field of catalogPreset.fields) {
        const value = (presetValues[field.id] ?? "").trim();
        if (field.required && !value) {
          setPresetError(t("presets.missingRequiredField", { field: t(field.labelKey) }));
          return;
        }
        if (value) {
          if (field.param === "repoFullName") nextParams.repoFullName = value;
          if (field.param === "branch") nextParams.branch = value;
          if (field.param === "boardId") nextParams.boardId = value;
          if (field.param === "listId") nextParams.listId = value;
          if (field.param === "archiveListId") nextParams.archiveListId = value;
          if (field.param === "killioTableName") nextParams.killioTableName = value;
        }
      }
    }

    setApplyingPresetId(selectedPresetId);
    setPresetError(null);
    setPresetResult(null);

    try {
      const result = await applyScriptPreset(selectedPresetId, nextParams, accessToken);

      await loadScripts();

      if (result.scripts.length > 0) {
        const firstScript = result.scripts[0];
        const refreshed = await listScripts(activeTeamId, accessToken);
        setScripts(refreshed);
        const selected = refreshed.find((script) => script.id === firstScript.id) ?? null;
        setSelectedScript(selected);
        setScriptSubView("canvas");
      }

      setShowPresetModal(false);
      setPresetResult(null);
      setPresetError(null);
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : t("presets.applyError");
      setPresetError(message);
    } finally {
      setApplyingPresetId(null);
    }
  };

  const presetRequirementChecks = useMemo(() => {
    if (!selectedPresetCatalog) return [];

    return selectedPresetCatalog.requirements.map((requirement) => {
      if (requirement.type === "github_installation") {
        const met = activeGithubInstallations.length > 0;
        return {
          key: requirement.type,
          message: t(requirement.messageKey),
          met,
        };
      }

      return {
        key: requirement.type,
        message: t(requirement.messageKey),
        met: true,
      };
    });
  }, [selectedPresetCatalog, activeGithubInstallations, t]);

  const presetRequirementsMet = presetRequirementChecks.every((requirement) => requirement.met);
  const selectedPreset = selectedPresetId
    ? presets.find((preset) => preset.id === selectedPresetId) ?? null
    : null;
  const selectedPresetFields = selectedPresetCatalog?.fields ?? [];
  const requiredPresetFieldsFilled = selectedPresetFields.every((field) => {
    if (!field.required) return true;
    return (presetValues[field.id] ?? "").trim().length > 0;
  });
  const githubPresetFieldsReady = selectedRepoFullName.trim().length > 0
    && selectedBranch.trim().length > 0
    && selectedBoardId.trim().length > 0
    && selectedListId.trim().length > 0
    && (
      presetTableMode === "existing"
        ? selectedExistingTableName.trim().length > 0
        : (presetValues.newKillioTableName ?? "").trim().length > 0
    );
  const canApplySelectedPreset = !!selectedPreset
    && !presetContextLoading
    && presetRequirementsMet
    && (isGithubPresetSelected ? githubPresetFieldsReady : requiredPresetFieldsFilled);

  const webhookToken =
    selectedScript?.triggerType === "webhook"
      ? selectedScript.triggerConfig?.publicToken
      : null;

  const webhookBase =
    process.env.NEXT_PUBLIC_API_BASE_URL
    ?? process.env.NEXT_PUBLIC_KILLIO_API_URL
    ?? process.env.NEXT_PUBLIC_API_URL
    ?? "http://localhost:4000";

  const webhookUrl =
    selectedScript
    && selectedScript.triggerType === "webhook"
    && activeTeamId
    && typeof webhookToken === "string"
    && webhookToken.length > 0
      ? `${webhookBase.replace(/\/+$/, "")}/w/${activeTeamId}/webhook/${selectedScript.id}/${webhookToken}`
      : null;

  const usageResetDate = usage?.periodEnd
    ? new Date(usage.periodEnd).toLocaleDateString(locale === "es" ? "es-ES" : "en-US", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    })
    : null;

  const tabsPortalContent = (
    <div className="space-y-1 py-1">
      {TABS.map((tabItem) => (
        <button
          key={tabItem.id}
          type="button"
          onClick={() => setTab(tabItem.id)}
          className={`w-full rounded-md px-2.5 py-1.5 text-left text-sm font-medium transition-colors ${
            tab === tabItem.id
              ? "bg-accent/20 text-accent"
              : "text-muted-foreground hover:bg-accent/10 hover:text-foreground"
          }`}
        >
          {t(tabItem.label)}
        </button>
      ))}
    </div>
  );

  const usagePortalContent = tab === "scripts" ? (
    <div className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-md border border-border bg-card/80 px-2 py-1 text-[11px] text-muted-foreground">
      {usageLoading ? (
        <>
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span className="hidden sm:inline">{t("usage.loading")}</span>
        </>
      ) : usage ? (
        <>
          <span className="inline-flex items-center gap-1 text-foreground">
            <BarChart3 className="h-3.5 w-3.5" />
            <span className="font-medium">
              {usage.limit === null ? `${usage.executed}` : `${usage.executed}/${usage.limit}`}
            </span>
          </span>
          <span className="hidden xl:inline truncate">{t("usage.title", { plan: usage.planTier })}</span>
          {usageResetDate && <span className="hidden 2xl:inline">{t("usage.reset", { date: usageResetDate })}</span>}
          <button
            type="button"
            onClick={() => router.push("/pricing")}
            className="hidden items-center gap-1 rounded-md border border-border bg-background px-2 py-0.5 font-medium text-foreground hover:bg-accent/10 xl:inline-flex"
          >
            <CreditCard className="h-3.5 w-3.5" />
            Upgrade
          </button>
        </>
      ) : (
        <span>{t("usage.error")}</span>
      )}
    </div>
  ) : null;

  // ──────────────────────────────────────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────────────────────────────────────

  if (!accessToken || !activeTeamId || isRoleLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex h-full items-center justify-center px-4 sm:px-6">
        <div className="max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
          <p className="text-base font-semibold text-foreground">{t("title")}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("access.adminOnly")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      {sidebarOptionsEl ? createPortal(tabsPortalContent, sidebarOptionsEl) : null}
      {mobileSidebarOptionsEl ? createPortal(tabsPortalContent, mobileSidebarOptionsEl) : null}
      {navbarUsageSlotEl && usagePortalContent ? createPortal(usagePortalContent, navbarUsageSlotEl) : null}

      <div className="flex h-full flex-col bg-background text-foreground">

        {/* Tab Content */}
        <div className={`flex min-h-0 flex-1 ${tab === "scripts" ? "overflow-y-auto lg:overflow-hidden" : "overflow-hidden"}`}>
        {/* ── Integraciones ────────────────────────────────────────────────── */}
        {tab === "integrations" && (
          <div className="flex-1 overflow-y-auto" style={{ background: "#020408" }}>
            <div style={{ padding: "28px 32px", maxWidth: 1160, display: "flex", flexDirection: "column", gap: 24 }}>

              {/* Header */}
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
                <div>
                  <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.03em", color: "#fff" }}>{t("title")}</div>
                  <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", marginTop: 3 }}>
                    {t("tabs.integrations")} · sync data across your stack
                  </div>
                </div>
              </div>

              {/* Stat row */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
                <div style={{ background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: "18px 20px" }}>
                  <div style={{ fontSize: 30, fontWeight: 900, letterSpacing: "-0.03em", color: "#fff", lineHeight: 1 }}>5</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 4 }}>Available</div>
                </div>
                <div style={{ background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: "18px 20px" }}>
                  <div style={{ fontSize: 30, fontWeight: 900, letterSpacing: "-0.03em", color: "rgba(255,255,255,0.42)", lineHeight: 1 }}>3</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 4 }}>Coming soon</div>
                </div>
                <div style={{ background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: "18px 20px" }}>
                  <div style={{ fontSize: 30, fontWeight: 900, letterSpacing: "-0.03em", color: usageLoading ? "rgba(255,255,255,0.3)" : "#fff", lineHeight: 1 }}>
                    {usageLoading ? "—" : usage ? (usage.limit === null ? String(usage.executed) : `${usage.executed}/${usage.limit}`) : "—"}
                  </div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 4 }}>Script runs</div>
                </div>
              </div>

              {/* Available integrations */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(255,255,255,0.22)", marginBottom: 12 }}>
                  Available
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 14 }}>
                  <GithubIntegrationPanel teamId={activeTeamId} accessToken={accessToken} />
                  <WhatsappIntegrationPanel teamId={activeTeamId} accessToken={accessToken} />
                  <SlackWebhookIntegrationPanel teamId={activeTeamId} accessToken={accessToken} />
                  <NotionIntegrationPanel teamId={activeTeamId} accessToken={accessToken} />
                  <TrelloIntegrationPanel teamId={activeTeamId} accessToken={accessToken} />
                </div>
              </div>

              {/* Coming soon */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(255,255,255,0.22)", marginBottom: 12 }}>
                  Coming soon
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 14 }}>
                  <ComingSoonIntegrationCard
                    title={t("integrations.catalog.metaTitle")}
                    description={t("integrations.catalog.metaDescription")}
                    icon={Globe}
                    badge={t("integrations.catalog.tutorial")}
                    actionLabel={t("integrations.catalog.viewTutorial")}
                    onAction={() => setShowMetaTutorialModal(true)}
                  />
                  <ComingSoonIntegrationCard
                    title={t("integrations.catalog.googleTitle")}
                    description={t("integrations.catalog.googleDescription")}
                    icon={Globe}
                    badge={t("integrations.catalog.comingSoon")}
                  />
                  <ComingSoonIntegrationCard
                    title={t("integrations.catalog.jiraTitle")}
                    description={t("integrations.catalog.jiraDescription")}
                    icon={SquareKanban}
                    badge={t("integrations.catalog.comingSoon")}
                  />
                </div>
              </div>

            </div>
          </div>
        )}

        {/* ── Scripts ──────────────────────────────────────────────────────── */}
        {tab === "scripts" && (
          <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden" style={{ background: "#020408", padding: mobileScriptsOptimized ? "8px" : "12px 16px" }}>
            {mobileScriptsOptimized ? (
              <div className="flex min-h-0 flex-1 flex-col gap-2">
                <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 p-2">
                  <button
                    type="button"
                    onClick={() => setShowMobileScriptList((prev) => !prev)}
                    className="inline-flex h-9 items-center justify-center rounded-lg border border-white/15 bg-white/5 px-3 text-xs font-semibold text-white/90"
                  >
                    {showMobileScriptList ? t("actions.close") : t("tabs.scripts")}
                  </button>
                  <div className="ml-auto flex items-center gap-1 rounded-lg border border-white/10 bg-black/30 p-1">
                    <button
                      type="button"
                      onClick={() => setScriptSubView("canvas")}
                      disabled={!selectedScript}
                      className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${scriptSubView === "canvas" ? "bg-white/15 text-white" : "text-white/60"} ${!selectedScript ? "cursor-not-allowed opacity-50" : ""}`}
                    >
                      {t("scripts.graphTab")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setScriptSubView("runs")}
                      disabled={!selectedScript}
                      className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${scriptSubView === "runs" ? "bg-white/15 text-white" : "text-white/60"} ${!selectedScript ? "cursor-not-allowed opacity-50" : ""}`}
                    >
                      {t("scripts.runsTab")}
                    </button>
                  </div>
                </div>

                {showMobileScriptList && (
                  <div className="max-h-[42vh] min-h-[220px] overflow-y-auto rounded-xl border border-white/10 bg-white/5 p-1">
                    <ScriptList
                      scripts={scripts}
                      selectedId={selectedScript?.id ?? null}
                      onSelect={(s) => {
                        setSelectedScript(s);
                        setScriptSubView("canvas");
                        setShowMobileScriptList(false);
                      }}
                      onToggle={handleToggle}
                      onDelete={handleDelete}
                      onCreate={() => setShowCreate(true)}
                      onOpenPresets={handleOpenPresets}
                      loading={scriptsLoading}
                    />
                  </div>
                )}

                <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-white/10 bg-white/5">
                  <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-white">
                        {selectedScript?.name ?? t("tabs.scripts")}
                      </p>
                      <p className="truncate text-[11px] text-white/60">
                        {selectedScript?.description || t("scripts.selectToEditHelp")}
                      </p>
                    </div>
                    {selectedScript && (
                      <button
                        type="button"
                        onClick={async () => {
                          if (window.confirm(t("scripts.deleteConfirm"))) {
                            await handleDelete(selectedScript);
                          }
                        }}
                        className="inline-flex h-8 items-center gap-1 rounded-md border border-red-300/30 bg-red-400/10 px-2 text-[11px] font-semibold text-red-300"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        {t("scripts.delete")}
                      </button>
                    )}
                  </div>

                  {selectedScript ? (
                    scriptSubView === "canvas" ? (
                      graphLoading ? (
                        <div className="flex flex-1 items-center justify-center">
                          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                      ) : (
                        <div className="flex min-h-0 flex-1 overflow-hidden">
                          <ScriptCanvas
                            scriptId={selectedScript.id}
                            graph={graph}
                            isActive={selectedScript.isActive}
                            webhookUrl={webhookUrl}
                            teamId={activeTeamId}
                            accessToken={accessToken}
                            onSave={handleSaveGraph}
                            onToggle={handleToggleActive}
                            canRunManually={!!graph?.nodes.some((node) => node.nodeKind === "core.trigger.manual")}
                            onRunManual={handleRunManual}
                          />
                        </div>
                      )
                    ) : (
                      <div className="min-h-0 flex-1 overflow-hidden">
                        <RunLogsPanel
                          scriptId={selectedScript.id}
                          teamId={activeTeamId}
                          accessToken={accessToken}
                        />
                      </div>
                    )
                  ) : (
                    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center">
                      <div style={{ borderRadius: "50%", background: "rgba(216,255,114,0.08)", padding: 20, color: "#d8ff72" }}>
                        <Zap className="h-8 w-8" />
                      </div>
                      <p style={{ fontSize: 14, fontWeight: 600, color: "#fff" }}>
                        {t("scripts.selectToEdit")}
                      </p>
                      <p style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>
                        {t("scripts.selectToEditHelp")}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[320px,minmax(0,1fr)] xl:grid-cols-[340px,minmax(0,1fr)]">
                <div className="min-h-[320px] lg:min-h-0">
                  <ScriptList
                    scripts={scripts}
                    selectedId={selectedScript?.id ?? null}
                    onSelect={(s) => {
                      setSelectedScript(s);
                      setScriptSubView("canvas");
                    }}
                    onToggle={handleToggle}
                    onDelete={handleDelete}
                    onCreate={() => setShowCreate(true)}
                    onOpenPresets={handleOpenPresets}
                    loading={scriptsLoading}
                  />
                </div>

                <div className="flex min-h-[360px] min-w-0 flex-1 flex-col overflow-hidden lg:min-h-0" style={{ borderRadius: 14, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.035)" }}>
                  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, borderBottom: "1px solid rgba(255,255,255,0.08)", padding: "10px 16px" }}>
                    <div className="min-w-0 flex-1">
                      <p className="truncate" style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>
                        {selectedScript?.name ?? t("tabs.scripts")}
                      </p>
                      {selectedScript ? (
                        <p className="truncate" style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>{selectedScript.description || t("scripts.selectToEditHelp")}</p>
                      ) : (
                        <p className="truncate" style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>{t("scripts.selectToEditHelp")}</p>
                      )}
                    </div>

                    {selectedScript && (
                      <button
                        type="button"
                        onClick={async () => {
                          if (window.confirm(t("scripts.deleteConfirm"))) {
                            await handleDelete(selectedScript);
                          }
                        }}
                        style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 30, padding: "0 12px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", border: "1px solid rgba(248,113,113,0.2)", background: "rgba(248,113,113,0.07)", color: "#f87171" }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        {t("scripts.delete")}
                      </button>
                    )}

                    <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 2, padding: "4px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(0,0,0,0.25)" }}>
                      <button
                        type="button"
                        onClick={() => setScriptSubView("canvas")}
                        disabled={!selectedScript}
                        style={{
                          padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: selectedScript ? "pointer" : "not-allowed",
                          transition: "all .15s", color: scriptSubView === "canvas" ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.45)",
                          background: scriptSubView === "canvas" ? "rgba(255,255,255,0.06)" : "transparent",
                          opacity: !selectedScript ? 0.5 : 1, border: "none",
                        }}
                      >
                        {t("scripts.graphTab")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setScriptSubView("runs")}
                        disabled={!selectedScript}
                        style={{
                          padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: selectedScript ? "pointer" : "not-allowed",
                          transition: "all .15s", color: scriptSubView === "runs" ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.45)",
                          background: scriptSubView === "runs" ? "rgba(255,255,255,0.06)" : "transparent",
                          opacity: !selectedScript ? 0.5 : 1, border: "none",
                        }}
                      >
                        {t("scripts.runsTab")}
                      </button>
                    </div>
                  </div>

                  {selectedScript ? (
                    <>
                      {scriptSubView === "canvas" ? (
                        graphLoading ? (
                          <div className="flex flex-1 items-center justify-center">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                          </div>
                        ) : (
                          <div className="flex min-h-0 flex-1 overflow-hidden">
                            <ScriptCanvas
                              scriptId={selectedScript.id}
                              graph={graph}
                              isActive={selectedScript.isActive}
                              webhookUrl={webhookUrl}
                              teamId={activeTeamId}
                              accessToken={accessToken}
                              onSave={handleSaveGraph}
                              onToggle={handleToggleActive}
                              canRunManually={!!graph?.nodes.some((node) => node.nodeKind === "core.trigger.manual")}
                              onRunManual={handleRunManual}
                            />
                          </div>
                        )
                      ) : (
                        <div className="min-h-0 flex-1 overflow-hidden">
                          <RunLogsPanel
                            scriptId={selectedScript.id}
                            teamId={activeTeamId}
                            accessToken={accessToken}
                          />
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center">
                      <div style={{ borderRadius: "50%", background: "rgba(216,255,114,0.08)", padding: 20, color: "#d8ff72" }}>
                        <Zap className="h-8 w-8" />
                      </div>
                      <p style={{ fontSize: 14, fontWeight: 600, color: "#fff" }}>
                        {t("scripts.selectToEdit")}
                      </p>
                      <p style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>
                        {t("scripts.selectToEditHelp")}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── KillioTable ──────────────────────────────────────────────────── */}
        {tab === "table" && (
          <div className="flex-1 overflow-hidden">
            <KillioTable
              teamId={activeTeamId}
              accessToken={accessToken}
            />
          </div>
        )}
        </div>

        {showMetaTutorialModal && (
          <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
            <div className="w-full max-w-lg rounded-xl border border-border bg-card p-5 shadow-xl">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-base font-semibold text-foreground">{t("integrations.metaTutorial.title")}</h3>
                <button
                  type="button"
                  onClick={() => setShowMetaTutorialModal(false)}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-accent/10 hover:text-foreground"
                  aria-label={t("actions.close")}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <p className="text-sm text-muted-foreground">{t("integrations.metaTutorial.description")}</p>
              <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-foreground">
                <li>{t("integrations.metaTutorial.step1")}</li>
                <li>{t("integrations.metaTutorial.step2")}</li>
                <li>{t("integrations.metaTutorial.step3")}</li>
              </ol>

              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowMetaTutorialModal(false)}
                  className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
                >
                  {t("actions.close")}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Preset Modal ─────────────────────────────────────────────────── */}
        {showPresetModal && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-3 backdrop-blur-sm sm:p-6">
            <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xl">
              <div className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-6">
                <div>
                  <h2 className="text-base font-semibold text-foreground">{t("presets.modalTitle")}</h2>
                  <p className="text-xs text-muted-foreground">{t("presets.modalSubtitle")}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPresetModal(false)}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-accent/10 hover:text-foreground"
                  aria-label={t("actions.close")}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

            <div className="grid min-h-0 flex-1 md:grid-cols-[260px,1fr]">
              <div className="border-b border-border bg-muted/20 p-3 md:border-b-0 md:border-r">
                {presetsLoading ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {t("presets.loading")}
                  </div>
                ) : presets.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t("presets.empty")}</p>
                ) : (
                  <div className="space-y-2">
                    {presets.map((preset) => {
                      const catalogPreset = presetCatalogById.get(preset.id);
                      const isSelected = preset.id === selectedPresetId;
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => handleSelectPreset(preset.id)}
                          className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                            isSelected
                              ? "border-accent bg-accent/15"
                              : "border-border bg-background hover:bg-accent/10"
                          }`}
                        >
                          <p className="text-sm font-medium text-foreground">
                            {catalogPreset ? t(catalogPreset.titleKey) : preset.name}
                          </p>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">
                            {catalogPreset ? t(catalogPreset.descriptionKey) : preset.description}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="min-h-0 overflow-y-auto p-4 sm:p-6">
                {selectedPreset ? (
                  <>
                    <p className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-foreground">
                      {selectedPresetCatalog ? t(selectedPresetCatalog.summaryKey) : selectedPreset.applySummary}
                    </p>

                    <div className="mt-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {t("presets.requirementsTitle")}
                      </p>
                      {presetContextLoading ? (
                        <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          {t("presets.checkingRequirements")}
                        </div>
                      ) : (
                        <div className="mt-2 space-y-2">
                          {presetRequirementChecks.length === 0 ? (
                            <p className="text-xs text-muted-foreground">{t("presets.noRequirements")}</p>
                          ) : (
                            presetRequirementChecks.map((requirement) => (
                              <div
                                key={requirement.key}
                                className={`flex items-center gap-2 rounded-md px-2.5 py-2 text-xs ${
                                  requirement.met
                                    ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                                    : "bg-amber-500/10 text-amber-800 dark:text-amber-300"
                                }`}
                              >
                                {requirement.met ? (
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                ) : (
                                  <AlertCircle className="h-3.5 w-3.5" />
                                )}
                                {requirement.message}
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>

                    <div className="mt-5 space-y-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {t("presets.configureTitle")}
                      </p>

                      {isGithubPresetSelected ? (
                        <>
                          <div>
                            <label className="mb-1 block text-xs font-medium text-muted-foreground">
                              {t("presets.fields.installation.label")} *
                            </label>
                            <select
                              value={presetValues.installationId ?? ""}
                              onChange={(event) => {
                                const installationId = event.target.value;
                                setPresetValues((prev) => ({
                                  ...prev,
                                  installationId,
                                  repoFullName: "",
                                  branch: "",
                                }));
                                setPresetRepositories([]);
                                setPresetBranches([]);
                              }}
                              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                            >
                              <option value="">{t("presets.selectPlaceholder")}</option>
                              {activeGithubInstallations.map((installation) => (
                                <option key={installation.id} value={String(installation.installationId)}>
                                  {installation.accountLogin} ({installation.accountType})
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="mb-1 block text-xs font-medium text-muted-foreground">
                              {t("presets.fields.repoFullName.label")} *
                            </label>
                            <select
                              value={presetValues.repoFullName ?? ""}
                              onChange={(event) => {
                                const repoFullName = event.target.value;
                                const matchedRepo = presetRepositories.find((repo) => repo.fullName === repoFullName);
                                setPresetValues((prev) => ({
                                  ...prev,
                                  repoFullName,
                                  branch: matchedRepo?.defaultBranch ?? "",
                                }));
                              }}
                              disabled={presetReposLoading || presetRepositories.length === 0}
                              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
                            >
                              <option value="">{presetReposLoading ? t("presets.loading") : t("presets.selectPlaceholder")}</option>
                              {presetRepositories.map((repo) => (
                                <option key={repo.id} value={repo.fullName}>
                                  {repo.fullName}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="mb-1 block text-xs font-medium text-muted-foreground">
                              {t("presets.fields.branch.label")} *
                            </label>
                            <select
                              value={presetValues.branch ?? ""}
                              onChange={(event) => {
                                const branch = event.target.value;
                                setPresetValues((prev) => ({ ...prev, branch }));
                              }}
                              disabled={presetBranchesLoading || presetBranches.length === 0}
                              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
                            >
                              <option value="">{presetBranchesLoading ? t("presets.loading") : t("presets.selectPlaceholder")}</option>
                              {presetBranches.map((branch) => (
                                <option key={branch.name} value={branch.name}>
                                  {branch.name}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="mb-1 block text-xs font-medium text-muted-foreground">
                              {t("presets.fields.boardId.label")} *
                            </label>
                            <select
                              value={presetValues.boardId ?? ""}
                              onChange={(event) => {
                                const boardId = event.target.value;
                                setPresetValues((prev) => ({ ...prev, boardId, listId: "" }));
                              }}
                              disabled={presetBoards.length === 0}
                              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
                            >
                              <option value="">{t("presets.selectPlaceholder")}</option>
                              {presetBoards.map((board) => (
                                <option key={board.id} value={board.id}>
                                  {board.name}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="mb-1 block text-xs font-medium text-muted-foreground">
                              {t("presets.fields.listId.label")} *
                            </label>
                            <select
                              value={presetValues.listId ?? ""}
                              onChange={(event) => {
                                const listId = event.target.value;
                                setPresetValues((prev) => ({ ...prev, listId }));
                              }}
                              disabled={!selectedBoardId || selectedBoardLists.length === 0}
                              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
                            >
                              <option value="">{t("presets.selectPlaceholder")}</option>
                              {selectedBoardLists.map((list) => (
                                <option key={list.id} value={list.id}>
                                  {list.name}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="mb-2 block text-xs font-medium text-muted-foreground">
                              {t("presets.fields.killioTableName.label")} *
                            </label>
                            <div className="mb-2 flex gap-2">
                              <button
                                type="button"
                                onClick={() => setPresetTableMode("existing")}
                                className={`rounded-md border px-2.5 py-1.5 text-xs ${presetTableMode === "existing" ? "border-accent bg-accent/15 text-foreground" : "border-border text-muted-foreground"}`}
                              >
                                {t("presets.tableModes.existing")}
                              </button>
                              <button
                                type="button"
                                onClick={() => setPresetTableMode("new")}
                                className={`rounded-md border px-2.5 py-1.5 text-xs ${presetTableMode === "new" ? "border-accent bg-accent/15 text-foreground" : "border-border text-muted-foreground"}`}
                              >
                                {t("presets.tableModes.new")}
                              </button>
                            </div>

                            {presetTableMode === "existing" ? (
                              <select
                                value={presetValues.existingTableId ?? ""}
                                onChange={(event) => {
                                  const existingTableId = event.target.value;
                                  setPresetValues((prev) => ({ ...prev, existingTableId }));
                                }}
                                disabled={presetTables.length === 0}
                                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
                              >
                                <option value="">{t("presets.selectPlaceholder")}</option>
                                {presetTables.map((table) => (
                                  <option key={table.id} value={table.id}>
                                    {table.name}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <input
                                type="text"
                                value={presetValues.newKillioTableName ?? ""}
                                onChange={(event) => {
                                  const newKillioTableName = event.target.value;
                                  setPresetValues((prev) => ({ ...prev, newKillioTableName }));
                                }}
                                placeholder={t("presets.fields.killioTableName.placeholder")}
                                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                              />
                            )}
                          </div>
                        </>
                      ) : (
                        selectedPresetFields.map((field) => (
                          <div key={field.id}>
                            <label className="mb-1 block text-xs font-medium text-muted-foreground">
                              {t(field.labelKey)} {field.required ? "*" : ""}
                            </label>
                            <input
                              type="text"
                              value={presetValues[field.id] ?? ""}
                              onChange={(event) => {
                                const value = event.target.value;
                                setPresetValues((prev) => ({ ...prev, [field.id]: value }));
                              }}
                              placeholder={t(field.placeholderKey)}
                              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                            />
                          </div>
                        ))
                      )}
                    </div>

                    {presetError && (
                      <p className="mt-4 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                        {presetError}
                      </p>
                    )}

                    {presetResult && (
                      <p className="mt-4 rounded-md bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">
                        {presetResult.message}
                      </p>
                    )}

                    <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setShowPresetModal(false)}
                        className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent/10"
                      >
                        {t("actions.cancel")}
                      </button>
                      <button
                        type="button"
                        onClick={handleApplyPreset}
                        disabled={applyingPresetId === selectedPresetId || !canApplySelectedPreset}
                        className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                      >
                        {applyingPresetId === selectedPresetId ? t("presets.applying") : t("presets.apply")}
                      </button>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">{t("presets.selectPreset")}</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Create Script Modal ───────────────────────────────────────────── */}
      {showCreate && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl">
            <h2 className="mb-4 text-base font-semibold text-foreground">{t("scripts.createTitle")}</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  {t("scripts.name")} *
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder={t("scripts.namePlaceholder")}
                  required
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  {t("scripts.description")}
                </label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder={t("scripts.descriptionPlaceholder")}
                  rows={2}
                  className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">
                  {t("scripts.triggerInCanvasHelp")}
                </p>
              </div>
              {createError && (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{createError}</p>
              )}
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => { setShowCreate(false); setCreateError(null); }}
                  className="rounded-lg px-4 py-2 text-sm text-muted-foreground hover:bg-accent/10"
                >
                  {t("actions.cancel")}
                </button>
                <button
                  type="submit"
                  disabled={creating || !form.name.trim()}
                  className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                  {creating ? t("scripts.creating") : t("scripts.create")}
                </button>
              </div>
            </form>
          </div>
          </div>
        )}
      </div>
    </>
  );
}

export default function IntegrationsWebPage() {
  return <IntegrationsPageView />;
}
