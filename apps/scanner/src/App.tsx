import { useEffect, useMemo, useRef, useState } from "react";
import QrScanner from "qr-scanner";
import {
  authProfileSchema,
  checkpointSchema,
  defaultCheckpoints,
  formatCheckpointLabel,
  type AuthProfile,
  type Checkpoint,
  type IngestScanResponse,
  type IngestWithdrawalResponse,
  type ScanSubmission,
  type WithdrawalSubmission
} from "@arm/contracts";
import { fetchCheckpoints, loginDemoCrew, resolveApiBaseUrl, syncOffline, syncOfflineWithdrawals } from "./api";
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
import altixTimingLogo from "../android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png";
import "./styles.css";

const DEFAULT_RACE_ID = import.meta.env.VITE_RACE_ID ?? "templiers-demo-2026";
const DEMO_EVENT_LABEL = import.meta.env.VITE_EVENT_LABEL ?? "Grand Trail des Templiers Demo";
const DEMO_SESSION_STORAGE_KEY = "arm:scannerDemoSession:v1";
const SYNC_BATCH_SIZE = 25;
const AUTO_SYNC_INTERVAL_MS = 15000;
type ScannerScreen = "timing" | "checkpoint" | "history";
type ScannerEntryMode = "timing" | "withdraw";
type ScannerAlertTone = "warning" | "danger";
type WakeLockState = "idle" | "active" | "unsupported" | "released";
type ScannerSyncSummaryTone = "default" | "warning";

type CameraRepeatGuard = {
  bib: string;
  key: string;
};

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

type ScannerSessionLike = {
  access_token: string;
  user: {
    id: string;
    email?: string | null;
    app_metadata?: Record<string, unknown>;
    user_metadata?: Record<string, unknown>;
  };
};

type StoredDemoSession = {
  accessToken: string;
  assignedCheckpointId: string | null;
  checkpoints: Checkpoint[];
  eventLabel: string;
  profile: AuthProfile;
  raceId: string;
};

type QuickPrefixSlot = "primary" | "secondary";

type QuickPrefixSettings = Record<QuickPrefixSlot, string>;

const DEFAULT_QUICK_PREFIX_SETTINGS: QuickPrefixSettings = {
  primary: "M",
  secondary: "W"
};

function getStoredValue(key: string, fallback: string) {
  return window.localStorage.getItem(key) ?? fallback;
}

function createDemoSessionLike(payload: StoredDemoSession): ScannerSessionLike {
  return {
    access_token: payload.accessToken,
    user: {
      id: payload.profile.userId,
      email: payload.profile.email,
      app_metadata: {
        role: payload.profile.role,
        crew_code: payload.profile.crewCode
      },
      user_metadata: {
        full_name: payload.profile.displayName ?? undefined,
        name: payload.profile.displayName ?? undefined
      }
    }
  };
}

function toScannerSessionLike(
  session: {
    access_token: string;
    user: {
      id: string;
      email?: string | null;
      app_metadata?: unknown;
      user_metadata?: unknown;
    };
  } | null
) {
  if (!session) {
    return null;
  }

  return {
    access_token: session.access_token,
    user: {
      id: session.user.id,
      email: session.user.email ?? null,
      app_metadata: typeof session.user.app_metadata === "object" && session.user.app_metadata ? session.user.app_metadata as Record<string, unknown> : {},
      user_metadata: typeof session.user.user_metadata === "object" && session.user.user_metadata ? session.user.user_metadata as Record<string, unknown> : {}
    }
  } satisfies ScannerSessionLike;
}

function loadStoredDemoSession() {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(DEMO_SESSION_STORAGE_KEY);

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<StoredDemoSession>;
    const accessToken = typeof parsed.accessToken === "string" ? parsed.accessToken : "";
    const eventLabel = typeof parsed.eventLabel === "string" ? parsed.eventLabel : "";
    const raceId = typeof parsed.raceId === "string" ? parsed.raceId : "";
    const assignedCheckpointId = typeof parsed.assignedCheckpointId === "string" ? parsed.assignedCheckpointId : null;
    const profile = authProfileSchema.parse(parsed.profile);
    const checkpoints = Array.isArray(parsed.checkpoints) ? parsed.checkpoints.map((checkpoint) => checkpointSchema.parse(checkpoint)) : [];

    if (!accessToken || !eventLabel || !raceId || checkpoints.length === 0) {
      return null;
    }

    return {
      accessToken,
      assignedCheckpointId,
      checkpoints,
      eventLabel,
      profile,
      raceId
    } satisfies StoredDemoSession;
  } catch {
    return null;
  }
}

