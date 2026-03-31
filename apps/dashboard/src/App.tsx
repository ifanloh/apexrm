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
  type RunnerDetail,
  type RunnerPassing,
  type RunnerSearchEntry
} from "@arm/contracts";
import {
  fetchCheckpointLeaderboard,
  fetchCheckpointLeaderboards,
  fetchOrganizerSignals,
  fetchOverallLeaderboard,
  fetchRunnerDetail,
  fetchRunnerSearch
} from "./api";
import { CourseProfilePanel } from "./CourseProfilePanel";
import { OrganizerConsole } from "./OrganizerConsole";
import runnerIcon from "./assets/runner.svg";
import podium1stIcon from "./assets/podium-1st.svg";
import podium2ndIcon from "./assets/podium-2nd.svg";
import podium3rdIcon from "./assets/podium-3rd.svg";
import trailnesiaLogo from "./assets/trailnesia.png";
import worldMapSvgRaw from "./assets/world-map-detailed.svg?raw";
import { getDemoCourseForRace } from "./demoCourseVariants";
import { demoRaceFestival, type DemoRaceCard, type DemoRaceRankingPreview } from "./demoRaceFestival";
import { RaceEditionHome } from "./RaceEditionHome";
import {
  buildOrganizerCourseFromRaceDraft,
  createOrganizerInviteCode,
  createOrganizerRaceTemplate,
  createDefaultOrganizerSetup,
  getOrganizerCheckpointsForRace,
  loadOrganizerSetup,
  ORGANIZER_SETUP_STORAGE_KEY,
  parseOrganizerGpxFile,
  parseParticipantImportFile,
  parseParticipantImportRows,
  parseParticipantImportText,
  type OrganizerBrandingDraft,
  type OrganizerCrewAssignmentDraft,
  type OrganizerParticipantImportMode,
  type OrganizerParticipantDraft,
  type OrganizerRaceDraft
} from "./organizerSetup";
import { buildOrganizerRaceSimulationSnapshot, buildOrganizerTrialScenario } from "./organizerSimulation";
import { supabase } from "./supabase";
import "./styles.css";

const emptyOverallLeaderboard: OverallLeaderboard = {
  totalRankedRunners: 0,
  topEntries: []
};

const FAVORITES_STORAGE_KEY = "arm:dashboard-favorites";
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
const COUNTRY_PRIORITY_ORDER = ["ID", "MY", "SG", "TH", "AU", "JP", "KR", "PH", "VN", "CN", "US", "FR"] as const;

type CountryCode = (typeof COUNTRY_CODES)[number];

const COUNTRY_META: Record<
  CountryCode,
  { name: string; weight: number }
> = {
  ID: { name: "Indonesia", weight: 40 },
  MY: { name: "Malaysia", weight: 16 },
  SG: { name: "Singapore", weight: 12 },
  AU: { name: "Australia", weight: 10 },
  JP: { name: "Japan", weight: 8 },
  TH: { name: "Thailand", weight: 10 },
  PH: { name: "Philippines", weight: 8 },
  KR: { name: "South Korea", weight: 6 },
  CN: { name: "China", weight: 7 },
  VN: { name: "Vietnam", weight: 7 },
  US: { name: "United States", weight: 5 },
  FR: { name: "France", weight: 4 }
};

type LiveStatus = "idle" | "live" | "polling" | "fallback";
type RankingView = "overall" | "women" | "men";
type RaceDetailView = "race-page" | "runner-search" | "runners-list" | "favorites" | "my-runners" | "ranking" | "leaders" | "statistics";
type OrganizerWorkspaceView = "spectator" | "console";
type RunnerDirectoryState = "all" | "registered" | "in-race" | "finisher" | "dns" | "withdrawn";
type ParticipantImportImpact = {
  newRows: number;
  updatedRows: number;
  unchangedRows: number;
  skippedExistingRows: number;
  skippedNewRows: number;
};
type RunnerDirectoryEntry = {
  raceSlug: string;
  raceTitle: string;
  bib: string;
  name: string;
  teamName: string;
  countryCode: CountryCode;
  category: "men" | "women";
  state: Exclude<RunnerDirectoryState, "all">;
  statusLabel: string;
  infoLabel: string;
  raceTime: string;
  rank: number | null;
  scannedAt: string;
  checkpointId?: string | null;
  checkpointCode?: string | null;
  checkpointName?: string | null;
  checkpointKmMarker?: number | null;
  checkpointOrder?: number | null;
};

type RaceLeaderEntry = RunnerDirectoryEntry & {
  genderRank: number;
  lastPointLabel: string;
  nextPassingLabel: string;
  nextPassingTime: string;
};

