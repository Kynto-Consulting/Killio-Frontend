"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  AppWindow,
  ArrowRight,
  Building2,
  Camera,
  Check,
  Cloud,
  Download,
  Info,
  KeyRound,
  Minus,
  Plus,
  Server,
  Square,
  Users,
  WifiOff,
  Wrench,
  X,
} from "lucide-react";
import { FaAndroid, FaApple, FaLinux, FaWindows } from "react-icons/fa";
import { useI18n, useTranslations } from "@/components/providers/i18n-provider";
import { Footer, Nav } from "@/components/marketing/killio-landing";
import { isKillioApp } from "@/lib/app-shell";
import {
  APP_PLATFORMS,
  detectSystem,
  type AppPlatform,
  type AppReleaseInfo,
  type VisitorSystem,
} from "@/lib/app-download/release";
import "@/app/download/download.css";

type T = (key: string, params?: Record<string, string | number>) => string;
type DesktopOrAndroid = Exclude<VisitorSystem, "ios">;

const downloadHref = (platform: AppPlatform) => `/download/app?platform=${platform}`;

/** One card per system; the first format is the one most people want. */
const SYSTEMS: { key: DesktopOrAndroid; icon: ReactNode; formats: AppPlatform[]; warn: boolean }[] = [
  { key: "windows", icon: <FaWindows />, formats: ["windows", "windows-msi"], warn: true },
  { key: "macos", icon: <FaApple />, formats: ["macos"], warn: true },
  { key: "linux", icon: <FaLinux />, formats: ["linux-appimage", "linux-deb", "linux-rpm"], warn: false },
  { key: "android", icon: <FaAndroid />, formats: ["android"], warn: true },
];

const FEATURES: { key: string; icon: ReactNode }[] = [
  { key: "servers", icon: <Server className="h-4 w-4" /> },
  { key: "accounts", icon: <Users className="h-4 w-4" /> },
  { key: "window", icon: <AppWindow className="h-4 w-4" /> },
  { key: "screenshots", icon: <Camera className="h-4 w-4" /> },
  { key: "signin", icon: <KeyRound className="h-4 w-4" /> },
  { key: "tools", icon: <Wrench className="h-4 w-4" /> },
  { key: "offline", icon: <WifiOff className="h-4 w-4" /> },
];

/** Accepts only the shape the route promises; anything else counts as "no info". */
function asReleaseInfo(value: unknown): AppReleaseInfo | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (!raw.assets || typeof raw.assets !== "object") return null;
  const flags = raw.assets as Record<string, unknown>;
  const assets = {} as Record<AppPlatform, boolean>;
  for (const platform of APP_PLATFORMS) assets[platform] = flags[platform] === true;
  return {
    version: typeof raw.version === "string" ? raw.version : null,
    publishedAt: typeof raw.publishedAt === "string" ? raw.publishedAt : null,
    assets,
  };
}

function formatDate(iso: string | null, locale: string): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(date);
  } catch {
    return null;
  }
}

/** Small picture of the app: its own title bar and the server picker. */
function AppWindowMock({ t }: { t: T }) {
  return (
    <div className="dl-window" aria-hidden="true">
      <div className="dl-window-bar">
        <span className="dl-window-server"><i />killio.dev</span>
        <div className="dl-window-ctl">
          <span><Minus className="h-3.5 w-3.5" /></span>
          <span><Square className="h-3 w-3" /></span>
          <span><X className="h-3.5 w-3.5" /></span>
        </div>
      </div>
      <div className="dl-window-body">
        <div className="dl-window-title">{t("mock.choose")}</div>
        <div className="dl-server on">
          <div className="dl-server-icon"><Cloud className="h-4 w-4" /></div>
          <div>
            <div className="dl-server-name">killio.dev</div>
            <div className="dl-server-sub">{t("mock.cloud")}</div>
          </div>
          <div className="dl-server-check"><Check className="h-4 w-4" strokeWidth={2.5} /></div>
        </div>
        <div className="dl-server">
          <div className="dl-server-icon"><Building2 className="h-4 w-4" /></div>
          <div>
            <div className="dl-server-name">{t("mock.own")}</div>
            <div className="dl-server-sub">{t("mock.ownAddress")}</div>
          </div>
        </div>
        <div className="dl-window-add"><Plus className="h-3.5 w-3.5" /> {t("mock.add")}</div>
      </div>
    </div>
  );
}

