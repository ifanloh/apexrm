import { useEffect, useMemo, useState } from "react";
import {
  authProfileSchema,
  defaultCheckpoints,
  formatCheckpointLabel,
  type AuthProfile,
  type CheckpointLeaderboard,
  type DuplicateScan,
  type NotificationEvent
} from "@arm/contracts";
import { fetchAuthProfile, fetchLiveSnapshot } from "./api";
import { supabase } from "./supabase";
import "./styles.css";

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

export default function App() {
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [leaderboards, setLeaderboards] = useState<CheckpointLeaderboard[]>([]);
  const [duplicates, setDuplicates] = useState<DuplicateScan[]>([]);
  const [notifications, setNotifications] = useState<NotificationEvent[]>([]);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [selectedCheckpointId, setSelectedCheckpointId] = useState("cp-10");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) {
      setIsAuthenticated(true);
      return;
    }

    void supabase.auth.getSession().then(({ data }) => {
      setIsAuthenticated(Boolean(data.session));
      setAccessToken(data.session?.access_token ?? null);
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(Boolean(session));
      setAccessToken(session?.access_token ?? null);
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
      try {
        const nextProfile = await fetchAuthProfile(token);

        if (!["admin", "panitia", "observer"].includes(nextProfile.role)) {
          throw new Error("Akun ini tidak punya akses dashboard.");
        }

        const snapshot = await fetchLiveSnapshot(token);

        if (!isMounted) {
          return;
        }

        setProfile(authProfileSchema.parse(nextProfile));
        setLeaderboards(snapshot.leaderboards);
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
      }
    }

    void refreshSnapshot();
    const intervalId = window.setInterval(() => void refreshSnapshot(), 15000);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, [accessToken, isAuthenticated]);

  const selectedBoard = useMemo(() => {
    return leaderboards.find((item) => item.checkpointId === selectedCheckpointId) ?? leaderboards[0] ?? null;
  }, [leaderboards, selectedCheckpointId]);

  const totalOfficialScans = useMemo(() => {
    return leaderboards.reduce((sum, item) => sum + item.totalOfficialScans, 0);
  }, [leaderboards]);

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
            Observer Mode
          </div>
          <div className="meta-card">
            <span>{profile?.role ?? "role"}</span>
            <strong>{profile?.crewCode ?? lastUpdatedAt ?? "--:--:--"}</strong>
          </div>
        </div>
      </header>

      <section className="hero-panel">
        <div>
          <p className="section-label">Active Leaderboard</p>
          <h2>Checkpoint ranking yang siap dipantau dari control room, PC, maupun tablet.</h2>
          <p className="section-copy">
            Layout utama ini mengikuti referensi Stitch: fokus ke data operasional, scan resmi, dan event yang layak
            disiarkan.
          </p>
        </div>
        <div className="hero-metrics">
          <article className="metric-card primary">
            <span>Total scan resmi</span>
            <strong>{totalOfficialScans}</strong>
          </article>
          <article className="metric-card">
            <span>Checkpoint aktif</span>
            <strong>{activeCheckpointCount}</strong>
          </article>
          <article className="metric-card">
            <span>Duplikat audit</span>
            <strong>{duplicates.length}</strong>
          </article>
          <article className="metric-card">
            <span>Queue notifikasi</span>
            <strong>{notifications.length}</strong>
          </article>
        </div>
      </section>

      <section className="checkpoint-strip" aria-label="Checkpoint switcher">
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
      </section>

      {fetchError ? <div className="notice-banner error">{fetchError}</div> : null}

      <section className="control-grid">
        <article className="panel leaderboard-panel">
          <div className="panel-head">
            <div>
              <p className="section-label">Leaderboard</p>
              <h3>{selectedCheckpointMeta ? formatCheckpointLabel(selectedCheckpointMeta) : "Checkpoint"}</h3>
            </div>
            <div className="panel-badge">
              <span>Official scans</span>
              <strong>{selectedBoard?.totalOfficialScans ?? 0}</strong>
            </div>
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
                <span>Begitu crew mengirim scan pertama, leaderboard akan muncul di sini.</span>
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
    </main>
  );
}
