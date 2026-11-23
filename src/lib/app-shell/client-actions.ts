/**
 * Device tools the agent can ask Killio App to run ("client actions").
 *
 * The backend pauses the turn with a `client_action` stream event; the app runs the tool and the chat
 * resumes the turn with the result. The app tells the backend which tools it can run by sending
 * `clientActions` with each message, so the model is only ever offered tools that exist here.
 * Outside the app the list is empty and nothing changes.
 *
 * These are the tools Killio Vault ran on Android, redone for every platform the app runs on. Most of
 * them open something (a call, a chat, a map, a search): here that is a link handed to the system, which
 * opens the installed app when there is one and the website otherwise. Which tools a device is offered is
 * decided in device-tools.ts. Tools that need a phone's own hardware or app list (flashlight, alarms,
 * installed apps, contacts, calendar) are not ported yet.
 */
import { uploadFile } from "@/lib/api/uploads";
import { captureScreenshotFile, killioApp } from "./index";
import { deviceToolsFor, searchApps } from "./device-tools.ts";
import { createCronJob, deleteCronJob, listCronJobs, type CronJob } from "./cron.ts";
import { pickFile } from "./pick-file.ts";
import { LINK_TOOLS, text, type Input } from "./link-tools.ts";

export { LINK_TOOLS };

export interface ClientActionOutcome {
  success: boolean;
  output?: Record<string, unknown>;
  error?: string;
}

export type ClientActionConfirmKind = "openLink" | "openApp" | "screenshot" | "clipboardRead" | "runTool" | "alarm" | "timer" | "contacts" | "calendarRead" | "calendarEvent" | "cron";

export interface ClientActionContext {
  accessToken: string;
  teamId: string;
  /** Asks the person before the device does something. Resolve false to decline. */
  /** "runTool" is asked by the local agent (claude-agent.ts) before a tool the server marks as destructive. */
  confirm: (kind: ClientActionConfirmKind, detail: string) => boolean | Promise<boolean>;
  /** Words for what the page itself shows (the file card). English when missing. */
  labels?: { pickFileTitle: string; pickFileChoose: string; cancel: string };
}

/** A job as the assistant sees it. */
function describeJob(job: CronJob): Record<string, unknown> {
  return {
    id: job.id,
    schedule: job.schedule,
    prompt: job.prompt,
    label: job.label,
    active: job.active,
    runs: job.runs,
    maxRuns: job.maxRuns,
    nextRun: job.nextRunAt === null ? null : new Date(job.nextRunAt).toString(),
  };
}

type DeviceApp = { label: string; package: string };
type Bridge = NonNullable<ReturnType<typeof killioApp>>;

/** Installed apps, wherever this device keeps them: a computer's own list, or a phone's through its device tools. */
async function installedApps(bridge: Bridge): Promise<DeviceApp[] | null> {
  if (bridge.listApps) return bridge.listApps();
  if (bridge.device) {
    const answer = await bridge.device("listApps");
    return Array.isArray(answer.apps) ? (answer.apps as DeviceApp[]) : [];
  }
  return null;
}

async function openInstalledApp(bridge: Bridge, app: DeviceApp): Promise<void> {
  if (bridge.openApp) return bridge.openApp(app.package);
  if (bridge.device) {
    await bridge.device("openApp", { packageName: app.package });
    return;
  }
  throw new Error("This device cannot open apps.");
}

const twoDigits = (n: number) => String(n).padStart(2, "0");

let supported: string[] = [];
let primed: Promise<string[]> | null = null;

/** Asks the app once what it can do. Safe to call anywhere; resolves [] outside the app. */
export function primeAppClientActions(): Promise<string[]> {
  if (primed) return primed;
  const bridge = killioApp();
  if (!bridge) return Promise.resolve([]);
  primed = bridge
    .info()
    .then((info) => {
      // Only what this kind of device can really do (see device-tools.ts).
      supported = deviceToolsFor(info.platform, info.features);
      return supported;
    })
    .catch(() => {
      primed = null; // let a later call try again
      return [];
    });
  return primed;
}

/** The tools this app can run, as known so far (empty until `primeAppClientActions` resolves). */
export function appClientActions(): string[] {
  return supported;
}

function currentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("Location is not available on this device."));
    navigator.geolocation.getCurrentPosition(resolve, (error) => reject(new Error(error.message || "Location was not shared.")), { timeout: 15_000, maximumAge: 60_000 });
  });
}

