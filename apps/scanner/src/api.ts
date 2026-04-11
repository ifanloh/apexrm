import {
  authProfileSchema,
  checkpointSchema,
  ingestScanResponseSchema,
  ingestWithdrawalResponseSchema,
  type AuthProfile,
  type Checkpoint,
  type ScanSubmission,
  type WithdrawalSubmission
} from "@arm/contracts";

const DEFAULT_DEV_API_BASE_URL = "http://localhost:4000/api";
const DEFAULT_PROD_API_BASE_URL = "https://apexrm-api.vercel.app/api";

export function resolveApiBaseUrl() {
  return (import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.DEV ? DEFAULT_DEV_API_BASE_URL : DEFAULT_PROD_API_BASE_URL)).replace(/\/+$/, "");
}

const API_BASE_URL = resolveApiBaseUrl();

export type ScannerPilotLoginResponse = {
  accessToken: string;
  assignedCheckpointId: string | null;
  checkpoints: Checkpoint[];
  eventLabel: string;
  profile: AuthProfile;
  raceId: string;
};

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function createHeaders(accessToken?: string) {
  return {
    "Content-Type": "application/json",
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
  };
}

async function toErrorMessage(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const payload = (await response.json().catch(() => null)) as { message?: string; detail?: string } | null;
    return payload?.detail ?? payload?.message ?? `HTTP ${response.status}`;
  }

  const text = await response.text().catch(() => "");
  return text || `HTTP ${response.status}`;
}

async function requestJson<T>(
  path: string,
  options?: {
    method?: "GET" | "POST";
    accessToken?: string;
    body?: unknown;
    retries?: number;
    timeoutMs?: number;
  }
) {
  const retries = options?.retries ?? (options?.method === "GET" || !options?.method ? 1 : 0);
  const timeoutMs = options?.timeoutMs ?? 12000;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${API_BASE_URL}${path}`, {
        method: options?.method ?? "GET",
        body: options?.body ? JSON.stringify(options.body) : undefined,
        cache: "no-store",
        headers: createHeaders(options?.accessToken),
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(await toErrorMessage(response));
      }

      return (await response.json()) as T;
    } catch (error) {
      if (attempt >= retries) {
        if (error instanceof Error && error.name === "AbortError") {
          throw new Error("Permintaan ke server timeout. Coba lagi.");
        }

        throw error instanceof Error ? error : new Error("Permintaan ke server gagal.");
      }
    } finally {
      window.clearTimeout(timeoutId);
    }

    await sleep(450 * (attempt + 1));
  }

  throw new Error("Permintaan ke server gagal.");
}

export async function fetchCheckpoints(): Promise<Checkpoint[]> {
  const payload = await requestJson<{
    items: Array<{
      id: string;
      code: string;
      name: string;
      kmMarker: number | string;
      order: number | string;
    }>;
  }>("/meta/checkpoints", {
    method: "GET",
    retries: 1,
    timeoutMs: 10000
  });

  return payload.items.map((item) =>
    checkpointSchema.parse({
      ...item,
      kmMarker: Number(item.kmMarker),
      order: Number(item.order)
    })
  );
}

export async function loginPilotCrew(username: string, password: string): Promise<ScannerPilotLoginResponse> {
  const payload = await requestJson<{
    accessToken: string;
    assignedCheckpointId: string | null;
    checkpoints: Array<{
      id: string;
      code: string;
      name: string;
      kmMarker: number | string;
      order: number | string;
    }>;
    eventLabel: string;
    profile: unknown;
    raceId: string;
  }>("/scanner/pilot-login", {
    method: "POST",
    body: {
      username,
      password
    },
    retries: 0,
    timeoutMs: 25000
  });

  return {
    accessToken: payload.accessToken,
    assignedCheckpointId: payload.assignedCheckpointId,
    checkpoints: payload.checkpoints.map((item) =>
      checkpointSchema.parse({
        ...item,
        kmMarker: Number(item.kmMarker),
        order: Number(item.order)
      })
    ),
    eventLabel: payload.eventLabel,
    profile: authProfileSchema.parse(payload.profile),
    raceId: payload.raceId
  };
}

export async function sendScan(scan: ScanSubmission, accessToken: string) {
  const payload = await requestJson<unknown>("/scan", {
    method: "POST",
    accessToken,
    body: scan,
    retries: 0,
    timeoutMs: 15000
  });

  return ingestScanResponseSchema.parse(payload);
}

export async function syncOffline(scans: ScanSubmission[], accessToken: string) {
  return requestJson<{
    total: number;
    accepted: number;
    duplicates: number;
    results: ReturnType<typeof ingestScanResponseSchema.parse>[];
  }>("/sync-offline", {
    method: "POST",
    accessToken,
    body: { scans },
    retries: 1,
    timeoutMs: 25000
  });
}

export async function sendWithdrawal(withdrawal: WithdrawalSubmission, accessToken: string) {
  const payload = await requestJson<unknown>("/withdraw", {
    method: "POST",
    accessToken,
    body: withdrawal,
    retries: 0,
    timeoutMs: 15000
  });

  return ingestWithdrawalResponseSchema.parse(payload);
}

export async function syncOfflineWithdrawals(withdrawals: WithdrawalSubmission[], accessToken: string) {
  return requestJson<{
    total: number;
    recorded: number;
    duplicates: number;
    results: ReturnType<typeof ingestWithdrawalResponseSchema.parse>[];
  }>("/sync-withdrawals", {
    method: "POST",
    accessToken,
    body: { withdrawals },
    retries: 1,
    timeoutMs: 25000
  });
}
