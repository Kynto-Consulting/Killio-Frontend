/**
 * Recurring prompts kept on the device ("cron jobs"): at the times a schedule names, a message is
 * sent to the assistant as if the person had typed it. They replace Killio Vault's local scheduler.
 *
 * They live in this browser profile's storage and are checked by the page, so a job only fires while
 * Killio App is open on this device; a time that passes while it is closed is skipped, not replayed.
 * A schedule is the usual five fields "minute hour day month weekday" with `*`, lists, ranges and
 * steps, read in the device's own time zone.
 */

const STORE_KEY = "killio_cron_jobs";
const MAX_JOBS = 30;
const DEFAULT_RUNS = 50;
const MAX_RUNS = 500;

export interface CronJob {
  id: string;
  schedule: string;
  prompt: string;
  label: string;
  maxRuns: number;
  runs: number;
  active: boolean;
  createdAt: number;
  /** When it is next due, epoch ms; null when the schedule never matches again or the job is done. */
  nextRunAt: number | null;
}

type Field = Set<number>;
interface Parsed { minute: Field; hour: Field; day: Field; month: Field; weekday: Field; anyDay: boolean; anyWeekday: boolean }

function parseField(source: string, min: number, max: number): Field | null {
  const out = new Set<number>();
  for (const part of source.split(",")) {
    const match = /^(\*|\d+(?:-\d+)?)(?:\/(\d+))?$/.exec(part.trim());
    if (!match) return null;
    const step = match[2] ? Number(match[2]) : 1;
    if (!(step >= 1)) return null;
    let from = min;
    let to = max;
    if (match[1] !== "*") {
      const [a, b] = match[1].split("-").map(Number);
      from = a;
      // "5/15" means "from 5, every 15"; a plain number is just itself.
      to = b ?? (match[2] ? max : a);
    }
    if (from < min || to > max || from > to) return null;
    for (let value = from; value <= to; value += step) out.add(value);
  }
  return out.size > 0 ? out : null;
}

/** The five fields as sets of allowed values, or null when the text is not a schedule. */
export function parseSchedule(schedule: string): Parsed | null {
  const fields = String(schedule ?? "").trim().split(/\s+/);
  if (fields.length !== 5) return null;
  const minute = parseField(fields[0], 0, 59);
  const hour = parseField(fields[1], 0, 23);
  const day = parseField(fields[2], 1, 31);
  const month = parseField(fields[3], 1, 12);
  // Sunday may be written 0 or 7.
  const weekday = parseField(fields[4], 0, 7);
  if (!minute || !hour || !day || !month || !weekday) return null;
  if (weekday.has(7)) { weekday.add(0); weekday.delete(7); }
  return { minute, hour, day, month, weekday, anyDay: fields[2] === "*", anyWeekday: fields[4] === "*" };
}

function matches(p: Parsed, d: Date): boolean {
  if (!p.minute.has(d.getMinutes()) || !p.hour.has(d.getHours()) || !p.month.has(d.getMonth() + 1)) return false;
  const day = p.day.has(d.getDate());
  const weekday = p.weekday.has(d.getDay());
  // As cron does: when both day fields are restricted, either one is enough.
  if (!p.anyDay && !p.anyWeekday) return day || weekday;
  return day && weekday;
}

/** The first minute after `after` that the schedule names, within a year; null when there is none. */
export function nextRun(schedule: string, after: number): number | null {
  const parsed = parseSchedule(schedule);
  if (!parsed) return null;
  const d = new Date(after);
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() + 1);
  const limit = after + 366 * 24 * 60 * 60 * 1000;
  while (d.getTime() <= limit) {
    if (!parsed.month.has(d.getMonth() + 1)) { d.setMonth(d.getMonth() + 1, 1); d.setHours(0, 0, 0, 0); continue; }
    if (!parsed.hour.has(d.getHours())) { d.setHours(d.getHours() + 1, 0, 0, 0); continue; }
    if (matches(parsed, d)) return d.getTime();
    d.setMinutes(d.getMinutes() + 1);
  }
  return null;
}

function read(): CronJob[] {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) ?? "[]");
    return Array.isArray(saved) ? saved.filter((j) => j && typeof j.id === "string" && typeof j.schedule === "string" && typeof j.prompt === "string") : [];
  } catch {
    return [];
  }
}

function write(jobs: CronJob[]): void {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(jobs)); } catch { /* not kept: the caller is told through the list */ }
}

export function listCronJobs(): CronJob[] {
  return read();
}

/** Saves a job. Throws with the reason when the schedule or the prompt cannot be used. */
export function createCronJob(input: { schedule: string; prompt: string; label?: string; maxRuns?: number }, now = Date.now()): CronJob {
  const schedule = String(input.schedule ?? "").trim().replace(/\s+/g, " ");
  const prompt = String(input.prompt ?? "").trim().slice(0, 2000);
  if (!parseSchedule(schedule)) throw new Error('The schedule must be five fields: "minute hour day month weekday".');
  if (!prompt) throw new Error("The job needs the message to send.");
  const next = nextRun(schedule, now);
  if (next === null) throw new Error("That schedule never comes up within a year.");
  const jobs = read();
  if (jobs.length >= MAX_JOBS) throw new Error(`There are already ${MAX_JOBS} jobs on this device; delete one first.`);
  const wanted = Math.round(Number(input.maxRuns));
  const job: CronJob = {
    id: `cron-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    schedule,
    prompt,
    label: String(input.label ?? "").trim().slice(0, 80),
    maxRuns: wanted >= 1 ? Math.min(wanted, MAX_RUNS) : DEFAULT_RUNS,
    runs: 0,
    active: true,
    createdAt: now,
    nextRunAt: next,
  };
  write([...jobs, job]);
  return job;
}

export function deleteCronJob(id: string): boolean {
  const jobs = read();
  const kept = jobs.filter((job) => job.id !== id);
  if (kept.length === jobs.length) return false;
  write(kept);
  return true;
}

/**
 * The jobs whose time has come, each counted as run and moved to its next time. A job that was due
 * several times while the app was closed is returned once.
 */
export function takeDueCronJobs(now = Date.now()): CronJob[] {
  const jobs = read();
  const due: CronJob[] = [];
  let changed = false;
  for (const job of jobs) {
    if (!job.active || job.nextRunAt === null || job.nextRunAt > now) continue;
    job.runs += 1;
    job.nextRunAt = nextRun(job.schedule, now);
    if (job.runs >= job.maxRuns || job.nextRunAt === null) { job.active = false; job.nextRunAt = null; }
    due.push({ ...job });
    changed = true;
  }
  if (changed) write(jobs);
  return due;
}
