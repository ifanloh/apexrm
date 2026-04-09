import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/supabase";
import type { DemoCourse } from "@/demoCourseVariants";

export type EventStatus = "draft" | "upcoming" | "live" | "finished" | "archived";
export type RaceStatus = "draft" | "upcoming" | "live" | "finished";
export type ParticipantStatus = "registered" | "checked_in" | "finished" | "dnf";

export interface User {
  id: number;
  username: string;
  name: string;
  role: string;
  workspaceOwnerId: string;
  isLocalAuth?: boolean;
}

export interface Event {
  id: number;
  name: string;
  location: string;
  description?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  logoUrl?: string | null;
  bannerUrl?: string | null;
  status: EventStatus;
  organizerId: number;
  createdAt: string;
  updatedAt: string;
}

export interface Race {
  id: number;
  eventId: number;
  name: string;
  distance?: number | null;
  elevationGain?: number | null;
  descentM?: number | null;
  maxParticipants?: number | null;
  cutoffTime?: string | null;
  gpxFileName?: string | null;
  gpxData?: string | null;
  waypoints?: DemoCourse["waypoints"];
  profilePoints?: DemoCourse["profilePoints"];
  status: RaceStatus;
  participantCount: number;
  checkpointCount: number;
  crewCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Checkpoint {
  id: number;
  raceId: number;
  name: string;
  orderIndex: number;
  distanceFromStart?: number | null;
  isStartLine: boolean;
  isFinishLine: boolean;
  assignedCrewId?: number | null;
  createdAt: string;
}

export interface Participant {
  id: number;
  raceId: number;
  bibNumber?: string | null;
  fullName: string;
  email: string;
  phone?: string | null;
  gender?: string | null;
  countryCode?: string | null;
  ageCategory?: string | null;
  emergencyContact?: string | null;
  status: ParticipantStatus;
  createdAt: string;
}

export interface ScannerCrewMember {
  id: number;
  eventId: number;
  name: string;
  username: string;
  password?: string | null;
  assignedCheckpointId?: number | null;
  createdAt: string;
}

export interface EventCheckpointOption {
  id: number;
  raceId: number;
  raceName: string;
  name: string;
  orderIndex: number;
  distanceFromStart?: number | null;
  isStartLine: boolean;
  isFinishLine: boolean;
}

export interface ScanEvent {
  id: number | string;
  participantId: number;
  participantName: string;
  bibNumber?: string | null;
  checkpointId: number;
  checkpointName: string;
  scannedAt: string;
  isDuplicate: boolean;
  raceId: number;
}

export interface ReadinessCheck {
  label: string;
  passed: boolean;
  detail?: string | null;
}

export interface EventSummary {
  eventId: number;
  eventStatus: string;
  totalRaces: number;
  publishedRaces: number;
  liveRaces: number;
  totalParticipants: number;
  totalScannerCrew: number;
  readinessChecks: ReadinessCheck[];
}

export interface RaceDayStatus {
  raceId: number;
  raceName: string;
  raceStatus: string;
  startedAt?: string | null;
  totalParticipants: number;
  scannedIn: number;
  finished: number;
  dnf: number;
  checkpoints: Array<{
    checkpointId: number;
    name: string;
    orderIndex: number;
    isStartLine: boolean;
    isFinishLine: boolean;
    assignedCrew: string | null;
    scanCount: number;
    lastScanAt: string | null;
  }>;
}

type Store = {
  user: User;
  events: Event[];
  races: Race[];
  checkpoints: Checkpoint[];
  participants: Participant[];
  crew: ScannerCrewMember[];
  scans: ScanEvent[];
  nextIds: Record<"event" | "race" | "checkpoint" | "participant" | "crew" | "scan", number>;
};

type PersistedStore = Omit<Store, "user">;

type PrototypeContextValue = {
  store: Store;
  setStore: React.Dispatch<React.SetStateAction<Store>>;
  logout: () => void;
  isStoreLoading: boolean;
  markRemoteStoreSaved: (store: Store) => void;
};

type QueryOptions = {
  query?: {
    enabled?: boolean;
    retry?: boolean;
    queryKey?: unknown[];
    refetchInterval?: number;
  };
};

type MutationCallbacks<TData> = {
  onSuccess?: (data: TData) => void;
  onError?: (error: Error) => void;
};

type OrganizerRequestOptions = {
  retries?: number;
  timeoutMs?: number;
};

const STORAGE_KEY = "trailnesia:organizer-prototype:v1";
const PrototypeContext = createContext<PrototypeContextValue | null>(null);
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api").replace(/\/+$/, "");

export type OrganizerLiveRaceOps = {
  raceId: number;
  raceName: string;
  raceStatus: string;
  totalParticipants: number;
  scannedIn: number;
  finished: number;
  dnf: number;
  checkpoints: Array<{
    checkpointId: number;
    name: string;
    orderIndex: number;
    isStartLine: boolean;
    isFinishLine: boolean;
    assignedCrew: string | null;
    scanCount: number;
    lastScanAt: string | null;
  }>;
  recentScans: ScanEvent[];
  source?: "server" | "client";
};

type OrganizerRecentPassing = {
  bib: string;
  checkpointId: string;
  checkpointName?: string | null;
  crewId?: string | null;
  name?: string | null;
  scannedAt: string;
};

const ORGANIZER_DEMO_CHECKPOINT_IDS = ["cp-start", "cp-10", "cp-21", "cp-30", "cp-40", "finish"] as const;

function nowIso() {
  return new Date().toISOString();
}

function eventStatusFor(races: Race[], archived = false): EventStatus {
  if (archived) return "archived";
  if (races.some((race) => race.status === "live")) return "live";
  if (races.some((race) => race.status === "upcoming")) return "upcoming";
  if (races.length > 0 && races.every((race) => race.status === "finished")) return "finished";
  return "draft";
}

function hydrate(store: Store): Store {
  const races = store.races.map((race) => ({
    ...race,
    participantCount: store.participants.filter((participant) => participant.raceId === race.id).length,
    checkpointCount: store.checkpoints.filter((checkpoint) => checkpoint.raceId === race.id).length,
    crewCount: store.crew.filter((member) => member.eventId === race.eventId).length
  }));
  const events = store.events.map((event) => ({
    ...event,
    status: eventStatusFor(races.filter((race) => race.eventId === event.id), event.status === "archived")
  }));
  return { ...store, events, races };
}

function hasWorkspaceContent(store: Store | PersistedStore) {
  return [
    store.events.length,
    store.races.length,
    store.checkpoints.length,
    store.participants.length,
    store.crew.length,
    store.scans.length
  ].some((count) => count > 0);
}

function toPersistedStore(store: Store): PersistedStore {
  const { user: _user, ...persisted } = store;
  return persisted;
}

function persistedStoreKey(store: Store | PersistedStore) {
  return JSON.stringify("user" in store ? toPersistedStore(store) : store);
}

function hydratePersistedStore(user: User, payload: PersistedStore) {
  return hydrate({
    ...payload,
    user
  });
}

function emptyStore(user: User): Store {
  return hydrate({
    user,
    events: [],
    races: [],
    checkpoints: [],
    participants: [],
    crew: [],
    scans: [],
    nextIds: { event: 1, race: 1, checkpoint: 1, participant: 1, crew: 1, scan: 1 }
  });
}

function loadStore(user: User) {
  if (typeof window === "undefined") return emptyStore(user);
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return emptyStore(user);
  try {
    const parsed = JSON.parse(raw) as Partial<Store>;
    const payload = "events" in parsed ? (parsed as PersistedStore) : toPersistedStore(emptyStore(user));
    return hydratePersistedStore(user, payload);
  } catch {
    return emptyStore(user);
  }
}

function saveStore(store: Store) {
  if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, JSON.stringify(toPersistedStore(store)));
}

