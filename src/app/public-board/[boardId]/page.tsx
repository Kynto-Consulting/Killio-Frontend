import Link from "next/link";

type PublicCard = {
  id: string;
  title: string;
  summary?: string | null;
  dueAt?: string | null;
};

type PublicList = {
  id: string;
  name: string;
  cards: PublicCard[];
};

type PublicBoardView = {
  id: string;
  name: string;
  description: string | null;
  visibility: "private" | "team" | "public_link";
  lists: PublicList[];
};

function getApiBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000").replace(/\/$/, "");
}

async function fetchPublicBoard(boardId: string): Promise<PublicBoardView | null> {
  const response = await fetch(`${getApiBaseUrl()}/boards/${boardId}`, {
    method: "GET",
    cache: "no-store",
  });

  if (!response.ok) {
    return null;
  }

  return response.json();
}

export default async function PublicBoardPage({ params }: { params: Promise<{ boardId: string }> }) {
  const { boardId } = await params;
  const board = await fetchPublicBoard(boardId);

  if (!board || board.visibility !== "public_link") {
    return (
      <main className="min-h-screen bg-background text-foreground p-6 md:p-10">
        <div className="mx-auto max-w-3xl rounded-2xl border border-border bg-card p-6">
          <h1 className="text-2xl font-semibold">Board no disponible</h1>
          <p className="mt-2 text-muted-foreground">Este board no es público o el enlace no es válido.</p>
          <Link href="/login" className="inline-flex mt-5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
            Iniciar sesión
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background text-foreground p-6 md:p-10">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6">
          <h1 className="text-3xl font-bold tracking-tight">{board.name}</h1>
          {board.description ? <p className="mt-2 text-muted-foreground">{board.description}</p> : null}
        </header>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {board.lists.map((list) => (
            <article key={list.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between border-b border-border/70 pb-3">
                <h2 className="font-semibold">{list.name}</h2>
                <span className="text-xs text-muted-foreground">{list.cards.length}</span>
              </div>

              <div className="mt-3 space-y-3">
                {list.cards.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sin cards</p>
                ) : (
                  list.cards.map((card) => (
                    <div key={card.id} className="rounded-lg border border-border/70 bg-background p-3">
                      <h3 className="text-sm font-semibold">{card.title}</h3>
                      {card.summary ? <p className="mt-1 text-xs text-muted-foreground">{card.summary}</p> : null}
                    </div>
                  ))
                )}
              </div>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
