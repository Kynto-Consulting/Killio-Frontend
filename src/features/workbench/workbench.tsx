'use client';

import { FormEvent, useEffect, useState, useTransition } from 'react';

import { BoardShell } from '@/features/boards/board-shell';
import {
  ActivityLogEntry,
  ApiError,
  AuthResponse,
  BoardSummary,
  BoardView,
  BrickMutationInput,
  deleteCardBrick,
  InviteSummary,
  TeamRole,
  TeamView,
  createBoard,
  createCardBrick,
  createInvite,
  createTeam,
  getApiBaseUrl,
  getBackendHealth,
  getBoard,
  listTeamActivity,
  listTeamBoards,
  listTeamInvites,
  listTeams,
  login,
  logout,
  reorderCardBricks,
  refresh,
  register,
  updateCardBrick,
} from '@/lib/api/contracts';

import styles from './workbench.module.css';

type Mode = 'login' | 'register';

type HealthState = {
  kind: 'idle' | 'online' | 'offline';
  message: string;
};

const STORAGE_KEY = 'killio.session.v1';
const CLIENT_ID_STORAGE_KEY = 'killio.client.v1';

export function Workbench() {
  const [mode, setMode] = useState<Mode>('login');
  const [session, setSession] = useState<AuthResponse | null>(null);
  const [teams, setTeams] = useState<TeamView[]>([]);
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [invites, setInvites] = useState<InviteSummary[]>([]);
  const [activity, setActivity] = useState<ActivityLogEntry[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);
  const [board, setBoard] = useState<BoardView | null>(null);
  const [clientId, setClientId] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [boardError, setBoardError] = useState<string | null>(null);
  const [health, setHealth] = useState<HealthState>({
    kind: 'idle',
    message: 'Checking backend connectivity…',
  });
  const [username, setUsername] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [teamName, setTeamName] = useState('');
  const [teamSlug, setTeamSlug] = useState('');
  const [teamDescription, setTeamDescription] = useState('');
  const [boardName, setBoardName] = useState('');
  const [boardSlug, setBoardSlug] = useState('');
  const [boardDescription, setBoardDescription] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<Exclude<TeamRole, 'owner'>>('member');
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const rawSession = window.localStorage.getItem(STORAGE_KEY);

    if (rawSession) {
      try {
        setSession(JSON.parse(rawSession) as AuthResponse);
      } catch {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    }
  }, []);

  useEffect(() => {
    const storedClientId = window.localStorage.getItem(CLIENT_ID_STORAGE_KEY);

    if (storedClientId) {
      setClientId(storedClientId);
      return;
    }

    const nextClientId = crypto.randomUUID();
    window.localStorage.setItem(CLIENT_ID_STORAGE_KEY, nextClientId);
    setClientId(nextClientId);
  }, []);

  useEffect(() => {
    let cancelled = false;

    getBackendHealth()
      .then((result) => {
        if (!cancelled) {
          setHealth({ kind: 'online', message: `${result.service} is ${result.status}` });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHealth({ kind: 'offline', message: `Unable to reach ${getApiBaseUrl()}` });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!session) {
      return;
    }

    startTransition(() => {
      loadTeams().catch((error: unknown) => {
        setWorkspaceError(getErrorMessage(error));
      });
    });
  }, [session]);

  useEffect(() => {
    if (!session || !selectedTeamId) {
      setBoards([]);
      setInvites([]);
      setActivity([]);
      return;
    }

    startTransition(() => {
      loadTeamContext(selectedTeamId).catch((error: unknown) => {
        setWorkspaceError(getErrorMessage(error));
      });
    });
  }, [session, selectedTeamId]);

  useEffect(() => {
    if (!session || !selectedBoardId) {
      setBoard(null);
      return;
    }

    startTransition(() => {
      loadBoard(selectedBoardId).catch((error: unknown) => {
        setBoardError(getErrorMessage(error));
        setBoard(null);
      });
    });
  }, [session, selectedBoardId]);

  function persistSession(nextSession: AuthResponse | null) {
    setSession(nextSession);

    if (nextSession) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextSession));
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }

  async function getActiveSession(): Promise<AuthResponse> {
    if (!session) {
      throw new ApiError('Authenticate first.', 401);
    }

    const expiresAt = new Date(session.session.expiresAt).getTime();
    if (expiresAt > Date.now()) {
      return session;
    }

    const rotatedSession = await refresh(session.refreshToken);
    persistSession(rotatedSession);
    return rotatedSession;
  }

  async function loadTeams() {
    const activeSession = await getActiveSession();
    const result = await listTeams(activeSession.accessToken);
    setTeams(result);

    if (!selectedTeamId && result[0]) {
      setSelectedTeamId(result[0].id);
    }
  }

  async function loadTeamContext(teamId: string) {
    const activeSession = await getActiveSession();
    const [nextBoards, nextInvites, nextActivity] = await Promise.all([
      listTeamBoards(teamId, activeSession.accessToken),
      listTeamInvites(teamId, activeSession.accessToken),
      listTeamActivity(teamId, activeSession.accessToken),
    ]);

    setBoards(nextBoards);
    setInvites(nextInvites);
    setActivity(nextActivity);

    if (!selectedBoardId || !nextBoards.some((item) => item.id === selectedBoardId)) {
      setSelectedBoardId(nextBoards[0]?.id ?? null);
    }
  }

  async function loadBoard(boardId: string) {
    setBoardError(null);
    const activeSession = await getActiveSession();
    const result = await getBoard(boardId, activeSession.accessToken);
    setBoard(result);
  }

  async function refreshActiveWorkspace(accessToken: string) {
    const tasks: Array<Promise<void>> = [];

    if (selectedBoardId) {
      tasks.push(
        getBoard(selectedBoardId, accessToken).then((result) => {
          setBoard(result);
        }),
      );
    }

    if (selectedTeamId) {
      tasks.push(
        listTeamActivity(selectedTeamId, accessToken).then((result) => {
          setActivity(result);
        }),
      );
    }

    await Promise.all(tasks);
  }

  async function handleCreateBrick(cardId: string, payload: BrickMutationInput) {
    const activeSession = await getActiveSession();
    await createCardBrick(cardId, payload, activeSession.accessToken);
    await refreshActiveWorkspace(activeSession.accessToken);
  }

  async function handleUpdateBrick(cardId: string, brickId: string, payload: BrickMutationInput) {
    const activeSession = await getActiveSession();
    await updateCardBrick(cardId, brickId, payload, activeSession.accessToken);
    await refreshActiveWorkspace(activeSession.accessToken);
  }

  async function handleReorderBricks(cardId: string, brickIds: string[]) {
    const activeSession = await getActiveSession();
    const resolvedClientId = clientId || crypto.randomUUID();

    if (!clientId) {
      setClientId(resolvedClientId);
      window.localStorage.setItem(CLIENT_ID_STORAGE_KEY, resolvedClientId);
    }

    await reorderCardBricks(cardId, { clientId: resolvedClientId, brickIds }, activeSession.accessToken);
    await refreshActiveWorkspace(activeSession.accessToken);
  }

  async function handleDeleteBrick(cardId: string, brickId: string) {
    const activeSession = await getActiveSession();
    await deleteCardBrick(cardId, brickId, activeSession.accessToken);
    await refreshActiveWorkspace(activeSession.accessToken);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthError(null);

    startTransition(() => {
      const operation =
        mode === 'register'
          ? register({ username, email, password, displayName })
          : login({ identifier, password });

      operation
        .then((result) => {
          persistSession(result);
          setPassword('');
          setWorkspaceError(null);
        })
        .catch((error: unknown) => {
          setAuthError(getErrorMessage(error));
        });
    });
  }

  function handleCreateTeam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorkspaceError(null);

    startTransition(() => {
      getActiveSession()
        .then((activeSession) =>
          createTeam(
            { name: teamName, slug: teamSlug, description: teamDescription || undefined },
            activeSession.accessToken,
          ),
        )
        .then((createdTeam) => {
          setTeams((currentTeams) => [...currentTeams, createdTeam]);
          setSelectedTeamId(createdTeam.id);
          setTeamName('');
          setTeamSlug('');
          setTeamDescription('');
        })
        .catch((error: unknown) => {
          setWorkspaceError(getErrorMessage(error));
        });
    });
  }

  function handleCreateBoard(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorkspaceError(null);

    if (!selectedTeamId) {
      return;
    }

    startTransition(() => {
      getActiveSession()
        .then((activeSession) =>
          createBoard(
            { name: boardName, slug: boardSlug, description: boardDescription || undefined },
            selectedTeamId,
            activeSession.accessToken,
          ),
        )
        .then((createdBoard) => {
          setBoards((currentBoards) => [...currentBoards, createdBoard]);
          setSelectedBoardId(createdBoard.id);
          setBoardName('');
          setBoardSlug('');
          setBoardDescription('');
        })
        .catch((error: unknown) => {
          setWorkspaceError(getErrorMessage(error));
        });
    });
  }

  function handleInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorkspaceError(null);

    if (!selectedTeamId) {
      return;
    }

    startTransition(() => {
      getActiveSession()
        .then((activeSession) =>
          createInvite({ email: inviteEmail, role: inviteRole }, selectedTeamId, activeSession.accessToken),
        )
        .then((createdInvite) => {
          setInvites((currentInvites) => [createdInvite, ...currentInvites]);
          setInviteEmail('');
          return loadTeamContext(selectedTeamId);
        })
        .catch((error: unknown) => {
          setWorkspaceError(getErrorMessage(error));
        });
    });
  }

  function handleLogout() {
    if (!session) {
      return;
    }

    startTransition(() => {
      logout(session.refreshToken)
        .catch(() => undefined)
        .finally(() => {
          persistSession(null);
          setTeams([]);
          setBoards([]);
          setInvites([]);
          setActivity([]);
          setSelectedTeamId(null);
          setSelectedBoardId(null);
          setBoard(null);
        });
    });
  }

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <div className={styles.kicker}>KILLIO FRONTEND</div>
          <h1 className={styles.title}>Login, teams, boards, invites, and history in one execution shell.</h1>
          <p className={styles.subtitle}>
            The frontend now covers the necessary workspace foundation: username or email login, team creation, board creation, team invites through the backend, and visible activity history.
          </p>
        </div>
        <div className={`${styles.statusPill} ${health.kind === 'online' ? styles.statusOnline : styles.statusOffline}`}>
          {health.message}
        </div>
      </section>

      <section className={styles.grid}>
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <div className={styles.panelEyebrow}>Auth</div>
              <h2 className={styles.panelTitle}>{mode === 'register' ? 'Create account' : 'Sign in'}</h2>
            </div>
            <div className={styles.modeSwitch}>
              <button className={mode === 'login' ? styles.modeButtonActive : styles.modeButton} onClick={() => setMode('login')} type="button">
                Login
              </button>
              <button className={mode === 'register' ? styles.modeButtonActive : styles.modeButton} onClick={() => setMode('register')} type="button">
                Register
              </button>
            </div>
          </div>

          <form className={styles.form} onSubmit={handleSubmit}>
            {mode === 'register' ? (
              <label className={styles.field}>
                <span>Username</span>
                <input value={username} onChange={(event) => setUsername(event.target.value)} required />
              </label>
            ) : null}

            {mode === 'register' ? (
              <label className={styles.field}>
                <span>Display name</span>
                <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} required />
              </label>
            ) : null}

            <label className={styles.field}>
              <span>{mode === 'register' ? 'Email' : 'User or email'}</span>
              <input
                value={mode === 'register' ? email : identifier}
                onChange={(event) => (mode === 'register' ? setEmail(event.target.value) : setIdentifier(event.target.value))}
                required
                type="text"
              />
            </label>

            <label className={styles.field}>
              <span>Password</span>
              <input
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </label>

            {authError ? <div className={styles.errorBox}>{authError}</div> : null}

            <button className={styles.primaryButton} disabled={isPending} type="submit">
              {isPending ? 'Working…' : mode === 'register' ? 'Create account' : 'Sign in'}
            </button>
          </form>

          {session ? (
            <div className={styles.sessionCard}>
              <div className={styles.panelEyebrow}>Session</div>
              <strong>{session.user.displayName}</strong>
              <div className={styles.muted}>@{session.user.username}</div>
              <div className={styles.muted}>{session.user.email}</div>
              <div className={styles.muted}>Session expires {new Date(session.session.expiresAt).toLocaleString()}</div>
              <button className={styles.secondaryButton} onClick={handleLogout} type="button">
                Sign out
              </button>
            </div>
          ) : null}
        </div>

        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <div className={styles.panelEyebrow}>Teams</div>
              <h2 className={styles.panelTitle}>Workspace structure</h2>
            </div>
          </div>

          {workspaceError ? <div className={styles.errorBox}>{workspaceError}</div> : null}

          <div className={styles.workspaceGrid}>
            <div className={styles.stack}>
              <div className={styles.sectionLabel}>Your teams</div>
              <div className={styles.chipList}>
                {teams.map((team) => (
                  <button
                    key={team.id}
                    className={selectedTeamId === team.id ? styles.chipActive : styles.chip}
                    onClick={() => setSelectedTeamId(team.id)}
                    type="button"
                  >
                    {team.name}
                  </button>
                ))}
              </div>
              <form className={styles.form} onSubmit={handleCreateTeam}>
                <label className={styles.field}>
                  <span>Team name</span>
                  <input value={teamName} onChange={(event) => setTeamName(event.target.value)} required />
                </label>
                <label className={styles.field}>
                  <span>Slug</span>
                  <input value={teamSlug} onChange={(event) => setTeamSlug(event.target.value)} required />
                </label>
                <label className={styles.field}>
                  <span>Description</span>
                  <input value={teamDescription} onChange={(event) => setTeamDescription(event.target.value)} />
                </label>
                <button className={styles.primaryButton} disabled={isPending || !session} type="submit">
                  Create team
                </button>
              </form>
            </div>

            <div className={styles.stack}>
              <div className={styles.sectionLabel}>Boards</div>
              <div className={styles.chipList}>
                {boards.map((item) => (
                  <button
                    key={item.id}
                    className={selectedBoardId === item.id ? styles.chipActive : styles.chip}
                    onClick={() => setSelectedBoardId(item.id)}
                    type="button"
                  >
                    {item.name}
                  </button>
                ))}
              </div>
              <form className={styles.form} onSubmit={handleCreateBoard}>
                <label className={styles.field}>
                  <span>Board name</span>
                  <input value={boardName} onChange={(event) => setBoardName(event.target.value)} required />
                </label>
                <label className={styles.field}>
                  <span>Slug</span>
                  <input value={boardSlug} onChange={(event) => setBoardSlug(event.target.value)} required />
                </label>
                <label className={styles.field}>
                  <span>Description</span>
                  <input value={boardDescription} onChange={(event) => setBoardDescription(event.target.value)} />
                </label>
                <button className={styles.primaryButton} disabled={isPending || !selectedTeamId} type="submit">
                  Create board
                </button>
              </form>
            </div>

            <div className={styles.stack}>
              <div className={styles.sectionLabel}>Invite to team</div>
              <form className={styles.form} onSubmit={handleInvite}>
                <label className={styles.field}>
                  <span>Email</span>
                  <input type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} required />
                </label>
                <label className={styles.field}>
                  <span>Role</span>
                  <select value={inviteRole} onChange={(event) => setInviteRole(event.target.value as Exclude<TeamRole, 'owner'>)}>
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                    <option value="guest">Guest</option>
                  </select>
                </label>
                <button className={styles.primaryButton} disabled={isPending || !selectedTeamId} type="submit">
                  Send invite
                </button>
              </form>

              <div className={styles.inviteList}>
                {invites.map((invite) => (
                  <div key={invite.id} className={styles.inlineCard}>
                    <strong>{invite.email}</strong>
                    <div className={styles.muted}>
                      {invite.role} · {invite.status} · {invite.deliveryStatus}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.grid}>
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <div className={styles.panelEyebrow}>History</div>
              <h2 className={styles.panelTitle}>Team and card activity</h2>
            </div>
          </div>

          <div className={styles.activityList}>
            {activity.length === 0 ? (
              <div className={styles.hintBox}>Select a team to inspect its board and invite history.</div>
            ) : (
              activity.map((entry) => (
                <div key={entry.id} className={styles.inlineCard}>
                  <strong>{entry.action}</strong>
                  <div className={styles.muted}>
                    {entry.scope} · {new Date(entry.createdAt).toLocaleString()}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <section className={styles.boardRegion}>
        {board ? (
          <BoardShell
            board={board}
            onCreateBrick={handleCreateBrick}
            onUpdateBrick={handleUpdateBrick}
            onReorderBricks={handleReorderBricks}
            onDeleteBrick={handleDeleteBrick}
          />
        ) : (
          <div className={styles.emptyState}>
            <div className={styles.panelEyebrow}>Board Preview</div>
            <h2 className={styles.emptyTitle}>No board selected yet</h2>
            <p className={styles.subtitle}>Create or select a board from a team to render the live board workspace.</p>
            {boardError ? <div className={styles.errorBox}>{boardError}</div> : null}
          </div>
        )}
      </section>
    </main>
  );
}

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Unexpected frontend error.';
}
