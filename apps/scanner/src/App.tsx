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
  type IngestWithdrawalResponse,
  type ScanSubmission,
  type WithdrawalSubmission
} from "@arm/contracts";
import { fetchCheckpoints, syncOffline, syncOfflineWithdrawals } from "./api";
import {
  getQueuedScans,
  getQueuedWithdrawals,
  hasLocalDuplicate,
  hasLocalWithdrawalDuplicate,
  markLocalScan,
  markLocalWithdrawal,
  queueScan,
  queueWithdrawal,
  removeQueuedScan,
  removeQueuedWithdrawal,
  type QueuedScan,
  type QueuedWithdrawal
} from "./db";
import { supabase } from "./supabase";
import "./styles.css";

const DEFAULT_RACE_ID = import.meta.env.VITE_RACE_ID ?? "templiers-demo-2026";
const DEMO_EVENT_LABEL = import.meta.env.VITE_EVENT_LABEL ?? "Grand Trail des Templiers Demo";
type ScannerScreen = "timing" | "checkpoint" | "history";
type ScannerEntryMode = "timing" | "withdraw";
type ScannerAlertTone = "warning" | "danger";
type WakeLockState = "idle" | "active" | "unsupported" | "released";

type BatteryManagerLike = {
  level: number;
  charging: boolean;
  addEventListener: (type: "levelchange" | "chargingchange", listener: () => void) => void;
  removeEventListener: (type: "levelchange" | "chargingchange", listener: () => void) => void;
};

type WakeLockSentinelLike = EventTarget & {
  released: boolean;
  release: () => Promise<void>;
};

function getStoredValue(key: string, fallback: string) {
  return window.localStorage.getItem(key) ?? fallback;
}

function getCheckpointSessionKey(userId: string) {
  return `arm:lockedCheckpoint:${userId}`;
}

function getLockedCheckpointForSession(userId: string) {
  return window.sessionStorage.getItem(getCheckpointSessionKey(userId)) ?? "";
}

function setLockedCheckpointForSession(userId: string, checkpointId: string) {
  window.sessionStorage.setItem(getCheckpointSessionKey(userId), checkpointId);
}

function clearLockedCheckpointForSession(userId: string) {
  window.sessionStorage.removeItem(getCheckpointSessionKey(userId));
}

