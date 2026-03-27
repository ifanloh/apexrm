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
import { demoRaceFestival, type DemoRaceCard } from "./demoRaceFestival";
import { RaceEditionHome } from "./RaceEditionHome";
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
const EDITION_HOME_VALUE = "__edition-home";
const COUNTRY_CODES = ["ID", "MY", "SG", "AU", "JP", "TH", "PH", "KR", "CN", "VN", "US", "FR"] as const;
const TEAM_NAMES = [
  "Mantra Trail Team",
  "Arjuno Runners",
  "Welirang Collective",
  "Kaliandra Endurance",
  "East Java Mountain Crew",
  "Nusantara Trail Lab",
  "Merah Putih Ultra",
  "Summit Seeker Project",
  "Garuda Trail Society",
  "Tropic Alpine Club"
] as const;

type DashboardTheme = "dark" | "light";
type LiveStatus = "idle" | "live" | "polling" | "fallback";
type RankingView = "overall" | "women" | "men";

function getInitialTheme() {
  if (typeof window === "undefined") {
    return "light" as DashboardTheme;
  }

  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);

  if (stored === "dark" || stored === "light") {
    return stored;
  }

  return "light" as DashboardTheme;
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

function getStableIndex(value: string, size: number) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash % size;
}

function getNationalityCode(bib: string) {
  return COUNTRY_CODES[getStableIndex(bib, COUNTRY_CODES.length)];
}

function getFlagEmoji(countryCode: string) {
  return countryCode
    .toUpperCase()
    .replace(/./g, (character) => String.fromCodePoint(127397 + character.charCodeAt(0)));
}

function getRunnerTeamName(bib: string) {
  return TEAM_NAMES[getStableIndex(bib, TEAM_NAMES.length)];
}

function getDivisionCode(category: string) {
  return category === "women" ? "S-WOH" : "S-MOH";
}

function getRunnerStatusLabel(checkpointId: string) {
  return checkpointId === "finish" ? "Finisher" : "In race";
}

function RankingMedal({ rank }: { rank: number }) {
  if (rank < 1 || rank > 3) {
    return null;
  }

  const medalClass = rank === 1 ? "gold" : rank === 2 ? "silver" : "bronze";

  return (
    <span className={`ranking-medal ${medalClass}`} aria-hidden="true">
      <svg viewBox="0 0 20 20">
        <path d="M6 2.5h3.2l1 3.2H7.7L6 2.5Zm7.8 0H17l-1.7 3.2h-2.5l1-3.2ZM8.6 6.4h2.8l2.3 2.7-3.7 1.4-3.7-1.4 2.3-2.7Zm1.4 5.1a4.2 4.2 0 1 1 0 8.4 4.2 4.2 0 0 1 0-8.4Zm0 1.6a2.6 2.6 0 1 0 0 5.2 2.6 2.6 0 0 0 0-5.2Z" />
      </svg>
    </span>
  );
}

function NavIcon({ name }: { name: "home" | "search" | "runners" | "favorite" | "heart" | "compare" | "podium" | "passings" | "leaders" | "stats" | "contact" }) {
  switch (name) {
    case "home":
      return (
        <svg className="nav-icon-svg" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M2.5 7.2 8 2.7l5.5 4.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
          <path d="M3.7 6.7v6.1h8.6V6.7" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
        </svg>
      );
    case "search":
      return (
        <svg className="nav-icon-svg" viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="6.5" cy="6.5" r="3.8" fill="none" stroke="currentColor" strokeWidth="1.7" />
          <path d="m9.4 9.4 4 4" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
        </svg>
      );
    case "runners":
      return (
        <svg className="nav-icon-svg" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M4 4.2h8M4 8h8M4 11.8h8" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
          <circle cx="2.2" cy="4.2" r="0.9" fill="currentColor" />
          <circle cx="2.2" cy="8" r="0.9" fill="currentColor" />
          <circle cx="2.2" cy="11.8" r="0.9" fill="currentColor" />
        </svg>
      );
    case "favorite":
      return (
        <svg className="nav-icon-svg" viewBox="0 0 16 16" aria-hidden="true">
          <path d="m8 2.3 1.7 3.4 3.8.6-2.8 2.6.7 3.8L8 10.8 4.6 12.7l.7-3.8L2.5 6.3l3.8-.6L8 2.3Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.5" />
        </svg>
      );
    case "heart":
      return (
        <svg className="nav-icon-svg" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M8 13.2 3.2 8.5A3.1 3.1 0 0 1 7.6 4l.4.4.4-.4a3.1 3.1 0 0 1 4.4 4.4L8 13.2Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.5" />
        </svg>
      );
    case "compare":
      return (
        <svg className="nav-icon-svg" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M3 4h8.8M8.8 1.8 11.8 4l-3 2.2M13 12H4.2M7.2 9.8 4.2 12l3 2.2" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" />
        </svg>
      );
    case "podium":
      return (
        <svg className="nav-icon-svg" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M2.5 13.2h11M3.5 13.2V8.9h2.5v4.3M6.8 13.2V6.5h2.5v6.7M10.1 13.2V9.9h2.4v3.3" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" />
        </svg>
      );
    case "passings":
      return (
        <svg className="nav-icon-svg" viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="8" cy="8" r="4.9" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M8 5.3v3.1l2 1.4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" />
        </svg>
      );
    case "leaders":
      return (
        <svg className="nav-icon-svg" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M5 3.2h6l-1.1 3.1L8 7.4 6.1 6.3 5 3.2Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.5" />
          <path d="M8 7.4v3.8M5.8 13h4.4" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
          <path d="M5 3.4H3.1a1 1 0 0 0 0 2h2M11 3.4h1.9a1 1 0 0 1 0 2h-2" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
        </svg>
      );
    case "stats":
      return (
        <svg className="nav-icon-svg" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M2.5 12.8h11" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" />
          <path d="M4 12.8V8.2M8 12.8V5.6M12 12.8V3.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" />
        </svg>
      );
    case "contact":
      return (
        <svg className="nav-icon-svg" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M8 13.3c3.3 0 6-2.2 6-5s-2.7-5-6-5-6 2.2-6 5 2.7 5 6 5Z" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="m5.4 12.5-1.3 1.7.2-2.6" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
        </svg>
      );
  }
}

