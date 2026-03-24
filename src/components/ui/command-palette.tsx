"use client";

import { useEffect, useMemo, useState } from "react";
import { SuggestionItem, suggestCommand, tokenize } from "@kyntocg/river";
import { Command } from "cmdk";
import {
  Search,
  Plus,
  UserPlus,
  UserMinus,
  Settings,
  Clock,
  HelpCircle,
  Bot,
  LogOut,
  LayoutDashboard,
  Folders,
  RefreshCcw,
  CheckSquare,
  ListChecks,
  CalendarX,
  Tag,
  Edit3,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import {
  argument,
  command as riverCommand,
  defaultArguments,
  literal,
  parseCommand,
  type CommandSpec,
} from "@kyntocg/river";
import {
  addCardAssignee,
  addCardTag,
  createList,
  createTag,
  getBoard,
  getBoardMembers,
  getTagsByScope,
  listTeamBoards,
  removeCardAssignee,
  removeCardTag,
  updateCard,
  type BoardMemberSummary,
  type BoardSummary,
  type TagView,
} from "@/lib/api/contracts";
import { useSession } from "@/components/providers/session-provider";
import { killioArgs, PaletteParseContext, type BoardSnapshot } from "@/lib/commands/args";

type PaletteContext = "global" | "board" | "cards" | "lists" | "system";

// old inline types removed

type CardQueryAction = "rename" | "tag_add" | "tag_remove" | "assign" | "unassign";

type ParsedCardQuery = {
  cardSelector: string;
  listSelector: string;
  action: CardQueryAction;
  value: string;
};
type TransactionAction = {
  id: string;
  label: string;
  execute: () => Promise<void>;
  rollback: () => Promise<void>;
};

type NoticeVariant = "success" | "error" | "info";

type PaletteNotice = {
  id: string;
  variant: NoticeVariant;
  text: string;
};

type PaletteLocale = "es" | "en";

function resolveIcon(commandId: string) {
  if (commandId.includes("ctx") || commandId.includes("context")) return Folders;
  if (commandId.includes("tx.")) return RefreshCcw;
  if (commandId.startsWith("card.")) return CheckSquare;
  if (commandId.startsWith("lists.")) return ListChecks;
  if (commandId.includes("board")) return LayoutDashboard;
  if (commandId.startsWith("global.")) return Search;
  if (commandId.startsWith("system.")) return Settings;
  // return CommandIcon; // CommandIcon no está definido, comentar o implementar si es necesario
  return null;
}


const i18n = {
  es: {
    placeholder: {
      global: "Comando global. Ej: history, teams, board 2",
      board: "Comando de tablero. Ej: board share, list add Sprint, card 1 from 2 rename Titulo",
      cards: "Comando de cards. Ej: cards done all, card done login",
      lists: "Comando de listas. Ej: list add In Review",
      system: "Sistema. Ej: settings, help, logout",
    },
    hint: {
      tabComplete: "Tab completa por token",
      enterRun: "Enter ejecuta",
      nextToken: "Siguiente token",
      argStyle: "Args estilo Discord",
    },
    arg: {
      card: "card",
      list: "list",
      title: "title",
      tag: "tag",
      user: "user",
      query: "query",
      board: "board",
      name: "name",
    },
    fallback: {
      commandUnavailable: "Comando no disponible en este contexto.",
      runError: "No se pudo ejecutar el comando.",
      settingsTriggered: "Settings abierto",
    },
  },
  en: {
    placeholder: {
      global: "Global command. Ex: history, teams, board 2",
      board: "Board command. Ex: board share, list add Sprint, card 1 from 2 rename Title",
      cards: "Cards command. Ex: cards done all, card done login",
      lists: "Lists command. Ex: list add In Review",
      system: "System. Ex: settings, help, logout",
    },
    hint: {
      tabComplete: "Tab completes by token",
      enterRun: "Enter runs command",
      nextToken: "Next token",
      argStyle: "Discord-style args",
    },
    arg: {
      card: "card",
      list: "list",
      title: "title",
      tag: "tag",
      user: "user",
      query: "query",
      board: "board",
      name: "name",
    },
    fallback: {
      commandUnavailable: "Command is unavailable in this context.",
      runError: "Could not execute command.",
      settingsTriggered: "Settings opened",
    },
  },
} as const;




// Definición global y limpia del array de comandos
export const paletteCommandSpecs: CommandSpec<PaletteParseContext, string>[] = [
  ...literal<PaletteParseContext, string>("ctx")
    .then(argument<PaletteParseContext, string, string>("target", {
      parse: (token) => token,
    }))
    .build(),
  ...literal<PaletteParseContext, string>("context")
    .then(argument<PaletteParseContext, string, string>("target", {
      parse: (token) => token,
    }))
    .build(),
  ...literal<PaletteParseContext, string>("begin")
    .then(literal<PaletteParseContext, string>("transaction").id("tx.begin").description("Start transaction").executes(() => ""))
    .build(),
  ...literal<PaletteParseContext, string>("tx")
    .then(literal<PaletteParseContext, string>("begin").id("tx.begin").description("Start transaction").executes(() => ""))
    .then(literal<PaletteParseContext, string>("commit").id("tx.commit").description("Commit transaction").executes(() => ""))
    .then(literal<PaletteParseContext, string>("rollback").id("tx.rollback").description("Rollback transaction").executes(() => ""))
    .then(literal<PaletteParseContext, string>("status").id("tx.status").description("Transaction status").executes(() => ""))
    .build(),
  ...literal<PaletteParseContext, string>("end")
    .then(literal<PaletteParseContext, string>("transaction").id("tx.commit").description("Commit transaction").executes(() => ""))
    .build(),
  ...literal<PaletteParseContext, string>("commit")
    .then(literal<PaletteParseContext, string>("transaction").id("tx.commit").description("Commit transaction").executes(() => ""))
    .build(),
  ...literal<PaletteParseContext, string>("rollback")
    .then(literal<PaletteParseContext, string>("transaction").id("tx.rollback").description("Rollback transaction").executes(() => ""))
    .build(),
  ...literal<PaletteParseContext, string>("transaction")
    .then(literal<PaletteParseContext, string>("status").id("tx.status").description("Transaction status").executes(() => ""))
    .build(),
  ...literal<PaletteParseContext, string>("dashboard")
    .id("global.dashboard")
    .description("Go to dashboard")
    .executes(() => "")
    .build(),
  ...literal<PaletteParseContext, string>("go")
    .then(literal<PaletteParseContext, string>("dashboard").id("global.dashboard").description("Go to dashboard").executes(() => ""))
    .then(literal<PaletteParseContext, string>("home").id("global.dashboard").description("Go to dashboard").executes(() => ""))
    .then(literal<PaletteParseContext, string>("teams").id("global.teams").description("Go to teams").executes(() => ""))
    .then(literal<PaletteParseContext, string>("history").id("global.history").description("Go to history").executes(() => ""))
    .build(),
  ...literal<PaletteParseContext, string>("teams")
    .id("global.teams")
    .description("Go to teams")
    .executes(() => "")
    .build(),
  ...literal<PaletteParseContext, string>("history")
    .id("global.history")
    .description("Go to history")
    .executes(() => "")
    .build(),
  ...literal<PaletteParseContext, string>("settings")
    .id("system.settings")
    .description("Open settings")
    .executes(() => "")
    .build(),
  ...literal<PaletteParseContext, string>("help")
    .id("system.help")
    .description("Show help")
    .executes(() => "")
    .build(),
  ...literal<PaletteParseContext, string>("logout")
    .id("system.logout")
    .description("Logout")
    .executes(() => "")
    .build(),
  ...literal<PaletteParseContext, string>("board")
    .available((ctx) => ctx.isBoardContext)
    .then(literal<PaletteParseContext, string>("refresh").id("board.refresh").description("Refresh board").executes(() => ""))
    .then(literal<PaletteParseContext, string>("chat").id("board.chat").description("Open board chat").executes(() => ""))
    .then(literal<PaletteParseContext, string>("share").id("board.share").description("Open board share").executes(() => ""))
    .build(),
  ...literal<PaletteParseContext, string>("board")
    .available((ctx) => ctx.hasTeamContext)
    .then(
      killioArgs.boardSelector("selector")
        .id("board.open")
        .description("Open board by index or name")
        .executes(() => ""),
    )
    .build(),
  ...literal<PaletteParseContext, string>("list")
    .available((ctx) => ctx.isBoardContext)
    .then(
      literal<PaletteParseContext, string>("add").then(
        killioArgs.listSelector("name")
          .id("lists.add")
          .description("Create list")
          .executes(() => ""),
      ),
    )
    .build(),
  ...literal<PaletteParseContext, string>("cards")
    .available((ctx) => ctx.isBoardContext)
    .then(
      literal<PaletteParseContext, string>("done").then(
        literal<PaletteParseContext, string>("all").id("cards.done.all").description("Mark all cards as done").executes(() => ""),
      ),
    )
    .then(
      literal<PaletteParseContext, string>("active").then(
        literal<PaletteParseContext, string>("all").id("cards.active.all").description("Mark all cards as active").executes(() => ""),
      ),
    )
    .then(literal<PaletteParseContext, string>("clear-due").id("cards.due.clear").description("Clear due dates").executes(() => ""))
    .build(),
  ...literal<PaletteParseContext, string>("card")
    .available((ctx) => ctx.isBoardContext)
    .then(
      literal<PaletteParseContext, string>("done").then(
        killioArgs.cardQuery("query")
          .id("card.done.query")
          .description("Mark a card as done")
          .executes(() => ""),
      ),
    )
    .then(
      literal<PaletteParseContext, string>("active").then(
        killioArgs.cardQuery("query")
          .id("card.active.query")
          .description("Mark a card as active")
          .executes(() => ""),
      ),
    )
    .then(
      killioArgs.cardQuery("payload")
        .id("card.query.mutate")
        .description("Card mutation query")
        .executes(() => ""),
    )
    .build(),
  ...literal<PaletteParseContext, string>("due")
    .available((ctx) => ctx.isBoardContext)
    .then(
      literal<PaletteParseContext, string>("clear").then(
        killioArgs.cardQuery("query")
          .id("card.due.clear.query")
          .description("Clear due for one card")
          .executes(() => ""),
      ),
    )
    .build(),
];

// Definiciones mínimas para navegación y metadatos de contexto
const contextOrder: PaletteContext[] = ["global", "board", "cards", "lists", "system"];

const contextMeta: Record<PaletteContext, { label: string; description: string; icon: any; boardOnly?: boolean; parent?: PaletteContext }> = {
  global: {
    label: "Global",
    description: "Comandos globales",
    icon: Search,
    parent: undefined,
  },
  board: {
    label: "Tablero",
    description: "Comandos de tablero",
    icon: LayoutDashboard,
    boardOnly: true,
    parent: "global",
  },
  cards: {
    label: "Cards",
    description: "Comandos de cards",
    icon: CheckSquare,
    boardOnly: true,
    parent: "board",
  },
  lists: {
    label: "Listas",
    description: "Comandos de listas",
    icon: ListChecks,
    boardOnly: true,
    parent: "board",
  },
  system: {
    label: "Sistema",
    description: "Comandos del sistema",
    icon: Settings,
    parent: "global",
  },
};


const contextTemplates = {
  global: paletteCommandSpecs.filter(cmd => (cmd.id && cmd.id.startsWith("global.")) || cmd.id === undefined),
  board: paletteCommandSpecs.filter(cmd => cmd.id && cmd.id.startsWith("board.")),
  cards: paletteCommandSpecs.filter(cmd => (cmd.id && cmd.id.startsWith("cards.")) || (cmd.id && cmd.id.startsWith("card."))),
  lists: paletteCommandSpecs.filter(cmd => cmd.id && cmd.id.startsWith("lists.")),
  system: paletteCommandSpecs.filter(cmd => cmd.id && cmd.id.startsWith("system.")),
};

export function CommandPalette() {
  const [locale, setLocale] = useState<PaletteLocale>("es");
  const [open, setOpen] = useState(false);
  const [isRunningAction, setIsRunningAction] = useState(false);
  const [notices, setNotices] = useState<PaletteNotice[]>([]);
  const [boardSnapshot, setBoardSnapshot] = useState<BoardSnapshot | null>(null);
  const [teamBoards, setTeamBoards] = useState<BoardSummary[]>([]);
  const [boardMembers, setBoardMembers] = useState<BoardMemberSummary[]>([]);
  const [boardTags, setBoardTags] = useState<TagView[]>([]);
  const [commandQuery, setCommandQuery] = useState("");
  const [currentContext, setCurrentContext] = useState<PaletteContext>("global");
  const [txActive, setTxActive] = useState(false);
  const [txQueue, setTxQueue] = useState<TransactionAction[]>([]);
  const router = useRouter();
  const pathname = usePathname();
  const { accessToken, activeTeamId } = useSession();

  const t = i18n[locale];

  const pushNotice = (variant: NoticeVariant, text: string) => {
    const id = `palette-toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setNotices((prev) => [...prev, { id, variant, text }]);
    setTimeout(() => {
      setNotices((prev) => prev.filter((notice) => notice.id !== id));
    }, 3000);
  };

  const notifyInfo = (message: string) => {
    pushNotice("info", message);
  };

  const alertError = (message: string) => {
    pushNotice("error", message);
  };

  const alertSuccess = (message: string) => {
    pushNotice("success", message);
  };

  const boardIdFromPath = useMemo(() => {
    const match = pathname?.match(/\/b\/([^/]+)/);
    return match?.[1] || null;
  }, [pathname]);

  const isBoardContext = Boolean(boardIdFromPath && accessToken);

  useEffect(() => {
    const rawLang = typeof navigator !== "undefined" ? navigator.language : "es";
    setLocale(rawLang.toLowerCase().startsWith("en") ? "en" : "es");
  }, []);

  const localizedPlaceholder: Record<PaletteContext, string> = {
    global: t.placeholder.global,
    board: t.placeholder.board,
    cards: t.placeholder.cards,
    lists: t.placeholder.lists,
    system: t.placeholder.system,
  };

  const availableContexts = useMemo(() => {
    return contextOrder.filter((ctx) => !contextMeta[ctx].boardOnly || isBoardContext);
  }, [isBoardContext]);

  const contextCommandCount = useMemo(
    () => ({
      global: contextTemplates.global.length,
      board: contextTemplates.board.length,
      cards: contextTemplates.cards.length,
      lists: contextTemplates.lists.length,
      system: contextTemplates.system.length,
    }),
    []
  );

  const switchContext = (next: PaletteContext) => {
    if (contextMeta[next].boardOnly && !isBoardContext) {
      notifyInfo("Ese contexto solo esta disponible dentro de un tablero.");
      return;
    }
    setCurrentContext(next);
    setCommandQuery("");
  };

  const runBoardAction = async (label: string, fn: () => Promise<void>) => {
    if (!isBoardContext) return;
    setIsRunningAction(true);
    try {
      await fn();
      window.dispatchEvent(new Event("board:refresh"));
      setOpen(false);
      alertSuccess(label);
    } catch (error) {
      console.error(`Command failed: ${label}`, error);
      alertError(t.fallback.runError);
    } finally {
      setIsRunningAction(false);
    }
  };

  const normalize = (value: string) => value.trim().toLowerCase();
  const isContextAllowed = (ctx: PaletteContext) => !contextMeta[ctx].boardOnly || isBoardContext;
  const sanitizeSelector = (value: string) => value.trim().replace(/^['\"]|['\"]$/g, "");

  function resolveBySelector<T>(selector: string, items: T[], getLabel: (item: T) => string): T | null {
    const clean = sanitizeSelector(selector);
    if (!clean) return null;

    const indexMatch = clean.match(/^#?(\d+)$/);
    if (indexMatch) {
      const index = Number(indexMatch[1]) - 1;
      return items[index] ?? null;
    }

    const needle = normalize(clean);
    const exact = items.find((item) => normalize(getLabel(item)) === needle);
    if (exact) return exact;

    return items.find((item) => normalize(getLabel(item)).includes(needle)) ?? null;
  }

  const parseCardQuery = (raw: string): ParsedCardQuery | null => {
    const match = raw.match(/^card\s+(.+?)\s+from\s+(.+?)\s+(rename|tag\s+add|tag\s+remove|assign|unassign)\s+(.+)$/i);
    if (!match) return null;

    const [, cardSelector, listSelector, actionToken, value] = match;
    const actionMap: Record<string, CardQueryAction> = {
      rename: "rename",
      "tag add": "tag_add",
      "tag remove": "tag_remove",
      assign: "assign",
      unassign: "unassign",
    };

    const normalizedAction = actionMap[normalize(actionToken)];
    if (!normalizedAction) return null;

    return {
      cardSelector: sanitizeSelector(cardSelector),
      listSelector: sanitizeSelector(listSelector),
      action: normalizedAction,
      value: value.trim(),
    };
  };

  const resolveListFromSelector = (selector: string) => resolveBySelector(selector, boardSnapshot?.lists ?? [], (list) => list.name);
  const resolveMemberFromSelector = (selector: string) =>
    resolveBySelector(selector, boardMembers, (member) => `${member.displayName || ""} ${member.email}`.trim());
  const resolveTagFromSelector = (selector: string) => resolveBySelector(selector, boardTags, (tag) => tag.name);

  const isBoardOnlyCommand = (lower: string) => {
    return (
      lower.startsWith("board refresh") ||
      lower.startsWith("board chat") ||
      lower.startsWith("board share") ||
      lower.startsWith("list add") ||
      lower.startsWith("cards done") ||
      lower.startsWith("cards active") ||
      lower.startsWith("cards clear-due") ||
      lower.startsWith("card done") ||
      lower.startsWith("card active") ||
      lower.startsWith("due clear") ||
      lower.startsWith("begin transaction") ||
      lower.startsWith("end transaction") ||
      lower.startsWith("rollback transaction") ||
      lower.startsWith("tx ") ||
      parseCardQuery(lower) !== null
    );
  };


  const [astSuggestions, setAstSuggestions] = useState<SuggestionItem[]>([]);

  const parseContext = useMemo<PaletteParseContext>(() => ({
    isBoardContext,
    hasTeamContext: Boolean(accessToken && activeTeamId),
    boardSnapshot,
    boardMembers,
    boardTags,
    teamBoards,
  }), [isBoardContext, accessToken, activeTeamId, boardSnapshot, boardMembers, boardTags, teamBoards]);

  useEffect(() => {
    let mounted = true;
    if (!commandQuery.trim()) {
      setAstSuggestions([]);
      return () => {}; // Return an empty cleanup function
    }
    suggestCommand(commandQuery, paletteCommandSpecs, parseContext, 12).then((items) => {
      if (mounted) setAstSuggestions(items);
    });
    return () => { mounted = false; };
  }, [commandQuery, parseContext]);

  const applyAutocomplete = () => {
    if (astSuggestions.length === 0) return;
    const target = astSuggestions[0].value;
    const tokensResult = tokenize(commandQuery);
    const tokens = [...tokensResult.tokens];
    const isVariableHint = target.startsWith("<") && target.endsWith(">");

    if (tokensResult.hasTrailingSpace || tokens.length === 0) {
      setCommandQuery(commandQuery + (isVariableHint ? "" : target + " "));
    } else {
      tokens[tokens.length - 1] = target;
      setCommandQuery(tokens.join(" ") + (isVariableHint ? "" : " "));
    }
  };

  const enqueueTransactionAction = (action: TransactionAction) => {
    const nextCount = txQueue.length + 1;
    setTxQueue((prev) => [...prev, action]);
    notifyInfo(`[TX] Encolado: ${action.label}. Pendientes: ${nextCount}`);
  };

  const startTransaction = async () => {
    if (!isBoardContext) {
      notifyInfo("Las transacciones requieren contexto de tablero.");
      return;
    }
    if (txActive) {
      notifyInfo("Ya hay una transaccion activa.");
      return;
    }
    await reloadBoardSnapshot();
    setTxActive(true);
    setTxQueue([]);
    notifyInfo("[TX] begin transaction - cola iniciada.");
  };

  const rollbackQueuedTransaction = () => {
    if (!txActive) {
      notifyInfo("No hay transaccion activa.");
      return;
    }
    const dropped = txQueue.length;
    setTxQueue([]);
    setTxActive(false);
    setCommandQuery("");
    notifyInfo(`[TX] rollback transaction - descartadas ${dropped} acciones.`);
  };

  const commitTransaction = async () => {
    if (!txActive) {
      notifyInfo("No hay transaccion activa.");
      return;
    }
    if (txQueue.length === 0) {
      setTxActive(false);
      notifyInfo("[TX] end transaction - no habia acciones en cola.");
      return;
    }

    setIsRunningAction(true);
    const executed: TransactionAction[] = [];

    try {
      for (const action of txQueue) {
        await action.execute();
        executed.push(action);
      }

      setTxQueue([]);
      setTxActive(false);
      setCommandQuery("");
      setOpen(false);
      window.dispatchEvent(new Event("board:refresh"));
      notifyInfo(`[TX] end transaction - commit OK (${executed.length} acciones).`);
    } catch (error) {
      console.error("Transaction commit failed", error);

      let rollbackFailures = 0;
      for (const action of [...executed].reverse()) {
        try {
          await action.rollback();
        } catch (rollbackError) {
          rollbackFailures += 1;
          console.error(`Rollback failed for ${action.label}`, rollbackError);
        }
      }

      setTxQueue([]);
      setTxActive(false);
      setCommandQuery("");
      window.dispatchEvent(new Event("board:refresh"));

      if (rollbackFailures > 0) {
        notifyInfo(`[TX] fallo el commit. Se intento rollback con ${rollbackFailures} errores.`);
      } else {
        notifyInfo("[TX] fallo el commit. Se revirtieron los cambios aplicados.");
      }
    } finally {
      setIsRunningAction(false);
    }
  };

  const getBoardCards = () => boardSnapshot?.lists.flatMap((list) => list.cards) ?? [];

  const executeCommandWithArgs = async (raw: string) => {
    const input = raw.trim();
    if (!input) return;

    const lower = normalize(input);
    const boardCards = getBoardCards();

    const parsed = parseCommand(input, paletteCommandSpecs, {
      isBoardContext,
      hasTeamContext: Boolean(accessToken && activeTeamId),
    });
    const target = parsed.best;

    if (!target || !target.executable) {
      if (!isBoardContext && isBoardOnlyCommand(lower)) {
        notifyInfo("Este comando requiere estar dentro de un board.");
        return;
      }
      notifyInfo("Comando no reconocido. Escribe 'help' para ver ejemplos.");
      return;
    }

    switch (target.spec.id) {
      case "ctx.change": {
        const contextCmd = String(target.args.target ?? "").toLowerCase();
        if (contextCmd === "up") {
          const parent = contextMeta[currentContext].parent;
          if (!parent) {
            notifyInfo("Ya estas en el contexto mas alto.");
            return;
          }
          switchContext(parent);
          return;
        }

        if (
          contextCmd === "global" ||
          contextCmd === "board" ||
          contextCmd === "cards" ||
          contextCmd === "lists" ||
          contextCmd === "system"
        ) {
          switchContext(contextCmd);
          return;
        }

        notifyInfo("Contexto no valido.");
        return;
      }

      case "tx.begin":
        await startTransaction();
        return;

      case "tx.commit":
        await commitTransaction();
        return;

      case "tx.rollback":
        rollbackQueuedTransaction();
        return;

      case "tx.status":
        notifyInfo(txActive ? `[TX] activa - ${txQueue.length} acciones en cola.` : "[TX] no hay transaccion activa.");
        return;

      case "global.dashboard":
        setOpen(false);
        router.push("/");
        return;

      case "global.teams":
        setOpen(false);
        router.push("/teams");
        return;

      case "global.history":
        setOpen(false);
        router.push("/history");
        return;

      case "board.open": {
        const selector = String(target.args.selector ?? "").trim();
        if (!selector) {
          notifyInfo("Uso: board <idx|nombre>");
          return;
        }

        const selectorLower = normalize(selector);
        if (selectorLower === "refresh") {
          setOpen(false);
          window.dispatchEvent(new Event("board:refresh"));
          return;
        }
        if (selectorLower === "chat") {
          setOpen(false);
          window.dispatchEvent(new Event("board:open-chat"));
          return;
        }
        if (selectorLower === "share") {
          setOpen(false);
          window.dispatchEvent(new Event("board:open-share"));
          return;
        }

        const board = resolveBySelector(selector, teamBoards, (b) => b.name);
        if (!board) {
          notifyInfo("No encontre un board con ese indice/nombre.");
          return;
        }

        setOpen(false);
        router.push(`/b/${board.id}`);
        return;
      }

      case "system.settings":
        setOpen(false);
        notifyInfo(t.fallback.settingsTriggered);
        return;

      case "system.logout":
        setOpen(false);
        window.location.href = "/login";
        return;

      case "system.help":
        notifyInfo(
          "Comandos clave: ctx global|board|cards|lists|system, ctx up, dashboard, teams, history, board <idx|nombre>, begin/end/rollback transaction, list add <nombre>, cards done all, cards active all, cards clear-due, card done <texto>, card active <texto>, due clear <texto>, card <card> from <lista> rename <titulo>, card <card> from <lista> tag add <tag>, card <card> from <lista> tag remove <tag>, card <card> from <lista> assign <miembro>, card <card> from <lista> unassign <miembro>, board refresh/chat/share"
        );
        return;

      case "board.refresh":
        setOpen(false);
        window.dispatchEvent(new Event("board:refresh"));
        return;

      case "board.chat":
        setOpen(false);
        window.dispatchEvent(new Event("board:open-chat"));
        return;

      case "board.share":
        setOpen(false);
        window.dispatchEvent(new Event("board:open-share"));
        return;

      default:
        break;
    }

    if (!isBoardContext || !accessToken || !boardIdFromPath) {
      notifyInfo("Este comando requiere estar dentro de un board.");
      return;
    }

    if (target.spec.id === "lists.add") {
      const name = String(target.args.name ?? "").trim();
      if (!name) {
        notifyInfo("Uso: list add <nombre>");
        return;
      }

      if (txActive) {
        notifyInfo("list add no soporta rollback seguro todavia. Ejecutalo fuera de transaccion.");
        return;
      }

      await runBoardAction(`Lista creada: ${name}`, async () => {
        await createList(boardIdFromPath, { name }, accessToken);
      });
      return;
    }

    if (target.spec.id === "cards.done.all") {
      if (txActive) {
        const targets = boardCards.map((card) => ({ id: card.id, prevStatus: card.status || "active" }));
        if (targets.length === 0) {
          notifyInfo("No hay cards para actualizar.");
          return;
        }
        enqueueTransactionAction({
          id: `tx-${Date.now()}-cards-done-all`,
          label: `cards done all (${targets.length})`,
          execute: async () => {
            await Promise.all(targets.map((t) => updateCard(t.id, { status: "done" }, accessToken)));
          },
          rollback: async () => {
            await Promise.all(targets.map((t) => updateCard(t.id, { status: t.prevStatus }, accessToken)));
          },
        });
        return;
      }

      await runBoardAction("Todas las cards marcadas como done", async () => {
        await Promise.all(boardCards.map((card) => updateCard(card.id, { status: "done" }, accessToken)));
      });
      return;
    }

    if (target.spec.id === "cards.active.all") {
      if (txActive) {
        const targets = boardCards.map((card) => ({ id: card.id, prevStatus: card.status || "active" }));
        if (targets.length === 0) {
          notifyInfo("No hay cards para actualizar.");
          return;
        }
        enqueueTransactionAction({
          id: `tx-${Date.now()}-cards-active-all`,
          label: `cards active all (${targets.length})`,
          execute: async () => {
            await Promise.all(targets.map((t) => updateCard(t.id, { status: "active" }, accessToken)));
          },
          rollback: async () => {
            await Promise.all(targets.map((t) => updateCard(t.id, { status: t.prevStatus }, accessToken)));
          },
        });
        return;
      }

      await runBoardAction("Todas las cards marcadas como active", async () => {
        await Promise.all(boardCards.map((card) => updateCard(card.id, { status: "active" }, accessToken)));
      });
      return;
    }

    if (target.spec.id === "cards.due.clear") {
      if (txActive) {
        const withDue = boardCards
          .filter((card) => Boolean(card.dueAt))
          .map((card) => ({ id: card.id, prevDueAt: card.dueAt }));
        if (withDue.length === 0) {
          notifyInfo("No hay cards con fecha limite.");
          return;
        }
        enqueueTransactionAction({
          id: `tx-${Date.now()}-cards-clear-due`,
          label: `cards clear-due (${withDue.length})`,
          execute: async () => {
            await Promise.all(withDue.map((t) => updateCard(t.id, { due_at: null }, accessToken)));
          },
          rollback: async () => {
            await Promise.all(withDue.map((t) => updateCard(t.id, { due_at: t.prevDueAt || null }, accessToken)));
          },
        });
        return;
      }

      await runBoardAction("Fechas limite limpiadas", async () => {
        const withDue = boardCards.filter((card) => Boolean(card.dueAt));
        await Promise.all(withDue.map((card) => updateCard(card.id, { due_at: null }, accessToken)));
      });
      return;
    }

    if (target.spec.id === "card.done.query" || target.spec.id === "card.active.query" || target.spec.id === "card.due.clear.query") {
      const query = normalize(String(target.args.query ?? ""));
      const card = boardCards.find((entry) => normalize(entry.title).includes(query));
      if (!card) {
        notifyInfo("No encontre una card que coincida.");
        return;
      }

      if (target.spec.id === "card.done.query") {
        if (txActive) {
          const prevStatus = card.status || "active";
          enqueueTransactionAction({
            id: `tx-${Date.now()}-card-done-${card.id}`,
            label: `card done ${card.title}`,
            execute: async () => {
              await updateCard(card.id, { status: "done" }, accessToken);
            },
            rollback: async () => {
              await updateCard(card.id, { status: prevStatus }, accessToken);
            },
          });
          return;
        }

        await runBoardAction(`Card marcada done: ${card.title}`, async () => {
          await updateCard(card.id, { status: "done" }, accessToken);
        });
        return;
      }

      if (target.spec.id === "card.active.query") {
        if (txActive) {
          const prevStatus = card.status || "active";
          enqueueTransactionAction({
            id: `tx-${Date.now()}-card-active-${card.id}`,
            label: `card active ${card.title}`,
            execute: async () => {
              await updateCard(card.id, { status: "active" }, accessToken);
            },
            rollback: async () => {
              await updateCard(card.id, { status: prevStatus }, accessToken);
            },
          });
          return;
        }

        await runBoardAction(`Card marcada active: ${card.title}`, async () => {
          await updateCard(card.id, { status: "active" }, accessToken);
        });
        return;
      }

      if (!card.dueAt) {
        notifyInfo("Esa card no tiene fecha limite para limpiar.");
        return;
      }

      if (txActive) {
        const prevDueAt = card.dueAt;
        enqueueTransactionAction({
          id: `tx-${Date.now()}-due-clear-${card.id}`,
          label: `due clear ${card.title}`,
          execute: async () => {
            await updateCard(card.id, { due_at: null }, accessToken);
          },
          rollback: async () => {
            await updateCard(card.id, { due_at: prevDueAt }, accessToken);
          },
        });
        return;
      }

      await runBoardAction(`Fecha limite limpiada: ${card.title}`, async () => {
        await updateCard(card.id, { due_at: null }, accessToken);
      });
      return;
    }

    const cardPayload = target.spec.id === "card.query.mutate" ? String(target.args.payload ?? "") : "";
    const cardQuery = parseCardQuery(`card ${cardPayload}`);
    if (cardQuery) {
      const list = resolveListFromSelector(cardQuery.listSelector);
      if (!list) {
        notifyInfo("No encontre la lista indicada.");
        return;
      }

      const targetCard = resolveBySelector(cardQuery.cardSelector, list.cards, (card) => card.title);
      if (!targetCard) {
        notifyInfo("No encontre la card indicada dentro de esa lista.");
        return;
      }

      if (cardQuery.action === "rename") {
        const nextTitle = cardQuery.value.trim();
        if (!nextTitle) {
          notifyInfo("Uso: card <card> from <lista> rename <nuevo titulo>");
          return;
        }

        if (txActive) {
          const previousTitle = targetCard.title;
          enqueueTransactionAction({
            id: `tx-${Date.now()}-card-rename-${targetCard.id}`,
            label: `rename ${targetCard.title}`,
            execute: async () => {
              await updateCard(targetCard.id, { title: nextTitle }, accessToken);
            },
            rollback: async () => {
              await updateCard(targetCard.id, { title: previousTitle }, accessToken);
            },
          });
          return;
        }

        await runBoardAction(`Card renombrada: ${nextTitle}`, async () => {
          await updateCard(targetCard.id, { title: nextTitle }, accessToken);
        });
        return;
      }

      if (cardQuery.action === "tag_add") {
        const tagName = cardQuery.value.trim();
        if (!tagName) {
          notifyInfo("Uso: card <card> from <lista> tag add <tag>");
          return;
        }

        let tag = resolveTagFromSelector(tagName);
        if (!tag) {
          tag = await createTag({ scopeType: "board", scopeId: boardIdFromPath, name: tagName, tagKind: "custom" }, accessToken);
          setBoardTags((prev) => [...prev, tag as TagView]);
        }

        if (targetCard.tags.some((existing) => existing.id === tag.id)) {
          notifyInfo("La card ya tiene ese tag.");
          return;
        }

        if (txActive) {
          enqueueTransactionAction({
            id: `tx-${Date.now()}-card-tag-add-${targetCard.id}-${tag.id}`,
            label: `tag add ${tag.name} -> ${targetCard.title}`,
            execute: async () => {
              await addCardTag(targetCard.id, tag.id, accessToken);
            },
            rollback: async () => {
              await removeCardTag(targetCard.id, tag.id, accessToken);
            },
          });
          return;
        }

        await runBoardAction(`Tag agregado: ${tag.name}`, async () => {
          await addCardTag(targetCard.id, tag.id, accessToken);
        });
        return;
      }

      if (cardQuery.action === "tag_remove") {
        const tag = resolveTagFromSelector(cardQuery.value);
        if (!tag) {
          notifyInfo("No encontre ese tag en el board.");
          return;
        }

        if (!targetCard.tags.some((existing) => existing.id === tag.id)) {
          notifyInfo("La card no tiene ese tag.");
          return;
        }

        if (txActive) {
          enqueueTransactionAction({
            id: `tx-${Date.now()}-card-tag-remove-${targetCard.id}-${tag.id}`,
            label: `tag remove ${tag.name} -> ${targetCard.title}`,
            execute: async () => {
              await removeCardTag(targetCard.id, tag.id, accessToken);
            },
            rollback: async () => {
              await addCardTag(targetCard.id, tag.id, accessToken);
            },
          });
          return;
        }

        await runBoardAction(`Tag removido: ${tag.name}`, async () => {
          await removeCardTag(targetCard.id, tag.id, accessToken);
        });
        return;
      }

      const member = resolveMemberFromSelector(cardQuery.value);
      if (!member) {
        notifyInfo("No encontre ese miembro del board.");
        return;
      }

      if (txActive) {
        notifyInfo("assign/unassign no soporta rollback seguro todavia. Ejecutalo fuera de transaccion.");
        return;
      }

      if (cardQuery.action === "assign") {
        await runBoardAction(`Asignado: ${member.displayName || member.email}`, async () => {
          await addCardAssignee(targetCard.id, member.id, accessToken);
        });
        return;
      }

      if (cardQuery.action === "unassign") {
        await runBoardAction(`Desasignado: ${member.displayName || member.email}`, async () => {
          await removeCardAssignee(targetCard.id, member.id, accessToken);
        });
        return;
      }
    }

    notifyInfo("Comando no reconocido. Escribe 'help' para ver ejemplos.");
  };

  const reloadBoardSnapshot = async () => {
    if (!boardIdFromPath || !accessToken) return;
    try {
      const [board, members, tags] = await Promise.all([
        getBoard(boardIdFromPath, accessToken),
        getBoardMembers(boardIdFromPath, accessToken),
        getTagsByScope("board", boardIdFromPath, accessToken),
      ]);
      setBoardSnapshot({
        id: board.id,
        name: board.name,
        lists: board.lists.map((list) => ({
          id: list.id,
          name: list.name,
          cards: list.cards.map((card) => ({
            id: card.id,
            title: card.title,
            dueAt: card.dueAt,
            status: (card as { status?: string | null }).status ?? null,
            tags: card.tags ?? [],
          })),
        })),
      });
      setBoardMembers(members);
      setBoardTags(tags);
    } catch (error) {
      console.error("Failed to load board commands", error);
      setBoardSnapshot(null);
      setBoardMembers([]);
      setBoardTags([]);
    }
  };

  const reloadTeamBoards = async () => {
    if (!accessToken || !activeTeamId) {
      setTeamBoards([]);
      return;
    }

    try {
      const boards = await listTeamBoards(activeTeamId, accessToken);
      setTeamBoards(boards);
    } catch (error) {
      console.error("Failed to load team boards for commands", error);
      setTeamBoards([]);
    }
  };

  // Open menu with Ctrl/Cmd+K (PowerToys style) and close with Esc.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const isCtrlK = (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "k";
      if (isCtrlK) {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  useEffect(() => {
    const handleOpenCmdk = () => setOpen(true);
    window.addEventListener("open-cmdk", handleOpenCmdk);
    return () => window.removeEventListener("open-cmdk", handleOpenCmdk);
  }, []);

  useEffect(() => {
    if (!open) return;
    if (!isBoardContext) {
      setBoardSnapshot(null);
      setBoardMembers([]);
      setBoardTags([]);
      return;
    }
    reloadBoardSnapshot();
  }, [open, isBoardContext, boardIdFromPath, accessToken]);

  useEffect(() => {
    if (!open) return;
    reloadTeamBoards();
  }, [open, accessToken, activeTeamId]);

  useEffect(() => {
    if (!open) return;
    setCommandQuery("");
    setCurrentContext(isBoardContext ? "board" : "global");
  }, [open, isBoardContext]);

  if (!open) return null;

  const boardCards = boardSnapshot?.lists.flatMap((list) => list.cards) ?? [];
  const boardCardsWithDueDate = boardCards.filter((card) => Boolean(card.dueAt));
  const parentContext = contextMeta[currentContext].parent;
  const sampleList = boardSnapshot?.lists[0] ?? null;
  const sampleCard = sampleList?.cards[0] ?? null;
  const sampleTagName = boardTags[0]?.name || "bug";
  const sampleMemberName = boardMembers[0]?.displayName || boardMembers[0]?.email || "miembro";

  const itemClassName =
    "flex items-center gap-3 px-3 py-2 text-sm rounded-md cursor-pointer hover:bg-accent/10 hover:text-foreground text-foreground/80 transition-colors aria-selected:bg-accent/10 aria-selected:text-foreground mt-1";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-background/80 backdrop-blur-sm p-4">
      <div className="absolute inset-0 -z-10" onClick={() => setOpen(false)} />

      {notices.length > 0 ? (
        <div className="fixed top-4 right-4 z-[90] flex w-full max-w-sm flex-col gap-2">
          {notices.map((notice) => (
            <div
              key={notice.id}
              className={`rounded-lg border px-4 py-3 text-sm shadow-lg backdrop-blur-sm ${
                notice.variant === "success"
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-200"
                  : notice.variant === "error"
                  ? "bg-red-500/10 border-red-500/30 text-red-200"
                  : "bg-sky-500/10 border-sky-500/30 text-sky-200"
              }`}
            >
              {notice.text}
            </div>
          ))}
        </div>
      ) : null}

      <div className="w-full max-w-xl rounded-xl border border-border bg-card shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <Command label="Global Command Menu" className="flex flex-col w-full h-full">
          <div className="border-b border-border px-4 py-3">
            <div className="flex items-center gap-3">
              <Search className="h-5 w-5 text-muted-foreground" />
              <Command.Input
                autoFocus
                value={commandQuery}
                onValueChange={setCommandQuery}
                onKeyDown={async (e) => {
                  if (e.key === "Tab") {
                    e.preventDefault();
                    applyAutocomplete();
                    return;
                  }
                  if (e.key === "Enter" && commandQuery.trim()) {
                    e.preventDefault();
                    await executeCommandWithArgs(commandQuery);
                  }
                }}
                placeholder={localizedPlaceholder[currentContext]}
                className="flex-1 bg-transparent outline-none placeholder:text-muted-foreground text-foreground"
              />
              <button onClick={() => setOpen(false)} className="flex items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity">
                <span className="text-xs text-muted-foreground bg-accent/10 px-1.5 py-0.5 rounded border border-accent/20">esc</span>
                <span className="text-xs text-muted-foreground">close</span>
              </button>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5">
                {contextMeta[currentContext].label}
              </span>
              <span>{contextCommandCount[currentContext]} commands</span>
              {parentContext ? (
                <button
                  type="button"
                  onClick={() => switchContext(parentContext)}
                  className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 hover:bg-accent/10 text-foreground/80"
                >
                  <Folders className="h-3 w-3" />
                  Subir a {contextMeta[parentContext].label}
                </button>
              ) : null}
              {/* nextTokenHint debe estar definido o eliminado si no se usa */}
              {/* {nextTokenHint ? <span>{t.hint.nextToken}: {nextTokenHint}</span> : null} */}
              {null}
              <span>{t.hint.enterRun}</span>
              {txActive ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-emerald-300">
                  TX activa: {txQueue.length}
                </span>
              ) : null}
            </div>
          </div>

          <Command.List className="max-h-[420px] overflow-y-auto p-2 pb-4 hide-scrollbar">
            <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
              Sin resultados en el contexto {contextMeta[currentContext].label}.
            </Command.Empty>

            <Command.Group heading="Context Navigator" className="px-2 text-xs font-semibold text-muted-foreground mt-2 mb-1">
              {availableContexts.map((ctx) => {
                const Icon = contextMeta[ctx].icon;
                const isActive = currentContext === ctx;
                return (
                  <Command.Item
                    key={`ctx-${ctx}`}
                    value={`ctx ${ctx} context ${ctx} ${contextMeta[ctx].label.toLowerCase()}`}
                    onSelect={() => switchContext(ctx)}
                    className={`${itemClassName} ${isActive ? "bg-accent/10 text-foreground" : ""}`}
                  >
                    {Icon ? <Icon className="h-4 w-4 text-muted-foreground" /> : null}
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{contextMeta[ctx].label}</div>
                      <div className="truncate text-xs text-muted-foreground">{contextMeta[ctx].description}</div>
                    </div>
                    <span className="text-[11px] text-muted-foreground">{contextCommandCount[ctx]} commands</span>
                  </Command.Item>
                );
              })}
            </Command.Group>
            {isBoardContext ? (
              <Command.Group heading="Transaction" className="px-2 text-xs font-semibold text-muted-foreground mt-4 mb-1">
                {!txActive ? (
                  <Command.Item
                    value="tx-begin"
                    onSelect={startTransaction}
                    className={itemClassName}
                    disabled={isRunningAction}
                  >
                    <Plus className="h-4 w-4 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">Begin Transaction</div>
                      <div className="truncate text-xs text-muted-foreground">Inicia cola reversible de comandos</div>
                    </div>
                  </Command.Item>
                ) : null}

                {txActive ? (
                  <Command.Item
                    value="tx-end"
                    onSelect={commitTransaction}
                    className={itemClassName}
                    disabled={isRunningAction}
                  >
                    <CheckSquare className="h-4 w-4 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">End Transaction</div>
                      <div className="truncate text-xs text-muted-foreground">Commit de {txQueue.length} acciones en cola</div>
                    </div>
                  </Command.Item>
                ) : null}

                {txActive ? (
                  <Command.Item
                    value="tx-rollback"
                    onSelect={rollbackQueuedTransaction}
                    className={itemClassName}
                    disabled={isRunningAction}
                  >
                    <RefreshCcw className="h-4 w-4 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">Rollback Transaction</div>
                      <div className="truncate text-xs text-muted-foreground">Descarta la cola sin aplicar cambios</div>
                    </div>
                  </Command.Item>
                ) : null}

                <Command.Item
                  value="tx-status"
                  onSelect={() => notifyInfo(txActive ? `[TX] activa - ${txQueue.length} acciones en cola.` : "[TX] no hay transaccion activa.")}
                  className={itemClassName}
                >
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">Transaction Status</div>
                    <div className="truncate text-xs text-muted-foreground">Estado actual de la transaccion</div>
                  </div>
                </Command.Item>
              </Command.Group>
            ) : null}

            {parentContext ? (
              <Command.Group heading="Context Flow" className="px-2 text-xs font-semibold text-muted-foreground mt-4 mb-1">
                <Command.Item value="context-up" onSelect={() => switchContext(parentContext)} className={itemClassName}>
                  <Folders className="h-4 w-4 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">Subir contexto</div>
                    <div className="truncate text-xs text-muted-foreground">Volver a {contextMeta[parentContext].label}</div>
                  </div>
                </Command.Item>

                {currentContext !== "global" ? (
                  <Command.Item value="context-global" onSelect={() => switchContext("global")} className={itemClassName}>
                    <Search className="h-4 w-4 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">Ir a Global</div>
                      <div className="truncate text-xs text-muted-foreground">Cambiar al nivel raiz de comandos</div>
                    </div>
                  </Command.Item>
                ) : null}
              </Command.Group>
            ) : null}

            {astSuggestions.length > 0 ? (
              <Command.Group heading="Suggestions" className="px-2 text-xs font-semibold text-muted-foreground mt-4 mb-1">
                {astSuggestions.map((suggestion, idx) => {
                  const Icon = resolveIcon(suggestion.commandId) as React.ComponentType<{ className?: string }> ;
                  return (
                    <Command.Item
                      key={`suggest-${suggestion.commandId}-${idx}`}
                      value={`suggest ${suggestion.commandId} ${suggestion.value} ${idx}`}
                      onSelect={() => {
                        const target = suggestion.value;
                        const tokensResult = tokenize(commandQuery);
                        const tokens = [...tokensResult.tokens];
                        const isVariableHint = target.startsWith("<") && target.endsWith(">");

                        if (tokensResult.hasTrailingSpace || tokens.length === 0) {
                          setCommandQuery(commandQuery + (isVariableHint ? "" : target + " "));
                        } else {
                          tokens[tokens.length - 1] = target;
                          setCommandQuery(tokens.join(" ") + (isVariableHint ? "" : " "));
                        }
                      }}
                      className={itemClassName}
                    >
                      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{suggestion.value}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {suggestion.description} &middot; Enter para autocompletar
                        </div>
                      </div>
                    </Command.Item>
                  );
                })}
              </Command.Group>
            ) : null}

            {!commandQuery.trim() ? (
              <>

            {currentContext === "global" ? (
              <Command.Group heading="Global Navigation" className="px-2 text-xs font-semibold text-muted-foreground mt-4 mb-1">
                <Command.Item
                  value="dashboard"
                  onSelect={() => {
                    setOpen(false);
                    router.push("/");
                  }}
                  className={itemClassName}
                >
                  <LayoutDashboard className="h-4 w-4 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">Dashboard</div>
                    <div className="truncate text-xs text-muted-foreground">Vista principal de workspaces</div>
                  </div>
                </Command.Item>

                <Command.Item
                  value="teams"
                  onSelect={() => {
                    setOpen(false);
                    router.push("/teams");
                  }}
                  className={itemClassName}
                >
                  <UserPlus className="h-4 w-4 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">Teams</div>
                    <div className="truncate text-xs text-muted-foreground">Invitaciones y miembros del equipo</div>
                  </div>
                </Command.Item>

                <Command.Item
                  value="history"
                  onSelect={() => {
                    setOpen(false);
                    router.push("/history");
                  }}
                  className={itemClassName}
                >
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">History</div>
                    <div className="truncate text-xs text-muted-foreground">Accesos recientes y trazabilidad</div>
                  </div>
                </Command.Item>
              </Command.Group>
            ) : null}

            {currentContext === "global" && teamBoards.length > 0 ? (
              <Command.Group heading="Team Boards (Query: board <idx|name>)" className="px-2 text-xs font-semibold text-muted-foreground mt-4 mb-1">
                {teamBoards.slice(0, 10).map((board, index) => (
                  <Command.Item
                    key={`team-board-${board.id}`}
                    value={`board ${index + 1} ${board.name}`}
                    onSelect={() => {
                      setOpen(false);
                      router.push(`/b/${board.id}`);
                    }}
                    className={itemClassName}
                  >
                    <LayoutDashboard className="h-4 w-4 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{index + 1}. {board.name}</div>
                      <div className="truncate text-xs text-muted-foreground">Comando: board {index + 1} o board {board.name}</div>
                    </div>
                  </Command.Item>
                ))}
              </Command.Group>
            ) : null}

            {currentContext === "board" && isBoardContext && boardSnapshot ? (
              <Command.Group heading={`Tablero: ${boardSnapshot.name}`} className="px-2 text-xs font-semibold text-muted-foreground mt-4 mb-1">
                <Command.Item
                  value="board-refresh"
                  onSelect={() => {
                    setOpen(false);
                    window.dispatchEvent(new Event("board:refresh"));
                  }}
                  className={itemClassName}
                >
                  <RefreshCcw className="h-4 w-4 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">Refresh This Board</div>
                    <div className="truncate text-xs text-muted-foreground">Sincroniza listas, cards y estado</div>
                  </div>
                </Command.Item>

                <Command.Item
                  value="board-chat-open"
                  onSelect={() => {
                    setOpen(false);
                    window.dispatchEvent(new Event("board:open-chat"));
                  }}
                  className={itemClassName}
                >
                  <Bot className="h-4 w-4 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">Open Board Chat</div>
                    <div className="truncate text-xs text-muted-foreground">Abrir asistente con contexto del board</div>
                  </div>
                </Command.Item>

                <Command.Item
                  value="board-share-open"
                  onSelect={() => {
                    setOpen(false);
                    window.dispatchEvent(new Event("board:open-share"));
                  }}
                  className={itemClassName}
                >
                  <UserPlus className="h-4 w-4 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">Edit Board Access</div>
                    <div className="truncate text-xs text-muted-foreground">Miembros, roles y visibilidad</div>
                  </div>
                </Command.Item>

                <Command.Item
                  value="board-add-list-quick"
                  onSelect={() => {
                    switchContext("lists");
                    setCommandQuery("list add ");
                  }}
                  className={itemClassName}
                >
                  <Plus className="h-4 w-4 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">Quick Add List</div>
                    <div className="truncate text-xs text-muted-foreground">Prepara args: list add &lt;name&gt;</div>
                  </div>
                </Command.Item>
              </Command.Group>
            ) : null}

            {(currentContext === "board" || currentContext === "cards") && isBoardContext && boardSnapshot && sampleList && sampleCard ? (
              <Command.Group heading="Card Querys" className="px-2 text-xs font-semibold text-muted-foreground mt-4 mb-1">
                <Command.Item
                  value="query-rename-card"
                  onSelect={() => setCommandQuery(`card ${sampleCard.title} from ${sampleList.name} rename `)}
                  className={itemClassName}
                >
                  <Edit3 className="h-4 w-4 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">Rename</div>
                    <div className="truncate text-xs text-muted-foreground">card {sampleCard.title} from {sampleList.name} rename &lt;nuevo titulo&gt;</div>
                  </div>
                </Command.Item>

                <Command.Item
                  value="query-tag-add"
                  onSelect={() => setCommandQuery(`card ${sampleCard.title} from ${sampleList.name} tag add ${sampleTagName}`)}
                  className={itemClassName}
                >
                  <Tag className="h-4 w-4 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">Tag Add</div>
                    <div className="truncate text-xs text-muted-foreground">card {sampleCard.title} from {sampleList.name} tag add {sampleTagName}</div>
                  </div>
                </Command.Item>

                <Command.Item
                  value="query-assign"
                  onSelect={() => setCommandQuery(`card ${sampleCard.title} from ${sampleList.name} assign ${sampleMemberName}`)}
                  className={itemClassName}
                >
                  <UserPlus className="h-4 w-4 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">Assign</div>
                    <div className="truncate text-xs text-muted-foreground">card {sampleCard.title} from {sampleList.name} assign {sampleMemberName}</div>
                  </div>
                </Command.Item>

                <Command.Item
                  value="query-unassign"
                  onSelect={() => setCommandQuery(`card ${sampleCard.title} from ${sampleList.name} unassign ${sampleMemberName}`)}
                  className={itemClassName}
                >
                  <UserMinus className="h-4 w-4 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">Unassign</div>
                    <div className="truncate text-xs text-muted-foreground">card {sampleCard.title} from {sampleList.name} unassign {sampleMemberName}</div>
                  </div>
                </Command.Item>
              </Command.Group>
            ) : null}

            {currentContext === "cards" && isBoardContext && boardSnapshot ? (
              <>
                <Command.Group heading="Cards Bulk Control" className="px-2 text-xs font-semibold text-muted-foreground mt-4 mb-1">
                  <Command.Item
                    value="cards-mark-all-done"
                    onSelect={async () => {
                      if (!accessToken || isRunningAction) return;
                      await runBoardAction("Todas las cards marcadas como done", async () => {
                        await Promise.all(boardCards.map((card) => updateCard(card.id, { status: "done" }, accessToken)));
                      });
                    }}
                    className={itemClassName}
                  >
                    <CheckSquare className="h-4 w-4 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">Mark All Cards as Done ({boardCards.length})</div>
                      <div className="truncate text-xs text-muted-foreground">Comando: cards done all</div>
                    </div>
                  </Command.Item>

                  <Command.Item
                    value="cards-mark-all-active"
                    onSelect={async () => {
                      if (!accessToken || isRunningAction) return;
                      await runBoardAction("Todas las cards marcadas como active", async () => {
                        await Promise.all(boardCards.map((card) => updateCard(card.id, { status: "active" }, accessToken)));
                      });
                    }}
                    className={itemClassName}
                  >
                    <ListChecks className="h-4 w-4 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">Mark All Cards as Active ({boardCards.length})</div>
                      <div className="truncate text-xs text-muted-foreground">Comando: cards active all</div>
                    </div>
                  </Command.Item>

                  <Command.Item
                    value="cards-clear-due-dates"
                    onSelect={async () => {
                      if (!accessToken || isRunningAction) return;
                      await runBoardAction("Fechas limite limpiadas", async () => {
                        await Promise.all(boardCardsWithDueDate.map((card) => updateCard(card.id, { due_at: null }, accessToken)));
                      });
                    }}
                    className={itemClassName}
                  >
                    <CalendarX className="h-4 w-4 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">Clear All Due Dates ({boardCardsWithDueDate.length})</div>
                      <div className="truncate text-xs text-muted-foreground">Comando: cards clear-due</div>
                    </div>
                  </Command.Item>
                </Command.Group>

                <Command.Group heading="Board Cards You Can Access" className="px-2 text-xs font-semibold text-muted-foreground mt-4 mb-1">
                  {boardCards.slice(0, 50).map((card) => (
                    <Command.Item
                      key={card.id}
                      value={`card-suggest-${card.id}`}
                      onSelect={() => setCommandQuery(`card done ${card.title}`)}
                      className={itemClassName}
                    >
                      <CheckSquare className="h-4 w-4 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{card.title}</div>
                        <div className="truncate text-xs text-muted-foreground">Preparar comando: card done {card.title}</div>
                      </div>
                    </Command.Item>
                  ))}
                </Command.Group>
              </>
            ) : null}

            {currentContext === "lists" && isBoardContext && boardSnapshot ? (
              <>
                <Command.Group heading="List Actions" className="px-2 text-xs font-semibold text-muted-foreground mt-4 mb-1">
                  <Command.Item
                    value="list-add-quick"
                    onSelect={() => {
                      setCommandQuery("list add ");
                    }}
                    className={itemClassName}
                  >
                    <Plus className="h-4 w-4 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">Add New List</div>
                      <div className="truncate text-xs text-muted-foreground">Comando: list add &lt;nombre&gt;</div>
                    </div>
                  </Command.Item>
                </Command.Group>

                <Command.Group heading="Existing Lists" className="px-2 text-xs font-semibold text-muted-foreground mt-4 mb-1">
                  {boardSnapshot.lists.map((list) => (
                    <Command.Item
                      key={list.id}
                      value={`list-suggest-${list.id}`}
                      onSelect={() => setCommandQuery(`list add ${list.name}`)}
                      className={itemClassName}
                    >
                      <ListChecks className="h-4 w-4 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{list.name}</div>
                        <div className="truncate text-xs text-muted-foreground">Usar como plantilla en list add</div>
                      </div>
                    </Command.Item>
                  ))}
                </Command.Group>
              </>
            ) : null}

            {currentContext === "system" ? (
              <Command.Group heading="System" className="px-2 text-xs font-semibold text-muted-foreground mt-4 mb-1">
                <Command.Item
                  value="settings"
                  onSelect={() => {
                    setOpen(false);
                    notifyInfo(t.fallback.settingsTriggered);
                  }}
                  className={itemClassName}
                >
                  <Settings className="h-4 w-4 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">Settings</div>
                    <div className="truncate text-xs text-muted-foreground">Preferencias y configuracion general</div>
                  </div>
                </Command.Item>

                <Command.Item
                  value="help"
                  onSelect={() => {
                    setOpen(false);
                    window.open("https://github.com/Kynto", "_blank");
                  }}
                  className={itemClassName}
                >
                  <HelpCircle className="h-4 w-4 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">Help & Documentation</div>
                    <div className="truncate text-xs text-muted-foreground">Documentacion oficial del proyecto</div>
                  </div>
                </Command.Item>

                <Command.Item
                  value="logout"
                  onSelect={() => {
                    setOpen(false);
                    window.location.href = "/login";
                  }}
                  className="flex items-center gap-3 px-3 py-2 text-sm rounded-md cursor-pointer hover:bg-destructive/10 text-destructive transition-colors aria-selected:bg-destructive/10 aria-selected:text-destructive mt-1"
                >
                  <LogOut className="h-4 w-4" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">Log out</div>
                    <div className="truncate text-xs text-destructive/80">Cerrar sesion del usuario actual</div>
                  </div>
                </Command.Item>
              </Command.Group>
            ) : null}

            {currentContext !== "system" ? (
              <div className="px-3 py-2 text-[11px] text-muted-foreground">
                Tip: usa <span className="text-foreground">ctx board</span>, <span className="text-foreground">ctx cards</span> o <span className="text-foreground">ctx up</span> para navegar entre niveles.
              </div>
            ) : null}
            </>
            ) : null}
          </Command.List>
        </Command>
      </div>
    </div>
  );
}




