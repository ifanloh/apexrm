import {
  authProfileSchema,
  type AuthProfile,
  type CheckpointLeaderboard,
  type DuplicateScan,
  type NotificationEvent
} from "@arm/contracts";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api").replace(/\/+$/, "");

function createHeaders(accessToken: string) {
  return {
    Authorization: `Bearer ${accessToken}`
  };
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

export async function fetchDashboardSnapshot(accessToken: string) {
  const [leaderboardResponse, duplicateResponse, notificationResponse] = await Promise.all([
    fetch(`${API_BASE_URL}/leaderboard/live`, {
      headers: createHeaders(accessToken)
    }),
    fetch(`${API_BASE_URL}/audit/duplicates`, {
      headers: createHeaders(accessToken)
    }),
    fetch(`${API_BASE_URL}/notifications`, {
      headers: createHeaders(accessToken)
    })
  ]);

  if (!leaderboardResponse.ok || !duplicateResponse.ok || !notificationResponse.ok) {
    throw new Error("Failed to fetch dashboard data");
  }

  const leaderboardPayload = (await leaderboardResponse.json()) as { items: CheckpointLeaderboard[] };
  const duplicatePayload = (await duplicateResponse.json()) as { items: DuplicateScan[] };
  const notificationPayload = (await notificationResponse.json()) as { items: NotificationEvent[] };

  return {
    leaderboards: leaderboardPayload.items,
    duplicates: duplicatePayload.items,
    notifications: notificationPayload.items
  };
}

export function createEventsUrl(accessToken: string) {
  const url = new URL(`${API_BASE_URL}/events`, window.location.origin);
  url.searchParams.set("access_token", accessToken);
  return url.toString();
}
