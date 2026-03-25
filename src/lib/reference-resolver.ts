import { DocumentSummary, DocumentBrick } from "@/lib/api/documents";
import { BoardSummary } from "@/lib/api/contracts";
import { sheetEngine } from "./sheetEngine";

export interface ResolverContext {
  documents: DocumentSummary[];
  boards: BoardSummary[];
  activeBricks?: DocumentBrick[]; // Bricks of the current document for local resolution
  users?: Array<{ id: string; name: string; avatarUrl?: string | null }>;
}

export class ReferenceResolver {
  /**
   * Resolves @[type:id:extra] into a display value or link data.
   * Format: @[doc:uuid] -> { link: '/d/uuid', label: 'DocTitle' }
   * Format: @[doc:uuid:brickId:A1] -> { value: 'CellContent' }
   */
  static resolve(ref: string, context: ResolverContext): { label: string; href?: string; value?: any } {
    const parts = ref.replace(/^@\[/, '').replace(/\]$/, '').split(':');
    if (parts.length < 2) return { label: ref };

    const [type, id, ...extra] = parts;

    if (type === 'doc') {
      const doc = context.documents.find(d => d.id === id);
      const label = doc ? doc.title : 'Unknown Document';

      if (extra.length >= 2) {
        // Deep reference @[doc:uuid:brickId:property]
        // This would require fetching the doc bricks if not already in context.
        // For now, we only support local brick references or we assume bricks are passed.
        return { label: `[${label} > ${extra[0]} > ${extra[1]}]`, value: '...' };
      }

      return { label, href: `/d/${id}` };
    }

    if (type === 'board') {
      const board = context.boards.find(b => b.id === id);
      return { label: board ? board.name : 'Unknown Board', href: `/b/${id}` };
    }

    if (type === 'brick' && context.activeBricks) {
      // Local brick reference: @[brick:id:property]
      const brick = context.activeBricks.find(b => b.id === id);
      if (brick && extra[0]) {
        if (brick.kind === 'table') {
          const cell = extra[0]; // e.g., 'A1'
          // Convert A1 to row/col
          const col = cell.charCodeAt(0) - 65;
          const row = parseInt(cell.substring(1)) - 1;
          const val = sheetEngine.getComputedValue(id, row, col);
          return { label: val || cell, value: val };
        }
      }
    }

    if (type === 'user' && context.users) {
      const user = context.users.find(u => u.id === id);
      return { label: user ? user.name : (extra[0] || 'Unknown User') };
    }

    return { label: extra[0] || id };
  }

  /**
   * Resolves text for LOGIC/AI purposes: replaces $[...] and #[...] with actual values.
   */
  static resolveValue(text: string, context: ResolverContext): string {
    let processed = text.replace(/@\[brick:[^\]]+\]/g, (match) => {
      const resolved = this.resolve(match, context);
      return String(resolved.value ?? resolved.label);
    });

    processed = processed.replace(/([$#])\[([^\]]+)\]/g, (match, _prefix, inner) => {
      const parts = inner.split(':');
      if (parts.length < 2) return match;

      const [_scopeId, brickId, selectorType, range, subRange] = parts;

      if (context.activeBricks) {
        const brick = context.activeBricks.find(b => b.id === brickId) as any;
        if (!brick) return match;

        if (!selectorType) return brick.markdown || "";

        if (selectorType === 'line' && range) {
          const lines = (brick.markdown || "").split('\n');
          const [start, end] = range.split('-').map((n: any) => parseInt(n) - 1);
          let result = isNaN(end) ? lines[start] : lines.slice(start, end + 1).join('\n');
          if (subRange && result) {
            const [tStart, tEnd] = subRange.split('-').map((n: any) => parseInt(n));
            result = isNaN(tEnd) ? result.substring(tStart) : result.substring(tStart, tEnd);
          }
          return result || "";
        }

        if (selectorType === 'cell' && range && (brick.kind === 'table' || (brick as any).rows)) {
          const rowIdx = parseInt(subRange || "0");
          const colIdx = range.toUpperCase().charCodeAt(0) - 65;
          const rows = (brick as any).rows || (brick.content as any)?.rows || [];
          const val = rows[rowIdx]?.[colIdx];
          return val !== undefined ? String(val) : "";
        }
      }
      return match;
    });

    return processed;
  }

  /**
   * Processes text for UI DISPLAY: returns an array of strings and React components (pills).
   */
  static renderRich(text: string, _context: ResolverContext): (string | any)[] {
    const parts = text.split(/(@\[(?:doc|board|card|user):[^:]+:[^\]]+\]|[$#]\[[^\]]+\])/g);

    return parts.map((part, i) => {
      const match = part.match(/@\[(doc|board|card|user):([^:]+):([^\]]+)\]/);
      if (match) {
        const [_m, type, id, name] = match;
        return { type: 'mention', mentionType: type, id, name, key: i };
      }

      const deepMatch = part.match(/([$#])\[([^\]]+)\]/);
      if (deepMatch) {
        const [_m, prefix, inner] = deepMatch;
        const parts = inner.split(':');
        const label = parts.length > 2 ? `${parts[2]} ${parts[3] || ''}` : parts[1];
        return { type: 'deep', prefix, inner, label, key: i };
      }

      return part;
    });
  }
}
