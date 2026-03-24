import { argument } from "@kyntocg/river";
import type { BoardMemberSummary, BoardSummary, TagView } from "../api/contracts";

export type BoardSnapshot = {
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

export type PaletteParseContext = {
  isBoardContext: boolean;
  hasTeamContext: boolean;
  boardSnapshot?: BoardSnapshot | null;
  boardMembers?: BoardMemberSummary[];
  boardTags?: TagView[];
  teamBoards?: BoardSummary[];
};

type ArgBuilder = ReturnType<typeof argument<PaletteParseContext, string, string>>;

function normalize(value: string) {
  return value.trim().toLowerCase();
}

export const killioArgs = {
  cardQuery: (name: string): ArgBuilder =>
    argument<PaletteParseContext, string, string>(name, {
      parse: (token: string) => token,
      suggest: async (ctx: PaletteParseContext, partial: string) => {
        if (!ctx.boardSnapshot) return [];
        const matches: string[] = [];
        const query = normalize(partial);
        
        for (const list of ctx.boardSnapshot.lists) {
          for (const card of list.cards) {
            const title = normalize(card.title);
            if (!query || title.includes(query) || title.startsWith(query)) {
              matches.push(card.title.includes(" ") ? `"${card.title}"` : card.title);
            }
          }
        }
        return Array.from(new Set(matches));
      },
      greedy: true,
    }),

  listSelector: (name: string): ArgBuilder =>
    argument<PaletteParseContext, string, string>(name, {
      parse: (token: string) => token,
      suggest: async (ctx: PaletteParseContext, partial: string) => {
        if (!ctx.boardSnapshot) return [];
        const matches: string[] = [];
        const query = normalize(partial);

        for (const list of ctx.boardSnapshot.lists) {
          const listName = normalize(list.name);
          if (!query || listName.includes(query) || listName.startsWith(query)) {
            matches.push(list.name.includes(" ") ? `"${list.name}"` : list.name);
          }
        }
        return matches;
      },
    }),

  tagSelector: (name: string): ArgBuilder =>
    argument<PaletteParseContext, string, string>(name, {
      parse: (token: string) => token,
      suggest: async (ctx: PaletteParseContext, partial: string) => {
        if (!ctx.boardTags) return [];
        const matches: string[] = [];
        const query = normalize(partial);

        for (const tag of ctx.boardTags) {
          const tagName = normalize(tag.name);
          if (!query || tagName.includes(query) || tagName.startsWith(query)) {
            matches.push(tag.name.includes(" ") ? `"${tag.name}"` : tag.name);
          }
        }
        return matches;
      },
    }),

  memberSelector: (name: string): ArgBuilder =>
    argument<PaletteParseContext, string, string>(name, {
      parse: (token: string) => token,
      suggest: async (ctx: PaletteParseContext, partial: string) => {
        if (!ctx.boardMembers) return [];
        const matches: string[] = [];
        const query = normalize(partial);

        for (const member of ctx.boardMembers) {
          const displayName = normalize(member.displayName || member.email);
          if (!query || displayName.includes(query) || displayName.startsWith(query)) {
            const rawName = member.displayName || member.email;
            matches.push(rawName.includes(" ") ? `"${rawName}"` : rawName);
          }
        }
        return matches;
      },
    }),

  boardSelector: (name: string): ArgBuilder =>
    argument<PaletteParseContext, string, string>(name, {
      parse: (token: string) => token,
      suggest: async (ctx: PaletteParseContext, partial: string) => {
        if (!ctx.teamBoards) return [];
        const matches: string[] = [];
        const query = normalize(partial);

        for (const board of ctx.teamBoards) {
          const boardName = normalize(board.name); // Usar 'name' según BoardSummary
          if (!query || boardName.includes(query) || boardName.startsWith(query)) {
            const rawName = board.name;
            matches.push(rawName.includes(" ") ? `"${rawName}"` : rawName);
          }
        }
        return matches;
      },
      greedy: true,
    }),
};