function formatScanTime(value: string) {
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function formatElapsedRaceTime(scannedAt: string, raceStartAt: string | null) {
  if (!raceStartAt) {
    return formatScanTime(scannedAt);
  }

  const diffMs = new Date(scannedAt).getTime() - new Date(raceStartAt).getTime();

  if (!Number.isFinite(diffMs) || diffMs < 0 || diffMs > 7 * 24 * 60 * 60 * 1000) {
    return formatScanTime(scannedAt);
  }

  const totalSeconds = Math.floor(diffMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function parseClockDuration(value: string) {
  const normalized = value.trim().replace(/^\+/, "");
  const parts = normalized.split(":").map((part) => Number.parseInt(part, 10));

  if (!parts.length || parts.some((part) => Number.isNaN(part))) {
    return null;
  }

  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }

  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }

  return null;
}

function formatClockDuration(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [hours, minutes, seconds].map((part) => String(part).padStart(2, "0")).join(":");
}

function getPreviewRankingTime(preview: DemoRaceCard["rankingPreview"], bib: string) {
  const targetIndex = preview.findIndex((entry) => entry.bib.toUpperCase() === bib.toUpperCase());

  if (targetIndex === -1 || !preview.length) {
    return null;
  }

  const leaderSeconds = parseClockDuration(preview[0].gap);
  const entry = preview[targetIndex];

  if (targetIndex === 0 || !entry.gap.startsWith("+") || leaderSeconds === null) {
    return entry.gap.replace(/^\+/, "");
  }

  const deltaSeconds = parseClockDuration(entry.gap);

  if (deltaSeconds === null) {
    return entry.gap.replace(/^\+/, "");
  }

  return formatClockDuration(leaderSeconds + deltaSeconds);
}

function formatCheckpointProgress(entry: {
  checkpointCode: string;
  checkpointKmMarker: number;
  checkpointName: string;
}) {
  const checkpointLabel = formatCheckpointLabel({
    code: entry.checkpointCode,
    kmMarker: entry.checkpointKmMarker
  });

  return `${checkpointLabel} - ${entry.checkpointName}`;
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

function getFlagIconUrl(countryCode: string) {
  return `https://flagcdn.com/24x18/${countryCode.toLowerCase()}.png`;
}

function normalizeCountryCodeValue(value: string) {
  const normalized = value.trim().toUpperCase();
  return COUNTRY_CODES.includes(normalized as CountryCode) ? (normalized as CountryCode) : "ID";
}

function formatPercent(value: number) {
  if (!Number.isFinite(value)) {
    return "0%";
  }

  if (value >= 10 || Number.isInteger(value)) {
    return `${Math.round(value)}%`;
  }

  return `${value.toFixed(1)}%`;
}

function distributeCounts(total: number, weights: number[]) {
  if (total <= 0 || !weights.length) {
    return weights.map(() => 0);
  }

  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const raw = weights.map((weight) => (weight / totalWeight) * total);
  const base = raw.map((value) => Math.floor(value));
  let remainder = total - base.reduce((sum, value) => sum + value, 0);

  const rankedFractions = raw
    .map((value, index) => ({ index, fraction: value - base[index] }))
    .sort((left, right) => right.fraction - left.fraction);

  for (let index = 0; index < rankedFractions.length && remainder > 0; index += 1) {
    base[rankedFractions[index].index] += 1;
    remainder -= 1;
  }

  return base;
}

function buildGenderSplit(total: number, womenRatio: number) {
  if (total <= 0) {
    return { women: 0, men: 0 };
  }

  const safeRatio = Math.min(Math.max(womenRatio, 0.18), 0.55);
  const women = Math.round(total * safeRatio);
  const men = Math.max(total - women, 0);

  return { women, men };
}

function countGenderSplit(entries: Array<{ category: "men" | "women" }>) {
  return entries.reduce(
    (totals, entry) => {
      if (entry.category === "women") {
        totals.women += 1;
      } else {
        totals.men += 1;
      }

      return totals;
    },
    { women: 0, men: 0 }
  );
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

function getLiveRunnerStatusLabel(
  entry: {
    checkpointId: string;
    checkpointCode: string;
  },
  isLiveRace: boolean
) {
  if (entry.checkpointId === "finish") {
    return "Finished";
  }

  if (isLiveRace) {
    return entry.checkpointId === "cp-start" ? "Depart" : entry.checkpointCode;
  }

  return getRunnerStatusLabel(entry.checkpointId);
}

function shouldShowLivePodium(rank: number, checkpointId: string, isLiveRace: boolean) {
  if (rank < 1 || rank > 3) {
    return false;
  }

  return !isLiveRace || checkpointId === "finish";
}

function estimateNextPassing(
  race: DemoRaceCard,
  entry: Pick<
    RunnerDirectoryEntry,
    "checkpointId" | "checkpointCode" | "checkpointKmMarker" | "checkpointOrder" | "raceTime" | "scannedAt"
  >
) {
  if (entry.checkpointId === "finish") {
    return {
      label: "Finish",
      time: entry.raceTime
    };
  }

  const course = getDemoCourseForRace(race);
  const currentOrder = entry.checkpointOrder ?? 0;
  const nextCheckpoint = course.checkpoints.find((checkpoint) => checkpoint.order > currentOrder);

  if (!nextCheckpoint) {
    return {
      label: "Finish",
      time: entry.raceTime
    };
  }

  const scanMs = new Date(entry.scannedAt).getTime();
  const etaMs = Number.isFinite(scanMs) ? scanMs + Math.max(1, nextCheckpoint.order - currentOrder) * 42 * 60 * 1000 : NaN;

  return {
    label: formatCheckpointLabel({
      code: nextCheckpoint.code,
      kmMarker: nextCheckpoint.kmMarker
    }),
    time: Number.isFinite(etaMs) ? formatScanTime(new Date(etaMs).toISOString()) : entry.raceTime
  };
}

function participantDraftEquals(left: OrganizerParticipantDraft, right: OrganizerParticipantDraft) {
  return (
    left.bib === right.bib &&
    left.name === right.name &&
    left.gender === right.gender &&
    left.countryCode === right.countryCode &&
    left.club === right.club
  );
}

function calculateParticipantImportImpact(
  existingParticipants: OrganizerParticipantDraft[],
  importedParticipants: OrganizerParticipantDraft[]
): ParticipantImportImpact {
  const existingByBib = new Map(existingParticipants.map((participant) => [participant.bib, participant]));
  let newRows = 0;
  let updatedRows = 0;
  let unchangedRows = 0;

  importedParticipants.forEach((participant) => {
    const current = existingByBib.get(participant.bib);
    if (!current) {
      newRows += 1;
      return;
    }

    if (participantDraftEquals(current, participant)) {
      unchangedRows += 1;
      return;
    }

    updatedRows += 1;
  });

  return {
    newRows,
    updatedRows,
    unchangedRows,
    skippedExistingRows: importedParticipants.length - newRows,
    skippedNewRows: newRows
  };
}

function applyParticipantImportMode(
  currentParticipants: OrganizerParticipantDraft[],
  importedParticipants: OrganizerParticipantDraft[],
  mode: OrganizerParticipantImportMode
) {
  if (mode === "replace") {
    return importedParticipants;
  }

  const importedByBib = new Map(importedParticipants.map((participant) => [participant.bib, participant]));

  if (mode === "add") {
    return [
      ...currentParticipants,
      ...importedParticipants.filter((participant) => !currentParticipants.some((current) => current.bib === participant.bib))
    ];
  }

  if (mode === "update") {
    return currentParticipants.map((participant) => importedByBib.get(participant.bib) ?? participant);
  }

  const mergedParticipants = currentParticipants.map((participant) => importedByBib.get(participant.bib) ?? participant);
  const existingBibs = new Set(currentParticipants.map((participant) => participant.bib));

  return [...mergedParticipants, ...importedParticipants.filter((participant) => !existingBibs.has(participant.bib))];
}

function RankingMedal({ rank }: { rank: number }) {
  if (rank < 1 || rank > 3) {
    return null;
  }

  const medalClass = rank === 1 ? "gold" : rank === 2 ? "silver" : "bronze";
  const medalIcon = rank === 1 ? podium1stIcon : rank === 2 ? podium2ndIcon : podium3rdIcon;

  return (
    <span className={`ranking-medal ${medalClass}`} aria-hidden="true">
      <img alt="" src={medalIcon} />
    </span>
  );
}

function NavIcon({ name }: { name: "home" | "search" | "runners" | "favorite" | "heart" | "podium" | "leaders" | "stats" | "contact" }) {
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
    case "podium":
      return (
        <svg className="nav-icon-svg" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M2.5 13.2h11M3.5 13.2V8.9h2.5v4.3M6.8 13.2V6.5h2.5v6.7M10.1 13.2V9.9h2.4v3.3" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" />
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

function NavChevron({ open }: { open: boolean }) {
  return (
    <span className={`nav-chevron ${open ? "open" : ""}`} aria-hidden="true">
      <svg viewBox="0 0 12 12">
        <path d="M2.5 4.25 6 7.75l3.5-3.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      </svg>
    </span>
  );
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

function normalizeRunnerDirectoryState(
  status: DemoRaceRankingPreview["status"] | "Registered" | "DNS" | "Withdrawn"
): Exclude<RunnerDirectoryState, "all"> {
  switch (status) {
    case "Finisher":
      return "finisher";
    case "In race":
      return "in-race";
    case "DNS":
      return "dns";
    case "Withdrawn":
      return "withdrawn";
    default:
      return "registered";
  }
}

function formatRunnerDirectoryStateLabel(state: Exclude<RunnerDirectoryState, "all">) {
  switch (state) {
    case "finisher":
      return "Finisher";
    case "in-race":
      return "In race";
    case "dns":
      return "DNS";
    case "withdrawn":
      return "DNF";
    default:
      return "Registered";
  }
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

const RUNNER_DIRECTORY_EXTRA_PROFILES = [
  { name: "Bagas Wiratama", category: "men" as const, state: "Registered" as const },
  { name: "Nadya Azzahra", category: "women" as const, state: "DNS" as const },
  { name: "Fikri Maulana", category: "men" as const, state: "Withdrawn" as const },
  { name: "Dewi Kirana", category: "women" as const, state: "Registered" as const },
  { name: "Rangga Kautsar", category: "men" as const, state: "DNS" as const },
  { name: "Salsa Nirmala", category: "women" as const, state: "Withdrawn" as const }
];

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

  const startedAt = new Date(race.startAt).getTime();

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
        checkpointId: entry.checkpointId ?? statusCheckpointId,
        checkpointCode: entry.checkpointCode ?? (entry.status === "Finisher" ? "FIN" : "CP"),
        checkpointName: entry.checkpointName ?? (entry.status === "Finisher" ? "Finish" : "On Course"),
        checkpointKmMarker: entry.checkpointKmMarker ?? (entry.status === "Finisher" ? race.distanceKm : Number((race.distanceKm * 0.82).toFixed(1))),
        checkpointOrder: entry.checkpointOrder ?? (entry.status === "Finisher" ? 4 : 3),
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

function buildCheckpointLeaderboardsFallback(race: DemoRaceCard): CheckpointLeaderboard[] {
  const previewEntries = [...race.rankingPreview]
    .filter((entry) => entry.status !== "No ranking")
    .sort((left, right) => left.rank - right.rank);

  return defaultCheckpoints.map((checkpoint) => {
    const matches = previewEntries.filter((entry) => {
      if (entry.checkpointId) {
        return entry.checkpointId === checkpoint.id;
      }

      return checkpoint.id === "finish" && entry.status === "Finisher";
    });

    return {
      checkpointId: checkpoint.id,
      totalOfficialScans: matches.length,
      topEntries: matches.slice(0, 10).map((entry) => ({
        bib: entry.bib,
        checkpointId: entry.checkpointId ?? checkpoint.id,
        position: entry.rank,
        scannedAt: new Date(new Date(race.startAt).getTime() + entry.rank * 13 * 60 * 1000).toISOString(),
        crewId: checkpoint.id === "finish" ? "finish-crew" : "demo-crew",
        deviceId: checkpoint.id === "finish" ? "finish-device" : "demo-device"
      }))
    };
  });
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

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("Unable to read file as data URL."));
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error("Unable to read file."));
    };
    reader.readAsDataURL(file);
  });
}

function readFileAsText(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("Unable to read file as text."));
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error("Unable to read file."));
    };
    reader.readAsText(file);
  });
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
  const [selectedRunnerBib, setSelectedRunnerBib] = useState<string | null>(null);
  const [runnerDetail, setRunnerDetail] = useState<RunnerDetail | null>(null);
  const [runnerDetailError, setRunnerDetailError] = useState<string | null>(null);
  const [isLoadingRunnerDetail, setIsLoadingRunnerDetail] = useState(false);
  const [favoriteBibs, setFavoriteBibs] = useState<string[]>(() => loadFavoriteBibs());
  const [fullRankingPage, setFullRankingPage] = useState(1);
  const [fullRankingView, setFullRankingView] = useState<RankingView>("overall");
  const [rankingRaceFilter, setRankingRaceFilter] = useState<string>("");
  const [rankingCountryFilter, setRankingCountryFilter] = useState<string>("all");
  const [showRankingFilters, setShowRankingFilters] = useState(false);
  const [rankingRowsPerPage, setRankingRowsPerPage] = useState(FULL_RANKING_PAGE_SIZE);
  const [runnerDirectoryStateFilter, setRunnerDirectoryStateFilter] = useState<RunnerDirectoryState>("all");
  const [runnerDirectoryRaceFilter, setRunnerDirectoryRaceFilter] = useState<string>("");
  const [runnerDirectoryCountryFilter, setRunnerDirectoryCountryFilter] = useState<string>("all");
  const [runnerDirectoryCategoryFilter, setRunnerDirectoryCategoryFilter] = useState<"all" | "men" | "women">("all");
  const [runnerDirectoryPage, setRunnerDirectoryPage] = useState(1);
  const [runnerDirectoryRowsPerPage, setRunnerDirectoryRowsPerPage] = useState(10);
  const [leadersRaceFilter, setLeadersRaceFilter] = useState<string>("all");
  const [leadersCountryFilter, setLeadersCountryFilter] = useState<string>("all");
  const [leadersCategoryFilter, setLeadersCategoryFilter] = useState<"all" | "men" | "women">("all");
  const [leadersPage, setLeadersPage] = useState(1);
  const [leadersRowsPerPage, setLeadersRowsPerPage] = useState(10);
  const [statisticsRaceFilter, setStatisticsRaceFilter] = useState<string>("all");
  const [runnerSearchRaceFilter, setRunnerSearchRaceFilter] = useState<string>("all");
  const [runnerSearchPage, setRunnerSearchPage] = useState(1);
  const [runnerSearchRowsPerPage, setRunnerSearchRowsPerPage] = useState(10);
  const [favoritesRaceFilter, setFavoritesRaceFilter] = useState<string>("all");
  const [favoritesCountryFilter, setFavoritesCountryFilter] = useState<string>("all");
  const [favoritesCategoryFilter, setFavoritesCategoryFilter] = useState<"all" | "men" | "women">("all");
  const [favoritesPage, setFavoritesPage] = useState(1);
  const [favoritesRowsPerPage, setFavoritesRowsPerPage] = useState(10);
  const [selectedRaceSlug, setSelectedRaceSlug] = useState<string>(EDITION_HOME_VALUE);
  const [raceDetailView, setRaceDetailView] = useState<RaceDetailView>("race-page");
  const [organizerWorkspaceView, setOrganizerWorkspaceView] = useState<OrganizerWorkspaceView>("spectator");
  const [organizerSetup, setOrganizerSetup] = useState(() => loadOrganizerSetup());
  const [organizerImportText, setOrganizerImportText] = useState("");
  const [organizerImportFileName, setOrganizerImportFileName] = useState<string | null>(null);
  const [organizerImportMode, setOrganizerImportMode] = useState<OrganizerParticipantImportMode>("merge");
  const [organizerSetupRaceSlug, setOrganizerSetupRaceSlug] = useState<string>(createDefaultOrganizerSetup().races[0]?.slug ?? "");
  const [runnerNavOpen, setRunnerNavOpen] = useState(true);
  const [raceNavOpen, setRaceNavOpen] = useState(true);
  const hasDashboardAccess = profile ? ORGANIZER_ROLES.includes(profile.role as (typeof ORGANIZER_ROLES)[number]) : false;
  const organizerSessionActive = Boolean(accessToken && hasDashboardAccess);
  const apiHost = getApiHost();
  const deferredRunnerQuery = useDeferredValue(runnerQuery);
  const normalizedRunnerQuery = runnerQuery.trim().toUpperCase();
  const festivalData = useMemo(() => {
    const demoRaceBySlug = new Map(demoRaceFestival.races.map((race) => [race.slug, race]));
    const races = organizerSetup.races.map((raceDraft) => {
      const baseRace = demoRaceBySlug.get(raceDraft.slug);

      return {
        ...(baseRace ?? {}),
        ...raceDraft
      } as DemoRaceCard;
    });

    return {
      ...demoRaceFestival,
      brandName: organizerSetup.branding.brandName,
      brandStack: [organizerSetup.branding.brandStackTop, organizerSetup.branding.brandStackBottom],
      editionLabel: organizerSetup.branding.editionLabel,
      dateRibbon: organizerSetup.branding.dateRibbon,
      locationRibbon: organizerSetup.branding.locationRibbon,
      homeTitle: organizerSetup.branding.homeTitle,
      homeSubtitle: organizerSetup.branding.homeSubtitle,
      bannerTagline: organizerSetup.branding.bannerTagline,
      races
    };
  }, [organizerSetup]);
  const spectatorRaces = useMemo(
    () => festivalData.races.filter((race) => organizerSetup.races.find((draft) => draft.slug === race.slug)?.isPublished !== false),
    [festivalData.races, organizerSetup.races]
  );
  const visibleRaces = spectatorRaces;
  const fallbackVisibleRace = visibleRaces[0] ?? festivalData.races[0];
  const featuredRace = visibleRaces.find((race) => race.editionLabel.toLowerCase() === "live") ?? fallbackVisibleRace;
  const selectedRaceCard =
    visibleRaces.find((race) => race.slug === selectedRaceSlug) ??
    (selectedRaceSlug === EDITION_HOME_VALUE ? featuredRace : festivalData.races.find((race) => race.slug === selectedRaceSlug)) ??
    featuredRace;
  const isEditionHome = selectedRaceSlug === EDITION_HOME_VALUE;
  const isFeaturedRace = selectedRaceCard.slug === featuredRace.slug;
  const activeCourse = useMemo(() => {
    const organizerRaceDraft = organizerSetup.races.find((race) => race.slug === selectedRaceCard.slug);

    if (!organizerRaceDraft) {
      return getDemoCourseForRace(selectedRaceCard);
    }

    return buildOrganizerCourseFromRaceDraft(organizerRaceDraft);
  }, [organizerSetup.races, selectedRaceCard]);
  const showEditionHome = isEditionHome && raceDetailView === "race-page";
  const isOrganizerConsoleOpen = organizerSessionActive && organizerWorkspaceView === "console";
  const showSidebarRail = !isEditionHome && !isOrganizerConsoleOpen && raceDetailView === "race-page";
  const organizerSelectedRace =
    organizerSetup.races.find((race) => race.slug === organizerSetupRaceSlug) ?? organizerSetup.races[0] ?? null;
  const organizerCheckpointDraft = organizerSelectedRace ? getOrganizerCheckpointsForRace(organizerSelectedRace) : [];
  const organizerImportPreview = useMemo(() => parseParticipantImportText(organizerImportText), [organizerImportText]);
  const organizerImportedParticipants = useMemo(() => parseParticipantImportRows(organizerImportText), [organizerImportText]);
  const organizerImportImpact = useMemo(
    () => calculateParticipantImportImpact(organizerSelectedRace?.participants ?? [], organizerImportedParticipants),
    [organizerImportedParticipants, organizerSelectedRace]
  );
  const organizerSimulationSnapshots = useMemo(
    () => new Map(organizerSetup.races.map((race) => [race.slug, buildOrganizerRaceSimulationSnapshot(race)])),
    [organizerSetup.races]
  );
  const selectedRaceSimulationSnapshot = organizerSimulationSnapshots.get(selectedRaceCard.slug) ?? null;
  const organizerSelectedRaceSimulationSnapshot = organizerSelectedRace
    ? organizerSimulationSnapshots.get(organizerSelectedRace.slug) ?? null
    : null;

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

    document.documentElement.dataset.theme = "light";

    return () => {
      delete document.documentElement.dataset.theme;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(ORGANIZER_SETUP_STORAGE_KEY, JSON.stringify(organizerSetup));
  }, [organizerSetup]);

  useEffect(() => {
    if (!organizerSessionActive) {
      setOrganizerWorkspaceView("spectator");
      return;
    }

    setOrganizerWorkspaceView((current) => (current === "spectator" ? "console" : current));
  }, [organizerSessionActive]);

  useEffect(() => {
    if (!organizerSetup.races.length) {
      return;
    }

    if (!organizerSetup.races.some((race) => race.slug === organizerSetupRaceSlug)) {
      setOrganizerSetupRaceSlug(organizerSetup.races[0].slug);
    }
  }, [organizerSetup.races, organizerSetupRaceSlug]);

  useEffect(() => {
    if (isOrganizerConsoleOpen || selectedRaceSlug === EDITION_HOME_VALUE) {
      return;
    }

    if (visibleRaces.some((race) => race.slug === selectedRaceSlug)) {
      return;
    }

    setSelectedRaceSlug(EDITION_HOME_VALUE);
    setRaceDetailView("race-page");
  }, [isOrganizerConsoleOpen, selectedRaceSlug, visibleRaces]);

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

        const [nextOverallLeaderboard, nextWomenLeaderboard, checkpointLeaderboards, organizerSignals] =
          await Promise.all([
            fetchOverallLeaderboard(token, undefined, 120),
            fetchOverallLeaderboard(token, "women", 12).catch(() => emptyOverallLeaderboard),
            fetchCheckpointLeaderboards(token),
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

        if (!token) {
          const fallbackRace = isFeaturedRace ? featuredRace : selectedRaceCard;
          const fallbackOverall = buildPreviewLeaderboard(fallbackRace);
          const fallbackWomen = buildPreviewLeaderboard(fallbackRace, "women");
          const fallbackLeaderboards = buildCheckpointLeaderboardsFallback(fallbackRace);

          setOverallLeaderboard(fallbackOverall);
          setWomenLeaderboard(normalizeWomenLeaderboard(fallbackOverall, fallbackWomen));
          setLeaderboards((current) => mergeCheckpointBoards(current, fallbackLeaderboards));
          setFetchError(null);
          setLiveStatus("fallback");
        } else {
          setFetchError(error instanceof Error ? error.message : "Dashboard tidak bisa mengambil data terbaru dari server.");
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
          const [nextOverallLeaderboard, nextWomenLeaderboard, checkpointLeaderboards, organizerSignals] =
            await Promise.all([
              fetchOverallLeaderboard(token, undefined, 120),
              fetchOverallLeaderboard(token, "women", 12).catch(() => emptyOverallLeaderboard),
              fetchCheckpointLeaderboards(token),
              fetchOrganizerSignals(token).catch(() => null)
            ]);

          setOverallLeaderboard(nextOverallLeaderboard ?? emptyOverallLeaderboard);
          setWomenLeaderboard(
            normalizeWomenLeaderboard(nextOverallLeaderboard ?? emptyOverallLeaderboard, nextWomenLeaderboard ?? emptyOverallLeaderboard)
          );
          setLeaderboards((current) => mergeCheckpointBoards(current, checkpointLeaderboards));
          setDuplicates(organizerSignals?.duplicates ?? []);
          setNotifications(organizerSignals?.notifications ?? []);
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

  const previewOverallLeaderboard = useMemo<OverallLeaderboard>(
    () => selectedRaceSimulationSnapshot?.overallLeaderboard ?? buildPreviewLeaderboard(selectedRaceCard),
    [selectedRaceCard, selectedRaceSimulationSnapshot]
  );
  const previewWomenLeaderboard = useMemo<OverallLeaderboard>(
    () => selectedRaceSimulationSnapshot?.womenLeaderboard ?? buildPreviewLeaderboard(selectedRaceCard, "women"),
    [selectedRaceCard, selectedRaceSimulationSnapshot]
  );
  const previewCheckpointLeaderboards = useMemo(
    () => selectedRaceSimulationSnapshot?.checkpointLeaderboards ?? buildCheckpointLeaderboardsFallback(selectedRaceCard),
    [selectedRaceCard, selectedRaceSimulationSnapshot]
  );

  useEffect(() => {
    if (isBootstrapping) {
      return;
    }

    const token = organizerSessionActive ? accessToken : null;
    let isMounted = true;

    async function loadRunnerSearch() {
      if (!isFeaturedRace && !isEditionHome) {
        const previewItems = buildRunnerFallbackResults(previewOverallLeaderboard.topEntries, deferredRunnerQuery, runnerCheckpointFilter);

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
    previewOverallLeaderboard.topEntries,
    runnerCheckpointFilter,
    selectedRaceCard
  ]);

  useEffect(() => {
    window.localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favoriteBibs));
  }, [favoriteBibs]);
  const activeOverallLeaderboard =
    selectedRaceSimulationSnapshot?.overallLeaderboard.topEntries.length
      ? selectedRaceSimulationSnapshot.overallLeaderboard
      : isFeaturedRace && overallLeaderboard.topEntries.length > 0
        ? overallLeaderboard
        : previewOverallLeaderboard;
  const activeWomenLeaderboard =
    selectedRaceSimulationSnapshot?.womenLeaderboard.topEntries.length
      ? selectedRaceSimulationSnapshot.womenLeaderboard
      : isFeaturedRace && womenLeaderboard.topEntries.length > 0
        ? womenLeaderboard
        : previewWomenLeaderboard;
  const activeCheckpointLeaderboards =
    selectedRaceSimulationSnapshot?.checkpointLeaderboards.some((board) => board.totalOfficialScans > 0)
      ? selectedRaceSimulationSnapshot.checkpointLeaderboards
      : isFeaturedRace && leaderboards.length > 0
        ? leaderboards
        : previewCheckpointLeaderboards;
  const activeNotifications =
    selectedRaceSimulationSnapshot?.notifications.length ? selectedRaceSimulationSnapshot.notifications : notifications;
  const activeDuplicates = selectedRaceSimulationSnapshot?.duplicates.length ? selectedRaceSimulationSnapshot.duplicates : duplicates;

  useEffect(() => {
    setFullRankingPage(1);
  }, [fullRankingView]);

  useEffect(() => {
    setFullRankingPage(1);
  }, [runnerCheckpointFilter, runnerQuery, rankingRowsPerPage]);

  useEffect(() => {
    setRankingRaceFilter(isEditionHome ? featuredRace.slug : selectedRaceCard.slug);
  }, [featuredRace.slug, isEditionHome, selectedRaceCard.slug]);

  useEffect(() => {
    setFullRankingPage(1);
  }, [rankingRaceFilter, rankingCountryFilter]);

  useEffect(() => {
    if (!isEditionHome) {
      setRunnerDirectoryRaceFilter(selectedRaceCard.slug);
    }
  }, [isEditionHome, selectedRaceCard.slug]);

  useEffect(() => {
    setRunnerSearchRaceFilter(isEditionHome ? "all" : selectedRaceCard.slug);
  }, [isEditionHome, selectedRaceCard.slug]);

  useEffect(() => {
    setRunnerDirectoryPage(1);
  }, [
    runnerDirectoryCategoryFilter,
    runnerDirectoryCountryFilter,
    runnerDirectoryRaceFilter,
    runnerDirectoryRowsPerPage,
    runnerDirectoryStateFilter,
    normalizedRunnerQuery
  ]);

  useEffect(() => {
    setRunnerSearchPage(1);
  }, [normalizedRunnerQuery, runnerSearchRaceFilter, runnerSearchRowsPerPage]);

  useEffect(() => {
    setFavoritesPage(1);
  }, [favoritesRaceFilter, favoritesCountryFilter, favoritesCategoryFilter, favoritesRowsPerPage, favoriteBibs]);
  useEffect(() => {
    setLeadersPage(1);
  }, [leadersRaceFilter, leadersCountryFilter, leadersCategoryFilter, leadersRowsPerPage]);


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
        const fallbackDetail = buildRunnerDetailFallback(previewOverallLeaderboard.topEntries, runnerBib);

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
        setRunnerDetailError(token ? (error instanceof Error ? error.message : "Detail pelari belum tersedia.") : null);
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
  }, [
    accessToken,
    isBootstrapping,
    isEditionHome,
    isFeaturedRace,
    organizerSessionActive,
    overallLeaderboard.topEntries,
    previewOverallLeaderboard.topEntries,
    selectedRaceCard,
    selectedRunnerBib
  ]);

  const selectedBoard = useMemo(() => {
    return activeCheckpointLeaderboards.find((item) => item.checkpointId === selectedCheckpointId) ?? activeCheckpointLeaderboards[0] ?? null;
  }, [activeCheckpointLeaderboards, selectedCheckpointId]);

  const overallLeader = activeOverallLeaderboard.topEntries[0] ?? null;
  const nameByBib = useMemo(
    () => new Map(activeOverallLeaderboard.topEntries.map((entry) => [entry.bib.toUpperCase(), entry.name])),
    [activeOverallLeaderboard.topEntries]
  );

  const totalOfficialScans = useMemo(() => {
    return activeCheckpointLeaderboards.reduce((sum, item) => sum + item.totalOfficialScans, 0);
  }, [activeCheckpointLeaderboards]);

  const totalRankedRunners = activeOverallLeaderboard.totalRankedRunners;

  const activeCheckpointCount = useMemo(() => {
    return activeCheckpointLeaderboards.filter((item) => item.totalOfficialScans > 0).length;
  }, [activeCheckpointLeaderboards]);
  const finisherCount = useMemo(() => {
    return activeCheckpointLeaderboards.find((item) => item.checkpointId === "finish")?.totalOfficialScans ?? 0;
  }, [activeCheckpointLeaderboards]);
  const starterCount = useMemo(() => {
    return activeCheckpointLeaderboards.find((item) => item.checkpointId === "cp-start")?.totalOfficialScans ?? totalRankedRunners;
  }, [activeCheckpointLeaderboards, totalRankedRunners]);
  const dnfDnsCount = Math.max(starterCount - finisherCount, 0);
  const activeStarterCount =
    selectedRaceSimulationSnapshot?.overallLeaderboard.topEntries.length || isFeaturedRace
      ? starterCount
      : selectedRaceCard.finishers + selectedRaceCard.dnf;

  const courseProfileStops = useMemo(() => {
    return activeCourse.checkpoints.map((checkpoint) => {
      const board = activeCheckpointLeaderboards.find((item) => item.checkpointId === checkpoint.id);
      const leader = board?.topEntries[0] ?? null;
      const isLeaderHere = overallLeader?.checkpointId === checkpoint.id;

      return {
        ...checkpoint,
        totalOfficialScans: board?.totalOfficialScans ?? 0,
        leaderBib: leader?.bib ?? null,
        isLeaderHere
      };
    });
  }, [activeCheckpointLeaderboards, activeCourse.checkpoints, overallLeader]);

  const sidebarOverallRows = activeOverallLeaderboard.topEntries.slice(0, 5);
  const sidebarWomenRows = activeWomenLeaderboard.topEntries.slice(0, 5);

  const lastBroadcast = activeNotifications[0] ?? null;
  const organizerConsoleLeaderboards = useMemo(() => {
    if (!organizerSelectedRace) {
      return [];
    }

    if (organizerSelectedRaceSimulationSnapshot?.checkpointLeaderboards.some((board) => board.totalOfficialScans > 0)) {
      return organizerSelectedRaceSimulationSnapshot.checkpointLeaderboards;
    }

    if (organizerSelectedRace.slug === featuredRace.slug && leaderboards.length > 0) {
      return leaderboards;
    }

    return buildCheckpointLeaderboardsFallback(organizerSelectedRace as DemoRaceCard);
  }, [featuredRace.slug, leaderboards, organizerSelectedRace, organizerSelectedRaceSimulationSnapshot]);
  const organizerConsoleDuplicates =
    organizerSelectedRaceSimulationSnapshot?.duplicates.length
      ? organizerSelectedRaceSimulationSnapshot.duplicates
      : organizerSelectedRace?.slug === featuredRace.slug
        ? activeDuplicates
        : [];
  const organizerConsoleNotifications =
    organizerSelectedRaceSimulationSnapshot?.notifications.length
      ? organizerSelectedRaceSimulationSnapshot.notifications
      : organizerSelectedRace?.slug === featuredRace.slug
        ? activeNotifications
        : [];
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
  const alphabeticalRunnerResults = useMemo(() => {
    return [...activeOverallLeaderboard.topEntries].sort((left, right) => left.name.localeCompare(right.name));
  }, [activeOverallLeaderboard.topEntries]);
  const totalDistanceKm = selectedRaceCard.distanceKm;
  const activeAscentM = selectedRaceCard.ascentM;
  const activeFinisherCount =
    selectedRaceSimulationSnapshot?.overallLeaderboard.topEntries.length || isFeaturedRace ? finisherCount : selectedRaceCard.finishers;
  const activeDnfCount =
    selectedRaceSimulationSnapshot?.overallLeaderboard.topEntries.length || isFeaturedRace ? dnfDnsCount : selectedRaceCard.dnf;
  const isActiveRaceLive = selectedRaceCard.editionLabel.toLowerCase() === "live";
  const statsGeneratedLabel = new Date().toLocaleString([], {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  });
  const getDisplayRaceTime = (bib: string, scannedAt: string) => {
    const previewTime = getPreviewRankingTime(selectedRaceCard.rankingPreview, bib);
    return previewTime ?? formatElapsedRaceTime(scannedAt, activeRaceStartAt);
  };
  const getRaceCardDisplayTime = (race: DemoRaceCard, bib: string, scannedAt: string) => {
    const previewTime = getPreviewRankingTime(race.rankingPreview, bib);
    return previewTime ?? formatElapsedRaceTime(scannedAt, race.startAt);
  };
  const runnerDirectoryEntries = useMemo<RunnerDirectoryEntry[]>(() => {
    return visibleRaces.flatMap((race) => {
      const organizerRaceDraft = organizerSetup.races.find((item) => item.slug === race.slug);
      const raceSimulationSnapshot = organizerSimulationSnapshots.get(race.slug);
      const simulatedEntries = raceSimulationSnapshot?.overallLeaderboard.topEntries ?? [];
      const useSimulatedEntries = simulatedEntries.length > 0;
      const useLiveEntries = !useSimulatedEntries && race.slug === featuredRace.slug && overallLeaderboard.topEntries.length > 0;
      const rankedRows: RunnerDirectoryEntry[] = ((useSimulatedEntries ? simulatedEntries : useLiveEntries ? overallLeaderboard.topEntries : null)
        ? (useSimulatedEntries ? simulatedEntries : overallLeaderboard.topEntries).map((entry) => ({
            rank: entry.rank,
            name: entry.name,
            bib: entry.bib,
            category: (entry.category.toLowerCase() === "women" ? "women" : "men") as "men" | "women",
            state: (entry.checkpointId === "finish" ? "finisher" : "in-race") as Exclude<RunnerDirectoryState, "all">,
            raceTime: getRaceCardDisplayTime(race, entry.bib, entry.scannedAt),
            scannedAt: entry.scannedAt,
            statusLabel:
              entry.checkpointId === "finish"
                ? "Finisher"
                : formatCheckpointLabel({ code: entry.checkpointCode, kmMarker: entry.checkpointKmMarker })
          }))
        : race.rankingPreview.map((entry) => {
            const state = normalizeRunnerDirectoryState(entry.status);
            const inRaceCheckpoint =
              entry.status === "In race" &&
              typeof entry.checkpointCode === "string" &&
              typeof entry.checkpointKmMarker === "number"
                ? formatCheckpointLabel({ code: entry.checkpointCode, kmMarker: entry.checkpointKmMarker })
                : null;

            return {
              rank: state === "registered" || state === "dns" || state === "withdrawn" ? null : entry.rank,
              name: entry.name,
              bib: entry.bib,
              category: (entry.category ?? "men") as "men" | "women",
              state,
              raceTime:
                state === "registered" || state === "dns" || state === "withdrawn"
                  ? "--:--:--"
                  : getRaceCardDisplayTime(race, entry.bib, race.startAt),
              scannedAt: race.startAt,
              statusLabel: inRaceCheckpoint ?? formatRunnerDirectoryStateLabel(state)
            };
          })
        ).map((entry) => ({
          ...entry,
          raceSlug: race.slug,
          raceTitle: race.title,
          teamName: getRunnerTeamName(entry.bib),
          countryCode: getNationalityCode(entry.bib) as CountryCode,
          infoLabel: `Club ${getRunnerTeamName(entry.bib)}`,
          checkpointId: (entry as { checkpointId?: string | null }).checkpointId ?? null,
          checkpointCode: (entry as { checkpointCode?: string | null }).checkpointCode ?? null,
            checkpointName: (entry as { checkpointName?: string | null }).checkpointName ?? null,
            checkpointKmMarker: (entry as { checkpointKmMarker?: number | null }).checkpointKmMarker ?? null,
            checkpointOrder: (entry as { checkpointOrder?: number | null }).checkpointOrder ?? null
        }));

      const organizerParticipantRows = (organizerRaceDraft?.participants ?? []).map((participant): RunnerDirectoryEntry => {
        const existing = rankedRows.find((entry) => entry.bib.toUpperCase() === participant.bib.toUpperCase());
        const countryCode = normalizeCountryCodeValue(participant.countryCode);
        const teamName = participant.club.trim() || existing?.teamName || getRunnerTeamName(participant.bib);

        if (existing) {
          return {
            ...existing,
            name: participant.name,
            teamName,
            countryCode,
            category: participant.gender,
            infoLabel: teamName ? `Club ${teamName}` : existing.infoLabel
          };
        }

        return {
          raceSlug: race.slug,
          raceTitle: race.title,
          bib: participant.bib.toUpperCase(),
          name: participant.name,
          teamName,
          countryCode,
          category: participant.gender,
          state: "registered",
          statusLabel: "Registered",
          infoLabel: teamName ? `Club ${teamName}` : "Participant import",
          raceTime: "--:--:--",
          rank: null,
          scannedAt: race.startAt,
          checkpointId: null,
          checkpointCode: null,
          checkpointName: null,
          checkpointKmMarker: null,
          checkpointOrder: null
        };
      });

      const mergedRows = [
        ...organizerParticipantRows,
        ...rankedRows.filter(
          (entry) => !organizerParticipantRows.some((participant) => participant.bib.toUpperCase() === entry.bib.toUpperCase())
        )
      ];

      const extraRows = Array.from({ length: Math.max(0, 12 - mergedRows.length) }, (_, index) => {
        const profile = RUNNER_DIRECTORY_EXTRA_PROFILES[index % RUNNER_DIRECTORY_EXTRA_PROFILES.length];
        const bib = `${race.slug.replace(/[^a-z0-9]/gi, "").slice(0, 2).toUpperCase()}${String(index + 701)}`;
        const state = normalizeRunnerDirectoryState(profile.state);

        return {
          raceSlug: race.slug,
          raceTitle: race.title,
          bib,
          name: profile.name,
          teamName: getRunnerTeamName(bib),
          countryCode: getNationalityCode(bib) as CountryCode,
          category: profile.category,
          state,
            statusLabel: formatRunnerDirectoryStateLabel(state),
            infoLabel: `Club ${getRunnerTeamName(bib)}`,
            raceTime: "--:--:--",
            rank: null,
            scannedAt: race.startAt,
            checkpointId: null,
            checkpointCode: null,
            checkpointName: null,
            checkpointKmMarker: null,
            checkpointOrder: null
          } satisfies RunnerDirectoryEntry;
      });

      return [...mergedRows, ...extraRows];
    });
  }, [featuredRace.slug, organizerSetup.races, organizerSimulationSnapshots, overallLeaderboard.topEntries, visibleRaces]);
  const runnerDirectoryCountries = useMemo(
    () =>
      [...new Set(runnerDirectoryEntries.map((entry) => entry.countryCode))]
        .sort((left, right) => COUNTRY_META[left].name.localeCompare(COUNTRY_META[right].name)),
    [runnerDirectoryEntries]
  );
  const rankingSelectedRace = useMemo(
    () => visibleRaces.find((race) => race.slug === rankingRaceFilter) ?? (isEditionHome ? featuredRace : selectedRaceCard),
    [featuredRace, isEditionHome, rankingRaceFilter, selectedRaceCard, visibleRaces]
  );
  const rankingRaceIsLive = rankingSelectedRace.editionLabel.toLowerCase() === "live";
  const rankingRaceEntries = useMemo(() => {
    return runnerDirectoryEntries
      .filter((entry) => entry.raceSlug === rankingSelectedRace.slug)
      .filter((entry) => entry.rank !== null && (entry.state === "in-race" || entry.state === "finisher"))
      .sort((left, right) => (left.rank ?? Number.MAX_SAFE_INTEGER) - (right.rank ?? Number.MAX_SAFE_INTEGER));
  }, [rankingSelectedRace.slug, runnerDirectoryEntries]);
  const rankingCountries = useMemo(
    () =>
      [...new Set(rankingRaceEntries.map((entry) => entry.countryCode))]
        .sort((left, right) => COUNTRY_META[left].name.localeCompare(COUNTRY_META[right].name)),
    [rankingRaceEntries]
  );
  const rankingGenderRankByBib = useMemo(() => {
    const next = new Map<string, number>();
    let menRank = 0;
    let womenRank = 0;

    rankingRaceEntries.forEach((entry) => {
      if (entry.category === "women") {
        womenRank += 1;
        next.set(entry.bib, womenRank);
        return;
      }

      menRank += 1;
      next.set(entry.bib, menRank);
    });

    return next;
  }, [rankingRaceEntries]);
  const fullRankingEntries = useMemo(() => {
    return rankingRaceEntries.filter((entry) => {
      const matchesCategory =
        fullRankingView === "overall"
          ? true
          : fullRankingView === "women"
            ? entry.category === "women"
            : entry.category === "men";
      const matchesCountry = rankingCountryFilter === "all" ? true : entry.countryCode === rankingCountryFilter;
      const matchesQuery =
        !normalizedRunnerQuery ||
        entry.bib.toUpperCase().includes(normalizedRunnerQuery) ||
        entry.name.toUpperCase().includes(normalizedRunnerQuery) ||
        entry.teamName.toUpperCase().includes(normalizedRunnerQuery);
      const matchesCheckpoint = runnerCheckpointFilter === "all" || entry.checkpointId === runnerCheckpointFilter;
      return matchesCategory && matchesCountry && matchesQuery && matchesCheckpoint;
    });
  }, [fullRankingView, normalizedRunnerQuery, rankingCountryFilter, rankingRaceEntries, runnerCheckpointFilter]);
  const fullRankingPageCount = Math.max(1, Math.ceil(fullRankingEntries.length / rankingRowsPerPage));
  const fullRankingRows = fullRankingEntries.slice((fullRankingPage - 1) * rankingRowsPerPage, fullRankingPage * rankingRowsPerPage);
  const getRankingEntryRaceTime = (entry: RunnerDirectoryEntry) => {
    if (entry.raceTime && entry.raceTime !== "--:--:--") {
      return entry.raceTime;
    }

    return formatElapsedRaceTime(entry.scannedAt, rankingSelectedRace.startAt);
  };
  const selectedRunnerEntry = useMemo(() => {
    if (!selectedRunnerBib) {
      return null;
    }

    return runnerDirectoryEntries.find((entry) => entry.bib === selectedRunnerBib) ?? null;
  }, [runnerDirectoryEntries, selectedRunnerBib]);
  const filteredRunnerDirectoryEntries = useMemo(() => {
    return runnerDirectoryEntries.filter((entry) => {
      const matchesRace = runnerDirectoryRaceFilter ? entry.raceSlug === runnerDirectoryRaceFilter : true;
      const matchesState = runnerDirectoryStateFilter === "all" ? true : entry.state === runnerDirectoryStateFilter;
      const matchesCountry = runnerDirectoryCountryFilter === "all" ? true : entry.countryCode === runnerDirectoryCountryFilter;
      const matchesCategory = runnerDirectoryCategoryFilter === "all" ? true : entry.category === runnerDirectoryCategoryFilter;
      const matchesQuery =
        !normalizedRunnerQuery ||
        entry.name.toUpperCase().includes(normalizedRunnerQuery) ||
        entry.bib.toUpperCase().includes(normalizedRunnerQuery) ||
        entry.teamName.toUpperCase().includes(normalizedRunnerQuery);

      return matchesRace && matchesState && matchesCountry && matchesCategory && matchesQuery;
    });
  }, [
    normalizedRunnerQuery,
    runnerDirectoryCategoryFilter,
    runnerDirectoryCountryFilter,
    runnerDirectoryEntries,
    runnerDirectoryRaceFilter,
    runnerDirectoryStateFilter
  ]);
  const runnerDirectoryPageCount = Math.max(1, Math.ceil(filteredRunnerDirectoryEntries.length / runnerDirectoryRowsPerPage));
  const runnerDirectoryRows = filteredRunnerDirectoryEntries.slice(
    (runnerDirectoryPage - 1) * runnerDirectoryRowsPerPage,
    runnerDirectoryPage * runnerDirectoryRowsPerPage
  );
  const runnerDirectoryRangeLabel = filteredRunnerDirectoryEntries.length
    ? `${(runnerDirectoryPage - 1) * runnerDirectoryRowsPerPage + 1}-${Math.min(
        runnerDirectoryPage * runnerDirectoryRowsPerPage,
        filteredRunnerDirectoryEntries.length
      )} of ${filteredRunnerDirectoryEntries.length}`
    : "0-0 of 0";
  const raceLeaderEntries = useMemo<RaceLeaderEntry[]>(() => {
    const genderRanks = new Map<string, number>();
    const groupedByRaceAndGender = new Map<string, RunnerDirectoryEntry[]>();

    runnerDirectoryEntries
      .filter((entry) => entry.rank !== null && (entry.state === "in-race" || entry.state === "finisher"))
      .forEach((entry) => {
        const key = `${entry.raceSlug}:${entry.category}`;
        const bucket = groupedByRaceAndGender.get(key) ?? [];
        bucket.push(entry);
        groupedByRaceAndGender.set(key, bucket);
      });

    groupedByRaceAndGender.forEach((bucket, key) => {
      bucket
        .slice()
        .sort((left, right) => (left.rank ?? Number.MAX_SAFE_INTEGER) - (right.rank ?? Number.MAX_SAFE_INTEGER))
        .forEach((entry, index) => {
          genderRanks.set(`${key}:${entry.bib}`, index + 1);
        });
    });

    return runnerDirectoryEntries
      .filter((entry) => entry.rank !== null && (entry.state === "in-race" || entry.state === "finisher"))
      .map((entry) => {
        const race = visibleRaces.find((item) => item.slug === entry.raceSlug) ?? selectedRaceCard;
        const nextPassing = estimateNextPassing(race, entry);
        const lastPointLabel =
          entry.checkpointId === "finish"
            ? "Finish"
            : entry.checkpointCode && entry.checkpointKmMarker !== null && entry.checkpointKmMarker !== undefined
              ? formatCheckpointLabel({
                  code: entry.checkpointCode,
                  kmMarker: entry.checkpointKmMarker
                })
              : entry.statusLabel;

        return {
          ...entry,
          genderRank: genderRanks.get(`${entry.raceSlug}:${entry.category}:${entry.bib}`) ?? entry.rank ?? 0,
          lastPointLabel,
          nextPassingLabel: nextPassing.label,
          nextPassingTime: nextPassing.time
        };
      })
      .sort((left, right) => {
        if (left.raceTitle !== right.raceTitle) {
          return left.raceTitle.localeCompare(right.raceTitle);
        }

        return (left.rank ?? Number.MAX_SAFE_INTEGER) - (right.rank ?? Number.MAX_SAFE_INTEGER);
      });
  }, [runnerDirectoryEntries, selectedRaceCard, visibleRaces]);
  const raceLeaderCountries = useMemo(
    () =>
      [...new Set(raceLeaderEntries.map((entry) => entry.countryCode))]
        .sort((left, right) => COUNTRY_META[left].name.localeCompare(COUNTRY_META[right].name)),
    [raceLeaderEntries]
  );
  const leadersSelectedRace = useMemo(
    () => (leadersRaceFilter === "all" ? null : visibleRaces.find((race) => race.slug === leadersRaceFilter) ?? selectedRaceCard),
    [leadersRaceFilter, selectedRaceCard, visibleRaces]
  );
  const filteredRaceLeaderEntries = useMemo(() => {
    return raceLeaderEntries.filter((entry) => {
      const matchesRace = leadersRaceFilter === "all" ? true : entry.raceSlug === leadersRaceFilter;
      const matchesCountry = leadersCountryFilter === "all" ? true : entry.countryCode === leadersCountryFilter;
      const matchesCategory = leadersCategoryFilter === "all" ? true : entry.category === leadersCategoryFilter;
      return matchesRace && matchesCountry && matchesCategory;
    });
  }, [leadersCategoryFilter, leadersCountryFilter, leadersRaceFilter, raceLeaderEntries]);
  const raceLeadersPageCount = Math.max(1, Math.ceil(filteredRaceLeaderEntries.length / leadersRowsPerPage));
  const raceLeaderRows = filteredRaceLeaderEntries.slice((leadersPage - 1) * leadersRowsPerPage, leadersPage * leadersRowsPerPage);
  const raceLeadersRangeLabel = filteredRaceLeaderEntries.length
    ? `${(leadersPage - 1) * leadersRowsPerPage + 1}-${Math.min(leadersPage * leadersRowsPerPage, filteredRaceLeaderEntries.length)} of ${filteredRaceLeaderEntries.length}`
    : "0-0 of 0";
  const leadersRaceCount = useMemo(
    () => new Set(filteredRaceLeaderEntries.map((entry) => entry.raceSlug)).size,
    [filteredRaceLeaderEntries]
  );
  const searchRunnerEntries = useMemo(() => {
    if (!normalizedRunnerQuery) {
      return [] as RunnerDirectoryEntry[];
    }

    return runnerDirectoryEntries.filter((entry) => {
      const matchesRace = runnerSearchRaceFilter === "all" ? true : entry.raceSlug === runnerSearchRaceFilter;
      const matchesQuery =
        entry.name.toUpperCase().includes(normalizedRunnerQuery) ||
        entry.bib.toUpperCase().includes(normalizedRunnerQuery) ||
        entry.teamName.toUpperCase().includes(normalizedRunnerQuery);

      return matchesRace && matchesQuery;
    });
  }, [normalizedRunnerQuery, runnerDirectoryEntries, runnerSearchRaceFilter]);
  const runnerSearchPageCount = Math.max(1, Math.ceil(searchRunnerEntries.length / runnerSearchRowsPerPage));
  const pagedSearchRunnerEntries = searchRunnerEntries.slice(
    (runnerSearchPage - 1) * runnerSearchRowsPerPage,
    runnerSearchPage * runnerSearchRowsPerPage
  );
  const runnerSearchRangeLabel = searchRunnerEntries.length
    ? `${(runnerSearchPage - 1) * runnerSearchRowsPerPage + 1}-${Math.min(
        runnerSearchPage * runnerSearchRowsPerPage,
        searchRunnerEntries.length
      )} of ${searchRunnerEntries.length}`
    : "0-0 of 0";
  const runnerSearchSelectedRace = useMemo(
    () => (runnerSearchRaceFilter === "all" ? null : visibleRaces.find((race) => race.slug === runnerSearchRaceFilter) ?? selectedRaceCard),
    [runnerSearchRaceFilter, selectedRaceCard, visibleRaces]
  );
  const runnerSearchScopeItems = useMemo(
    () => [
      {
        label: "Scope",
        value: runnerSearchSelectedRace?.title ?? `${festivalData.editionLabel} edition`
      },
      {
        label: "Query",
        value: normalizedRunnerQuery || "Type a bib, name, or club"
      },
      {
        label: "Visible",
        value: `${searchRunnerEntries.length} runners`
      },
      {
        label: "Source",
        value: runnerSearchMode === "server" ? "Live directory" : "Fallback directory"
      }
    ],
    [festivalData.editionLabel, normalizedRunnerQuery, runnerSearchMode, runnerSearchSelectedRace, searchRunnerEntries.length]
  );
  const runnerDirectorySelectedRace = useMemo(
    () => (runnerDirectoryRaceFilter ? visibleRaces.find((race) => race.slug === runnerDirectoryRaceFilter) ?? selectedRaceCard : selectedRaceCard),
    [runnerDirectoryRaceFilter, selectedRaceCard, visibleRaces]
  );
  const runnerDirectoryScopeItems = useMemo(
    () => [
      {
        label: "Race",
        value: runnerDirectorySelectedRace.title
      },
      {
        label: "State",
        value:
          runnerDirectoryStateFilter === "all"
            ? "All states"
            : runnerDirectoryStateFilter === "registered"
              ? "Registered"
              : runnerDirectoryStateFilter === "in-race"
                ? "In race"
                : runnerDirectoryStateFilter === "finisher"
                  ? "Finisher"
                  : runnerDirectoryStateFilter === "dns"
                    ? "DNS"
                    : "DNF"
      },
      {
        label: "Visible",
        value: `${filteredRunnerDirectoryEntries.length} runners`
      },
      {
        label: "Category",
        value: runnerDirectoryCategoryFilter === "all" ? "All categories" : formatCategoryLabel(runnerDirectoryCategoryFilter)
      }
    ],
    [filteredRunnerDirectoryEntries.length, runnerDirectoryCategoryFilter, runnerDirectorySelectedRace, runnerDirectoryStateFilter]
  );
  const favoriteGenderRankMap = useMemo(() => {
    const next = new Map<string, number>();
    const grouped = new Map<string, RunnerDirectoryEntry[]>();

    runnerDirectoryEntries.forEach((entry) => {
      const key = `${entry.raceSlug}:${entry.category}`;
      const bucket = grouped.get(key) ?? [];
      bucket.push(entry);
      grouped.set(key, bucket);
    });

    grouped.forEach((bucket, key) => {
      bucket
        .slice()
        .sort((left, right) => (left.rank ?? Number.MAX_SAFE_INTEGER) - (right.rank ?? Number.MAX_SAFE_INTEGER))
        .forEach((entry, index) => {
          next.set(`${key}:${entry.bib}`, index + 1);
        });
    });

    return next;
  }, [runnerDirectoryEntries]);
  const favoriteDirectoryEntries = useMemo(() => {
    const favoriteSet = new Set(favoriteBibs);
    return runnerDirectoryEntries
      .filter((entry) => favoriteSet.has(entry.bib))
      .slice()
      .sort((left, right) => {
        if (left.raceTitle !== right.raceTitle) {
          return left.raceTitle.localeCompare(right.raceTitle);
        }
        return (left.rank ?? Number.MAX_SAFE_INTEGER) - (right.rank ?? Number.MAX_SAFE_INTEGER);
      });
  }, [favoriteBibs, runnerDirectoryEntries]);
  const favoriteDirectoryCountries = useMemo(
    () => [...new Set(favoriteDirectoryEntries.map((entry) => entry.countryCode))].sort(),
    [favoriteDirectoryEntries]
  );
  const filteredFavoriteDirectoryEntries = favoriteDirectoryEntries.filter((entry) => {
    const matchesRace = favoritesRaceFilter === "all" ? true : entry.raceSlug === favoritesRaceFilter;
    const matchesCountry = favoritesCountryFilter === "all" ? true : entry.countryCode === favoritesCountryFilter;
    const matchesCategory = favoritesCategoryFilter === "all" ? true : entry.category === favoritesCategoryFilter;
    return matchesRace && matchesCountry && matchesCategory;
  });
  const favoritesPageCount = Math.max(1, Math.ceil(filteredFavoriteDirectoryEntries.length / favoritesRowsPerPage));
  const favoriteRows = filteredFavoriteDirectoryEntries.slice(
    (favoritesPage - 1) * favoritesRowsPerPage,
    favoritesPage * favoritesRowsPerPage
  );
  const favoritesRangeLabel = filteredFavoriteDirectoryEntries.length
    ? `${(favoritesPage - 1) * favoritesRowsPerPage + 1}-${Math.min(
        favoritesPage * favoritesRowsPerPage,
        filteredFavoriteDirectoryEntries.length
      )} of ${filteredFavoriteDirectoryEntries.length}`
    : "0-0 of 0";
  const favoritesSelectedRace = useMemo(
    () => (favoritesRaceFilter === "all" ? null : visibleRaces.find((race) => race.slug === favoritesRaceFilter) ?? selectedRaceCard),
    [favoritesRaceFilter, selectedRaceCard, visibleRaces]
  );
  const favoritesScopeItems = useMemo(
    () => [
      {
        label: "Scope",
        value: favoritesSelectedRace?.title ?? `${festivalData.editionLabel} edition`
      },
      {
        label: "Tracked",
        value: `${favoriteDirectoryEntries.length} runners`
      },
      {
        label: "Visible",
        value: `${filteredFavoriteDirectoryEntries.length} runners`
      },
      {
        label: "Category",
        value: favoritesCategoryFilter === "all" ? "All categories" : formatCategoryLabel(favoritesCategoryFilter)
      }
    ],
    [
      festivalData.editionLabel,
      favoriteDirectoryEntries.length,
      favoritesCategoryFilter,
      favoritesSelectedRace,
      filteredFavoriteDirectoryEntries.length
    ]
  );
  const selectedFavoriteRunner = useMemo(
    () => favoriteDirectoryEntries.find((entry) => entry.bib === selectedRunnerBib) ?? favoriteDirectoryEntries[0] ?? null,
    [favoriteDirectoryEntries, selectedRunnerBib]
  );
  const myRunnersScopeItems = useMemo(
    () => [
      {
        label: "Tracked",
        value: `${favoriteDirectoryEntries.length} runners`
      },
      {
        label: "Selected",
        value: selectedFavoriteRunner?.name ?? "No runner selected"
      },
      {
        label: "Race",
        value: selectedFavoriteRunner?.raceTitle ?? "Choose a followed runner"
      },
      {
        label: "Status",
        value: selectedFavoriteRunner?.statusLabel ?? "Waiting for favorites"
      }
    ],
    [favoriteDirectoryEntries.length, selectedFavoriteRunner]
  );
  const statisticsSelectedRace = useMemo(
    () => (statisticsRaceFilter === "all" ? null : visibleRaces.find((race) => race.slug === statisticsRaceFilter) ?? selectedRaceCard),
    [selectedRaceCard, statisticsRaceFilter, visibleRaces]
  );
  const statisticsEntries = useMemo(() => {
    return statisticsRaceFilter === "all"
      ? runnerDirectoryEntries
      : runnerDirectoryEntries.filter((entry) => entry.raceSlug === statisticsRaceFilter);
  }, [runnerDirectoryEntries, statisticsRaceFilter]);
  const statisticsStarterEntries = useMemo(
    () => statisticsEntries.filter((entry) => entry.state === "in-race" || entry.state === "finisher" || entry.state === "withdrawn"),
    [statisticsEntries]
  );
  const statisticsFinisherEntries = useMemo(
    () => statisticsEntries.filter((entry) => entry.state === "finisher"),
    [statisticsEntries]
  );
  const statisticsWithdrawalEntries = useMemo(
    () => statisticsEntries.filter((entry) => entry.state === "withdrawn"),
    [statisticsEntries]
  );
  const statisticsRegisteredCount = statisticsEntries.length;
  const statisticsStarterCount = statisticsStarterEntries.length;
  const statisticsFinisherCount = statisticsFinisherEntries.length;
  const statisticsWithdrawalCount = statisticsWithdrawalEntries.length;
  const starterGenderSplit = useMemo(() => countGenderSplit(statisticsStarterEntries), [statisticsStarterEntries]);
  const finishGenderSplit = useMemo(() => countGenderSplit(statisticsFinisherEntries), [statisticsFinisherEntries]);
  const withdrawalGenderSplit = useMemo(() => countGenderSplit(statisticsWithdrawalEntries), [statisticsWithdrawalEntries]);
  const statisticsCards = useMemo(
    () => [
      {
        key: "starters",
        title: "Starters",
        total: statisticsStarterCount,
        accentClass: "statistics-card-starters",
        split: starterGenderSplit
      },
      {
        key: "withdrawals",
        title: "Withdrawals",
        total: statisticsWithdrawalCount,
        accentClass: "statistics-card-withdrawals",
        split: withdrawalGenderSplit
      },
      {
        key: "finishers",
        title: "Finishers",
        total: statisticsFinisherCount,
        accentClass: "statistics-card-finishers",
        split: finishGenderSplit
      }
    ],
    [
      finishGenderSplit,
      starterGenderSplit,
      statisticsFinisherCount,
      statisticsStarterCount,
      statisticsWithdrawalCount,
      withdrawalGenderSplit
    ]
  );
  const statisticsCountries = useMemo(() => {
    const sourceEntries = statisticsStarterEntries.length ? statisticsStarterEntries : statisticsEntries;
    const countsByCountry = new Map<CountryCode, number>();

    sourceEntries.forEach((entry) => {
      countsByCountry.set(entry.countryCode, (countsByCountry.get(entry.countryCode) ?? 0) + 1);
    });

    return [...countsByCountry.entries()]
      .map(([code, count]) => ({
        code,
        name: COUNTRY_META[code].name,
        count,
        percent: sourceEntries.length ? (count / sourceEntries.length) * 100 : 0
      }))
      .sort((left, right) => right.count - left.count)
      .slice(0, 8);
  }, [statisticsEntries, statisticsStarterEntries]);
  const statisticsWorldMapMarkup = useMemo(() => {
    if (typeof DOMParser === "undefined") {
      return worldMapSvgRaw;
    }

    const parser = new DOMParser();
    const svgDocument = parser.parseFromString(worldMapSvgRaw, "image/svg+xml");
    const svgElement = svgDocument.querySelector("svg");
    if (!svgElement) {
      return worldMapSvgRaw;
    }

    svgElement.setAttribute("class", "statistics-world-map");
    svgElement.removeAttribute("width");
    svgElement.removeAttribute("height");

    const activeCountryCodes = new Set(statisticsCountries.map((country) => country.code.toLowerCase()));
    svgElement.querySelectorAll("[id]").forEach((element) => {
      const elementId = element.getAttribute("id")?.toLowerCase() ?? "";
      if (!elementId || elementId === "world" || elementId === "rim") {
        return;
      }

      element.classList.add("statistics-world-country");
      if (activeCountryCodes.has(elementId)) {
        element.classList.add("is-active");
      }
    });

    return svgElement.outerHTML;
  }, [statisticsCountries]);
  const statisticsContextLabel = statisticsSelectedRace
    ? `${statisticsSelectedRace.title} · ${statisticsSelectedRace.distanceKm.toFixed(1)} km · ${statisticsSelectedRace.ascentM} m+`
    : `${visibleRaces.length} races · ${statisticsRegisteredCount.toLocaleString()} registered runners`;
  const leadersScopeItems = useMemo(() => {
    if (leadersSelectedRace) {
      return [
        { label: "Status", value: leadersSelectedRace.editionLabel },
        { label: "Distance", value: `${leadersSelectedRace.distanceKm.toFixed(1)} km` },
        { label: "Ascent", value: `${leadersSelectedRace.ascentM} m+` },
        { label: "Visible", value: `${filteredRaceLeaderEntries.length} runners` }
      ];
    }

    return [
      { label: "Scope", value: `${leadersRaceCount} races` },
      { label: "Visible", value: `${filteredRaceLeaderEntries.length} runners` },
      { label: "Category", value: leadersCategoryFilter === "all" ? "All" : formatCategoryLabel(leadersCategoryFilter) },
      { label: "Nationality", value: leadersCountryFilter === "all" ? "All" : COUNTRY_META[leadersCountryFilter as CountryCode].name }
    ];
  }, [filteredRaceLeaderEntries.length, leadersCategoryFilter, leadersCountryFilter, leadersRaceCount, leadersSelectedRace]);
  const rankingScopeItems = useMemo(() => {
    return [
      { label: "Race", value: rankingSelectedRace.title },
      { label: "Status", value: rankingSelectedRace.editionLabel },
      { label: "Category", value: fullRankingView === "overall" ? "Overall" : fullRankingView === "women" ? "Women" : "Men" },
      { label: "Visible", value: `${fullRankingEntries.length} runners` }
    ];
  }, [fullRankingEntries.length, fullRankingView, rankingSelectedRace.editionLabel, rankingSelectedRace.title]);

  useEffect(() => {
    if (runnerDirectoryPage > runnerDirectoryPageCount) {
      setRunnerDirectoryPage(runnerDirectoryPageCount);
    }
  }, [runnerDirectoryPage, runnerDirectoryPageCount]);

  useEffect(() => {
    if (fullRankingPage > fullRankingPageCount) {
      setFullRankingPage(fullRankingPageCount);
    }
  }, [fullRankingPage, fullRankingPageCount]);

  useEffect(() => {
    if (runnerSearchPage > runnerSearchPageCount) {
      setRunnerSearchPage(runnerSearchPageCount);
    }
  }, [runnerSearchPage, runnerSearchPageCount]);

  useEffect(() => {
    if (favoritesPage > favoritesPageCount) {
      setFavoritesPage(favoritesPageCount);
    }
  }, [favoritesPage, favoritesPageCount]);
  useEffect(() => {
    if (leadersPage > raceLeadersPageCount) {
      setLeadersPage(raceLeadersPageCount);
    }
  }, [leadersPage, raceLeadersPageCount]);

  const fullRankingRangeLabel = fullRankingEntries.length
    ? `${(fullRankingPage - 1) * rankingRowsPerPage + 1}-${Math.min(
        fullRankingPage * rankingRowsPerPage,
        fullRankingEntries.length
      )} of ${fullRankingEntries.length}`
    : "0-0 of 0";
  const raceHomeCards = useMemo(() => {
    return visibleRaces.map((race) => {
      const raceSimulationSnapshot = organizerSimulationSnapshots.get(race.slug);
      const hasSimulatedEntries = (raceSimulationSnapshot?.overallLeaderboard.topEntries.length ?? 0) > 0;
      const homeEntries = hasSimulatedEntries
        ? raceSimulationSnapshot?.overallLeaderboard.topEntries ?? []
        : race.slug === featuredRace.slug && overallLeaderboard.topEntries.length
          ? overallLeaderboard.topEntries
          : null;

      if (!homeEntries) {
        return {
          ...race,
          isLive: race.editionLabel.toLowerCase() === "live",
          isSelected: race.slug === selectedRaceCard.slug
        };
      }

      return {
        ...race,
        finishers: hasSimulatedEntries
          ? raceSimulationSnapshot?.checkpointLeaderboards.find((board) => board.checkpointId === "finish")?.totalOfficialScans ?? 0
          : finisherCount,
        dnf: hasSimulatedEntries ? 0 : dnfDnsCount,
        rankingPreview: homeEntries
          .slice(0, 3)
          .map((entry) => ({
            rank: entry.rank,
            name: entry.name,
            bib: entry.bib,
            gap: formatElapsedRaceTime(entry.scannedAt, race.startAt),
            status: entry.checkpointId === "finish" ? ("Finisher" as const) : ("In race" as const),
            category: (entry.category.toLowerCase() === "women" ? "women" : "men") as "women" | "men",
            checkpointId: entry.checkpointId,
            checkpointCode: entry.checkpointCode,
            checkpointName: entry.checkpointName,
            checkpointKmMarker: entry.checkpointKmMarker,
            checkpointOrder: entry.checkpointOrder
          })),
        isLive: race.editionLabel.toLowerCase() === "live",
        isSelected: race.slug === selectedRaceCard.slug
      };
    });
  }, [dnfDnsCount, featuredRace.slug, finisherCount, organizerSimulationSnapshots, overallLeaderboard.topEntries, selectedRaceCard.slug, visibleRaces]);
  const eventTitle = isEditionHome ? festivalData.brandName : selectedRaceCard.title;
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
  const activeRaceStartAt = selectedRaceCard.startAt;
  const hasRunnerSearchFilters = runnerQuery.trim().length > 0 || runnerCheckpointFilter !== "all";
  const publicRunnerResults =
    runnerResults.length || hasRunnerSearchFilters
      ? runnerResults
      : buildRunnerFallbackResults(activeOverallLeaderboard.topEntries, "", "all");
  const myRunnerHeading = selectedRunnerEntry?.name ?? runnerDetail?.name ?? "My runners";
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
    setOrganizerWorkspaceView("spectator");
  }

  function updateOrganizerBranding(patch: Partial<OrganizerBrandingDraft>) {
    setOrganizerSetup((current) => ({
      ...current,
      branding: {
        ...current.branding,
        ...patch
      }
    }));
  }

  function updateOrganizerRace(slug: string, patch: Partial<OrganizerRaceDraft>) {
    setOrganizerSetup((current) => ({
      ...current,
      races: current.races.map((race) => (race.slug === slug ? { ...race, ...patch } : race))
    }));
  }

  function toggleOrganizerRacePublish(slug: string, nextPublished: boolean) {
    updateOrganizerRace(slug, { isPublished: nextPublished });
  }

  function addOrganizerRace() {
    let nextIndex = organizerSetup.races.length + 1;
    let nextRace = createOrganizerRaceTemplate(nextIndex);

    while (organizerSetup.races.some((race) => race.slug === nextRace.slug)) {
      nextIndex += 1;
      nextRace = createOrganizerRaceTemplate(nextIndex);
    }

    setOrganizerSetup((current) => ({
      ...current,
      races: [...current.races, nextRace]
    }));
    setOrganizerSetupRaceSlug(nextRace.slug);
    setSelectedRaceSlug(nextRace.slug);
    setRaceDetailView("race-page");
  }

  function removeOrganizerRace(slug: string) {
    if (organizerSetup.races.length <= 1) {
      return;
    }

    const remainingRaces = organizerSetup.races.filter((race) => race.slug !== slug);
    const fallbackSlug = remainingRaces[0]?.slug ?? EDITION_HOME_VALUE;

    setOrganizerSetup((current) => ({
      ...current,
      races: current.races.filter((race) => race.slug !== slug)
    }));

    if (organizerSetupRaceSlug === slug) {
      setOrganizerSetupRaceSlug(fallbackSlug);
    }

    if (selectedRaceSlug === slug) {
      setSelectedRaceSlug(EDITION_HOME_VALUE);
      setRaceDetailView("race-page");
    }
  }

  function updateOrganizerCheckpoint(checkpointId: string, patch: Partial<(typeof organizerCheckpointDraft)[number]>) {
    if (!organizerSelectedRace) {
      return;
    }

    const normalizeCheckpoints = (checkpoints: typeof organizerCheckpointDraft) =>
      [...checkpoints]
        .sort((left, right) => left.kmMarker - right.kmMarker)
        .map((checkpoint, index) => ({
          ...checkpoint,
          order: index
        }));

    setOrganizerSetup((current) => ({
      ...current,
      races: current.races.map((race) =>
        race.slug !== organizerSelectedRace.slug
          ? race
          : {
              ...race,
              checkpoints: normalizeCheckpoints(
                race.checkpoints.map((checkpoint) =>
                  checkpoint.id === checkpointId
                    ? {
                        ...checkpoint,
                        ...patch
                      }
                    : checkpoint
                )
              )
            }
      )
    }));
  }

  function addOrganizerCheckpoint() {
    if (!organizerSelectedRace) {
      return;
    }

    setOrganizerSetup((current) => ({
      ...current,
      races: current.races.map((race) => {
        if (race.slug !== organizerSelectedRace.slug) {
          return race;
        }

        const sorted = [...race.checkpoints].sort((left, right) => left.kmMarker - right.kmMarker);
        const finish = sorted.find((checkpoint) => checkpoint.id === "finish") ?? sorted[sorted.length - 1];
        const previous = finish ? sorted[Math.max(sorted.indexOf(finish) - 1, 0)] : sorted[sorted.length - 1];
        const baseKm = previous ? previous.kmMarker : 0;
        const finishKm = finish ? finish.kmMarker : race.distanceKm;
        const nonTerminalCount = sorted.filter((checkpoint) => checkpoint.id !== "cp-start" && checkpoint.id !== "finish").length;
        const nextKm = Number((finish && finish !== previous ? (baseKm + finishKm) / 2 : Math.min(baseKm + 5, race.distanceKm)).toFixed(1));
        const nextCheckpoint = {
          id: `${race.slug}-cp-${Date.now()}`,
          code: `CP${nonTerminalCount + 1}`,
          name: `Checkpoint ${nonTerminalCount + 1}`,
          kmMarker: nextKm,
          order: sorted.length
        };

        return {
          ...race,
          checkpoints: [...sorted, nextCheckpoint]
            .sort((left, right) => left.kmMarker - right.kmMarker)
            .map((checkpoint, index) => ({
              ...checkpoint,
              order: index
            }))
        };
      })
    }));
  }

  function removeOrganizerCheckpoint(checkpointId: string) {
    if (!organizerSelectedRace || checkpointId === "cp-start" || checkpointId === "finish") {
      return;
    }

    setOrganizerSetup((current) => ({
      ...current,
      races: current.races.map((race) => {
        if (race.slug !== organizerSelectedRace.slug) {
          return race;
        }

        return {
          ...race,
          checkpoints: race.checkpoints
            .filter((checkpoint) => checkpoint.id !== checkpointId)
            .sort((left, right) => left.kmMarker - right.kmMarker)
            .map((checkpoint, index) => ({
              ...checkpoint,
              order: index
            }))
        };
      })
    }));
  }

  function updateOrganizerCrewAssignment(crewId: string, patch: Partial<OrganizerCrewAssignmentDraft>) {
    if (!organizerSelectedRace) {
      return;
    }

    setOrganizerSetup((current) => ({
      ...current,
      races: current.races.map((race) =>
        race.slug !== organizerSelectedRace.slug
          ? race
          : {
              ...race,
              crewAssignments: race.crewAssignments.map((crew) => (crew.id === crewId ? { ...crew, ...patch } : crew))
            }
      )
    }));
  }

  function addOrganizerCrewAssignment() {
    if (!organizerSelectedRace) {
      return;
    }

    const fallbackCheckpointId = organizerSelectedRace.checkpoints[0]?.id ?? "cp-start";
    const nextCrew: OrganizerCrewAssignmentDraft = {
      id: `${organizerSelectedRace.slug}-crew-${Date.now()}`,
      name: `Crew ${organizerSelectedRace.crewAssignments.length + 1}`,
      email: "",
      role: "scan",
      checkpointId: fallbackCheckpointId,
      deviceLabel: "",
      status: "invited",
      inviteCode: createOrganizerInviteCode(organizerSelectedRace.slug)
    };

    setOrganizerSetup((current) => ({
      ...current,
      races: current.races.map((race) =>
        race.slug !== organizerSelectedRace.slug
          ? race
          : {
              ...race,
              crewAssignments: [...race.crewAssignments, nextCrew]
            }
      )
    }));
  }

  function regenerateOrganizerCrewInvite(crewId: string) {
    if (!organizerSelectedRace) {
      return;
    }

    setOrganizerSetup((current) => ({
      ...current,
      races: current.races.map((race) =>
        race.slug !== organizerSelectedRace.slug
          ? race
          : {
              ...race,
              crewAssignments: race.crewAssignments.map((crew) =>
                crew.id === crewId
                  ? {
                      ...crew,
                      inviteCode: createOrganizerInviteCode(race.slug)
                    }
                  : crew
              )
            }
      )
    }));
  }

  function removeOrganizerCrewAssignment(crewId: string) {
    if (!organizerSelectedRace) {
      return;
    }

    setOrganizerSetup((current) => ({
      ...current,
      races: current.races.map((race) =>
        race.slug !== organizerSelectedRace.slug
          ? race
          : {
              ...race,
              crewAssignments: race.crewAssignments.filter((crew) => crew.id !== crewId)
            }
      )
    }));
  }

  function addOrganizerSimulatedScan(input: { bib: string; checkpointId: string; crewAssignmentId: string }) {
    if (!organizerSelectedRace) {
      return;
    }

    const normalizedBib = input.bib.trim().toUpperCase();
    const checkpoint = organizerSelectedRace.checkpoints.find((item) => item.id === input.checkpointId);
    const crew = organizerSelectedRace.crewAssignments.find((item) => item.id === input.crewAssignmentId);
    const participant = organizerSelectedRace.participants.find((item) => item.bib.trim().toUpperCase() === normalizedBib);

    if (!normalizedBib || !checkpoint || !crew || !participant || crew.checkpointId !== checkpoint.id) {
      return;
    }

    const scannedAt = new Date().toISOString();

    setOrganizerSetup((current) => ({
      ...current,
      races: current.races.map((race) => {
        if (race.slug !== organizerSelectedRace.slug) {
          return race;
        }

        const firstAccepted = race.simulatedScans.find(
          (scan) => scan.status === "accepted" && scan.checkpointId === checkpoint.id && scan.bib.toUpperCase() === normalizedBib
        );

        return {
          ...race,
          simulatedScans: [
            ...race.simulatedScans,
            {
              id: crypto.randomUUID(),
              bib: normalizedBib,
              checkpointId: checkpoint.id,
              crewAssignmentId: crew.id,
              deviceId: crew.deviceLabel.trim() || crew.id,
              scannedAt,
              status: firstAccepted ? "duplicate" : "accepted",
              firstAcceptedId: firstAccepted?.id ?? null
            }
          ]
        };
      })
    }));
  }

  function clearOrganizerSimulatedScans() {
    if (!organizerSelectedRace) {
      return;
    }

    setOrganizerSetup((current) => ({
      ...current,
      races: current.races.map((race) =>
        race.slug !== organizerSelectedRace.slug
          ? race
          : {
              ...race,
              simulatedScans: []
            }
      )
    }));
  }

  function loadOrganizerTrialScenario() {
    if (!organizerSelectedRace) {
      return;
    }

    const seededScans = buildOrganizerTrialScenario(organizerSelectedRace);

    setOrganizerSetup((current) => ({
      ...current,
      races: current.races.map((race) =>
        race.slug !== organizerSelectedRace.slug
          ? race
          : {
              ...race,
              simulatedScans: seededScans
            }
      )
    }));
  }

  function resetOrganizerDemoEvent() {
    const freshSetup = createDefaultOrganizerSetup();
    setOrganizerSetup(freshSetup);
    setOrganizerSetupRaceSlug(freshSetup.races[0]?.slug ?? "");
    setSelectedRaceSlug(EDITION_HOME_VALUE);
    setRaceDetailView("race-page");
    clearOrganizerImportDraft();
  }

  function applyOrganizerImport() {
    if (!organizerSelectedRace) {
      return;
    }

    if (!organizerImportedParticipants.length) {
      return;
    }

    setOrganizerSetup((current) => ({
      ...current,
      races: current.races.map((race) =>
        race.slug !== organizerSelectedRace.slug
          ? race
          : {
              ...race,
              participants: applyParticipantImportMode(race.participants, organizerImportedParticipants, organizerImportMode)
          }
      )
    }));
  }

  async function handleOrganizerParticipantFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const parsed = await parseParticipantImportFile(file).catch(() => null);

    if (!parsed) {
      setOrganizerImportText("");
      setOrganizerImportFileName(file.name);
      event.target.value = "";
      return;
    }

    setOrganizerImportText(parsed.text);
    setOrganizerImportFileName(parsed.fileName);
    event.target.value = "";
  }

  function clearOrganizerImportDraft() {
    setOrganizerImportText("");
    setOrganizerImportFileName(null);
    setOrganizerImportMode("merge");
  }

  async function handleOrganizerEventLogoChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const dataUrl = await readFileAsDataUrl(file).catch(() => null);

    if (!dataUrl) {
      return;
    }

    updateOrganizerBranding({ eventLogoDataUrl: dataUrl });
    event.target.value = "";
  }

  async function handleOrganizerHeroBackgroundChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const dataUrl = await readFileAsDataUrl(file).catch(() => null);

    if (!dataUrl) {
      return;
    }

    updateOrganizerBranding({ heroBackgroundImageDataUrl: dataUrl });
    event.target.value = "";
  }

  async function handleOrganizerGpxChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file || !organizerSelectedRace) {
      return;
    }

    const xmlText = await readFileAsText(file).catch(() => null);

    if (!xmlText) {
      event.target.value = "";
      return;
    }

    const racePatch = parseOrganizerGpxFile(
      xmlText,
      {
        name: file.name,
        size: file.size
      },
      organizerSelectedRace
    );

    if (!racePatch) {
      event.target.value = "";
      return;
    }

    updateOrganizerRace(organizerSelectedRace.slug, racePatch);
    event.target.value = "";
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
    setIsLoginModalOpen(false);
    setOrganizerWorkspaceView("console");
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
    setRaceDetailView("race-page");
    setOrganizerWorkspaceView("spectator");
    jumpToSection(sectionId);
  }

  function jumpToRaceSection(sectionId: string, nextView: RaceDetailView = "race-page") {
    if (isEditionHome) {
      setSelectedRaceSlug(featuredRace.slug);
    }

    setRaceDetailView(nextView);
    jumpToSection(sectionId);
  }

  function focusRanking(view: "overall" | "women") {
    setFullRankingView(view === "women" ? "women" : "overall");
    setRankingRaceFilter(isEditionHome ? featuredRace.slug : selectedRaceCard.slug);
    setRankingCountryFilter("all");
    setRunnerCheckpointFilter("all");
    jumpToRaceSection("full-ranking", "ranking");
  }

  function focusRunnerSearch() {
    setRaceDetailView("runner-search");
    jumpToSection("runner-search");
  }

  function focusRunnersList() {
    jumpToRaceSection("runners-list", "runners-list");
  }

  function focusFavoritesList() {
    if (favoriteDirectoryEntries.length) {
      setSelectedRunnerBib(favoriteDirectoryEntries[0].bib);
    }

    jumpToRaceSection("favorites-list", "favorites");
  }

  function handleRaceSelection(nextValue: string) {
    setSelectedRaceSlug(nextValue);
    setRaceDetailView("race-page");
    setOrganizerWorkspaceView("spectator");
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
    if (favoriteDirectoryEntries.length) {
      setSelectedRunnerBib(favoriteDirectoryEntries[0].bib);
    }

    jumpToRaceSection("my-runners", "my-runners");
  }

  function focusRaceLeaders() {
    setLeadersRaceFilter(isEditionHome ? "all" : selectedRaceCard.slug);
    setLeadersCountryFilter("all");
    setLeadersCategoryFilter("all");
    setLeadersPage(1);
    setRaceDetailView("leaders");
    jumpToSection("race-leaders-view");
  }

  function focusStatistics() {
    setStatisticsRaceFilter(isEditionHome ? "all" : selectedRaceCard.slug);
    jumpToRaceSection("race-statistics", "statistics");
  }

  function focusRacePage() {
    setRaceDetailView("race-page");
    jumpToSection("race-hub");
  }

  return (
      <main
        className={`dashboard-shell dashboard-hub-shell live-trail-shell ${isEditionHome ? "edition-home-mode" : "race-detail-mode"} ${showSidebarRail ? "with-sidebar-rail" : "no-sidebar-rail"}`}
      >
        <aside className="dashboard-sidebar live-sidebar">
          <nav className="sidebar-nav live-sidebar-nav" aria-label="Race navigation">
            <button className="live-sidebar-logo" onClick={focusHome} type="button" aria-label="Back to edition home">
              <span className="brand-logo-frame">
                <img alt="Trailnesia" className="brand-logo-image" src={trailnesiaLogo} />
              </span>
            </button>

            <button className="nav-link nav-link-primary nav-link-icon" onClick={focusHome} type="button">
              <NavIcon name="home" />
              <span>Home</span>
            </button>

            {!isEditionHome && raceDetailView !== "race-page" ? (
              <button className="nav-link nav-link-icon nav-link-return" onClick={focusRacePage} type="button">
                <NavIcon name="home" />
                <span>Back to race page</span>
              </button>
            ) : null}

          <div className={`nav-group ${runnerNavOpen ? "open" : ""}`}>
            <button className="nav-toggle" onClick={() => setRunnerNavOpen((current) => !current)} type="button">
              <span>THE RUNNERS</span>
              <NavChevron open={runnerNavOpen} />
            </button>
            <div className="nav-links">
              <button className="nav-link nav-link-icon" onClick={focusRunnerSearch} type="button">
                <NavIcon name="search" />
                <span>Search for a runner</span>
              </button>
              <button className="nav-link nav-link-icon" onClick={focusRunnersList} type="button">
                <NavIcon name="runners" />
                <span>Runners list</span>
              </button>
              <button className="nav-link nav-link-icon" onClick={focusFavoritesList} type="button">
                <NavIcon name="favorite" />
                <span>Favorites list</span>
              </button>
              <button className="nav-link nav-link-icon" onClick={focusMyRunners} type="button">
                <NavIcon name="heart" />
                <span>My runners</span>
              </button>
            </div>
          </div>

          <div className={`nav-group ${raceNavOpen ? "open" : ""}`}>
            <button className="nav-toggle" onClick={() => setRaceNavOpen((current) => !current)} type="button">
              <span>FOLLOW THE RACE</span>
              <NavChevron open={raceNavOpen} />
            </button>
            <div className="nav-links">
              <button className="nav-link nav-link-icon" onClick={() => focusRanking("overall")} type="button">
                <NavIcon name="podium" />
                <span>Ranking</span>
              </button>
              <button className="nav-link nav-link-icon" onClick={focusRaceLeaders} type="button">
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
            <div aria-label="Event logo placeholder" className="event-logo-placeholder" role="img">
              {organizerSetup.branding.eventLogoDataUrl ? (
                <img alt="Event logo" src={organizerSetup.branding.eventLogoDataUrl} />
              ) : (
                <span>Event Logo</span>
              )}
            </div>
          </div>

          <div className="topbar-center">
            <label className="topbar-select topbar-select-shell">
              <span className="sr-only">Edition selector</span>
              <select onChange={() => handleRaceSelection(EDITION_HOME_VALUE)} value={EDITION_HOME_VALUE}>
                <option value={EDITION_HOME_VALUE}>{festivalData.editionLabel}</option>
              </select>
            </label>
          </div>

          <div className="topbar-actions live-topbar-actions">
            {organizerSessionActive ? (
              <button
                className={`topbar-login-link ${isOrganizerConsoleOpen ? "topbar-login-link-active" : ""}`}
                onClick={() => setOrganizerWorkspaceView((current) => (current === "console" ? "spectator" : "console"))}
                type="button"
              >
                {isOrganizerConsoleOpen ? "Spectator View" : "Organizer Console"}
              </button>
            ) : null}

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

            <button className="topbar-locale-pill" type="button">
              EN <span aria-hidden="true">v</span>
            </button>
          </div>
        </header>

        {showAccessNotice ? <div className={`notice-banner ${organizerSessionActive ? "success" : "info"}`}>{accessNotice}</div> : null}

        {isOrganizerConsoleOpen ? (
          <OrganizerConsole
              branding={organizerSetup.branding}
              checkpoints={organizerCheckpointDraft}
              crewAssignments={organizerSelectedRace?.crewAssignments ?? []}
              duplicates={organizerConsoleDuplicates}
              importFileName={organizerImportFileName}
              importImpact={organizerImportImpact}
              importMode={organizerImportMode}
              importPreview={organizerImportPreview}
              importText={organizerImportText}
              leaderboards={organizerConsoleLeaderboards}
              liveModeLabel={liveStatusLabel}
              notifications={organizerConsoleNotifications}
              onAddRace={addOrganizerRace}
              onAddCheckpoint={addOrganizerCheckpoint}
              onAddCrewAssignment={addOrganizerCrewAssignment}
              onAddSimulatedScan={addOrganizerSimulatedScan}
              onApplyImport={applyOrganizerImport}
              onBackToSpectator={() => setOrganizerWorkspaceView("spectator")}
              onBrandingChange={updateOrganizerBranding}
              onCheckpointChange={updateOrganizerCheckpoint}
              onClearSimulatedScans={clearOrganizerSimulatedScans}
              onCrewAssignmentChange={updateOrganizerCrewAssignment}
              onEventLogoChange={handleOrganizerEventLogoChange}
              onHeroBackgroundChange={handleOrganizerHeroBackgroundChange}
              onImportFileChange={handleOrganizerParticipantFileChange}
              onImportModeChange={setOrganizerImportMode}
              onClearImport={clearOrganizerImportDraft}
              onGpxChange={handleOrganizerGpxChange}
              onLoadSampleScenario={loadOrganizerTrialScenario}
              onResetDemoEvent={resetOrganizerDemoEvent}
              onRegenerateCrewInvite={regenerateOrganizerCrewInvite}
            onToggleRacePublish={toggleOrganizerRacePublish}
            onRemoveCheckpoint={removeOrganizerCheckpoint}
            onRemoveCrewAssignment={removeOrganizerCrewAssignment}
            onRemoveRace={removeOrganizerRace}
            opsUpdatedAt={lastUpdatedAt}
            onRaceChange={updateOrganizerRace}
            onSelectRace={setOrganizerSetupRaceSlug}
            profileLabel={profile?.displayName ?? profile?.email ?? profile?.role ?? "Organizer"}
            races={organizerSetup.races}
            selectedRaceSlug={organizerSetupRaceSlug}
          />
        ) : showEditionHome ? (
          <>
            <RaceEditionHome
              bannerTagline={festivalData.bannerTagline}
              brandStack={festivalData.brandStack}
              cards={raceHomeCards}
              dateRibbon={festivalData.dateRibbon}
              editionLabel={festivalData.editionLabel}
              heroBackgroundImageUrl={organizerSetup.branding.heroBackgroundImageDataUrl}
              homeSubtitle={festivalData.homeSubtitle}
              homeTitle={festivalData.homeTitle}
              locationRibbon={festivalData.locationRibbon}
              onOpenRace={(slug) => openRaceView(slug, "race-hub")}
            />
          </>
        ) : !isEditionHome ? (
          <>
        <div className="detail-topline">
          <button className="back-home-link" onClick={() => handleRaceSelection(EDITION_HOME_VALUE)} type="button">
            Back to Home
          </button>
        </div>

        <section className="panel race-course-info-panel" hidden={raceDetailView !== "race-page"} id="race-hub">
          <div className="race-course-info-head">
            <span className="detail-label">Info deskripsi course</span>
            <h2>{eventTitle}</h2>
          </div>

          <div className="race-course-info-body">
            <p>{selectedRaceCard.courseDescription}</p>
            <div className="race-course-info-meta">
              <article>
                <span>Start</span>
                <strong>{selectedRaceCard.startTown}</strong>
              </article>
              <article>
                <span>Distance</span>
                <strong>{totalDistanceKm.toFixed(1)} km</strong>
              </article>
              <article>
                <span>Ascent</span>
                <strong>{activeAscentM} m+</strong>
              </article>
            </div>
          </div>

          <div className="race-stat-strip" hidden id="race-overview-strip">
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
              <strong>{activeCourse.location} 7 C</strong>
            </article>
            <article className="race-stat-strip-item">
              <span>Finish</span>
              <strong>{activeCourse.location} 7 C</strong>
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

      {fetchError ? <div className="notice-banner error">{fetchError}</div> : null}

      <section className="spotlight-grid" hidden={raceDetailView !== "race-page"} id="course-profile">
        <CourseProfilePanel
          course={activeCourse}
          courseStops={courseProfileStops}
          selectedCheckpointId={selectedCheckpointId}
          onSelectCheckpoint={setSelectedCheckpointId}
          dnfCount={dnfDnsCount}
        />
      </section>

      <section className="panel race-statistics-panel" hidden={raceDetailView !== "statistics"} id="race-statistics">
        <div className="panel-head compact utility-panel-head">
          <div>
            <p className="section-label">Follow the race</p>
            <h3>Statistics</h3>
            <small>Generated on {statsGeneratedLabel}</small>
          </div>
          <div className="panel-badge compact-badge">
            <span>Visible</span>
            <strong>{statisticsRegisteredCount}</strong>
            <span>runner entries</span>
          </div>
        </div>

        <div className="utility-scope-strip">
          <div className="utility-scope-item">
            <span>Scope</span>
            <strong>{statisticsSelectedRace ? "Current race" : "Edition overview"}</strong>
          </div>
          <div className="utility-scope-item">
            <span>Context</span>
            <strong>{statisticsContextLabel}</strong>
          </div>
        </div>

        <div className="runner-list-toolbar statistics-toolbar">
          <label className="ranking-toolbar-label">
            In which race ?
            <select value={statisticsRaceFilter} onChange={(event) => setStatisticsRaceFilter(event.target.value)}>
              <option value="all">All races</option>
              {visibleRaces.map((race) => (
                <option key={`statistics-race-${race.slug}`} value={race.slug}>
                  {race.title}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="statistics-card-grid">
          {statisticsCards.map((card) => {
            const womenPercent = card.total ? (card.split.women / card.total) * 100 : 0;
            const menPercent = card.total ? (card.split.men / card.total) * 100 : 0;
            const totalPercent = statisticsStarterCount ? (card.total / statisticsStarterCount) * 100 : 0;

            return (
              <article className={`statistics-card ${card.accentClass}`} key={card.key}>
                <div className="statistics-card-head">
                  <span>{card.title}</span>
                  <strong>{card.total.toLocaleString()}</strong>
                  <small>{formatPercent(totalPercent)}</small>
                </div>

                <div className="statistics-card-bar" aria-hidden="true">
                  <span className="statistics-card-bar-women" style={{ width: `${womenPercent}%` }} />
                  <span className="statistics-card-bar-men" style={{ width: `${menPercent}%` }} />
                </div>

                <div className="statistics-card-breakdown">
                  <div>
                    <span className="statistics-gender-dot woman" />
                    <strong>{card.split.women.toLocaleString()}</strong>
                    <small>Women</small>
                  </div>
                  <div>
                    <span className="statistics-gender-dot man" />
                    <strong>{card.split.men.toLocaleString()}</strong>
                    <small>Men</small>
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        <article className="statistics-distribution-panel">
          <div className="statistics-distribution-head">
            <div>
              <span className="detail-label">Distribution</span>
              <h3>Distribution of starters by country</h3>
            </div>
            <div className="statistics-distribution-summary">
              <strong>{statisticsStarterCount.toLocaleString()}</strong>
              <span>Starters</span>
              <strong>{statisticsCountries.length}</strong>
              <span>Countries</span>
            </div>
          </div>

          <div className="statistics-distribution-grid">
            <div
              aria-label="Distribution of starters by country"
              className="statistics-world-map-shell"
              dangerouslySetInnerHTML={{ __html: statisticsWorldMapMarkup }}
            />

            <div className="statistics-country-list">
              {statisticsCountries.map((country) => (
                <article className="statistics-country-row" key={`country-row-${country.code}`}>
                  <div className="statistics-country-head">
                    <div className="statistics-country-label">
                      <img alt={country.code} className="flag-icon" height="18" loading="lazy" src={getFlagIconUrl(country.code)} width="24" />
                      <strong>{country.name}</strong>
                    </div>
                    <span>{country.count.toLocaleString()}</span>
                  </div>
                  <div className="statistics-country-bar" aria-hidden="true">
                    <span style={{ width: `${country.percent}%` }} />
                  </div>
                  <small>{formatPercent(country.percent)}</small>
                </article>
              ))}
            </div>
          </div>
        </article>
      </section>

      <section className="control-grid" hidden={raceDetailView !== "ranking"}>
        <article className="panel leaderboard-panel full-ranking-panel livetrail-ranking-panel" id="full-ranking">
          <div className="panel-head compact utility-panel-head">
            <div>
              <p className="section-label">Follow the race</p>
              <h3>Ranking</h3>
            </div>
            <div className="panel-badge compact-badge">
              <span>Visible</span>
              <strong>{fullRankingEntries.length}</strong>
              <span>ranked runners</span>
            </div>
          </div>

          <div className="utility-scope-strip">
            {rankingScopeItems.map((item) => (
              <div className="utility-scope-item" key={`ranking-scope-${item.label}`}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>

          <div className="ranking-toolbar">
            <div className="ranking-filters">
              <label className="ranking-toolbar-label">
                In which race ?
                <select value={rankingRaceFilter} onChange={(event) => setRankingRaceFilter(event.target.value)}>
                  {visibleRaces.map((race) => (
                    <option key={`ranking-race-${race.slug}`} value={race.slug}>
                      {race.title}
                    </option>
                  ))}
                </select>
              </label>
              <label className="ranking-toolbar-label">
                Of what nationality ?
                <select value={rankingCountryFilter} onChange={(event) => setRankingCountryFilter(event.target.value)}>
                  <option value="all">All nationalities</option>
                  {rankingCountries.map((countryCode) => (
                    <option key={`ranking-country-${countryCode}`} value={countryCode}>
                      {COUNTRY_META[countryCode].name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="ranking-toolbar-label">
                Of which category ?
                <select
                  value={fullRankingView}
                  onChange={(event) => setFullRankingView(event.target.value as RankingView)}
                >
                  <option value="overall">Overall</option>
                  <option value="men">Men</option>
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
                  {"<<"}
                </button>
                <button
                  className="theme-toggle pager-button"
                  disabled={fullRankingPage <= 1}
                  onClick={() => setFullRankingPage((current) => Math.max(1, current - 1))}
                  type="button"
                >
                  {"<"}
                </button>
                <button
                  className="theme-toggle pager-button"
                  disabled={fullRankingPage >= fullRankingPageCount}
                  onClick={() => setFullRankingPage((current) => Math.min(fullRankingPageCount, current + 1))}
                  type="button"
                >
                  {">"}
                </button>
                <button
                  className="theme-toggle pager-button"
                  disabled={fullRankingPage >= fullRankingPageCount}
                  onClick={() => setFullRankingPage(fullRankingPageCount)}
                  type="button"
                >
                  {">>"}
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
                <strong>{rankingRaceIsLive ? "Live index" : "Preview index"}</strong>
              </div>
            </div>
          ) : null}

          <div className="ranking-column-head livetrail-column-head">
            <span>Ranking</span>
            <span>Runner / Team</span>
            <span>Gender</span>
            <span>Nationality</span>
            <span>Race Time</span>
          </div>

          <div className="full-ranking-list full-ranking-table" role="list" aria-label="Overall leaderboard rows">
            {fullRankingRows.length ? (
              fullRankingRows.map((entry) => {
                const statusClass =
                  entry.state === "finisher" ? "finished" : entry.state === "withdrawn" ? "withdrawn" : entry.state === "dns" ? "dns" : "live";

                return (
                  <div className="full-ranking-row race-ranking-row" key={`${entry.raceSlug}-${entry.bib}`} role="listitem">
                    <div className="ranking-block">
                      <div className="ranking-rankline">
                        <strong>{entry.rank}</strong>
                        {entry.rank && shouldShowLivePodium(entry.rank, entry.checkpointId ?? "", rankingRaceIsLive) ? (
                          <RankingMedal rank={entry.rank} />
                        ) : null}
                      </div>
                      <div className="ranking-submeta">
                        <span>{fullRankingView === "overall" ? "Overall" : fullRankingView === "women" ? "Women" : "Men"}</span>
                        <small>Sex {rankingGenderRankByBib.get(entry.bib) ?? entry.rank ?? "-"}</small>
                      </div>
                    </div>
                    <div className="runner-main-cell">
                      <div className="bib-tile">{entry.bib}</div>
                      <div className="runner-cell">
                        <div>
                          <strong>{entry.name}</strong>
                          <span>{entry.teamName}</span>
                          <div className={`runner-status-pill ${statusClass}`}>
                            {getLiveRunnerStatusLabel(
                              {
                                checkpointId: entry.checkpointId ?? "",
                                checkpointCode: entry.checkpointCode ?? entry.statusLabel
                              },
                              rankingRaceIsLive
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="race-inline-cell gender-cell">
                      <strong>
                        <span className={`gender-dot ${entry.category === "women" ? "women" : "men"}`} />
                        {entry.category === "women" ? "Woman" : "Man"}
                      </strong>
                    </div>
                    <div className="race-inline-cell nationality-cell">
                      <strong aria-label={entry.countryCode}>
                        <img
                          alt={entry.countryCode}
                          className="flag-icon"
                          height="18"
                          loading="lazy"
                          src={getFlagIconUrl(entry.countryCode)}
                          width="24"
                        />
                      </strong>
                    </div>
                    <div className="race-inline-cell race-time-cell">
                      <strong>{getRankingEntryRaceTime(entry)}</strong>
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
                {"<<"}
              </button>
              <button
                className="theme-toggle pager-button"
                disabled={fullRankingPage <= 1}
                onClick={() => setFullRankingPage((current) => Math.max(1, current - 1))}
                type="button"
              >
                {"<"}
              </button>
              <button
                className="theme-toggle pager-button"
                disabled={fullRankingPage >= fullRankingPageCount}
                onClick={() => setFullRankingPage((current) => Math.min(fullRankingPageCount, current + 1))}
                type="button"
              >
                {">"}
              </button>
              <button
                className="theme-toggle pager-button"
                disabled={fullRankingPage >= fullRankingPageCount}
                onClick={() => setFullRankingPage(fullRankingPageCount)}
                type="button"
              >
                {">>"}
              </button>
            </div>
          </div>
        </article>
      </section>

      {organizerSessionActive ? (
      <section className="panel checkpoint-monitor-panel" hidden>
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
                    <div aria-hidden="true" className="runner-avatar" />
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

      <section className="panel runner-search-panel public-runner-search-panel search-runner-view" hidden={raceDetailView !== "runner-search"} id="runner-search">
        <div className="panel-head compact utility-panel-head">
          <div>
            <p className="section-label">The runners</p>
            <h3>Search a runner</h3>
          </div>
          <div className="panel-badge compact-badge">
            <span>Visible</span>
            <strong>{searchRunnerEntries.length}</strong>
            <span>runner entries</span>
          </div>
        </div>

        <div className="utility-scope-strip">
          {runnerSearchScopeItems.map((item) => (
            <div className="utility-scope-item" key={`runner-search-scope-${item.label}`}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </div>
          ))}
        </div>

        <div className="runner-list-shell search-runner-shell">
          <div className="search-runner-toolbar">
            <div className="search-runner-input-shell">
              <input
                id="runner-search-page-input"
                placeholder="Search a runner (bib, name, club...)"
                value={runnerQuery}
                onChange={(event) => setRunnerQuery(event.target.value)}
                type="text"
              />
            </div>

            <label className="ranking-toolbar-label">
              In which race ?
              <select value={runnerSearchRaceFilter} onChange={(event) => setRunnerSearchRaceFilter(event.target.value)}>
                <option value="all">All races</option>
                {visibleRaces.map((race) => (
                  <option key={`runner-search-race-${race.slug}`} value={race.slug}>
                    {race.title}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {runnerSearchError ? <div className="empty-compact">{runnerSearchError}</div> : null}

          <div className="runner-list-pagination">
            <label className="rows-per-page">
              Rows per page
              <select value={runnerSearchRowsPerPage} onChange={(event) => setRunnerSearchRowsPerPage(Number(event.target.value))}>
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={30}>30</option>
              </select>
            </label>
            <div className="ranking-range-text">{runnerSearchRangeLabel}</div>
            <div className="pager-actions compact">
              <button className="theme-toggle pager-button" disabled={runnerSearchPage <= 1} onClick={() => setRunnerSearchPage(1)} type="button">
                {"<<"}
              </button>
              <button
                className="theme-toggle pager-button"
                disabled={runnerSearchPage <= 1}
                onClick={() => setRunnerSearchPage((current) => Math.max(1, current - 1))}
                type="button"
              >
                {"<"}
              </button>
              <button
                className="theme-toggle pager-button"
                disabled={runnerSearchPage >= runnerSearchPageCount}
                onClick={() => setRunnerSearchPage((current) => Math.min(runnerSearchPageCount, current + 1))}
                type="button"
              >
                {">"}
              </button>
              <button
                className="theme-toggle pager-button"
                disabled={runnerSearchPage >= runnerSearchPageCount}
                onClick={() => setRunnerSearchPage(runnerSearchPageCount)}
                type="button"
              >
                {">>"}
              </button>
            </div>
          </div>

          <div className="runner-list-table search-runner-table">
            <div className="runner-list-head">
              <span>Race</span>
              <span>Runner/Team</span>
              <span>Country</span>
              <span>Gender</span>
              <span>Info</span>
              <span>Actions</span>
            </div>

            {pagedSearchRunnerEntries.length ? (
              <div className="runner-list-body">
                {pagedSearchRunnerEntries.map((entry) => {
                  const isFavorite = favoriteBibs.includes(entry.bib);
                  const statusClass =
                    entry.state === "finisher"
                      ? "finished"
                      : entry.state === "withdrawn"
                        ? "withdrawn"
                        : entry.state === "dns"
                          ? "dns"
                          : entry.state === "in-race"
                            ? "live"
                            : "registered";

                  return (
                    <article className="runner-list-row" key={`search-runner-${entry.raceSlug}-${entry.bib}`}>
                      <div className="runner-list-race">
                        <strong>{entry.raceTitle}</strong>
                      </div>

                      <div className="runner-list-runner">
                        <div className="bib-tile runner-list-bib">{entry.bib}</div>
                        <div className="runner-list-runner-copy">
                          <strong>{entry.name}</strong>
                          <span>{entry.teamName}</span>
                          <div className={`runner-status-pill ${statusClass}`}>{entry.statusLabel}</div>
                        </div>
                      </div>

                      <div className="runner-list-country">
                        <img
                          alt={entry.countryCode}
                          className="flag-icon"
                          height="18"
                          loading="lazy"
                          src={getFlagIconUrl(entry.countryCode)}
                          width="24"
                        />
                        <small>{entry.countryCode}</small>
                      </div>

                      <div className="runner-list-category">
                        <span className={`gender-dot ${entry.category}`} />
                        <strong>{formatCategoryLabel(entry.category)}</strong>
                      </div>

                      <div className="runner-list-info">
                        <strong>{entry.infoLabel}</strong>
                      </div>

                      <div className="runner-list-actions">
                        <button
                          aria-label={isFavorite ? `Remove ${entry.name} from favorites` : `Add ${entry.name} to favorites`}
                          className={`runner-list-action-button ${isFavorite ? "active" : ""}`}
                          onClick={() => toggleFavoriteBib(entry.bib)}
                          type="button"
                        >
                          <NavIcon name="favorite" />
                        </button>
                        <button
                          aria-label={`Open ${entry.name}`}
                          className="runner-list-action-button active"
                          onClick={() => {
                            setSelectedRaceSlug(entry.raceSlug);
                            setSelectedRunnerBib(entry.bib);
                            jumpToRaceSection("my-runners", "my-runners");
                          }}
                          type="button"
                        >
                          <NavIcon name="search" />
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="empty-state search-empty-state">
                <strong>No data to display. Use the search bar to find your runners.</strong>
              </div>
            )}
          </div>

          <div className="runner-list-pagination">
            <label className="rows-per-page">
              Rows per page
              <select value={runnerSearchRowsPerPage} onChange={(event) => setRunnerSearchRowsPerPage(Number(event.target.value))}>
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={30}>30</option>
              </select>
            </label>
            <div className="ranking-range-text">{runnerSearchRangeLabel}</div>
            <div className="pager-actions compact">
              <button className="theme-toggle pager-button" disabled={runnerSearchPage <= 1} onClick={() => setRunnerSearchPage(1)} type="button">
                {"<<"}
              </button>
              <button
                className="theme-toggle pager-button"
                disabled={runnerSearchPage <= 1}
                onClick={() => setRunnerSearchPage((current) => Math.max(1, current - 1))}
                type="button"
              >
                {"<"}
              </button>
              <button
                className="theme-toggle pager-button"
                disabled={runnerSearchPage >= runnerSearchPageCount}
                onClick={() => setRunnerSearchPage((current) => Math.min(runnerSearchPageCount, current + 1))}
                type="button"
              >
                {">"}
              </button>
              <button
                className="theme-toggle pager-button"
                disabled={runnerSearchPage >= runnerSearchPageCount}
                onClick={() => setRunnerSearchPage(runnerSearchPageCount)}
                type="button"
              >
                {">>"}
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="panel menu-feature-panel runners-list-view" hidden={raceDetailView !== "runners-list"} id="runners-list">
          <div className="panel-head compact">
            <div>
              <p className="section-label">The runners</p>
              <h3>Runners list</h3>
            </div>
            <div className="panel-badge compact-badge">
              <span>Visible</span>
              <strong>{filteredRunnerDirectoryEntries.length}</strong>
              <span>runner entries</span>
            </div>
          </div>

        <div className="utility-scope-strip">
          {runnerDirectoryScopeItems.map((item) => (
            <div className="utility-scope-item" key={`runner-directory-scope-${item.label}`}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </div>
          ))}
        </div>

        <div className="runner-list-shell">
            <div className="runner-list-toolbar">
              <label className="ranking-toolbar-label">
                In what state ?
                <select value={runnerDirectoryStateFilter} onChange={(event) => setRunnerDirectoryStateFilter(event.target.value as RunnerDirectoryState)}>
                  <option value="all">All states</option>
                  <option value="registered">Registered</option>
                  <option value="in-race">In race</option>
                  <option value="finisher">Finisher</option>
                  <option value="dns">DNS</option>
                  <option value="withdrawn">Withdrawn</option>
                </select>
              </label>

              <label className="ranking-toolbar-label">
                In which race ?
                <select value={runnerDirectoryRaceFilter} onChange={(event) => setRunnerDirectoryRaceFilter(event.target.value)}>
                  {visibleRaces.map((race) => (
                    <option key={`runner-list-race-${race.slug}`} value={race.slug}>
                      {race.title}
                    </option>
                  ))}
                </select>
              </label>

              <label className="ranking-toolbar-label">
                Of what nationality ?
                <select value={runnerDirectoryCountryFilter} onChange={(event) => setRunnerDirectoryCountryFilter(event.target.value)}>
                  <option value="all">All nationalities</option>
                  {runnerDirectoryCountries.map((countryCode) => (
                    <option key={`runner-list-country-${countryCode}`} value={countryCode}>
                      {COUNTRY_META[countryCode].name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="ranking-toolbar-label">
                Of which category ?
                <select
                  value={runnerDirectoryCategoryFilter}
                  onChange={(event) => setRunnerDirectoryCategoryFilter(event.target.value as "all" | "men" | "women")}
                >
                  <option value="all">All categories</option>
                  <option value="men">Men</option>
                  <option value="women">Women</option>
                </select>
              </label>
            </div>

            <div className="runner-list-pagination">
              <label className="rows-per-page">
                Rows per page
                <select
                  value={runnerDirectoryRowsPerPage}
                  onChange={(event) => setRunnerDirectoryRowsPerPage(Number(event.target.value))}
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={30}>30</option>
                </select>
              </label>
              <div className="ranking-range-text">{runnerDirectoryRangeLabel}</div>
              <div className="pager-actions compact">
                <button
                  className="theme-toggle pager-button"
                  disabled={runnerDirectoryPage <= 1}
                  onClick={() => setRunnerDirectoryPage(1)}
                  type="button"
                >
                  {"<<"}
                </button>
                <button
                  className="theme-toggle pager-button"
                  disabled={runnerDirectoryPage <= 1}
                  onClick={() => setRunnerDirectoryPage((current) => Math.max(1, current - 1))}
                  type="button"
                >
                  {"<"}
                </button>
                <button
                  className="theme-toggle pager-button"
                  disabled={runnerDirectoryPage >= runnerDirectoryPageCount}
                  onClick={() => setRunnerDirectoryPage((current) => Math.min(runnerDirectoryPageCount, current + 1))}
                  type="button"
                >
                  {">"}
                </button>
                <button
                  className="theme-toggle pager-button"
                  disabled={runnerDirectoryPage >= runnerDirectoryPageCount}
                  onClick={() => setRunnerDirectoryPage(runnerDirectoryPageCount)}
                  type="button"
                >
                  {">>"}
                </button>
              </div>
            </div>

          <div className="runner-list-table">
              <div className="runner-list-head">
                <span>Race</span>
                <span>Runner/Team</span>
                <span>Country</span>
                <span>Gender</span>
                <span>Info</span>
                <span>Actions</span>
              </div>

              {runnerDirectoryRows.length ? (
                <div className="runner-list-body">
                  {runnerDirectoryRows.map((entry) => {
                    const isFavorite = favoriteBibs.includes(entry.bib);
                    const statusClass =
                      entry.state === "finisher"
                        ? "finished"
                        : entry.state === "withdrawn"
                          ? "withdrawn"
                          : entry.state === "dns"
                            ? "dns"
                            : entry.state === "in-race"
                              ? "live"
                              : "registered";

                    return (
                      <article className="runner-list-row" key={`runner-list-${entry.raceSlug}-${entry.bib}`}>
                        <div className="runner-list-race">
                          <strong>{entry.raceTitle}</strong>
                        </div>

                        <div className="runner-list-runner">
                          <div className="bib-tile runner-list-bib">{entry.bib}</div>
                          <div className="runner-list-runner-copy">
                            <strong>{entry.name}</strong>
                            <span>{entry.teamName}</span>
                            <div className={`runner-status-pill ${statusClass}`}>{entry.statusLabel}</div>
                          </div>
                        </div>

                        <div className="runner-list-country">
                          <img
                            alt={entry.countryCode}
                            className="flag-icon"
                            height="18"
                            loading="lazy"
                            src={getFlagIconUrl(entry.countryCode)}
                            width="24"
                          />
                          <small>{entry.countryCode}</small>
                        </div>

                        <div className="runner-list-category">
                          <span className={`gender-dot ${entry.category}`} />
                          <strong>{formatCategoryLabel(entry.category)}</strong>
                        </div>

                        <div className="runner-list-info">
                          <strong>{entry.infoLabel}</strong>
                        </div>

                        <div className="runner-list-actions">
                          <button
                            aria-label={isFavorite ? `Remove ${entry.name} from favorites` : `Add ${entry.name} to favorites`}
                            className={`runner-list-action-button ${isFavorite ? "active" : ""}`}
                            onClick={() => toggleFavoriteBib(entry.bib)}
                            type="button"
                          >
                            <NavIcon name="favorite" />
                          </button>
                          <button
                            aria-label={`Open ${entry.name}`}
                            className="runner-list-action-button active"
                            onClick={() => {
                              setSelectedRaceSlug(entry.raceSlug);
                              setSelectedRunnerBib(entry.bib);
                              jumpToRaceSection("my-runners", "my-runners");
                            }}
                            type="button"
                          >
                            <NavIcon name="search" />
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="empty-state">
                  <strong>No runner matches the current filters.</strong>
                  <span>Adjust the state, race, nationality, or category filters to widen the list.</span>
                </div>
              )}
            </div>

          <div className="runner-list-pagination">
              <label className="rows-per-page">
                Rows per page
                <select
                  value={runnerDirectoryRowsPerPage}
                  onChange={(event) => setRunnerDirectoryRowsPerPage(Number(event.target.value))}
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={30}>30</option>
                </select>
              </label>
              <div className="ranking-range-text">{runnerDirectoryRangeLabel}</div>
              <div className="pager-actions compact">
                <button
                  className="theme-toggle pager-button"
                  disabled={runnerDirectoryPage <= 1}
                  onClick={() => setRunnerDirectoryPage(1)}
                  type="button"
                >
                  {"<<"}
                </button>
                <button
                  className="theme-toggle pager-button"
                  disabled={runnerDirectoryPage <= 1}
                  onClick={() => setRunnerDirectoryPage((current) => Math.max(1, current - 1))}
                  type="button"
                >
                  {"<"}
                </button>
                <button
                  className="theme-toggle pager-button"
                  disabled={runnerDirectoryPage >= runnerDirectoryPageCount}
                  onClick={() => setRunnerDirectoryPage((current) => Math.min(runnerDirectoryPageCount, current + 1))}
                  type="button"
                >
                  {">"}
                </button>
                <button
                  className="theme-toggle pager-button"
                  disabled={runnerDirectoryPage >= runnerDirectoryPageCount}
                  onClick={() => setRunnerDirectoryPage(runnerDirectoryPageCount)}
                  type="button"
                >
                  {">>"}
                </button>
              </div>
          </div>
        </div>

      </section>

      <section className="panel menu-feature-panel favorites-list-view" hidden={raceDetailView !== "favorites"} id="favorites-list">
        <div className="panel-head compact utility-panel-head">
          <div>
            <p className="section-label">The runners</p>
            <h3>Favorites list</h3>
          </div>
          <div className="panel-badge compact-badge">
            <span>Tracked</span>
            <strong>{favoriteDirectoryEntries.length}</strong>
            <span>favorite runners</span>
          </div>
        </div>

        <div className="utility-scope-strip">
          {favoritesScopeItems.map((item) => (
            <div className="utility-scope-item" key={`favorites-scope-${item.label}`}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </div>
          ))}
        </div>

        <div className="runner-list-shell favorites-list-shell">
          <div className="runner-list-toolbar favorite-list-toolbar">
            <label className="ranking-toolbar-label">
              In which race ?
              <select value={favoritesRaceFilter} onChange={(event) => setFavoritesRaceFilter(event.target.value)}>
                <option value="all">All races</option>
                {visibleRaces.map((race) => (
                  <option key={`favorites-race-${race.slug}`} value={race.slug}>
                    {race.title}
                  </option>
                ))}
              </select>
            </label>

            <label className="ranking-toolbar-label">
              Of what nationality ?
              <select value={favoritesCountryFilter} onChange={(event) => setFavoritesCountryFilter(event.target.value)}>
                <option value="all">All nationalities</option>
                {favoriteDirectoryCountries.map((countryCode) => (
                  <option key={`favorites-country-${countryCode}`} value={countryCode}>
                    {COUNTRY_META[countryCode].name}
                  </option>
                ))}
              </select>
            </label>

            <label className="ranking-toolbar-label">
              Of which category ?
              <select value={favoritesCategoryFilter} onChange={(event) => setFavoritesCategoryFilter(event.target.value as "all" | "men" | "women")}>
                <option value="all">All categories</option>
                <option value="men">Men</option>
                <option value="women">Women</option>
              </select>
            </label>
          </div>

          <div className="runner-list-pagination">
            <label className="rows-per-page">
              Rows per page
              <select value={favoritesRowsPerPage} onChange={(event) => setFavoritesRowsPerPage(Number(event.target.value))}>
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={30}>30</option>
              </select>
            </label>
            <div className="ranking-range-text">{favoritesRangeLabel}</div>
            <div className="pager-actions compact">
              <button className="theme-toggle pager-button" disabled={favoritesPage <= 1} onClick={() => setFavoritesPage(1)} type="button">
                {"<<"}
              </button>
              <button
                className="theme-toggle pager-button"
                disabled={favoritesPage <= 1}
                onClick={() => setFavoritesPage((current) => Math.max(1, current - 1))}
                type="button"
              >
                {"<"}
              </button>
              <button
                className="theme-toggle pager-button"
                disabled={favoritesPage >= favoritesPageCount}
                onClick={() => setFavoritesPage((current) => Math.min(favoritesPageCount, current + 1))}
                type="button"
              >
                {">"}
              </button>
              <button
                className="theme-toggle pager-button"
                disabled={favoritesPage >= favoritesPageCount}
                onClick={() => setFavoritesPage(favoritesPageCount)}
                type="button"
              >
                {">>"}
              </button>
            </div>
          </div>

          <div className="runner-list-table favorites-list-table">
            <div className="runner-list-head favorites-list-head">
              <span>Bib</span>
              <span>Runner/Team</span>
              <span>Race</span>
              <span>Cat. & Nat.</span>
              <span>Club</span>
              <span>Ranking</span>
              <span>Actions</span>
            </div>

            {favoriteRows.length ? (
              <div className="runner-list-body">
                {favoriteRows.map((entry) => {
                  const isFavorite = favoriteBibs.includes(entry.bib);
                  const statusClass =
                    entry.state === "finisher"
                      ? "finished"
                      : entry.state === "withdrawn"
                        ? "withdrawn"
                        : entry.state === "dns"
                          ? "dns"
                          : entry.state === "in-race"
                            ? "live"
                            : "registered";
                  const overallRank = entry.rank ?? 0;
                  const genderRank = favoriteGenderRankMap.get(`${entry.raceSlug}:${entry.category}:${entry.bib}`) ?? overallRank;

                  return (
                    <article className="runner-list-row favorites-list-row" key={`favorite-row-${entry.raceSlug}-${entry.bib}`}>
                      <div className="favorites-list-bib">
                        <strong>{entry.bib}</strong>
                      </div>

                      <div className="runner-list-runner favorites-list-runner">
                        <div className="runner-list-runner-copy">
                          <strong>{entry.name}</strong>
                          <span>{entry.teamName}</span>
                          <div className={`runner-status-pill ${statusClass}`}>{entry.statusLabel}</div>
                        </div>
                      </div>

                      <div className="runner-list-race favorites-race-cell">
                        <strong>{entry.raceTitle}</strong>
                      </div>

                      <div className="favorites-catnat-cell">
                        <div className="runner-list-category">
                          <span className={`gender-dot ${entry.category}`} />
                          <strong>{formatCategoryLabel(entry.category)}</strong>
                        </div>
                        <div className="runner-list-country">
                          <img
                            alt={entry.countryCode}
                            className="flag-icon"
                            height="18"
                            loading="lazy"
                            src={getFlagIconUrl(entry.countryCode)}
                            width="24"
                          />
                          <small>{entry.countryCode}</small>
                        </div>
                      </div>

                      <div className="runner-list-info favorites-club-cell">
                        <span>Club</span>
                        <strong>{entry.teamName}</strong>
                      </div>

                      <div className="favorite-ranking-cell">
                        <strong>
                          {overallRank > 0 && overallRank <= 3 && entry.state === "finisher" ? <RankingMedal rank={overallRank} /> : null}
                          #{overallRank} Overall
                        </strong>
                        <span>Sex {genderRank}</span>
                      </div>

                      <div className="runner-list-actions">
                        <button
                          aria-label={isFavorite ? `Remove ${entry.name} from favorites` : `Add ${entry.name} to favorites`}
                          className={`runner-list-action-button ${isFavorite ? "active" : ""}`}
                          onClick={() => toggleFavoriteBib(entry.bib)}
                          type="button"
                        >
                          <NavIcon name="favorite" />
                        </button>
                        <button
                          aria-label={`Open ${entry.name}`}
                          className="runner-list-action-button active"
                          onClick={() => {
                            setSelectedRaceSlug(entry.raceSlug);
                            setSelectedRunnerBib(entry.bib);
                            jumpToRaceSection("my-runners", "my-runners");
                          }}
                          type="button"
                        >
                          <NavIcon name="search" />
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="empty-state search-empty-state">
                <strong>No favorite runners match the current filters.</strong>
              </div>
            )}
          </div>

          <div className="runner-list-pagination">
            <label className="rows-per-page">
              Rows per page
              <select value={favoritesRowsPerPage} onChange={(event) => setFavoritesRowsPerPage(Number(event.target.value))}>
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={30}>30</option>
              </select>
            </label>
            <div className="ranking-range-text">{favoritesRangeLabel}</div>
            <div className="pager-actions compact">
              <button className="theme-toggle pager-button" disabled={favoritesPage <= 1} onClick={() => setFavoritesPage(1)} type="button">
                {"<<"}
              </button>
              <button
                className="theme-toggle pager-button"
                disabled={favoritesPage <= 1}
                onClick={() => setFavoritesPage((current) => Math.max(1, current - 1))}
                type="button"
              >
                {"<"}
              </button>
              <button
                className="theme-toggle pager-button"
                disabled={favoritesPage >= favoritesPageCount}
                onClick={() => setFavoritesPage((current) => Math.min(favoritesPageCount, current + 1))}
                type="button"
              >
                {">"}
              </button>
              <button
                className="theme-toggle pager-button"
                disabled={favoritesPage >= favoritesPageCount}
                onClick={() => setFavoritesPage(favoritesPageCount)}
                type="button"
              >
                {">>"}
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="panel menu-feature-panel runner-detail-panel my-runners-panel" hidden={raceDetailView !== "my-runners"} id="my-runners">
        <div className="panel-head compact utility-panel-head">
          <div>
            <p className="section-label">The runners</p>
            <h3>My followed runners</h3>
          </div>
          <div className="panel-badge compact-badge">
            <span>Tracked</span>
            <strong>{favoriteDirectoryEntries.length}</strong>
            <span>followed runners</span>
          </div>
        </div>

        <div className="utility-scope-strip">
          {myRunnersScopeItems.map((item) => (
            <div className="utility-scope-item" key={`my-runners-scope-${item.label}`}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </div>
          ))}
        </div>

        {favoriteDirectoryEntries.length ? (
          <div className="my-followed-layout">
            <div className="my-followed-grid">
              {favoriteDirectoryEntries.map((entry) => {
                const isSelected = selectedRunnerBib === entry.bib;
                const statusClass =
                  entry.state === "finisher"
                    ? "finished"
                    : entry.state === "withdrawn"
                      ? "withdrawn"
                      : entry.state === "dns"
                        ? "dns"
                        : entry.state === "in-race"
                          ? "live"
                          : "registered";

                return (
                  <button
                    className={`my-followed-card ${isSelected ? "active" : ""}`}
                    key={`my-followed-${entry.raceSlug}-${entry.bib}`}
                    onClick={() => {
                      setSelectedRaceSlug(entry.raceSlug);
                      setSelectedRunnerBib(entry.bib);
                    }}
                    type="button"
                  >
                    <div className="my-followed-card-head">
                      <strong>{entry.name}</strong>
                      <img
                        alt={entry.countryCode}
                        className="flag-icon"
                        height="18"
                        loading="lazy"
                        src={getFlagIconUrl(entry.countryCode)}
                        width="24"
                      />
                    </div>
                    <span>{entry.bib} | {entry.raceTitle}</span>
                    <div className={`runner-status-pill ${statusClass}`}>{entry.statusLabel}</div>
                  </button>
                );
              })}
            </div>

            {runnerDetail ? (
              <div className="my-runners-detail-shell">
                <div className="runner-detail-summary">
                  <div className="runner-cell">
                    <div aria-hidden="true" className="runner-avatar" />
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
              </div>
            ) : (
              <div className="empty-state">
                <strong>Pilih satu pelari yang kamu ikuti.</strong>
              </div>
            )}
          </div>
        ) : (
          <div className="my-runners-empty-shell">
            <article className="my-runners-empty-card">
              <strong>Add your first runner to follow</strong>
              <div className="my-runners-empty-icon" aria-hidden="true">
                <span className="my-runners-heart">
                  <NavIcon name="heart" />
                </span>
                <img alt="" className="my-runners-empty-runner" src={runnerIcon} />
              </div>
              <button className="my-runners-empty-action" onClick={focusRunnerSearch} type="button">
                Search
              </button>
            </article>
          </div>
        )}
      </section>

      <section className="panel menu-feature-panel race-leaders-panel" hidden={raceDetailView !== "race-page" || !isActiveRaceLive} id="race-leaders">
        <div className="panel-head compact">
          <div>
            <p className="section-label">Follow the race</p>
            <h3>Race leaders</h3>
          </div>
          <div className="panel-badge compact-badge">
            <span>Boards</span>
            <strong>2</strong>
            <span>overall + women</span>
          </div>
        </div>

        <div className="leaders-grid">
          <article className="leader-card">
            <div className="leader-card-head">
              <span>Overall</span>
              <button className="toolbar-link" onClick={() => focusRanking("overall")} type="button">
                See ranking
              </button>
            </div>
            <div className="leader-list">
              {sidebarOverallRows.map((entry) => (
                <button
                  className="leader-list-row"
                  key={`leader-overall-${entry.bib}`}
                  onClick={() => {
                    setSelectedRunnerBib(entry.bib);
                    jumpToRaceSection("my-runners", "my-runners");
                  }}
                  type="button"
                >
                  <strong>
                    #{entry.rank}
                    {shouldShowLivePodium(entry.rank, entry.checkpointId, isActiveRaceLive) ? (
                      <RankingMedal rank={entry.rank} />
                    ) : null}
                  </strong>
                  <div>
                    <span>{entry.name}</span>
                    <small>{formatCheckpointProgress(entry)}</small>
                  </div>
                  <time>{getDisplayRaceTime(entry.bib, entry.scannedAt)}</time>
                </button>
              ))}
            </div>
          </article>

          <article className="leader-card">
            <div className="leader-card-head">
              <span>Woman</span>
              <button className="toolbar-link" onClick={() => focusRanking("women")} type="button">
                See ranking
              </button>
            </div>
            <div className="leader-list">
              {sidebarWomenRows.length ? (
                sidebarWomenRows.map((entry) => (
                  <button
                    className="leader-list-row"
                    key={`leader-women-${entry.bib}`}
                    onClick={() => {
                      setSelectedRunnerBib(entry.bib);
                      jumpToRaceSection("my-runners", "my-runners");
                    }}
                    type="button"
                  >
                    <strong>
                      #{entry.rank}
                      {shouldShowLivePodium(entry.rank, entry.checkpointId, isActiveRaceLive) ? (
                        <RankingMedal rank={entry.rank} />
                      ) : null}
                    </strong>
                    <div>
                      <span>{entry.name}</span>
                      <small>{formatCheckpointProgress(entry)}</small>
                    </div>
                    <time>{getDisplayRaceTime(entry.bib, entry.scannedAt)}</time>
                  </button>
                ))
              ) : (
                <div className="empty-compact">Belum ada women leaders untuk race ini.</div>
              )}
            </div>
          </article>
        </div>
      </section>

      <section className="panel menu-feature-panel race-leaders-panel" hidden={raceDetailView !== "race-page" || isActiveRaceLive} id="race-ranking-preview">
        <div className="panel-head compact">
          <div>
            <p className="section-label">Follow the race</p>
            <h3>Race ranking</h3>
          </div>
          <div className="panel-badge compact-badge">
            <span>Boards</span>
            <strong>2</strong>
            <span>overall + women</span>
          </div>
        </div>

        <div className="leaders-grid">
          <article className="leader-card">
            <div className="leader-card-head">
              <span>Overall</span>
              <button className="toolbar-link" onClick={() => focusRanking("overall")} type="button">
                See ranking
              </button>
            </div>
            <div className="leader-list">
              {sidebarOverallRows.length ? (
                sidebarOverallRows.map((entry) => (
                  <button
                    className="leader-list-row"
                    key={`ranking-overall-${entry.bib}`}
                    onClick={() => {
                      setSelectedRunnerBib(entry.bib);
                      jumpToRaceSection("my-runners", "my-runners");
                    }}
                    type="button"
                  >
                    <strong>
                      #{entry.rank}
                      {shouldShowLivePodium(entry.rank, entry.checkpointId, false) ? <RankingMedal rank={entry.rank} /> : null}
                    </strong>
                    <div>
                      <span>{entry.name}</span>
                      <small>{getLiveRunnerStatusLabel(entry, false)}</small>
                    </div>
                    <time>{getDisplayRaceTime(entry.bib, entry.scannedAt)}</time>
                  </button>
                ))
              ) : (
                <div className="empty-compact">Belum ada hasil overall untuk race ini.</div>
              )}
            </div>
          </article>

          <article className="leader-card">
            <div className="leader-card-head">
              <span>Woman</span>
              <button className="toolbar-link" onClick={() => focusRanking("women")} type="button">
                See ranking
              </button>
            </div>
            <div className="leader-list">
              {sidebarWomenRows.length ? (
                sidebarWomenRows.map((entry) => (
                  <button
                    className="leader-list-row"
                    key={`ranking-women-${entry.bib}`}
                    onClick={() => {
                      setSelectedRunnerBib(entry.bib);
                      jumpToRaceSection("my-runners", "my-runners");
                    }}
                    type="button"
                  >
                    <strong>
                      #{entry.rank}
                      {shouldShowLivePodium(entry.rank, entry.checkpointId, false) ? <RankingMedal rank={entry.rank} /> : null}
                    </strong>
                    <div>
                      <span>{entry.name}</span>
                      <small>{getLiveRunnerStatusLabel(entry, false)}</small>
                    </div>
                    <time>{getDisplayRaceTime(entry.bib, entry.scannedAt)}</time>
                  </button>
                ))
              ) : (
                <div className="empty-compact">Belum ada women ranking untuk race ini.</div>
              )}
            </div>
          </article>
        </div>
      </section>
          </>
        ) : null}

        <section className="panel menu-feature-panel race-leaders-directory-view" hidden={raceDetailView !== "leaders"} id="race-leaders-view">
          <div className="panel-head compact utility-panel-head">
            <div>
              <p className="section-label">Follow the race</p>
              <h3>Race leaders</h3>
            </div>
            <div className="panel-badge compact-badge">
              <span>Visible</span>
              <strong>{filteredRaceLeaderEntries.length}</strong>
              <span>leader rows</span>
            </div>
          </div>

          <div className="leaders-scope-strip">
            {leadersScopeItems.map((item) => (
              <article className="leaders-scope-item" key={`leaders-scope-${item.label}`}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </article>
            ))}
          </div>

          <div className="runner-list-shell race-leaders-directory-shell">
            <div className="runner-list-toolbar race-leaders-toolbar">
              <label className="ranking-toolbar-label">
                In which race ?
                <select value={leadersRaceFilter} onChange={(event) => setLeadersRaceFilter(event.target.value)}>
                  <option value="all">All races</option>
                  {visibleRaces.map((race) => (
                    <option key={`leaders-race-${race.slug}`} value={race.slug}>
                      {race.title}
                    </option>
                  ))}
                </select>
              </label>

              <label className="ranking-toolbar-label">
                Of what nationality ?
                <select value={leadersCountryFilter} onChange={(event) => setLeadersCountryFilter(event.target.value)}>
                  <option value="all">All nationalities</option>
                  {raceLeaderCountries.map((countryCode) => (
                    <option key={`leaders-country-${countryCode}`} value={countryCode}>
                      {COUNTRY_META[countryCode].name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="ranking-toolbar-label">
                Of which category ?
                <select value={leadersCategoryFilter} onChange={(event) => setLeadersCategoryFilter(event.target.value as "all" | "men" | "women")}>
                  <option value="all">All categories</option>
                  <option value="men">Men</option>
                  <option value="women">Women</option>
                </select>
              </label>
            </div>

            <div className="runner-list-pagination">
              <label className="rows-per-page">
                Rows per page
                <select value={leadersRowsPerPage} onChange={(event) => setLeadersRowsPerPage(Number(event.target.value))}>
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={30}>30</option>
                </select>
              </label>
              <div className="ranking-range-text">{raceLeadersRangeLabel}</div>
              <div className="pager-actions compact">
                <button className="theme-toggle pager-button" disabled={leadersPage <= 1} onClick={() => setLeadersPage(1)} type="button">
                  {"<<"}
                </button>
                <button
                  className="theme-toggle pager-button"
                  disabled={leadersPage <= 1}
                  onClick={() => setLeadersPage((current) => Math.max(1, current - 1))}
                  type="button"
                >
                  {"<"}
                </button>
                <button
                  className="theme-toggle pager-button"
                  disabled={leadersPage >= raceLeadersPageCount}
                  onClick={() => setLeadersPage((current) => Math.min(raceLeadersPageCount, current + 1))}
                  type="button"
                >
                  {">"}
                </button>
                <button
                  className="theme-toggle pager-button"
                  disabled={leadersPage >= raceLeadersPageCount}
                  onClick={() => setLeadersPage(raceLeadersPageCount)}
                  type="button"
                >
                  {">>"}
                </button>
              </div>
            </div>

            <div className="runner-list-table race-leaders-table">
              <div className="runner-list-head race-leaders-head">
                <span>Ranking</span>
                <span>Runner/Team</span>
                <span>Cat. & Nat.</span>
                <span>Last point</span>
                <span>Next estimated passing</span>
                <span>Actions</span>
              </div>

              {raceLeaderRows.length ? (
                <div className="runner-list-body">
                  {raceLeaderRows.map((entry) => {
                    const statusClass = entry.state === "finisher" ? "finished" : "live";
                    const canShowPodium = shouldShowLivePodium(
                      entry.rank ?? 0,
                      entry.checkpointId ?? "",
                        (visibleRaces.find((race) => race.slug === entry.raceSlug)?.editionLabel.toLowerCase() ?? "finished") === "live"
                    );

                    return (
                      <article className="runner-list-row race-leaders-row" key={`race-leader-${entry.raceSlug}-${entry.bib}`}>
                        <div className="race-leaders-rank">
                          <strong>
                            #{entry.rank}
                            {canShowPodium ? <RankingMedal rank={entry.rank ?? 0} /> : null}
                          </strong>
                          <span>Overall</span>
                          <small>Sex {entry.genderRank}</small>
                        </div>

                        <div className="runner-list-runner race-leaders-runner">
                          <div className="bib-tile">{entry.bib}</div>
                          <div className="runner-list-runner-copy">
                            <strong>{entry.name}</strong>
                            <span>{entry.teamName}</span>
                            <div className={`runner-status-pill ${statusClass}`}>{entry.statusLabel}</div>
                          </div>
                        </div>

                        <div className="race-leaders-catnat">
                          <div className="runner-list-category">
                            <span className={`gender-dot ${entry.category}`} />
                            <strong>{formatCategoryLabel(entry.category)}</strong>
                          </div>
                          <div className="runner-list-country">
                            <img alt={entry.countryCode} className="flag-icon" height="18" loading="lazy" src={getFlagIconUrl(entry.countryCode)} width="24" />
                            <small>{entry.countryCode}</small>
                          </div>
                        </div>

                        <div className="race-leaders-point">
                          <strong>{entry.lastPointLabel}</strong>
                          <span>{formatScanTime(entry.scannedAt)}</span>
                        </div>

                        <div className="race-leaders-next">
                          <strong>{entry.nextPassingLabel}</strong>
                          <span>{entry.nextPassingTime}</span>
                        </div>

                        <div className="runner-list-actions">
                          <button
                            aria-label={favoriteBibs.includes(entry.bib) ? `Remove ${entry.name} from favorites` : `Add ${entry.name} to favorites`}
                          className={`runner-action ghost ${favoriteBibs.includes(entry.bib) ? "active" : ""}`}
                          onClick={() => toggleFavoriteBib(entry.bib)}
                          type="button"
                        >
                            <NavIcon name="favorite" />
                          </button>
                          <button
                            aria-label={`Open ${entry.name}`}
                            className="runner-action"
                            onClick={() => {
                              setSelectedRaceSlug(entry.raceSlug);
                              setSelectedRunnerBib(entry.bib);
                              jumpToRaceSection("my-runners", "my-runners");
                            }}
                            type="button"
                          >
                            <NavIcon name="search" />
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="search-empty-state">No race leaders available for the selected filters.</div>
              )}
            </div>
          </div>
        </section>

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
                x
              </button>
            </div>

            <div className="auth-modal-copy">
              <strong>Dear Organiser, please identify yourself to access Trailnesia&apos;s tools.</strong>
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

      {showSidebarRail ? (
      <aside className="dashboard-rail live-ranking-rail">
        <div className="rail">
              <article className="panel rail-panel rail-ranking-panel" id="race-leaders-sidebar">
                <div className="rail-panel-head">
                  <span>{isActiveRaceLive ? "Leading" : "Ranking"}</span>
                  <h3>Overall</h3>
                </div>
                <div className="mini-leaderboard livetrail-mini-leaderboard">
                  {sidebarOverallRows.length ? (
                    sidebarOverallRows.map((entry) => (
                      <div className="mini-leaderboard-row live" key={`rail-overall-${entry.bib}`}>
                        <strong>
                          {entry.rank}
                          {!isActiveRaceLive ? <RankingMedal rank={entry.rank} /> : null}
                        </strong>
                        <div>
                          <span>{entry.name}</span>
                          <small>{entry.checkpointId === "finish" ? "Arrivee" : entry.checkpointId === "cp-start" ? "Depart" : entry.checkpointName}</small>
                        </div>
                        <div className="rail-rank-time">
                          <small aria-label={getNationalityCode(entry.bib)}>
                            <img
                              alt={getNationalityCode(entry.bib)}
                              className="flag-icon rail-flag-icon"
                              height="14"
                              loading="lazy"
                              src={getFlagIconUrl(getNationalityCode(entry.bib))}
                              width="20"
                            />
                          </small>
                          <time>{getDisplayRaceTime(entry.bib, entry.scannedAt)}</time>
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
                  <span>{isActiveRaceLive ? "Leading" : "Ranking"}</span>
                  <h3>Woman</h3>
                </div>
                <div className="mini-leaderboard livetrail-mini-leaderboard">
                  {sidebarWomenRows.length ? (
                    sidebarWomenRows.map((entry) => (
                      <div className="mini-leaderboard-row live" key={`rail-women-${entry.bib}`}>
                        <strong>
                          {entry.rank}
                          {!isActiveRaceLive ? <RankingMedal rank={entry.rank} /> : null}
                        </strong>
                        <div>
                          <span>{entry.name}</span>
                          <small>{entry.checkpointId === "finish" ? "Arrivee" : entry.checkpointId === "cp-start" ? "Depart" : entry.checkpointName}</small>
                        </div>
                        <div className="rail-rank-time">
                          <small aria-label={getNationalityCode(entry.bib)}>
                            <img
                              alt={getNationalityCode(entry.bib)}
                              className="flag-icon rail-flag-icon"
                              height="14"
                              loading="lazy"
                              src={getFlagIconUrl(getNationalityCode(entry.bib))}
                              width="20"
                            />
                          </small>
                          <time>{getDisplayRaceTime(entry.bib, entry.scannedAt)}</time>
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



