import {
  type CheckpointLeaderboard,
  type DuplicateScan,
  type NotificationEvent,
  type OverallLeaderboard,
  runnerDetailSchema,
  runnerSearchResponseSchema,
  type RunnerDetail,
  type RunnerSearchEntry
} from "@arm/contracts";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api").replace(/\/+$/, "");

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function createHeaders(accessToken: string) {
  return {
    Authorization: `Bearer ${accessToken}`
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
  accessToken: string,
  options?: {
    retries?: number;
    timeoutMs?: number;
  }
) {
  const retries = options?.retries ?? 1;
  const timeoutMs = options?.timeoutMs ?? 12000;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${API_BASE_URL}${path}`, {
        cache: "no-store",
        headers: createHeaders(accessToken),
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(await toErrorMessage(response));
      }

      return (await response.json()) as T;
    } catch (error) {
      if (attempt >= retries) {
        if (error instanceof Error && error.name === "AbortError") {
          throw new Error("Permintaan ke server timeout. Coba refresh lagi.");
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

export async function fetchDashboardSnapshot(accessToken: string) {
  const [overallLeaderboard, leaderboardPayload, duplicatePayload, notificationPayload] = await Promise.all([
    fetchOverallLeaderboard(accessToken),
    requestJson<{ items: CheckpointLeaderboard[] }>("/leaderboard/live", accessToken),
    requestJson<{ items: DuplicateScan[] }>("/audit/duplicates", accessToken),
    requestJson<{ items: NotificationEvent[] }>("/notifications", accessToken)
  ]);

  return {
    updatedAt: new Date().toISOString(),
    overallLeaderboard,
    checkpointLeaderboards: leaderboardPayload.items,
    leaderboards: leaderboardPayload.items,
    duplicates: duplicatePayload.items,
    notifications: notificationPayload.items
  };
}

export async function fetchCheckpointLeaderboard(checkpointId: string, accessToken: string) {
  return requestJson<CheckpointLeaderboard>(`/leaderboard/live/${checkpointId}`, accessToken, {
    retries: 0,
    timeoutMs: 18000
  });
}

export async function fetchOverallLeaderboard(accessToken: string, category?: string) {
  const query = new URLSearchParams();

  if (category) {
    query.set("category", category);
  }

  const suffix = query.toString() ? `?${query.toString()}` : "";
  return requestJson<OverallLeaderboard>(`/leaderboard/overall${suffix}`, accessToken, {
    retries: 1,
    timeoutMs: 15000
  });
}

export async function fetchRunnerSearch(
  input: {
    query: string;
    checkpointId: string;
  },
  accessToken: string
): Promise<RunnerSearchEntry[]> {
  const query = new URLSearchParams();

  if (input.query.trim()) {
    query.set("q", input.query.trim());
  }

  if (input.checkpointId && input.checkpointId !== "all") {
    query.set("checkpointId", input.checkpointId);
  }

  const payload = await requestJson<unknown>(`/runners/search?${query.toString()}`, accessToken, {
    retries: 1,
    timeoutMs: 12000
  });

  return runnerSearchResponseSchema.parse(payload).items;
}

export async function fetchRunnerDetail(bib: string, accessToken: string): Promise<RunnerDetail> {
  const query = new URLSearchParams({
    bib
  });

  const payload = await requestJson<unknown>(`/runners/detail?${query.toString()}`, accessToken, {
    retries: 1,
    timeoutMs: 12000
  });

  return runnerDetailSchema.parse(payload);
}
