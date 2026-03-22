import { argParsers, argument, command, dispatchCommand, literal, suggestCommand, type CommandSpec } from "@kyntocg/river";

type FrontRiverContext = {
  boardNames: string[];
  cardNames: string[];
  handlers: {
    dashboard: () => Promise<void> | void;
    teams: () => Promise<void> | void;
    history: () => Promise<void> | void;
    openBoardByName: (name: string) => Promise<void> | void;
    markCardDone: (query: string) => Promise<void> | void;
  };
};

function filterValues(items: string[], partial: string): string[] {
  const needle = partial.trim().toLowerCase();
  if (!needle) {
    return items.slice(0, 12);
  }
  return items.filter((item) => item.toLowerCase().includes(needle)).slice(0, 12);
}

export function createFrontRiverCatalog(): CommandSpec<FrontRiverContext>[] {
  return [
    command({
      id: "global.dashboard",
      description: "Open dashboard",
      segments: [literal("dashboard")],
      execute: async (ctx) => {
        await ctx.handlers.dashboard();
      },
    }),
    command({
      id: "global.teams",
      description: "Open teams",
      segments: [literal("teams")],
      execute: async (ctx) => {
        await ctx.handlers.teams();
      },
    }),
    command({
      id: "global.history",
      description: "Open history",
      segments: [literal("history")],
      execute: async (ctx) => {
        await ctx.handlers.history();
      },
    }),
    command({
      id: "global.board.by-name",
      description: "Open board by name",
      segments: [
        literal("board"),
        argument<FrontRiverContext, string>("board", {
          parse: argParsers.string,
          suggest: (ctx, partial) => filterValues(ctx.boardNames, partial),
        }),
      ],
      execute: async (ctx, args) => {
        await ctx.handlers.openBoardByName(String(args.board ?? ""));
      },
    }),
    command({
      id: "cards.done.query",
      description: "Mark card as done by query",
      segments: [
        literal("card"),
        literal("done"),
        argument<FrontRiverContext, string>("query", {
          parse: argParsers.string,
          suggest: (ctx, partial) => filterValues(ctx.cardNames, partial),
        }),
      ],
      execute: async (ctx, args) => {
        await ctx.handlers.markCardDone(String(args.query ?? ""));
      },
    }),
  ];
}

export async function riverSuggest(input: string, ctx: FrontRiverContext): Promise<string[]> {
  const catalog = createFrontRiverCatalog();
  const result = await suggestCommand(input, catalog, ctx, 12);
  return result.map((item) => item.value);
}

export async function riverDispatch(input: string, ctx: FrontRiverContext): Promise<{ ok: boolean; error?: string }> {
  const catalog = createFrontRiverCatalog();
  const result = await dispatchCommand(input, catalog, ctx);
  return {
    ok: result.ok,
    error: result.error,
  };
}
