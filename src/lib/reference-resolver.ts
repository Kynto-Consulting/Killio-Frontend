import { DocumentSummary, DocumentBrick } from "@/lib/api/documents";
import { BoardSummary } from "@/lib/api/contracts";
import { sheetEngine } from "./sheetEngine";

export interface ResolverContext {
  documents: DocumentSummary[];
  boards: BoardSummary[];
  activeBricks?: DocumentBrick[]; // Bricks of the current document for local resolution
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

    return { label: extra[0] || id };
  }

  /**
   * Scans text for @[] and replaces with resolved values if they are data-references, 
   * or keeps them as-is for the Markdown renderer to handle links.
   */
  static processText(text: string, context: ResolverContext): string {
    return text.replace(/@\[brick:[^\]]+\]/g, (match) => {
       const resolved = this.resolve(match, context);
       return String(resolved.value ?? resolved.label);
    });
  }
}
