import { Suspense, lazy, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
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
  fetchPrototypePublicLiveRace,
  fetchRecentPassings,
  fetchRunnerDetail,
  fetchRunnerSearch,
  type PrototypePublicLiveRaceSnapshot
} from "./api";
import { CourseProfilePanel } from "./CourseProfilePanel";
import { EditionHeroBanner } from "./EditionHeroBanner";
import runnerIcon from "./assets/runner.svg";
import podium1stIcon from "./assets/podium-1st.svg";
import podium2ndIcon from "./assets/podium-2nd.svg";
import podium3rdIcon from "./assets/podium-3rd.svg";
import trailnesiaLogo from "./assets/trailnesia.png";
import platformHomeHeroPhoto from "./assets/platform-home-hero-photo.jpg";
import worldMapSvgRaw from "./assets/world-map-detailed.svg?raw";
import { getDemoCourseForRace, type DemoCourse } from "./demoCourseVariants";
import { type DemoRaceCard, type DemoRaceRankingPreview } from "./demoRaceFestival";
import { RaceEditionHome } from "./RaceEditionHome";
import {
  buildOrganizerCourseFromRaceDraft,
  createOrganizerEventRecord,
  createOrganizerInviteCode,
  createOrganizerRaceTemplate,
  createDefaultOrganizerSetup,
  createDefaultOrganizerWorkspace,
  deriveOrganizerEventTitle,
  formatOrganizerDateRibbon,
  formatOrganizerScheduleLabel,
  getOrganizerCheckpointsForRace,
  getOrganizerRaceModeLabel,
  getOrganizerRaceModeSummary,
  getOrganizerRaceStateTone,
  isOrganizerRaceFinishedState,
  isOrganizerRaceLiveState,
  isOrganizerRaceUpcomingState,
  loadOrganizerWorkspace,
  normalizeOrganizerDateTimeInputValue,
  normalizeOrganizerRaceStateLabel,
  ORGANIZER_WORKSPACE_STORAGE_KEY,
  parseOrganizerGpxFile,
  parseParticipantImportFile,
  parseParticipantImportRows,
  parseParticipantImportText,
  type OrganizerBrandingDraft,
  type OrganizerEventRecord,
  type OrganizerCrewAssignmentDraft,
  type OrganizerParticipantImportMode,
  type OrganizerParticipantDraft,
  type OrganizerRaceDraft,
  type OrganizerRaceMode,
  type OrganizerRaceState,
  type OrganizerSetupDraft
} from "./organizerSetup";
import {
  buildOrganizerRaceSimulationSnapshot,
  buildOrganizerTrialScenario
} from "./organizerSimulation";
import {
  appendOrganizerSimulatedScan,
  applyParticipantImportMode,
  calculateParticipantImportImpact,
  type ParticipantImportImpact
} from "./organizerWorkflow";
import { OrganizerPrototypeApp } from "./organizer-prototype/OrganizerApp";
import { supabase } from "./supabase";
import "./styles.css";

const OrganizerConsole = lazy(() =>
  import("./OrganizerConsole").then((module) => ({
    default: module.OrganizerConsole
  }))
);

type PlatformRegionKey = "sumatra" | "java-bali" | "kalimantan" | "sulawesi" | "nusa-tenggara" | "papua-maluku";

const PLATFORM_HOME_REGIONS: { key: PlatformRegionKey; label: string }[] = [
  { key: "sumatra", label: "Sumatra" },
  { key: "java-bali", label: "Java & Bali" },
  { key: "kalimantan", label: "Kalimantan" },
  { key: "sulawesi", label: "Sulawesi" },
  { key: "nusa-tenggara", label: "Nusa Tenggara" },
  { key: "papua-maluku", label: "Papua & Maluku" }
];

function getPlatformRegionKey(location: string): PlatformRegionKey {
  const normalized = location.trim().toLowerCase();

  if (/(aceh|medan|sumatra|sumatera|padang|pekanbaru|riau|jambi|palembang|lampung|batam|bengkulu)/.test(normalized)) {
    return "sumatra";
  }

  if (/(jakarta|bogor|depok|bekasi|bandung|tasik|cirebon|semarang|solo|jogja|yogyakarta|surabaya|malang|kediri|banyuwangi|java|jawa|bali|denpasar|ubud)/.test(normalized)) {
    return "java-bali";
  }

  if (/(kalimantan|pontianak|banjarmasin|samarinda|balikpapan|tarakan|palangkaraya)/.test(normalized)) {
    return "kalimantan";
  }

  if (/(sulawesi|makassar|manado|palu|kendari|gorontalo|toraja|parepare)/.test(normalized)) {
    return "sulawesi";
  }

  if (/(lombok|mataram|sumbawa|flores|labuan bajo|labuan bajo|ntb|ntt|kupang|sumba|ende|komodo)/.test(normalized)) {
    return "nusa-tenggara";
  }

  return "papua-maluku";
}

function getPlatformRegionLabel(location: string) {
  const key = getPlatformRegionKey(location);
  return PLATFORM_HOME_REGIONS.find((region) => region.key === key)?.label ?? "Indonesia";
}

function getPlatformEventDateDetails(value?: string | null) {
  const normalized = String(value ?? "").trim();

  if (!normalized) {
    return {
      chip: "Set date",
      full: "Set event date",
      day: "--",
      month: "TBD",
      year: "----"
    };
  }

  const parsed = new Date(normalized);

  if (Number.isNaN(parsed.getTime())) {
    return {
      chip: normalized,
      full: normalized,
      day: "--",
      month: "TBD",
      year: "----"
    };
  }

  return {
    chip: new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    }).format(parsed),
    full: new Intl.DateTimeFormat("en-GB", {
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric"
    }).format(parsed),
    day: new Intl.DateTimeFormat("en-GB", {
      day: "2-digit"
    }).format(parsed),
    month: new Intl.DateTimeFormat("en-GB", {
      month: "short"
    })
      .format(parsed)
      .toUpperCase(),
    year: new Intl.DateTimeFormat("en-GB", {
      year: "numeric"
    }).format(parsed)
  };
}

function getPublicEventStatusLabel(status: OrganizerPublicEventStatus) {
  if (status === "live") {
    return "Live";
  }

  if (status === "upcoming") {
    return "Upcoming";
  }

  if (status === "finished") {
    return "Finished";
  }

  return "Hidden";
}

const emptyOverallLeaderboard: OverallLeaderboard = {
  totalRankedRunners: 0,
  topEntries: []
};

const FAVORITES_STORAGE_KEY = "arm:dashboard-favorites";
const FULL_RANKING_PAGE_SIZE = 12;
const ORGANIZER_ROLES = ["admin", "panitia", "observer"] as const;
const EDITION_HOME_VALUE = "__edition-home";
const COUNTRY_CODES = ["ID", "MY", "SG", "AU", "JP", "TH", "PH", "KR", "CN", "VN", "US", "FR"] as const;
const EMPTY_FESTIVAL = {
  brandStack: ["TRAIL", "NESIA"],
  brandName: "Trailnesia",
  editionLabel: "Edition draft",
  dateRibbon: "Set event date",
  locationRibbon: "Set event location",
  homeTitle: "Race Categories",
  homeSubtitle: "No published race categories yet. Create race categories and publish them when they are ready.",
  bannerTagline: "Organizer edition hub",
  races: [] as DemoRaceCard[]
};
const EMPTY_RACE_CARD: DemoRaceCard = {
  slug: "__no-race__",
  title: "No race selected",
  editionLabel: "Draft",
  scheduleLabel: "",
  startAt: "",
  startTown: "-",
  courseDescription: "No race category has been published yet.",
  courseHighlights: [],
  distanceKm: 0,
  ascentM: 0,
  finishers: 0,
  dnf: 0,
  accent: "#d6a341",
  accentSoft: "rgba(214, 163, 65, 0.18)",
  profileSeed: 0,
  rankingPreview: []
};
const EMPTY_COURSE: DemoCourse = {
  slug: EMPTY_RACE_CARD.slug,
  title: EMPTY_RACE_CARD.title,
  subtitle: "No course has been configured yet.",
  location: "",
  distanceKm: 0,
  ascentM: 0,
  descentM: 0,
  checkpoints: [],
  waypoints: [],
  profilePoints: []
};
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

type OrganizerEventPhase = "draft" | "ready" | "live";
type OrganizerPublicEventStatus = "hidden" | "upcoming" | "live" | "finished";
type OrganizerHomeFilter = "active" | "archived" | "all";
type OrganizerConsoleLandingView = "branding" | "races" | "participants" | "crew" | "overview";
type OrganizerConsoleEntryTarget = {
  view: OrganizerConsoleLandingView;
  raceSlug: string;
};
type PrototypePublicFeedItem = {
  ownerUserId: string;
  username: string | null;
  displayName: string | null;
  updatedAt: string;
  event: {
    id: number;
    name: string;
    location: string;
    description: string | null;
    startDate: string | null;
    endDate: string | null;
    logoUrl: string | null;
    bannerUrl: string | null;
    status: "upcoming" | "live" | "finished";
    createdAt: string;
    updatedAt: string;
  };
  participants?: Array<{
    id: number;
    raceId: number;
    bibNumber: string | null;
    fullName: string;
    gender: string | null;
    countryCode: string | null;
    status: string | null;
  }>;
  races: Array<{
    id: number;
    name: string;
    distance: number | null;
    elevationGain: number | null;
    descentM: number | null;
    maxParticipants: number | null;
    cutoffTime: string | null;
    gpxFileName: string | null;
    status: "upcoming" | "live" | "finished";
    participantCount: number;
    checkpointCount: number;
    crewCount: number;
    waypoints: Array<{
      id: string;
      name: string;
      km: number;
      ele: number;
      lat: number;
      lon: number;
    }>;
    profilePoints: Array<{
      km: number;
      ele: number;
    }>;
    checkpoints: Array<{
      id: number;
      name: string;
      orderIndex: number;
      distanceFromStart: number | null;
      isStartLine: boolean;
      isFinishLine: boolean;
    }>;
  }>;
};

type PrototypePublicRaceSource = {
  slug: string;
  ownerUserId: string;
  eventId: number;
  raceId: number;
  eventPublicId: string;
  updatedAt: string;
  race: PrototypePublicFeedItem["races"][number];
};

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
type OrganizerWorkspaceView = "spectator" | "home" | "console";
type OrganizerWizardStep = "basics" | "branding" | "race" | "review";
type OrganizerWizardDraft = {
  organizerName: string;
  brandName: string;
  editionLabel: string;
  homeTitle: string;
  homeSubtitle: string;
  bannerTagline: string;
  eventDateAt: string;
  dateRibbon: string;
  locationRibbon: string;
  firstRaceTitle: string;
  firstRaceDistanceKm: string;
  firstRaceAscentM: string;
  firstRaceStartTown: string;
  firstRaceScheduleLabel: string;
  firstRaceStartAt: string;
  firstRaceMode: OrganizerRaceMode;
  firstRaceLoopTargetLaps: string;
  firstRaceLoopTimeLimitHours: string;
  firstRaceRelayLegCount: string;
};
type RunnerDirectoryState = "all" | "registered" | "in-race" | "finisher" | "dns" | "withdrawn";
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

function getApiBaseUrl() {
  return (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api").replace(/\/+$/, "");
}

function getStableIndex(value: string, size: number) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash % size;
}

