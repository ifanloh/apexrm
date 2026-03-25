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

const DEFAULT_RACE_ID = "race-demo-2026";

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

function deriveProfileFromSession(session: Session, fallbackCrewCode: string): AuthProfile {
  const appMetadata = session.user.app_metadata ?? {};
  const userMetadata = session.user.user_metadata ?? {};

  return authProfileSchema.parse({
    userId: session.user.id,
    email: session.user.email ?? null,
    role: appMetadata.role ?? "crew",
    crewCode: appMetadata.crew_code ?? fallbackCrewCode,
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
  const [statusMessage, setStatusMessage] = useState("Scanner siap. QR dapat dipindai dari kamera atau diisi manual.");
  const [lastResponse, setLastResponse] = useState<IngestScanResponse | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanLockRef = useRef<string>("");

  const selectedCheckpoint = useMemo(
    () => checkpoints.find((checkpoint) => checkpoint.id === checkpointId) ?? null,
    [checkpointId, checkpoints]
  );
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

  useEffect(() => {
    if (!supabase) {
      return;
    }

    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
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
    }

    bootstrap().catch(() => {
      setCheckpoints([...defaultCheckpoints]);
      setCheckpointId("cp-10");
      setStatusMessage("Metadata checkpoint dari API gagal dimuat. Scanner memakai checkpoint default.");
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

  async function syncQueue() {
    if (!session?.access_token) {
      return;
    }

    const pendingScans = await getQueuedScans();

    if (pendingScans.length === 0) {
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
      await refreshQueue();
    } catch {
      setStatusMessage("Sync offline gagal. Queue lokal tetap disimpan.");
      await refreshQueue();
    }
  }

  async function processScan(rawValue: string) {
    if (!session?.access_token) {
      setStatusMessage("Login crew diperlukan sebelum scan.");
      return;
    }

    if (!profile || !["crew", "panitia", "admin"].includes(profile.role)) {
      setStatusMessage("Akun ini tidak diizinkan melakukan scan.");
      return;
    }

    const normalizedBib = rawValue.trim();

    if (!checkpointId || !normalizedBib) {
      setStatusMessage("Checkpoint dan payload QR/BIB wajib ada.");
      return;
    }

    if (!isValidBib(normalizedBib)) {
      navigator.vibrate?.(240);
      setStatusMessage("Format QR/BIB tidak valid.");
      return;
    }

    if (await hasLocalDuplicate(checkpointId, normalizedBib)) {
      navigator.vibrate?.([100, 80, 100]);
      setStatusMessage(`BIB ${normalizedBib} sudah pernah discan di device ini untuk checkpoint aktif.`);
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
    setBib(normalizedBib);

    try {
      if (!isOnline) {
        await queueScan(payload);
        await markLocalScan(checkpointId, normalizedBib);
        navigator.vibrate?.(160);
        setStatusMessage(`BIB ${normalizedBib} disimpan offline.`);
        setBib("");
        await refreshQueue();
        return;
      }

      const response = await sendScan(payload, session.access_token);
      await markLocalScan(checkpointId, normalizedBib);
      navigator.vibrate?.(120);
      setLastResponse(response);
      setStatusMessage(
        response.status === "accepted"
          ? `Sukses. BIB ${normalizedBib} tercatat resmi di ${selectedCheckpoint?.code ?? checkpointId}.`
          : `BIB ${normalizedBib} sudah pernah discan dan tercatat sebagai duplikat.`
      );
      setBib("");
      await syncQueue();
    } catch {
      await queueScan(payload);
      await markLocalScan(checkpointId, normalizedBib);
      setStatusMessage(`Server tidak terjangkau. BIB ${normalizedBib} masuk antrean lokal.`);
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
          <div className="panel-copy">
            <p className="scanner-kicker">Crew Login</p>
            <h1>Masuk ke Scanner</h1>
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

  if (profile && !["crew", "panitia", "admin"].includes(profile.role)) {
    return (
      <main className="scanner-shell">
        <section className="scanner-panel auth-panel">
          <div className="panel-copy">
            <p className="scanner-kicker">Unauthorized</p>
            <h1>Akses scanner ditolak</h1>
          </div>
          <div className="placeholder-card">
            Akun dengan role <strong>{profile.role}</strong> tidak boleh melakukan scan lapangan.
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
        </div>
        <div className="scanner-topbar-meta">
          <div className={`scanner-pill ${isOnline ? "online" : "offline"}`}>
            <span className="status-dot" />
            {isOnline ? "Live Connectivity" : "Offline Queue Mode"}
          </div>
          <button className="ghost-button" onClick={() => void syncQueue()} type="button">
            Sync Queue
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
            <select value={checkpointId} onChange={(event) => setCheckpointId(event.target.value)}>
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
            <button className="primary-button" onClick={() => setCameraEnabled((value) => !value)} type="button">
              {cameraEnabled ? "Matikan Kamera" : "Aktifkan Kamera"}
            </button>
            <div className="tool-group">
              <button onClick={() => setBib("")} type="button">
                Clear
              </button>
              <button onClick={() => void syncQueue()} type="button">
                Sync
              </button>
              <button onClick={() => navigator.vibrate?.(120)} type="button">
                Haptic
              </button>
            </div>
          </div>
        </article>

        <aside className="scanner-rail">
          <section className="scanner-panel total-panel">
            <span>Pending sync</span>
            <strong>{queue.length}</strong>
            <p>Queue lokal akan dikirim ke endpoint `/api/sync-offline` saat koneksi kembali.</p>
          </section>

          <section className="scanner-panel">
            <div className="rail-head compact">
              <div>
                <span>Session</span>
                <strong>{profile?.crewCode ?? crewId}</strong>
              </div>
            </div>
            <form className="scanner-form" onSubmit={handleSubmit}>
              <label>
                Input BIB Manual
                <input placeholder="contoh: 1024" value={bib} onChange={(event) => setBib(event.target.value)} />
              </label>

              <button className="submit-button" disabled={isBusy} type="submit">
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
          <p className="scanner-kicker">Local Queue</p>
          <h3>Recent Offline Captures</h3>
        </div>
        <div className="queue-grid">
          {queue.length ? (
            queue.map((scan) => (
              <article className="queue-card" key={scan.clientScanId}>
                <strong>BIB {scan.bib}</strong>
                <span>{scan.checkpointId}</span>
                <time>{formatDateTime(scan.scannedAt)}</time>
              </article>
            ))
          ) : (
            <div className="placeholder-card">Belum ada item di antrean lokal.</div>
          )}
        </div>
      </section>
    </main>
  );
}
