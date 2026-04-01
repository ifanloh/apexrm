import { useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  authProfileSchema,
  defaultCheckpoints,
  formatCheckpointLabel,
  type AuthProfile,
  type Checkpoint,
  type IngestScanResponse,
  type ScanSubmission
} from "@arm/contracts";
import { fetchCheckpoints, sendScan, syncOffline } from "./api";
import {
  getQueuedScans,
  hasLocalDuplicate,
  markLocalScan,
  queueScan,
  removeQueuedScan,
  type QueuedScan
} from "./db";
import { supabase } from "./supabase";
import "./styles.css";

const DEFAULT_RACE_ID = import.meta.env.VITE_RACE_ID ?? "templiers-demo-2026";
const DEMO_EVENT_LABEL = import.meta.env.VITE_EVENT_LABEL ?? "Grand Trail des Templiers Demo";

type BarcodeDetectorLike = {
  detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>>;
};

declare global {
  interface Window {
    BarcodeDetector?: new (options?: { formats?: string[] }) => BarcodeDetectorLike;
  }
}

function getStoredValue(key: string, fallback: string) {
  return window.localStorage.getItem(key) ?? fallback;
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    day: "2-digit",
    month: "short"
  });
}

function isValidBib(rawValue: string) {
  return /^[A-Za-z0-9-]{2,32}$/.test(rawValue);
}

function normalizeBib(rawValue: string) {
  return rawValue.trim().toUpperCase();
}

