"use client";

import { useEffect, useMemo, useState } from "react";
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

type PaletteContext = "global" | "board" | "cards" | "lists" | "system";

type BoardSnapshot = {
  id: string;
  name: string;
  lists: Array<{
    id: string;
    name: string;
    cards: Array<{
      id: string;
      title: string;
      dueAt: string | null;
      status: string | null;
      tags: TagView[];
    }>;
  }>;
};

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

type AutocompleteSuggestion = {
  command: string;
  icon: typeof Search;
  description: string;
  available: boolean;
  availabilityNote?: string;
};

const contextMeta: Record<
  PaletteContext,
  {
    label: string;
    description: string;
    icon: typeof Search;
    parent: PaletteContext | null;
    boardOnly: boolean;
  }
> = {
  global: {
    label: "Global",
    description: "Navegacion general y accesos rapidos",
    icon: Search,
    parent: null,
    boardOnly: false,
  },
  board: {
    label: "Tablero",
    description: "Acciones del board y colaboracion",
    icon: LayoutDashboard,
    parent: "global",
    boardOnly: true,
  },
  cards: {
    label: "Cards",
    description: "Control masivo y comandos por card",
    icon: CheckSquare,
    parent: "board",
    boardOnly: true,
  },
  lists: {
    label: "Listas",
    description: "Estructura y gestion de listas",
    icon: ListChecks,
    parent: "board",
    boardOnly: true,
  },
  system: {
    label: "Sistema",
    description: "Ajustes, ayuda y sesion",
    icon: Settings,
    parent: "global",
    boardOnly: false,
  },
};

const contextOrder: PaletteContext[] = ["global", "board", "cards", "lists", "system"];

const contextTemplates: Record<PaletteContext, string[]> = {
  global: ["ctx board", "ctx cards", "ctx lists", "ctx system", "dashboard", "teams", "history", "board ", "help"],
  board: [
    "ctx up",
    "ctx cards",
    "ctx lists",
    "board refresh",
    "board chat",
    "board share",
    "begin transaction",
    "end transaction",
    "rollback transaction",
    "tx status",
    "list add Backlog",
    "card 1 from 1 rename Mejorar onboarding",
    "card Login from Backlog tag add bug",
    "card 2 from Backlog assign ana",
    "card 2 from Backlog unassign ana",
  ],
  cards: [
    "ctx up",
    "begin transaction",
    "end transaction",
    "rollback transaction",
    "tx status",
    "cards done all",
    "cards active all",
    "cards clear-due",
    "card done ",
    "card active ",
    "due clear ",
    "card 1 from 1 rename Mejorar onboarding",
    "card Login from Backlog tag add bug",
    "card 2 from Backlog assign ana",
    "card 2 from Backlog unassign ana",
  ],
  lists: ["ctx up", "begin transaction", "end transaction", "rollback transaction", "tx status", "list add Backlog"],
  system: ["ctx up", "settings", "help", "logout"],
};

