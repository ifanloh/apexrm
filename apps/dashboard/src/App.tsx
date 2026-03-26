import { useDeferredValue, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  authProfileSchema,
  defaultCheckpoints,
  formatCheckpointLabel,
  type AuthProfile,
  type CheckpointLeaderboard,
  type DuplicateScan,
  type NotificationEvent,
  type OverallLeaderboard,
  type RecentPassing,
  type RunnerDetail,
  type RunnerPassing,
  type RunnerSearchEntry
} from "@arm/contracts";
import {
  fetchCheckpointLeaderboard,
  fetchCheckpointLeaderboards,
  fetchOrganizerSignals,
  fetchOverallLeaderboard,
  fetchRecentPassings,
  fetchRunnerDetail,
  fetchRunnerSearch
} from "./api";
import { CourseProfilePanel } from "./CourseProfilePanel";
import { demoCourse } from "./demoCourse";
import { supabase } from "./supabase";
import "./styles.css";

const emptyOverallLeaderboard: OverallLeaderboard = {
  totalRankedRunners: 0,
  topEntries: []
};

const FAVORITES_STORAGE_KEY = "arm:dashboard-favorites";
const THEME_STORAGE_KEY = "arm:dashboard-theme";
const FULL_RANKING_PAGE_SIZE = 12;
const ORGANIZER_ROLES = ["admin", "panitia", "observer"] as const;

type DashboardTheme = "dark" | "light";
type LiveStatus = "idle" | "live" | "polling" | "fallback";

function getInitialTheme() {
  if (typeof window === "undefined") {
    return "dark" as DashboardTheme;
  }

  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);

  if (stored === "dark" || stored === "light") {
    return stored;
  }

  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function getNextTheme(theme: DashboardTheme): DashboardTheme {
  return theme === "dark" ? "light" : "dark";
}