export function AppDownloadPage() {
  const t = useTranslations("download");
  const tLanding = useTranslations("landing");
  const { locale } = useI18n();
  const router = useRouter();

  // All three are decided after mount: the server knows neither the visitor's
  // system nor whether this is Killio App, so the first render is the same for everyone.
  const [inApp, setInApp] = useState(false);
  const [system, setSystem] = useState<VisitorSystem | null>(null);
  // undefined: still asking. null: the route could not tell (page still lists every platform).
  const [info, setInfo] = useState<AppReleaseInfo | null | undefined>(undefined);

  useEffect(() => {
    // No marketing inside Killio App: it is sign-in or the workspace.
    if (isKillioApp()) {
      setInApp(true);
      router.replace("/login");
      return;
    }
    setSystem(detectSystem(navigator.userAgent, navigator.maxTouchPoints));

    let alive = true;
    fetch("/download/app?info=1", { headers: { Accept: "application/json" } })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (alive) setInfo(asReleaseInfo(data)); })
      .catch(() => { if (alive) setInfo(null); });
    return () => { alive = false; };
  }, [router]);

  if (inApp) return null;

  // Unknown availability keeps every link usable; only a release that answered
  // "this file is not there" turns a link off.
  const available = (platform: AppPlatform) => (info ? info.assets[platform] : true);

  const mine = system && system !== "ios" ? SYSTEMS.find((s) => s.key === system) ?? null : null;
  const minePlatform = mine?.formats.find(available) ?? null;
  const date = formatDate(info?.publishedAt ?? null, locale);

  return (
    <div className="kl-root dl-root">
      <Nav t={tLanding} base="/" />

      <section className="dl-hero">
        <div className="glow-lime" />
        <div className="grid-bg" />
        <div className="container">
          <div className="dl-hero-grid">
            <div>
              <div className="hero-badge">
                <span className="hero-badge-dot" />
                {t("hero.badge")}
              </div>
              <h1 className="hero-title">
                {t("hero.titlePrefix")} <span className="accent">{t("hero.titleAccent")}</span>
              </h1>
              <p className="hero-sub">{t("hero.sub")}</p>
              <div className="hero-actions">
                {mine && minePlatform ? (
                  <>
                    <a href={downloadHref(minePlatform)} className="btn-lime-lg" rel="nofollow">
                      <Download className="h-4 w-4" />
                      {t("hero.downloadFor", { system: t(`systems.${mine.key}`) })}
                    </a>
                    <a href="#platforms" className="btn-outline-lg">{t("hero.allPlatforms")}</a>
                  </>
                ) : (
                  <a href="#platforms" className="btn-lime-lg">
                    {t("hero.seeDownloads")} <ArrowRight className="h-4 w-4" />
                  </a>
                )}
              </div>
              {system === "ios" && (
                <div className="dl-hint" role="note">
                  <Info className="h-4 w-4" />
                  <span>{t("hero.ios")}</span>
                </div>
              )}
              {info === null && (
                <div className="dl-hint" role="status">
                  <AlertTriangle className="h-4 w-4" />
                  <span>{t("hero.noInfo")}</span>
                </div>
              )}
              <div className="dl-meta" aria-live="polite">
                {info?.version && <strong>{t("hero.version", { version: info.version })}</strong>}
                {info?.version && date && <span className="dl-sep" />}
                {date && <span>{t("hero.updated", { date })}</span>}
              </div>
            </div>
            <AppWindowMock t={t} />
          </div>
        </div>
      </section>

      <section className="dl-section" id="platforms">
        <div className="container">
          <div className="section-header">
            <span className="eyebrow">{t("platforms.eyebrow")}</span>
            <h2 className="section-title">{t("platforms.title")}</h2>
            <p className="section-sub">{t("platforms.sub")}</p>
          </div>
          <div className="dl-platforms">
            {SYSTEMS.map((sys) => {
              const anyAvailable = sys.formats.some(available);
              return (
                <div className={`dl-card${system === sys.key ? " mine" : ""}`} key={sys.key}>
                  <div className="dl-card-head">
                    <div className="dl-card-icon">{sys.icon}</div>
                    <div className="dl-card-name">{t(`systems.${sys.key}`)}</div>
                    {system === sys.key && <span className="dl-mine">{t("platforms.yourSystem")}</span>}
                  </div>
                  <p className="dl-card-desc">{t(`platforms.${sys.key}.desc`)}</p>
                  <p className={`dl-card-note${sys.warn ? " warn" : ""}`}>
                    {sys.warn ? <AlertTriangle className="h-3.5 w-3.5" /> : <Info className="h-3.5 w-3.5" />}
                    <span>{t(`platforms.${sys.key}.note`)}</span>
                  </p>
                  <div className="dl-formats">
                    {sys.formats.map((platform, index) => {
                      const on = available(platform);
                      return (
                        <a
                          key={platform}
                          href={on ? downloadHref(platform) : undefined}
                          aria-disabled={on ? undefined : true}
                          rel="nofollow"
                          className={`dl-format${index === 0 ? " main" : ""}${on ? "" : " off"}`}
                        >
                          {index === 0 && <Download className="h-3.5 w-3.5" />}
                          {t(`platforms.formats.${platform}`)}
                        </a>
                      );
                    })}
                    {!anyAvailable && <span className="dl-missing">{t("platforms.missing")}</span>}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="dl-notice">
            <AlertTriangle className="h-4 w-4" />
            <div>
              <div className="dl-notice-title">{t("signing.title")}</div>
              <div className="dl-notice-body">{t("signing.body")}</div>
            </div>
          </div>
        </div>
      </section>

      <section className="dl-section">
        <div className="container">
          <div className="section-header">
            <span className="eyebrow">{t("features.eyebrow")}</span>
            <h2 className="section-title">{t("features.title")}</h2>
          </div>
          <div className="dl-features">
            {FEATURES.map((feature) => (
              <div className="dl-feature" key={feature.key}>
                <div className="dl-feature-icon">{feature.icon}</div>
                <div>
                  <div className="dl-feature-title">{t(`features.${feature.key}.title`)}</div>
                  <div className="dl-feature-desc">{t(`features.${feature.key}.desc`)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="dl-section dl-end">
        <div className="container">
          <div className="dl-connect">
            <div>
              <span className="eyebrow">{t("connect.eyebrow")}</span>
              <h2 className="section-title">{t("connect.title")}</h2>
              <p className="dl-connect-body">{t("connect.body")}</p>
            </div>
            <div className="dl-connect-options">
              <div className="dl-server">
                <div className="dl-server-icon"><Cloud className="h-4 w-4" /></div>
                <div>
                  <div className="dl-server-name">{t("connect.cloudTitle")}</div>
                  <div className="dl-server-sub">{t("connect.cloudDesc")}</div>
                </div>
              </div>
              <div className="dl-server">
                <div className="dl-server-icon"><Building2 className="h-4 w-4" /></div>
                <div>
                  <div className="dl-server-name">{t("connect.ownTitle")}</div>
                  <div className="dl-server-sub">{t("connect.ownDesc")}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Footer t={tLanding} />
    </div>
  );
}
