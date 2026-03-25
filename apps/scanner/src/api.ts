import {
  authProfileSchema,
  ingestScanResponseSchema,
  type AuthProfile,
  type Checkpoint,
  type ScanSubmission
} from "@arm/contracts";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api").replace(/\/+$/, "");

function createHeaders(accessToken?: string) {
  return {
    "Content-Type": "application/json",
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
  };
}

export async function fetchCheckpoints(): Promise<Checkpoint[]> {
  const response = await fetch(`${API_BASE_URL}/meta/checkpoints`);

  if (!response.ok) {
    throw new Error("Failed to fetch checkpoints");
  }

  const payload = (await response.json()) as { items: Checkpoint[] };
  return payload.items;
}

export async function fetchAuthProfile(accessToken: string): Promise<AuthProfile> {
  const response = await fetch(`${API_BASE_URL}/me`, {
    headers: createHeaders(accessToken)
  });

  if (!response.ok) {
    throw new Error("Failed to fetch auth profile");
  }

  return authProfileSchema.parse(await response.json());
}

export async function sendScan(scan: ScanSubmission, accessToken: string) {
  const response = await fetch(`${API_BASE_URL}/scan`, {
    method: "POST",
    headers: createHeaders(accessToken),
    body: JSON.stringify(scan)
  });

  if (!response.ok) {
    throw new Error("Failed to submit scan");
  }

  return ingestScanResponseSchema.parse(await response.json());
}

export async function syncOffline(scans: ScanSubmission[], accessToken: string) {
  const response = await fetch(`${API_BASE_URL}/sync-offline`, {
    method: "POST",
    headers: createHeaders(accessToken),
    body: JSON.stringify({ scans })
  });

  if (!response.ok) {
    throw new Error("Failed to sync offline scans");
  }

  return (await response.json()) as {
    total: number;
    accepted: number;
    duplicates: number;
    results: ReturnType<typeof ingestScanResponseSchema.parse>[];
  };
}
