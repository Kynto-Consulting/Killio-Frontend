export type ReportDateRange = {
  from?: string;
  to?: string;
};

const DOC_REFERENCE_REGEX = /@\[(?:doc|document):([^\]:]+)(?::[^\]]+)?\]/gi;

export const GENERATE_REPORT_INTENT_REGEX = /(?:\bgenerate\s+report\b|\bgenerar\s+reporte\b|\breporte\s+t[eé]cnico\b)/i;

function parseDateInput(raw?: string, endOfDay = false): number | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const dayMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dayMatch) {
    const [_, y, m, d] = dayMatch;
    const value = `${y}-${m}-${d}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}`;
    const ts = Date.parse(value);
    return Number.isNaN(ts) ? null : ts;
  }

  const ts = Date.parse(trimmed);
  if (Number.isNaN(ts)) return null;

  if (!endOfDay) return ts;
  const date = new Date(ts);
  date.setHours(23, 59, 59, 999);
  return date.getTime();
}

export function parseDateRangeFromPrompt(prompt: string): ReportDateRange {
  if (!prompt) return {};

  const rangeMatch = prompt.match(/(\d{4}-\d{2}-\d{2})\s*(?:to|hasta|a|-)\s*(\d{4}-\d{2}-\d{2})/i);
  if (rangeMatch) {
    return { from: rangeMatch[1], to: rangeMatch[2] };
  }

  const fromMatch = prompt.match(/(?:from|desde)\s*(\d{4}-\d{2}-\d{2})/i);
  const toMatch = prompt.match(/(?:to|hasta)\s*(\d{4}-\d{2}-\d{2})/i);

  return {
    from: fromMatch?.[1],
    to: toMatch?.[1],
  };
}

export function resolveReportDateRange(prompt: string, fallback: ReportDateRange): ReportDateRange {
  const parsed = parseDateRangeFromPrompt(prompt);
  return {
    from: parsed.from || fallback.from,
    to: parsed.to || fallback.to,
  };
}

export function formatDateRangeLabel(range: ReportDateRange): string {
  if (range.from && range.to) return `${range.from} -> ${range.to}`;
  if (range.from) return `Desde ${range.from}`;
  if (range.to) return `Hasta ${range.to}`;
  return "Todo el historial";
}

export function isTimestampInDateRange(timestamp: string, range: ReportDateRange): boolean {
  const value = Date.parse(timestamp);
  if (Number.isNaN(value)) return false;

  const from = parseDateInput(range.from, false);
  const to = parseDateInput(range.to, true);

  if (from !== null && value < from) return false;
  if (to !== null && value > to) return false;
  return true;
}

export function extractDocumentReferenceIds(source: unknown, output: Set<string> = new Set()): Set<string> {
  if (typeof source === "string") {
    let match: RegExpExecArray | null;
    DOC_REFERENCE_REGEX.lastIndex = 0;
    while ((match = DOC_REFERENCE_REGEX.exec(source)) !== null) {
      const id = String(match[1] || "").trim();
      if (id) output.add(id);
    }
    return output;
  }

  if (Array.isArray(source)) {
    source.forEach((value) => extractDocumentReferenceIds(value, output));
    return output;
  }

  if (source && typeof source === "object") {
    Object.values(source as Record<string, unknown>).forEach((value) => {
      extractDocumentReferenceIds(value, output);
    });
  }

  return output;
}

export function toDocumentMentionToken(id: string, title?: string): string {
  if (!title) return `@[doc:${id}]`;
  return `@[doc:${id}:${title}]`;
}