function createClientId() {
  const randomUuid = globalThis.crypto?.randomUUID;
  if (typeof randomUuid === "function") {
    return randomUuid.call(globalThis.crypto);
  }

  return `scanner-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function runHapticFeedback(type: "accepted" | "queued" | "duplicate" | "rejected") {
  if (typeof navigator.vibrate !== "function") {
    return;
  }

  if (type === "accepted") {
    navigator.vibrate(70);
    return;
  }

  if (type === "queued") {
    navigator.vibrate([90, 45, 90]);
    return;
  }

  if (type === "duplicate") {
    navigator.vibrate([120, 70, 120]);
    return;
  }

  navigator.vibrate(220);
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

type ScannerActivityStatus = "queued" | "accepted" | "duplicate" | "rejected" | "withdrawn";

type ScannerActivity = {
  id: string;
  bib: string;
  checkpointLabel: string;
  status: ScannerActivityStatus;
  detail: string;
  time: string;
};

type ScannerActionSummaryTone = "success" | "duplicate" | "withdrawn";

type ScannerActionSummary = {
  title: string;
  meta: string;
  time: string;
  tone: ScannerActionSummaryTone;
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
  const [checkpointId, setCheckpointId] = useState("");
  const [bib, setBib] = useState("");
  const [isOnline, setIsOnline] = useState(window.navigator.onLine);
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([...defaultCheckpoints]);
  const [queue, setQueue] = useState<QueuedScan[]>([]);
  const [withdrawalQueue, setWithdrawalQueue] = useState<QueuedWithdrawal[]>([]);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [statusMessage, setStatusMessage] = useState(
    `Scanner siap untuk ${DEMO_EVENT_LABEL}. Gunakan BIB T0001-T0500 atau BIB baru untuk trial.`
  );
  const [isBusy, setIsBusy] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [recentActivity, setRecentActivity] = useState<ScannerActivity[]>([]);
  const [screen, setScreen] = useState<ScannerScreen>("timing");
  const [entryMode, setEntryMode] = useState<ScannerEntryMode>("timing");
  const [withdrawNote, setWithdrawNote] = useState("");
  const [isCheckpointLocked, setIsCheckpointLocked] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isCameraBusy, setIsCameraBusy] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraHint, setCameraHint] = useState("Arahkan QR ke area kamera.");
  const [cameraDismissed, setCameraDismissed] = useState(false);
  const [batteryPercent, setBatteryPercent] = useState<number | null>(null);
  const [isCharging, setIsCharging] = useState<boolean | null>(null);
  const [wakeLockState, setWakeLockState] = useState<WakeLockState>("idle");
  const [lastActionSummary, setLastActionSummary] = useState<ScannerActionSummary | null>(null);
  const syncLockRef = useRef(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const qrScannerRef = useRef<QrScanner | null>(null);
  const cameraLockRef = useRef(false);
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null);

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
  const lastResultSummary = lastActionSummary;
  const canScan = Boolean(
    session?.access_token &&
      effectiveProfile &&
      ["crew", "panitia", "admin"].includes(effectiveProfile.role) &&
      isCheckpointLocked &&
      checkpointId &&
      checkpoints.length > 0 &&
      !isBootstrapping
  );
  const apiHost = getApiHost();
  const recentPreview = recentActivity.slice(0, 3);
  const queueCount = queue.length + withdrawalQueue.length;
  const showSyncAction = queueCount > 0 || isSyncing;
  const syncActionLabel = isSyncing ? `Syncing ${queueCount || ""}`.trim() : !isOnline ? `Queued ${queueCount}` : `Sync ${queueCount}`;
  const operationalAlert = useMemo(() => {
    if (!isOnline) {
      return {
        tone: "danger" as const,
        title: "Offline mode",
        detail:
          queueCount > 0
            ? `${queueCount} item sedang menunggu sinkronisasi ke server.`
            : "Scan atau withdraw baru akan disimpan lokal sampai koneksi kembali."
      };
    }

    if (queueCount >= 5) {
      return {
        tone: "warning" as const,
        title: "Sync backlog",
        detail: `${queueCount} item masih ada di queue. Jalankan sinkronisasi sebelum antrean bertambah.`
      };
    }

    if (batteryPercent !== null && isCharging === false && batteryPercent <= 20) {
      return {
        tone: "warning" as const,
        title: "Battery low",
        detail: `Baterai tinggal ${batteryPercent}%. Sambungkan daya agar shift scan tidak terputus.`
      };
    }

    if (isCheckpointLocked && wakeLockState !== "active") {
      return {
        tone: "warning" as const,
        title: "Screen stay-awake off",
        detail: "Pastikan layar tidak sleep selama shift scan berjalan."
      };
    }

    return null;
  }, [batteryPercent, isCharging, isCheckpointLocked, isOnline, queueCount, wakeLockState]);

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
      setCheckpointId("");
      setIsCheckpointLocked(false);
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
      const [remoteCheckpoints, pendingScans, pendingWithdrawals] = await Promise.all([
        fetchCheckpoints(),
        getQueuedScans(),
        getQueuedWithdrawals()
      ]);
      const nextCheckpoints = remoteCheckpoints.length > 0 ? remoteCheckpoints : [...defaultCheckpoints];
      setCheckpoints(nextCheckpoints);
      setQueue(pendingScans);
      setWithdrawalQueue(pendingWithdrawals);
      setCheckpointId((currentValue) =>
        currentValue && nextCheckpoints.some((checkpoint) => checkpoint.id === currentValue) ? currentValue : ""
      );
      setIsBootstrapping(false);
    }

    bootstrap().catch(() => {
      setCheckpoints([...defaultCheckpoints]);
      setCheckpointId("");
      setStatusMessage("Metadata checkpoint dari API gagal dimuat. Login ulang lalu pilih checkpoint untuk shift ini.");
      setIsBootstrapping(false);
    });
  }, []);

  useEffect(() => {
    if (!session?.user?.id || isBootstrapping || checkpoints.length === 0) {
      return;
    }

    const lockedCheckpointId = getLockedCheckpointForSession(session.user.id);

    if (lockedCheckpointId && checkpoints.some((checkpoint) => checkpoint.id === lockedCheckpointId)) {
      setCheckpointId((currentValue) => (currentValue === lockedCheckpointId ? currentValue : lockedCheckpointId));
      setIsCheckpointLocked(true);
      setScreen((currentScreen) => (currentScreen === "checkpoint" ? "timing" : currentScreen));
      return;
    }

    setCheckpointId("");
    setIsCheckpointLocked(false);
    setScreen("checkpoint");
    setStatusMessage("Pilih checkpoint sekali setelah login. Untuk mengganti checkpoint, logout lalu login lagi.");
  }, [checkpoints, isBootstrapping, session?.user?.id]);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      void syncQueue();
    };

    const handleOffline = () => {
      setIsOnline(false);
      setStatusMessage("Koneksi terputus. Scan atau withdraw baru akan masuk antrean lokal.");
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [session]);

  useEffect(() => {
    const batteryApi = (navigator as Navigator & { getBattery?: () => Promise<BatteryManagerLike> }).getBattery;

    if (typeof batteryApi !== "function") {
      return;
    }

    let isDisposed = false;
    let batteryManager: BatteryManagerLike | null = null;

    const handleBatteryUpdate = () => {
      if (!batteryManager || isDisposed) {
        return;
      }

      setBatteryPercent(Math.round(batteryManager.level * 100));
      setIsCharging(batteryManager.charging);
    };

    void batteryApi.call(navigator).then((battery) => {
      if (isDisposed) {
        return;
      }

      batteryManager = battery;
      handleBatteryUpdate();
      battery.addEventListener("levelchange", handleBatteryUpdate);
      battery.addEventListener("chargingchange", handleBatteryUpdate);
    });

    return () => {
      isDisposed = true;

      if (batteryManager) {
        batteryManager.removeEventListener("levelchange", handleBatteryUpdate);
        batteryManager.removeEventListener("chargingchange", handleBatteryUpdate);
      }
    };
  }, []);

  useEffect(() => {
    if (screen !== "timing") {
      setCameraDismissed(false);
      setIsCameraOpen(false);
      return;
    }

    if (canScan && !isCameraOpen && !cameraDismissed) {
      setCameraError(null);
      setCameraHint("Arahkan QR ke area kamera.");
      setIsCameraOpen(true);
    }
  }, [cameraDismissed, canScan, isCameraOpen, screen]);

  useEffect(() => {
    if (screen !== "timing" || !canScan || isCameraOpen) {
      return;
    }

    const focusTimer = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 120);

    return () => {
      window.clearTimeout(focusTimer);
    };
  }, [canScan, isCameraOpen, lastActionSummary, screen]);

  useEffect(() => {
    if (!session?.access_token || !isCheckpointLocked) {
      setWakeLockState("idle");
      void wakeLockRef.current?.release().catch(() => {});
      wakeLockRef.current = null;
      return;
    }

    const wakeLockApi = (navigator as Navigator & {
      wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinelLike> };
    }).wakeLock;

    if (!wakeLockApi?.request) {
      setWakeLockState("unsupported");
      return;
    }

    let isDisposed = false;

    const requestWakeLock = async () => {
      try {
        const lock = await wakeLockApi.request("screen");

        if (isDisposed) {
          await lock.release().catch(() => {});
          return;
        }

        wakeLockRef.current = lock;
        setWakeLockState("active");
        lock.addEventListener("release", () => {
          if (!isDisposed) {
            setWakeLockState("released");
          }
        });
      } catch {
        if (!isDisposed) {
          setWakeLockState("released");
        }
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && (!wakeLockRef.current || wakeLockRef.current.released)) {
        void requestWakeLock();
      }
    };

    void requestWakeLock();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      isDisposed = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      void wakeLockRef.current?.release().catch(() => {});
      wakeLockRef.current = null;
    };
  }, [isCheckpointLocked, session?.access_token]);

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
              await processCurrentEntry(payload);
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
    const [pendingScans, pendingWithdrawals] = await Promise.all([getQueuedScans(), getQueuedWithdrawals()]);
    setQueue(pendingScans);
    setWithdrawalQueue(pendingWithdrawals);
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

  function createScanActionSummary(result: IngestScanResponse): ScannerActionSummary {
    if (result.status === "accepted") {
      return {
        title: `BIB ${result.officialScan.bib} diterima`,
        meta: `Posisi #${result.officialScan.position} di ${result.officialScan.checkpointId}`,
        time: formatDateTime(result.officialScan.serverReceivedAt),
        tone: "success"
      };
    }

    return {
      title: `BIB ${result.duplicate.bib} duplikat`,
      meta: `Scan pertama ${result.duplicate.firstAcceptedClientScanId}`,
      time: formatDateTime(result.duplicate.serverReceivedAt),
      tone: "duplicate"
    };
  }

  function createWithdrawalActionSummary(result: IngestWithdrawalResponse): ScannerActionSummary {
    if (result.status === "recorded") {
      return {
        title: `BIB ${result.withdrawal.bib} withdraw tercatat`,
        meta: `Withdraw dilaporkan di ${result.withdrawal.checkpointId}`,
        time: formatDateTime(result.withdrawal.serverReceivedAt),
        tone: "withdrawn"
      };
    }

    return {
      title: `BIB ${result.withdrawal.bib} sudah withdraw`,
      meta: `Tercatat pertama ${result.withdrawal.firstRecordedClientWithdrawId}`,
      time: formatDateTime(result.withdrawal.serverReceivedAt),
      tone: "duplicate"
    };
  }

  function addWithdrawalActivities(results: IngestWithdrawalResponse[]) {
    const nextEntries = results
      .map((result) => {
        if (result.status === "recorded") {
          return createActivityEntry(
            result.withdrawal.bib,
            result.withdrawal.checkpointId,
            "withdrawn",
            result.withdrawal.note?.trim() ? `Withdraw: ${result.withdrawal.note.trim()}` : "Withdraw recorded",
            result.withdrawal.serverReceivedAt
          );
        }

        return createActivityEntry(
          result.withdrawal.bib,
          result.withdrawal.checkpointId,
          "duplicate",
          `Withdraw sudah tercatat (${result.withdrawal.firstRecordedClientWithdrawId})`,
          result.withdrawal.serverReceivedAt
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
    const [pendingScans, pendingWithdrawals] = await Promise.all([getQueuedScans(), getQueuedWithdrawals()]);

    if (pendingScans.length === 0 && pendingWithdrawals.length === 0) {
      syncLockRef.current = false;
      setIsSyncing(false);
      return;
    }

    setStatusMessage(`Menyinkronkan ${pendingScans.length + pendingWithdrawals.length} item lokal...`);

    try {
      if (pendingScans.length > 0) {
        const scanResult = await syncOffline(pendingScans, session.access_token);

        for (const pendingScan of pendingScans) {
          await removeQueuedScan(pendingScan.clientScanId);
        }

        setLastActionSummary(scanResult.results.length ? createScanActionSummary(scanResult.results[scanResult.results.length - 1]) : null);
        addResultActivities(scanResult.results);
        setStatusMessage(`Sync scan selesai. ${scanResult.accepted} scan baru, ${scanResult.duplicates} duplikat.`);
      }

      if (pendingWithdrawals.length > 0) {
        const withdrawalResult = await syncOfflineWithdrawals(pendingWithdrawals, session.access_token);

        for (const pendingWithdrawal of pendingWithdrawals) {
          await removeQueuedWithdrawal(pendingWithdrawal.clientWithdrawId);
        }

        setLastActionSummary(
          withdrawalResult.results.length
            ? createWithdrawalActionSummary(withdrawalResult.results[withdrawalResult.results.length - 1])
            : null
        );
        addWithdrawalActivities(withdrawalResult.results);
        setStatusMessage(
          `Sync withdraw selesai. ${withdrawalResult.recorded} tercatat, ${withdrawalResult.duplicates} sudah pernah withdraw.`
        );
      }

      await refreshQueue();
    } catch {
      setStatusMessage("Sync offline gagal. Queue lokal tetap disimpan.");
      await refreshQueue();
    } finally {
      syncLockRef.current = false;
      setIsSyncing(false);

      if (window.navigator.onLine) {
        const [nextPendingScans, nextPendingWithdrawals] = await Promise.all([getQueuedScans(), getQueuedWithdrawals()]);

        if (nextPendingScans.length > 0 || nextPendingWithdrawals.length > 0) {
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
      runHapticFeedback("rejected");
      setStatusMessage("Format QR/BIB tidak valid.");
      addActivityEntry(
        createActivityEntry(normalizedBib || rawValue.trim() || "UNKNOWN", activeCheckpointLabel, "rejected", "Invalid BIB format")
      );
      return;
    }

    if (await hasLocalDuplicate(checkpointId, normalizedBib)) {
      runHapticFeedback("duplicate");
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
      setLastActionSummary(null);
      await refreshQueue();

      if (!isOnline) {
        runHapticFeedback("queued");
        setStatusMessage(`BIB ${normalizedBib} disimpan offline. Antrean lokal siap disinkronkan nanti.`);
        addActivityEntry(
          createActivityEntry(normalizedBib, activeCheckpointLabel, "queued", "Saved to offline queue")
        );
        return;
      }

      runHapticFeedback("accepted");
      setStatusMessage(
        `BIB ${normalizedBib} diterima device di ${selectedCheckpoint?.code ?? checkpointId}. Sinkronisasi ke server berjalan di background.`
      );
      addActivityEntry(
        createActivityEntry(normalizedBib, activeCheckpointLabel, "queued", "Queued for immediate sync")
      );
      void syncQueue();
    } catch {
      runHapticFeedback("rejected");
      setStatusMessage(`BIB ${normalizedBib} gagal diproses di device. Coba ulangi sekali lagi.`);
      addActivityEntry(
        createActivityEntry(normalizedBib, activeCheckpointLabel, "rejected", "Device processing failed")
      );
      await refreshQueue();
    } finally {
      setIsBusy(false);
    }
  }

  async function processWithdrawal(rawValue: string) {
    if (!canScan || !session?.access_token) {
      setStatusMessage("Login crew diperlukan sebelum input withdraw.");
      return;
    }

    const actorProfile = effectiveProfile;

    if (!actorProfile || !["crew", "panitia", "admin"].includes(actorProfile.role)) {
      setStatusMessage("Akun ini tidak diizinkan menginput withdraw.");
      return;
    }

    const normalizedBib = extractBibFromPayload(rawValue);

    if (!checkpointId || !normalizedBib) {
      setStatusMessage("Checkpoint dan payload QR/BIB wajib ada.");
      return;
    }

    if (!isValidBib(normalizedBib)) {
      runHapticFeedback("rejected");
      setStatusMessage("Format QR/BIB tidak valid untuk withdraw.");
      addActivityEntry(
        createActivityEntry(normalizedBib || rawValue.trim() || "UNKNOWN", activeCheckpointLabel, "rejected", "Invalid withdraw BIB format")
      );
      return;
    }

    if (await hasLocalWithdrawalDuplicate(DEFAULT_RACE_ID, normalizedBib)) {
      runHapticFeedback("duplicate");
      setStatusMessage(`BIB ${normalizedBib} sudah pernah dicatat withdraw untuk race ini.`);
      addActivityEntry(
        createActivityEntry(normalizedBib, activeCheckpointLabel, "duplicate", "Withdraw already recorded on this device")
      );
      return;
    }

    const payload: WithdrawalSubmission = {
      clientWithdrawId: createClientId(),
      raceId: DEFAULT_RACE_ID,
      checkpointId,
      bib: normalizedBib,
      crewId: crewId.trim() || "crew-unknown",
      deviceId,
      reportedAt: new Date().toISOString(),
      capturedOffline: !isOnline,
      note: withdrawNote.trim() || null
    };

    setIsBusy(true);

    try {
      await queueWithdrawal(payload);
      await markLocalWithdrawal(DEFAULT_RACE_ID, normalizedBib);
      setBib("");
      setWithdrawNote("");
      setLastActionSummary(null);
      await refreshQueue();

      if (!isOnline) {
        runHapticFeedback("queued");
        setStatusMessage(`Withdraw BIB ${normalizedBib} disimpan offline. Antrean lokal akan disinkronkan nanti.`);
        addActivityEntry(
          createActivityEntry(
            normalizedBib,
            activeCheckpointLabel,
            "queued",
            payload.note ? `Withdraw queued: ${payload.note}` : "Withdraw saved to offline queue"
          )
        );
        return;
      }

      runHapticFeedback("queued");
      setStatusMessage(`Withdraw BIB ${normalizedBib} tersimpan di device. Sinkronisasi ke server berjalan di background.`);
      addActivityEntry(
        createActivityEntry(
          normalizedBib,
          activeCheckpointLabel,
          "queued",
          payload.note ? `Withdraw queued: ${payload.note}` : "Withdraw queued for immediate sync"
        )
      );
      void syncQueue();
    } catch {
      runHapticFeedback("rejected");
      setStatusMessage(`Withdraw BIB ${normalizedBib} gagal diproses di device. Coba ulangi sekali lagi.`);
      addActivityEntry(
        createActivityEntry(normalizedBib, activeCheckpointLabel, "rejected", "Device withdrawal processing failed")
      );
      await refreshQueue();
    } finally {
      setIsBusy(false);
    }
  }

  async function processCurrentEntry(rawValue: string) {
    if (entryMode === "withdraw") {
      await processWithdrawal(rawValue);
      return;
    }

    await processScan(rawValue);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await processCurrentEntry(bib);
  }

  function lockCheckpointSelection(nextCheckpointId: string) {
    if (!session?.user?.id) {
      return;
    }

    const nextCheckpoint = checkpoints.find((checkpoint) => checkpoint.id === nextCheckpointId) ?? null;
    setLockedCheckpointForSession(session.user.id, nextCheckpointId);
    setCheckpointId(nextCheckpointId);
    setIsCheckpointLocked(true);
    setScreen("timing");
    setEntryMode("timing");
    setCameraDismissed(false);
    setStatusMessage(
      nextCheckpoint
        ? `${formatCheckpointLabel(nextCheckpoint)} dikunci untuk shift ini. Logout lalu login ulang jika perlu ganti checkpoint.`
        : "Checkpoint dikunci untuk shift ini. Logout lalu login ulang jika perlu ganti checkpoint."
    );
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
    await processCurrentEntry(bib);
  }

  function openCameraScanner() {
    setCameraDismissed(false);
    setCameraError(null);
    setCameraHint("Arahkan QR ke area kamera.");
    setIsCameraOpen(true);
  }

  function closeCameraScanner() {
    setCameraDismissed(true);
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

  async function handleLogout() {
    if (session?.user?.id) {
      clearLockedCheckpointForSession(session.user.id);
    }

    setBib("");
    setWithdrawNote("");
    setLastActionSummary(null);
    setRecentActivity([]);
    setCheckpointId("");
    setIsCheckpointLocked(false);
    setScreen("timing");
    setEntryMode("timing");
    setIsCameraOpen(false);
    setCameraDismissed(false);

    if (supabase) {
      await supabase.auth.signOut();
    }
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
              {showSyncAction ? (
                <button
                  className="scanner-icon-button"
                  disabled={isSyncing || !isOnline || queueCount === 0}
                  onClick={() => void syncQueue()}
                  type="button"
                >
                  {syncActionLabel}
                </button>
              ) : null}
              <button
                className="scanner-icon-button"
                onClick={() => void handleLogout()}
                type="button"
              >
                Logout
              </button>
            </div>
          </div>

          <div className="scanner-app-title">
            <h1>{DEMO_EVENT_LABEL}</h1>
            <p>{selectedCheckpoint ? formatCheckpointLabel(selectedCheckpoint) : "Pilih checkpoint"}</p>
          </div>
        </header>

        {screen === "timing" ? (
          <section className="scanner-screen scanner-screen-timing">
            {operationalAlert ? (
              <div className={`scanner-alert-banner ${operationalAlert.tone}`}>
                <strong>{operationalAlert.title}</strong>
                <span>{operationalAlert.detail}</span>
              </div>
            ) : null}
            <div className="scanner-display-card">
              <div className="scanner-entry-mode-switch" role="tablist" aria-label="Scanner mode">
                <button
                  className={`scanner-entry-mode-button ${entryMode === "timing" ? "active" : ""}`}
                  disabled={!isCheckpointLocked || isBusy}
                  onClick={() => setEntryMode("timing")}
                  type="button"
                >
                  Timing
                </button>
                <button
                  className={`scanner-entry-mode-button ${entryMode === "withdraw" ? "active" : ""}`}
                  disabled={!isCheckpointLocked || isBusy}
                  onClick={() => setEntryMode("withdraw")}
                  type="button"
                >
                  Withdraw
                </button>
              </div>
              <p className="scanner-kicker">Input BIB Manual</p>
              <strong className="scanner-display-value">{bib || "0"}</strong>
              <label className="scanner-inline-field">
                <input
                  ref={inputRef}
                  disabled={!canScan || isBusy}
                  placeholder={entryMode === "withdraw" ? "Tap keypad atau ketik BIB withdraw" : "Tap keypad atau ketik BIB"}
                  value={bib}
                  onChange={(event) => setBib(normalizeBib(event.target.value))}
                />
              </label>
              {entryMode === "withdraw" ? (
                <label className="scanner-inline-field">
                  <input
                    disabled={!canScan || isBusy}
                    maxLength={280}
                    placeholder="Alasan / catatan withdraw (opsional)"
                    value={withdrawNote}
                    onChange={(event) => setWithdrawNote(event.target.value)}
                  />
                </label>
              ) : null}
            </div>

            {lastResultSummary ? (
              <div className="scanner-result-strip">
                <article className={`scanner-result-card ${lastResultSummary.tone}`}>
                  <strong>{lastResultSummary.title}</strong>
                  <span>{lastResultSummary.meta}</span>
                  <time>{lastResultSummary.time}</time>
                </article>
              </div>
            ) : null}

            {!isCameraOpen ? (
              <button
                className="scanner-scan-cta"
                disabled={!canScan || isBusy}
                onClick={openCameraScanner}
                type="button"
              >
                {entryMode === "withdraw" ? "Scan QR Withdraw" : "Scan QR"}
              </button>
            ) : null}

            {isCameraOpen ? (
              <div className="scanner-camera-sheet">
                <div className="scanner-camera-head">
                  <div>
                    <p className="scanner-kicker">Camera Scan</p>
                    <strong>Scan QR bib runner</strong>
                    <span>{entryMode === "withdraw" ? "Mode withdraw aktif" : "Mode timing aktif"}</span>
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
                {isBusy ? "..." : entryMode === "withdraw" ? "WD" : "OK"}
              </button>
            </div>

            {recentPreview.length ? (
              <section className="scanner-log-block">
                <div className="scanner-log-head">
                  <h3>Recent Logs</h3>
                  <span className="scanner-log-pill">
                    {recentPreview.length} recent
                  </span>
                </div>
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
                        {entry.status === "accepted"
                          ? "OK"
                          : entry.status === "duplicate"
                            ? "DUP"
                            : entry.status === "queued"
                              ? "Q"
                              : entry.status === "withdrawn"
                                ? "WD"
                                : "ERR"}
                      </span>
                    </article>
                  ))}
                </div>
              </section>
            ) : null}
          </section>
        ) : null}

        {screen === "checkpoint" ? (
          <section className="scanner-screen scanner-screen-checkpoint">
            <div className="panel-copy">
              <h2>Checkpoint list</h2>
              <p className="scanner-checkpoint-help">
                Pilih checkpoint sekali untuk shift scan ini. Setelah dipilih, checkpoint akan dikunci sampai logout.
              </p>
            </div>
            <div className="scanner-checkpoint-list">
              {checkpoints.map((checkpoint) => {
                const isSelected = checkpoint.id === checkpointId;
                return (
                  <button
                    className={`scanner-checkpoint-row ${isSelected ? "selected" : ""}`}
                    key={checkpoint.id}
                    onClick={() => {
                      lockCheckpointSelection(checkpoint.id);
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
              <h3>Offline queue</h3>
            </div>
            <div className="scanner-history-list">
              {queue.length || withdrawalQueue.length ? (
                <>
                  {queue.map((scan) => (
                    <article className="scanner-history-row queued" key={scan.clientScanId}>
                      <div>
                        <strong>{scan.bib}</strong>
                        <span>{scan.checkpointId}</span>
                      </div>
                      <div>
                        <strong>Queued scan</strong>
                        <time>{formatDateTime(scan.scannedAt)}</time>
                      </div>
                    </article>
                  ))}
                  {withdrawalQueue.map((withdrawal) => (
                    <article className="scanner-history-row withdrawn" key={withdrawal.clientWithdrawId}>
                      <div>
                        <strong>{withdrawal.bib}</strong>
                        <span>{withdrawal.checkpointId}</span>
                      </div>
                      <div>
                        <strong>{withdrawal.note?.trim() ? `Queued withdraw: ${withdrawal.note.trim()}` : "Queued withdraw"}</strong>
                        <time>{formatDateTime(withdrawal.reportedAt)}</time>
                      </div>
                    </article>
                  ))}
                </>
              ) : (
                <div className="placeholder-card">Belum ada item di antrean lokal.</div>
              )}
            </div>
          </section>
        ) : null}
      </section>

      <nav className="scanner-bottom-nav" aria-label="Scanner quick actions">
        <button
          className={`scanner-nav-button ${screen === "checkpoint" && !isCheckpointLocked ? "active" : ""}`}
          disabled={isCheckpointLocked}
          onClick={() => {
            if (!isCheckpointLocked) {
              setScreen("checkpoint");
            }
          }}
          type="button"
        >
          {isCheckpointLocked ? "Checkpoint locked" : "Checkpoints"}
        </button>
        <button
          className={`scanner-nav-button scanner-nav-button-primary ${screen === "timing" ? "active" : ""}`}
          disabled={!isCheckpointLocked}
          onClick={() => {
            if (isCheckpointLocked) {
              setCameraDismissed(false);
              setScreen("timing");
            }
          }}
          type="button"
        >
          Scanner
        </button>
        <button
          className={`scanner-nav-button ${screen === "history" ? "active" : ""}`}
          disabled={!isCheckpointLocked}
          onClick={() => {
            if (isCheckpointLocked) {
              setScreen("history");
            }
          }}
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