function persistStoredDemoSession(payload: StoredDemoSession | null) {
  if (typeof window === "undefined") {
    return;
  }

  if (!payload) {
    window.localStorage.removeItem(DEMO_SESSION_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(DEMO_SESSION_STORAGE_KEY, JSON.stringify(payload));
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

function getQuickPrefixStorageKey(userId: string) {
  return `arm:scannerQuickPrefixes:${userId}`;
}

function sanitizeQuickPrefixValue(rawValue: string) {
  return rawValue.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4);
}

function loadStoredQuickPrefixes(userId: string): QuickPrefixSettings {
  if (typeof window === "undefined") {
    return DEFAULT_QUICK_PREFIX_SETTINGS;
  }

  const raw = window.localStorage.getItem(getQuickPrefixStorageKey(userId));

  if (!raw) {
    return DEFAULT_QUICK_PREFIX_SETTINGS;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<QuickPrefixSettings>;

    return {
      primary: sanitizeQuickPrefixValue(parsed.primary ?? DEFAULT_QUICK_PREFIX_SETTINGS.primary) || DEFAULT_QUICK_PREFIX_SETTINGS.primary,
      secondary: sanitizeQuickPrefixValue(parsed.secondary ?? DEFAULT_QUICK_PREFIX_SETTINGS.secondary) || DEFAULT_QUICK_PREFIX_SETTINGS.secondary
    };
  } catch {
    return DEFAULT_QUICK_PREFIX_SETTINGS;
  }
}

function persistQuickPrefixes(userId: string, prefixes: QuickPrefixSettings) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(getQuickPrefixStorageKey(userId), JSON.stringify(prefixes));
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
    return new URL(resolveApiBaseUrl()).host;
  } catch {
    return resolveApiBaseUrl();
  }
}