function getInitials(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function formatScanTime(value: string) {
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function formatCheckpointProgress(entry: {
  checkpointCode: string;
  checkpointKmMarker: number;
  checkpointName: string;
}) {
  return `${formatCheckpointLabel({
    code: entry.checkpointCode,
    kmMarker: entry.checkpointKmMarker
  })} · ${entry.checkpointName}`;
}

function getApiHost() {
  try {
    return new URL(import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api").host;
  } catch {
    return import.meta.env.VITE_API_BASE_URL ?? "unknown-api";
  }
}

function formatRelativeTime(value: string) {
  const deltaMs = Math.max(0, Date.now() - new Date(value).getTime());
  const seconds = Math.floor(deltaMs / 1000);

  if (seconds < 60) {
    return `${Math.max(1, seconds)}s lalu`;
  }

  const minutes = Math.floor(seconds / 60);

  if (minutes < 60) {
    return `${minutes}m lalu`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours}j lalu`;
  }

  return new Date(value).toLocaleDateString();
}

function formatCategoryLabel(category: string) {
  return category === "women" ? "Women" : category === "men" ? "Men" : category;
}

function deriveProfileFromSession(session: Session): AuthProfile {
  const appMetadata = session.user.app_metadata ?? {};
  const userMetadata = session.user.user_metadata ?? {};
  const rawRole = appMetadata.role ?? appMetadata.roles?.[0] ?? "crew";
  const crewCode = appMetadata.crew_code ?? appMetadata.crewCode ?? null;

  return authProfileSchema.parse({
    userId: session.user.id,
    email: session.user.email ?? null,
    role: rawRole,
    crewCode,
    displayName: userMetadata.full_name ?? userMetadata.name ?? session.user.email ?? null
  });
}

function mergeCheckpointBoards(existing: CheckpointLeaderboard[], incoming: CheckpointLeaderboard[]) {
  const existingById = new Map(existing.map((board) => [board.checkpointId, board]));

  return incoming.map((board) => {
    const previous = existingById.get(board.checkpointId);

    return {
      ...board,
      topEntries: board.topEntries.length > 0 ? board.topEntries : previous?.topEntries ?? []
    };
  });
}

function normalizeWomenLeaderboard(
  overallBoard: OverallLeaderboard,
  womenBoard: OverallLeaderboard
): OverallLeaderboard {
  const sameTotal = overallBoard.totalRankedRunners === womenBoard.totalRankedRunners;
  const sameEntries =
    overallBoard.topEntries.length === womenBoard.topEntries.length &&
    overallBoard.topEntries.every((entry, index) => {
      const candidate = womenBoard.topEntries[index];
      return (
        candidate &&
        candidate.bib === entry.bib &&
        candidate.rank === entry.rank &&
        candidate.checkpointId === entry.checkpointId
      );
    });

  return sameTotal && sameEntries ? emptyOverallLeaderboard : womenBoard;
}

function buildRunnerFallbackResults(
  entries: OverallLeaderboard["topEntries"],
  query: string,
  checkpointId: string
): RunnerSearchEntry[] {
  const normalizedQuery = query.trim().toUpperCase();

  return entries
    .map<RunnerSearchEntry>((entry) => ({
      bib: entry.bib,
      name: entry.name,
      rank: entry.rank,
      checkpointId: entry.checkpointId,
      checkpointCode: entry.checkpointCode,
      checkpointName: entry.checkpointName,
      checkpointKmMarker: entry.checkpointKmMarker,
      checkpointOrder: entry.checkpointOrder,
      scannedAt: entry.scannedAt,
      crewId: entry.crewId,
      deviceId: entry.deviceId
    }))
    .filter((entry) => {
      const matchesQuery =
        !normalizedQuery ||
        entry.bib.toUpperCase().includes(normalizedQuery) ||
        entry.name.toUpperCase().includes(normalizedQuery);
      const matchesCheckpoint = checkpointId === "all" || entry.checkpointId === checkpointId;
      return matchesQuery && matchesCheckpoint;
    })
    .slice(0, 20);
}

function buildRunnerDetailFallback(
  entries: OverallLeaderboard["topEntries"],
  bib: string
): RunnerDetail | null {
  const match = entries.find((entry) => entry.bib.toUpperCase() === bib.toUpperCase());

  if (!match) {
    return null;
  }

  return {
    bib: match.bib,
    name: match.name,
    rank: match.rank,
    currentCheckpointId: match.checkpointId,
    currentCheckpointCode: match.checkpointCode,
    currentCheckpointName: match.checkpointName,
    currentCheckpointKmMarker: match.checkpointKmMarker,
    currentCheckpointOrder: match.checkpointOrder,
    lastScannedAt: match.scannedAt,
    totalPassings: 0,
    passings: []
  };
}

function buildRecentPassingsFallback(leaderboards: CheckpointLeaderboard[]): RecentPassing[] {
  return leaderboards
    .flatMap((board) =>
      board.topEntries.map((entry) => {
        const checkpoint = defaultCheckpoints.find((item) => item.id === entry.checkpointId);

        return {
          bib: entry.bib,
          name: `Runner ${entry.bib}`,
          checkpointId: entry.checkpointId,
          checkpointCode: checkpoint?.code ?? entry.checkpointId,
          checkpointName: checkpoint?.name ?? entry.checkpointId,
          checkpointKmMarker: checkpoint?.kmMarker ?? 0,
          scannedAt: entry.scannedAt,
          crewId: entry.crewId,
          deviceId: entry.deviceId,
          position: entry.position
        };
      })
    )
    .sort((left, right) => right.scannedAt.localeCompare(left.scannedAt))
    .slice(0, 8);
}

async function buildRunnerDetailFromCheckpointBoards(
  bib: string,
  accessToken: string | null,
  overallEntries: OverallLeaderboard["topEntries"]
): Promise<RunnerDetail | null> {
  const normalizedBib = bib.trim().toUpperCase();
  const overallEntry = overallEntries.find((entry) => entry.bib.toUpperCase() === normalizedBib);

  if (!overallEntry) {
    return null;
  }

  const boards = await Promise.all(
    defaultCheckpoints.map((checkpoint) =>
      fetchCheckpointLeaderboard(checkpoint.id, accessToken).catch(() => null)
    )
  );

  const passings: RunnerPassing[] = boards
    .flatMap((board) => board?.topEntries ?? [])
    .filter((entry) => entry.bib.toUpperCase() === normalizedBib)
    .map((entry) => {
      const checkpoint = defaultCheckpoints.find((item) => item.id === entry.checkpointId);

      return {
        checkpointId: entry.checkpointId,
        checkpointCode: checkpoint?.code ?? entry.checkpointId,
        checkpointName: checkpoint?.name ?? entry.checkpointId,
        checkpointKmMarker: checkpoint?.kmMarker ?? 0,
        checkpointOrder: checkpoint?.order ?? 999,
        scannedAt: entry.scannedAt,
        position: entry.position,
        crewId: entry.crewId,
        deviceId: entry.deviceId
      };
    })
    .sort((left, right) => left.checkpointOrder - right.checkpointOrder || left.scannedAt.localeCompare(right.scannedAt));

  return {
    bib: overallEntry.bib,
    name: overallEntry.name,
    rank: overallEntry.rank,
    currentCheckpointId: overallEntry.checkpointId,
    currentCheckpointCode: overallEntry.checkpointCode,
    currentCheckpointName: overallEntry.checkpointName,
    currentCheckpointKmMarker: overallEntry.checkpointKmMarker,
    currentCheckpointOrder: overallEntry.checkpointOrder,
    lastScannedAt: overallEntry.scannedAt,
    totalPassings: passings.length,
    passings
  };
}

function loadFavoriteBibs() {
  if (typeof window === "undefined") {
    return [] as string[];
  }

  try {
    const raw = window.localStorage.getItem(FAVORITES_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export default function App() {
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [overallLeaderboard, setOverallLeaderboard] = useState<OverallLeaderboard>(emptyOverallLeaderboard);
  const [womenLeaderboard, setWomenLeaderboard] = useState<OverallLeaderboard>(emptyOverallLeaderboard);
  const [leaderboards, setLeaderboards] = useState<CheckpointLeaderboard[]>([]);
  const [duplicates, setDuplicates] = useState<DuplicateScan[]>([]);
  const [notifications, setNotifications] = useState<NotificationEvent[]>([]);
  const [recentPassings, setRecentPassings] = useState<RecentPassing[]>([]);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [selectedCheckpointId, setSelectedCheckpointId] = useState("cp-10");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [liveStatus, setLiveStatus] = useState<LiveStatus>("idle");
  const [lastLiveEventAt, setLastLiveEventAt] = useState<string | null>(null);
  const [runnerQuery, setRunnerQuery] = useState("");
  const [runnerCheckpointFilter, setRunnerCheckpointFilter] = useState("all");
  const [runnerResults, setRunnerResults] = useState<RunnerSearchEntry[]>([]);
  const [runnerSearchError, setRunnerSearchError] = useState<string | null>(null);
  const [isSearchingRunners, setIsSearchingRunners] = useState(false);
  const [runnerSearchMode, setRunnerSearchMode] = useState<"server" | "fallback">("server");
  const [recentPassingsMode, setRecentPassingsMode] = useState<"server" | "fallback">("server");
  const [selectedRunnerBib, setSelectedRunnerBib] = useState<string | null>(null);
  const [runnerDetail, setRunnerDetail] = useState<RunnerDetail | null>(null);
  const [runnerDetailError, setRunnerDetailError] = useState<string | null>(null);
  const [isLoadingRunnerDetail, setIsLoadingRunnerDetail] = useState(false);
  const [favoriteBibs, setFavoriteBibs] = useState<string[]>(() => loadFavoriteBibs());
  const [theme, setTheme] = useState<DashboardTheme>(() => getInitialTheme());
  const [fullRankingPage, setFullRankingPage] = useState(1);
  const [fullRankingView, setFullRankingView] = useState<"overall" | "women">("overall");
  const hasDashboardAccess = profile ? ORGANIZER_ROLES.includes(profile.role as (typeof ORGANIZER_ROLES)[number]) : false;
  const organizerSessionActive = Boolean(accessToken && hasDashboardAccess);
  const apiHost = getApiHost();
  const themeLabel = theme === "dark" ? "Dark" : "Light";
  const deferredRunnerQuery = useDeferredValue(runnerQuery);

  useEffect(() => {
    if (!supabase) {
      setIsAuthenticated(false);
      setAccessToken(null);
      setProfile(null);
      setIsBootstrapping(false);
      return;
    }

    void supabase.auth.getSession().then(({ data }) => {
      setIsAuthenticated(Boolean(data.session));
      setAccessToken(data.session?.access_token ?? null);
      setProfile(data.session ? deriveProfileFromSession(data.session) : null);
      setIsBootstrapping(false);
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(Boolean(session));
      setAccessToken(session?.access_token ?? null);
      setProfile(session ? deriveProfileFromSession(session) : null);
      setFetchError(null);
      setIsBootstrapping(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    document.documentElement.dataset.theme = theme;

    return () => {
      delete document.documentElement.dataset.theme;
    };
  }, [theme]);

  useEffect(() => {
    if (!isLoginModalOpen) {
      return;
    }

    function handleKeydown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsLoginModalOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeydown);

    return () => {
      window.removeEventListener("keydown", handleKeydown);
    };
  }, [isLoginModalOpen]);

  useEffect(() => {
    if (!isAuthenticated || !profile) {
      return;
    }

    if (hasDashboardAccess) {
      setIsLoginModalOpen(false);
      setLoginError(null);
      return;
    }

    setLoginError("Akun ini masuk sebagai spectator. Login dengan admin, panitia, atau observer untuk membuka tools organizer.");
  }, [hasDashboardAccess, isAuthenticated, profile]);

  useEffect(() => {
    if (isBootstrapping) {
      return;
    }

    const token = organizerSessionActive ? accessToken : null;
    let isMounted = true;

    async function refreshRaceHub() {
      if (document.visibilityState === "hidden") {
        return;
      }

      try {
        if (isMounted) {
          setIsRefreshing(true);
        }

        const [nextOverallLeaderboard, nextWomenLeaderboard, checkpointLeaderboards, nextRecentPassings, organizerSignals] =
          await Promise.all([
            fetchOverallLeaderboard(token, undefined, 120),
            fetchOverallLeaderboard(token, "women", 12).catch(() => emptyOverallLeaderboard),
            fetchCheckpointLeaderboards(token),
            fetchRecentPassings(token).catch(() => null),
            token ? fetchOrganizerSignals(token).catch(() => null) : Promise.resolve(null)
          ]);

        if (!isMounted) {
          return;
        }

        setOverallLeaderboard(nextOverallLeaderboard ?? emptyOverallLeaderboard);
        setWomenLeaderboard(
          normalizeWomenLeaderboard(nextOverallLeaderboard ?? emptyOverallLeaderboard, nextWomenLeaderboard ?? emptyOverallLeaderboard)
        );
        setLeaderboards((current) => mergeCheckpointBoards(current, checkpointLeaderboards));
        setDuplicates(organizerSignals?.duplicates ?? []);
        setNotifications(organizerSignals?.notifications ?? []);
        setRecentPassings(nextRecentPassings ?? buildRecentPassingsFallback(checkpointLeaderboards));
        setRecentPassingsMode(nextRecentPassings ? "server" : "fallback");
        setLastUpdatedAt(
          new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit"
          })
        );
        setFetchError(null);

        if (!token) {
          setLiveStatus("polling");
        }
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setFetchError(error instanceof Error ? error.message : "Dashboard tidak bisa mengambil data terbaru dari server.");

        if (!token) {
          setLiveStatus("fallback");
        }
      } finally {
        if (isMounted) {
          setIsRefreshing(false);
        }
      }
    }

    void refreshRaceHub();
    const intervalId = window.setInterval(() => void refreshRaceHub(), token ? 25000 : 12000);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, [accessToken, isBootstrapping, organizerSessionActive]);

  useEffect(() => {
    if (organizerSessionActive) {
      return;
    }

    setLiveStatus("polling");
    setLastLiveEventAt(null);
  }, [organizerSessionActive]);

  useEffect(() => {
    if (!supabase || !organizerSessionActive || !accessToken) {
      if (!organizerSessionActive) {
        setLiveStatus("polling");
      }
      return;
    }

    const token = accessToken;
    const supabaseClient = supabase;
    let debounceId: number | null = null;
    void supabaseClient.realtime.setAuth(token);

    const triggerRefresh = () => {
      if (debounceId) {
        window.clearTimeout(debounceId);
      }

      debounceId = window.setTimeout(async () => {
        try {
          const [nextOverallLeaderboard, nextWomenLeaderboard, checkpointLeaderboards, nextRecentPassings, organizerSignals] =
            await Promise.all([
              fetchOverallLeaderboard(token, undefined, 120),
              fetchOverallLeaderboard(token, "women", 12).catch(() => emptyOverallLeaderboard),
              fetchCheckpointLeaderboards(token),
              fetchRecentPassings(token).catch(() => null),
              fetchOrganizerSignals(token).catch(() => null)
            ]);

          setOverallLeaderboard(nextOverallLeaderboard ?? emptyOverallLeaderboard);
          setWomenLeaderboard(
            normalizeWomenLeaderboard(nextOverallLeaderboard ?? emptyOverallLeaderboard, nextWomenLeaderboard ?? emptyOverallLeaderboard)
          );
          setLeaderboards((current) => mergeCheckpointBoards(current, checkpointLeaderboards));
          setDuplicates(organizerSignals?.duplicates ?? []);
          setNotifications(organizerSignals?.notifications ?? []);
          setRecentPassings(nextRecentPassings ?? buildRecentPassingsFallback(checkpointLeaderboards));
          setRecentPassingsMode(nextRecentPassings ? "server" : "fallback");
          setLastUpdatedAt(
            new Date().toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit"
            })
          );
          setFetchError(null);
          setLastLiveEventAt(
            new Date().toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit"
            })
          );
        } catch (error) {
          setFetchError(error instanceof Error ? error.message : "Realtime refresh gagal.");
        }
      }, 180);
    };

    const channel = supabaseClient
      .channel(`dashboard-live-${profile?.role ?? "observer"}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "scans" }, triggerRefresh)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "audit_logs" }, triggerRefresh)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "top5_notifications" }, triggerRefresh)
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setLiveStatus("live");
          return;
        }

        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          setLiveStatus("fallback");
        }
      });

    return () => {
      if (debounceId) {
        window.clearTimeout(debounceId);
      }

      void supabaseClient.removeChannel(channel);
    };
  }, [accessToken, organizerSessionActive, profile?.role]);

  useEffect(() => {
    if (isBootstrapping || !selectedCheckpointId) {
      return;
    }

    const token = organizerSessionActive ? accessToken : null;
    let isMounted = true;

    void fetchCheckpointLeaderboard(selectedCheckpointId, token)
      .then((board) => {
        if (!isMounted) {
          return;
        }

        setLeaderboards((current) => {
          const next = current.map((item) => (item.checkpointId === board.checkpointId ? board : item));
          return next.some((item) => item.checkpointId === board.checkpointId) ? next : [...current, board];
        });
      })
      .catch(() => {
        // Keep the summary board on screen; detail fetch should never blank the dashboard.
      });

    return () => {
      isMounted = false;
    };
  }, [accessToken, isBootstrapping, lastUpdatedAt, organizerSessionActive, selectedCheckpointId]);

  useEffect(() => {
    if (isBootstrapping) {
      return;
    }

    const token = organizerSessionActive ? accessToken : null;
    let isMounted = true;

    async function loadRunnerSearch() {
      try {
        if (isMounted) {
          setIsSearchingRunners(true);
        }

        const items = await fetchRunnerSearch(
          {
            query: deferredRunnerQuery,
            checkpointId: runnerCheckpointFilter
          },
          token
        );

        if (!isMounted) {
          return;
        }

        setRunnerResults(items);
        setRunnerSearchMode("server");
        setRunnerSearchError(null);
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setRunnerResults(buildRunnerFallbackResults(overallLeaderboard.topEntries, deferredRunnerQuery, runnerCheckpointFilter));
        setRunnerSearchMode("fallback");
        setRunnerSearchError(null);
      } finally {
        if (isMounted) {
          setIsSearchingRunners(false);
        }
      }
    }

    void loadRunnerSearch();

    return () => {
      isMounted = false;
    };
  }, [accessToken, deferredRunnerQuery, isBootstrapping, organizerSessionActive, lastUpdatedAt, overallLeaderboard.topEntries, runnerCheckpointFilter]);

  useEffect(() => {
    window.localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favoriteBibs));
  }, [favoriteBibs]);

  const fullRankingSource = fullRankingView === "women" ? womenLeaderboard : overallLeaderboard;

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(fullRankingSource.topEntries.length / FULL_RANKING_PAGE_SIZE));
    setFullRankingPage((current) => Math.min(current, totalPages));
  }, [fullRankingSource.topEntries.length]);

  useEffect(() => {
    setFullRankingPage(1);
  }, [fullRankingView]);

  useEffect(() => {
    if (!runnerResults.length) {
      setSelectedRunnerBib(null);
      return;
    }

    setSelectedRunnerBib((current) => {
      if (current && runnerResults.some((entry) => entry.bib === current)) {
        return current;
      }

      return runnerResults[0]?.bib ?? null;
    });
  }, [runnerResults]);

  useEffect(() => {
    if (isBootstrapping || !selectedRunnerBib) {
      setRunnerDetail(null);
      return;
    }

    const token = organizerSessionActive ? accessToken : null;
    const runnerBib = selectedRunnerBib;
    let isMounted = true;

    async function loadRunnerDetail() {
      try {
        if (isMounted) {
          setIsLoadingRunnerDetail(true);
        }

        const detail = await fetchRunnerDetail(runnerBib, token);

        if (!isMounted) {
          return;
        }

        setRunnerDetail(detail);
        setRunnerDetailError(null);
      } catch (error) {
        if (!isMounted) {
          return;
        }

        const fallbackDetail =
          (await buildRunnerDetailFromCheckpointBoards(runnerBib, token, overallLeaderboard.topEntries).catch(() => null)) ??
          buildRunnerDetailFallback(overallLeaderboard.topEntries, runnerBib);

        setRunnerDetail(fallbackDetail);
        setRunnerDetailError(error instanceof Error ? error.message : "Detail pelari belum tersedia.");
      } finally {
        if (isMounted) {
          setIsLoadingRunnerDetail(false);
        }
      }
    }

    void loadRunnerDetail();

    return () => {
      isMounted = false;
    };
  }, [accessToken, isBootstrapping, organizerSessionActive, overallLeaderboard.topEntries, selectedRunnerBib]);

  const selectedBoard = useMemo(() => {
    return leaderboards.find((item) => item.checkpointId === selectedCheckpointId) ?? leaderboards[0] ?? null;
  }, [leaderboards, selectedCheckpointId]);

  const overallLeader = overallLeaderboard.topEntries[0] ?? null;
  const nameByBib = useMemo(
    () => new Map(overallLeaderboard.topEntries.map((entry) => [entry.bib.toUpperCase(), entry.name])),
    [overallLeaderboard.topEntries]
  );

  const totalOfficialScans = useMemo(() => {
    return leaderboards.reduce((sum, item) => sum + item.totalOfficialScans, 0);
  }, [leaderboards]);

  const totalRankedRunners = overallLeaderboard.totalRankedRunners;

  const activeCheckpointCount = useMemo(() => {
    return leaderboards.filter((item) => item.totalOfficialScans > 0).length;
  }, [leaderboards]);
  const finisherCount = useMemo(() => {
    return leaderboards.find((item) => item.checkpointId === "finish")?.totalOfficialScans ?? 0;
  }, [leaderboards]);
  const starterCount = useMemo(() => {
    return leaderboards.find((item) => item.checkpointId === "cp-start")?.totalOfficialScans ?? totalRankedRunners;
  }, [leaderboards, totalRankedRunners]);
  const dnfDnsCount = Math.max(starterCount - finisherCount, 0);

  const courseProfileStops = useMemo(() => {
    return demoCourse.checkpoints.map((checkpoint) => {
      const board = leaderboards.find((item) => item.checkpointId === checkpoint.id);
      const leader = board?.topEntries[0] ?? null;
      const isLeaderHere = overallLeader?.checkpointId === checkpoint.id;

      return {
        ...checkpoint,
        totalOfficialScans: board?.totalOfficialScans ?? 0,
        leaderBib: leader?.bib ?? null,
        isLeaderHere
      };
    });
  }, [leaderboards, overallLeader]);

  const sidebarOverallRows = overallLeaderboard.topEntries.slice(0, 5);
  const sidebarWomenRows = womenLeaderboard.topEntries.slice(0, 5);

  const lastBroadcast = notifications[0] ?? null;
  const latestPassing = recentPassings[0] ?? null;
  const selectedCheckpointMeta = defaultCheckpoints.find((item) => item.id === selectedBoard?.checkpointId) ?? null;
  const runnerSearchSummary = useMemo(() => {
    if (runnerQuery.trim() || runnerCheckpointFilter !== "all") {
      return `${runnerResults.length} pelari cocok`;
    }

    return `Top ${runnerResults.length} runner siap dicari`;
  }, [runnerCheckpointFilter, runnerQuery, runnerResults.length]);
  const favoriteRunnerResults = useMemo(() => {
    const favoriteSet = new Set(favoriteBibs);
    return overallLeaderboard.topEntries.filter((entry) => favoriteSet.has(entry.bib));
  }, [favoriteBibs, overallLeaderboard.topEntries]);
  const recentPassingSummary = useMemo(() => {
    if (!recentPassings.length) {
      return "Belum ada passing";
    }

    return `${recentPassings.length} passing terbaru`;
  }, [recentPassings.length]);
  const totalDistanceKm = demoCourse.distanceKm;
  const fullRankingPageCount = Math.max(1, Math.ceil(fullRankingSource.topEntries.length / FULL_RANKING_PAGE_SIZE));
  const fullRankingRows = fullRankingSource.topEntries.slice(
    (fullRankingPage - 1) * FULL_RANKING_PAGE_SIZE,
    fullRankingPage * FULL_RANKING_PAGE_SIZE
  );
  const fullRankingRangeLabel = fullRankingSource.topEntries.length
    ? `${(fullRankingPage - 1) * FULL_RANKING_PAGE_SIZE + 1}-${Math.min(
        fullRankingPage * FULL_RANKING_PAGE_SIZE,
        fullRankingSource.topEntries.length
      )} dari ${fullRankingSource.topEntries.length}`
    : "0 runner";
  const eventTitle = demoCourse.title;
  const eventSubtitleText = `${demoCourse.location} | ${demoCourse.subtitle}`;
  const accessLabel = organizerSessionActive ? "Organizer tools" : "Spectator view";
  const liveStatusLabel =
    liveStatus === "live"
      ? "Live Realtime"
      : liveStatus === "polling"
        ? "Public Live"
        : liveStatus === "fallback"
          ? "Fallback Sync"
          : "Loading";
  const accessNotice = isBootstrapping
    ? "Menyiapkan sesi organizer dan race hub..."
    : organizerSessionActive
      ? `Organizer tools aktif untuk ${profile?.displayName ?? profile?.email ?? profile?.role ?? "akun ini"}.`
      : profile
        ? `Akun role ${profile.role} tetap berada di spectator view. Login dengan admin, panitia, atau observer untuk tools organizer.`
        : "Spectator dapat mengikuti race tanpa login. Organizer cukup login dari tombol header untuk membuka tools operasional.";
  const heroRaceFacts = [
    { label: "Distance", value: `${totalDistanceKm.toFixed(1)} KM` },
    { label: "Ascent", value: `${demoCourse.ascentM} M+` },
    { label: "Finishers", value: `${finisherCount}` },
    { label: "Live mode", value: liveStatusLabel }
  ];
  const raceStatistics = [
    {
      label: "Starters",
      value: `${starterCount}`,
      note: "Runner yang sudah tercatat mulai race."
    },
    {
      label: "DNF / DNS",
      value: `${dnfDnsCount}`,
      note: "Gabungan runner yang belum finish."
    },
    {
      label: "Finishers",
      value: `${finisherCount}`,
      note: "Runner yang sudah mencapai finish."
    }
  ];
  function toggleFavoriteBib(bib: string) {
    setFavoriteBibs((current) =>
      current.includes(bib) ? current.filter((item) => item !== bib) : [...current, bib].sort((left, right) => left.localeCompare(right))
    );
  }

  function handleLogout() {
    if (supabase) {
      void supabase.auth.signOut();
    }

    setLoginError(null);
    setLoginPassword("");
    setIsLoginModalOpen(false);
  }

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase) {
      setLoginError("Supabase auth belum terhubung di environment ini.");
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

  function focusRanking(view: "overall" | "women") {
    setFullRankingView(view);
    document.getElementById("full-ranking")?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }

  function focusRunnerSearch() {
    document.getElementById("runner-finder")?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }

  return (
    <main className="dashboard-shell dashboard-hub-shell">
      <aside className="dashboard-sidebar">
        <div className="sidebar-brand">
          <span className="brand-kicker">ApexRM Live</span>
          <h1>Race Hub</h1>
          <p>{eventTitle}</p>
          <small>{eventSubtitleText}</small>
        </div>

        <article className="sidebar-card sidebar-ranking-card" id="race-leaders">
          <div className="panel-head compact">
            <div>
              <p className="section-label">Ranking</p>
              <h3>Overall</h3>
            </div>
          </div>
          <div className="mini-leaderboard">
            {sidebarOverallRows.length ? (
              sidebarOverallRows.map((entry) => (
                <div className="mini-leaderboard-row" key={`sidebar-overall-${entry.bib}`}>
                  <strong>{entry.rank}</strong>
                  <div>
                    <span>{entry.name}</span>
                    <small>{entry.bib}</small>
                  </div>
                </div>
              ))
            ) : (
              <div className="empty-compact">Belum ada pelari di ranking overall.</div>
            )}
          </div>
          <button className="sidebar-more" onClick={() => focusRanking("overall")} type="button">
            See More
          </button>
        </article>

        <article className="sidebar-card sidebar-ranking-card">
          <div className="panel-head compact">
            <div>
              <p className="section-label">Ranking</p>
              <h3>Woman</h3>
            </div>
          </div>
          <div className="mini-leaderboard">
            {sidebarWomenRows.length ? (
              sidebarWomenRows.map((entry) => (
                <div className="mini-leaderboard-row" key={`sidebar-women-${entry.bib}`}>
                  <strong>{entry.rank}</strong>
                  <div>
                    <span>{entry.name}</span>
                    <small>{entry.bib}</small>
                  </div>
                </div>
              ))
            ) : (
              <div className="empty-compact">Belum ada runner woman di data event ini.</div>
            )}
          </div>
          <button className="sidebar-more" onClick={() => focusRanking("women")} type="button">
            See More
          </button>
        </article>

        {organizerSessionActive ? (
          <button className="sidebar-logout" onClick={handleLogout} type="button">
            Logout Organizer
          </button>
        ) : (
          <button
            className="sidebar-logout"
            onClick={() => {
              setLoginError(null);
              setIsLoginModalOpen(true);
            }}
            type="button"
          >
            Organizer Login
          </button>
        )}
      </aside>

      <div className="dashboard-main">
        <header className="topbar topbar-hub">
          <div className="topbar-title-block">
            <span className="brand-kicker">Live Race View</span>
            <h1>{eventTitle}</h1>
          </div>

          <div className="topbar-center">
            <label className="topbar-select topbar-select-shell">
              <span className="sr-only">Race selector</span>
              <select defaultValue="grand-trail-des-templiers">
                <option value="grand-trail-des-templiers">{eventTitle}</option>
              </select>
            </label>

            <label className="topbar-search topbar-search-shell">
              <span className="sr-only">Search a runner</span>
              <input
                placeholder="Search a runner..."
                value={runnerQuery}
                onChange={(event) => setRunnerQuery(event.target.value)}
              />
              <button className="topbar-search-button" onClick={focusRunnerSearch} type="button">
                Go
              </button>
            </label>
          </div>

          <div className="topbar-actions">
            {organizerSessionActive ? (
              <button className="topbar-link-button topbar-link-button-active" onClick={handleLogout} type="button">
                Logout
              </button>
            ) : (
              <button
                className="topbar-link-button"
                onClick={() => {
                  setLoginError(null);
                  setIsLoginModalOpen(true);
                }}
                type="button"
              >
                Login
              </button>
            )}

            <button className="compact-theme-toggle" onClick={() => setTheme((current) => getNextTheme(current))} type="button">
              {themeLabel}
            </button>
          </div>
        </header>

        <section className="hero-panel hero-race-panel" id="race-hub">
          <div className="hero-copy">
            <div className="hero-badges">
              <span className="status-chip active">Live</span>
              <span className="status-chip">{liveStatusLabel}</span>
              <span className="status-chip">Updated {lastUpdatedAt ?? "--:--:--"}</span>
            </div>
            <p className="section-label">Race Hub</p>
            <h2>{eventTitle}</h2>
            <p className="section-copy">{eventSubtitleText}</p>
            <div className="hero-inline-stats">
              {heroRaceFacts.map((fact) => (
                <div className="inline-stat" key={fact.label}>
                  <span>{fact.label}</span>
                  <strong>{fact.value}</strong>
                </div>
              ))}
            </div>
          </div>
          <div className="hero-metrics">
            <article className="metric-card primary">
              <span>Overall ranked runners</span>
              <strong>{totalRankedRunners}</strong>
            </article>
          <article className="metric-card">
            <span>Total scan resmi</span>
            <strong>{totalOfficialScans}</strong>
          </article>
            <article className="metric-card">
              <span>Checkpoint aktif</span>
              <strong>{activeCheckpointCount}</strong>
            </article>
            <article className="metric-card">
              <span>Recent passings</span>
              <strong>{recentPassings.length}</strong>
            </article>
          </div>
        </section>

        <div className={`notice-banner ${organizerSessionActive ? "success" : "info"}`}>{accessNotice}</div>

      <section className="panel stats-panel" id="race-statistics">
        <div className="panel-head">
          <div>
            <p className="section-label">The Race</p>
            <h3>Statistics</h3>
          </div>
          <div className="panel-badge">
            <span>Checkpoint aktif</span>
            <strong>{activeCheckpointCount}</strong>
          </div>
        </div>
        <div className="stats-grid">
          {raceStatistics.map((stat) => (
            <article className="stats-card" key={stat.label}>
              <span>{stat.label}</span>
              <strong>{stat.value}</strong>
              <small>{stat.note}</small>
            </article>
          ))}
        </div>
      </section>

      <section className="spotlight-grid">
        <CourseProfilePanel
          courseStops={courseProfileStops}
          selectedCheckpointId={selectedCheckpointId}
          onSelectCheckpoint={setSelectedCheckpointId}
        />
      </section>

      {fetchError ? <div className="notice-banner error">{fetchError}</div> : null}

      <section className="control-grid">
        <article className="panel leaderboard-panel full-ranking-panel" id="full-ranking">
          <div className="panel-head">
            <div>
              <p className="section-label">Full Ranking</p>
              <h3>{fullRankingView === "women" ? "Standings kategori women" : "Standings resmi seluruh race"}</h3>
            </div>
            <div className="panel-badge">
              <span>{fullRankingView === "women" ? "Women ranked" : "Ranked runners"}</span>
              <strong>{fullRankingSource.totalRankedRunners}</strong>
            </div>
          </div>
          <div className="ranking-mode-switch" role="tablist" aria-label="Full ranking view switch">
            <button
              aria-selected={fullRankingView === "overall"}
              className={`route-tab ${fullRankingView === "overall" ? "active" : ""}`}
              onClick={() => setFullRankingView("overall")}
              role="tab"
              type="button"
            >
              Overall
            </button>
            <button
              aria-selected={fullRankingView === "women"}
              className={`route-tab ${fullRankingView === "women" ? "active" : ""}`}
              onClick={() => setFullRankingView("women")}
              role="tab"
              type="button"
            >
              Woman
            </button>
          </div>

          <div className="full-ranking-list" role="list" aria-label="Overall leaderboard rows">
            {fullRankingRows.length ? (
              fullRankingRows.map((entry) => {
                return (
                  <div className="full-ranking-row" key={`${entry.checkpointId}-${entry.bib}`} role="listitem">
                    <div className="leaderboard-rank">
                      <strong>#{entry.rank}</strong>
                    </div>
                    <div className="runner-cell">
                      <div className="runner-avatar">{getInitials(entry.name)}</div>
                      <div>
                        <strong>{entry.name}</strong>
                        <span>
                          BIB #{entry.bib} • <span className="category-badge">{formatCategoryLabel(entry.category)}</span>
                        </span>
                      </div>
                    </div>
                    <div className="detail-cell">
                      <span className="detail-label">Progress</span>
                      <strong>{formatCheckpointLabel({ code: entry.checkpointCode, kmMarker: entry.checkpointKmMarker })}</strong>
                      <span>{entry.checkpointName}</span>
                    </div>
                    <div className="detail-cell">
                      <span className="detail-label">Scan terakhir</span>
                      <strong>{formatScanTime(entry.scannedAt)}</strong>
                    </div>
                    <div className="detail-cell">
                      <span className="detail-label">Crew / Device</span>
                      <strong>{entry.crewId}</strong>
                      <span>{entry.deviceId}</span>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="empty-state">
                <strong>Belum ada pelari yang masuk overall ranking.</strong>
                <span>Begitu scan resmi pertama masuk, papan overall akan dihitung otomatis dari progres checkpoint.</span>
              </div>
            )}
          </div>

          <div className="ranking-pager">
            <div className="mini-stat">
              <span>Rows</span>
              <strong>{fullRankingRangeLabel}</strong>
            </div>
            <div className="pager-actions">
              <button
                className="theme-toggle pager-button"
                disabled={fullRankingPage <= 1}
                onClick={() => setFullRankingPage((current) => Math.max(1, current - 1))}
                type="button"
              >
                Prev
              </button>
              <div className="meta-card pager-indicator">
                <span>Page</span>
                <strong>
                  {fullRankingPage} / {fullRankingPageCount}
                </strong>
              </div>
              <button
                className="theme-toggle pager-button"
                disabled={fullRankingPage >= fullRankingPageCount}
                onClick={() => setFullRankingPage((current) => Math.min(fullRankingPageCount, current + 1))}
                type="button"
              >
                Next
              </button>
            </div>
          </div>
        </article>

        <aside className="rail">
          <article className="panel rail-panel" id="recent-passings">
            <div className="panel-head">
              <div>
                <p className="section-label">Race Pulse</p>
                <h3>Recent Passings</h3>
              </div>
              <div className="panel-badge compact-badge">
                <span>Source</span>
                <strong>{recentPassingSummary}</strong>
                <span>{recentPassingsMode === "server" ? "live feed" : "fallback feed"}</span>
              </div>
            </div>
            {latestPassing ? (
              <div className="pulse-card">
                <span className="broadcast-tag">Latest passing</span>
                <strong>
                  {latestPassing.name} · {formatCheckpointLabel({
                    code: latestPassing.checkpointCode,
                    kmMarker: latestPassing.checkpointKmMarker
                  })}
                </strong>
                <p>
                  BIB {latestPassing.bib} | Posisi #{latestPassing.position} | {formatRelativeTime(latestPassing.scannedAt)}
                </p>
              </div>
            ) : (
              <div className="empty-compact">Belum ada passing resmi yang masuk.</div>
            )}
            <ul className="feed-list compact-feed-list">
              {recentPassings.slice(0, 8).map((passing) => (
                <li key={`${passing.bib}-${passing.checkpointId}-${passing.scannedAt}`}>
                  <strong>{passing.name}</strong>
                  <span>
                    {formatCheckpointLabel({
                      code: passing.checkpointCode,
                      kmMarker: passing.checkpointKmMarker
                    })}{" "}
                    | Pos #{passing.position}
                  </span>
                  <span>
                    Crew {passing.crewId} | {passing.deviceId}
                  </span>
                  <time>{formatRelativeTime(passing.scannedAt)}</time>
                </li>
              ))}
            </ul>
          </article>

          {organizerSessionActive ? (
            <article className="panel rail-panel" id="signals">
              <div className="panel-head">
                <div>
                  <p className="section-label">Signals</p>
                  <h3>Broadcast & Audit</h3>
                </div>
              </div>
              <div className="signal-stack">
                <section className="signal-section">
                  <div className="signal-head">
                    <span className="detail-label">Top 5 Broadcast</span>
                    <strong>{notifications.length}</strong>
                  </div>
                  {lastBroadcast ? (
                    <div className="broadcast-card compact">
                      <span className="broadcast-tag">Telegram Ready</span>
                      <strong>BIB {lastBroadcast.bib} masuk posisi #{lastBroadcast.position}</strong>
                      <p>
                        Checkpoint {lastBroadcast.checkpointId} pada {formatScanTime(lastBroadcast.createdAt)}.
                      </p>
                    </div>
                  ) : (
                    <div className="empty-compact">Belum ada event Top 5 yang perlu dibroadcast.</div>
                  )}
                  <ul className="feed-list compact-feed-list">
                    {notifications.slice(0, 4).map((notification) => (
                      <li key={notification.id}>
                        <strong>BIB {notification.bib}</strong>
                        <span>{notification.checkpointId} | posisi #{notification.position}</span>
                        <time>{formatScanTime(notification.createdAt)}</time>
                      </li>
                    ))}
                  </ul>
                </section>

                <section className="signal-section">
                  <div className="signal-head">
                    <span className="detail-label">Duplicate Audit</span>
                    <strong>{duplicates.length}</strong>
                  </div>
                  <ul className="feed-list compact-feed-list">
                    {duplicates.slice(0, 4).map((duplicate) => (
                      <li key={duplicate.clientScanId}>
                        <strong>BIB {duplicate.bib}</strong>
                        <span>{duplicate.checkpointId} | first scan {duplicate.firstAcceptedClientScanId}</span>
                        <time>{formatScanTime(duplicate.serverReceivedAt)}</time>
                      </li>
                    ))}
                  </ul>
                  {duplicates.length === 0 ? (
                    <div className="empty-compact">Belum ada duplikat yang perlu diaudit.</div>
                  ) : null}
                </section>
              </div>
            </article>
          ) : (
            <article className="panel rail-panel observer-teaser" id="signals">
              <div className="panel-head">
                <div>
                  <p className="section-label">Organizer Access</p>
                  <h3>Login untuk Tools</h3>
                </div>
              </div>
              <div className="signal-stack">
                <div className="broadcast-card compact">
                  <span className="broadcast-tag">Public View</span>
                  <strong>Penonton tetap bisa menikmati live race tanpa login.</strong>
                  <p>Masuk sebagai organizer untuk audit duplicate, monitor broadcast, dan kontrol operasional event day.</p>
                </div>
                <button
                  className="auth-trigger"
                  onClick={() => {
                    setLoginError(null);
                    setIsLoginModalOpen(true);
                  }}
                  type="button"
                >
                  Login Organizer
                </button>
              </div>
            </article>
          )}
        </aside>
      </section>

      <section className="panel checkpoint-monitor-panel">
        <div className="panel-head">
          <div>
            <p className="section-label">Checkpoint Monitor</p>
            <h3>{selectedCheckpointMeta ? formatCheckpointLabel(selectedCheckpointMeta) : "Pilih checkpoint"}</h3>
          </div>
          <div className="panel-badge">
            <span>Official scans</span>
            <strong>{selectedBoard?.totalOfficialScans ?? 0}</strong>
          </div>
        </div>

        <div className="checkpoint-strip" aria-label="Checkpoint switcher">
          {leaderboards.map((board) => {
            const checkpoint = defaultCheckpoints.find((item) => item.id === board.checkpointId);
            const isActive = board.checkpointId === selectedBoard?.checkpointId;

            return (
              <button
                className={`checkpoint-chip ${isActive ? "active" : ""}`}
                key={board.checkpointId}
                onClick={() => setSelectedCheckpointId(board.checkpointId)}
                type="button"
              >
                <span>{checkpoint ? checkpoint.code : board.checkpointId}</span>
                <strong>{board.totalOfficialScans}</strong>
              </button>
            );
          })}
        </div>

        <div className="leaderboard-table" role="table" aria-label="Selected checkpoint leaderboard">
          <div className="leaderboard-head" role="row">
            <span>Pos</span>
            <span>Pelari</span>
            <span>Scan time</span>
            <span>Crew</span>
            <span>Device</span>
          </div>

          {selectedBoard?.topEntries.length ? (
            selectedBoard.topEntries.map((entry) => {
              const runnerLabel = nameByBib.get(entry.bib.toUpperCase()) ?? `Runner ${entry.bib}`;

              return (
                <div className="leaderboard-row" key={`${entry.checkpointId}-${entry.bib}`} role="row">
                  <div className="leaderboard-rank">
                    <strong>#{entry.position}</strong>
                  </div>
                  <div className="runner-cell">
                    <div className="runner-avatar">{getInitials(runnerLabel)}</div>
                    <div>
                      <strong>{runnerLabel}</strong>
                      <span>BIB #{entry.bib}</span>
                    </div>
                  </div>
                  <div className="detail-cell">
                    <span className="detail-label">Scan time</span>
                    <strong>{formatScanTime(entry.scannedAt)}</strong>
                  </div>
                  <div className="detail-cell">
                    <span className="detail-label">Crew</span>
                    <strong>{entry.crewId}</strong>
                  </div>
                  <div className="detail-cell">
                    <span className="detail-label">Device</span>
                    <strong>{entry.deviceId}</strong>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="empty-state">
              <strong>Belum ada scan resmi di checkpoint ini.</strong>
              <span>Panel ini tetap dipakai untuk audit per titik CP, tapi bukan leaderboard utama lagi.</span>
            </div>
          )}
        </div>
      </section>

      <section className="panel runner-search-panel" id="runner-finder">
        <div className="panel-head">
          <div>
            <p className="section-label">Cari Pelari</p>
            <h3>Runner Finder & Passings</h3>
          </div>
          <div className="panel-badge">
            <span>Lookup</span>
            <strong>{runnerSearchSummary}</strong>
            <span>{runnerSearchMode === "server" ? "live index" : "fallback index"}</span>
          </div>
        </div>

        <div className="runner-search-toolbar">
          <label>
            Filter progress checkpoint
            <select value={runnerCheckpointFilter} onChange={(event) => setRunnerCheckpointFilter(event.target.value)}>
              <option value="all">Semua progress</option>
              {defaultCheckpoints.map((checkpoint) => (
                <option key={checkpoint.id} value={checkpoint.id}>
                  {formatCheckpointLabel(checkpoint)} | {checkpoint.name}
                </option>
              ))}
            </select>
          </label>

          <div className="mini-stat">
            <span>Current search</span>
            <strong>{runnerQuery.trim() ? runnerQuery : "Semua pelari"}</strong>
          </div>
        </div>

        {runnerSearchError ? <div className="empty-compact">{runnerSearchError}</div> : null}

        <div className="favorites-strip">
          <span className="detail-label">Favorites</span>
          {favoriteRunnerResults.length ? (
            favoriteRunnerResults.map((entry) => (
              <button
                className={`favorite-chip ${selectedRunnerBib === entry.bib ? "active" : ""}`}
                key={entry.bib}
                onClick={() => setSelectedRunnerBib(entry.bib)}
                type="button"
              >
                <strong>{entry.bib}</strong>
                <span>#{entry.rank}</span>
              </button>
            ))
          ) : (
            <div className="empty-compact">Belum ada pelari favorit. Tandai dari hasil search untuk pantau cepat.</div>
          )}
        </div>

        <div className="runner-hub-grid">
          <div className="runner-search-results">
            {runnerResults.length ? (
              runnerResults.map((entry) => {
                const isSelected = selectedRunnerBib === entry.bib;
                const isFavorite = favoriteBibs.includes(entry.bib);

                return (
                  <article className={`runner-search-card ${isSelected ? "selected" : ""}`} key={`${entry.rank}-${entry.bib}`}>
                    <div className="runner-card-head">
                      <div className="runner-cell">
                        <div className="runner-avatar">{getInitials(entry.name)}</div>
                        <div>
                          <strong>{entry.name}</strong>
                          <span>BIB #{entry.bib}</span>
                        </div>
                      </div>
                      <button
                        className={`favorite-toggle ${isFavorite ? "active" : ""}`}
                        onClick={() => toggleFavoriteBib(entry.bib)}
                        type="button"
                      >
                        {isFavorite ? "Favorit" : "Ikuti"}
                      </button>
                    </div>
                    <button className="runner-card-select" onClick={() => setSelectedRunnerBib(entry.bib)} type="button">
                      <div className="runner-search-rank">
                        <span>Overall rank</span>
                        <strong>#{entry.rank}</strong>
                      </div>
                      <div className="runner-search-main">
                        <div className="runner-search-meta">
                          <div className="detail-cell">
                            <span className="detail-label">Progress</span>
                            <strong>{formatCheckpointProgress(entry)}</strong>
                          </div>
                          <div className="detail-cell">
                            <span className="detail-label">Scan terakhir</span>
                            <strong>{formatScanTime(entry.scannedAt)}</strong>
                          </div>
                          <div className="detail-cell">
                            <span className="detail-label">Crew / Device</span>
                            <strong>{entry.crewId}</strong>
                            <span>{entry.deviceId}</span>
                          </div>
                        </div>
                      </div>
                    </button>
                  </article>
                );
              })
            ) : (
              <div className="empty-state">
                <strong>{isSearchingRunners ? "Mencari pelari..." : "Belum ada pelari yang cocok."}</strong>
                <span>
                  {runnerQuery.trim() || runnerCheckpointFilter !== "all"
                    ? "Ubah keyword atau filter progress untuk menemukan pelari yang dicari."
                    : "Panel ini menampilkan runner teratas lebih dulu. Ketik BIB untuk lookup cepat saat race berjalan."}
                </span>
              </div>
            )}
          </div>

          <aside className="runner-detail-panel" id="my-runner">
            <div className="panel-head compact">
              <div>
                <p className="section-label">Runner Detail</p>
                <h3>{runnerDetail ? runnerDetail.bib : "Pilih pelari"}</h3>
              </div>
              {runnerDetail ? (
                <div className="panel-badge">
                  <span>Overall rank</span>
                  <strong>#{runnerDetail.rank}</strong>
                </div>
              ) : null}
            </div>

            {runnerDetail ? (
              <>
                <div className="runner-detail-summary">
                  <div className="runner-cell">
                    <div className="runner-avatar">{getInitials(runnerDetail.name)}</div>
                    <div>
                      <strong>{runnerDetail.name}</strong>
                      <span>BIB #{runnerDetail.bib}</span>
                    </div>
                  </div>
                  <div className="runner-detail-stats">
                    <div className="mini-stat">
                      <span>Current progress</span>
                      <strong>
                        {formatCheckpointLabel({
                          code: runnerDetail.currentCheckpointCode,
                          kmMarker: runnerDetail.currentCheckpointKmMarker
                        })}
                      </strong>
                    </div>
                    <div className="mini-stat">
                      <span>Total passings</span>
                      <strong>{runnerDetail.totalPassings}</strong>
                    </div>
                    <div className="mini-stat">
                      <span>Last scan</span>
                      <strong>{formatScanTime(runnerDetail.lastScannedAt)}</strong>
                    </div>
                  </div>
                </div>

                {runnerDetailError ? <div className="empty-compact">{runnerDetailError}</div> : null}

                <div className="passings-list">
                  {runnerDetail.passings.length ? (
                    runnerDetail.passings.map((passing) => (
                      <article className="passing-card" key={`${runnerDetail.bib}-${passing.checkpointId}`}>
                        <div>
                          <span className="detail-label">Checkpoint</span>
                          <strong>
                            {formatCheckpointLabel({
                              code: passing.checkpointCode,
                              kmMarker: passing.checkpointKmMarker
                            })}
                          </strong>
                          <span>{passing.checkpointName}</span>
                        </div>
                        <div>
                          <span className="detail-label">Passing</span>
                          <strong>{formatScanTime(passing.scannedAt)}</strong>
                          <span>Posisi #{passing.position}</span>
                        </div>
                        <div>
                          <span className="detail-label">Crew</span>
                          <strong>{passing.crewId}</strong>
                          <span>{passing.deviceId}</span>
                        </div>
                      </article>
                    ))
                  ) : (
                    <div className="empty-compact">
                      {isLoadingRunnerDetail
                        ? "Memuat history passings..."
                        : "History passings detail belum tersedia di endpoint live, jadi sementara pakai summary progress."}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="empty-state">
                <strong>Pilih satu pelari dari hasil search.</strong>
                <span>Panel ini jadi fondasi fitur ala LiveTrail: profile runner, passings, dan favorit.</span>
              </div>
            )}
          </aside>
        </div>
      </section>

      <footer className="runtime-footer">
        <span>Build {__APP_BUILD__}</span>
        <span>Built {new Date(__APP_BUILT_AT__).toLocaleString()}</span>
        <span>API {apiHost}</span>
        <span>Live {liveStatus}</span>
        {lastLiveEventAt ? <span>Last event {lastLiveEventAt}</span> : null}
      </footer>

      {isLoginModalOpen ? (
        <div
          className="auth-modal-overlay"
          onClick={() => setIsLoginModalOpen(false)}
          role="presentation"
        >
          <section
            aria-labelledby="organizer-login-title"
            aria-modal="true"
            className="auth-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="auth-modal-head">
              <div>
                <p className="section-label">Organizer Access</p>
                <h3 id="organizer-login-title">Login</h3>
              </div>
              <button
                aria-label="Tutup modal login"
                className="auth-modal-close"
                onClick={() => setIsLoginModalOpen(false)}
                type="button"
              >
                ×
              </button>
            </div>

            <div className="auth-modal-copy">
              <strong>Organizer, silakan identifikasi diri untuk membuka tools dashboard.</strong>
              <span>Penonton tetap bisa mengikuti race secara gratis tanpa registrasi. Login ini hanya untuk tools operasional organizer.</span>
            </div>

            <form className="auth-modal-form" onSubmit={handleLogin}>
              <label>
                Email
                <input
                  autoComplete="username"
                  placeholder="admin1@arm.local"
                  value={loginEmail}
                  onChange={(event) => setLoginEmail(event.target.value)}
                />
              </label>
              <label>
                Password
                <input
                  autoComplete="current-password"
                  placeholder="Password organizer"
                  type="password"
                  value={loginPassword}
                  onChange={(event) => setLoginPassword(event.target.value)}
                />
              </label>

              {loginError ? <div className="empty-compact">{loginError}</div> : null}

              <div className="auth-modal-actions">
                <button className="auth-trigger" type="submit">
                  Login
                </button>
                <button className="theme-toggle auth-secondary" onClick={() => setIsLoginModalOpen(false)} type="button">
                  Lanjut sebagai penonton
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
      </div>
    </main>
  );
}