export async function runAppClientAction(tool: string, input: Input, ctx: ClientActionContext): Promise<ClientActionOutcome> {
  const bridge = killioApp();
  if (!bridge) return { success: false, error: "This tool needs Killio App." };
  try {
    const toLink = LINK_TOOLS[tool];
    if (toLink) {
      const url = toLink(input);
      if (!url) return { success: false, error: "The tool was called without what it needs to open." };
      if (!(await ctx.confirm("openLink", url))) return { success: false, error: "The user declined." };
      await bridge.openExternal(url);
      // Say what really happened: a link was opened, not "the call was made" or "the message was sent".
      return { success: true, output: { opened: url, note: "The link was handed to the system. The user finishes the action there." } };
    }
    switch (tool) {
      case "vault_upload_screenshot": {
        if (!(await ctx.confirm("screenshot", text(input.reason)))) return { success: false, error: "The user declined to share their screen." };
        const file = await captureScreenshotFile();
        const uploaded = await uploadFile(file, ctx.accessToken, { ownerScopeType: "team", ownerScopeId: ctx.teamId, usage: "agent-screenshot" });
        return { success: true, output: { url: uploaded.url, key: uploaded.key } };
      }
      case "clipboard_read": {
        if (!(await ctx.confirm("clipboardRead", ""))) return { success: false, error: "The user declined to share the clipboard." };
        return { success: true, output: { text: await navigator.clipboard.readText() } };
      }
      case "clipboard_write": {
        await navigator.clipboard.writeText(text(input.text));
        return { success: true, output: { copied: true } };
      }
      case "get_location": {
        // The webview asks the person itself before sharing a position.
        const position = await currentPosition();
        return { success: true, output: { latitude: position.coords.latitude, longitude: position.coords.longitude, accuracyMeters: position.coords.accuracy } };
      }
      case "device_info": {
        const info = await bridge.info();
        return { success: true, output: { app: "Killio App", version: info.version, platform: info.platform, language: navigator.language, online: navigator.onLine } };
      }
      case "battery_status": {
        const getBattery = (navigator as Navigator & { getBattery?: () => Promise<{ level: number; charging: boolean }> }).getBattery;
        if (!getBattery) return { success: false, error: "Battery status is not available on this device." };
        const battery = await getBattery.call(navigator);
        return { success: true, output: { percent: Math.round(battery.level * 100), charging: battery.charging } };
      }
      case "share_text": {
        const message = text(input.message);
        if (!message) return { success: false, error: "There is nothing to share." };
        if (typeof navigator.share === "function") {
          await navigator.share({ text: message, title: text(input.title) || undefined });
          return { success: true, output: { shared: true } };
        }
        await navigator.clipboard.writeText(message);
        return { success: true, output: { shared: false, copied: true, note: "This device has no share sheet; the text was copied to the clipboard." } };
      }
      case "list_installed_apps": {
        const apps = await installedApps(bridge);
        if (!apps) return { success: false, error: "This device cannot list its apps." };
        return { success: true, output: { count: apps.length, apps } };
      }
      case "search_app": {
        const apps = await installedApps(bridge);
        if (!apps) return { success: false, error: "This device cannot search its apps." };
        const matches = searchApps(apps, text(input.query)).slice(0, 8);
        if (input.open === true && matches[0]) {
          if (!(await ctx.confirm("openApp", matches[0].label))) return { success: false, error: "The user declined." };
          await openInstalledApp(bridge, matches[0]);
          return { success: true, output: { opened: matches[0], matches } };
        }
        return { success: true, output: { count: matches.length, matches } };
      }
      case "open_installed_app": {
        const apps = await installedApps(bridge);
        if (!apps) return { success: false, error: "This device cannot open apps." };
        const pkg = text(input.package);
        const app = apps.find((candidate) => candidate.package === pkg);
        if (!app) return { success: false, error: "That app is not installed. Use search_app to find it." };
        if (!(await ctx.confirm("openApp", app.label))) return { success: false, error: "The user declined." };
        await openInstalledApp(bridge, app);
        return { success: true, output: { opened: app } };
      }
      case "set_alarm": {
        if (!bridge.device) return { success: false, error: "This device cannot set alarms." };
        const hour = Number(input.hour);
        const minute = Number(input.minute);
        if (!Number.isInteger(hour) || hour < 0 || hour > 23 || !Number.isInteger(minute) || minute < 0 || minute > 59) return { success: false, error: "The time is not valid." };
        if (!(await ctx.confirm("alarm", `${twoDigits(hour)}:${twoDigits(minute)}`))) return { success: false, error: "The user declined." };
        return { success: true, output: await bridge.device("setAlarm", { hour, minute, label: text(input.label) || undefined }) };
      }
      case "set_timer": {
        if (!bridge.device) return { success: false, error: "This device cannot start timers." };
        const seconds = Math.round(Number(input.seconds));
        if (!(seconds >= 1 && seconds <= 86_400)) return { success: false, error: "The timer must be between 1 second and 24 hours." };
        const minutes = Math.floor(seconds / 60);
        if (!(await ctx.confirm("timer", `${minutes}:${twoDigits(seconds % 60)}`))) return { success: false, error: "The user declined." };
        return { success: true, output: await bridge.device("setTimer", { seconds, label: text(input.label) || undefined }) };
      }
      case "pick_file": {
        // The card's own button is both the click a file dialog needs and the person's consent.
        const picked = await pickFile(text(input.type), {
          title: ctx.labels?.pickFileTitle ?? "The assistant asks you for a file.",
          choose: ctx.labels?.pickFileChoose ?? "Choose file",
          cancel: ctx.labels?.cancel ?? "Cancel",
        });
        if (!picked) return { success: false, error: "The user did not choose a file." };
        return { success: true, output: { ...picked } };
      }
      case "cron_create": {
        const schedule = text(input.schedule);
        const prompt = text(input.prompt);
        // It will send messages by itself later: the person sees exactly what and when before it is saved.
        if (!(await ctx.confirm("cron", `${schedule}\n\n${prompt}`))) return { success: false, error: "The user declined." };
        const job = createCronJob({ schedule, prompt, label: text(input.label), maxRuns: Number(input.maxRuns) });
        return { success: true, output: { ...describeJob(job), note: "Saved on this device. It only runs while Killio App is open here; each run starts a new conversation." } };
      }
      case "cron_list":
        return { success: true, output: { jobs: listCronJobs().map(describeJob) } };
      case "cron_delete": {
        const id = text(input.id);
        return deleteCronJob(id) ? { success: true, output: { deleted: id } } : { success: false, error: "There is no job with that id on this device." };
      }
      case "contacts_search": {
        if (!bridge.device) return { success: false, error: "This device cannot search contacts." };
        const query = text(input.query);
        if (query.length < 2) return { success: false, error: "Give at least two letters of the name." };
        // Names and numbers of other people leave the phone: asked every time, with what is searched.
        if (!(await ctx.confirm("contacts", query))) return { success: false, error: "The user declined." };
        return { success: true, output: await bridge.device("contactsSearch", { query }) };
      }
      case "calendar_list_events": {
        if (!bridge.device) return { success: false, error: "This device cannot read the calendar." };
        if (!(await ctx.confirm("calendarRead", ""))) return { success: false, error: "The user declined." };
        const startMs = Number(input.startMs);
        const endMs = Number(input.endMs);
        return { success: true, output: await bridge.device("calendarList", { startMs: Number.isFinite(startMs) ? startMs : 0, endMs: Number.isFinite(endMs) ? endMs : 0 }) };
      }
      case "calendar_create_event": {
        if (!bridge.device) return { success: false, error: "This device cannot create calendar events." };
        const title = text(input.title);
        const start = Number(input.start);
        const end = Number(input.end);
        if (!title || !Number.isFinite(start) || !Number.isFinite(end) || end < start) return { success: false, error: "The event needs a title, a start and an end that is not before the start." };
        if (!(await ctx.confirm("calendarEvent", title))) return { success: false, error: "The user declined." };
        return { success: true, output: await bridge.device("calendarCreate", { title, start, end, location: text(input.location) || undefined, notes: text(input.notes) || undefined }) };
      }
      case "set_brightness": {
        if (!bridge.device) return { success: false, error: "This device cannot change the brightness." };
        // No question first: it only affects this app's screen and the same tool undoes it.
        if (input.restore === true) return { success: true, output: await bridge.device("setBrightness", { restore: true }) };
        const level = Number(input.level);
        if (!(level >= 0 && level <= 1)) return { success: false, error: "The brightness must be between 0 and 1." };
        return { success: true, output: await bridge.device("setBrightness", { level }) };
      }
      case "spotify_pause":
      case "spotify_next":
      case "spotify_previous": {
        if (!bridge.device) return { success: false, error: "This device has no media keys." };
        return { success: true, output: await bridge.device("mediaKey", { key: tool.slice("spotify_".length) }) };
      }
      case "flashlight": {
        if (!bridge.device) return { success: false, error: "This device has no torch." };
        // No question first: it is instant, visible and undone with the same tool.
        return { success: true, output: await bridge.device("flashlight", { on: input.on !== false }) };
      }
      case "vibrate": {
        if (typeof navigator.vibrate !== "function") return { success: false, error: "This device cannot vibrate." };
        const pattern: Record<string, number | number[]> = { light: 20, medium: 60, heavy: 150, success: [40, 60, 40], error: [120, 80, 120] };
        navigator.vibrate(pattern[text(input.pattern)] ?? 60);
        return { success: true, output: { vibrated: true } };
      }
      case "vault_disconnect":
        return { success: true, output: { disconnected: true } };
      default:
        return { success: false, error: `"${tool}" is not available on this device.` };
    }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}