function slugifyOrganizerValue(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function mapPrototypeRaceStatus(status: PrototypePublicFeedItem["races"][number]["status"]): OrganizerRaceState {
  if (status === "live") {
    return "Live";
  }

  if (status === "finished") {
    return "Finished";
  }

  return "Upcoming";
}

function buildPrototypePublicOrganizerEvent(item: PrototypePublicFeedItem): OrganizerEventRecord {
  const fallbackSetup = createDefaultOrganizerSetup();
  const brandName = item.event.name.trim() || fallbackSetup.branding.brandName;
  const brandWords = brandName.split(/\s+/).filter(Boolean);
  const eventDateAt = normalizeOrganizerDateTimeInputValue(item.event.startDate ?? item.updatedAt, fallbackSetup.branding.eventDateAt);
  const publicParticipants = Array.isArray(item.participants) ? item.participants : [];
  const races = item.races.map((race, index) => {
    const template = createOrganizerRaceTemplate(index + 1);
    const startAt = normalizeOrganizerDateTimeInputValue(item.event.startDate ?? item.updatedAt, template.startAt);
    const checkpointList =
      race.checkpoints.length > 0
        ? (() => {
            let customCheckpointCount = 0;
            return race.checkpoints
              .slice()
              .sort((left, right) => left.orderIndex - right.orderIndex)
              .map((checkpoint, checkpointIndex) => {
                const isCustomCheckpoint = !checkpoint.isStartLine && !checkpoint.isFinishLine;
                if (isCustomCheckpoint) {
                  customCheckpointCount += 1;
                }

                return {
                  id: checkpoint.isStartLine ? "cp-start" : checkpoint.isFinishLine ? "finish" : `cp-${customCheckpointCount}`,
                  code: checkpoint.isStartLine ? "START" : checkpoint.isFinishLine ? "FIN" : `CP${customCheckpointCount}`,
                  name: checkpoint.name,
                  kmMarker: checkpoint.distanceFromStart ?? template.checkpoints[Math.min(checkpointIndex, template.checkpoints.length - 1)]?.kmMarker ?? 0,
                  order: checkpointIndex
                };
              });
          })()
        : template.checkpoints;
    const fallbackHighlights = [
      race.distance !== null ? `${race.distance} km category` : null,
      race.elevationGain !== null ? `${race.elevationGain} m+ elevation gain` : null,
      item.event.location.trim() ? `Based in ${item.event.location}` : null
    ].filter((value): value is string => Boolean(value));

    return {
      ...template,
      slug: slugifyOrganizerValue(`${item.ownerUserId}-${item.event.id}-${race.id}-${race.name}`) || `prototype-race-${race.id}`,
      title: race.name,
      isPublished: true,
      editionLabel: mapPrototypeRaceStatus(race.status),
      scheduleLabel: formatOrganizerScheduleLabel(startAt),
      startAt,
      startTown: item.event.location.trim() || template.startTown,
      courseDescription: item.event.description?.trim() || `${race.name} category for ${brandName}.`,
      courseHighlights: fallbackHighlights.length >= 2 ? fallbackHighlights : template.courseHighlights,
      distanceKm: race.distance ?? template.distanceKm,
      ascentM: race.elevationGain ?? template.ascentM,
      descentM: race.descentM ?? template.descentM,
      finishers: race.status === "finished" ? race.participantCount : 0,
      dnf: 0,
      gpxFileName: race.gpxFileName ?? null,
      waypoints: race.waypoints.length ? race.waypoints : template.waypoints,
      profilePoints: race.profilePoints.length ? race.profilePoints : template.profilePoints,
      checkpoints: checkpointList,
      participants: publicParticipants
        .filter((participant) => participant.raceId === race.id)
        .map((participant) => ({
          bib: participant.bibNumber?.trim().toUpperCase() || `RUN${participant.id}`,
          name: participant.fullName,
          gender: participant.gender?.toLowerCase() === "women" || participant.gender?.toLowerCase() === "female" ? "women" : "men",
          countryCode: normalizeCountryCodeValue(participant.countryCode ?? "ID"),
          club: ""
        })),
      crewAssignments: [],
      simulatedScans: []
    } satisfies OrganizerRaceDraft;
  });

  return {
    id: `prototype:${item.ownerUserId}:${item.event.id}`,
    title: brandName,
    createdAt: item.event.createdAt,
    updatedAt: item.event.updatedAt,
    archivedAt: null,
    setup: {
      branding: {
        ...fallbackSetup.branding,
        organizerName: item.displayName ?? item.username ?? fallbackSetup.branding.organizerName,
        brandStackTop: brandWords[0]?.toUpperCase() ?? fallbackSetup.branding.brandStackTop,
        brandStackBottom: brandWords.slice(1).join(" ").toUpperCase() || fallbackSetup.branding.brandStackBottom,
        brandName,
        editionLabel: item.event.status === "live" ? "Live edition" : item.event.status === "finished" ? "Finished edition" : "Upcoming edition",
        bannerTagline: item.event.location.trim() || fallbackSetup.branding.bannerTagline,
        homeTitle: brandName,
        homeSubtitle: item.event.description?.trim() || `Published race categories for ${brandName}.`,
        eventDateAt,
        dateRibbon: formatOrganizerDateRibbon(item.event.startDate ?? item.updatedAt),
        locationRibbon: item.event.location.trim() || fallbackSetup.branding.locationRibbon,
        eventLogoDataUrl: item.event.logoUrl,
        heroBackgroundImageDataUrl: item.event.bannerUrl,
        gpxFileName: races.find((race) => Boolean(race.gpxFileName))?.gpxFileName ?? null,
        gpxFileSize: null
      },
      races
    }
  };
}

function buildPrototypePublicRaceSourceMap(items: PrototypePublicFeedItem[]) {
  const map = new Map<string, PrototypePublicRaceSource>();

  for (const item of items) {
    const eventPublicId = `prototype:${item.ownerUserId}:${item.event.id}`;

    for (const race of item.races) {
      const slug = slugifyOrganizerValue(`${item.ownerUserId}-${item.event.id}-${race.id}-${race.name}`) || `prototype-race-${race.id}`;
      map.set(slug, {
        slug,
        ownerUserId: item.ownerUserId,
        eventId: item.event.id,
        raceId: race.id,
        eventPublicId,
        updatedAt: item.updatedAt,
        race
      });
    }
  }

  return map;
}

function hasPrototypePublicLiveSignal(snapshot: PrototypePublicLiveRaceSnapshot | null | undefined) {
  if (!snapshot) {
    return false;
  }

  return (
    snapshot.overallLeaderboard.topEntries.length > 0 ||
    snapshot.checkpointLeaderboards.some((board) => board.totalOfficialScans > 0) ||
    snapshot.scannedIn > 0
  );
}

function buildPrototypeFallbackScannerCheckpointId(
  checkpoint: PrototypePublicFeedItem["races"][number]["checkpoints"][number],
  intermediateIndex: number
) {
  if (checkpoint.isStartLine) {
    return "cp-start";
  }

  if (checkpoint.isFinishLine) {
    return "finish";
  }

  const demoCheckpointIds = ["cp-start", "cp-10", "cp-21", "cp-30", "cp-40", "finish"] as const;
  return demoCheckpointIds[Math.min(intermediateIndex, demoCheckpointIds.length - 2)] ?? `cp-extra-${checkpoint.orderIndex}`;
}

function buildPrototypePublicLiveRaceFallback(
  source: PrototypePublicRaceSource,
  recentPassings: RecentPassing[]
): PrototypePublicLiveRaceSnapshot {
  let customCheckpointCount = 0;
  let intermediateIndex = 1;

  const checkpointMappings = source.race.checkpoints
    .slice()
    .sort((left, right) => left.orderIndex - right.orderIndex)
    .map((checkpoint, orderIndex) => {
      if (!checkpoint.isStartLine && !checkpoint.isFinishLine) {
        customCheckpointCount += 1;
      }

      const currentIntermediateIndex = checkpoint.isStartLine || checkpoint.isFinishLine ? intermediateIndex : intermediateIndex++;

      return {
        publicCheckpointId: checkpoint.isStartLine ? "cp-start" : checkpoint.isFinishLine ? "finish" : `cp-${customCheckpointCount}`,
        publicCheckpointCode: checkpoint.isStartLine ? "START" : checkpoint.isFinishLine ? "FIN" : `CP${customCheckpointCount}`,
        publicCheckpointName: checkpoint.name,
        publicCheckpointKmMarker: checkpoint.distanceFromStart ?? 0,
        publicCheckpointOrder: orderIndex,
        scannerCheckpointId: buildPrototypeFallbackScannerCheckpointId(checkpoint, currentIntermediateIndex)
      };
    });
  const checkpointByScannerId = new Map<string, (typeof checkpointMappings)[number]>(
    checkpointMappings.map((mapping) => [mapping.scannerCheckpointId, mapping] as const)
  );
  const allowedCrewPrefix = `crew-${source.ownerUserId}-${source.eventId}-`;
  const filteredPassings = recentPassings
    .filter(
      (passing) => checkpointByScannerId.has(passing.checkpointId) && (passing.crewId ?? "").startsWith(allowedCrewPrefix)
    )
    .sort((left, right) => new Date(right.scannedAt).getTime() - new Date(left.scannedAt).getTime());

  const checkpointLeaderboards = checkpointMappings.map((mapping) => {
    const items = filteredPassings
      .filter((passing) => passing.checkpointId === mapping.scannerCheckpointId)
      .map((passing, index) => ({
        bib: passing.bib,
        checkpointId: mapping.publicCheckpointId,
        position: index + 1,
        scannedAt: passing.scannedAt,
        crewId: passing.crewId ?? "scanner-demo",
        deviceId: "spectator-fallback"
      }));

    return {
      checkpointId: mapping.publicCheckpointId,
      totalOfficialScans: items.length,
      topEntries: items.slice(0, 10)
    };
  });

  const latestByBib = new Map<
    string,
    {
      passing: RecentPassing;
      mapping: (typeof checkpointMappings)[number];
    }
  >();

  for (const passing of filteredPassings) {
    const mapping = checkpointByScannerId.get(passing.checkpointId);

    if (!mapping) {
      continue;
    }

    const existing = latestByBib.get(passing.bib);

    if (
      !existing ||
      mapping.publicCheckpointOrder > existing.mapping.publicCheckpointOrder ||
      (mapping.publicCheckpointOrder === existing.mapping.publicCheckpointOrder &&
        new Date(passing.scannedAt).getTime() < new Date(existing.passing.scannedAt).getTime())
    ) {
      latestByBib.set(passing.bib, { passing, mapping });
    }
  }

  const overallEntries = [...latestByBib.entries()]
    .sort((left, right) => {
      if (left[1].mapping.publicCheckpointOrder !== right[1].mapping.publicCheckpointOrder) {
        return right[1].mapping.publicCheckpointOrder - left[1].mapping.publicCheckpointOrder;
      }

      return new Date(left[1].passing.scannedAt).getTime() - new Date(right[1].passing.scannedAt).getTime();
    })
    .map(([bib, item], index) => ({
      bib,
      name: item.passing.name || `Runner ${bib}`,
      category: "men",
      rank: index + 1,
      checkpointId: item.mapping.publicCheckpointId,
      checkpointCode: item.mapping.publicCheckpointCode,
      checkpointName: item.mapping.publicCheckpointName,
      checkpointKmMarker: item.mapping.publicCheckpointKmMarker,
      checkpointOrder: item.mapping.publicCheckpointOrder,
      scannedAt: item.passing.scannedAt,
      crewId: item.passing.crewId ?? "scanner-demo",
      deviceId: "spectator-fallback"
    }));

  return {
    updatedAt: filteredPassings[0]?.scannedAt ?? source.updatedAt,
    raceId: source.raceId,
    raceName: source.race.name,
    raceStatus: source.race.status,
    totalParticipants: source.race.participantCount,
    scannedIn: latestByBib.size,
    finished: overallEntries.filter((entry) => entry.checkpointId === "finish").length,
    dnf: 0,
    overallLeaderboard: {
      totalRankedRunners: overallEntries.length,
      topEntries: overallEntries
    },
    womenLeaderboard: {
      totalRankedRunners: 0,
      topEntries: []
    },
    checkpointLeaderboards
  };
}

function buildOrganizerWizardDraft(): OrganizerWizardDraft {
  const branding = createDefaultOrganizerSetup().branding;
  const eventDateAt = normalizeOrganizerDateTimeInputValue(branding.eventDateAt);
  const firstRaceStartAt = normalizeOrganizerDateTimeInputValue("2026-07-05T05:00");

  return {
    organizerName: branding.organizerName,
    brandName: "Trail Event 2026",
    editionLabel: "Edition 2026",
    homeTitle: "Trail Event 2026",
    homeSubtitle: "Describe the event, terrain, and why spectators should follow this edition live.",
    bannerTagline: "Organizer edition hub",
    eventDateAt,
    dateRibbon: formatOrganizerDateRibbon(eventDateAt),
    locationRibbon: "Set event location",
    firstRaceTitle: "Ultra 50K",
    firstRaceDistanceKm: "50",
    firstRaceAscentM: "2800",
    firstRaceStartTown: "Start Town",
    firstRaceScheduleLabel: formatOrganizerScheduleLabel(firstRaceStartAt),
    firstRaceStartAt,
    firstRaceMode: "standard",
    firstRaceLoopTargetLaps: "6",
    firstRaceLoopTimeLimitHours: "12",
    firstRaceRelayLegCount: "4"
  };
}

function getWizardRaceModeSummary(draft: OrganizerWizardDraft) {
  switch (draft.firstRaceMode) {
    case "loop-fixed-laps":
      return `${draft.firstRaceLoopTargetLaps || "Set"} target laps`;
    case "loop-fixed-time":
      return `${draft.firstRaceLoopTimeLimitHours || "Set"} hour time limit`;
    case "relay":
      return `${draft.firstRaceRelayLegCount || "Set"} relay legs`;
    default:
      return "Fastest total elapsed time";
  }
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
const LOCAL_ORGANIZER_USERNAME = "admin";
const LOCAL_ORGANIZER_PASSWORD = "admin";
const LOCAL_ORGANIZER_SESSION_KEY = "arm:local-organizer-session";

function buildLocalOrganizerProfile() {
  return authProfileSchema.parse({
    userId: "local-admin",
    email: LOCAL_ORGANIZER_USERNAME,
    role: "admin",
    crewCode: null,
    displayName: "Admin"
  });
}

function readLocalOrganizerSession() {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    const raw = window.localStorage.getItem(LOCAL_ORGANIZER_SESSION_KEY);

    if (!raw) {
      return false;
    }

    const parsed = JSON.parse(raw) as { username?: unknown } | null;
    return parsed?.username === LOCAL_ORGANIZER_USERNAME;
  } catch {
    return false;
  }
}

function persistLocalOrganizerSession() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    LOCAL_ORGANIZER_SESSION_KEY,
    JSON.stringify({
      username: LOCAL_ORGANIZER_USERNAME,
      issuedAt: new Date().toISOString()
    })
  );
}

