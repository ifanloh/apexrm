import { useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import QrScanner from "qr-scanner";
import {
  authProfileSchema,
  defaultCheckpoints,
  formatCheckpointLabel,
  type AuthProfile,
  type Checkpoint,
  type IngestScanResponse,
  type ScanSubmission
} from "@arm/contracts";
import { fetchCheckpoints, syncOffline } from "./api";
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
type ScannerScreen = "timing" | "checkpoint" | "history";

function getStoredValue(key: string, fallback: string) {
  return window.localStorage.getItem(key) ?? fallback;
}

function createClientId() {
  const randomUuid = globalThis.crypto?.randomUUID;
  if (typeof randomUuid === "function") {
    return randomUuid.call(globalThis.crypto);
  }

  return `scanner-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
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

function extractBibFromPayload(rawValue: string) {
  const trimmed = rawValue.trim();

  if (!trimmed) {
    return "";
  }

  if (isValidBib(trimmed)) {
    return normalizeBib(trimmed);
  }

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const candidate =
      parsed.bib ??
      parsed.bibCode ??
      parsed.code ??
      parsed.runnerBib ??
      parsed.value;

    if (typeof candidate === "string" && candidate.trim()) {
      return normalizeBib(candidate);
    }
  } catch {
    // Keep falling back to URL/plain-text parsing.
  }

  try {
    const url = new URL(trimmed);
    const queryCandidate =
      url.searchParams.get("bib") ??
      url.searchParams.get("code") ??
      url.searchParams.get("bibCode") ??
      url.pathname.split("/").filter(Boolean).at(-1);

    if (queryCandidate && isValidBib(queryCandidate)) {
      return normalizeBib(queryCandidate);
    }
  } catch {
    // Not a URL payload.
  }

  const fallbackCandidate = trimmed.match(/[A-Za-z0-9-]{2,32}/)?.[0] ?? trimmed;
  return normalizeBib(fallbackCandidate);
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
  const [deviceId, setDeviceId] = useState(() => getStoredValue("arm:deviceId", createClientId()));
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
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [recentActivity, setRecentActivity] = useState<ScannerActivity[]>([]);
  const [screen, setScreen] = useState<ScannerScreen>("timing");
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isCameraBusy, setIsCameraBusy] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraHint, setCameraHint] = useState("Arahkan QR ke area kamera.");
  const syncLockRef = useRef(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const qrScannerRef = useRef<QrScanner | null>(null);
  const cameraLockRef = useRef(false);

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
  const recentPreview = recentActivity.slice(0, 3);
  const queueCount = queue.length;
  const totalHandledCount = recentActivity.length + queueCount;

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
    if (!isCameraOpen || !videoRef.current) {
      return;
    }

    let isDisposed = false;

    async function startCameraScanner() {
      try {
        const hasCamera = await QrScanner.hasCamera();

        if (!hasCamera) {
          setCameraError("Perangkat ini tidak menemukan kamera yang bisa dipakai untuk scan QR.");
          return;
        }

        const scanner = new QrScanner(
          videoRef.current!,
          async (result) => {
            if (cameraLockRef.current) {
              return;
            }

            cameraLockRef.current = true;
            setIsCameraBusy(true);
            setCameraHint("QR terdeteksi. Memproses scan...");

            try {
              const payload = typeof result === "string" ? result : result.data;
              await processScan(payload);
              setIsCameraOpen(false);
            } finally {
              cameraLockRef.current = false;
              setIsCameraBusy(false);
            }
          },
          {
            preferredCamera: "environment",
            returnDetailedScanResult: true,
            highlightCodeOutline: false,
            highlightScanRegion: false,
            maxScansPerSecond: 8
          }
        );

        qrScannerRef.current = scanner;

        await scanner.start();
        if (!isDisposed) {
          setCameraError(null);
          setCameraHint("Arahkan QR ke dalam frame. Scanner akan membaca otomatis.");
        }
      } catch (error) {
        if (!isDisposed) {
          setCameraError(error instanceof Error ? error.message : "Kamera gagal dibuka.");
        }
      }
    }

    void startCameraScanner();

    return () => {
      isDisposed = true;
      cameraLockRef.current = false;
      setIsCameraBusy(false);
      qrScannerRef.current?.stop();
      qrScannerRef.current?.destroy();
      qrScannerRef.current = null;
    };
  }, [isCameraOpen]);

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

    const normalizedBib = extractBibFromPayload(rawValue);

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
      clientScanId: createClientId(),
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

  function appendBibDigit(digit: string) {
    setBib((current) => `${current}${digit}`);
  }

  function appendBibPrefix(prefix: "M" | "W") {
    setBib((current) => normalizeBib(`${current}${prefix}`));
  }

  function clearBib() {
    setBib("");
  }

  function removeLastBibCharacter() {
    setBib((current) => current.slice(0, -1));
  }

  async function submitCurrentBib() {
    await processScan(bib);
  }

  function openCameraScanner() {
    setCameraError(null);
    setCameraHint("Arahkan QR ke area kamera.");
    setIsCameraOpen(true);
  }

  function closeCameraScanner() {
    setIsCameraOpen(false);
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
      <section className="scanner-app">
        <header className={`scanner-app-header ${screen !== "timing" ? "subscreen" : ""}`}>
          <div className="scanner-app-header-row">
            <div className={`scanner-connection-pill ${isOnline ? "online" : "offline"}`}>
              <span className="status-dot" />
              {isOnline ? "Live" : "Offline"}
            </div>
            <div className="scanner-app-actions">
              <button
                className="scanner-icon-button"
                disabled={isSyncing}
                onClick={() => void syncQueue()}
                type="button"
              >
                {isSyncing ? "Syncing..." : "Sync Queue"}
              </button>
              <button
                className="scanner-icon-button"
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
          </div>

          <div className="scanner-app-title">
            <p className="scanner-kicker">Race Control Scanner</p>
            <h1>{DEMO_EVENT_LABEL}</h1>
            <p>{selectedCheckpoint ? formatCheckpointLabel(selectedCheckpoint) : "Pilih checkpoint"}</p>
          </div>

          <div className="scanner-station-strip">
            <article className="scanner-station-chip">
              <span className="scanner-station-label">Checkpoint</span>
              <strong>{selectedCheckpoint?.code ?? checkpointId}</strong>
            </article>
            <article className="scanner-station-chip">
              <span className="scanner-station-label">Crew</span>
              <strong>{effectiveProfile?.crewCode ?? crewId}</strong>
            </article>
            <article className="scanner-station-chip">
              <span className="scanner-station-label">Queue</span>
              <strong>{queueCount}</strong>
            </article>
          </div>
        </header>

        {screen === "timing" ? (
          <section className="scanner-screen scanner-screen-timing">
            <div className="scanner-display-card">
              <div className="scanner-display-head">
                <div className="scanner-display-stat">
                  <span className="scanner-display-stat-label">Handled</span>
                  <strong>
                    {totalHandledCount}/{Math.max(totalHandledCount, 1)}
                  </strong>
                </div>
                <span className={`scanner-display-badge ${canScan ? "ready" : "locked"}`}>
                  {canScan ? "Ready" : "Locked"}
                </span>
              </div>
              <p className="scanner-kicker">Input BIB Manual</p>
              <strong className="scanner-display-value">{bib || "0"}</strong>
              <label className="scanner-inline-field">
                <span>Alphanumeric BIB</span>
                <input
                  disabled={!canScan || isBusy}
                  placeholder="Tap keypad atau ketik BIB"
                  value={bib}
                  onChange={(event) => setBib(normalizeBib(event.target.value))}
                />
              </label>
            </div>

            <div className="scanner-result-strip">
              {lastResultSummary ? (
                <article className={`scanner-result-card ${lastResponse?.status === "accepted" ? "success" : "duplicate"}`}>
                  <strong>{lastResultSummary.title}</strong>
                  <span>{lastResultSummary.meta}</span>
                  <time>{lastResultSummary.time}</time>
                </article>
              ) : (
                <article className="scanner-result-card neutral">
                  <strong>Scanner siap</strong>
                  <span>{statusMessage}</span>
                </article>
              )}
            </div>

            {isCameraOpen ? (
              <div className="scanner-camera-sheet">
                <div className="scanner-camera-head">
                  <div>
                    <p className="scanner-kicker">Camera Scan</p>
                    <strong>Scan QR bib runner</strong>
                  </div>
                  <button className="scanner-utility-chip" onClick={closeCameraScanner} type="button">
                    Close
                  </button>
                </div>
                <div className="scanner-camera-frame">
                  <video className="scanner-camera-video" muted playsInline ref={videoRef} />
                  <div className="scanner-camera-guide" />
                </div>
                <div className="scanner-camera-copy">
                  {cameraError ? (
                    <div className="placeholder-card">{cameraError}</div>
                  ) : (
                    <span>{isCameraBusy ? "Memproses QR..." : cameraHint}</span>
                  )}
                </div>
              </div>
            ) : null}

            <div className="scanner-recent-list">
              {recentPreview.map((entry) => (
                <article className={`scanner-recent-row ${entry.status}`} key={entry.id}>
                  <span className="scanner-recent-dot" />
                  <div className="scanner-recent-copy">
                    <strong>{entry.bib}</strong>
                    <span>{entry.checkpointLabel}</span>
                  </div>
                  <time>{formatDateTime(entry.time)}</time>
                  <span className="scanner-recent-mark">
                    {entry.status === "accepted" ? "OK" : entry.status === "duplicate" ? "DUP" : entry.status === "queued" ? "Q" : "ERR"}
                  </span>
                </article>
              ))}
            </div>

            <form className="scanner-hidden-submit" onSubmit={handleSubmit}>
              <button type="submit" />
            </form>

            <div className="scanner-prefix-row">
              <button
                className="scanner-prefix-chip"
                disabled={!canScan || isBusy}
                onClick={() => appendBibPrefix("M")}
                type="button"
              >
                M
              </button>
              <button
                className="scanner-prefix-chip"
                disabled={!canScan || isBusy}
                onClick={() => appendBibPrefix("W")}
                type="button"
              >
                W
              </button>
              <button
                className="scanner-prefix-chip scanner-prefix-chip-muted"
                disabled={isBusy || !bib}
                onClick={removeLastBibCharacter}
                type="button"
              >
                Del
              </button>
            </div>

            <div className="scanner-keypad">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
                <button
                  className="scanner-key scanner-key-digit"
                  disabled={!canScan || isBusy}
                  key={digit}
                  onClick={() => appendBibDigit(digit)}
                  type="button"
                >
                  {digit}
                </button>
              ))}
              <button className="scanner-key scanner-key-clear" disabled={isBusy} onClick={clearBib} type="button">
                C
              </button>
              <button
                className="scanner-key scanner-key-digit"
                disabled={!canScan || isBusy}
                onClick={() => appendBibDigit("0")}
                type="button"
              >
                0
              </button>
              <button
                className="scanner-key scanner-key-submit"
                disabled={!canScan || isBusy || !bib}
                onClick={() => void submitCurrentBib()}
                type="button"
              >
                {isBusy ? "..." : "OK"}
              </button>
            </div>

            <div className="scanner-utility-meta">
              <div className="scanner-utility-chip quiet">
                Crew {effectiveProfile?.displayName ?? effectiveProfile?.crewCode ?? crewId}
              </div>
            </div>
          </section>
        ) : null}

        {screen === "checkpoint" ? (
          <section className="scanner-screen scanner-screen-checkpoint">
            <div className="panel-copy">
              <p className="scanner-kicker">Select checkpoint</p>
              <h2>Checkpoint list</h2>
            </div>
            <div className="scanner-checkpoint-list">
              {checkpoints.map((checkpoint) => {
                const isSelected = checkpoint.id === checkpointId;
                return (
                  <button
                    className={`scanner-checkpoint-row ${isSelected ? "selected" : ""}`}
                    key={checkpoint.id}
                    onClick={() => {
                      setCheckpointId(checkpoint.id);
                      setScreen("timing");
                    }}
                    type="button"
                  >
                    <span className="scanner-checkpoint-order">{checkpoint.order}</span>
                    <span className="scanner-checkpoint-copy">
                      <strong>{checkpoint.name}</strong>
                      <span>
                        {checkpoint.kmMarker} km
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ) : null}

        {screen === "history" ? (
          <section className="scanner-screen scanner-screen-history">
            <div className="panel-copy">
              <p className="scanner-kicker">Recent Scanner Activity</p>
              <h2>History & Queue</h2>
            </div>

            <div className="scanner-history-list">
              {recentActivity.length ? (
                recentActivity.map((entry) => (
                  <article className={`scanner-history-row ${entry.status}`} key={entry.id}>
                    <div>
                      <strong>{entry.bib}</strong>
                      <span>{entry.checkpointLabel}</span>
                    </div>
                    <div>
                      <strong>{entry.detail}</strong>
                      <time>{formatDateTime(entry.time)}</time>
                    </div>
                  </article>
                ))
              ) : (
                <div className="placeholder-card">Belum ada activity scanner.</div>
              )}
            </div>

            <div className="panel-copy">
              <p className="scanner-kicker">Pending sync</p>
              <h3>Offline queue</h3>
            </div>
            <div className="scanner-history-list">
              {queue.length ? (
                queue.map((scan) => (
                  <article className="scanner-history-row queued" key={scan.clientScanId}>
                    <div>
                      <strong>{scan.bib}</strong>
                      <span>{scan.checkpointId}</span>
                    </div>
                    <div>
                      <strong>Queued offline</strong>
                      <time>{formatDateTime(scan.scannedAt)}</time>
                    </div>
                  </article>
                ))
              ) : (
                <div className="placeholder-card">Belum ada item di antrean lokal.</div>
              )}
            </div>
          </section>
        ) : null}
      </section>

      <nav className="scanner-bottom-nav" aria-label="Scanner quick actions">
        <button
          className={`scanner-nav-button ${screen === "checkpoint" ? "active" : ""}`}
          onClick={() => setScreen("checkpoint")}
          type="button"
        >
          Checkpoints
        </button>
        <button
          className={`scanner-nav-button scanner-nav-button-primary ${screen === "timing" ? "active" : ""}`}
          disabled={!canScan || isBusy}
          onClick={openCameraScanner}
          type="button"
        >
          Scan QR
        </button>
        <button
          className={`scanner-nav-button ${screen === "history" ? "active" : ""}`}
          onClick={() => setScreen("history")}
          type="button"
        >
          History
        </button>
      </nav>

      <footer className="runtime-footer">
        <span>Build {__APP_BUILD__}</span>
        <span>Built {new Date(__APP_BUILT_AT__).toLocaleString()}</span>
        <span>API {apiHost}</span>
      </footer>
    </main>
  );
}