function getApiHost() {
  try {
    return new URL(import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api").host;
  } catch {
    return import.meta.env.VITE_API_BASE_URL ?? "unknown-api";
  }
}

type ScannerActivityStatus = "queued" | "accepted" | "duplicate" | "rejected";

type ScannerActivity = {
  id: string;
  bib: string;
  checkpointLabel: string;
  status: ScannerActivityStatus;
  detail: string;
  time: string;
};

function createActivityEntry(
  bib: string,
  checkpointLabel: string,
  status: ScannerActivityStatus,
  detail: string,
  time = new Date().toISOString()
): ScannerActivity {
  return {
    id: `${status}-${bib}-${time}-${Math.random().toString(36).slice(2, 8)}`,
    bib,
    checkpointLabel,
    status,
    detail,
    time
  };
}

function deriveProfileFromSession(session: Session, fallbackCrewCode: string): AuthProfile {
  const appMetadata = session.user.app_metadata ?? {};
  const userMetadata = session.user.user_metadata ?? {};
  const rawRole = appMetadata.role ?? appMetadata.roles?.[0] ?? "crew";
  const crewCode = appMetadata.crew_code ?? appMetadata.crewCode ?? fallbackCrewCode;

  return authProfileSchema.parse({
    userId: session.user.id,
    email: session.user.email ?? null,
    role: rawRole,
    crewCode,
    displayName: userMetadata.full_name ?? userMetadata.name ?? session.user.email ?? fallbackCrewCode
  });
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [crewId, setCrewId] = useState(() => getStoredValue("arm:crewId", "crew-01"));
  const [deviceId, setDeviceId] = useState(() => getStoredValue("arm:deviceId", crypto.randomUUID()));
  const [checkpointId, setCheckpointId] = useState("cp-10");
  const [bib, setBib] = useState("");
  const [isOnline, setIsOnline] = useState(window.navigator.onLine);
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([...defaultCheckpoints]);
  const [queue, setQueue] = useState<QueuedScan[]>([]);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [statusMessage, setStatusMessage] = useState(
    `Scanner siap untuk ${DEMO_EVENT_LABEL}. Gunakan BIB T0001-T0500 atau BIB baru untuk trial.`
  );
  const [lastResponse, setLastResponse] = useState<IngestScanResponse | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [recentActivity, setRecentActivity] = useState<ScannerActivity[]>([]);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanLockRef = useRef<string>("");
  const syncLockRef = useRef(false);

  const selectedCheckpoint = useMemo(
    () => checkpoints.find((checkpoint) => checkpoint.id === checkpointId) ?? null,
    [checkpointId, checkpoints]
  );
  const activeCheckpointLabel = selectedCheckpoint ? formatCheckpointLabel(selectedCheckpoint) : checkpointId;
  const effectiveProfile = useMemo(() => {
    if (profile) {
      return profile;
    }

    if (session) {
      return deriveProfileFromSession(session, crewId);
    }

    return null;
  }, [crewId, profile, session]);
  const lastResultSummary = useMemo(() => {
    if (!lastResponse) {
      return null;
    }

    if (lastResponse.status === "accepted") {
      return {
        title: `BIB ${lastResponse.officialScan.bib} diterima`,
        meta: `Posisi #${lastResponse.officialScan.position} di ${lastResponse.officialScan.checkpointId}`,
        time: formatDateTime(lastResponse.officialScan.serverReceivedAt)
      };
    }

    return {
      title: `BIB ${lastResponse.duplicate.bib} duplikat`,
      meta: `Scan pertama ${lastResponse.duplicate.firstAcceptedClientScanId}`,
      time: formatDateTime(lastResponse.duplicate.serverReceivedAt)
    };
  }, [lastResponse]);
  const canScan = Boolean(
    session?.access_token &&
      effectiveProfile &&
      ["crew", "panitia", "admin"].includes(effectiveProfile.role) &&
      checkpointId &&
      checkpoints.length > 0 &&
      !isBootstrapping
  );
  const apiHost = getApiHost();

  useEffect(() => {
    if (!supabase) {
      setIsBootstrapping(false);
      return;
    }

    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setIsBootstrapping(false);
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setIsBootstrapping(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session?.access_token) {
      setProfile(null);
      return;
    }

    const nextProfile = deriveProfileFromSession(session, crewId);
    setProfile(nextProfile);

    if (!["crew", "panitia", "admin"].includes(nextProfile.role)) {
      setStatusMessage("Akun ini tidak punya izin untuk mode scanner.");
    }
  }, [crewId, session]);

  useEffect(() => {
    window.localStorage.setItem("arm:crewId", crewId);
  }, [crewId]);

  useEffect(() => {
    window.localStorage.setItem("arm:deviceId", deviceId);
  }, [deviceId]);

  useEffect(() => {
    async function bootstrap() {
      const [remoteCheckpoints, pendingScans] = await Promise.all([fetchCheckpoints(), getQueuedScans()]);
      const nextCheckpoints = remoteCheckpoints.length > 0 ? remoteCheckpoints : [...defaultCheckpoints];
      setCheckpoints(nextCheckpoints);
      setQueue(pendingScans);

      if (nextCheckpoints.length > 0) {
        setCheckpointId((currentValue) => {
          if (currentValue && nextCheckpoints.some((checkpoint) => checkpoint.id === currentValue)) {
            return currentValue;
          }

          return nextCheckpoints[1]?.id ?? nextCheckpoints[0].id;
        });
      }
      setIsBootstrapping(false);
    }

    bootstrap().catch(() => {
      setCheckpoints([...defaultCheckpoints]);
      setCheckpointId("cp-10");
      setStatusMessage("Metadata checkpoint dari API gagal dimuat. Scanner memakai checkpoint default.");
      setIsBootstrapping(false);
    });
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      void syncQueue();
    };

    const handleOffline = () => {
      setIsOnline(false);
      setStatusMessage("Koneksi terputus. Scan baru akan masuk antrean lokal.");
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [session]);

  useEffect(() => {
    if (!cameraEnabled || !videoRef.current || !navigator.mediaDevices?.getUserMedia) {
      return;
    }

    let cancelled = false;
    let detectorInterval: number | null = null;

    async function startCamera() {
      streamRef.current = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment"
        },
        audio: false
      });

      if (!videoRef.current || cancelled) {
        return;
      }

      videoRef.current.srcObject = streamRef.current;
      await videoRef.current.play();
      setStatusMessage("Kamera aktif. Arahkan QR ke area target.");

      if (!window.BarcodeDetector) {
        setStatusMessage("Browser ini belum mendukung BarcodeDetector. Pakai input manual untuk sementara.");
        return;
      }

      const detector = new window.BarcodeDetector({
        formats: ["qr_code"]
      });

      detectorInterval = window.setInterval(async () => {
        if (!videoRef.current || scanLockRef.current) {
          return;
        }

        const results = await detector.detect(videoRef.current);
        const rawValue = results[0]?.rawValue?.trim();

        if (rawValue) {
          scanLockRef.current = rawValue;
          await processScan(rawValue);
          window.setTimeout(() => {
            scanLockRef.current = "";
          }, 1500);
        }
      }, 700);
    }

    startCamera().catch(() => {
      setStatusMessage("Izin kamera gagal atau device tidak punya kamera yang bisa dipakai.");
    });

    return () => {
      cancelled = true;

      if (detectorInterval) {
        window.clearInterval(detectorInterval);
      }

      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [cameraEnabled, checkpointId, session]);

  async function refreshQueue() {
    setQueue(await getQueuedScans());
  }

  function addActivityEntry(entry: ScannerActivity) {
    setRecentActivity((current) => [entry, ...current].slice(0, 10));
  }

  function addResultActivities(results: IngestScanResponse[]) {
    const nextEntries = results
      .map((result) => {
        if (result.status === "accepted") {
          return createActivityEntry(
            result.officialScan.bib,
            result.officialScan.checkpointId,
            "accepted",
            `Accepted at position #${result.officialScan.position}`,
            result.officialScan.serverReceivedAt
          );
        }

        return createActivityEntry(
          result.duplicate.bib,
          result.duplicate.checkpointId,
          "duplicate",
          `Duplicate of ${result.duplicate.firstAcceptedClientScanId}`,
          result.duplicate.serverReceivedAt
        );
      })
      .reverse();

    setRecentActivity((current) => [...nextEntries, ...current].slice(0, 10));
  }

  async function syncQueue() {
    if (!session?.access_token || syncLockRef.current) {
      return;
    }

    syncLockRef.current = true;
    setIsSyncing(true);
    const pendingScans = await getQueuedScans();

    if (pendingScans.length === 0) {
      syncLockRef.current = false;
      setIsSyncing(false);
      return;
    }

    setStatusMessage(`Menyinkronkan ${pendingScans.length} scan lokal...`);

    try {
      const result = await syncOffline(pendingScans, session.access_token);

      for (const pendingScan of pendingScans) {
        await removeQueuedScan(pendingScan.clientScanId);
      }

      setStatusMessage(`Sync selesai. ${result.accepted} scan baru, ${result.duplicates} duplikat.`);
      setLastResponse(result.results[result.results.length - 1] ?? null);
      addResultActivities(result.results);
      await refreshQueue();
    } catch {
      setStatusMessage("Sync offline gagal. Queue lokal tetap disimpan.");
      await refreshQueue();
    } finally {
      syncLockRef.current = false;
      setIsSyncing(false);

      if (window.navigator.onLine) {
        const nextPending = await getQueuedScans();

        if (nextPending.length > 0) {
          void syncQueue();
        }
      }
    }
  }

  async function processScan(rawValue: string) {
    if (!canScan || !session?.access_token) {
      setStatusMessage("Login crew diperlukan sebelum scan.");
      return;
    }

    const actorProfile = effectiveProfile;

    if (!actorProfile || !["crew", "panitia", "admin"].includes(actorProfile.role)) {
      setStatusMessage("Akun ini tidak diizinkan melakukan scan.");
      return;
    }

    const normalizedBib = normalizeBib(rawValue);

    if (!checkpointId || !normalizedBib) {
      setStatusMessage("Checkpoint dan payload QR/BIB wajib ada.");
      return;
    }

    if (!isValidBib(normalizedBib)) {
      navigator.vibrate?.(240);
      setStatusMessage("Format QR/BIB tidak valid.");
      addActivityEntry(
        createActivityEntry(normalizedBib || rawValue.trim() || "UNKNOWN", activeCheckpointLabel, "rejected", "Invalid BIB format")
      );
      return;
    }

    if (await hasLocalDuplicate(checkpointId, normalizedBib)) {
      navigator.vibrate?.([100, 80, 100]);
      setStatusMessage(`BIB ${normalizedBib} sudah pernah discan di device ini untuk checkpoint aktif.`);
      addActivityEntry(
        createActivityEntry(normalizedBib, activeCheckpointLabel, "duplicate", "Already scanned on this device")
      );
      return;
    }

    const payload: ScanSubmission = {
      clientScanId: crypto.randomUUID(),
      raceId: DEFAULT_RACE_ID,
      checkpointId,
      bib: normalizedBib,
      crewId: crewId.trim() || "crew-unknown",
      deviceId,
      scannedAt: new Date().toISOString(),
      capturedOffline: !isOnline
    };

    setIsBusy(true);

    try {
      await queueScan(payload);
      await markLocalScan(checkpointId, normalizedBib);
      setBib("");
      await refreshQueue();

      if (!isOnline) {
        navigator.vibrate?.(160);
        setStatusMessage(`BIB ${normalizedBib} disimpan offline. Antrean lokal siap disinkronkan nanti.`);
        addActivityEntry(
          createActivityEntry(normalizedBib, activeCheckpointLabel, "queued", "Saved to offline queue")
        );
        return;
      }

      navigator.vibrate?.(70);
      setStatusMessage(
        `BIB ${normalizedBib} diterima device di ${selectedCheckpoint?.code ?? checkpointId}. Sinkronisasi ke server berjalan di background.`
      );
      addActivityEntry(
        createActivityEntry(normalizedBib, activeCheckpointLabel, "queued", "Queued for immediate sync")
      );
      void syncQueue();
    } catch {
      setStatusMessage(`BIB ${normalizedBib} gagal diproses di device. Coba ulangi sekali lagi.`);
      addActivityEntry(
        createActivityEntry(normalizedBib, activeCheckpointLabel, "rejected", "Device processing failed")
      );
      await refreshQueue();
    } finally {
      setIsBusy(false);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await processScan(bib);
  }

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase) {
      setLoginError("Konfigurasi Supabase frontend belum diisi.");
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

  if (!supabase) {
    return (
      <main className="scanner-shell">
        <section className="scanner-panel">
          <h1>Konfigurasi scanner belum lengkap</h1>
          <p>Isi `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, dan `VITE_API_BASE_URL` untuk menjalankan flow sesuai arsitektur target.</p>
        </section>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="scanner-shell">
        <section className="scanner-panel auth-panel">
          <div className="panel-copy auth-copy">
            <div>
              <p className="scanner-kicker">Crew Login</p>
              <h1>Masuk ke Scanner</h1>
            </div>
          </div>
          <form className="scanner-form" onSubmit={handleLogin}>
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
            <button className="submit-button" type="submit">
              Login
            </button>
            {loginError ? <div className="placeholder-card">{loginError}</div> : null}
          </form>
        </section>
      </main>
    );
  }

  if (effectiveProfile && !["crew", "panitia", "admin"].includes(effectiveProfile.role)) {
    return (
      <main className="scanner-shell">
        <section className="scanner-panel auth-panel">
          <div className="panel-copy auth-copy">
            <div>
              <p className="scanner-kicker">Unauthorized</p>
              <h1>Akses scanner ditolak</h1>
            </div>
          </div>
          <div className="placeholder-card">
            Akun dengan role <strong>{effectiveProfile.role}</strong> tidak boleh melakukan scan lapangan.
          </div>
        </section>
      </main>
    );
  }

  if (isBootstrapping) {
    return (
      <main className="scanner-shell">
        <section className="scanner-panel auth-panel">
          <div className="placeholder-card">
            <strong>Menyiapkan scanner...</strong>
            <div>Checkpoint, session, dan queue lokal sedang disinkronkan supaya scanner tidak masuk state setengah jadi.</div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="scanner-shell">
      <header className="scanner-topbar">
        <div>
          <p className="scanner-kicker">Field Scanner</p>
          <h1>Race Control Scanner</h1>
          <span className="scanner-event-label">{DEMO_EVENT_LABEL}</span>
        </div>
          <div className="scanner-topbar-meta">
            <div className={`scanner-pill ${isOnline ? "online" : "offline"}`}>
              <span className="status-dot" />
              {isOnline ? "Live Connectivity" : "Offline Queue Mode"}
            </div>
            <div className="scanner-pill neutral">
              <span className="status-dot" />
              {selectedCheckpoint ? formatCheckpointLabel(selectedCheckpoint) : "Checkpoint"}
            </div>
          <button className="ghost-button" onClick={() => void syncQueue()} type="button">
            {isSyncing ? "Syncing..." : "Sync Queue"}
          </button>
          <button
            className="ghost-button"
            onClick={() => {
              if (supabase) {
                void supabase.auth.signOut();
              }
            }}
            type="button"
          >
            Logout
          </button>
        </div>
      </header>

      <section className="scanner-stage">
        <article className="camera-panel">
          <div className="panel-copy">
            <p className="scanner-kicker">Active Station</p>
            <h2>{selectedCheckpoint ? formatCheckpointLabel(selectedCheckpoint) : "Pilih checkpoint"}</h2>
          </div>

          <label className="checkpoint-field">
            <span>Pilih Checkpoint</span>
            <select disabled={isBusy || checkpoints.length === 0} value={checkpointId} onChange={(event) => setCheckpointId(event.target.value)}>
              {checkpoints.map((checkpoint) => (
                <option key={checkpoint.id} value={checkpoint.id}>
                  {formatCheckpointLabel(checkpoint)}
                </option>
              ))}
            </select>
          </label>

          <div className="camera-frame">
            <video className="camera-video" muted playsInline ref={videoRef} />
            <div className="scan-target">
              <div className="scan-line" />
            </div>
            <div className="camera-overlay top-left">
              <span>Target</span>
              <strong>{bib.trim() || "SCANNING..."}</strong>
            </div>
            <div className="camera-overlay top-right">
              {cameraEnabled ? "QR engine aktif" : "Kamera belum aktif"}
            </div>
            <div className="camera-overlay bottom-left">{statusMessage}</div>
          </div>

          <div className="quick-actions">
            <button className="primary-button" disabled={!canScan} onClick={() => setCameraEnabled((value) => !value)} type="button">
              {cameraEnabled ? "Matikan Kamera" : "Aktifkan Kamera"}
            </button>
            <div className="tool-group">
              <button disabled={isBusy} onClick={() => setBib("")} type="button">
                Clear
              </button>
                <button disabled={isSyncing} onClick={() => void syncQueue()} type="button">
                  {isSyncing ? "Syncing" : "Sync"}
                </button>
              <button onClick={() => navigator.vibrate?.(120)} type="button">
                Haptic
              </button>
            </div>
          </div>
        </article>

        <aside className="scanner-rail">
          <section className="scanner-panel">
            <div className="panel-copy">
              <p className="scanner-kicker">Station Summary</p>
              <h3>Scanner Assignment</h3>
            </div>
            <div className="rail-head compact">
              <div>
                <span>Scan crew</span>
                <strong>{effectiveProfile?.displayName ?? effectiveProfile?.crewCode ?? crewId}</strong>
              </div>
              <div>
                <span>Device</span>
                <strong>{deviceId.slice(0, 8)}</strong>
              </div>
              <div>
                <span>Checkpoint</span>
                <strong>{selectedCheckpoint ? selectedCheckpoint.code : "None"}</strong>
              </div>
              <div>
                <span>Mode</span>
                <strong>{isOnline ? "Live sync" : "Offline queue"}</strong>
              </div>
            </div>
          </section>

          <section className="scanner-panel total-panel">
            <span>Pending sync</span>
            <strong>{queue.length}</strong>
            <p>Queue lokal akan dikirim ke endpoint `/api/sync-offline` saat koneksi kembali.</p>
          </section>

          <section className="scanner-panel">
            <div className="panel-copy">
              <p className="scanner-kicker">Manual Entry</p>
              <h3>Input BIB Manual</h3>
            </div>
            <form className="scanner-form" onSubmit={handleSubmit}>
              <label>
                <input
                  disabled={!canScan || isBusy}
                  placeholder="contoh: T0001 atau BIB baru"
                  value={bib}
                  onChange={(event) => setBib(normalizeBib(event.target.value))}
                />
              </label>

              <div className="manual-helper">
                Demo event berisi 500 runner seed. BIB <strong>T0001-T0500</strong> sudah tersedia dan scan baru tetap bisa
                ditambahkan untuk trial.
              </div>

              <button className="submit-button" disabled={!canScan || isBusy} type="submit">
                {isBusy ? "Memproses..." : "Submit Scan"}
              </button>
            </form>
          </section>

          <section className="scanner-panel">
            <div className="panel-copy">
              <p className="scanner-kicker">Last Response</p>
              <h3>Scan Result</h3>
            </div>
            {lastResultSummary ? (
              <div className={`result-card ${lastResponse?.status === "accepted" ? "success" : "duplicate"}`}>
                <strong>{lastResultSummary.title}</strong>
                <span>{lastResultSummary.meta}</span>
                <time>{lastResultSummary.time}</time>
              </div>
            ) : (
              <div className="placeholder-card">Belum ada respons server. Hasil scan terbaru akan tampil di sini.</div>
            )}
          </section>
        </aside>
      </section>

      <section className="queue-section">
        <div className="panel-copy">
          <p className="scanner-kicker">Recent Scanner Activity</p>
          <h3>Latest Captures & Sync Results</h3>
        </div>
        <div className="scanner-activity-grid">
          <div className="queue-grid">
            {recentActivity.length ? (
              recentActivity.map((entry) => (
                <article className={`queue-card scanner-activity-card ${entry.status}`} key={entry.id}>
                  <div className="scanner-activity-head">
                    <strong>BIB {entry.bib}</strong>
                    <span className={`scanner-activity-badge ${entry.status}`}>{entry.status}</span>
                  </div>
                  <span>{entry.checkpointLabel}</span>
                  <span>{entry.detail}</span>
                  <time>{formatDateTime(entry.time)}</time>
                </article>
              ))
            ) : (
              <div className="placeholder-card">Belum ada aktivitas scanner. Mulai dari scan manual atau aktifkan kamera.</div>
            )}
          </div>
          <div className="queue-grid">
            {queue.length ? (
              queue.map((scan) => (
                <article className="queue-card" key={scan.clientScanId}>
                  <strong>BIB {scan.bib}</strong>
                  <span>{scan.checkpointId}</span>
                  <span>Queued offline</span>
                  <time>{formatDateTime(scan.scannedAt)}</time>
                </article>
              ))
            ) : (
              <div className="placeholder-card">Belum ada item di antrean lokal.</div>
            )}
          </div>
        </div>
      </section>

      <footer className="runtime-footer">
        <span>Build {__APP_BUILD__}</span>
        <span>Built {new Date(__APP_BUILT_AT__).toLocaleString()}</span>
        <span>API {apiHost}</span>
      </footer>
    </main>
  );
}