function formatGapFromLeader(scannedAt: string, leaderScannedAt: string | null, rank: number) {
  if (!leaderScannedAt || rank === 1) {
    return formatScanTime(scannedAt);
  }

  const diffMs = Math.max(0, new Date(scannedAt).getTime() - new Date(leaderScannedAt).getTime());
  const totalSeconds = Math.floor(diffMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `+${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `+${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
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

function formatEventDateLabel(value: string) {
  return new Date(value).toLocaleString([], {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  });
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

function buildPreviewLeaderboard(race: DemoRaceCard, category?: "women" | "men"): OverallLeaderboard {
  const source = race.rankingPreview.filter((entry) => {
    if (!category) {
      return true;
    }

    return (entry.category ?? "men") === category;
  });

  if (!source.length) {
    return emptyOverallLeaderboard;
  }

  const startedAt = new Date("2025-07-05T23:59:00+07:00").getTime();

  return {
    totalRankedRunners: source.length,
    topEntries: source.map((entry, index) => {
      const statusCheckpointId = entry.status === "Finisher" ? "finish" : "cp-30";
      const previewRank = category ? index + 1 : entry.rank;

      return {
        bib: entry.bib.toUpperCase(),
        name: entry.name,
        category: entry.category ?? "men",
        rank: previewRank,
        checkpointId: statusCheckpointId,
        checkpointCode: entry.status === "Finisher" ? "FIN" : "CP",
        checkpointName: entry.status === "Finisher" ? "Finish" : "On Course",
        checkpointKmMarker: entry.status === "Finisher" ? race.distanceKm : Number((race.distanceKm * 0.82).toFixed(1)),
        checkpointOrder: entry.status === "Finisher" ? 4 : 3,
        scannedAt: new Date(startedAt + index * 79_000).toISOString(),
        crewId: "preview-seed",
        deviceId: race.slug
      };
    })
  };
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
  const [fullRankingView, setFullRankingView] = useState<RankingView>("overall");
  const [showRankingFilters, setShowRankingFilters] = useState(false);
  const [rankingRowsPerPage, setRankingRowsPerPage] = useState(FULL_RANKING_PAGE_SIZE);
  const [selectedRaceSlug, setSelectedRaceSlug] = useState<string>(EDITION_HOME_VALUE);
  const [runnerNavOpen, setRunnerNavOpen] = useState(true);
  const [raceNavOpen, setRaceNavOpen] = useState(true);
  const hasDashboardAccess = profile ? ORGANIZER_ROLES.includes(profile.role as (typeof ORGANIZER_ROLES)[number]) : false;
  const organizerSessionActive = Boolean(accessToken && hasDashboardAccess);
  const apiHost = getApiHost();
  const deferredRunnerQuery = useDeferredValue(runnerQuery);
  const selectedRaceCard =
    demoRaceFestival.races.find((race) => race.slug === selectedRaceSlug) ??
    demoRaceFestival.races.find((race) => race.slug === demoCourse.slug) ??
    demoRaceFestival.races[0];
  const isEditionHome = selectedRaceSlug === EDITION_HOME_VALUE;
  const isFeaturedRace = selectedRaceCard.slug === demoCourse.slug;

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
      if (!isFeaturedRace && !isEditionHome) {
        const previewItems = buildRunnerFallbackResults(
          buildPreviewLeaderboard(selectedRaceCard).topEntries,
          deferredRunnerQuery,
          runnerCheckpointFilter
        );

        if (isMounted) {
          setRunnerResults(previewItems);
          setRunnerSearchMode("fallback");
          setRunnerSearchError(null);
          setIsSearchingRunners(false);
        }

        return;
      }

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
  }, [
    accessToken,
    deferredRunnerQuery,
    isBootstrapping,
    isEditionHome,
    isFeaturedRace,
    lastUpdatedAt,
    organizerSessionActive,
    overallLeaderboard.topEntries,
    runnerCheckpointFilter,
    selectedRaceCard
  ]);

  useEffect(() => {
    window.localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favoriteBibs));
  }, [favoriteBibs]);

  const previewOverallLeaderboard = useMemo<OverallLeaderboard>(() => buildPreviewLeaderboard(selectedRaceCard), [selectedRaceCard]);
  const previewWomenLeaderboard = useMemo<OverallLeaderboard>(
    () => buildPreviewLeaderboard(selectedRaceCard, "women"),
    [selectedRaceCard]
  );
  const activeOverallLeaderboard =
    isFeaturedRace && overallLeaderboard.topEntries.length > 0 ? overallLeaderboard : previewOverallLeaderboard;
  const activeWomenLeaderboard =
    isFeaturedRace && womenLeaderboard.topEntries.length > 0 ? womenLeaderboard : previewWomenLeaderboard;
  const activeMenLeaderboard = useMemo<OverallLeaderboard>(() => {
    const items = activeOverallLeaderboard.topEntries.filter((entry) => entry.category.toLowerCase() === "men");
    return {
      totalRankedRunners: items.length,
      topEntries: items
    };
  }, [activeOverallLeaderboard]);

  const fullRankingSource =
    fullRankingView === "women" ? activeWomenLeaderboard : fullRankingView === "men" ? activeMenLeaderboard : activeOverallLeaderboard;

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(fullRankingSource.topEntries.length / rankingRowsPerPage));
    setFullRankingPage((current) => Math.min(current, totalPages));
  }, [fullRankingSource.topEntries.length, rankingRowsPerPage]);

  useEffect(() => {
    setFullRankingPage(1);
  }, [fullRankingView]);

  useEffect(() => {
    setFullRankingPage(1);
  }, [runnerCheckpointFilter, runnerQuery, rankingRowsPerPage]);

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
      if (!isFeaturedRace && !isEditionHome) {
        const fallbackDetail = buildRunnerDetailFallback(buildPreviewLeaderboard(selectedRaceCard).topEntries, runnerBib);

        if (isMounted) {
          setRunnerDetail(fallbackDetail);
          setRunnerDetailError(null);
          setIsLoadingRunnerDetail(false);
        }

        return;
      }

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
  }, [accessToken, isBootstrapping, isEditionHome, isFeaturedRace, organizerSessionActive, overallLeaderboard.topEntries, selectedRaceCard, selectedRunnerBib]);

  const selectedBoard = useMemo(() => {
    return leaderboards.find((item) => item.checkpointId === selectedCheckpointId) ?? leaderboards[0] ?? null;
  }, [leaderboards, selectedCheckpointId]);

  const overallLeader = activeOverallLeaderboard.topEntries[0] ?? null;
  const nameByBib = useMemo(
    () => new Map(activeOverallLeaderboard.topEntries.map((entry) => [entry.bib.toUpperCase(), entry.name])),
    [activeOverallLeaderboard.topEntries]
  );

  const totalOfficialScans = useMemo(() => {
    return leaderboards.reduce((sum, item) => sum + item.totalOfficialScans, 0);
  }, [leaderboards]);

  const totalRankedRunners = activeOverallLeaderboard.totalRankedRunners;

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

  const sidebarOverallRows = activeOverallLeaderboard.topEntries.slice(0, 5);
  const sidebarWomenRows = activeWomenLeaderboard.topEntries.slice(0, 5);

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
    return activeOverallLeaderboard.topEntries.filter((entry) => favoriteSet.has(entry.bib));
  }, [activeOverallLeaderboard.topEntries, favoriteBibs]);
  const recentPassingSummary = useMemo(() => {
    if (!recentPassings.length) {
      return "Belum ada passing";
    }

    return `${recentPassings.length} passing terbaru`;
  }, [recentPassings.length]);
  const totalDistanceKm = selectedRaceCard.distanceKm;
  const activeAscentM = selectedRaceCard.ascentM;
  const activeFinisherCount = isFeaturedRace ? finisherCount : selectedRaceCard.finishers;
  const activeDnfCount = isFeaturedRace ? dnfDnsCount : selectedRaceCard.dnf;
  const normalizedRunnerQuery = runnerQuery.trim().toUpperCase();
  const fullRankingEntries = useMemo(() => {
    return fullRankingSource.topEntries.filter((entry) => {
      const matchesQuery =
        !normalizedRunnerQuery ||
        entry.bib.toUpperCase().includes(normalizedRunnerQuery) ||
        entry.name.toUpperCase().includes(normalizedRunnerQuery);
      const matchesCheckpoint = runnerCheckpointFilter === "all" || entry.checkpointId === runnerCheckpointFilter;
      return matchesQuery && matchesCheckpoint;
    });
  }, [fullRankingSource.topEntries, normalizedRunnerQuery, runnerCheckpointFilter]);
  const fullRankingPageCount = Math.max(1, Math.ceil(fullRankingEntries.length / rankingRowsPerPage));
  const fullRankingRows = fullRankingEntries.slice(
    (fullRankingPage - 1) * rankingRowsPerPage,
    fullRankingPage * rankingRowsPerPage
  );
  const fullRankingRangeLabel = fullRankingEntries.length
    ? `${(fullRankingPage - 1) * rankingRowsPerPage + 1}-${Math.min(
        fullRankingPage * rankingRowsPerPage,
        fullRankingEntries.length
      )} of ${fullRankingEntries.length}`
    : "0-0 of 0";
  const raceHomeCards = useMemo(() => {
    return demoRaceFestival.races.map((race) => {
      if (race.slug !== demoCourse.slug) {
        return {
          ...race,
          isLive: false,
          isSelected: race.slug === selectedRaceCard.slug
        };
      }

      return {
        ...race,
        finishers: finisherCount,
        dnf: dnfDnsCount,
        rankingPreview: (overallLeaderboard.topEntries.length ? overallLeaderboard.topEntries : previewOverallLeaderboard.topEntries)
          .slice(0, 3)
          .map((entry) => ({
          rank: entry.rank,
          name: entry.name,
          bib: entry.bib,
          gap: entry.rank === 1 ? formatScanTime(entry.scannedAt) : `+${entry.rank - 1}:${String(entry.rank * 7).padStart(2, "0")}`,
          status: "Finisher" as const,
          category: (entry.category.toLowerCase() === "women" ? "women" : "men") as "women" | "men"
        })),
        isLive: true,
        isSelected: race.slug === selectedRaceCard.slug
      };
    });
  }, [dnfDnsCount, finisherCount, overallLeaderboard.topEntries, previewOverallLeaderboard.topEntries, selectedRaceCard.slug]);
  const eventTitle = isEditionHome ? demoRaceFestival.brandName : selectedRaceCard.title;
  const eventSubtitleText = isEditionHome
    ? `${demoCourse.location} | ${demoRaceFestival.editionLabel}`
    : `${selectedRaceCard.startTown} | ${demoRaceFestival.brandName} spectator preview`;
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
  const showAccessNotice = organizerSessionActive;
  const raceStatistics = [
    {
      label: "Starters",
      value: `${isFeaturedRace ? starterCount : selectedRaceCard.finishers + selectedRaceCard.dnf}`,
      note: "Runner yang sudah tercatat mulai race."
    },
    {
      label: "DNF / DNS",
      value: `${activeDnfCount}`,
      note: "Gabungan runner yang belum finish."
    },
    {
      label: "Finishers",
      value: `${activeFinisherCount}`,
      note: "Runner yang sudah mencapai finish."
    }
  ];
  const raceOverviewStats = [
    { label: "Distance", value: `${totalDistanceKm.toFixed(1)} KM` },
    { label: "Ascent", value: `${activeAscentM} M+` },
    { label: "Start", value: selectedRaceCard.startTown },
    { label: "Finish", value: "Kaliandra Resort" },
    { label: "Start Date", value: selectedRaceCard.scheduleLabel },
    { label: "Finishers", value: `${activeFinisherCount}` },
    { label: "DNF / DNS", value: `${activeDnfCount}` }
  ];
  const topbarSearchPlaceholder = "Search a runner ...";
  const overallLeaderTime = fullRankingEntries[0]?.scannedAt ?? null;
  const sidebarOverallLeaderTime = sidebarOverallRows[0]?.scannedAt ?? null;
  const sidebarWomenLeaderTime = sidebarWomenRows[0]?.scannedAt ?? null;
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

  function jumpToSection(sectionId?: string) {
    if (!sectionId) {
      return;
    }

    window.setTimeout(() => {
      document.getElementById(sectionId)?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    }, 80);
  }

  function openRaceView(slug: string, sectionId?: string) {
    setSelectedRaceSlug(slug);
    jumpToSection(sectionId);
  }

  function focusTopbarSearch() {
    if (isEditionHome) {
      openRaceView(demoCourse.slug, "full-ranking");
    }

    window.setTimeout(() => {
      const input = document.querySelector<HTMLInputElement>(".topbar-search-shell input");
      input?.focus();
    }, 90);
  }

  function focusRanking(view: "overall" | "women") {
    setFullRankingView(view);
    if (isEditionHome) {
      openRaceView(demoCourse.slug, "full-ranking");
      return;
    }

    jumpToSection("full-ranking");
  }

  function focusRunnerSearch() {
    focusTopbarSearch();
    if (organizerSessionActive) {
      jumpToSection("runner-finder");
      return;
    }

    jumpToSection("full-ranking");
  }

  function handleRaceSelection(nextValue: string) {
    setSelectedRaceSlug(nextValue);
    if (nextValue === EDITION_HOME_VALUE) {
      jumpToSection("edition-home");
      return;
    }

    jumpToSection("race-hub");
  }

  function focusHome() {
    if (isEditionHome) {
      jumpToSection("edition-home");
      return;
    }

    handleRaceSelection(EDITION_HOME_VALUE);
  }

  function focusMyRunners() {
    if (favoriteRunnerResults.length) {
      setSelectedRunnerBib(favoriteRunnerResults[0].bib);
    }

    if (organizerSessionActive) {
      jumpToSection("runner-finder");
      return;
    }

    focusTopbarSearch();
  }

  function focusPassingsTable() {
    if (organizerSessionActive) {
      jumpToSection("signals");
      return;
    }

    jumpToSection("course-profile");
  }

  function focusStatistics() {
    if (isEditionHome) {
      openRaceView(demoCourse.slug, "race-statistics");
      return;
    }

    jumpToSection("race-statistics");
  }

  return (
      <main className={`dashboard-shell dashboard-hub-shell live-trail-shell ${isEditionHome ? "edition-home-mode" : "race-detail-mode"}`}>
        <aside className="dashboard-sidebar live-sidebar">
          <nav className="sidebar-nav live-sidebar-nav" aria-label="Race navigation">
            <button className="live-sidebar-logo" onClick={focusHome} type="button" aria-label="Back to edition home">
              <span className="livetrail-wordmark">
                <span className="word-live">Live</span>
                <span className="word-trail">Trail</span>
              </span>
            </button>

            <button className="nav-link nav-link-primary nav-link-icon" onClick={focusHome} type="button">
              <NavIcon name="home" />
              <span>Home</span>
            </button>

          <div className={`nav-group ${runnerNavOpen ? "open" : ""}`}>
            <button className="nav-toggle" onClick={() => setRunnerNavOpen((current) => !current)} type="button">
              <span>THE RUNNERS</span>
              <span className={`nav-chevron ${runnerNavOpen ? "open" : ""}`} aria-hidden="true" />
            </button>
            <div className="nav-links">
              <button className="nav-link nav-link-icon" onClick={focusRunnerSearch} type="button">
                <NavIcon name="search" />
                <span>Search for a runner</span>
              </button>
              <button className="nav-link nav-link-icon" onClick={() => focusRanking("overall")} type="button">
                <NavIcon name="runners" />
                <span>Runners list</span>
              </button>
              <button className="nav-link nav-link-icon" onClick={focusMyRunners} type="button">
                <NavIcon name="favorite" />
                <span>Favorites list</span>
              </button>
              <button className="nav-link nav-link-icon" onClick={focusMyRunners} type="button">
                <NavIcon name="heart" />
                <span>My runners</span>
              </button>
              <button className="nav-link nav-link-icon" onClick={focusRunnerSearch} type="button">
                <NavIcon name="compare" />
                <span>Comparison</span>
              </button>
            </div>
          </div>

          <div className={`nav-group ${raceNavOpen ? "open" : ""}`}>
            <button className="nav-toggle" onClick={() => setRaceNavOpen((current) => !current)} type="button">
              <span>FOLLOW THE RACE</span>
              <span className={`nav-chevron ${raceNavOpen ? "open" : ""}`} aria-hidden="true" />
            </button>
            <div className="nav-links">
              <button className="nav-link nav-link-icon" onClick={() => focusRanking("overall")} type="button">
                <NavIcon name="podium" />
                <span>Ranking</span>
              </button>
              <button className="nav-link nav-link-icon" onClick={focusPassingsTable} type="button">
                <NavIcon name="passings" />
                <span>Passings table</span>
              </button>
              <button className="nav-link nav-link-icon" onClick={() => focusRanking("overall")} type="button">
                <NavIcon name="leaders" />
                <span>Race leaders</span>
              </button>
              <button className="nav-link nav-link-icon" onClick={focusStatistics} type="button">
                <NavIcon name="stats" />
                <span>Statistics</span>
              </button>
            </div>
          </div>

          <button className="nav-link nav-link-icon nav-link-footer" onClick={() => jumpToSection("runtime-footer")} type="button">
            <NavIcon name="contact" />
            <span>Contact</span>
          </button>
        </nav>
      </aside>

      <div className="dashboard-main dashboard-main-scroll live-main">
        <header className="topbar topbar-hub live-topbar">
          <div className="topbar-race-lockup">
            {demoRaceFestival.brandStack.map((line) => (
              <strong key={line}>{line}</strong>
            ))}
          </div>

          <div className="topbar-center">
            <label className="topbar-select topbar-select-shell">
              <span className="sr-only">Edition selector</span>
              <select onChange={() => handleRaceSelection(EDITION_HOME_VALUE)} value={EDITION_HOME_VALUE}>
                <option value={EDITION_HOME_VALUE}>{demoRaceFestival.editionLabel}</option>
              </select>
            </label>

            <label className="topbar-search topbar-search-shell">
              <span className="topbar-runner-icon" aria-hidden="true" />
              <span className="sr-only">Search a runner</span>
              <input
                placeholder={topbarSearchPlaceholder}
                value={runnerQuery}
                onChange={(event) => setRunnerQuery(event.target.value)}
              />
              <button className="topbar-search-button" onClick={focusRunnerSearch} type="button" aria-label="Search runner">
                <span className="search-button-lens" aria-hidden="true" />
              </button>
            </label>
          </div>

          <div className="topbar-actions live-topbar-actions">
            {organizerSessionActive ? (
              <button className="topbar-login-link topbar-login-link-active" onClick={handleLogout} type="button">
                Logout
              </button>
            ) : (
              <button
                className="topbar-login-link"
                onClick={() => {
                  setLoginError(null);
                  setIsLoginModalOpen(true);
                }}
                type="button"
              >
                Login
              </button>
            )}

            <button
              aria-label={`Switch to ${getNextTheme(theme)} mode`}
              className="topbar-icon-button theme-switch-button"
              onClick={() => setTheme((current) => getNextTheme(current))}
              type="button"
            >
              <span className={`theme-switch-track ${theme}`}>
                <span className="theme-switch-thumb" />
              </span>
            </button>

            <button className="topbar-locale-pill" type="button">
              EN <span aria-hidden="true">▾</span>
            </button>
          </div>
        </header>

        {showAccessNotice ? <div className={`notice-banner ${organizerSessionActive ? "success" : "info"}`}>{accessNotice}</div> : null}

        {isEditionHome ? (
          <>
            <RaceEditionHome
              bannerTagline={demoRaceFestival.bannerTagline}
              brandStack={demoRaceFestival.brandStack}
              cards={raceHomeCards}
              dateRibbon={demoRaceFestival.dateRibbon}
              editionLabel={demoRaceFestival.editionLabel}
              homeSubtitle={demoRaceFestival.homeSubtitle}
              homeTitle={demoRaceFestival.homeTitle}
              locationRibbon={demoRaceFestival.locationRibbon}
              onOpenRace={(slug) => openRaceView(slug, "race-hub")}
            />
          </>
        ) : (
          <>
        <div className="detail-topline">
          <button className="back-home-link" onClick={() => handleRaceSelection(EDITION_HOME_VALUE)} type="button">
            Back to Home
          </button>
        </div>

        <section className="panel race-detail-hero" id="race-hub">
            <div className="race-detail-hero-head">
              <span className={`race-status-pill ${selectedRaceCard.editionLabel.toLowerCase() === "live" ? "live" : ""}`}>
                {selectedRaceCard.editionLabel}
              </span>
            <h2>{eventTitle}</h2>
          </div>

          <div className="race-stat-strip" id="race-statistics">
            <article className="race-stat-strip-item">
              <span>Distance</span>
              <strong>{totalDistanceKm.toFixed(1)} KM</strong>
            </article>
            <article className="race-stat-strip-item">
              <span>Ascent</span>
              <strong>{activeAscentM} M+</strong>
            </article>
            <article className="race-stat-strip-item">
              <span>Start</span>
              <strong>{demoCourse.location} 7°C</strong>
            </article>
            <article className="race-stat-strip-item">
              <span>Finish</span>
              <strong>{demoCourse.location} 7°C</strong>
            </article>
            <article className="race-stat-strip-item">
              <span>Start Date</span>
              <strong>{formatEventDateLabel("2025-10-19T05:12:00+02:00")}</strong>
            </article>
            <article className="race-stat-strip-item">
              <span>Finishers</span>
              <strong>{activeFinisherCount}</strong>
            </article>
            <article className="race-stat-strip-item">
              <span>DNF</span>
              <strong>{activeDnfCount}</strong>
            </article>
          </div>
        </section>

      <section className="spotlight-grid" id="course-profile">
        <CourseProfilePanel
          courseStops={courseProfileStops}
          selectedCheckpointId={selectedCheckpointId}
          onSelectCheckpoint={setSelectedCheckpointId}
          finisherCount={finisherCount}
          dnfCount={dnfDnsCount}
        />
      </section>

      {fetchError ? <div className="notice-banner error">{fetchError}</div> : null}

      <section className="control-grid">
        <article className="panel leaderboard-panel full-ranking-panel livetrail-ranking-panel" id="full-ranking">
          <div className="ranking-title-shell">
            <span className="detail-label">Ranking</span>
          </div>
          <div className="ranking-toolbar">
            <div className="ranking-filters">
              <label className="ranking-toolbar-label">
                Of which gender ?
                <select value={fullRankingView} onChange={(event) => setFullRankingView(event.target.value as RankingView)}>
                  <option value="overall">All genders</option>
                  <option value="women">Women</option>
                </select>
              </label>
              <button className="toolbar-link" onClick={() => setShowRankingFilters((current) => !current)} type="button">
                {showRankingFilters ? "Hide filters" : "More filters..."}
              </button>
            </div>

            <div className="ranking-pagination-meta">
              <label className="rows-per-page">
                Rows per page
                <select value={rankingRowsPerPage} onChange={(event) => setRankingRowsPerPage(Number(event.target.value))}>
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={30}>30</option>
                </select>
              </label>
              <div className="ranking-range-text">{fullRankingRangeLabel}</div>
              <div className="pager-actions compact">
                <button className="theme-toggle pager-button" disabled={fullRankingPage <= 1} onClick={() => setFullRankingPage(1)} type="button">
                  «
                </button>
                <button
                  className="theme-toggle pager-button"
                  disabled={fullRankingPage <= 1}
                  onClick={() => setFullRankingPage((current) => Math.max(1, current - 1))}
                  type="button"
                >
                  ‹
                </button>
                <button
                  className="theme-toggle pager-button"
                  disabled={fullRankingPage >= fullRankingPageCount}
                  onClick={() => setFullRankingPage((current) => Math.min(fullRankingPageCount, current + 1))}
                  type="button"
                >
                  ›
                </button>
                <button
                  className="theme-toggle pager-button"
                  disabled={fullRankingPage >= fullRankingPageCount}
                  onClick={() => setFullRankingPage(fullRankingPageCount)}
                  type="button"
                >
                  »
                </button>
              </div>
            </div>
          </div>

          {showRankingFilters ? (
            <div className="ranking-advanced-filters">
              <label className="ranking-toolbar-label">
                Progress checkpoint
                <select value={runnerCheckpointFilter} onChange={(event) => setRunnerCheckpointFilter(event.target.value)}>
                  <option value="all">All progress</option>
                  {defaultCheckpoints.map((checkpoint) => (
                    <option key={checkpoint.id} value={checkpoint.id}>
                      {formatCheckpointLabel(checkpoint)} | {checkpoint.name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="mini-stat">
                <span>Search query</span>
                <strong>{runnerQuery.trim() || "No runner filter"}</strong>
              </div>

              <div className="mini-stat">
                <span>Index source</span>
                <strong>{runnerSearchMode === "server" ? "Live index" : "Fallback index"}</strong>
              </div>
            </div>
          ) : null}

          <div className="ranking-column-head livetrail-column-head">
            <span>Ranking</span>
            <span>Runner / Team</span>
            <span>Categ.</span>
            <span>Nationality</span>
            <span>Race Time</span>
          </div>

          <div className="full-ranking-list full-ranking-table" role="list" aria-label="Overall leaderboard rows">
            {fullRankingRows.length ? (
              fullRankingRows.map((entry) => {
                return (
                  <div className="full-ranking-row race-ranking-row" key={`${entry.checkpointId}-${entry.bib}`} role="listitem">
                    <div className="ranking-block">
                      <div className="ranking-rankline">
                        <strong>{entry.rank}</strong>
                        <RankingMedal rank={entry.rank} />
                      </div>
                      <div className="ranking-submeta">
                        <span>{fullRankingView === "women" ? "Woman" : "Overall"}</span>
                        <small>Sex {entry.rank}</small>
                      </div>
                    </div>
                    <div className="runner-main-cell">
                      <div className="bib-tile">{entry.bib}</div>
                      <div className="runner-cell">
                        <div className="runner-avatar runner-avatar-live">{getInitials(entry.name)}</div>
                        <div>
                          <strong>{entry.name}</strong>
                          <span>{getRunnerTeamName(entry.bib)}</span>
                          <div className={`runner-status-pill ${entry.checkpointId === "finish" ? "finished" : ""}`}>
                            {getRunnerStatusLabel(entry.checkpointId)}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="race-inline-cell">
                      <strong>{getDivisionCode(entry.category)}</strong>
                      <span>{formatCategoryLabel(entry.category)}</span>
                    </div>
                    <div className="race-inline-cell nationality-cell">
                      <strong aria-label={getNationalityCode(entry.bib)}>{getFlagEmoji(getNationalityCode(entry.bib))}</strong>
                    </div>
                    <div className="race-inline-cell race-time-cell">
                      <strong>{formatScanTime(entry.scannedAt)}</strong>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="empty-state">
                <strong>No runner available in this ranking yet.</strong>
                <span>The overall board will appear automatically as soon as official scan data is available.</span>
              </div>
            )}
          </div>

          <div className="ranking-pager bottom">
            <label className="rows-per-page">
              Rows per page
              <select value={rankingRowsPerPage} onChange={(event) => setRankingRowsPerPage(Number(event.target.value))}>
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={30}>30</option>
              </select>
            </label>
            <div className="ranking-range-text">{fullRankingRangeLabel}</div>
            <div className="pager-actions compact">
              <button className="theme-toggle pager-button" disabled={fullRankingPage <= 1} onClick={() => setFullRankingPage(1)} type="button">
                «
              </button>
              <button
                className="theme-toggle pager-button"
                disabled={fullRankingPage <= 1}
                onClick={() => setFullRankingPage((current) => Math.max(1, current - 1))}
                type="button"
              >
                ‹
              </button>
              <button
                className="theme-toggle pager-button"
                disabled={fullRankingPage >= fullRankingPageCount}
                onClick={() => setFullRankingPage((current) => Math.min(fullRankingPageCount, current + 1))}
                type="button"
              >
                ›
              </button>
              <button
                className="theme-toggle pager-button"
                disabled={fullRankingPage >= fullRankingPageCount}
                onClick={() => setFullRankingPage(fullRankingPageCount)}
                type="button"
              >
                »
              </button>
            </div>
          </div>
        </article>

        <aside className="dashboard-rail-marker">
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

      {organizerSessionActive ? (
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
      ) : null}

      {organizerSessionActive ? (
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
                            <strong>
                              {formatCheckpointLabel({
                                code: entry.checkpointCode,
                                kmMarker: entry.checkpointKmMarker
                              })}{" "}
                              - {entry.checkpointName}
                            </strong>
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
      ) : null}
          </>
        )}

      <footer className="runtime-footer" id="runtime-footer">
        <span>API {apiHost}</span>
        <span>Live {liveStatusLabel}</span>
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
                aria-label="Close login modal"
                className="auth-modal-close"
                onClick={() => setIsLoginModalOpen(false)}
                type="button"
              >
                ×
              </button>
            </div>

            <div className="auth-modal-copy">
              <strong>Dear Organiser, please identify yourself to access LiveTrail's tools.</strong>
              <span>Dear spectators, the live following is free and you do not need to register to follow the race.</span>
            </div>

            <form className="auth-modal-form" onSubmit={handleLogin}>
              <label>
                Username
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
                  placeholder="Password"
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
              </div>
            </form>
          </section>
        </div>
      ) : null}
      </div>

      {!isEditionHome ? (
      <aside className="dashboard-rail live-ranking-rail">
        <div className="rail">
              <article className="panel rail-panel rail-ranking-panel" id="race-leaders">
                <div className="rail-panel-head">
                  <span>Ranking</span>
                  <h3>Overall</h3>
                </div>
                <div className="mini-leaderboard livetrail-mini-leaderboard">
                  {sidebarOverallRows.length ? (
                    sidebarOverallRows.map((entry) => (
                      <div className="mini-leaderboard-row live" key={`rail-overall-${entry.bib}`}>
                        <strong>{entry.rank}</strong>
                        <div>
                          <span>{entry.name}</span>
                          <small>{entry.checkpointId === "finish" ? "Arrivee" : entry.checkpointId === "cp-start" ? "Depart" : entry.checkpointName}</small>
                        </div>
                        <div className="rail-rank-time">
                          <small aria-label={getNationalityCode(entry.bib)}>{getFlagEmoji(getNationalityCode(entry.bib))}</small>
                          <time>{formatGapFromLeader(entry.scannedAt, sidebarOverallLeaderTime, entry.rank)}</time>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="empty-compact">No runner in the overall ranking yet.</div>
                  )}
                </div>
                <button className="sidebar-more" onClick={() => focusRanking("overall")} type="button">
                  See More
                </button>
              </article>

              <article className="panel rail-panel rail-ranking-panel">
                <div className="rail-panel-head">
                  <span>Ranking</span>
                  <h3>Woman</h3>
                </div>
                <div className="mini-leaderboard livetrail-mini-leaderboard">
                  {sidebarWomenRows.length ? (
                    sidebarWomenRows.map((entry) => (
                      <div className="mini-leaderboard-row live" key={`rail-women-${entry.bib}`}>
                        <strong>{entry.rank}</strong>
                        <div>
                          <span>{entry.name}</span>
                          <small>{entry.checkpointId === "finish" ? "Arrivee" : entry.checkpointId === "cp-start" ? "Depart" : entry.checkpointName}</small>
                        </div>
                        <div className="rail-rank-time">
                          <small aria-label={getNationalityCode(entry.bib)}>{getFlagEmoji(getNationalityCode(entry.bib))}</small>
                          <time>{formatGapFromLeader(entry.scannedAt, sidebarWomenLeaderTime, entry.rank)}</time>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="empty-compact">No woman ranking data available yet.</div>
                  )}
                </div>
                <button className="sidebar-more" onClick={() => focusRanking("women")} type="button">
                  See More
                </button>
              </article>

              {organizerSessionActive ? (
              <article className="panel rail-panel" id="recent-passings-sidebar">
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
                      {latestPassing.name} | {formatCheckpointLabel({
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
              ) : null}

              {organizerSessionActive ? (
                <article className="panel rail-panel" id="signals-sidebar">
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
                <article className="panel rail-panel observer-teaser" id="signals-sidebar">
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
        </div>
      </aside>
      ) : null}
    </main>
  );
}

