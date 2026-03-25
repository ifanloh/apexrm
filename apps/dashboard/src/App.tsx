import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  authProfileSchema,
  defaultCheckpoints,
  formatCheckpointLabel,
  type AuthProfile,
  type CheckpointLeaderboard,
  type DuplicateScan,
  type NotificationEvent,
  type OverallLeaderboard
} from "@arm/contracts";
import { fetchCheckpointLeaderboard, fetchDashboardSnapshot } from "./api";
import { supabase } from "./supabase";
import "./styles.css";

const emptyOverallLeaderboard: OverallLeaderboard = {
  totalRankedRunners: 0,
  topEntries: []
};

function getInitials(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function formatScanTime(value: string) {
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function getApiHost() {
  try {
    return new URL(import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api").host;
  } catch {
    return import.meta.env.VITE_API_BASE_URL ?? "unknown-api";
  }
}

function deriveProfileFromSession(session: Session): AuthProfile {
  const appMetadata = session.user.app_metadata ?? {};
  const userMetadata = session.user.user_metadata ?? {};
  const rawRole = appMetadata.role ?? appMetadata.roles?.[0] ?? "crew";
  const crewCode = appMetadata.crew_code ?? appMetadata.crewCode ?? null;

  return authProfileSchema.parse({
    userId: session.user.id,
    email: session.user.email ?? null,
    role: rawRole,
    crewCode,
    displayName: userMetadata.full_name ?? userMetadata.name ?? session.user.email ?? null
  });
}

function mergeCheckpointBoards(existing: CheckpointLeaderboard[], incoming: CheckpointLeaderboard[]) {
  const existingById = new Map(existing.map((board) => [board.checkpointId, board]));

  return incoming.map((board) => {
    const previous = existingById.get(board.checkpointId);

    return {
      ...board,
      topEntries: board.topEntries.length > 0 ? board.topEntries : previous?.topEntries ?? []
    };
  });
}

export default function App() {
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [overallLeaderboard, setOverallLeaderboard] = useState<OverallLeaderboard>(emptyOverallLeaderboard);
  const [leaderboards, setLeaderboards] = useState<CheckpointLeaderboard[]>([]);
  const [duplicates, setDuplicates] = useState<DuplicateScan[]>([]);
  const [notifications, setNotifications] = useState<NotificationEvent[]>([]);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [selectedCheckpointId, setSelectedCheckpointId] = useState("cp-10");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [liveStatus, setLiveStatus] = useState<"idle" | "live" | "fallback">("idle");
  const [lastLiveEventAt, setLastLiveEventAt] = useState<string | null>(null);
  const hasDashboardAccess = profile ? ["admin", "panitia", "observer"].includes(profile.role) : false;
  const apiHost = getApiHost();

  useEffect(() => {
    if (!supabase) {
      setIsAuthenticated(true);
      setIsBootstrapping(false);
      return;
    }

    void supabase.auth.getSession().then(({ data }) => {
      setIsAuthenticated(Boolean(data.session));
      setAccessToken(data.session?.access_token ?? null);
      setProfile(data.session ? deriveProfileFromSession(data.session) : null);
      setIsBootstrapping(false);
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(Boolean(session));
      setAccessToken(session?.access_token ?? null);
      setProfile(session ? deriveProfileFromSession(session) : null);
      setFetchError(null);
      setIsBootstrapping(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !accessToken) {
      return;
    }

    const token = accessToken;
    let isMounted = true;

    async function refreshSnapshot() {
      if (document.visibilityState === "hidden") {
        return;
      }

      try {
        if (isMounted) {
          setIsRefreshing(true);
        }

        if (!profile || !["admin", "panitia", "observer"].includes(profile.role)) {
          throw new Error("Akun ini tidak punya akses dashboard.");
        }

        const snapshot = await fetchDashboardSnapshot(token);
        const checkpointLeaderboards = snapshot.checkpointLeaderboards ?? snapshot.leaderboards ?? [];

        if (!isMounted) {
          return;
        }

        setOverallLeaderboard(snapshot.overallLeaderboard ?? emptyOverallLeaderboard);
        setLeaderboards((current) => mergeCheckpointBoards(current, checkpointLeaderboards));
        setDuplicates(snapshot.duplicates);
        setNotifications(snapshot.notifications);
        setLastUpdatedAt(
          new Date(snapshot.updatedAt).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit"
          })
        );
        setFetchError(null);
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setFetchError(error instanceof Error ? error.message : "Dashboard tidak bisa mengambil data terbaru dari server.");
      } finally {
        if (isMounted) {
          setIsRefreshing(false);
        }
      }
    }

    void refreshSnapshot();
    const intervalId = window.setInterval(() => void refreshSnapshot(), 30000);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, [accessToken, isAuthenticated, profile]);

  useEffect(() => {
    if (!supabase || !accessToken || !hasDashboardAccess) {
      setLiveStatus("fallback");
      return;
    }

    const supabaseClient = supabase;
    let debounceId: number | null = null;
    void supabaseClient.realtime.setAuth(accessToken);

    const triggerRefresh = () => {
      if (debounceId) {
        window.clearTimeout(debounceId);
      }

      debounceId = window.setTimeout(async () => {
        try {
          const snapshot = await fetchDashboardSnapshot(accessToken);
          const checkpointLeaderboards = snapshot.checkpointLeaderboards ?? snapshot.leaderboards ?? [];

          setOverallLeaderboard(snapshot.overallLeaderboard ?? emptyOverallLeaderboard);
          setLeaderboards((current) => mergeCheckpointBoards(current, checkpointLeaderboards));
          setDuplicates(snapshot.duplicates);
          setNotifications(snapshot.notifications);
          setLastUpdatedAt(
            new Date(snapshot.updatedAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit"
            })
          );
          setFetchError(null);
          setLastLiveEventAt(new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit"
          }));
        } catch (error) {
          setFetchError(error instanceof Error ? error.message : "Realtime refresh gagal.");
        }
      }, 180);
    };

    const channel = supabaseClient
      .channel(`dashboard-live-${profile?.role ?? "observer"}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "scans" }, triggerRefresh)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "audit_logs" }, triggerRefresh)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "top5_notifications" }, triggerRefresh)
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setLiveStatus("live");
          return;
        }

        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          setLiveStatus("fallback");
        }
      });

    return () => {
      if (debounceId) {
        window.clearTimeout(debounceId);
      }

      void supabaseClient.removeChannel(channel);
    };
  }, [accessToken, hasDashboardAccess, profile?.role]);

  useEffect(() => {
    if (!accessToken || !hasDashboardAccess || !selectedCheckpointId) {
      return;
    }

    let isMounted = true;

    void fetchCheckpointLeaderboard(selectedCheckpointId, accessToken)
      .then((board) => {
        if (!isMounted) {
          return;
        }

        setLeaderboards((current) => {
          const next = current.map((item) => (item.checkpointId === board.checkpointId ? board : item));
          return next.some((item) => item.checkpointId === board.checkpointId) ? next : [...current, board];
        });
      })
      .catch(() => {
        // Keep the summary board on screen; detail fetch should never blank the dashboard.
      });

    return () => {
      isMounted = false;
    };
  }, [accessToken, hasDashboardAccess, lastUpdatedAt, selectedCheckpointId]);

  const selectedBoard = useMemo(() => {
    return leaderboards.find((item) => item.checkpointId === selectedCheckpointId) ?? leaderboards[0] ?? null;
  }, [leaderboards, selectedCheckpointId]);

  const overallLeader = overallLeaderboard.topEntries[0] ?? null;

  const totalOfficialScans = useMemo(() => {
    return leaderboards.reduce((sum, item) => sum + item.totalOfficialScans, 0);
  }, [leaderboards]);

  const totalRankedRunners = overallLeaderboard.totalRankedRunners;

  const activeCheckpointCount = useMemo(() => {
    return leaderboards.filter((item) => item.totalOfficialScans > 0).length;
  }, [leaderboards]);

  const lastBroadcast = notifications[0] ?? null;
  const selectedCheckpointMeta = defaultCheckpoints.find((item) => item.id === selectedBoard?.checkpointId) ?? null;

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase) {
      setIsAuthenticated(true);
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password: loginPassword
    });

    if (error) {
      setLoginError(error.message);
      return;
    }

    setLoginError(null);
  }

  if (isBootstrapping) {
    return (
      <main className="dashboard-shell">
        <section className="panel" style={{ margin: "12vh auto 0", maxWidth: 520 }}>
          <div className="empty-state" style={{ minHeight: "auto" }}>
            <strong>Menyiapkan dashboard...</strong>
            <span>Session, role, dan koneksi data sedang dicek supaya dashboard tidak masuk dalam state setengah jadi.</span>
          </div>
        </section>
      </main>
    );
  }

  if (!isAuthenticated) {
    return (
      <main className="dashboard-shell">
        <section className="panel" style={{ margin: "12vh auto 0", maxWidth: 520 }}>
          <div className="panel-head">
            <div>
              <p className="section-label">Admin Login</p>
              <h3>Masuk ke Dashboard</h3>
            </div>
          </div>
          <form className="feed-list" onSubmit={handleLogin}>
            <label>
              Email
              <input value={loginEmail} onChange={(event) => setLoginEmail(event.target.value)} />
            </label>
            <label>
              Password
              <input
                type="password"
                value={loginPassword}
                onChange={(event) => setLoginPassword(event.target.value)}
              />
            </label>
            <button className="checkpoint-chip active" style={{ justifyContent: "center" }} type="submit">
              <span style={{ color: "white" }}>Login</span>
            </button>
            {loginError ? <div className="empty-compact">{loginError}</div> : null}
          </form>
        </section>
      </main>
    );
  }

  if (profile && !hasDashboardAccess) {
    return (
      <main className="dashboard-shell">
        <section className="panel" style={{ margin: "12vh auto 0", maxWidth: 520 }}>
          <div className="panel-head">
            <div>
              <p className="section-label">Unauthorized</p>
              <h3>Akses Dashboard Ditolak</h3>
            </div>
          </div>
          <div className="empty-state" style={{ minHeight: "auto" }}>
            <strong>Akun dengan role `{profile.role}` tidak boleh membuka dashboard.</strong>
            <span>Login memakai akun `admin`, `panitia`, atau `observer` untuk memantau leaderboard live.</span>
          </div>
          <div className="feed-list">
            <button
              className="checkpoint-chip active"
              style={{ justifyContent: "center" }}
              onClick={() => {
                if (supabase) {
                  void supabase.auth.signOut();
                }
              }}
              type="button"
            >
              <span style={{ color: "white" }}>Logout</span>
            </button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="dashboard-shell">
      <header className="topbar">
        <div className="brand-block">
          <span className="brand-kicker">Live Data Feed</span>
          <h1>Race Control</h1>
        </div>
        <div className="topbar-meta">
          <div className="meta-pill">
            <span className="meta-dot" />
            {liveStatus === "live" ? "Live Realtime" : "Polling Fallback"}
          </div>
          <div className="meta-card">
            <span>{profile?.role ?? "role"}</span>
            <strong>{isRefreshing ? "sync..." : profile?.crewCode ?? lastUpdatedAt ?? "--:--:--"}</strong>
          </div>
        </div>
      </header>

      <section className="hero-panel">
        <div>
          <p className="section-label">Overall Race Ranking</p>
          <h2>Leaderboard utama sekarang membaca progres race secara keseluruhan, bukan hanya per checkpoint.</h2>
          <p className="section-copy">
            Pelari diurutkan berdasarkan checkpoint terjauh yang sudah dicapai, lalu waktu scan tercepat pada checkpoint
            terakhir itu. Panel checkpoint tetap ada, tapi sekarang fungsinya sebagai monitor operasional sekunder.
          </p>
        </div>
        <div className="hero-metrics">
          <article className="metric-card primary">
            <span>Overall ranked runners</span>
            <strong>{totalRankedRunners}</strong>
          </article>
          <article className="metric-card">
            <span>Total scan resmi</span>
            <strong>{totalOfficialScans}</strong>
          </article>
          <article className="metric-card">
            <span>Checkpoint aktif</span>
            <strong>{activeCheckpointCount}</strong>
          </article>
          <article className="metric-card">
            <span>Leader saat ini</span>
            <strong>{overallLeader ? `#${overallLeader.bib}` : "--"}</strong>
          </article>
        </div>
      </section>

      {fetchError ? <div className="notice-banner error">{fetchError}</div> : null}

      <section className="control-grid">
        <article className="panel leaderboard-panel">
          <div className="panel-head">
            <div>
              <p className="section-label">Overall Ranking</p>
              <h3>Standings resmi seluruh race</h3>
            </div>
            <div className="panel-badge">
              <span>Ranked runners</span>
              <strong>{overallLeaderboard.totalRankedRunners}</strong>
            </div>
          </div>

          <div className="leaderboard-table" role="table" aria-label="Overall leaderboard">
            <div className="leaderboard-head" role="row">
              <span>Rank</span>
              <span>Pelari</span>
              <span>Progress</span>
              <span>Scan terakhir</span>
              <span>Crew / Device</span>
            </div>

            {overallLeaderboard.topEntries.length ? (
              overallLeaderboard.topEntries.map((entry) => {
                const runnerLabel = `Runner ${entry.bib}`;

                return (
                  <div className="leaderboard-row" key={`${entry.checkpointId}-${entry.bib}`} role="row">
                    <div className="leaderboard-rank">
                      <strong>#{entry.rank}</strong>
                    </div>
                    <div className="runner-cell">
                      <div className="runner-avatar">{getInitials(runnerLabel)}</div>
                      <div>
                        <strong>{runnerLabel}</strong>
                        <span>BIB #{entry.bib}</span>
                      </div>
                    </div>
                    <div className="detail-cell">
                      <span className="detail-label">Progress</span>
                      <strong>{formatCheckpointLabel({ code: entry.checkpointCode, kmMarker: entry.checkpointKmMarker })}</strong>
                      <span>{entry.checkpointName}</span>
                    </div>
                    <div className="detail-cell">
                      <span className="detail-label">Scan terakhir</span>
                      <strong>{formatScanTime(entry.scannedAt)}</strong>
                    </div>
                    <div className="detail-cell">
                      <span className="detail-label">Crew / Device</span>
                      <strong>{entry.crewId}</strong>
                      <span>{entry.deviceId}</span>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="empty-state">
                <strong>Belum ada pelari yang masuk overall ranking.</strong>
                <span>Begitu scan resmi pertama masuk, papan overall akan dihitung otomatis dari progres checkpoint.</span>
              </div>
            )}
          </div>
        </article>

        <aside className="rail">
          <article className="panel rail-panel">
            <div className="panel-head">
              <div>
                <p className="section-label">Broadcast Feed</p>
                <h3>Top 5 Notification</h3>
              </div>
            </div>
            {lastBroadcast ? (
              <div className="broadcast-card">
                <span className="broadcast-tag">Telegram Ready</span>
                <strong>BIB {lastBroadcast.bib} masuk posisi #{lastBroadcast.position}</strong>
                <p>
                  Checkpoint {lastBroadcast.checkpointId} pada {formatScanTime(lastBroadcast.createdAt)}.
                </p>
              </div>
            ) : (
              <div className="empty-compact">Belum ada event Top 5 yang perlu dibroadcast.</div>
            )}
            <ul className="feed-list">
              {notifications.slice(0, 6).map((notification) => (
                <li key={notification.id}>
                  <strong>BIB {notification.bib}</strong>
                  <span>{notification.checkpointId} | posisi #{notification.position}</span>
                  <time>{formatScanTime(notification.createdAt)}</time>
                </li>
              ))}
            </ul>
          </article>

          <article className="panel rail-panel">
            <div className="panel-head">
              <div>
                <p className="section-label">Duplicate Audit</p>
                <h3>Server Validation Log</h3>
              </div>
            </div>
            <ul className="feed-list">
              {duplicates.slice(0, 6).map((duplicate) => (
                <li key={duplicate.clientScanId}>
                  <strong>BIB {duplicate.bib}</strong>
                  <span>{duplicate.checkpointId} | first scan {duplicate.firstAcceptedClientScanId}</span>
                  <time>{formatScanTime(duplicate.serverReceivedAt)}</time>
                </li>
              ))}
            </ul>
            {duplicates.length === 0 ? <div className="empty-compact">Belum ada duplikat yang perlu diaudit.</div> : null}
          </article>
        </aside>
      </section>

      <section className="panel checkpoint-monitor-panel">
        <div className="panel-head">
          <div>
            <p className="section-label">Checkpoint Monitor</p>
            <h3>{selectedCheckpointMeta ? formatCheckpointLabel(selectedCheckpointMeta) : "Pilih checkpoint"}</h3>
          </div>
          <div className="panel-badge">
            <span>Official scans</span>
            <strong>{selectedBoard?.totalOfficialScans ?? 0}</strong>
          </div>
        </div>

        <div className="checkpoint-strip" aria-label="Checkpoint switcher">
          {leaderboards.map((board) => {
            const checkpoint = defaultCheckpoints.find((item) => item.id === board.checkpointId);
            const isActive = board.checkpointId === selectedBoard?.checkpointId;

            return (
              <button
                className={`checkpoint-chip ${isActive ? "active" : ""}`}
                key={board.checkpointId}
                onClick={() => setSelectedCheckpointId(board.checkpointId)}
                type="button"
              >
                <span>{checkpoint ? checkpoint.code : board.checkpointId}</span>
                <strong>{board.totalOfficialScans}</strong>
              </button>
            );
          })}
        </div>

        <div className="leaderboard-table" role="table" aria-label="Selected checkpoint leaderboard">
          <div className="leaderboard-head" role="row">
            <span>Pos</span>
            <span>Pelari</span>
            <span>Scan time</span>
            <span>Crew</span>
            <span>Device</span>
          </div>

          {selectedBoard?.topEntries.length ? (
            selectedBoard.topEntries.map((entry) => {
              const runnerLabel = `Runner ${entry.bib}`;

              return (
                <div className="leaderboard-row" key={`${entry.checkpointId}-${entry.bib}`} role="row">
                  <div className="leaderboard-rank">
                    <strong>#{entry.position}</strong>
                  </div>
                  <div className="runner-cell">
                    <div className="runner-avatar">{getInitials(runnerLabel)}</div>
                    <div>
                      <strong>{runnerLabel}</strong>
                      <span>BIB #{entry.bib}</span>
                    </div>
                  </div>
                  <div className="detail-cell">
                    <span className="detail-label">Scan time</span>
                    <strong>{formatScanTime(entry.scannedAt)}</strong>
                  </div>
                  <div className="detail-cell">
                    <span className="detail-label">Crew</span>
                    <strong>{entry.crewId}</strong>
                  </div>
                  <div className="detail-cell">
                    <span className="detail-label">Device</span>
                    <strong>{entry.deviceId}</strong>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="empty-state">
              <strong>Belum ada scan resmi di checkpoint ini.</strong>
              <span>Panel ini tetap dipakai untuk audit per titik CP, tapi bukan leaderboard utama lagi.</span>
            </div>
          )}
        </div>
      </section>

      <section className="checkpoint-grid">
        {leaderboards.map((board) => {
          const checkpoint = defaultCheckpoints.find((item) => item.id === board.checkpointId);
          const leadEntry = board.topEntries[0];

          return (
            <article className="panel checkpoint-panel" key={board.checkpointId}>
              <div className="panel-head compact">
                <div>
                  <p className="section-label">Checkpoint</p>
                  <h3>{checkpoint ? formatCheckpointLabel(checkpoint) : board.checkpointId}</h3>
                </div>
                <div className={`state-dot ${board.totalOfficialScans > 0 ? "live" : ""}`} />
              </div>

              <div className="checkpoint-body">
                <div className="mini-stat">
                  <span>Official</span>
                  <strong>{board.totalOfficialScans}</strong>
                </div>
                <div className="mini-stat">
                  <span>Leader</span>
                  <strong>{leadEntry ? `#${leadEntry.bib}` : "--"}</strong>
                </div>
              </div>
            </article>
          );
        })}
      </section>

      <footer className="runtime-footer">
        <span>Build {__APP_BUILD__}</span>
        <span>Built {new Date(__APP_BUILT_AT__).toLocaleString()}</span>
        <span>API {apiHost}</span>
        <span>Live {liveStatus}</span>
        {lastLiveEventAt ? <span>Last event {lastLiveEventAt}</span> : null}
      </footer>
    </main>
  );
}