function clearLocalOrganizerSession() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(LOCAL_ORGANIZER_SESSION_KEY);
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

function isOrganizerRaceReadyForPublish(branding: OrganizerBrandingDraft, race: OrganizerRaceDraft) {
  return (
    Boolean(branding.eventLogoDataUrl) &&
    Boolean(branding.heroBackgroundImageDataUrl) &&
    race.courseDescription.trim().length >= 24 &&
    race.courseHighlights.filter(Boolean).length >= 2 &&
    isOrganizerRaceModeConfigured(race) &&
    race.checkpoints.length >= 3 &&
    Boolean(race.startAt.trim()) &&
    Boolean(race.scheduleLabel.trim())
  );
}

function isOrganizerRaceModeConfigured(race: OrganizerRaceDraft) {
  if (race.raceMode === "loop-fixed-laps") {
    return Boolean(race.loopTargetLaps && race.loopTargetLaps > 0);
  }

  if (race.raceMode === "loop-fixed-time") {
    return Boolean(race.loopTimeLimitHours && race.loopTimeLimitHours > 0);
  }

  if (race.raceMode === "relay") {
    return Boolean(race.relayLegCount && race.relayLegCount > 1);
  }

  return true;
}

function isOrganizerRaceReadyForLive(branding: OrganizerBrandingDraft, race: OrganizerRaceDraft) {
  const acceptedCrew = race.crewAssignments.filter((crew) => crew.status === "accepted" || crew.status === "active");
  const provisionedCrew = race.crewAssignments.filter((crew) => crew.deviceLabel.trim().length > 0);

  return (
    isOrganizerRaceReadyForPublish(branding, race) &&
    Boolean(race.gpxFileName) &&
    race.participants.length > 0 &&
    race.crewAssignments.length > 0 &&
    acceptedCrew.length === race.crewAssignments.length &&
    provisionedCrew.length === race.crewAssignments.length
  );
}

function normalizeOrganizerRaceGoLiveState(branding: OrganizerBrandingDraft, race: OrganizerRaceDraft) {
  if (isOrganizerRaceLiveState(race.editionLabel) && !isOrganizerRaceReadyForLive(branding, race)) {
    return {
      ...race,
      editionLabel: "Upcoming" as OrganizerRaceState
    };
  }

  return race;
}

function deriveOrganizerEventPhase(event: OrganizerEventRecord): OrganizerEventPhase {
  if (event.setup.races.some((race) => race.isPublished && isOrganizerRaceLiveState(race.editionLabel))) {
    return "live";
  }

  if (
    event.setup.races.some((race) => race.isPublished) ||
    (event.setup.races.length > 0 && event.setup.races.every((race) => isOrganizerRaceReadyForPublish(event.setup.branding, race)))
  ) {
    return "ready";
  }

  return "draft";
}

function deriveOrganizerPublicEventStatus(event: OrganizerEventRecord): OrganizerPublicEventStatus {
  const publishedRaces = event.setup.races.filter((race) => race.isPublished);

  if (!publishedRaces.length) {
    return "hidden";
  }

  if (publishedRaces.some((race) => isOrganizerRaceLiveState(race.editionLabel))) {
    return "live";
  }

  if (publishedRaces.some((race) => isOrganizerRaceUpcomingState(race.editionLabel))) {
    return "upcoming";
  }

  return "finished";
}

function resolveOrganizerConsoleEntryTarget(
  setup: OrganizerSetupDraft,
  preferredRaceSlug?: string | null
): OrganizerConsoleEntryTarget {
  const fallbackRace = setup.races.find((race) => race.slug === preferredRaceSlug) ?? setup.races[0] ?? null;

  if (!fallbackRace) {
    return {
      view: "branding",
      raceSlug: ""
    };
  }

  if (!setup.branding.eventLogoDataUrl || !setup.branding.heroBackgroundImageDataUrl) {
    return {
      view: "branding",
      raceSlug: fallbackRace.slug
    };
  }

  const raceMissingCourseSetup =
    setup.races.find(
      (race) =>
        !Boolean(race.gpxFileName) ||
        race.courseDescription.trim().length < 24 ||
        race.courseHighlights.filter(Boolean).length < 2 ||
        !isOrganizerRaceModeConfigured(race) ||
        race.checkpoints.length < 3 ||
        !Boolean(race.startAt.trim()) ||
        !Boolean(race.scheduleLabel.trim())
    ) ?? null;

  if (raceMissingCourseSetup) {
    return {
      view: "races",
      raceSlug: raceMissingCourseSetup.slug
    };
  }

  const raceMissingParticipants = setup.races.find((race) => race.participants.length === 0) ?? null;

  if (raceMissingParticipants) {
    return {
      view: "participants",
      raceSlug: raceMissingParticipants.slug
    };
  }

  const raceMissingCrew =
    setup.races.find(
      (race) =>
        race.crewAssignments.length === 0 ||
        race.crewAssignments.some((crew) => !["accepted", "active"].includes(crew.status) || crew.deviceLabel.trim().length === 0)
    ) ?? null;

  if (raceMissingCrew) {
    return {
      view: "crew",
      raceSlug: raceMissingCrew.slug
    };
  }

  return {
    view: "overview",
    raceSlug: fallbackRace.slug
  };
}