function sleep(ms: number) {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
}

async function getWorkspaceAccessToken(user: User) {
  if (user.isLocalAuth || !supabase) {
    return null;
  }

  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

async function requestOrganizerJson<T>(user: User, path: string, init?: RequestInit, options?: OrganizerRequestOptions) {
  const headers = new Headers(init?.headers);
  const accessToken = await getWorkspaceAccessToken(user);

  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  } else if (user.workspaceOwnerId === "local-admin") {
    headers.set("x-organizer-demo-user", user.workspaceOwnerId);
  } else {
    throw new Error("Organizer workspace auth is unavailable.");
  }

  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const retries = Math.max(0, options?.retries ?? 0);
  const timeoutMs = Math.max(1000, options?.timeoutMs ?? 10000);

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${API_BASE_URL}${path}`, {
        ...init,
        cache: "no-store",
        headers,
        signal: controller.signal
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        const errorMessage = text || `Workspace request failed (${response.status})`;
        const shouldRetry = attempt < retries && response.status >= 500;

        if (shouldRetry) {
          await sleep(300 * (attempt + 1));
          continue;
        }

        throw new Error(errorMessage);
      }

      return (await response.json()) as T;
    } catch (error) {
      const shouldRetry =
        attempt < retries &&
        error instanceof Error &&
        (error.name === "AbortError" || /(failed to fetch|networkerror|load failed|timeout|abort)/i.test(error.message));

      if (!shouldRetry) {
        throw error;
      }

      await sleep(300 * (attempt + 1));
    } finally {
      globalThis.clearTimeout(timeoutId);
    }
  }

  throw new Error("Organizer request exhausted retries.");
}

async function fetchRemoteWorkspace(user: User): Promise<PersistedStore | null> {
  const payload = await requestOrganizerJson<{
    item: {
      payload: PersistedStore | null;
    } | null;
  }>(user, "/organizer/workspace", undefined, {
    retries: 1,
    timeoutMs: 10000
  });

  return payload.item?.payload ?? null;
}

async function saveRemoteWorkspace(user: User, store: Store) {
  await requestOrganizerJson(user, "/organizer/workspace", {
    body: JSON.stringify({
      payload: toPersistedStore(store),
      username: user.username,
      displayName: user.name
    }),
    method: "PUT"
  }, {
    retries: 1,
    timeoutMs: 15000
  });
}

async function createRemoteScannerCrewMember(
  user: User,
  input: {
    eventId: number;
    name: string;
    username: string;
    password: string;
    assignedCheckpointId: number | null;
  }
) {
  const payload = await requestOrganizerJson<{
    item: {
      member: ScannerCrewMember;
      nextCrewId: number;
    };
  }>(user, "/organizer/scanner-crew", {
    body: JSON.stringify(input),
    method: "POST"
  }, {
    retries: 1,
    timeoutMs: 15000
  });

  return payload.item;
}

async function updateRemoteScannerCrewMember(
  user: User,
  input: {
    crewId: number;
    eventId: number;
    name: string;
    username: string;
    password: string;
    assignedCheckpointId: number | null;
  }
) {
  const payload = await requestOrganizerJson<{
    item: {
      member: ScannerCrewMember;
    };
  }>(user, "/organizer/scanner-crew", {
    body: JSON.stringify(input),
    method: "PUT"
  }, {
    retries: 1,
    timeoutMs: 15000
  });

  return payload.item;
}

function isUnavailableOrganizerScannerCrewRoute(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /404|not found|failed to fetch|networkerror|load failed|timeout|abort/i.test(message);
}

function normalizeBib(value: string | null | undefined) {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

function buildOrganizerCrewCode(ownerUserId: string, eventId: number, crewId: number) {
  return `crew-${ownerUserId}-${eventId}-${crewId}`;
}

function buildScannerCheckpointId(checkpoint: Checkpoint, intermediateIndex: number) {
  if (checkpoint.isStartLine) {
    return ORGANIZER_DEMO_CHECKPOINT_IDS[0];
  }

  if (checkpoint.isFinishLine) {
    return ORGANIZER_DEMO_CHECKPOINT_IDS[ORGANIZER_DEMO_CHECKPOINT_IDS.length - 1];
  }

  return (
    ORGANIZER_DEMO_CHECKPOINT_IDS[Math.min(intermediateIndex, ORGANIZER_DEMO_CHECKPOINT_IDS.length - 2)] ??
    `cp-extra-${checkpoint.orderIndex}`
  );
}

function mapScannerCheckpointIds(checkpoints: Checkpoint[]) {
  let intermediateIndex = 1;

  return checkpoints
    .slice()
    .sort((left, right) => left.orderIndex - right.orderIndex)
    .map((checkpoint) => {
      const currentIntermediateIndex = checkpoint.isStartLine || checkpoint.isFinishLine ? intermediateIndex : intermediateIndex++;

      return {
        checkpoint,
        scannerCheckpointId: buildScannerCheckpointId(checkpoint, currentIntermediateIndex)
      };
    });
}

async function fetchRecentOrganizerPassings(): Promise<OrganizerRecentPassing[]> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= 1; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = globalThis.setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(`${API_BASE_URL}/passings/recent?limit=100`, {
        cache: "no-store",
        signal: controller.signal
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(text || `Recent passings request failed (${response.status})`);
      }

      const payload = (await response.json()) as {
        items?: Array<{
          bib?: string | null;
          checkpointId?: string | null;
          checkpointName?: string | null;
          crewId?: string | null;
          name?: string | null;
          scannedAt?: string | null;
        }>;
      };

      return Array.isArray(payload.items)
        ? payload.items
            .map((item) => ({
              bib: normalizeBib(item.bib),
              checkpointId: typeof item.checkpointId === "string" ? item.checkpointId : "",
              checkpointName: typeof item.checkpointName === "string" ? item.checkpointName : null,
              crewId: typeof item.crewId === "string" ? item.crewId : null,
              name: typeof item.name === "string" ? item.name : null,
              scannedAt: typeof item.scannedAt === "string" ? item.scannedAt : ""
            }))
            .filter((item) => item.bib && item.checkpointId && item.scannedAt)
        : [];
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt === 0) {
        await sleep(300);
        continue;
      }
    } finally {
      globalThis.clearTimeout(timeoutId);
    }
  }

  throw lastError ?? new Error("Recent passings request exhausted retries.");
}

function buildOrganizerLiveRaceOpsFromWorkspace(user: User, store: PersistedStore, eventId: number, raceId: number, recentPassings: OrganizerRecentPassing[]): OrganizerLiveRaceOps | null {
  const event = store.events.find((entry) => entry.id === eventId && entry.status !== "archived") ?? null;
  const race = store.races.find((entry) => entry.id === raceId && entry.eventId === eventId) ?? null;

  if (!event || !race) {
    return null;
  }

  const raceParticipants = store.participants.filter((participant) => participant.raceId === race.id);
  const participantByBib = new Map(
    raceParticipants
      .map((participant) => {
        const bib = normalizeBib(participant.bibNumber);
        return bib ? ([bib, participant] as const) : null;
      })
      .filter((entry): entry is readonly [string, Participant] => Boolean(entry))
  );
  const raceCheckpoints = store.checkpoints.filter((checkpoint) => checkpoint.raceId === race.id);
  const checkpointMappings = mapScannerCheckpointIds(raceCheckpoints);
  const checkpointByScannerId = new Map<string, Checkpoint>(checkpointMappings.map((entry) => [entry.scannerCheckpointId, entry.checkpoint]));
  const allowedCrewCodes = new Set(
    store.crew
      .filter((member) => member.eventId === event.id)
      .map((member) => buildOrganizerCrewCode(user.workspaceOwnerId, event.id, member.id))
  );
  const filteredPassings = recentPassings.filter(
    (passing) => checkpointByScannerId.has(passing.checkpointId) && (allowedCrewCodes.has(passing.crewId ?? "") || participantByBib.has(passing.bib))
  );
  const scanTotals = new Map<string, { total: number; lastScanAt: string | null }>();
  const scannedBibs = new Set<string>();

  for (const passing of filteredPassings) {
    scannedBibs.add(passing.bib);
    const previous = scanTotals.get(passing.checkpointId) ?? { total: 0, lastScanAt: null };
    const lastScanAt =
      !previous.lastScanAt || new Date(passing.scannedAt) > new Date(previous.lastScanAt) ? passing.scannedAt : previous.lastScanAt;
    scanTotals.set(passing.checkpointId, {
      total: previous.total + 1,
      lastScanAt
    });
  }

  const crewById = new Map(
    store.crew.filter((member) => member.eventId === event.id).map((member) => [member.id, member.name])
  );

  return {
    raceId: race.id,
    raceName: race.name,
    raceStatus: race.status,
    totalParticipants: raceParticipants.length,
    scannedIn: scannedBibs.size,
    finished: raceParticipants.filter((participant) => participant.status === "finished").length,
    dnf: raceParticipants.filter((participant) => participant.status === "dnf").length,
    checkpoints: checkpointMappings.map(({ checkpoint, scannerCheckpointId }) => {
      const totals = scanTotals.get(scannerCheckpointId);
      return {
        checkpointId: checkpoint.id,
        name: checkpoint.name,
        orderIndex: checkpoint.orderIndex,
        isStartLine: checkpoint.isStartLine,
        isFinishLine: checkpoint.isFinishLine,
        assignedCrew: checkpoint.assignedCrewId !== undefined && checkpoint.assignedCrewId !== null ? crewById.get(checkpoint.assignedCrewId) ?? null : null,
        scanCount: totals?.total ?? 0,
        lastScanAt: totals?.lastScanAt ?? null
      };
    }),
    recentScans: filteredPassings.slice(0, 50).map((passing) => {
      const participant = participantByBib.get(passing.bib) ?? null;
      const checkpoint = checkpointByScannerId.get(passing.checkpointId) ?? null;
      return {
        id: `${passing.bib}-${passing.checkpointId}-${passing.scannedAt}`,
        participantId: participant?.id ?? 0,
        participantName: participant?.fullName ?? passing.name ?? `Runner ${passing.bib}`,
        bibNumber: passing.bib,
        checkpointId: checkpoint?.id ?? 0,
        checkpointName: checkpoint?.name ?? passing.checkpointName ?? passing.checkpointId,
        scannedAt: passing.scannedAt,
        isDuplicate: false,
        raceId: race.id
      } satisfies ScanEvent;
    }),
    source: "client"
  };
}

function parseCsv(csvData: string) {
  const lines = csvData.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const parseLine = (line: string) => line.split(",").map((value) => value.trim().replace(/^"|"$/g, ""));
  return {
    headers: lines[0] ? parseLine(lines[0]).map((value) => value.toLowerCase()) : [],
    rows: lines.slice(1).map(parseLine)
  };
}

function normalizeCountryCode(value: string | null | undefined) {
  return value?.trim().toUpperCase().slice(0, 2) || "ID";
}

export function OrganizerPrototypeProvider({ children, user, onLogout }: { children: ReactNode; user: User; onLogout: () => void }) {
  const [store, setStore] = useState<Store>(() => loadStore(user));
  const [isStoreLoading, setIsStoreLoading] = useState(false);
  const hasHydratedRemoteRef = useRef(false);
  const latestStoreRef = useRef(store);
  const lastRemotePersistedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    latestStoreRef.current = store;
  }, [store]);

  useEffect(() => {
    let isActive = true;
    const localStore = loadStore(user);
    setStore(localStore);
    hasHydratedRemoteRef.current = false;
    lastRemotePersistedKeyRef.current = null;

    const hydrateRemoteStore = async () => {
      setIsStoreLoading(true);

      try {
        const remoteStore = await fetchRemoteWorkspace(user);
        const currentStore = latestStoreRef.current;
        const localChangedDuringHydration = persistedStoreKey(currentStore) !== persistedStoreKey(localStore);

        if (!isActive) {
          return;
        }

        if (remoteStore) {
          if (localChangedDuringHydration) {
            await saveRemoteWorkspace(user, currentStore);
            lastRemotePersistedKeyRef.current = persistedStoreKey(currentStore);
            saveStore(currentStore);
          } else {
            const nextStore = hydratePersistedStore(user, remoteStore);
            lastRemotePersistedKeyRef.current = persistedStoreKey(nextStore);
            setStore(nextStore);
            saveStore(nextStore);
          }
        } else {
          if (hasWorkspaceContent(currentStore)) {
            await saveRemoteWorkspace(user, currentStore);
            lastRemotePersistedKeyRef.current = persistedStoreKey(currentStore);
          } else if (hasWorkspaceContent(localStore)) {
            await saveRemoteWorkspace(user, localStore);
            lastRemotePersistedKeyRef.current = persistedStoreKey(localStore);
          } else {
            lastRemotePersistedKeyRef.current = persistedStoreKey(localStore);
          }
        }
      } catch (error) {
        console.error("Organizer workspace sync failed.", error);
      } finally {
        if (!isActive) {
          return;
        }

        hasHydratedRemoteRef.current = true;
        setIsStoreLoading(false);
      }
    };

    void hydrateRemoteStore();

    return () => {
      isActive = false;
    };
  }, [user.id, user.isLocalAuth, user.name, user.role, user.username, user.workspaceOwnerId]);

  useEffect(() => {
    saveStore(store);

    if (!hasHydratedRemoteRef.current) {
      return;
    }

    const storeKey = persistedStoreKey(store);

    if (lastRemotePersistedKeyRef.current === storeKey) {
      return;
    }

    void saveRemoteWorkspace(user, store)
      .then(() => {
        lastRemotePersistedKeyRef.current = storeKey;
      })
      .catch((error) => {
        console.error("Organizer workspace save failed.", error);
      });
  }, [store, user.id, user.isLocalAuth, user.name, user.username, user.workspaceOwnerId]);

  const markRemoteStoreSaved = (nextStore: Store) => {
    lastRemotePersistedKeyRef.current = persistedStoreKey(nextStore);
  };

  const value = useMemo(
    () => ({ store, setStore, logout: onLogout, isStoreLoading, markRemoteStoreSaved }),
    [isStoreLoading, onLogout, store]
  );
  return <PrototypeContext.Provider value={value}>{children}</PrototypeContext.Provider>;
}

function usePrototypeContext() {
  const context = useContext(PrototypeContext);
  if (!context) throw new Error("Organizer prototype context is missing.");
  return context;
}

export function usePrototypeUser() {
  const { store } = usePrototypeContext();
  return store.user;
}

export async function fetchOrganizerLiveRaceOps(user: User, eventId: number, raceId: number): Promise<OrganizerLiveRaceOps | null> {
  const query = new URLSearchParams({
    eventId: String(eventId),
    raceId: String(raceId)
  });

  try {
    const payload = await requestOrganizerJson<{ item: OrganizerLiveRaceOps | null }>(
      user,
      `/organizer/live-race?${query.toString()}`,
      undefined,
      {
        retries: 1,
        timeoutMs: 8000
      }
    );

    return payload.item ? { ...payload.item, source: "server" } : null;
  } catch (error) {
    const shouldFallback =
      error instanceof Error &&
      /(404|not found|workspace request failed \(404\)|failed to fetch|networkerror|load failed|timeout|abort)/i.test(error.message);

    if (!shouldFallback) {
      throw error;
    }

    const [remoteStore, recentPassings] = await Promise.all([
      fetchRemoteWorkspace(user),
      fetchRecentOrganizerPassings()
    ]);

    return remoteStore ? buildOrganizerLiveRaceOpsFromWorkspace(user, remoteStore, eventId, raceId, recentPassings) : null;
  }
}

function useMutation<TVars, TData>(runner: (context: PrototypeContextValue, variables: TVars) => TData | Promise<TData>) {
  const context = usePrototypeContext();
  const [isPending, setIsPending] = useState(false);
  return {
    isPending,
    mutate(variables: TVars, callbacks?: MutationCallbacks<TData>) {
      setIsPending(true);
      void Promise.resolve()
        .then(() => runner(context, variables))
        .then((result) => {
          callbacks?.onSuccess?.(result);
        })
        .catch((error) => {
          callbacks?.onError?.(error instanceof Error ? error : new Error("Prototype mutation failed"));
        })
        .finally(() => {
          setIsPending(false);
        });
    }
  };
}

export const getListEventsQueryKey = () => ["prototype-events"];
export const getGetEventQueryKey = (eventId: number) => ["prototype-event", eventId];
export const getListRacesQueryKey = (eventId: number) => ["prototype-races", eventId];
export const getListCheckpointsQueryKey = (eventId: number, raceId: number) => ["prototype-checkpoints", eventId, raceId];
export const getListParticipantsQueryKey = (eventId: number, raceId: number) => ["prototype-participants", eventId, raceId];
export const getListScannerCrewQueryKey = (eventId: number) => ["prototype-crew", eventId];
export const getListEventCheckpointsQueryKey = (eventId: number) => ["prototype-event-checkpoints", eventId];
export const getGetEventSummaryQueryKey = (eventId: number) => ["prototype-summary", eventId];
export const getGetRaceDayStatusQueryKey = (eventId: number, raceId: number) => ["prototype-race-day-status", eventId, raceId];
export const getListScansQueryKey = (eventId: number, raceId: number) => ["prototype-scans", eventId, raceId];

export function useListEvents() {
  const { store, isStoreLoading } = usePrototypeContext();
  return { data: store.events, isLoading: isStoreLoading && store.events.length === 0 };
}

export function useGetEvent(eventId: number, options?: QueryOptions) {
  const { store, isStoreLoading } = usePrototypeContext();
  const event = options?.query?.enabled === false ? undefined : store.events.find((entry) => entry.id === eventId) ?? null;
  return {
    data: event,
    isLoading: isStoreLoading && !event,
    error: null
  };
}

export function useListRaces(eventId: number, options?: QueryOptions) {
  const { store, isStoreLoading } = usePrototypeContext();
  const races = options?.query?.enabled === false ? undefined : store.races.filter((race) => race.eventId === eventId);
  return { data: races, isLoading: isStoreLoading && Array.isArray(races) && races.length === 0 };
}

export function useListCheckpoints(eventId: number, raceId: number, options?: QueryOptions) {
  const { store, isStoreLoading } = usePrototypeContext();
  const exists = store.races.some((race) => race.id === raceId && race.eventId === eventId);
  const data = exists && options?.query?.enabled !== false ? store.checkpoints.filter((checkpoint) => checkpoint.raceId === raceId) : [];
  return {
    data,
    isLoading: isStoreLoading && exists && data.length === 0
  };
}

export function useListParticipants(eventId: number, raceId: number, options?: QueryOptions) {
  const { store, isStoreLoading } = usePrototypeContext();
  const exists = store.races.some((race) => race.id === raceId && race.eventId === eventId);
  const data = exists && options?.query?.enabled !== false ? store.participants.filter((participant) => participant.raceId === raceId) : [];
  return {
    data,
    isLoading: isStoreLoading && exists && data.length === 0
  };
}

export function useListScannerCrew(eventId: number, options?: QueryOptions) {
  const { store, isStoreLoading } = usePrototypeContext();
  const crew = options?.query?.enabled === false ? undefined : store.crew.filter((member) => member.eventId === eventId);
  return { data: crew, isLoading: isStoreLoading && Array.isArray(crew) && crew.length === 0 };
}

export function useListEventCheckpoints(eventId: number, options?: QueryOptions) {
  const { store, isStoreLoading } = usePrototypeContext();

  const data =
    options?.query?.enabled === false
      ? []
      : store.races
          .filter((race) => race.eventId === eventId)
          .flatMap((race) =>
            store.checkpoints
              .filter((checkpoint) => checkpoint.raceId === race.id)
              .map((checkpoint) => ({
                id: checkpoint.id,
                raceId: race.id,
                raceName: race.name,
                name: checkpoint.name,
                orderIndex: checkpoint.orderIndex,
                distanceFromStart: checkpoint.distanceFromStart ?? null,
                isStartLine: checkpoint.isStartLine,
                isFinishLine: checkpoint.isFinishLine
              }) satisfies EventCheckpointOption)
          )
          .sort((left, right) => {
            if (left.raceName !== right.raceName) {
              return left.raceName.localeCompare(right.raceName);
            }

            return left.orderIndex - right.orderIndex;
          });

  return {
    data,
    isLoading: isStoreLoading && data.length === 0
  };
}

export function useGetEventSummary(eventId: number, options?: QueryOptions) {
  const { store, isStoreLoading } = usePrototypeContext();
  if (options?.query?.enabled === false) return { data: undefined, isLoading: isStoreLoading };
  const event = store.events.find((entry) => entry.id === eventId);
  const races = store.races.filter((entry) => entry.eventId === eventId);
  const readinessChecks: ReadinessCheck[] = [
    { label: "Event basics configured", passed: Boolean(event?.name.trim()) && Boolean(event?.location.trim()), detail: "Set the event name and location." },
    { label: "At least one race category exists", passed: races.length > 0, detail: "Create the first race category." },
    { label: "Checkpoints route is defined", passed: store.checkpoints.some((checkpoint) => races.some((race) => race.id === checkpoint.raceId)), detail: "Add at least one checkpoint." },
    { label: "Participants are loaded", passed: store.participants.some((participant) => races.some((race) => race.id === participant.raceId)), detail: "Import or add participants." },
    { label: "Scanner crew accounts are ready", passed: store.crew.some((member) => member.eventId === eventId), detail: "Create at least one crew account." }
  ];
  return {
    data: event
      ? {
          eventId,
          eventStatus: event.status,
          totalRaces: races.length,
          publishedRaces: races.filter((race) => race.status !== "draft").length,
          liveRaces: races.filter((race) => race.status === "live").length,
          totalParticipants: store.participants.filter((participant) => races.some((race) => race.id === participant.raceId)).length,
          totalScannerCrew: store.crew.filter((member) => member.eventId === eventId).length,
          readinessChecks
        }
      : null,
    isLoading: isStoreLoading && !event
  };
}

export function useGetRaceDayStatus(eventId: number, raceId: number, options?: QueryOptions) {
  const { store, isStoreLoading } = usePrototypeContext();
  if (options?.query?.enabled === false) return { data: undefined, isLoading: isStoreLoading };
  const race = store.races.find((entry) => entry.id === raceId && entry.eventId === eventId);
  if (!race) return { data: null, isLoading: isStoreLoading };
  const checkpoints = store.checkpoints.filter((checkpoint) => checkpoint.raceId === raceId).sort((a, b) => a.orderIndex - b.orderIndex);
  const participants = store.participants.filter((participant) => participant.raceId === raceId);
  const scans = store.scans.filter((scan) => scan.raceId === raceId);
  return {
    data: {
      raceId,
      raceName: race.name,
      raceStatus: race.status,
      startedAt: race.status === "live" ? race.updatedAt : null,
      totalParticipants: participants.length,
      scannedIn: new Set(scans.map((scan) => scan.participantId)).size,
      finished: participants.filter((participant) => participant.status === "finished").length,
      dnf: participants.filter((participant) => participant.status === "dnf").length,
      checkpoints: checkpoints.map((checkpoint) => ({
        checkpointId: checkpoint.id,
        name: checkpoint.name,
        orderIndex: checkpoint.orderIndex,
        isStartLine: checkpoint.isStartLine,
        isFinishLine: checkpoint.isFinishLine,
        assignedCrew: store.crew.find((member) => member.id === checkpoint.assignedCrewId)?.name ?? null,
        scanCount: scans.filter((scan) => scan.checkpointId === checkpoint.id).length,
        lastScanAt: scans.filter((scan) => scan.checkpointId === checkpoint.id).sort((a, b) => b.scannedAt.localeCompare(a.scannedAt))[0]?.scannedAt ?? null
      }))
    } satisfies RaceDayStatus,
    isLoading: isStoreLoading && !race
  };
}

export function useListScans(eventId: number, raceId: number, options?: QueryOptions) {
  const { store, isStoreLoading } = usePrototypeContext();
  const exists = store.races.some((race) => race.id === raceId && race.eventId === eventId);
  const data = exists && options?.query?.enabled !== false ? store.scans.filter((scan) => scan.raceId === raceId).sort((a, b) => b.scannedAt.localeCompare(a.scannedAt)) : [];
  return {
    data,
    isLoading: isStoreLoading && exists && data.length === 0
  };
}

export function useCreateEvent() {
  return useMutation<{ data: { name: string; location: string; startDate?: string; endDate?: string; description?: string; logoUrl?: string; bannerUrl?: string; firstRaceName: string; firstRaceDistance: number; firstRaceElevationGain: number; firstRaceMaxParticipants: number } }, Event>(
    ({ setStore, store }, { data }) => {
      const timestamp = nowIso();
      const event: Event = {
        id: store.nextIds.event,
        name: data.name,
        location: data.location,
        description: data.description || null,
        startDate: data.startDate || null,
        endDate: data.endDate || null,
        logoUrl: data.logoUrl || null,
        bannerUrl: data.bannerUrl || null,
        status: "draft",
        organizerId: store.user.id,
        createdAt: timestamp,
        updatedAt: timestamp
      };
      const race: Race = {
        id: store.nextIds.race,
        eventId: event.id,
        name: data.firstRaceName,
        distance: data.firstRaceDistance,
        elevationGain: data.firstRaceElevationGain,
        maxParticipants: data.firstRaceMaxParticipants,
      cutoffTime: null,
      gpxFileName: null,
      gpxData: null,
      descentM: null,
      waypoints: [],
      profilePoints: [],
      status: "draft",
      participantCount: 0,
      checkpointCount: 0,
        crewCount: 0,
        createdAt: timestamp,
        updatedAt: timestamp
      };
      setStore((current) =>
        hydrate({
          ...current,
          events: [...current.events, event],
          races: [...current.races, race],
          nextIds: { ...current.nextIds, event: current.nextIds.event + 1, race: current.nextIds.race + 1 }
        })
      );
      return event;
    }
  );
}

export function useUpdateEvent() {
  return useMutation<{ eventId: number; data: Partial<Event> }, Event>(({ setStore, store }, { eventId, data }) => {
    const event = store.events.find((entry) => entry.id === eventId);
    if (!event) throw new Error("Event not found");
    const nextEvent = { ...event, ...data, updatedAt: nowIso() };
    setStore((current) => hydrate({ ...current, events: current.events.map((entry) => (entry.id === eventId ? nextEvent : entry)) }));
    return nextEvent;
  });
}

export function useDeleteEvent() {
  return useMutation<{ eventId: number }, void>(({ setStore }, { eventId }) => {
    setStore((current) => hydrate({ ...current, events: current.events.map((event) => (event.id === eventId ? { ...event, status: "archived", updatedAt: nowIso() } : event)) }));
  });
}

export function useDuplicateEvent() {
  return useMutation<{ eventId: number }, Event>(({ setStore, store }, { eventId }) => {
    const source = store.events.find((event) => event.id === eventId);
    if (!source) throw new Error("Event not found");
    const timestamp = nowIso();
    const duplicate: Event = { ...source, id: store.nextIds.event, name: `${source.name} Copy`, status: "draft", createdAt: timestamp, updatedAt: timestamp };
    const sourceRaces = store.races.filter((race) => race.eventId === eventId);
    let nextRaceId = store.nextIds.race;
    let nextCheckpointId = store.nextIds.checkpoint;
    const races = sourceRaces.map((race) => ({ ...race, id: nextRaceId++, eventId: duplicate.id, status: "draft" as RaceStatus, participantCount: 0, crewCount: 0, createdAt: timestamp, updatedAt: timestamp }));
    const checkpoints = sourceRaces.flatMap((race, index) => store.checkpoints.filter((checkpoint) => checkpoint.raceId === race.id).map((checkpoint) => ({ ...checkpoint, id: nextCheckpointId++, raceId: races[index].id, assignedCrewId: null, createdAt: timestamp })));
    setStore((current) =>
      hydrate({
        ...current,
        events: [...current.events, duplicate],
        races: [...current.races, ...races],
        checkpoints: [...current.checkpoints, ...checkpoints],
        nextIds: { ...current.nextIds, event: current.nextIds.event + 1, race: nextRaceId, checkpoint: nextCheckpointId }
      })
    );
    return duplicate;
  });
}

export function useCreateRace() {
  return useMutation<{ eventId: number; data: Partial<Race> }, Race>(({ setStore, store }, { eventId, data }) => {
    const race: Race = {
      id: store.nextIds.race,
      eventId,
      name: data.name || `Race ${store.nextIds.race}`,
      distance: data.distance ?? null,
      elevationGain: data.elevationGain ?? null,
      maxParticipants: data.maxParticipants ?? null,
      cutoffTime: data.cutoffTime ?? null,
      gpxFileName: data.gpxFileName ?? null,
      gpxData: data.gpxData ?? null,
      status: "draft",
      participantCount: 0,
      checkpointCount: 0,
      crewCount: 0,
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    setStore((current) => hydrate({ ...current, races: [...current.races, race], nextIds: { ...current.nextIds, race: current.nextIds.race + 1 } }));
    return race;
  });
}

export function useUpdateRace() {
  return useMutation<{ eventId: number; raceId: number; data: Partial<Race> }, Race>(({ setStore, store }, { raceId, data }) => {
    const race = store.races.find((entry) => entry.id === raceId);
    if (!race) throw new Error("Race not found");
    const nextRace = { ...race, ...data, updatedAt: nowIso() };
    setStore((current) => hydrate({ ...current, races: current.races.map((entry) => (entry.id === raceId ? nextRace : entry)) }));
    return nextRace;
  });
}

export function useDeleteRace() {
  return useMutation<{ eventId: number; raceId: number }, void>(({ setStore }, { raceId }) => {
    setStore((current) =>
      hydrate({
        ...current,
        races: current.races.filter((race) => race.id !== raceId),
        checkpoints: current.checkpoints.filter((checkpoint) => checkpoint.raceId !== raceId),
        participants: current.participants.filter((participant) => participant.raceId !== raceId),
        scans: current.scans.filter((scan) => scan.raceId !== raceId)
      })
    );
  });
}

export function useCreateCheckpoint() {
  return useMutation<{ eventId: number; raceId: number; data: Partial<Checkpoint> }, Checkpoint>(({ setStore, store }, { raceId, data }) => {
    const checkpoint: Checkpoint = {
      id: store.nextIds.checkpoint,
      raceId,
      name: data.name || `Checkpoint ${store.nextIds.checkpoint}`,
      orderIndex: data.orderIndex ?? 1,
      distanceFromStart: data.distanceFromStart ?? null,
      isStartLine: Boolean(data.isStartLine),
      isFinishLine: Boolean(data.isFinishLine),
      assignedCrewId: data.assignedCrewId ?? null,
      createdAt: nowIso()
    };
    setStore((current) =>
      hydrate({
        ...current,
        checkpoints: [...current.checkpoints, checkpoint]
          .map((entry) => {
            if (entry.raceId !== raceId || entry.id === checkpoint.id) {
              return entry;
            }

            if (checkpoint.isStartLine && entry.isStartLine) {
              return { ...entry, isStartLine: false };
            }

            if (checkpoint.isFinishLine && entry.isFinishLine) {
              return { ...entry, isFinishLine: false };
            }

            return entry;
          })
          .sort((a, b) => a.orderIndex - b.orderIndex),
        nextIds: { ...current.nextIds, checkpoint: current.nextIds.checkpoint + 1 }
      })
    );
    return checkpoint;
  });
}

export function useDeleteCheckpoint() {
  return useMutation<{ eventId: number; raceId: number; checkpointId: number }, void>(({ setStore }, { checkpointId }) => {
    setStore((current) =>
      hydrate({
        ...current,
        checkpoints: current.checkpoints.filter((checkpoint) => checkpoint.id !== checkpointId),
        crew: current.crew.map((member) => (member.assignedCheckpointId === checkpointId ? { ...member, assignedCheckpointId: null } : member)),
        scans: current.scans.filter((scan) => scan.checkpointId !== checkpointId)
      })
    );
  });
}

export function useCreateParticipant() {
  return useMutation<{ eventId: number; raceId: number; data: Partial<Participant> }, Participant>(({ setStore, store }, { raceId, data }) => {
    const participant: Participant = {
      id: store.nextIds.participant,
      raceId,
      bibNumber: data.bibNumber || null,
      fullName: data.fullName || "Unnamed runner",
      email: data.email || "runner@altix.local",
      phone: data.phone || null,
      gender: data.gender || null,
      countryCode: normalizeCountryCode(data.countryCode),
      ageCategory: data.ageCategory || null,
      emergencyContact: data.emergencyContact || null,
      status: "registered",
      createdAt: nowIso()
    };
    setStore((current) => hydrate({ ...current, participants: [...current.participants, participant], nextIds: { ...current.nextIds, participant: current.nextIds.participant + 1 } }));
    return participant;
  });
}

export function useDeleteParticipant() {
  return useMutation<{ eventId: number; raceId: number; participantId: number }, void>(({ setStore }, { participantId }) => {
    setStore((current) => hydrate({ ...current, participants: current.participants.filter((participant) => participant.id !== participantId), scans: current.scans.filter((scan) => scan.participantId !== participantId) }));
  });
}

export function useImportParticipants() {
  return useMutation<{ eventId: number; raceId: number; data: { csvData: string; preview: boolean } }, { imported: number; skipped: number; errors: string[] }>(
    ({ setStore, store }, { raceId, data }) => {
      const { headers, rows } = parseCsv(data.csvData);
      const errors: string[] = [];
      let imported = 0;
      let skipped = 0;
      let nextParticipantId = store.nextIds.participant;
      const importedParticipants: Participant[] = [];
      const bibIndex = headers.indexOf("bibnumber");
      const nameIndex = headers.indexOf("fullname");
      const emailIndex = headers.indexOf("email");
      const phoneIndex = headers.indexOf("phone");
      const genderIndex = headers.indexOf("gender");
      const ageCategoryIndex = headers.indexOf("agecategory");
      const emergencyContactIndex = headers.indexOf("emergencycontact");
      const nationalityIndex = headers.findIndex((header) => ["nationality", "country", "countrycode", "country_code"].includes(header));

      rows.forEach((row, index) => {
        const fullName = nameIndex === -1 ? "" : row[nameIndex] ?? "";
        const email = emailIndex === -1 ? "" : row[emailIndex] ?? "";
        if (!fullName || !email) {
          skipped += 1;
          errors.push(`Row ${index + 2}: fullName and email are required.`);
          return;
        }
        imported += 1;
        importedParticipants.push({
          id: nextParticipantId++,
          raceId,
          bibNumber: bibIndex === -1 ? null : row[bibIndex] ?? null,
          fullName,
          email,
          phone: phoneIndex === -1 ? null : row[phoneIndex] ?? null,
          gender: genderIndex === -1 ? null : row[genderIndex] ?? null,
          countryCode: normalizeCountryCode(nationalityIndex === -1 ? "ID" : row[nationalityIndex] ?? "ID"),
          ageCategory: ageCategoryIndex === -1 ? null : row[ageCategoryIndex] ?? null,
          emergencyContact: emergencyContactIndex === -1 ? null : row[emergencyContactIndex] ?? null,
          status: "registered",
          createdAt: nowIso()
        });
      });
      if (!data.preview) {
        setStore((current) =>
          hydrate({
            ...current,
            participants: [...current.participants.filter((participant) => participant.raceId !== raceId), ...importedParticipants],
            nextIds: { ...current.nextIds, participant: nextParticipantId }
          })
        );
      }
      return { imported, skipped, errors };
    }
  );
}

export function useCreateScannerCrewMember() {
  return useMutation<{ eventId: number; data: Partial<ScannerCrewMember> }, ScannerCrewMember>(async ({ setStore, store, markRemoteStoreSaved }, { eventId, data }) => {
    const name = data.name?.trim() || `Crew ${store.nextIds.crew}`;
    const username = data.username?.trim() || `crew_${store.nextIds.crew}`;
    const password = typeof data.password === "string" && data.password.length > 0 ? data.password : null;
    const normalizedUsername = username.toLowerCase();

    if (!password) {
      throw new Error("Scanner crew password is required.");
    }

    if (store.crew.some((member) => member.username.trim().toLowerCase() === normalizedUsername)) {
      throw new Error("Scanner crew username already exists.");
    }

    let nextStore: Store;
    let member: ScannerCrewMember;

    try {
      const remoteResult = await createRemoteScannerCrewMember(store.user, {
        eventId,
        name,
        username,
        password,
        assignedCheckpointId: data.assignedCheckpointId ?? null
      });
      member = remoteResult.member;
      nextStore = hydrate({
        ...store,
        crew: [...store.crew, remoteResult.member],
        nextIds: {
          ...store.nextIds,
          crew: Math.max(store.nextIds.crew, remoteResult.nextCrewId)
        }
      });
    } catch (error) {
      if (!isUnavailableOrganizerScannerCrewRoute(error)) {
        throw error;
      }

      member = {
        id: store.nextIds.crew,
        eventId,
        name,
        username,
        password,
        assignedCheckpointId: data.assignedCheckpointId ?? null,
        createdAt: nowIso()
      };
      nextStore = hydrate({
        ...store,
        crew: [...store.crew, member],
        nextIds: { ...store.nextIds, crew: store.nextIds.crew + 1 }
      });
      await saveRemoteWorkspace(store.user, nextStore);
    }

    saveStore(nextStore);
    markRemoteStoreSaved(nextStore);
    setStore(nextStore);
    return member;
  });
}

export function useUpdateScannerCrewMember() {
  return useMutation<{ eventId: number; scannerId: number; data: Partial<ScannerCrewMember> }, ScannerCrewMember>(
    async ({ setStore, store, markRemoteStoreSaved }, { eventId, scannerId, data }) => {
      const existingMember = store.crew.find((member) => member.id === scannerId && member.eventId === eventId);

      if (!existingMember) {
        throw new Error("Scanner crew member not found.");
      }

      const name = data.name?.trim() || existingMember.name;
      const username = data.username?.trim() || existingMember.username;
      const password = typeof data.password === "string" && data.password.length > 0 ? data.password : existingMember.password ?? null;
      const hasAssignedCheckpointId = Object.prototype.hasOwnProperty.call(data, "assignedCheckpointId");
      const assignedCheckpointId = hasAssignedCheckpointId ? data.assignedCheckpointId ?? null : existingMember.assignedCheckpointId ?? null;
      const normalizedUsername = username.toLowerCase();

      if (!password) {
        throw new Error("Scanner crew password is required.");
      }

      if (
        store.crew.some(
          (member) => member.id !== scannerId && member.username.trim().toLowerCase() === normalizedUsername
        )
      ) {
        throw new Error("Scanner crew username already exists.");
      }

      let nextStore: Store;
      let member: ScannerCrewMember;

      try {
        const remoteResult = await updateRemoteScannerCrewMember(store.user, {
          crewId: scannerId,
          eventId,
          name,
          username,
          password,
          assignedCheckpointId
        });
        member = remoteResult.member;
        nextStore = hydrate({
          ...store,
          crew: store.crew.map((entry) => (entry.id === scannerId ? remoteResult.member : entry))
        });
      } catch (error) {
        if (!isUnavailableOrganizerScannerCrewRoute(error)) {
          throw error;
        }

        member = {
          ...existingMember,
          eventId,
          name,
          username,
          password,
          assignedCheckpointId
        };
        nextStore = hydrate({
          ...store,
          crew: store.crew.map((entry) => (entry.id === scannerId ? member : entry))
        });
        await saveRemoteWorkspace(store.user, nextStore);
      }

      saveStore(nextStore);
      markRemoteStoreSaved(nextStore);
      setStore(nextStore);
      return member;
    }
  );
}

export function useDeleteScannerCrewMember() {
  return useMutation<{ eventId: number; scannerId: number }, void>(({ setStore }, { scannerId }) => {
    setStore((current) => hydrate({
      ...current,
      crew: current.crew.filter((member) => member.id !== scannerId),
      checkpoints: current.checkpoints.map((checkpoint) => (checkpoint.assignedCrewId === scannerId ? { ...checkpoint, assignedCrewId: null } : checkpoint))
    }));
  });
}

export function usePublishRace() {
  return useMutation<{ eventId: number; raceId: number }, Race>(({ setStore, store }, { raceId }) => {
    const race = store.races.find((entry) => entry.id === raceId);
    if (!race) throw new Error("Race not found");
    const nextRace = { ...race, status: "upcoming" as RaceStatus, updatedAt: nowIso() };
    setStore((current) => hydrate({ ...current, races: current.races.map((entry) => (entry.id === raceId ? nextRace : entry)) }));
    return nextRace;
  });
}

export function useGoLiveRace() {
  return useMutation<{ eventId: number; raceId: number }, Race>(({ setStore, store }, { raceId }) => {
    const race = store.races.find((entry) => entry.id === raceId);
    if (!race) throw new Error("Race not found");
    const nextRace = { ...race, status: "live" as RaceStatus, updatedAt: nowIso() };
    setStore((current) => hydrate({ ...current, races: current.races.map((entry) => (entry.id === raceId ? nextRace : entry)) }));
    return nextRace;
  });
}

export function useLogout() {
  const { logout } = usePrototypeContext();
  return useMutation<void, void>(() => {
    logout();
  });
}
