/**
 * Onboarding wizard: short screens, skippable and resumable. Pure logic (steps, answers, suggestion, demo plan).
 * Answers are personalisation hints only: they never block access.
 */
import type { UiMode } from "./ui-mode.ts";

export type OnboardingStatus = "pending" | "skipped" | "completed";

export interface OnboardingAnswers {
  role?: string;
  occupation?: string;
  goals?: string[];
  teamSize?: string;
  firstAction?: string;
  locale?: string;
}

export interface DemoEntity {
  type: "board" | "document" | "template" | "folder";
  id: string;
  boardId?: string;
}

export interface OnboardingState {
  status: OnboardingStatus;
  step: number;
  answers: OnboardingAnswers;
  demo: { teamId: string; createdAt: string; entities: DemoEntity[] } | null;
  tourDone: boolean;
}

export const EMPTY_ONBOARDING: OnboardingState = { status: "pending", step: 0, answers: {}, demo: null, tourDone: false };

/** Option values are stable ids (stored); labels come from i18n `onboarding.options.<question>.<value>`. */
export const QUESTIONS = {
  role: ["founder", "manager", "member", "freelance", "student", "other"],
  occupation: ["software", "design", "marketing", "operations", "education", "health", "other"],
  goals: ["tasks", "projects", "docs", "team", "knowledge", "ai"],
  teamSize: ["solo", "2-5", "6-20", "21+"],
  firstAction: ["board", "document", "invite", "explore"],
} as const;

export type QuestionId = keyof typeof QUESTIONS;
export type StepId = "welcome" | "role" | "occupation" | "goals" | "teamSize" | "firstAction" | "language" | "start";

/** Order of the screens. `welcome` and `start` carry no question. */
export const STEPS: readonly StepId[] = ["welcome", "role", "occupation", "goals", "teamSize", "firstAction", "language", "start"];

export function clampStep(step: number): number {
  if (!Number.isFinite(step)) return 0;
  return Math.min(Math.max(Math.trunc(step), 0), STEPS.length - 1);
}

export function isAnswerAllowed(question: QuestionId, value: string): boolean {
  return (QUESTIONS[question] as readonly string[]).includes(value);
}

/** Returns new answers with the value applied; unknown values are ignored. `goals` toggles (max 3 so the choice stays meaningful). */
export function applyAnswer(answers: OnboardingAnswers, question: QuestionId, value: string): OnboardingAnswers {
  if (!isAnswerAllowed(question, value)) return answers;
  if (question === "goals") {
    const cur = answers.goals ?? [];
    const next = cur.includes(value) ? cur.filter((g) => g !== value) : cur.length >= 3 ? cur : [...cur, value];
    return { ...answers, goals: next };
  }
  return { ...answers, [question]: value };
}

/** Whether the screen has what it needs to enable "Next" (never needed to skip). */
export function isStepAnswered(step: StepId, answers: OnboardingAnswers): boolean {
  switch (step) {
    case "role":
    case "occupation":
    case "teamSize":
    case "firstAction":
      return Boolean(answers[step]);
    case "goals":
      return (answers.goals?.length ?? 0) > 0;
    default:
      return true;
  }
}

/**
 * Suggests the interface mode from the answers. Suggestion only: the person confirms it. Reduced for people whose goals
 * are only tasks/docs/team and who work alone or in a small team; full when they asked for knowledge/AI/projects
 * or work in a larger team. Returns null when there is not enough information.
 */
export function suggestMode(answers: OnboardingAnswers): UiMode | null {
  const goals = answers.goals ?? [];
  if (goals.length === 0 && !answers.teamSize) return null;
  const advancedGoal = goals.some((g) => g === "knowledge" || g === "ai" || g === "projects");
  const large = answers.teamSize === "6-20" || answers.teamSize === "21+";
  if (advancedGoal || large) return "full";
  return "reduced";
}

export function shouldAutoOpen(state: OnboardingState, flaggedNewAccount: boolean): boolean {
  if (state.status !== "pending") return false;
  return flaggedNewAccount || state.step > 0;
}

/** Where "first thing to do" leads once the wizard ends (no demo). */
export function firstActionTarget(answers: OnboardingAnswers): "board" | "document" | "invite" | "home" {
  switch (answers.firstAction) {
    case "board":
      return "board";
    case "document":
      return "document";
    case "invite":
      return "invite";
    default:
      return "home";
  }
}

// ── Demo plan ──────────────────────────────────────────────────────────────────────────────────

export interface DemoPlan {
  boardName: string;
  lists: { name: string; cards: { title: string; summary?: string }[] }[];
  documentTitle: string;
  documentParagraphs: string[];
  template: { name: string; description: string };
}

export const DEMO_MARK = "[Demo]";

export interface DemoCopy {
  board: string;
  lists: { name: string; cards: { title: string; summary?: string }[] }[];
  document: string;
  paragraphs: string[];
  template: { name: string; description: string };
}

/** Builds the plan from translated copy; every name carries the "[Demo]" mark so it is recognisable in lists. */
export function buildDemoPlan(copy: DemoCopy): DemoPlan {
  const mark = (s: string) => (s.startsWith(DEMO_MARK) ? s : `${DEMO_MARK} ${s}`);
  return {
    boardName: mark(copy.board),
    lists: copy.lists.map((l) => ({ name: l.name, cards: l.cards.map((c) => ({ ...c })) })),
    documentTitle: mark(copy.document),
    documentParagraphs: [...copy.paragraphs],
    template: { name: mark(copy.template.name), description: copy.template.description },
  };
}

export function isDemoName(name: string): boolean {
  return name.startsWith(DEMO_MARK);
}

/** Entities that can be deleted at once, in a safe order: templates, then documents, boards, folders. */
export function demoDeleteOrder(entities: readonly DemoEntity[]): DemoEntity[] {
  const rank: Record<DemoEntity["type"], number> = { template: 0, document: 1, board: 2, folder: 3 };
  return [...entities].sort((a, b) => rank[a.type] - rank[b.type]);
}

export function hasDemo(state: OnboardingState, teamId?: string | null): boolean {
  if (!state.demo || state.demo.entities.length === 0) return false;
  return !teamId || state.demo.teamId === teamId;
}