function buildDuplicatedOrganizerEventTitle(sourceTitle: string, existingTitles: string[]) {
  const trimmed = sourceTitle.trim() || "Untitled event";
  const copyBase = trimmed.replace(/\sCopy(?:\s\d+)?$/i, "").trim();
  const normalizedExisting = new Set(existingTitles.map((title) => title.trim().toLowerCase()));

  let candidate = `${copyBase} Copy`;
  let index = 2;

  while (normalizedExisting.has(candidate.toLowerCase())) {
    candidate = `${copyBase} Copy ${index}`;
    index += 1;
  }

  return candidate;
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
  const [isLocalOrganizerAuth, setIsLocalOrganizerAuth] = useState(false);
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
  const [selectedPublicEventId, setSelectedPublicEventId] = useState<string | null>(null);
  const [raceDetailView, setRaceDetailView] = useState<RaceDetailView>("race-page");
  const [organizerWorkspaceView, setOrganizerWorkspaceView] = useState<OrganizerWorkspaceView>("spectator");
  const [organizerWorkspace, setOrganizerWorkspace] = useState(() => loadOrganizerWorkspace());
  const [organizerHomeFilter, setOrganizerHomeFilter] = useState<OrganizerHomeFilter>("active");
  const [organizerImportText, setOrganizerImportText] = useState("");
  const [organizerImportFileName, setOrganizerImportFileName] = useState<string | null>(null);
  const [organizerImportMode, setOrganizerImportMode] = useState<OrganizerParticipantImportMode>("merge");
  const [organizerSetupRaceSlug, setOrganizerSetupRaceSlug] = useState<string>(createDefaultOrganizerSetup().races[0]?.slug ?? "");
  const [organizerConsoleInitialView, setOrganizerConsoleInitialView] = useState<OrganizerConsoleLandingView>("overview");
  const [organizerConsoleNavigationKey, setOrganizerConsoleNavigationKey] = useState(0);
  const [organizerDraftSavedAt, setOrganizerDraftSavedAt] = useState<string | null>(() => new Date().toISOString());
  const [organizerWizardOpen, setOrganizerWizardOpen] = useState(false);
  const [organizerWizardStep, setOrganizerWizardStep] = useState<OrganizerWizardStep>("basics");
  const [organizerWizardDraft, setOrganizerWizardDraft] = useState<OrganizerWizardDraft>(() => buildOrganizerWizardDraft());
  const [prototypePublicFeed, setPrototypePublicFeed] = useState<PrototypePublicFeedItem[]>([]);
  const [isPrototypePublicFeedLoading, setIsPrototypePublicFeedLoading] = useState(true);
  const [prototypePublicLiveSnapshots, setPrototypePublicLiveSnapshots] = useState<Record<string, PrototypePublicLiveRaceSnapshot>>({});
  const [runnerNavOpen, setRunnerNavOpen] = useState(true);
  const [raceNavOpen, setRaceNavOpen] = useState(true);
  const [isTopbarMenuOpen, setIsTopbarMenuOpen] = useState(false);
  const [platformEventQuery, setPlatformEventQuery] = useState("");
  const topbarMenuRef = useRef<HTMLDivElement | null>(null);
  const hasDashboardAccess = profile ? ORGANIZER_ROLES.includes(profile.role as (typeof ORGANIZER_ROLES)[number]) : false;
  const organizerSessionActive = Boolean((accessToken || isLocalOrganizerAuth) && hasDashboardAccess);
  const organizerVisibleEvents = useMemo(
    () => organizerWorkspace.events.filter((event) => !event.archivedAt),
    [organizerWorkspace.events]
  );
  const organizerArchivedEvents = useMemo(
    () => organizerWorkspace.events.filter((event) => Boolean(event.archivedAt)),
    [organizerWorkspace.events]
  );
  const legacyPublicVisibleEvents = useMemo(
    () => organizerVisibleEvents.filter((event) => deriveOrganizerPublicEventStatus(event) !== "hidden"),
    [organizerVisibleEvents]
  );
  const prototypePublicVisibleEvents = useMemo(
    () => prototypePublicFeed.map((item) => buildPrototypePublicOrganizerEvent(item)),
    [prototypePublicFeed]
  );
  const publicVisibleEvents = useMemo(() => {
    const merged = [...legacyPublicVisibleEvents, ...prototypePublicVisibleEvents];
    const seen = new Set<string>();
    return merged.filter((event) => {
      if (seen.has(event.id)) {
        return false;
      }

      seen.add(event.id);
      return true;
    });
  }, [legacyPublicVisibleEvents, prototypePublicVisibleEvents]);
  const organizerActiveEvent =
    organizerVisibleEvents.find((event) => event.id === organizerWorkspace.activeEventId) ?? organizerVisibleEvents[0] ?? null;
  const spectatorEvent = publicVisibleEvents.find((event) => event.id === selectedPublicEventId) ?? null;
  const prototypePublicRaceSourceMap = useMemo(() => buildPrototypePublicRaceSourceMap(prototypePublicFeed), [prototypePublicFeed]);
  const prototypePublicLivePollingSources = useMemo(
    () => Array.from(prototypePublicRaceSourceMap.values()),
    [prototypePublicRaceSourceMap]
  );
  const organizerSetup = organizerActiveEvent?.setup ?? createDefaultOrganizerSetup();
  const spectatorSetup = spectatorEvent?.setup ?? createDefaultOrganizerSetup();
  const apiHost = getApiHost();
  const deferredRunnerQuery = useDeferredValue(runnerQuery);
  const normalizedRunnerQuery = runnerQuery.trim().toUpperCase();
  const isOrganizerHomeOpen = organizerSessionActive && organizerWorkspaceView === "home";
  const isOrganizerConsoleOpen = organizerSessionActive && organizerWorkspaceView === "console";
  const isOrganizerWorkspaceOpen = isOrganizerHomeOpen || isOrganizerConsoleOpen;
  const activeFestivalSetup = isOrganizerWorkspaceOpen ? organizerSetup : spectatorSetup;
  const prototypeSpectatorRaceSources = useMemo(
    () =>
      spectatorSetup.races.flatMap((race) => {
        const source = prototypePublicRaceSourceMap.get(race.slug);
        return source && source.eventPublicId === spectatorEvent?.id ? [source] : [];
      }),
    [prototypePublicRaceSourceMap, spectatorEvent?.id, spectatorSetup.races]
  );
  const prototypePublicLiveSnapshotBySlug = useMemo(
    () =>
      new Map(
        Object.entries(prototypePublicLiveSnapshots).map(([slug, snapshot]) => [slug, snapshot] as const)
      ),
    [prototypePublicLiveSnapshots]
  );
  const eventHasPrototypeLiveSignal = useMemo(
    () =>
      spectatorEvent?.setup.races.some((race) => hasPrototypePublicLiveSignal(prototypePublicLiveSnapshotBySlug.get(race.slug))) ??
      false,
    [prototypePublicLiveSnapshotBySlug, spectatorEvent?.setup.races]
  );
  const festivalData = useMemo(() => {
    const races = activeFestivalSetup.races.map((raceDraft) => ({ ...raceDraft }) as DemoRaceCard);

    return {
      ...EMPTY_FESTIVAL,
      brandName: activeFestivalSetup.branding.brandName || EMPTY_FESTIVAL.brandName,
      brandStack: [
        activeFestivalSetup.branding.brandStackTop || EMPTY_FESTIVAL.brandStack[0],
        activeFestivalSetup.branding.brandStackBottom || EMPTY_FESTIVAL.brandStack[1]
      ],
      editionLabel:
        !isOrganizerWorkspaceOpen && eventHasPrototypeLiveSignal
          ? "Live edition"
          : activeFestivalSetup.branding.editionLabel || EMPTY_FESTIVAL.editionLabel,
      dateRibbon: activeFestivalSetup.branding.dateRibbon || EMPTY_FESTIVAL.dateRibbon,
      locationRibbon: activeFestivalSetup.branding.locationRibbon || EMPTY_FESTIVAL.locationRibbon,
      homeTitle: activeFestivalSetup.branding.homeTitle || EMPTY_FESTIVAL.homeTitle,
      homeSubtitle: activeFestivalSetup.branding.homeSubtitle || EMPTY_FESTIVAL.homeSubtitle,
      bannerTagline: activeFestivalSetup.branding.bannerTagline || EMPTY_FESTIVAL.bannerTagline,
      races
    };
  }, [activeFestivalSetup, eventHasPrototypeLiveSignal, isOrganizerWorkspaceOpen]);
  const spectatorRaces = useMemo(
    () => festivalData.races.filter((race) => spectatorSetup.races.find((draft) => draft.slug === race.slug)?.isPublished !== false),
    [festivalData.races, spectatorSetup.races]
  );
  const visibleRaces = spectatorRaces;
  const fallbackVisibleRace = visibleRaces[0] ?? festivalData.races[0] ?? EMPTY_RACE_CARD;
  const prototypeLiveSourceRace =
    visibleRaces.find((race) => {
      const snapshot = prototypePublicLiveSnapshotBySlug.get(race.slug);
      return !isOrganizerRaceFinishedState(race.editionLabel) && hasPrototypePublicLiveSignal(snapshot);
    }) ?? null;
  const liveSourceRace = prototypeLiveSourceRace ?? visibleRaces.find((race) => isOrganizerRaceLiveState(race.editionLabel)) ?? null;
  const featuredRace =
    liveSourceRace ?? visibleRaces.find((race) => isOrganizerRaceUpcomingState(race.editionLabel)) ?? fallbackVisibleRace;
  const selectedRaceCard =
    visibleRaces.find((race) => race.slug === selectedRaceSlug) ??
    (selectedRaceSlug === EDITION_HOME_VALUE ? featuredRace : festivalData.races.find((race) => race.slug === selectedRaceSlug)) ??
    featuredRace;
  const selectedOrganizerRace = activeFestivalSetup.races.find((race) => race.slug === selectedRaceCard.slug) ?? null;
  const selectedPrototypePublicLiveSnapshot = !isOrganizerWorkspaceOpen ? prototypePublicLiveSnapshotBySlug.get(selectedRaceCard.slug) ?? null : null;
  const activeRaceStateTone =
    selectedPrototypePublicLiveSnapshot && hasPrototypePublicLiveSignal(selectedPrototypePublicLiveSnapshot)
      ? "live"
      : getOrganizerRaceStateTone(selectedRaceCard.editionLabel);
  const isActiveRaceLive = activeRaceStateTone === "live";
  const isActiveRaceFinished = activeRaceStateTone === "finished";
  const isActiveRaceUpcoming = activeRaceStateTone === "upcoming";
  const isEditionHome = selectedRaceSlug === EDITION_HOME_VALUE;
  const isFeaturedRace = selectedRaceCard.slug === featuredRace.slug;
  const activeCourse = useMemo(() => {
    if (!selectedOrganizerRace) {
      return selectedRaceCard.slug === EMPTY_RACE_CARD.slug ? EMPTY_COURSE : getDemoCourseForRace(selectedRaceCard);
    }

    return buildOrganizerCourseFromRaceDraft(selectedOrganizerRace);
  }, [selectedOrganizerRace, selectedRaceCard]);
  const showPlatformHome = !isOrganizerWorkspaceOpen && !spectatorEvent;
  const showEditionHome = !showPlatformHome && isEditionHome && raceDetailView === "race-page";
  const showSidebarRail = !isEditionHome && !isOrganizerWorkspaceOpen && raceDetailView === "race-page" && !isActiveRaceUpcoming;
  const raceMenuLabel = !isEditionHome && !isOrganizerWorkspaceOpen ? selectedRaceCard.title : "Home";
  const organizerSelectedRace =
    organizerSetup.races.find((race) => race.slug === organizerSetupRaceSlug) ?? organizerSetup.races[0] ?? null;
  const organizerCheckpointDraft = organizerSelectedRace ? getOrganizerCheckpointsForRace(organizerSelectedRace) : [];
  const organizerImportPreview = useMemo(() => parseParticipantImportText(organizerImportText), [organizerImportText]);
  const organizerImportedParticipants = useMemo(() => parseParticipantImportRows(organizerImportText), [organizerImportText]);
  const organizerImportImpact = useMemo(
    () => calculateParticipantImportImpact(organizerSelectedRace?.participants ?? [], organizerImportedParticipants),
    [organizerImportedParticipants, organizerSelectedRace]
  );
  const spectatorSimulationSnapshots = useMemo(
    () => new Map(spectatorSetup.races.map((race) => [race.slug, buildOrganizerRaceSimulationSnapshot(race)])),
    [spectatorSetup.races]
  );
  const organizerSimulationSnapshots = useMemo(
    () => new Map(organizerSetup.races.map((race) => [race.slug, buildOrganizerRaceSimulationSnapshot(race)])),
    [organizerSetup.races]
  );
  const selectedRaceSimulationSnapshot = spectatorSimulationSnapshots.get(selectedRaceCard.slug) ?? null;
  const organizerSelectedRaceSimulationSnapshot = organizerSelectedRace
    ? organizerSimulationSnapshots.get(organizerSelectedRace.slug) ?? null
    : null;

  useEffect(() => {
    const restoreLocalOrganizerSession = () => {
      setIsAuthenticated(true);
      setAccessToken(null);
      setProfile(buildLocalOrganizerProfile());
      setIsLocalOrganizerAuth(true);
      setOrganizerWorkspaceView("home");
    };

    if (!supabase) {
      if (readLocalOrganizerSession()) {
        restoreLocalOrganizerSession();
      } else {
        setIsAuthenticated(false);
        setAccessToken(null);
        setProfile(null);
        setIsLocalOrganizerAuth(false);
      }

      setIsBootstrapping(false);
      return;
    }

    let isMounted = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) {
        return;
      }

      if (data.session) {
        clearLocalOrganizerSession();
        setIsAuthenticated(true);
        setAccessToken(data.session.access_token);
        setProfile(deriveProfileFromSession(data.session));
        setIsLocalOrganizerAuth(false);
      } else if (readLocalOrganizerSession()) {
        restoreLocalOrganizerSession();
      } else {
        setIsAuthenticated(false);
        setAccessToken(null);
        setProfile(null);
        setIsLocalOrganizerAuth(false);
      }

      setIsBootstrapping(false);
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        clearLocalOrganizerSession();
        setIsAuthenticated(true);
        setAccessToken(session.access_token);
        setProfile(deriveProfileFromSession(session));
        setIsLocalOrganizerAuth(false);
      } else if (readLocalOrganizerSession()) {
        restoreLocalOrganizerSession();
      } else {
        setIsAuthenticated(false);
        setAccessToken(null);
        setProfile(null);
        setIsLocalOrganizerAuth(false);
      }

      setFetchError(null);
      setIsBootstrapping(false);
    });

    return () => {
      isMounted = false;
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

    window.localStorage.setItem(ORGANIZER_WORKSPACE_STORAGE_KEY, JSON.stringify(organizerWorkspace));
    setOrganizerDraftSavedAt(new Date().toISOString());
  }, [organizerWorkspace]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    let isActive = true;
    const apiBaseUrl = getApiBaseUrl();

    async function loadPrototypePublicFeed() {
      try {
        const response = await fetch(`${apiBaseUrl}/organizer/public-events`, {
          cache: "no-store"
        });

        if (!response.ok) {
          throw new Error(`Public organizer feed failed (${response.status})`);
        }

        const payload = (await response.json()) as {
          items?: PrototypePublicFeedItem[];
        };

        if (!isActive) {
          return;
        }

        setPrototypePublicFeed(Array.isArray(payload.items) ? payload.items : []);
        setIsPrototypePublicFeedLoading(false);
      } catch (error) {
        console.error("Failed to load organizer public events.", error);

        if (!isActive) {
          return;
        }

        setIsPrototypePublicFeedLoading(false);
      }
    }

    void loadPrototypePublicFeed();
    const intervalId = window.setInterval(() => {
      void loadPrototypePublicFeed();
    }, 15000);

    return () => {
      isActive = false;
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (isOrganizerWorkspaceOpen || !prototypePublicLivePollingSources.length) {
      setPrototypePublicLiveSnapshots({});
      return;
    }

    let isActive = true;

    async function loadPrototypePublicLiveSnapshots() {
      try {
        const items = await Promise.all(
          prototypePublicLivePollingSources.map(async (source) => {
            const snapshot = await fetchPrototypePublicLiveRace(source).catch(() => null);
            return [source.slug, snapshot, source] as const;
          })
        );

        const missingSources = items.filter((entry) => !entry[1]).map((entry) => entry[2]);
        let fallbackSnapshots = new Map<string, PrototypePublicLiveRaceSnapshot>();

        if (missingSources.length > 0) {
          const recentPassings = await fetchRecentPassings(100).catch(() => []);
          fallbackSnapshots = new Map(
            missingSources.map((source) => [source.slug, buildPrototypePublicLiveRaceFallback(source, recentPassings)] as const)
          );
        }

        if (!isActive) {
          return;
        }

        const nextSnapshots = Object.fromEntries(
          items
            .map(([slug, snapshot, source]) => [slug, snapshot ?? fallbackSnapshots.get(source.slug) ?? null] as const)
            .filter((entry): entry is readonly [string, PrototypePublicLiveRaceSnapshot] => Boolean(entry[1]))
        );
        const activeSnapshots = Object.values(nextSnapshots);
        const latestUpdate = activeSnapshots
          .map((snapshot) => snapshot.updatedAt)
          .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0] ?? null;

        setPrototypePublicLiveSnapshots(nextSnapshots);
        setFetchError(null);

        if (activeSnapshots.some((snapshot) => hasPrototypePublicLiveSignal(snapshot))) {
          setLiveStatus("live");
          setLastLiveEventAt(
            new Date().toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit"
            })
          );
        } else {
          setLiveStatus("polling");
        }

        if (latestUpdate) {
          setLastUpdatedAt(
            new Date(latestUpdate).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit"
            })
          );
        }
      } catch (error) {
        if (!isActive) {
          return;
        }

        setFetchError(error instanceof Error ? error.message : "Spectator live feed gagal dimuat.");
      }
    }

    void loadPrototypePublicLiveSnapshots();
    const intervalId = window.setInterval(() => {
      void loadPrototypePublicLiveSnapshots();
    }, 5000);

    return () => {
      isActive = false;
      window.clearInterval(intervalId);
    };
  }, [isOrganizerWorkspaceOpen, prototypePublicLivePollingSources]);

  useEffect(() => {
    if (!organizerSessionActive) {
      setOrganizerWorkspaceView("spectator");
      setOrganizerWizardOpen(false);
      return;
    }

    setOrganizerWorkspaceView((current) => (current === "spectator" ? "home" : current));
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
    if (isOrganizerConsoleOpen || isOrganizerHomeOpen || selectedRaceSlug === EDITION_HOME_VALUE) {
      return;
    }

    if (visibleRaces.some((race) => race.slug === selectedRaceSlug)) {
      return;
    }

    setSelectedRaceSlug(EDITION_HOME_VALUE);
    setRaceDetailView("race-page");
  }, [isOrganizerConsoleOpen, isOrganizerHomeOpen, selectedRaceSlug, visibleRaces]);

  useEffect(() => {
    if (selectedPublicEventId && !publicVisibleEvents.some((event) => event.id === selectedPublicEventId)) {
      setSelectedPublicEventId(null);
      setSelectedRaceSlug(EDITION_HOME_VALUE);
      setRaceDetailView("race-page");
    }
  }, [publicVisibleEvents, selectedPublicEventId]);

  useEffect(() => {
    setIsTopbarMenuOpen(false);
  }, [selectedRaceSlug, organizerWorkspaceView]);

  useEffect(() => {
    if (!isTopbarMenuOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!topbarMenuRef.current?.contains(event.target as Node)) {
        setIsTopbarMenuOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsTopbarMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isTopbarMenuOpen]);

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
    const usesPrototypeSpectatorLiveFeed = !organizerSessionActive && prototypePublicLivePollingSources.length > 0;
    let isMounted = true;

    async function refreshRaceHub() {
      if (document.visibilityState === "hidden") {
        return;
      }

      if (usesPrototypeSpectatorLiveFeed) {
        if (isMounted) {
          setIsRefreshing(false);
        }
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
  }, [accessToken, isBootstrapping, organizerSessionActive, prototypePublicLivePollingSources.length]);

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
      if (!liveSourceRace || (!isFeaturedRace && !isEditionHome)) {
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
    liveSourceRace,
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
      : selectedPrototypePublicLiveSnapshot?.overallLeaderboard.topEntries.length
        ? selectedPrototypePublicLiveSnapshot.overallLeaderboard
      : selectedRaceCard.slug === liveSourceRace?.slug && overallLeaderboard.topEntries.length > 0
        ? overallLeaderboard
        : previewOverallLeaderboard;
  const activeWomenLeaderboard =
    selectedRaceSimulationSnapshot?.womenLeaderboard.topEntries.length
      ? selectedRaceSimulationSnapshot.womenLeaderboard
      : selectedPrototypePublicLiveSnapshot && hasPrototypePublicLiveSignal(selectedPrototypePublicLiveSnapshot)
        ? selectedPrototypePublicLiveSnapshot.womenLeaderboard
      : selectedRaceCard.slug === liveSourceRace?.slug && womenLeaderboard.topEntries.length > 0
        ? womenLeaderboard
        : previewWomenLeaderboard;
  const activeCheckpointLeaderboards =
    selectedRaceSimulationSnapshot?.checkpointLeaderboards.some((board) => board.totalOfficialScans > 0)
      ? selectedRaceSimulationSnapshot.checkpointLeaderboards
      : selectedPrototypePublicLiveSnapshot?.checkpointLeaderboards.some((board) => board.totalOfficialScans > 0)
        ? selectedPrototypePublicLiveSnapshot.checkpointLeaderboards
      : selectedRaceCard.slug === liveSourceRace?.slug && leaderboards.length > 0
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
      if (!liveSourceRace || (!isFeaturedRace && !isEditionHome)) {
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
    liveSourceRace,
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
  const usesSelectedRaceLiveSource = selectedRaceCard.slug === liveSourceRace?.slug;
  const activeStarterCount =
    selectedRaceSimulationSnapshot?.overallLeaderboard.topEntries.length || usesSelectedRaceLiveSource
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

    if (organizerSelectedRace.slug === liveSourceRace?.slug && leaderboards.length > 0) {
      return leaderboards;
    }

    return buildCheckpointLeaderboardsFallback(organizerSelectedRace as DemoRaceCard);
  }, [leaderboards, liveSourceRace?.slug, organizerSelectedRace, organizerSelectedRaceSimulationSnapshot]);
  const organizerConsoleDuplicates =
    organizerSelectedRaceSimulationSnapshot?.duplicates.length
      ? organizerSelectedRaceSimulationSnapshot.duplicates
      : organizerSelectedRace?.slug === liveSourceRace?.slug
        ? activeDuplicates
        : [];
  const organizerConsoleNotifications =
    organizerSelectedRaceSimulationSnapshot?.notifications.length
      ? organizerSelectedRaceSimulationSnapshot.notifications
      : organizerSelectedRace?.slug === liveSourceRace?.slug
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
    selectedRaceSimulationSnapshot?.overallLeaderboard.topEntries.length || usesSelectedRaceLiveSource ? finisherCount : selectedRaceCard.finishers;
  const activeDnfCount =
    selectedRaceSimulationSnapshot?.overallLeaderboard.topEntries.length || usesSelectedRaceLiveSource ? dnfDnsCount : selectedRaceCard.dnf;
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
      const prototypeLiveSnapshot = prototypePublicLiveSnapshotBySlug.get(race.slug) ?? null;
      const simulatedEntries = raceSimulationSnapshot?.overallLeaderboard.topEntries ?? [];
      const useSimulatedEntries = simulatedEntries.length > 0;
      const usePrototypeLiveEntries = !useSimulatedEntries && hasPrototypePublicLiveSignal(prototypeLiveSnapshot);
      const useLiveEntries =
        !useSimulatedEntries && !usePrototypeLiveEntries && race.slug === liveSourceRace?.slug && overallLeaderboard.topEntries.length > 0;
      const sourceEntries = useSimulatedEntries
        ? simulatedEntries
        : usePrototypeLiveEntries
          ? prototypeLiveSnapshot?.overallLeaderboard.topEntries ?? []
          : useLiveEntries
            ? overallLeaderboard.topEntries
            : null;
      const rankedRows: RunnerDirectoryEntry[] = (sourceEntries
        ? sourceEntries.map((entry) => ({
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
  }, [liveSourceRace?.slug, organizerSetup.races, organizerSimulationSnapshots, overallLeaderboard.topEntries, prototypePublicLiveSnapshotBySlug, visibleRaces]);
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
  const rankingRaceIsLive =
    hasPrototypePublicLiveSignal(prototypePublicLiveSnapshotBySlug.get(rankingSelectedRace.slug)) ||
    isOrganizerRaceLiveState(rankingSelectedRace.editionLabel);
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
    ? `${statisticsSelectedRace.title} Â· ${statisticsSelectedRace.distanceKm.toFixed(1)} km Â· ${statisticsSelectedRace.ascentM} m+`
    : `${visibleRaces.length} races Â· ${statisticsRegisteredCount.toLocaleString()} registered runners`;
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
      const raceDraft = spectatorSetup.races.find((item) => item.slug === race.slug) ?? null;
      const cardCourse = raceDraft ? buildOrganizerCourseFromRaceDraft(raceDraft) : null;
      const raceSimulationSnapshot = spectatorSimulationSnapshots.get(race.slug);
      const prototypeLiveSnapshot = prototypePublicLiveSnapshotBySlug.get(race.slug) ?? null;
      const hasPrototypeLiveEntries = hasPrototypePublicLiveSignal(prototypeLiveSnapshot);
      const hasSimulatedEntries = (raceSimulationSnapshot?.overallLeaderboard.topEntries.length ?? 0) > 0;
      const homeEntries = hasSimulatedEntries
        ? raceSimulationSnapshot?.overallLeaderboard.topEntries ?? []
        : hasPrototypeLiveEntries
          ? prototypeLiveSnapshot?.overallLeaderboard.topEntries ?? []
        : race.slug === liveSourceRace?.slug && overallLeaderboard.topEntries.length
          ? overallLeaderboard.topEntries
          : null;
      const runtimeEditionLabel =
        hasPrototypeLiveEntries && !isOrganizerRaceFinishedState(race.editionLabel) ? "Live" : race.editionLabel;

      if (!homeEntries) {
        return {
          ...race,
          profilePoints: cardCourse?.profilePoints ?? race.profilePoints,
          modeLabel: raceDraft ? getOrganizerRaceModeLabel(raceDraft.raceMode) : undefined,
          modeSummary: raceDraft ? getOrganizerRaceModeSummary(raceDraft) : undefined,
          editionLabel: runtimeEditionLabel,
          isLive: isOrganizerRaceLiveState(runtimeEditionLabel),
          isSelected: race.slug === selectedRaceCard.slug
        };
      }

      return {
        ...race,
        profilePoints: cardCourse?.profilePoints ?? race.profilePoints,
        modeLabel: raceDraft ? getOrganizerRaceModeLabel(raceDraft.raceMode) : undefined,
        modeSummary: raceDraft ? getOrganizerRaceModeSummary(raceDraft) : undefined,
        editionLabel: runtimeEditionLabel,
        finishers: hasSimulatedEntries
          ? raceSimulationSnapshot?.checkpointLeaderboards.find((board) => board.checkpointId === "finish")?.totalOfficialScans ?? 0
          : hasPrototypeLiveEntries
            ? prototypeLiveSnapshot?.finished ?? 0
          : finisherCount,
        dnf: hasSimulatedEntries ? 0 : hasPrototypeLiveEntries ? prototypeLiveSnapshot?.dnf ?? 0 : dnfDnsCount,
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
        isLive: isOrganizerRaceLiveState(runtimeEditionLabel),
        isSelected: race.slug === selectedRaceCard.slug
      };
    });
  }, [
    prototypePublicLiveSnapshotBySlug,
    dnfDnsCount,
    finisherCount,
    liveSourceRace?.slug,
    overallLeaderboard.topEntries,
    selectedRaceCard.slug,
    spectatorSetup.races,
    spectatorSimulationSnapshots,
    visibleRaces
  ]);
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
  const showAccessNotice = organizerSessionActive && organizerWorkspaceView === "spectator";
  const organizerPublishedCount = organizerVisibleEvents.reduce(
    (count, event) => count + event.setup.races.filter((race) => race.isPublished).length,
    0
  );
  const organizerDraftCount = organizerVisibleEvents.reduce(
    (count, event) => count + event.setup.races.filter((race) => !race.isPublished).length,
    0
  );
  const organizerHasEvents = organizerVisibleEvents.length > 0;
  const organizerEventCount = organizerVisibleEvents.length;
  const organizerActivePublishedCount = organizerSetup.races.filter((race) => race.isPublished).length;
  const organizerActiveDraftCount = organizerSetup.races.filter((race) => !race.isPublished).length;
  const organizerActiveEventPhase = organizerActiveEvent ? deriveOrganizerEventPhase(organizerActiveEvent) : "draft";
  const organizerActiveEventPhaseLabel =
    organizerActiveEventPhase === "live" ? "Live" : organizerActiveEventPhase === "ready" ? "Ready" : "Draft";
  const organizerDraftStatusLabel = organizerDraftSavedAt
    ? `Draft saved ${new Date(organizerDraftSavedAt).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit"
      })}`
    : "Draft ready";
  const organizerHomeEvents =
    organizerHomeFilter === "active"
      ? organizerVisibleEvents
      : organizerHomeFilter === "archived"
        ? organizerArchivedEvents
        : organizerWorkspace.events;
  const publicEventCards = useMemo(
    () =>
      publicVisibleEvents.map((event) => {
        const publishedRaces = event.setup.races.filter((race) => race.isPublished);
        const prototypeLiveCount = publishedRaces.filter((race) => hasPrototypePublicLiveSignal(prototypePublicLiveSnapshotBySlug.get(race.slug))).length;
        const storedLiveCount = publishedRaces.filter((race) => isOrganizerRaceLiveState(race.editionLabel)).length;
        const liveCount = Math.max(storedLiveCount, prototypeLiveCount);
        const upcomingCount = Math.max(
          0,
          publishedRaces.filter((race) => isOrganizerRaceUpcomingState(race.editionLabel)).length - prototypeLiveCount
        );
        const finishedCount = publishedRaces.filter((race) => getOrganizerRaceStateTone(race.editionLabel) === "finished").length;
        const publicStatus = liveCount > 0 ? "live" : deriveOrganizerPublicEventStatus(event);
        const primaryRaceSlug =
          publishedRaces.find((race) => hasPrototypePublicLiveSignal(prototypePublicLiveSnapshotBySlug.get(race.slug)))?.slug ??
          publishedRaces.find((race) => isOrganizerRaceLiveState(race.editionLabel))?.slug ??
          publishedRaces[0]?.slug ??
          null;

        return {
          id: event.id,
          title: event.title,
          organizerName: event.setup.branding.organizerName || "Trailnesia Organizer",
          editionLabel: event.setup.branding.editionLabel,
          eventDateAt: event.setup.branding.eventDateAt,
          dateRibbon: event.setup.branding.dateRibbon,
          locationRibbon: event.setup.branding.locationRibbon,
          homeSubtitle: event.setup.branding.homeSubtitle,
          bannerTagline: event.setup.branding.bannerTagline,
          eventLogoDataUrl: event.setup.branding.eventLogoDataUrl,
          heroBackgroundImageDataUrl: event.setup.branding.heroBackgroundImageDataUrl,
          regionLabel: getPlatformRegionLabel(event.setup.branding.locationRibbon),
          countryCode: "ID",
          dateDetails: getPlatformEventDateDetails(event.setup.branding.eventDateAt),
          publishedRaceCount: publishedRaces.length,
          liveCount,
          upcomingCount,
          finishedCount,
          publicStatus,
          primaryRaceSlug
        };
      }),
    [prototypePublicLiveSnapshotBySlug, publicVisibleEvents]
  );
  const filteredPublicEventCards = useMemo(() => {
    const normalizedQuery = platformEventQuery.trim().toLowerCase();
    const statusWeight: Record<OrganizerPublicEventStatus, number> = { hidden: 3, live: 0, upcoming: 1, finished: 2 };

    return publicEventCards
      .filter((event) => {
        if (!normalizedQuery) {
          return true;
        }

        return [
          event.title,
          event.organizerName,
          event.locationRibbon,
          event.dateRibbon,
          event.bannerTagline,
          event.homeSubtitle
        ]
          .filter(Boolean)
          .some((value) => value.toLowerCase().includes(normalizedQuery));
      })
      .sort((left, right) => {
        const byStatus = statusWeight[left.publicStatus] - statusWeight[right.publicStatus];

        if (byStatus !== 0) {
          return byStatus;
        }

        return left.title.localeCompare(right.title);
      });
  }, [platformEventQuery, publicEventCards]);
  const livePlatformEvents = filteredPublicEventCards.filter((event) => event.publicStatus === "live");
  const upcomingPlatformEvents = filteredPublicEventCards.filter((event) => event.publicStatus === "upcoming");
  const finishedPlatformEvents = filteredPublicEventCards.filter((event) => event.publicStatus === "finished");
  const platformPublishedRaceCount = filteredPublicEventCards.reduce((sum, event) => sum + event.publishedRaceCount, 0);
  const platformHeroTickerEvents = filteredPublicEventCards.slice(0, 5);
  const organizerWizardBasicsReady = organizerWizardDraft.brandName.trim().length > 0 && organizerWizardDraft.eventDateAt.trim().length > 0;
  const organizerWizardBrandingReady = organizerWizardDraft.homeTitle.trim().length > 0 && organizerWizardDraft.locationRibbon.trim().length > 0;
  const organizerWizardModeReady =
    organizerWizardDraft.firstRaceMode === "loop-fixed-laps"
      ? Number.parseInt(organizerWizardDraft.firstRaceLoopTargetLaps, 10) > 0
      : organizerWizardDraft.firstRaceMode === "loop-fixed-time"
        ? Number.parseInt(organizerWizardDraft.firstRaceLoopTimeLimitHours, 10) > 0
        : organizerWizardDraft.firstRaceMode === "relay"
          ? Number.parseInt(organizerWizardDraft.firstRaceRelayLegCount, 10) > 1
          : true;
  const organizerWizardRaceReady =
    organizerWizardDraft.firstRaceTitle.trim().length > 0 &&
    Number.parseFloat(organizerWizardDraft.firstRaceDistanceKm) > 0 &&
    Number.parseFloat(organizerWizardDraft.firstRaceAscentM) >= 0 &&
    organizerWizardDraft.firstRaceStartAt.trim().length > 0 &&
    organizerWizardModeReady;
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
    if (supabase && !isLocalOrganizerAuth) {
      void supabase.auth.signOut();
    }

    clearLocalOrganizerSession();
    setIsLocalOrganizerAuth(false);
    setIsAuthenticated(false);
    setAccessToken(null);
    setProfile(null);
    setLoginError(null);
    setLoginPassword("");
    setIsLoginModalOpen(false);
    openPlatformHome();
  }

  function updateOrganizerWorkspaceEvent(eventId: string, updater: (event: OrganizerEventRecord) => OrganizerEventRecord) {
    setOrganizerWorkspace((current) => ({
      ...current,
      events: current.events.map((event) => (event.id === eventId ? updater(event) : event))
    }));
  }

  function setOrganizerActiveEvent(eventId: string) {
    setOrganizerWorkspace((current) => ({
      ...current,
      activeEventId: eventId
    }));
  }

  function updateActiveOrganizerSetup(updater: (setup: OrganizerSetupDraft) => OrganizerSetupDraft) {
    if (!organizerActiveEvent) {
      return;
    }

    updateOrganizerWorkspaceEvent(organizerActiveEvent.id, (event) => {
      const nextSetup = updater(event.setup);
      const normalizedSetup: OrganizerSetupDraft = {
        ...nextSetup,
        races: nextSetup.races.map((race) => normalizeOrganizerRaceGoLiveState(nextSetup.branding, race))
      };
      return {
        ...event,
        title: deriveOrganizerEventTitle(normalizedSetup),
        updatedAt: new Date().toISOString(),
        setup: normalizedSetup
      };
    });
  }

  function openOrganizerConsoleForTarget(target: OrganizerConsoleEntryTarget) {
    setOrganizerConsoleInitialView(target.view);
    setOrganizerConsoleNavigationKey((current) => current + 1);
    setOrganizerSetupRaceSlug(target.raceSlug);
    setSelectedRaceSlug(EDITION_HOME_VALUE);
    setRaceDetailView("race-page");
    setOrganizerWorkspaceView("console");
  }

  function createOrganizerWorkspaceEvent(
    setup: OrganizerSetupDraft,
    options?: { openConsole?: boolean; consoleTarget?: OrganizerConsoleEntryTarget }
  ) {
    const normalizedSetup: OrganizerSetupDraft = {
      ...setup,
      races: setup.races.map((race) => normalizeOrganizerRaceGoLiveState(setup.branding, race))
    };
    const consoleTarget =
      options?.consoleTarget ??
      resolveOrganizerConsoleEntryTarget(normalizedSetup, normalizedSetup.races[0]?.slug ?? null);
    const newEvent = createOrganizerEventRecord(normalizedSetup);
    setOrganizerWorkspace((current) => ({
      activeEventId: newEvent.id,
      events: [...current.events, newEvent]
    }));
    clearOrganizerImportDraft();
    setOrganizerWizardOpen(false);

    if (options?.openConsole === false) {
      setOrganizerSetupRaceSlug(consoleTarget.raceSlug || (normalizedSetup.races[0]?.slug ?? ""));
      setSelectedRaceSlug(EDITION_HOME_VALUE);
      setRaceDetailView("race-page");
      setOrganizerWorkspaceView("home");
      return;
    }

    openOrganizerConsoleForTarget(consoleTarget);
  }

  function duplicateOrganizerEvent(eventId: string) {
    const sourceEvent = organizerWorkspace.events.find((event) => event.id === eventId);

    if (!sourceEvent) {
      return;
    }

    const nextTitle = buildDuplicatedOrganizerEventTitle(
      sourceEvent.title,
      organizerWorkspace.events.map((event) => event.title)
    );

    const duplicatedSetup: OrganizerSetupDraft = {
      ...sourceEvent.setup,
      branding: {
        ...sourceEvent.setup.branding,
        brandName: nextTitle,
        homeTitle: nextTitle,
        editionLabel: sourceEvent.setup.branding.editionLabel
      },
      races: sourceEvent.setup.races.map((race) => ({
        ...race,
        isPublished: false,
        finishers: 0,
        dnf: 0,
        rankingPreview: [],
        participants: [],
        crewAssignments: [],
        simulatedScans: []
      }))
    };

    createOrganizerWorkspaceEvent(duplicatedSetup);
  }

  function archiveOrganizerEvent(eventId: string) {
    setOrganizerWorkspace((current) => {
      const nextEvents = current.events.map((event) =>
        event.id === eventId
          ? {
              ...event,
              archivedAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            }
          : event
      );
      const visibleEvents = nextEvents.filter((event) => !event.archivedAt);
      const activeEventId =
        current.activeEventId === eventId ? visibleEvents[0]?.id ?? null : current.activeEventId && visibleEvents.some((event) => event.id === current.activeEventId)
          ? current.activeEventId
          : visibleEvents[0]?.id ?? null;

      return {
        activeEventId,
        events: nextEvents
      };
    });

    setSelectedRaceSlug(EDITION_HOME_VALUE);
    setRaceDetailView("race-page");
    setOrganizerWorkspaceView("home");
  }

  function restoreOrganizerEvent(eventId: string) {
    setOrganizerWorkspace((current) => {
      const nextEvents = current.events.map((event) =>
        event.id === eventId
          ? {
              ...event,
              archivedAt: null,
              updatedAt: new Date().toISOString()
            }
          : event
      );
      const visibleEvents = nextEvents.filter((event) => !event.archivedAt);
      const activeEventId =
        current.activeEventId && visibleEvents.some((event) => event.id === current.activeEventId)
          ? current.activeEventId
          : visibleEvents.find((event) => event.id === eventId)?.id ?? visibleEvents[0]?.id ?? null;

      return {
        activeEventId,
        events: nextEvents
      };
    });
  }

  function openOrganizerHome() {
    setOrganizerWorkspaceView("home");
    setSelectedRaceSlug(EDITION_HOME_VALUE);
    setRaceDetailView("race-page");
  }

  function openPlatformHome() {
    setSelectedPublicEventId(null);
    setSelectedRaceSlug(EDITION_HOME_VALUE);
    setRaceDetailView("race-page");
    setOrganizerWorkspaceView("spectator");
    jumpToSection("platform-home");
  }

  function openPublicEvent(eventId: string, slug?: string) {
    const nextEvent = publicVisibleEvents.find((event) => event.id === eventId);

    if (!nextEvent) {
      return;
    }

    setSelectedPublicEventId(eventId);
    setSelectedRaceSlug(slug ?? EDITION_HOME_VALUE);
    setRaceDetailView("race-page");
    setOrganizerWorkspaceView("spectator");
    jumpToSection(slug ? "race-hub" : "edition-home");
  }

  function openActiveSpectatorPreview() {
    if (organizerActiveEvent && deriveOrganizerPublicEventStatus(organizerActiveEvent) !== "hidden") {
      openPublicEvent(organizerActiveEvent.id);
      return;
    }

    openPlatformHome();
  }

  function openOrganizerWizard() {
    setOrganizerWizardDraft(buildOrganizerWizardDraft());
    setOrganizerWizardStep("basics");
    setOrganizerWizardOpen(true);
    openOrganizerHome();
  }

  function closeOrganizerWizard() {
    setOrganizerWizardOpen(false);
    setOrganizerWizardStep("basics");
  }

  function updateOrganizerWizardDraft(patch: Partial<OrganizerWizardDraft>) {
    setOrganizerWizardDraft((current) => {
      const next = {
        ...current,
        ...patch
      };

      if ("eventDateAt" in patch) {
        next.eventDateAt = normalizeOrganizerDateTimeInputValue(patch.eventDateAt, current.eventDateAt);
        next.dateRibbon = formatOrganizerDateRibbon(next.eventDateAt);
      }

      if ("firstRaceStartAt" in patch) {
        next.firstRaceStartAt = normalizeOrganizerDateTimeInputValue(patch.firstRaceStartAt, current.firstRaceStartAt);
        next.firstRaceScheduleLabel = formatOrganizerScheduleLabel(next.firstRaceStartAt);
      }

      return next;
    });
  }

  function openOrganizerConsole() {
    if (!organizerActiveEvent) {
      openOrganizerWizard();
      return;
    }

    if (!organizerSetup.races.length) {
      openOrganizerWizard();
      return;
    }

    const target = resolveOrganizerConsoleEntryTarget(organizerSetup, organizerSetupRaceSlug);
    openOrganizerConsoleForTarget({
      ...target,
      raceSlug: target.raceSlug || organizerSetup.races[0]?.slug || ""
    });
  }

  function openOrganizerEvent(eventId: string) {
    const nextEvent = organizerVisibleEvents.find((event) => event.id === eventId);

    if (!nextEvent) {
      return;
    }

    const target = resolveOrganizerConsoleEntryTarget(nextEvent.setup, nextEvent.setup.races[0]?.slug ?? null);
    setOrganizerActiveEvent(eventId);
    clearOrganizerImportDraft();
    openOrganizerConsoleForTarget(target);
  }

  function saveOrganizerDraftNow() {
    if (!organizerActiveEvent) {
      return;
    }

    updateOrganizerWorkspaceEvent(organizerActiveEvent.id, (event) => ({
      ...event,
      updatedAt: new Date().toISOString()
    }));
    setOrganizerDraftSavedAt(new Date().toISOString());
  }

  function updateOrganizerBranding(patch: Partial<OrganizerBrandingDraft>) {
    const nextPatch = "eventDateAt" in patch
      ? {
          ...patch,
          eventDateAt: normalizeOrganizerDateTimeInputValue(patch.eventDateAt),
          dateRibbon: formatOrganizerDateRibbon(patch.eventDateAt)
        }
      : patch;

    updateActiveOrganizerSetup((current) => ({
      ...current,
      branding: {
        ...current.branding,
        ...nextPatch
      }
    }));
  }

  function updateOrganizerRace(slug: string, patch: Partial<OrganizerRaceDraft>) {
    const nextPatch = {
      ...patch
    };

    if ("startAt" in patch) {
      nextPatch.startAt = normalizeOrganizerDateTimeInputValue(patch.startAt);
      nextPatch.scheduleLabel = formatOrganizerScheduleLabel(nextPatch.startAt);
    }

    if ("editionLabel" in patch) {
      nextPatch.editionLabel = normalizeOrganizerRaceStateLabel(patch.editionLabel);
    }

    updateActiveOrganizerSetup((current) => ({
      ...current,
      races: current.races.map((race) => {
        if (race.slug !== slug) {
          return race;
        }

        const nextRace = {
          ...race,
          ...nextPatch
        };

        if (isOrganizerRaceLiveState(nextRace.editionLabel) && !isOrganizerRaceReadyForLive(current.branding, nextRace)) {
          nextRace.editionLabel = "Upcoming";
        }

        return nextRace;
      })
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

    updateActiveOrganizerSetup((current) => ({
      ...current,
      races: [...current.races, nextRace]
    }));
    setOrganizerSetupRaceSlug(nextRace.slug);
    setSelectedRaceSlug(nextRace.slug);
    setRaceDetailView("race-page");
  }

  function finalizeOrganizerWizard() {
    const brandName = organizerWizardDraft.brandName.trim() || "New Trail Event";
    const homeTitle = organizerWizardDraft.homeTitle.trim() || brandName;
    const brandParts = brandName.split(/\s+/).filter(Boolean);
    const slug = slugifyOrganizerValue(organizerWizardDraft.firstRaceTitle) || "custom-race-1";
    const distanceKm = Number.parseFloat(organizerWizardDraft.firstRaceDistanceKm) || 50;
    const ascentM = Number.parseFloat(organizerWizardDraft.firstRaceAscentM) || 2800;
    const raceMode = organizerWizardDraft.firstRaceMode;
    const loopTargetLaps = raceMode === "loop-fixed-laps" ? Number.parseInt(organizerWizardDraft.firstRaceLoopTargetLaps, 10) || null : null;
    const loopTimeLimitHours =
      raceMode === "loop-fixed-time" ? Number.parseInt(organizerWizardDraft.firstRaceLoopTimeLimitHours, 10) || null : null;
    const relayLegCount = raceMode === "relay" ? Number.parseInt(organizerWizardDraft.firstRaceRelayLegCount, 10) || null : null;
    const template = createOrganizerRaceTemplate(1);
    const course = getDemoCourseForRace({
      slug,
      title: organizerWizardDraft.firstRaceTitle || template.title,
      distanceKm,
      ascentM,
      startTown: organizerWizardDraft.firstRaceStartTown || template.startTown
    });
    const firstRace: OrganizerRaceDraft = {
      ...template,
      slug,
      title: organizerWizardDraft.firstRaceTitle.trim() || template.title,
      editionLabel: "Upcoming",
      raceMode,
      scheduleLabel: formatOrganizerScheduleLabel(organizerWizardDraft.firstRaceStartAt) || template.scheduleLabel,
      startAt: normalizeOrganizerDateTimeInputValue(organizerWizardDraft.firstRaceStartAt, template.startAt),
      startTown: organizerWizardDraft.firstRaceStartTown.trim() || template.startTown,
      distanceKm,
      ascentM,
      loopTargetLaps,
      loopTimeLimitHours,
      relayLegCount,
      courseDescription:
        raceMode === "loop-fixed-laps"
          ? `Describe ${(organizerWizardDraft.firstRaceTitle.trim() || template.title)} as a looping race with ${loopTargetLaps ?? "set target"} laps. Explain the lap terrain, turnaround flow, and how cut-offs are applied.`
          : raceMode === "loop-fixed-time"
            ? `Describe ${(organizerWizardDraft.firstRaceTitle.trim() || template.title)} as a most-loops-within-time challenge. Explain the lap terrain, timing rules, and how loop completion is validated before cut-off.`
            : raceMode === "relay"
              ? `Describe ${(organizerWizardDraft.firstRaceTitle.trim() || template.title)} as a relay race with ${relayLegCount ?? "set"} legs. Explain exchange checkpoints, team flow, and how each leg contributes to the final result.`
              : `Describe ${organizerWizardDraft.firstRaceTitle.trim() || template.title} for spectators. Include terrain, challenge profile, and what makes this category unique.`,
      descentM: course.descentM,
      waypoints: course.waypoints,
      profilePoints: course.profilePoints,
      checkpoints: course.checkpoints
    };

    const newSetup: OrganizerSetupDraft = {
      branding: {
        ...createDefaultOrganizerSetup().branding,
        organizerName: organizerWizardDraft.organizerName.trim() || "Trailnesia Organizer",
        brandName,
        brandStackTop: brandParts[0]?.toUpperCase() || "EVENT",
        brandStackBottom: brandParts.slice(1).join(" ").toUpperCase() || "RACE",
        editionLabel: organizerWizardDraft.editionLabel.trim() || "Edition 2026",
        homeTitle,
        homeSubtitle:
          organizerWizardDraft.homeSubtitle.trim() ||
          "Draft your first race category, publish it as Upcoming, then finish GPX, participants, and scan crews before going Live.",
        bannerTagline: organizerWizardDraft.bannerTagline.trim() || "Organizer edition hub",
        eventDateAt: normalizeOrganizerDateTimeInputValue(organizerWizardDraft.eventDateAt),
        dateRibbon: formatOrganizerDateRibbon(organizerWizardDraft.eventDateAt),
        locationRibbon: organizerWizardDraft.locationRibbon.trim() || "East Java",
        eventLogoDataUrl: null,
        heroBackgroundImageDataUrl: null,
        gpxFileName: null,
        gpxFileSize: null
      },
      races: [firstRace]
    };

    createOrganizerWorkspaceEvent(newSetup, {
      consoleTarget: {
        view: "races",
        raceSlug: firstRace.slug
      }
    });
    closeOrganizerWizard();
  }

  function handleCreateOrganizerFirstEvent() {
    openOrganizerWizard();
  }

  function removeOrganizerRace(slug: string) {
    if (organizerSetup.races.length <= 1) {
      return;
    }

    const remainingRaces = organizerSetup.races.filter((race) => race.slug !== slug);
    const fallbackSlug = remainingRaces[0]?.slug ?? EDITION_HOME_VALUE;

    updateActiveOrganizerSetup((current) => ({
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

    updateActiveOrganizerSetup((current) => ({
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

    updateActiveOrganizerSetup((current) => ({
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

    updateActiveOrganizerSetup((current) => ({
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

    updateActiveOrganizerSetup((current) => ({
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

    updateActiveOrganizerSetup((current) => ({
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

    updateActiveOrganizerSetup((current) => ({
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

    updateActiveOrganizerSetup((current) => ({
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

    updateActiveOrganizerSetup((current) => ({
      ...current,
      races: current.races.map((race) => {
        if (race.slug !== organizerSelectedRace.slug) {
          return race;
        }

        return appendOrganizerSimulatedScan(race, input);
      })
    }));
  }

  function clearOrganizerSimulatedScans() {
    if (!organizerSelectedRace) {
      return;
    }

    updateActiveOrganizerSetup((current) => ({
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

    updateActiveOrganizerSetup((current) => ({
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

  function resetOrganizerTrialData() {
    if (!organizerActiveEvent) {
      return;
    }

    updateOrganizerWorkspaceEvent(organizerActiveEvent.id, (event) => ({
      ...event,
      updatedAt: new Date().toISOString(),
      setup: {
        ...event.setup,
        races: event.setup.races.map((race) => ({
          ...race,
          simulatedScans: []
        }))
      }
    }));
  }

  function applyOrganizerImport() {
    if (!organizerSelectedRace) {
      return;
    }

    if (!organizerImportedParticipants.length) {
      return;
    }

    updateActiveOrganizerSetup((current) => ({
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

    const normalizedLogin = loginEmail.trim().toLowerCase();

    if (normalizedLogin === LOCAL_ORGANIZER_USERNAME && loginPassword === LOCAL_ORGANIZER_PASSWORD) {
      persistLocalOrganizerSession();
      setProfile(buildLocalOrganizerProfile());
      setIsAuthenticated(true);
      setAccessToken(null);
      setIsLocalOrganizerAuth(true);
      setLoginError(null);
      setLoginPassword("");
      setIsLoginModalOpen(false);
      setOrganizerWorkspaceView("home");
      return;
    }

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
    setOrganizerWorkspaceView("home");
  }

  function jumpToSection(sectionId?: string) {
    if (!sectionId) {
      return;
    }

    window.setTimeout(() => {
      const target = document.getElementById(sectionId);

      if (!target) {
        return;
      }

      if (showPlatformHome) {
        const platformScrollContainer = document.querySelector(".live-trail-shell.platform-home-mode") as HTMLElement | null;

        if (platformScrollContainer) {
          const containerBounds = platformScrollContainer.getBoundingClientRect();
          const targetBounds = target.getBoundingClientRect();
          const top = targetBounds.top - containerBounds.top + platformScrollContainer.scrollTop - 18;

          platformScrollContainer.scrollTo({
            behavior: "smooth",
            top: Math.max(0, top)
          });
          return;
        }
      }

      const top = target.getBoundingClientRect().top + window.scrollY - 12;

      window.scrollTo({
        behavior: "smooth",
        top: Math.max(0, top)
      });
    }, 80);
  }

  function openRaceView(slug: string, sectionId?: string) {
    if (!spectatorEvent) {
      return;
    }

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
    if (!spectatorEvent) {
      return;
    }

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
    if (showPlatformHome) {
      jumpToSection("platform-home");
      return;
    }

    if (isEditionHome) {
      openPlatformHome();
      return;
    }

    if (!spectatorEvent) {
      openPlatformHome();
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
    if (!spectatorEvent) {
      openPlatformHome();
      return;
    }

    setRaceDetailView("race-page");
    jumpToSection("race-hub");
  }

  if (isOrganizerWorkspaceOpen) {
    return (
      <OrganizerPrototypeApp
        initialPath={organizerWizardOpen ? "/events/new" : "/"}
        onLogout={handleLogout}
        user={{
          id: 1,
          username: (profile?.email ?? "admin").split("@")[0] ?? "admin",
          name: profile?.displayName ?? profile?.email ?? profile?.role ?? "Organizer",
          role: profile?.role ?? "organizer",
          workspaceOwnerId: profile?.userId ?? "local-admin",
          isLocalAuth: isLocalOrganizerAuth
        }}
      />
    );
  }

  return (
    <main
      className={`dashboard-shell dashboard-hub-shell live-trail-shell ${showPlatformHome ? "platform-home-mode" : isOrganizerWorkspaceOpen ? "organizer-page-mode" : isEditionHome ? "edition-home-mode" : "race-detail-mode"} ${showSidebarRail ? "with-sidebar-rail" : "no-sidebar-rail"}`}
    >
      {!showPlatformHome && !isOrganizerWorkspaceOpen ? (
      <header className="topbar topbar-hub live-topbar">
        <div className="topbar-left-cluster">
          <div className="topbar-race-lockup">
            <div
              aria-label="Event logo placeholder"
              className={`event-logo-placeholder ${activeFestivalSetup.branding.eventLogoDataUrl ? "has-uploaded-logo" : ""}`}
              role="img"
            >
              {activeFestivalSetup.branding.eventLogoDataUrl ? (
                <img alt="Event logo" src={activeFestivalSetup.branding.eventLogoDataUrl} />
              ) : (
                <span>Event Logo</span>
              )}
            </div>
          </div>

          {!showPlatformHome && !isOrganizerHomeOpen && !isOrganizerConsoleOpen ? (
            <div className="topbar-center">
              <div className="topbar-edition-chip" aria-label={`Current edition ${festivalData.editionLabel}`}>
                <span className="topbar-edition-chip-accent" aria-hidden="true" />
                <span className="topbar-edition-chip-label">{festivalData.editionLabel}</span>
              </div>

              <div className="topbar-menu-shell" ref={topbarMenuRef}>
                <button
                  aria-expanded={isTopbarMenuOpen}
                  aria-haspopup="menu"
                  className={`topbar-menu-button ${isTopbarMenuOpen ? "open" : ""}`}
                  onClick={() => setIsTopbarMenuOpen((current) => !current)}
                  type="button"
                >
                  <span className="topbar-menu-accent" aria-hidden="true" />
                  <span className="topbar-menu-label">{raceMenuLabel}</span>
                  <span className="topbar-menu-chevron" aria-hidden="true">
                    ^
                  </span>
                </button>

                {isTopbarMenuOpen ? (
                  <div className="topbar-menu-panel" role="menu">
                    <button
                      className={`topbar-menu-item ${isEditionHome ? "active" : ""}`}
                      onClick={() => handleRaceSelection(EDITION_HOME_VALUE)}
                      role="menuitem"
                      type="button"
                    >
                      <span className="topbar-menu-item-accent home" aria-hidden="true" />
                      <span className="topbar-menu-item-copy">
                        <strong>Home</strong>
                        <small>{festivalData.editionLabel}</small>
                      </span>
                    </button>
                    {visibleRaces.map((race) => (
                      <button
                        className={`topbar-menu-item ${selectedRaceSlug === race.slug ? "active" : ""}`}
                        key={`topbar-menu-${race.slug}`}
                        onClick={() => handleRaceSelection(race.slug)}
                        role="menuitem"
                        type="button"
                      >
                        <span
                          className="topbar-menu-item-accent"
                          aria-hidden="true"
                          style={{ background: race.accent }}
                        />
                        <span className="topbar-menu-item-copy">
                          <strong>{race.title}</strong>
                          <small>{race.editionLabel}</small>
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        <div className="topbar-spacer" />

        <div className="topbar-actions live-topbar-actions">
          {organizerSessionActive ? (
            <button
              className={`topbar-login-link ${isOrganizerHomeOpen || isOrganizerConsoleOpen ? "topbar-login-link-active" : ""}`}
              onClick={() => {
                if (isOrganizerHomeOpen || isOrganizerConsoleOpen) {
                  openActiveSpectatorPreview();
                  return;
                }

                openOrganizerHome();
              }}
              type="button"
            >
              {isOrganizerHomeOpen ? "Spectator View" : "Organizer Home"}
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
      ) : null}

      {!showPlatformHome && !isOrganizerWorkspaceOpen && showAccessNotice ? <div className={`notice-banner ${organizerSessionActive ? "success" : "info"}`}>{accessNotice}</div> : null}

      {showEditionHome ? (
        <div className="live-shell-banner">
          <EditionHeroBanner
            bannerTagline={festivalData.bannerTagline}
            brandStack={festivalData.brandStack}
            className="live-shell-edition-banner"
            dateRibbon={festivalData.dateRibbon}
            editionLabel={festivalData.editionLabel}
            backgroundImageUrl={activeFestivalSetup.branding.heroBackgroundImageDataUrl}
            homeSubtitle={festivalData.homeSubtitle}
            locationRibbon={festivalData.locationRibbon}
          />
        </div>
      ) : null}

      <div
        className={`live-shell-body ${showPlatformHome ? "platform-home-body" : showSidebarRail ? "with-sidebar-rail" : "no-sidebar-rail"} ${
          showEditionHome ? "edition-home-body" : isOrganizerWorkspaceOpen ? "organizer-page-body" : "race-detail-body"
        }`}
      >
        {!showPlatformHome && !isOrganizerWorkspaceOpen ? (
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
        ) : null}

      <div className={`dashboard-main dashboard-main-scroll live-main ${showPlatformHome ? "platform-home-main" : isOrganizerWorkspaceOpen ? "organizer-page-main" : ""}`}>
        {showPlatformHome ? (
          <section className="platform-home-shell" id="platform-home">
            <div className="platform-home-hero-shell">
              <img alt="" className="platform-home-hero-image" src={platformHomeHeroPhoto} />
              <div className="platform-home-hero-overlay" />

              <div className="platform-home-topline">
                {platformHeroTickerEvents.length ? (
                  platformHeroTickerEvents.map((event) => (
                    <button className="platform-home-topline-pill" key={`platform-topline-${event.id}`} onClick={() => openPublicEvent(event.id)} type="button">
                      <span className={`platform-home-topline-dot status-${event.publicStatus}`} aria-hidden="true" />
                      <span>{event.title}</span>
                    </button>
                  ))
                ) : isPrototypePublicFeedLoading ? (
                  <span className="platform-home-loading-inline" aria-live="polite">
                    <span className="soft-spinner soft-spinner-sm" aria-hidden="true" />
                    <span>Loading public events...</span>
                  </span>
                ) : (
                  <span className="platform-home-topline-copy">Public events will appear here as soon as organizers publish their races.</span>
                )}
              </div>

              <div className="platform-home-commandbar">
                <div className="platform-home-commandbrand">
                  <img alt="Trailnesia" src={trailnesiaLogo} />
                </div>
                <div className="platform-home-commandcenter">
                  <div className="platform-home-commandnav" role="navigation" aria-label="Platform home sections">
                    <button className="platform-home-commandlink active" onClick={() => jumpToSection("platform-home")} type="button">
                      Home
                    </button>
                    <button className="platform-home-commandlink" onClick={() => jumpToSection("platform-home-events")} type="button">
                      Events
                    </button>
                    <button className="platform-home-commandlink" onClick={() => jumpToSection("platform-home-contact")} type="button">
                      Contact
                    </button>
                  </div>
                </div>
                {organizerSessionActive ? (
                  <button className="platform-home-action-pill" onClick={openOrganizerHome} type="button">
                    Organizer
                  </button>
                ) : (
                  <button
                    className="platform-home-action-pill"
                    onClick={() => {
                      setLoginError(null);
                      setIsLoginModalOpen(true);
                    }}
                    type="button"
                  >
                    Login
                  </button>
                )}
              </div>

              <div className="platform-home-hero">
                <div className="platform-home-hero-copy">
                  <span className="detail-label">Welcome!</span>
                  <h2>Follow your favorite race in Indonesia</h2>
                  <p>Discover live, upcoming, and finished events from organizers across the platform, then open each event hub to follow race categories, rankings, and live updates.</p>
                  <div className="platform-home-search">
                    <input
                      aria-label="Search public events"
                      onChange={(event) => setPlatformEventQuery(event.target.value)}
                      placeholder="Find an event, an organizer, a location..."
                      type="search"
                      value={platformEventQuery}
                    />
                    <button className="platform-home-search-button" type="button">
                      Search
                    </button>
                  </div>
                  <div className="platform-home-kpis">
                    <span>{filteredPublicEventCards.length} public events</span>
                    <span>{platformPublishedRaceCount} published races</span>
                    <span>{livePlatformEvents.length} live now</span>
                    <span>{upcomingPlatformEvents.length} upcoming</span>
                  </div>
                </div>
              </div>
            </div>

            {!publicEventCards.length ? (
              <article className="platform-home-empty">
                {isPrototypePublicFeedLoading ? (
                  <div className="platform-home-empty-loading" aria-live="polite">
                    <span className="soft-spinner" aria-hidden="true" />
                    <div>
                      <span className="detail-label">Loading public events</span>
                      <h3>Checking the latest published races.</h3>
                      <p>The platform is warming up the latest organizer feed.</p>
                    </div>
                  </div>
                ) : (
                  <>
                    <span className="detail-label">No public events yet</span>
                    <h3>Published events will appear here.</h3>
                    <p>Once an organizer publishes at least one race category, the event will show up on the platform home.</p>
                  </>
                )}
              </article>
            ) : (
              <>
                <section className="platform-home-section" id="platform-home-events">
                  <div className="platform-home-section-head platform-home-section-head-centered">
                    <div>
                      <span className="detail-label">Next events</span>
                      <h3>Find your next challenge</h3>
                    </div>
                    <p>
                      {platformEventQuery.trim()
                        ? `${filteredPublicEventCards.length} event results for "${platformEventQuery.trim()}".`
                        : "Published Trailnesia events presented in a faster, more scannable directory inspired by LiveTrail."}
                    </p>
                  </div>

                  {filteredPublicEventCards.length ? (
                    <div className="platform-event-directory" role="list" aria-label="Public events">
                      {filteredPublicEventCards.map((event) => (
                        <button
                          className={`platform-event-directory-card status-${event.publicStatus}`}
                          key={event.id}
                          onClick={() => openPublicEvent(event.id)}
                          role="listitem"
                          type="button"
                        >
                          <div className="platform-event-directory-poster">
                            {event.heroBackgroundImageDataUrl ? <img alt="" src={event.heroBackgroundImageDataUrl} /> : null}
                            <div className="platform-event-directory-scrim" />
                            <div className="platform-event-directory-topline">
                              <span className={`organizer-status-pill ${event.publicStatus}`}>
                                {event.publicStatus === "live" ? "Live" : event.publicStatus === "upcoming" ? "Upcoming" : "Finished"}
                              </span>
                              <span className="platform-event-country-pill">{event.countryCode}</span>
                            </div>
                            <div className="platform-event-date-block" aria-label={`Event date ${event.dateDetails.full}`}>
                              <strong>{event.dateDetails.day}</strong>
                              <span>{event.dateDetails.month}</span>
                              <small>{event.dateDetails.year}</small>
                            </div>
                          </div>
                          <div className="platform-event-directory-body">
                            <div className="platform-event-directory-kicker">
                              <span className="platform-event-region-pill">{event.regionLabel}</span>
                            </div>
                            <div className="platform-event-directory-head">
                              {event.eventLogoDataUrl ? (
                                <span className="platform-event-logo">
                                  <img alt="" src={event.eventLogoDataUrl} />
                                </span>
                              ) : null}
                              <div>
                                <strong>{event.title}</strong>
                                <p>{event.bannerTagline || event.homeSubtitle}</p>
                              </div>
                            </div>
                            <div className="platform-event-directory-meta">
                              <span>{event.locationRibbon}</span>
                              <span>{event.dateDetails.full}</span>
                            </div>
                            <div className="platform-event-directory-stats">
                              <span>{event.publishedRaceCount} races</span>
                              {event.liveCount ? <span>{event.liveCount} live</span> : null}
                              {!event.liveCount && event.upcomingCount ? <span>{event.upcomingCount} upcoming</span> : null}
                              {!event.liveCount && !event.upcomingCount && event.finishedCount ? <span>{event.finishedCount} finished</span> : null}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <article className="platform-home-empty">
                      <span className="detail-label">No matching events</span>
                      <h3>Try a broader search.</h3>
                      <p>We could not find any published events that match your current search.</p>
                    </article>
                  )}
                </section>

                <section className="platform-home-section platform-home-contact-section" id="platform-home-contact">
                  <div className="platform-home-section-head">
                    <div>
                      <span className="detail-label">Contact</span>
                      <h3>Need help bringing your trail event live?</h3>
                    </div>
                    <p>Trailnesia helps organizers launch public event hubs, scanner crews, and race-day live tracking with one structured workflow.</p>
                  </div>

                  <article className="platform-home-contact-card">
                    <div className="platform-home-contact-copy">
                      <strong>Organizer onboarding and platform support</strong>
                      <p>Use the organizer login if your account is ready, or contact the Trailnesia team for onboarding, publishing, and race-day setup assistance.</p>
                    </div>
                    <div className="platform-home-contact-actions">
                      {organizerSessionActive ? (
                        <button className="auth-trigger" onClick={openOrganizerHome} type="button">
                          Open organizer
                        </button>
                      ) : (
                        <button
                          className="auth-trigger"
                          onClick={() => {
                            setLoginError(null);
                            setIsLoginModalOpen(true);
                          }}
                          type="button"
                        >
                          Login
                        </button>
                      )}
                      <button className="secondary-action" onClick={() => jumpToSection("platform-home")} type="button">
                        Back to top
                      </button>
                    </div>
                  </article>
                </section>
              </>
            )}
          </section>
                ) : showEditionHome ? (
          <>
            <RaceEditionHome
              bannerTagline={festivalData.bannerTagline}
              brandStack={festivalData.brandStack}
              cards={raceHomeCards}
              dateRibbon={festivalData.dateRibbon}
              editionLabel={festivalData.editionLabel}
              heroBackgroundImageUrl={activeFestivalSetup.branding.heroBackgroundImageDataUrl}
              homeSubtitle={festivalData.homeSubtitle}
              homeTitle={festivalData.homeTitle}
              locationRibbon={festivalData.locationRibbon}
              onOpenRace={(slug) => openRaceView(slug, "race-hub")}
              showHeroBanner={false}
              showHomeHeader={false}
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
            {selectedOrganizerRace ? (
              <p className="race-mode-summary">
                <strong>{getOrganizerRaceModeLabel(selectedOrganizerRace.raceMode)}</strong> | {getOrganizerRaceModeSummary(selectedOrganizerRace)}
              </p>
            ) : null}
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

      <section className="panel menu-feature-panel race-upcoming-panel" hidden={raceDetailView !== "race-page" || !isActiveRaceUpcoming} id="race-upcoming">
        <div className="panel-head compact">
          <div>
            <p className="section-label">Follow the race</p>
            <h3>Race upcoming</h3>
          </div>
          <div className="panel-badge compact-badge">
            <span>Status</span>
            <strong>Upcoming</strong>
            <span>{selectedRaceCard.scheduleLabel}</span>
          </div>
        </div>

        <div className="empty-compact">
          Live tracking and ranking will appear here after the race starts. For now, spectators can review the course, checkpoints, and event details.
        </div>
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

      <section className="panel menu-feature-panel race-leaders-panel" hidden={raceDetailView !== "race-page" || !isActiveRaceFinished} id="race-ranking-preview">
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
                        isOrganizerRaceLiveState(visibleRaces.find((race) => race.slug === entry.raceSlug)?.editionLabel)
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
              <span>Trial shortcut: username `admin`, password `admin`.</span>
            </div>

            <form className="auth-modal-form" onSubmit={handleLogin}>
              <label>
                Username
                <input
                  autoComplete="username"
                  placeholder="admin or admin1@arm.local"
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

      {!showPlatformHome && showSidebarRail ? (
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
      </div>
    </main>
  );
}



