"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { GitBranch, Loader2, Plus, Search } from "lucide-react";

import { useSession } from "@/components/providers/session-provider";
import { ApiError, BoardSummary, createBoard, listTeamBoards } from "@/lib/api/contracts";
import { toast } from "@/lib/toast";

function slugifyMeshName(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || `mesh-${Date.now()}`
  );
}

export default function MeshBoardsPage() {
  const router = useRouter();
  const { accessToken, activeTeamId } = useSession();

  const [meshes, setMeshes] = useState<BoardSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    if (!accessToken || !activeTeamId) return;

    setIsLoading(true);
    listTeamBoards(activeTeamId, accessToken)
      .then((boards) => {
        setMeshes(boards.filter((board) => board.boardType === "mesh"));
      })
      .catch((error) => {
        console.error(error);
        toast("No se pudieron cargar las mesh boards.", "error");
      })
      .finally(() => setIsLoading(false));
  }, [accessToken, activeTeamId]);

  const filteredMeshes = useMemo(
    () => meshes.filter((mesh) => mesh.name.toLowerCase().includes(search.toLowerCase())),
    [meshes, search],
  );

  const handleCreateMesh = async () => {
    if (!accessToken || !activeTeamId || isCreating) {
      return;
    }

    const inputName = window.prompt("Nombre de la nueva mesh board", "Nueva Mesh Board");
    const meshName = inputName?.trim();

    if (!meshName) {
      return;
    }

    setIsCreating(true);
    try {
      const created = await createBoard(
        {
          name: meshName,
          slug: slugifyMeshName(meshName),
          boardType: "mesh",
        },
        activeTeamId,
        accessToken,
      );

      setMeshes((current) => [created, ...current]);
      toast("Mesh board creada.", "success");
      router.push(`/m/${created.id}`);
    } catch (error) {
      console.error(error);
      const message =
        error instanceof ApiError
          ? error.message
          : "No se pudo crear la mesh board.";
      toast(message, "error");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="container mx-auto max-w-6xl p-6 lg:p-10">
      <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Mesh Boards</h1>
          <p className="text-muted-foreground">Espacio fractal para modelado visual y meta bricks.</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar mesh"
              className="h-9 w-64 rounded-md border border-input bg-card px-3 pl-9 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
            />
          </div>

          <button
            type="button"
            onClick={handleCreateMesh}
            disabled={isCreating}
            className="inline-flex h-9 items-center justify-center rounded-md bg-primary/90 px-4 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary disabled:opacity-60"
          >
            {isCreating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            Nueva mesh
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="mb-4 h-8 w-8 animate-spin" />
          <p>Cargando mesh boards...</p>
        </div>
      ) : filteredMeshes.length > 0 ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filteredMeshes.map((mesh) => (
            <Link
              key={mesh.id}
              href={`/m/${mesh.id}`}
              className="group flex min-h-[160px] flex-col rounded-xl border border-border bg-card shadow-sm transition-all hover:border-accent/40 hover:shadow-md"
            >
              <div className="flex h-20 w-full items-center border-b border-border/50 bg-gradient-to-r from-cyan-500/10 to-indigo-500/10 px-4">
                <GitBranch className="h-8 w-8 text-accent/70" />
              </div>
              <div className="flex flex-1 flex-col p-4">
                <h2 className="truncate text-lg font-semibold transition-colors group-hover:text-accent">{mesh.name}</h2>
                <p className="mt-auto pt-4 text-xs uppercase tracking-wider text-muted-foreground">
                  Updated {new Date(mesh.updatedAt).toLocaleDateString()}
                </p>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border bg-card/30 py-20 text-center">
          <h2 className="text-xl font-semibold">No hay mesh boards</h2>
          <p className="mt-2 text-muted-foreground">Crea la primera mesh para empezar a modelar el canvas infinito.</p>
          <button
            type="button"
            onClick={handleCreateMesh}
            disabled={isCreating}
            className="mt-6 inline-flex h-9 items-center justify-center rounded-md bg-accent/10 px-4 text-sm font-medium text-accent transition-colors hover:bg-accent/20 disabled:opacity-60"
          >
            Crear primera mesh
          </button>
        </div>
      )}
    </div>
  );
}