const contextPlaceholder: Record<PaletteContext, string> = {
  global: "Comando global. Ej: history, teams, board 2",
  board: "Comando de tablero. Ej: board share, list add Sprint, card 1 from 2 rename Titulo",
  cards: "Comando de cards. Ej: cards done all, card done login",
  lists: "Comando de listas. Ej: list add In Review",
  system: "Sistema. Ej: settings, help, logout",
};

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [isRunningAction, setIsRunningAction] = useState(false);
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

  const boardIdFromPath = useMemo(() => {
    const match = pathname?.match(/\/b\/([^/]+)/);
    return match?.[1] || null;
  }, [pathname]);

  const isBoardContext = Boolean(boardIdFromPath && accessToken);

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
      alert("Ese contexto solo esta disponible dentro de un tablero.");
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
      alert(label);
    } catch (error) {
      console.error(`Command failed: ${label}`, error);
      alert("No se pudo ejecutar el comando.");
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

  const getSuggestionMeta = (command: string): { icon: typeof Search; description: string } => {
    const lower = normalize(command);

    if (lower.startsWith("ctx ") || lower.startsWith("context ")) {
      return { icon: Folders, description: "Navegacion de contexto" };
    }
    if (lower.startsWith("board chat")) {
      return { icon: Bot, description: "Abrir chat del tablero" };
    }
    if (lower.startsWith("board share")) {
      return { icon: UserPlus, description: "Editar acceso del board" };
    }
    if (lower.startsWith("board refresh")) {
      return { icon: RefreshCcw, description: "Recargar estado del tablero" };
    }
    if (lower.startsWith("board ")) {
      return { icon: LayoutDashboard, description: "Abrir board por indice o nombre" };
    }
    if (lower.startsWith("list add")) {
      return { icon: Plus, description: "Crear nueva lista" };
    }
    if (lower.startsWith("cards done") || lower.startsWith("card done")) {
      return { icon: CheckSquare, description: "Marcar card(s) como done" };
    }
    if (lower.startsWith("cards active") || lower.startsWith("card active")) {
      return { icon: ListChecks, description: "Marcar card(s) como active" };
    }
    if (lower.startsWith("cards clear-due") || lower.startsWith("due clear")) {
      return { icon: CalendarX, description: "Limpiar fechas limite" };
    }
    if (lower.includes(" tag add ")) {
      return { icon: Tag, description: "Agregar tag a card" };
    }
    if (lower.includes(" tag remove ")) {
      return { icon: Tag, description: "Quitar tag de card" };
    }
    if (lower.includes(" rename ")) {
      return { icon: Edit3, description: "Renombrar card" };
    }
    if (lower.includes(" assign ")) {
      return { icon: UserPlus, description: "Asignar miembro a card" };
    }
    if (lower.includes(" unassign ")) {
      return { icon: UserMinus, description: "Quitar asignado de card" };
    }
    if (lower.startsWith("begin transaction") || lower.startsWith("end transaction") || lower.startsWith("rollback transaction") || lower.startsWith("tx ")) {
      return { icon: RefreshCcw, description: "Control de transacciones" };
    }
    if (lower === "dashboard" || lower === "go dashboard" || lower === "go home") {
      return { icon: LayoutDashboard, description: "Ir al dashboard" };
    }
    if (lower === "teams" || lower === "go teams") {
      return { icon: UserPlus, description: "Ir a equipos" };
    }
    if (lower === "history" || lower === "go history") {
      return { icon: Clock, description: "Ver historial" };
    }
    if (lower.startsWith("settings")) {
      return { icon: Settings, description: "Ajustes del sistema" };
    }
    if (lower.startsWith("help")) {
      return { icon: HelpCircle, description: "Ayuda y documentacion" };
    }
    if (lower.startsWith("logout")) {
      return { icon: LogOut, description: "Cerrar sesion" };
    }

    return { icon: Search, description: "Comando" };
  };

  const mapCommandSuggestion = (command: string): AutocompleteSuggestion => {
    const meta = getSuggestionMeta(command);
    const lower = normalize(command);

    if (lower.startsWith("ctx ")) {
      const target = lower.slice("ctx ".length).trim() as PaletteContext | "up";
      if (target !== "up" && !isContextAllowed(target as PaletteContext)) {
        return {
          command,
          icon: meta.icon,
          description: meta.description,
          available: false,
          availabilityNote: "Requiere estar dentro de un board",
        };
      }
    }

    if (isBoardOnlyCommand(lower) && !isBoardContext) {
      return {
        command,
        icon: meta.icon,
        description: meta.description,
        available: false,
        availabilityNote: "Solo disponible dentro de un board",
      };
    }

    if (lower.startsWith("board ") && !lower.startsWith("board refresh") && !lower.startsWith("board chat") && !lower.startsWith("board share")) {
      if (!accessToken || !activeTeamId) {
        return {
          command,
          icon: meta.icon,
          description: meta.description,
          available: false,
          availabilityNote: "Necesitas un equipo activo",
        };
      }
    }

    return {
      command,
      icon: meta.icon,
      description: meta.description,
      available: true,
    };
  };

  const enqueueTransactionAction = (action: TransactionAction) => {
    const nextCount = txQueue.length + 1;
    setTxQueue((prev) => [...prev, action]);
    alert(`[TX] Encolado: ${action.label}. Pendientes: ${nextCount}`);
  };

  const startTransaction = async () => {
    if (!isBoardContext) {
      alert("Las transacciones requieren contexto de tablero.");
      return;
    }
    if (txActive) {
      alert("Ya hay una transaccion activa.");
      return;
    }
    await reloadBoardSnapshot();
    setTxActive(true);
    setTxQueue([]);
    alert("[TX] begin transaction - cola iniciada.");
  };

  const rollbackQueuedTransaction = () => {
    if (!txActive) {
      alert("No hay transaccion activa.");
      return;
    }
    const dropped = txQueue.length;
    setTxQueue([]);
    setTxActive(false);
    setCommandQuery("");
    alert(`[TX] rollback transaction - descartadas ${dropped} acciones.`);
  };

  const commitTransaction = async () => {
    if (!txActive) {
      alert("No hay transaccion activa.");
      return;
    }
    if (txQueue.length === 0) {
      setTxActive(false);
      alert("[TX] end transaction - no habia acciones en cola.");
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
      alert(`[TX] end transaction - commit OK (${executed.length} acciones).`);
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
        alert(`[TX] fallo el commit. Se intento rollback con ${rollbackFailures} errores.`);
      } else {
        alert("[TX] fallo el commit. Se revirtieron los cambios aplicados.");
      }
    } finally {
      setIsRunningAction(false);
    }
  };

  const parseContextCommand = (raw: string): PaletteContext | "up" | null => {
    if (raw.startsWith("ctx ")) {
      const target = raw.slice("ctx ".length).trim();
      if (target === "up") return "up";
      if (target === "global" || target === "board" || target === "cards" || target === "lists" || target === "system") {
        return target;
      }
    }

    if (raw.startsWith("context ")) {
      const target = raw.slice("context ".length).trim();
      if (target === "up") return "up";
      if (target === "global" || target === "board" || target === "cards" || target === "lists" || target === "system") {
        return target;
      }
    }

    return null;
  };

  const getBoardCards = () => boardSnapshot?.lists.flatMap((list) => list.cards) ?? [];

  const executeCommandWithArgs = async (raw: string) => {
    const input = raw.trim();
    if (!input) return;

    const lower = normalize(input);
    const boardCards = getBoardCards();

    const contextCmd = parseContextCommand(lower);
    if (contextCmd) {
      if (contextCmd === "up") {
        const parent = contextMeta[currentContext].parent;
        if (!parent) {
          alert("Ya estas en el contexto mas alto.");
          return;
        }
        switchContext(parent);
        return;
      }
      switchContext(contextCmd);
      return;
    }

    if (lower === "begin transaction" || lower === "tx begin") {
      await startTransaction();
      return;
    }

    if (lower === "end transaction" || lower === "commit transaction" || lower === "tx commit") {
      await commitTransaction();
      return;
    }

    if (lower === "rollback transaction" || lower === "tx rollback") {
      rollbackQueuedTransaction();
      return;
    }

    if (lower === "tx status" || lower === "transaction status") {
      alert(txActive ? `[TX] activa - ${txQueue.length} acciones en cola.` : "[TX] no hay transaccion activa.");
      return;
    }

    if (lower === "dashboard" || lower === "go dashboard" || lower === "go home") {
      setOpen(false);
      router.push("/");
      return;
    }

    if (lower === "teams" || lower === "go teams") {
      setOpen(false);
      router.push("/teams");
      return;
    }

    if (lower === "history" || lower === "go history") {
      setOpen(false);
      router.push("/history");
      return;
    }

    if (lower.startsWith("board ") && lower !== "board refresh" && lower !== "board chat" && lower !== "board share") {
      if (!accessToken || !activeTeamId) {
        alert("Necesitas sesion y equipo activo para abrir boards por query.");
        return;
      }

      const selector = input.slice("board ".length).trim();
      if (!selector) {
        alert("Uso: board <idx|nombre>");
        return;
      }

      const board = resolveBySelector(selector, teamBoards, (b) => b.name);
      if (!board) {
        alert("No encontre un board con ese indice/nombre.");
        return;
      }

      setOpen(false);
      router.push(`/b/${board.id}`);
      return;
    }

    if (lower === "settings") {
      setOpen(false);
      alert("Settings triggered");
      return;
    }

    if (lower === "logout") {
      setOpen(false);
      window.location.href = "/login";
      return;
    }

    if (lower === "help") {
      alert(
        "Comandos clave: ctx global|board|cards|lists|system, ctx up, dashboard, teams, history, board <idx|nombre>, begin/end/rollback transaction, list add <nombre>, cards done all, cards active all, cards clear-due, card done <texto>, card active <texto>, due clear <texto>, card <card> from <lista> rename <titulo>, card <card> from <lista> tag add <tag>, card <card> from <lista> tag remove <tag>, card <card> from <lista> assign <miembro>, card <card> from <lista> unassign <miembro>, board refresh/chat/share"
      );
      return;
    }

    if (lower === "board refresh") {
      setOpen(false);
      window.dispatchEvent(new Event("board:refresh"));
      return;
    }

    if (lower === "board chat") {
      setOpen(false);
      window.dispatchEvent(new Event("board:open-chat"));
      return;
    }

    if (lower === "board share") {
      setOpen(false);
      window.dispatchEvent(new Event("board:open-share"));
      return;
    }

    if (!isBoardContext || !accessToken || !boardIdFromPath) {
      alert("Este comando requiere estar dentro de un board.");
      return;
    }

    const cardQuery = parseCardQuery(input);
    if (cardQuery) {
      const list = resolveListFromSelector(cardQuery.listSelector);
      if (!list) {
        alert("No encontre la lista indicada.");
        return;
      }

      const targetCard = resolveBySelector(cardQuery.cardSelector, list.cards, (card) => card.title);
      if (!targetCard) {
        alert("No encontre la card indicada dentro de esa lista.");
        return;
      }

      if (cardQuery.action === "rename") {
        const nextTitle = cardQuery.value.trim();
        if (!nextTitle) {
          alert("Uso: card <card> from <lista> rename <nuevo titulo>");
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
          alert("Uso: card <card> from <lista> tag add <tag>");
          return;
        }

        let tag = resolveTagFromSelector(tagName);
        if (!tag) {
          tag = await createTag({ scopeType: "board", scopeId: boardIdFromPath, name: tagName, tagKind: "custom" }, accessToken);
          setBoardTags((prev) => [...prev, tag as TagView]);
        }

        if (targetCard.tags.some((existing) => existing.id === tag.id)) {
          alert("La card ya tiene ese tag.");
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
          alert("No encontre ese tag en el board.");
          return;
        }

        if (!targetCard.tags.some((existing) => existing.id === tag.id)) {
          alert("La card no tiene ese tag.");
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
        alert("No encontre ese miembro del board.");
        return;
      }

      if (txActive) {
        alert("assign/unassign no soporta rollback seguro todavia. Ejecutalo fuera de transaccion.");
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

    if (lower.startsWith("list add ")) {
      const name = input.slice("list add ".length).trim();
      if (!name) {
        alert("Uso: list add <nombre>");
        return;
      }

      if (txActive) {
        alert("list add no soporta rollback seguro todavia. Ejecutalo fuera de transaccion.");
        return;
      }

      await runBoardAction(`Lista creada: ${name}`, async () => {
        await createList(boardIdFromPath, { name }, accessToken);
      });
      return;
    }

    if (lower === "cards done all") {
      if (txActive) {
        const targets = boardCards.map((card) => ({ id: card.id, prevStatus: card.status || "active" }));
        if (targets.length === 0) {
          alert("No hay cards para actualizar.");
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

    if (lower === "cards active all") {
      if (txActive) {
        const targets = boardCards.map((card) => ({ id: card.id, prevStatus: card.status || "active" }));
        if (targets.length === 0) {
          alert("No hay cards para actualizar.");
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

    if (lower === "cards clear-due") {
      if (txActive) {
        const withDue = boardCards
          .filter((card) => Boolean(card.dueAt))
          .map((card) => ({ id: card.id, prevDueAt: card.dueAt }));
        if (withDue.length === 0) {
          alert("No hay cards con fecha limite.");
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

    if (lower.startsWith("card done ")) {
      const query = normalize(input.slice("card done ".length));
      const target = boardCards.find((card) => normalize(card.title).includes(query));
      if (!target) {
        alert("No encontre una card que coincida.");
        return;
      }

      if (txActive) {
        const prevStatus = target.status || "active";
        enqueueTransactionAction({
          id: `tx-${Date.now()}-card-done-${target.id}`,
          label: `card done ${target.title}`,
          execute: async () => {
            await updateCard(target.id, { status: "done" }, accessToken);
          },
          rollback: async () => {
            await updateCard(target.id, { status: prevStatus }, accessToken);
          },
        });
        return;
      }

      await runBoardAction(`Card marcada done: ${target.title}`, async () => {
        await updateCard(target.id, { status: "done" }, accessToken);
      });
      return;
    }

    if (lower.startsWith("card active ")) {
      const query = normalize(input.slice("card active ".length));
      const target = boardCards.find((card) => normalize(card.title).includes(query));
      if (!target) {
        alert("No encontre una card que coincida.");
        return;
      }

      if (txActive) {
        const prevStatus = target.status || "active";
        enqueueTransactionAction({
          id: `tx-${Date.now()}-card-active-${target.id}`,
          label: `card active ${target.title}`,
          execute: async () => {
            await updateCard(target.id, { status: "active" }, accessToken);
          },
          rollback: async () => {
            await updateCard(target.id, { status: prevStatus }, accessToken);
          },
        });
        return;
      }

      await runBoardAction(`Card marcada active: ${target.title}`, async () => {
        await updateCard(target.id, { status: "active" }, accessToken);
      });
      return;
    }

    if (lower.startsWith("due clear ")) {
      const query = normalize(input.slice("due clear ".length));
      const target = boardCards.find((card) => normalize(card.title).includes(query));
      if (!target) {
        alert("No encontre una card que coincida.");
        return;
      }

      if (txActive) {
        if (!target.dueAt) {
          alert("Esa card no tiene fecha limite para limpiar.");
          return;
        }
        const prevDueAt = target.dueAt;
        enqueueTransactionAction({
          id: `tx-${Date.now()}-due-clear-${target.id}`,
          label: `due clear ${target.title}`,
          execute: async () => {
            await updateCard(target.id, { due_at: null }, accessToken);
          },
          rollback: async () => {
            await updateCard(target.id, { due_at: prevDueAt }, accessToken);
          },
        });
        return;
      }

      await runBoardAction(`Fecha limite limpiada: ${target.title}`, async () => {
        await updateCard(target.id, { due_at: null }, accessToken);
      });
      return;
    }

    alert("Comando no reconocido. Escribe 'help' para ver ejemplos.");
  };

  const autocompleteSuggestions = useMemo(() => {
    const q = commandQuery.trim();
    const lower = normalize(q);
    const boardCards = getBoardCards();
    const listNames = boardSnapshot?.lists.map((l) => l.name) ?? [];
    const contextPool = contextOrder.flatMap((ctx) => contextTemplates[ctx]);
    const localPool = contextTemplates[currentContext];
    const commandPool = Array.from(new Set([...localPool, ...contextPool]));
    const toAvailable = (commands: string[], limit = 10) =>
      commands
        .map((cmd) => (cmd.startsWith("context ") ? cmd.replace(/^context\s+/, "ctx ") : cmd))
        .map(mapCommandSuggestion)
        .filter((suggestion) => suggestion.available)
        .slice(0, limit);

    if (!q) {
      return toAvailable(localPool, 8);
    }

    if (lower.startsWith("ctx ") || lower.startsWith("context ")) {
      const normalizedCtxQuery = lower.replace(/^context\s+/, "ctx ");
      const options = ["up", ...contextOrder];
      const commands = options
        .map((option) => `ctx ${option}`)
        .filter((option) => option.toLowerCase().startsWith(normalizedCtxQuery))
        .slice(0, 8);
      return toAvailable(commands, 8);
    }

    if (lower.startsWith("board ") && !lower.startsWith("board refresh") && !lower.startsWith("board chat") && !lower.startsWith("board share")) {
      const needle = normalize(q.slice("board ".length));
      const boardQueries = teamBoards
        .map((board, idx) => [`board ${idx + 1}`, `board ${board.name}`])
        .flat()
        .filter((candidate) => normalize(candidate).includes(needle));
      return toAvailable(boardQueries, 8);
    }

    if (lower.startsWith("card done ")) {
      const needle = normalize(q.slice("card done ".length));
      const commands = boardCards
        .filter((card) => normalize(card.title).includes(needle))
        .slice(0, 8)
        .map((card) => `card done ${card.title}`);
      return toAvailable(commands, 8);
    }

    if (lower.startsWith("card active ")) {
      const needle = normalize(q.slice("card active ".length));
      const commands = boardCards
        .filter((card) => normalize(card.title).includes(needle))
        .slice(0, 8)
        .map((card) => `card active ${card.title}`);
      return toAvailable(commands, 8);
    }

    if (lower.startsWith("due clear ")) {
      const needle = normalize(q.slice("due clear ".length));
      const commands = boardCards
        .filter((card) => normalize(card.title).includes(needle))
        .slice(0, 8)
        .map((card) => `due clear ${card.title}`);
      return toAvailable(commands, 8);
    }

    if (lower.startsWith("list add ")) {
      const needle = normalize(q.slice("list add ".length));
      const commands = listNames
        .filter((name) => normalize(name).includes(needle))
        .slice(0, 8)
        .map((name) => `list add ${name}`);
      return toAvailable(commands, 8);
    }

    if (lower.startsWith("card ")) {
      const cardQuery = parseCardQuery(q);
      if (!cardQuery) {
        const seeded = (boardSnapshot?.lists ?? []).flatMap((list, listIdx) =>
          list.cards.slice(0, 2).map((card, cardIdx) => [`card ${card.title} from ${list.name} rename `, `card ${cardIdx + 1} from ${listIdx + 1} tag add `])
        );
        return toAvailable(seeded.flat(), 8);
      }

      if (cardQuery.action === "tag_add" || cardQuery.action === "tag_remove") {
        const needle = normalize(cardQuery.value);
        const commands = boardTags
          .filter((tag) => normalize(tag.name).includes(needle))
          .slice(0, 8)
          .map((tag) => `card ${cardQuery.cardSelector} from ${cardQuery.listSelector} ${cardQuery.action === "tag_add" ? "tag add" : "tag remove"} ${tag.name}`);
        return toAvailable(commands, 8);
      }

      if (cardQuery.action === "assign" || cardQuery.action === "unassign") {
        const needle = normalize(cardQuery.value);
        const commands = boardMembers
          .filter((member) => normalize(`${member.displayName || ""} ${member.email}`).includes(needle))
          .slice(0, 8)
          .map((member) =>
            `card ${cardQuery.cardSelector} from ${cardQuery.listSelector} ${cardQuery.action === "assign" ? "assign" : "unassign"} ${
              member.displayName || member.email
            }`
          );
        return toAvailable(commands, 8);
      }
    }

    const generic = commandPool
      .filter((cmd) => {
        const value = cmd.toLowerCase();
        return value.startsWith(lower) || value.includes(lower);
      })
      .slice(0, 20);

    return toAvailable(generic, 10);
  }, [activeTeamId, boardMembers, boardSnapshot, boardTags, commandQuery, currentContext, isBoardContext, teamBoards, accessToken]);

  const firstAutocomplete =
    autocompleteSuggestions.find((s) => s.command.toLowerCase() !== commandQuery.trim().toLowerCase() && s.available) || null;

  const applyAutocomplete = () => {
    if (!firstAutocomplete) return;
    setCommandQuery(firstAutocomplete.command);
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
                placeholder={contextPlaceholder[currentContext]}
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
              {firstAutocomplete ? <span>Tab: {firstAutocomplete.command}</span> : null}
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
                    <Icon className="h-4 w-4 text-muted-foreground" />
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
                  onSelect={() => alert(txActive ? `[TX] activa - ${txQueue.length} acciones en cola.` : "[TX] no hay transaccion activa.")}
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

            {autocompleteSuggestions.length > 0 ? (
              <Command.Group heading="Autocomplete" className="px-2 text-xs font-semibold text-muted-foreground mt-4 mb-1">
                {autocompleteSuggestions.map((suggestion) => (
                  <Command.Item
                    key={`suggest-${suggestion.command}`}
                    value={`${suggestion.command} ${suggestion.description}`}
                    onSelect={() => {
                      if (!suggestion.available) {
                        alert(suggestion.availabilityNote || "Comando no disponible en este contexto.");
                        return;
                      }
                      setCommandQuery(suggestion.command);
                    }}
                    className={`${itemClassName} ${suggestion.available ? "" : "opacity-60"}`}
                  >
                    <suggestion.icon className="h-3.5 w-3.5 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{suggestion.command}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {suggestion.description}
                        {suggestion.available ? " · Pulsa Enter para ejecutar" : ` · ${suggestion.availabilityNote || "No disponible"}`}
                      </div>
                    </div>
                  </Command.Item>
                ))}
              </Command.Group>
            ) : null}

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
                  onSelect={async () => {
                    if (!boardIdFromPath || !accessToken || isRunningAction) return;
                    const name = window.prompt("Nombre de la nueva lista:");
                    if (!name?.trim()) return;
                    await runBoardAction("Lista creada", async () => {
                      await createList(boardIdFromPath, { name: name.trim() }, accessToken);
                    });
                  }}
                  className={itemClassName}
                >
                  <Plus className="h-4 w-4 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">Quick Add List</div>
                    <div className="truncate text-xs text-muted-foreground">Crear una lista sin salir del launcher</div>
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
                    onSelect={async () => {
                      if (!boardIdFromPath || !accessToken || isRunningAction) return;
                      const name = window.prompt("Nombre de la nueva lista:");
                      if (!name?.trim()) return;
                      await runBoardAction("Lista creada", async () => {
                        await createList(boardIdFromPath, { name: name.trim() }, accessToken);
                      });
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
                    alert("Settings triggered");
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
          </Command.List>
        </Command>
      </div>
    </div>
  );
}