function isAuthSessionError(message: string) {
  return /invalid or expired token|missing bearer token|jwt expired|unauthorized|forbidden/i.test(message);
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

type CameraScanConfirmation = {
  bib: string;
  detail: string;
  title: string;
  tone: "success" | "duplicate";
};

type ScannerSyncSummary = {
  label: string;
  detail: string;
  tone: ScannerSyncSummaryTone;
};

function chunkItems<TItem>(items: TItem[], size: number) {
  const chunked: TItem[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunked.push(items.slice(index, index + size));
  }

  return chunked;
}

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

function deriveProfileFromSession(session: ScannerSessionLike, fallbackCrewCode: string): AuthProfile {
  const appMetadata = session.user.app_metadata ?? {};
  const userMetadata = session.user.user_metadata ?? {};
  const rawRole =
    (typeof appMetadata.role === "string" ? appMetadata.role : null) ??
    (Array.isArray(appMetadata.roles) && typeof appMetadata.roles[0] === "string" ? appMetadata.roles[0] : null) ??
    "crew";
  const crewCode =
    (typeof appMetadata.crew_code === "string" ? appMetadata.crew_code : null) ??
    (typeof appMetadata.crewCode === "string" ? appMetadata.crewCode : null) ??
    fallbackCrewCode;

  return authProfileSchema.parse({
    userId: session.user.id,
    email: session.user.email ?? null,
    role: rawRole,
    crewCode,
    displayName:
      (typeof userMetadata.full_name === "string" ? userMetadata.full_name : null) ??
      (typeof userMetadata.name === "string" ? userMetadata.name : null) ??
      session.user.email ??
      fallbackCrewCode
  });
}

export default function App() {
  const [supabaseSession, setSupabaseSession] = useState<ScannerSessionLike | null>(null);
  const [demoSession, setDemoSession] = useState<StoredDemoSession | null>(() => loadStoredDemoSession());
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoginSubmitting, setIsLoginSubmitting] = useState(false);
  const [crewId, setCrewId] = useState(() => getStoredValue("arm:crewId", "crew-01"));
  const [deviceId, setDeviceId] = useState(() => getStoredValue("arm:deviceId", createClientId()));
  const [checkpointId, setCheckpointId] = useState("");
  const [bib, setBib] = useState("");
  const [quickPrefixes, setQuickPrefixes] = useState<QuickPrefixSettings>(DEFAULT_QUICK_PREFIX_SETTINGS);
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
  const [lastSyncSummary, setLastSyncSummary] = useState<ScannerSyncSummary | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [lastSyncFailedAt, setLastSyncFailedAt] = useState<string | null>(null);
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
  const [cameraConfirmation, setCameraConfirmation] = useState<CameraScanConfirmation | null>(null);
  const [batteryPercent, setBatteryPercent] = useState<number | null>(null);
  const [isCharging, setIsCharging] = useState<boolean | null>(null);
  const [wakeLockState, setWakeLockState] = useState<WakeLockState>("idle");
  const [lastActionSummary, setLastActionSummary] = useState<ScannerActionSummary | null>(null);
  const syncLockRef = useRef(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const qrScannerRef = useRef<QrScanner | null>(null);
  const cameraLockRef = useRef(false);
  const cameraRepeatGuardRef = useRef<CameraRepeatGuard | null>(null);
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null);
  const session = demoSession ? createDemoSessionLike(demoSession) : supabaseSession;
  const activeAccessToken = session?.access_token ?? null;
  const activeRaceId = demoSession?.raceId ?? DEFAULT_RACE_ID;
  const activeEventLabel = demoSession?.eventLabel ?? DEMO_EVENT_LABEL;

  const selectedCheckpoint = useMemo(
    () => checkpoints.find((checkpoint) => checkpoint.id === checkpointId) ?? null,
    [checkpointId, checkpoints]
  );
  const activeCheckpointLabel = selectedCheckpoint ? formatCheckpointLabel(selectedCheckpoint) : checkpointId;
  const effectiveProfile = useMemo(() => {
    if (demoSession) {
      return demoSession.profile;
    }

    if (profile) {
      return profile;
    }

    if (session) {
      return deriveProfileFromSession(session, crewId);
    }

    return null;
  }, [crewId, demoSession, profile, session]);
  const activeScannerUserId = effectiveProfile?.userId ?? session?.user?.id ?? null;
  const lastResultSummary = lastActionSummary;
  const canScan = Boolean(
    activeAccessToken &&
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
  const hasRecentSyncFailure = Boolean(lastSyncFailedAt && queueCount > 0);
  const showSyncAction = queueCount > 0 || isSyncing;
  const syncActionLabel = isSyncing ? `Syncing ${queueCount || ""}`.trim() : !isOnline ? `Queued ${queueCount}` : `Sync ${queueCount}`;
  const syncIndicator = isSyncing
    ? {
        label: `Syncing ${queueCount || ""}`.trim(),
        detail: "Queue lokal sedang dikirim ke server.",
        tone: "default" as const
      }
    : queueCount > 0
      ? {
          label: `${queueCount} item queued`,
          detail: hasRecentSyncFailure ? "Koneksi sempat gagal. Scanner akan retry otomatis." : "Scanner akan retry otomatis saat online.",
          tone: hasRecentSyncFailure ? ("warning" as const) : ("default" as const)
        }
      : lastSyncSummary;
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

    if (hasRecentSyncFailure) {
      return {
        tone: "warning" as const,
        title: "Sync retry in progress",
        detail: `${queueCount} item masih di queue. Scanner akan retry otomatis sampai koneksi stabil kembali.`
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
  }, [batteryPercent, hasRecentSyncFailure, isCharging, isCheckpointLocked, isOnline, queueCount, wakeLockState]);

  useEffect(() => {
    if (!supabase) {
      setIsBootstrapping(false);
      return;
    }

    void supabase.auth.getSession().then(({ data }) => {
      setSupabaseSession(toScannerSessionLike(data.session));
      setIsBootstrapping(false);
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSupabaseSession(toScannerSessionLike(nextSession));
      setIsBootstrapping(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (demoSession) {
      setProfile(demoSession.profile);
      return;
    }

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
  }, [crewId, demoSession, session]);

  useEffect(() => {
    window.localStorage.setItem("arm:crewId", crewId);
  }, [crewId]);

  useEffect(() => {
    window.localStorage.setItem("arm:deviceId", deviceId);
  }, [deviceId]);

  useEffect(() => {
    if (!activeScannerUserId) {
      setQuickPrefixes(DEFAULT_QUICK_PREFIX_SETTINGS);
      return;
    }

    setQuickPrefixes(loadStoredQuickPrefixes(activeScannerUserId));
  }, [activeScannerUserId]);

  useEffect(() => {
    if (!activeScannerUserId) {
      return;
    }

    persistQuickPrefixes(activeScannerUserId, quickPrefixes);
  }, [activeScannerUserId, quickPrefixes]);

  useEffect(() => {
    if (!demoSession) {
      return;
    }

    setStatusMessage(`Scanner siap untuk ${demoSession.eventLabel}. Login crew demo aktif.`);
  }, [demoSession]);

  useEffect(() => {
    async function bootstrap() {
      const [pendingScans, pendingWithdrawals] = await Promise.all([getQueuedScans(), getQueuedWithdrawals()]);
      const remoteCheckpoints =
        demoSession?.checkpoints && demoSession.checkpoints.length > 0 ? demoSession.checkpoints : await fetchCheckpoints();
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
      const fallbackCheckpoints =
        demoSession?.checkpoints && demoSession.checkpoints.length > 0 ? demoSession.checkpoints : [...defaultCheckpoints];
      setCheckpoints(fallbackCheckpoints);
      setCheckpointId("");
      setStatusMessage("Metadata checkpoint dari API gagal dimuat. Login ulang lalu pilih checkpoint untuk shift ini.");
      setIsBootstrapping(false);
    });
  }, [demoSession]);

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

    if (demoSession?.assignedCheckpointId && checkpoints.some((checkpoint) => checkpoint.id === demoSession.assignedCheckpointId)) {
      setLockedCheckpointForSession(session.user.id, demoSession.assignedCheckpointId);
      setCheckpointId(demoSession.assignedCheckpointId);
      setIsCheckpointLocked(true);
      setScreen("timing");
      setStatusMessage("Checkpoint tugas kamu sudah dikunci otomatis dari organizer atau kredensial crew.");
      return;
    }

    setCheckpointId("");
    setIsCheckpointLocked(false);
    setScreen("checkpoint");
    setStatusMessage("Pilih checkpoint sekali setelah login. Untuk mengganti checkpoint, logout lalu login lagi.");
  }, [checkpoints, demoSession?.assignedCheckpointId, isBootstrapping, session?.user?.id]);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setStatusMessage("Koneksi kembali. Scanner akan sinkron otomatis dari queue lokal.");
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
    if (!activeAccessToken || !isOnline || isBootstrapping || queueCount === 0) {
      return;
    }

    void syncQueue();
    const intervalId = window.setInterval(() => void syncQueue(), AUTO_SYNC_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [activeAccessToken, isBootstrapping, isOnline, queueCount]);

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
    if (!activeAccessToken || !isCheckpointLocked) {
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
  }, [activeAccessToken, isCheckpointLocked]);

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

            const payload = typeof result === "string" ? result : result.data;
            const scannedBib = extractBibFromPayload(payload);
            const scanKey = [entryMode, checkpointId || "no-checkpoint", scannedBib || normalizeBib(payload)].join(":");
            const repeatGuard = cameraRepeatGuardRef.current;

            if (repeatGuard?.key === scanKey) {
              setCameraHint(`BIB ${repeatGuard.bib} sudah terbaca. Arahkan ke QR berikutnya.`);
              return;
            }

            cameraRepeatGuardRef.current = {
              bib: scannedBib || "QR ini",
              key: scanKey
            };
            cameraLockRef.current = true;
            setIsCameraBusy(true);
            setCameraHint("QR terdeteksi. Memproses scan...");

            try {
              const isKnownDeviceDuplicate =
                Boolean(scannedBib && checkpointId && isValidBib(scannedBib)) &&
                (entryMode === "withdraw"
                  ? await hasLocalWithdrawalDuplicate(activeRaceId, scannedBib)
                  : await hasLocalDuplicate(checkpointId, scannedBib));

              await processCurrentEntry(payload);
              setIsCameraOpen(false);
              setCameraDismissed(true);

              if (scannedBib && isValidBib(scannedBib)) {
                setCameraConfirmation({
                  bib: scannedBib,
                  detail: isKnownDeviceDuplicate
                    ? "BIB ini sudah pernah tercatat di device ini. Tap OK setelah QR diarahkan ke runner berikutnya."
                    : entryMode === "withdraw"
                      ? "Withdraw tersimpan di device dan akan sinkron otomatis. Tap OK untuk scan berikutnya."
                      : "Scan tersimpan di device dan akan sinkron otomatis. Tap OK untuk scan berikutnya.",
                  title: isKnownDeviceDuplicate
                    ? `BIB ${scannedBib} sudah tercatat`
                    : entryMode === "withdraw"
                      ? `Withdraw ${scannedBib} tersimpan`
                      : `BIB ${scannedBib} berhasil discan`,
                  tone: isKnownDeviceDuplicate ? "duplicate" : "success"
                });
              }
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
    if (!activeAccessToken || syncLockRef.current || !window.navigator.onLine) {
      return;
    }

    syncLockRef.current = true;
    setIsSyncing(true);
    let shouldRetryLater = false;
    const syncStartedAt = new Date().toISOString();
    const [pendingScans, pendingWithdrawals] = await Promise.all([getQueuedScans(), getQueuedWithdrawals()]);

    if (pendingScans.length === 0 && pendingWithdrawals.length === 0) {
      syncLockRef.current = false;
      setIsSyncing(false);
      setLastSyncAt(syncStartedAt);
      setLastSyncFailedAt(null);
      setLastSyncSummary({
        label: "Queue clear",
        detail: "Tidak ada item lokal yang perlu dikirim.",
        tone: "default"
      });
      return;
    }

    setStatusMessage(`Menyinkronkan ${pendingScans.length + pendingWithdrawals.length} item lokal...`);

    try {
      let acceptedScans = 0;
      let duplicateScans = 0;
      let recordedWithdrawals = 0;
      let duplicateWithdrawals = 0;
      let lastSummary: ScannerActionSummary | null = null;

      if (pendingScans.length > 0) {
        for (const scanBatch of chunkItems(pendingScans, SYNC_BATCH_SIZE)) {
          const scanResult = await syncOffline(scanBatch, activeAccessToken);

          for (const pendingScan of scanBatch) {
            await removeQueuedScan(pendingScan.clientScanId);
          }

          acceptedScans += scanResult.accepted;
          duplicateScans += scanResult.duplicates;
          lastSummary = scanResult.results.length ? createScanActionSummary(scanResult.results[scanResult.results.length - 1]) : lastSummary;
          addResultActivities(scanResult.results);
        }
      }

      if (pendingWithdrawals.length > 0) {
        for (const withdrawalBatch of chunkItems(pendingWithdrawals, SYNC_BATCH_SIZE)) {
          const withdrawalResult = await syncOfflineWithdrawals(withdrawalBatch, activeAccessToken);

          for (const pendingWithdrawal of withdrawalBatch) {
            await removeQueuedWithdrawal(pendingWithdrawal.clientWithdrawId);
          }

          recordedWithdrawals += withdrawalResult.recorded;
          duplicateWithdrawals += withdrawalResult.duplicates;
          lastSummary =
            withdrawalResult.results.length
              ? createWithdrawalActionSummary(withdrawalResult.results[withdrawalResult.results.length - 1])
              : lastSummary;
          addWithdrawalActivities(withdrawalResult.results);
        }
      }

      setLastActionSummary(lastSummary);
      setLastSyncAt(syncStartedAt);
      setLastSyncFailedAt(null);
      setLastSyncSummary({
        label: "Sync completed",
        detail: `${acceptedScans} scan baru, ${duplicateScans} duplikat, ${recordedWithdrawals} withdraw, ${duplicateWithdrawals} duplicate withdraw.`,
        tone: "default"
      });
      setStatusMessage(
        `Sync selesai. ${acceptedScans} scan baru, ${duplicateScans} duplikat, ${recordedWithdrawals} withdraw, ${duplicateWithdrawals} duplicate withdraw.`
      );
      await refreshQueue();
    } catch (error) {
      const detail =
        error instanceof Error && error.message.trim()
          ? error.message.trim()
          : "Queue lokal tetap disimpan sampai koneksi stabil kembali.";

      if (isAuthSessionError(detail)) {
        const reloginMessage = "Session scanner expired. Queue lokal tetap aman. Login ulang untuk melanjutkan sync.";

        setLastSyncFailedAt(syncStartedAt);
        setLastSyncSummary({
          label: "Login ulang dibutuhkan",
          detail: reloginMessage,
          tone: "warning"
        });
        setStatusMessage(reloginMessage);
        setLoginError(reloginMessage);
        setDemoSession(null);
        setSupabaseSession(null);
        persistStoredDemoSession(null);
        setProfile(null);
        setCheckpointId("");
        setIsCheckpointLocked(false);
        setScreen("timing");
        await refreshQueue();
        return;
      }

      shouldRetryLater = true;
      setLastSyncFailedAt(syncStartedAt);
      setLastSyncSummary({
        label: "Sync tertunda",
        detail,
        tone: "warning"
      });
      setStatusMessage(`Sync offline gagal. ${detail}`);
      await refreshQueue();
    } finally {
      syncLockRef.current = false;
      setIsSyncing(false);

      if (shouldRetryLater && window.navigator.onLine) {
        const [nextPendingScans, nextPendingWithdrawals] = await Promise.all([getQueuedScans(), getQueuedWithdrawals()]);

        if (nextPendingScans.length > 0 || nextPendingWithdrawals.length > 0) {
          window.setTimeout(() => void syncQueue(), AUTO_SYNC_INTERVAL_MS);
        }
      }
    }
  }

  async function processScan(rawValue: string) {
    if (!canScan || !activeAccessToken) {
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
      raceId: activeRaceId,
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
    if (!canScan || !activeAccessToken) {
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

    if (await hasLocalWithdrawalDuplicate(activeRaceId, normalizedBib)) {
      runHapticFeedback("duplicate");
      setStatusMessage(`BIB ${normalizedBib} sudah pernah dicatat withdraw untuk race ini.`);
      addActivityEntry(
        createActivityEntry(normalizedBib, activeCheckpointLabel, "duplicate", "Withdraw already recorded on this device")
      );
      return;
    }

    const payload: WithdrawalSubmission = {
      clientWithdrawId: createClientId(),
      raceId: activeRaceId,
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
      await markLocalWithdrawal(activeRaceId, normalizedBib);
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

  function updateQuickPrefix(slot: QuickPrefixSlot, nextValue: string) {
    setQuickPrefixes((current) => ({
      ...current,
      [slot]: sanitizeQuickPrefixValue(nextValue)
    }));
  }

  function appendConfiguredPrefix(slot: QuickPrefixSlot) {
    const prefix = quickPrefixes[slot];

    if (!prefix) {
      return;
    }

    setBib((current) => {
      const normalizedCurrent = normalizeBib(current);

      if (!normalizedCurrent) {
        return prefix;
      }

      if (/^[0-9-]+$/.test(normalizedCurrent)) {
        return `${prefix}${normalizedCurrent}`;
      }

      return `${normalizedCurrent}${prefix}`;
    });
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
    cameraRepeatGuardRef.current = null;
    setCameraConfirmation(null);
    setCameraDismissed(false);
    setCameraError(null);
    setCameraHint("Arahkan QR ke area kamera.");
    setIsCameraOpen(true);
  }

  function closeCameraScanner() {
    cameraRepeatGuardRef.current = null;
    setCameraConfirmation(null);
    setCameraDismissed(true);
    setIsCameraOpen(false);
  }

  function confirmCameraScan() {
    setCameraConfirmation(null);
    setCameraDismissed(false);
    setCameraError(null);
    setCameraHint("Arahkan QR ke area kamera berikutnya.");
    setIsCameraOpen(true);
  }

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const identifier = loginEmail.trim();
    const password = loginPassword;

    if (!identifier || !password) {
      setLoginError("Username/email dan password wajib diisi.");
      return;
    }

    setLoginError(null);
    setIsLoginSubmitting(true);
    let supabaseErrorMessage: string | null = null;

    try {
      if (supabase && identifier.includes("@")) {
        const { error } = await supabase.auth.signInWithPassword({
          email: identifier,
          password
        });

        if (!error) {
          setDemoSession(null);
          persistStoredDemoSession(null);
          return;
        }

        supabaseErrorMessage = error.message;
      }

      const result = await loginDemoCrew(identifier, password);
      const nextDemoSession: StoredDemoSession = {
        accessToken: result.accessToken,
        assignedCheckpointId: result.assignedCheckpointId,
        checkpoints: result.checkpoints,
        eventLabel: result.eventLabel,
        profile: result.profile,
        raceId: result.raceId
      };

      setDemoSession(nextDemoSession);
      persistStoredDemoSession(nextDemoSession);
      setCrewId(result.profile.crewCode ?? result.profile.userId);
      setStatusMessage(`Scanner siap untuk ${result.eventLabel}. Login crew demo aktif.`);
      setLoginPassword("");
    } catch (error) {
      setLoginError(supabaseErrorMessage ?? (error instanceof Error ? error.message : "Login scanner gagal."));
    } finally {
      setIsLoginSubmitting(false);
    }
  }

  async function handleLogout() {
    if (session?.user?.id) {
      clearLockedCheckpointForSession(session.user.id);
    }

    setBib("");
    setWithdrawNote("");
    setLastActionSummary(null);
    setRecentActivity([]);
    cameraRepeatGuardRef.current = null;
    setCameraConfirmation(null);
    setCheckpointId("");
    setIsCheckpointLocked(false);
    setScreen("timing");
    setEntryMode("timing");
    setIsCameraOpen(false);
    setCameraDismissed(false);
    setDemoSession(null);
    setSupabaseSession(null);
    persistStoredDemoSession(null);
    setProfile(null);

    if (supabase) {
      await supabase.auth.signOut();
    }
  }

  if (!session) {
    return (
      <main className="scanner-shell">
        <section className="scanner-panel auth-panel">
          <div className="scanner-login-brand">
            <img src={altixTimingLogo} alt="Altix Timing" />
          </div>
          <div className="panel-copy auth-copy">
            <div>
              <p className="scanner-kicker">Crew Login</p>
              <h1>Masuk ke Scanner</h1>
            </div>
          </div>
          <form className="scanner-form" onSubmit={handleLogin}>
            <label>
              Email atau username
              <input disabled={isLoginSubmitting} value={loginEmail} onChange={(event) => setLoginEmail(event.target.value)} />
            </label>
            <label>
              Password
              <input
                disabled={isLoginSubmitting}
                type="password"
                value={loginPassword}
                onChange={(event) => setLoginPassword(event.target.value)}
              />
            </label>
            <button className="submit-button scanner-login-button" disabled={isLoginSubmitting} type="submit">
              {isLoginSubmitting ? (
                <>
                  <span className="scanner-login-spinner" aria-hidden="true" />
                  Menghubungkan...
                </>
              ) : (
                "Login"
              )}
            </button>
            {isLoginSubmitting ? (
              <div className="scanner-login-progress" role="status">
                <span className="scanner-login-spinner" aria-hidden="true" />
                <div>
                  <strong>Login sedang diproses</strong>
                  <span>Mengambil sesi crew dan checkpoint terbaru dari server.</span>
                </div>
              </div>
            ) : null}
            {!supabase ? (
              <div className="placeholder-card">
                Mode demo aktif. Gunakan username/password crew dari organizer. Kredensial seperti <strong>crew1cp2@event.com</strong> juga bisa
                mengunci checkpoint otomatis bila assignment eksplisit belum diisi.
              </div>
            ) : null}
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
            <div className="scanner-header-status">
              <div className={`scanner-connection-pill ${isOnline ? "online" : "offline"}`}>
                <span className="status-dot" />
                {isOnline ? "Live" : "Offline"}
              </div>
              {syncIndicator ? (
                <div className={`scanner-sync-pill ${syncIndicator.tone === "warning" ? "warning" : ""}`}>
                  <span className="status-dot" />
                  {syncIndicator.label}
                </div>
              ) : null}
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
            <h1>{activeEventLabel}</h1>
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
            {lastSyncSummary ? (
              <div className={`scanner-sync-summary ${lastSyncSummary.tone === "warning" ? "warning" : ""}`}>
                <strong>{lastSyncSummary.label}</strong>
                <span>{lastSyncSummary.detail}</span>
                <time>{formatDateTime((lastSyncSummary.tone === "warning" ? lastSyncFailedAt : lastSyncAt) ?? new Date().toISOString())}</time>
              </div>
            ) : null}
            <div className="scanner-display-card scanner-mode-card">
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
            </div>

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

            <div className="scanner-display-card scanner-manual-card">
              <div className="scanner-manual-copy">
                <p className="scanner-kicker">Input BIB Manual</p>
                <strong className="scanner-display-value">{bib || "0"}</strong>
              </div>
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
              <div className="scanner-prefix-config">
                <div className="scanner-prefix-config-head">
                  <p className="scanner-kicker">Quick Prefix</p>
                  <span>Crew bisa ubah huruf prefix sesuai format BIB checkpoint ini.</span>
                </div>
                <div className="scanner-prefix-editors">
                  <label className="scanner-prefix-editor">
                    <span>Prefix 1</span>
                    <input
                      disabled={isBusy}
                      inputMode="text"
                      maxLength={4}
                      onChange={(event) => updateQuickPrefix("primary", event.target.value)}
                      placeholder="M"
                      value={quickPrefixes.primary}
                    />
                  </label>
                  <label className="scanner-prefix-editor">
                    <span>Prefix 2</span>
                    <input
                      disabled={isBusy}
                      inputMode="text"
                      maxLength={4}
                      onChange={(event) => updateQuickPrefix("secondary", event.target.value)}
                      placeholder="W"
                      value={quickPrefixes.secondary}
                    />
                  </label>
                </div>
              </div>
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

            <form className="scanner-hidden-submit" onSubmit={handleSubmit}>
              <button type="submit" />
            </form>

            <div className="scanner-prefix-row">
              <button
                className="scanner-prefix-chip"
                disabled={!canScan || isBusy || !quickPrefixes.primary}
                onClick={() => appendConfiguredPrefix("primary")}
                type="button"
              >
                {quickPrefixes.primary || "Set"}
              </button>
              <button
                className="scanner-prefix-chip"
                disabled={!canScan || isBusy || !quickPrefixes.secondary}
                onClick={() => appendConfiguredPrefix("secondary")}
                type="button"
              >
                {quickPrefixes.secondary || "Set"}
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

            {lastSyncSummary ? (
              <div className={`scanner-sync-summary ${lastSyncSummary.tone === "warning" ? "warning" : ""}`}>
                <strong>{lastSyncSummary.label}</strong>
                <span>{lastSyncSummary.detail}</span>
                <time>{formatDateTime((lastSyncSummary.tone === "warning" ? lastSyncFailedAt : lastSyncAt) ?? new Date().toISOString())}</time>
              </div>
            ) : null}

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

      {cameraConfirmation ? (
        <div className="scanner-modal-backdrop">
          <section
            aria-labelledby="scanner-confirmation-title"
            aria-modal="true"
            className={`scanner-confirmation-card ${cameraConfirmation.tone}`}
            role="dialog"
          >
            <div className="scanner-confirmation-icon" aria-hidden="true">
              {cameraConfirmation.tone === "duplicate" ? "DUP" : "OK"}
            </div>
            <p className="scanner-kicker">QR Processed</p>
            <h2 id="scanner-confirmation-title">{cameraConfirmation.title}</h2>
            <strong>{cameraConfirmation.bib}</strong>
            <p>{cameraConfirmation.detail}</p>
            <button autoFocus className="submit-button scanner-confirmation-action" onClick={confirmCameraScan} type="button">
              OK, scan berikutnya
            </button>
          </section>
        </div>
      ) : null}

      <footer className="runtime-footer">
        <span>Build {__APP_BUILD__}</span>
        <span>Built {new Date(__APP_BUILT_AT__).toLocaleString()}</span>
        <span>API {apiHost}</span>
      </footer>
    </main>
  );
}
