import Link from "next/link";
import { cookies } from "next/headers";
import { normalizeLocale, getI18nText } from "@/i18n";
import { PublicMeshCanvas } from "@/components/ui/public-mesh-canvas";
import type { MeshState } from "@/components/ui/public-mesh-canvas";

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000").replace(/\/$/, "");

type PublicMeshView = {
  meshId: string;
  name?: string;
  schemaVersion?: string;
  revision?: number;
  updatedAt?: string;
  state: MeshState;
};

async function fetchPublicMesh(meshId: string): Promise<PublicMeshView | null> {
  try {
    const res = await fetch(`${API_BASE}/meshes/${meshId}/public`, {
      method: "GET",
      cache: "no-store",
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default async function PublicMeshPage({ params }: { params: Promise<{ meshId: string }> }) {
  const { meshId } = await params;
  const mesh = await fetchPublicMesh(meshId);

  const cookieStore = await cookies();
  const locale = normalizeLocale(cookieStore.get("killio_locale")?.value);
  const t = (key: string) => getI18nText(locale, "boards", key) ?? key;

  if (!mesh) {
    return (
      <main className="min-h-screen bg-background text-foreground p-6 md:p-10">
        <div className="mx-auto max-w-3xl rounded-2xl border border-border bg-card p-6">
          <h1 className="text-2xl font-semibold">{t("publicMeshView.notAvailableTitle")}</h1>
          <p className="mt-2 text-muted-foreground">{t("publicMeshView.notAvailableDescription")}</p>
          <Link href="/login" className="inline-flex mt-5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
            {t("publicMeshView.login")}
          </Link>
        </div>
      </main>
    );
  }

  const displayName = mesh.name || `Mesh ${meshId.slice(0, 8)}`;

  return (
    <main className="flex h-screen flex-col bg-background text-foreground overflow-hidden">
      {/* Sticky header */}
      <header className="sticky top-0 z-50 flex h-12 shrink-0 items-center justify-between border-b border-border bg-card/95 px-4 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">{displayName}</span>
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-primary">{t("publicMeshView.badge")}</span>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/login" className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:border-border/80 hover:text-foreground">
            {t("publicMeshView.login")}
          </Link>
          <Link href="/register" className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90">
            {t("publicMeshView.signup")}
          </Link>
        </div>
      </header>

      {/* Interactive canvas */}
      <PublicMeshCanvas state={mesh.state} meshName={displayName} />
    </main>
  );
}
