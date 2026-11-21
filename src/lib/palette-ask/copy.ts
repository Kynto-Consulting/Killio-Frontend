/**
 * Copy for "Preguntar a {brand}" in the command palette. Spanish is the primary
 * language; English mirrors the exact same keys (copy.test.ts enforces it).
 * `{brand}` is filled from the tenant (white-label), never hardcoded.
 */

export type AskLocale = "es" | "en";

const es = {
  row: {
    title: "Preguntar a {brand}",
    empty: "Preguntar o pedir algo…",
    suggested: "Sugerido",
    enter: "Enter",
    tab: "Tab",
  },
  panel: {
    dialogLabel: "Preguntar a {brand}",
    title: "{brand}",
    back: "Volver a los comandos (Esc)",
    expand: "Abrir en el chat completo",
    close: "Cerrar",
    you: "Tú",
    answerLabel: "Respuesta",
    sources: "Fuentes",
    openSource: "Abrir {title}",
    followUp: "Escribe una pregunta de seguimiento…",
    firstInput: "Escribe tu pregunta o lo que quieres que haga…",
    send: "Enviar",
    stop: "Detener",
    footer: "Esc vuelve a los comandos · otra Esc cierra",
    noTeam: "Elige un equipo para preguntar.",
    toolDone: "Hecho: {tool}",
  },
  mode: {
    label: "Modo de la conversación",
    ephemeral: "Efímero",
    saved: "Guardar",
    ephemeralHint: "No queda en el historial; se borra al cerrar o a las 24 h.",
    savedHint: "Queda en tu historial.",
    locked: "Tu organización fija este modo.",
    savedNow: "Guardada en tu historial.",
    saveError: "No se pudo guardar la conversación.",
  },
  scope: {
    using: "Usando: {page}",
    remove: "Quitar el alcance de esta página",
    board: "Tablero {name}",
    boardUnnamed: "este tablero",
    document: "este documento",
    mesh: "esta malla",
  },
  status: {
    thinking: "Pensando…",
    searching: "Buscando…",
    querying: "Consultando…",
    running: "Ejecutando {tool}…",
  },
  approval: {
    title: "{brand} quiere hacer este cambio",
    action: "Acción",
    approve: "Aprobar",
    reject: "Rechazar",
    approved: "Aprobado. Aplicando…",
    rejected: "Rechazado. No se escribió nada.",
    notice: "No se escribe nada hasta que lo apruebes.",
  },
  state: {
    noCredits: "Tu equipo no tiene créditos de IA disponibles. Revisa el saldo y el plan del equipo.",
    capReached: "Llegaste a tu tope mensual de IA. Podrás volver a preguntar el próximo ciclo o cuando un administrador lo amplíe.",
    usageNotice: "Has usado el {percent}% de tu límite mensual de IA.",
    rateLimit: "Demasiadas preguntas seguidas. Espera un momento y vuelve a intentarlo.",
    offline: "Sin conexión. Revisa tu red y vuelve a intentarlo.",
    error: "No se pudo obtener la respuesta.",
    retry: "Reintentar",
    empty: "No encontré nada. ¿Quieres que busque en la web?",
    searchWeb: "Buscar en la web",
    webQuery: "Busca en la web: {question}",
  },
} as const;

type Widen<T> = { [K in keyof T]: T[K] extends string ? string : Widen<T[K]> };
export type AskCopy = Widen<typeof es>;

const en: AskCopy = {
  row: {
    title: "Ask {brand}",
    empty: "Ask or request something…",
    suggested: "Suggested",
    enter: "Enter",
    tab: "Tab",
  },
  panel: {
    dialogLabel: "Ask {brand}",
    title: "{brand}",
    back: "Back to commands (Esc)",
    expand: "Open in the full chat",
    close: "Close",
    you: "You",
    answerLabel: "Answer",
    sources: "Sources",
    openSource: "Open {title}",
    followUp: "Write a follow-up question…",
    firstInput: "Type your question or what you want done…",
    send: "Send",
    stop: "Stop",
    footer: "Esc goes back to commands · another Esc closes",
    noTeam: "Pick a team to ask.",
    toolDone: "Done: {tool}",
  },
  mode: {
    label: "Conversation mode",
    ephemeral: "Ephemeral",
    saved: "Save",
    ephemeralHint: "Not kept in your history; deleted on close or after 24 h.",
    savedHint: "Kept in your history.",
    locked: "Your organization sets this mode.",
    savedNow: "Saved to your history.",
    saveError: "Could not save the conversation.",
  },
  scope: {
    using: "Using: {page}",
    remove: "Remove this page's scope",
    board: "Board {name}",
    boardUnnamed: "this board",
    document: "this document",
    mesh: "this mesh",
  },
  status: {
    thinking: "Thinking…",
    searching: "Searching…",
    querying: "Querying…",
    running: "Running {tool}…",
  },
  approval: {
    title: "{brand} wants to make this change",
    action: "Action",
    approve: "Approve",
    reject: "Reject",
    approved: "Approved. Applying…",
    rejected: "Rejected. Nothing was written.",
    notice: "Nothing is written until you approve it.",
  },
  state: {
    noCredits: "Your team has no AI credits left. Check the team balance and plan.",
    capReached: "You reached your monthly AI limit. You can ask again next cycle or when an admin raises it.",
    usageNotice: "You have used {percent}% of your monthly AI limit.",
    rateLimit: "Too many questions in a row. Wait a moment and try again.",
    offline: "You are offline. Check your connection and try again.",
    error: "Could not get an answer.",
    retry: "Retry",
    empty: "I found nothing. Want me to search the web?",
    searchWeb: "Search the web",
    webQuery: "Search the web: {question}",
  },
};

const DICTIONARIES: Record<AskLocale, AskCopy> = { es, en };

export function getAskCopy(locale: string | undefined | null): AskCopy {
  return String(locale ?? "").toLowerCase().startsWith("en") ? DICTIONARIES.en : DICTIONARIES.es;
}

export function fmt(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_m, key: string) => (key in params ? String(params[key]) : `{${key}}`));
}

/** Flattened dotted keys, used by the parity test. */
export function flattenKeys(node: unknown, prefix = ""): string[] {
  if (typeof node === "string") return [prefix];
  if (!node || typeof node !== "object") return [];
  return Object.entries(node as Record<string, unknown>).flatMap(([k, v]) => flattenKeys(v, prefix ? `${prefix}.${k}` : k));
}

export const ASK_DICTIONARIES = DICTIONARIES;
