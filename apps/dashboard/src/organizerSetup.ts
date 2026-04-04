import { demoRaceFestival, type DemoRaceCard } from "./demoRaceFestival";
import { getDemoCourseForRace, type DemoCourse, type DemoCourseCheckpoint } from "./demoCourseVariants";

export const ORGANIZER_SETUP_STORAGE_KEY = "trailnesia:organizer-setup";
export const ORGANIZER_WORKSPACE_STORAGE_KEY = "trailnesia:organizer-workspace";
const ORGANIZER_CLEAN_START_KEY = "trailnesia:organizer-clean-start-v1";

export type OrganizerBrandingDraft = {
  organizerName: string;
  brandStackTop: string;
  brandStackBottom: string;
  brandName: string;
  editionLabel: string;
  bannerTagline: string;
  homeTitle: string;
  homeSubtitle: string;
  eventDateAt: string;
  dateRibbon: string;
  locationRibbon: string;
  eventLogoDataUrl: string | null;
  heroBackgroundImageDataUrl: string | null;
  gpxFileName: string | null;
  gpxFileSize: number | null;
};

export type OrganizerRaceMode = "standard" | "loop-fixed-laps" | "loop-fixed-time" | "relay";
export type OrganizerRaceState = "Upcoming" | "Live" | "Finished";

export type OrganizerRaceDraft = {
  slug: string;
  title: string;
  isPublished: boolean;
  editionLabel: string;
  raceMode: OrganizerRaceMode;
  scheduleLabel: string;
  startAt: string;
  startTown: string;
  courseDescription: string;
  courseHighlights: string[];
  distanceKm: number;
  ascentM: number;
  loopTargetLaps: number | null;
  loopTimeLimitHours: number | null;
  relayLegCount: number | null;
  finishers: number;
  dnf: number;
  accent: string;
  accentSoft: string;
  profileSeed: number;
  rankingPreview: DemoRaceCard["rankingPreview"];
  descentM: number;
  waypoints: DemoCourse["waypoints"];
  profilePoints: DemoCourse["profilePoints"];
  gpxFileName: string | null;
  gpxFileSize: number | null;
  checkpoints: DemoCourseCheckpoint[];
  participants: OrganizerParticipantDraft[];
  crewAssignments: OrganizerCrewAssignmentDraft[];
  simulatedScans: OrganizerSimulatedScanDraft[];
};

export type OrganizerSetupDraft = {
  branding: OrganizerBrandingDraft;
  races: OrganizerRaceDraft[];
};

export type OrganizerEventRecord = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  setup: OrganizerSetupDraft;
};

export type OrganizerWorkspaceStore = {
  activeEventId: string | null;
  events: OrganizerEventRecord[];
};

export type OrganizerParticipantDraft = {
  bib: string;
  name: string;
  gender: "men" | "women";
  countryCode: string;
  club: string;
};

export type OrganizerCrewAssignmentDraft = {
  id: string;
  name: string;
  email: string;
  role: "scan";
  checkpointId: string;
  deviceLabel: string;
  status: "invited" | "accepted" | "active" | "standby";
  inviteCode: string;
};

export type OrganizerSimulatedScanDraft = {
  id: string;
  bib: string;
  checkpointId: string;
  crewAssignmentId: string;
  deviceId: string;
  scannedAt: string;
  status: "accepted" | "duplicate";
  firstAcceptedId: string | null;
};

export type ParticipantImportPreview = {
  columns: string[];
  previewColumns: string[];
  rows: string[][];
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateBibs: number;
  sampleErrors: string[];
};

export type OrganizerParticipantImportMode = "merge" | "add" | "update" | "replace";
export type OrganizerParsedGpxRoute = Pick<OrganizerRaceDraft, "distanceKm" | "ascentM" | "descentM" | "waypoints" | "profilePoints">;

const PARTICIPANT_TEMPLATE_HEADERS = ["bib", "name", "gender", "country", "club"];
const PARTICIPANT_TEMPLATE_SAMPLE_ROWS = [
  ["", "", "", "", ""],
  ["", "", "", "", ""]
];
const DEFAULT_ORGANIZER_EVENT_DATETIME = "2026-07-05T05:00";
const DEFAULT_ORGANIZER_RACE_DATETIME = "2026-07-05T05:00";

function padDateTimePart(value: number) {
  return String(value).padStart(2, "0");
}

function toLocalDateTimeInputValue(date: Date) {
  return `${date.getFullYear()}-${padDateTimePart(date.getMonth() + 1)}-${padDateTimePart(date.getDate())}T${padDateTimePart(date.getHours())}:${padDateTimePart(date.getMinutes())}`;
}

export function normalizeOrganizerDateTimeInputValue(value?: string | null, fallback = DEFAULT_ORGANIZER_RACE_DATETIME) {
  const normalized = String(value ?? "").trim();

  if (!normalized) {
    return fallback;
  }

  const parsed = new Date(normalized);

  if (Number.isNaN(parsed.getTime())) {
    return fallback;
  }

  return toLocalDateTimeInputValue(parsed);
}

export function formatOrganizerDateRibbon(value?: string | null) {
  const normalized = String(value ?? "").trim();

  if (!normalized) {
    return "Set event date";
  }

  const parsed = new Date(normalized);

  if (Number.isNaN(parsed.getTime())) {
    return "Set event date";
  }

  return parsed.toLocaleString([], {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function formatOrganizerScheduleLabel(value?: string | null) {
  const normalized = String(value ?? "").trim();

  if (!normalized) {
    return "Set start time";
  }

  const parsed = new Date(normalized);

  if (Number.isNaN(parsed.getTime())) {
    return "Set start time";
  }

  return parsed.toLocaleString([], {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function normalizeOrganizerRaceStateLabel(value?: string | null): OrganizerRaceState {
  const normalized = String(value ?? "").trim().toLowerCase();

  if (normalized === "finished") {
    return "Finished";
  }

  if (normalized === "upcoming") {
    return "Upcoming";
  }

  if (normalized === "live") {
    return "Live";
  }

  return "Upcoming";
}

export function isOrganizerRaceLiveState(value?: string | null) {
  return normalizeOrganizerRaceStateLabel(value) === "Live";
}

export function isOrganizerRaceFinishedState(value?: string | null) {
  return normalizeOrganizerRaceStateLabel(value) === "Finished";
}

export function isOrganizerRaceUpcomingState(value?: string | null) {
  return normalizeOrganizerRaceStateLabel(value) === "Upcoming";
}

export function getOrganizerRaceStateTone(value?: string | null) {
  const normalized = normalizeOrganizerRaceStateLabel(value);

  if (normalized === "Finished") {
    return "finished";
  }

  if (normalized === "Upcoming") {
    return "upcoming";
  }

  return "live";
}

export function createParticipantImportTemplateCsv() {
  return [PARTICIPANT_TEMPLATE_HEADERS.join(","), ...PARTICIPANT_TEMPLATE_SAMPLE_ROWS.map((row) => row.join(","))].join("\n");
}

async function loadXlsx() {
  return import("xlsx");
}

export async function createParticipantImportTemplateWorkbook() {
  const XLSX = await loadXlsx();
  const worksheet = XLSX.utils.aoa_to_sheet([PARTICIPANT_TEMPLATE_HEADERS, ...PARTICIPANT_TEMPLATE_SAMPLE_ROWS]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Participants");
  return workbook;
}

export async function parseParticipantImportFile(file: File) {
  const lowerName = file.name.toLowerCase();

  if (lowerName.endsWith(".csv") || lowerName.endsWith(".tsv") || lowerName.endsWith(".txt")) {
    const text = await file.text();
    return {
      text,
      fileName: file.name
    };
  }

  if (lowerName.endsWith(".xlsx") || lowerName.endsWith(".xls")) {
    const XLSX = await loadXlsx();
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const firstSheetName = workbook.SheetNames[0];
    const firstSheet = firstSheetName ? workbook.Sheets[firstSheetName] : null;

    if (!firstSheet) {
      return null;
    }

    const text = XLSX.utils.sheet_to_csv(firstSheet);
    return {
      text,
      fileName: file.name
    };
  }

  return null;
}

export function createOrganizerInviteCode(raceSlug: string, seed = Date.now()) {
  const slugToken = raceSlug
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .split("-")
    .filter(Boolean)
    .slice(0, 3)
    .map((part) => part.slice(0, 3).toUpperCase())
    .join("");
  const serial = Math.abs(seed).toString(36).toUpperCase().slice(-5).padStart(5, "0");

  return `${slugToken || "CREW"}-${serial}`;
}

export function deriveOrganizerEventTitle(setup: OrganizerSetupDraft) {
  return setup.branding.homeTitle.trim() || setup.branding.brandName.trim() || setup.races[0]?.title || "Untitled event";
}

export function createOrganizerEventRecord(setup: OrganizerSetupDraft, seed = Date.now()): OrganizerEventRecord {
  const timestamp = new Date(seed).toISOString();
  return {
    id: `org-event-${seed.toString(36)}`,
    title: deriveOrganizerEventTitle(setup),
    createdAt: timestamp,
    updatedAt: timestamp,
    archivedAt: null,
    setup
  };
}

function normalizeOrganizerCrewAssignment(
  raceSlug: string,
  crew: Partial<OrganizerCrewAssignmentDraft>,
  index: number
): OrganizerCrewAssignmentDraft {
  return {
    id: crew.id || `${raceSlug}-crew-${index + 1}`,
    name: crew.name || `Crew ${index + 1}`,
    email: crew.email || "",
    role: "scan",
    checkpointId: crew.checkpointId || "cp-start",
    deviceLabel: crew.deviceLabel || "",
    status: crew.status ?? "invited",
    inviteCode: crew.inviteCode || createOrganizerInviteCode(raceSlug, index + 1)
  };
}

function normalizeRaceMode(value?: string | null): OrganizerRaceMode {
  if (value === "loop-fixed-laps" || value === "loop-fixed-time" || value === "relay") {
    return value;
  }

  return "standard";
}

function normalizePositiveWholeNumber(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function normalizeOrganizerSimulatedScan(
  raceSlug: string,
  scan: Partial<OrganizerSimulatedScanDraft>,
  index: number
): OrganizerSimulatedScanDraft {
  return {
    id: scan.id || `${raceSlug}-scan-${index + 1}`,
    bib: String(scan.bib || "").trim().toUpperCase(),
    checkpointId: scan.checkpointId || "cp-start",
    crewAssignmentId: scan.crewAssignmentId || `${raceSlug}-crew-${index + 1}`,
    deviceId: scan.deviceId || "sim-device",
    scannedAt: scan.scannedAt || new Date().toISOString(),
    status: scan.status === "duplicate" ? "duplicate" : "accepted",
    firstAcceptedId: scan.firstAcceptedId ?? null
  };
}

export function createOrganizerRaceDraftFromCard(race: DemoRaceCard): OrganizerRaceDraft {
  const course = getDemoCourseForRace(race);
  return {
    slug: race.slug,
    title: race.title,
    isPublished: true,
    editionLabel: normalizeOrganizerRaceStateLabel(race.editionLabel),
    raceMode: "standard",
    scheduleLabel: race.scheduleLabel || formatOrganizerScheduleLabel(race.startAt),
    startAt: normalizeOrganizerDateTimeInputValue(race.startAt),
    startTown: race.startTown,
    courseDescription: race.courseDescription,
    courseHighlights: race.courseHighlights,
    distanceKm: race.distanceKm,
    ascentM: race.ascentM,
    loopTargetLaps: null,
    loopTimeLimitHours: null,
    relayLegCount: null,
    finishers: race.finishers,
    dnf: race.dnf,
    accent: race.accent,
    accentSoft: race.accentSoft,
    profileSeed: race.profileSeed,
    rankingPreview: race.rankingPreview,
    descentM: course.descentM,
    waypoints: course.waypoints,
    profilePoints: course.profilePoints,
    gpxFileName: null,
    gpxFileSize: null,
    checkpoints: course.checkpoints,
    participants: [],
    crewAssignments: [
      {
        id: `${race.slug}-crew-start`,
        name: "Crew Start",
        email: `start.${race.slug}@trailnesia.local`,
        role: "scan",
        checkpointId: "cp-start",
        deviceLabel: "Android Start",
        status: "active",
        inviteCode: createOrganizerInviteCode(race.slug, 101)
      },
      {
        id: `${race.slug}-crew-finish`,
        name: "Crew Finish",
        email: `finish.${race.slug}@trailnesia.local`,
        role: "scan",
        checkpointId: "finish",
        deviceLabel: "iPad Finish",
        status: "accepted",
        inviteCode: createOrganizerInviteCode(race.slug, 202)
      }
    ],
    simulatedScans: []
  };
}

export function createOrganizerRaceTemplate(index: number): OrganizerRaceDraft {
  const slug = `custom-race-${index}`;
  const course = getDemoCourseForRace({
    slug,
    title: `Custom Race ${index}`,
    distanceKm: 25,
    ascentM: 1400,
    startTown: "Start Town"
  });
  return {
    slug,
    title: `Custom Race ${index}`,
    isPublished: false,
    editionLabel: "Upcoming",
    raceMode: "standard",
    scheduleLabel: formatOrganizerScheduleLabel(DEFAULT_ORGANIZER_RACE_DATETIME),
    startAt: DEFAULT_ORGANIZER_RACE_DATETIME,
    startTown: "Start Town",
    courseDescription: "Describe this course for spectators. Include terrain, challenge profile, and what makes this category unique.",
    courseHighlights: ["Signature climb", "Technical descent", "Scenic finish"],
    distanceKm: 25,
    ascentM: 1400,
    loopTargetLaps: null,
    loopTimeLimitHours: null,
    relayLegCount: null,
    finishers: 0,
    dnf: 0,
    accent: "#d6a341",
    accentSoft: "rgba(214, 163, 65, 0.18)",
    profileSeed: index + 10,
    rankingPreview: [],
    descentM: course.descentM,
    waypoints: course.waypoints,
    profilePoints: course.profilePoints,
    gpxFileName: null,
    gpxFileSize: null,
    checkpoints: course.checkpoints,
    participants: [],
    crewAssignments: [],
    simulatedScans: []
  };
}

export function createEmptyOrganizerSetup(): OrganizerSetupDraft {
  const eventDateAt = DEFAULT_ORGANIZER_EVENT_DATETIME;
  return {
    branding: {
      organizerName: "Trailnesia Organizer",
      brandStackTop: "TRAIL",
      brandStackBottom: "NESIA",
      brandName: "Trailnesia",
      editionLabel: "Edition draft",
      bannerTagline: "Organizer edition hub",
      homeTitle: "Race Categories",
      homeSubtitle: "No published race categories yet. Add race categories and publish them when they are ready.",
      eventDateAt,
      dateRibbon: formatOrganizerDateRibbon(eventDateAt),
      locationRibbon: "Set event location",
      eventLogoDataUrl: null,
      heroBackgroundImageDataUrl: null,
      gpxFileName: null,
      gpxFileSize: null
    },
    races: []
  };
}

export function createDemoOrganizerSetup(): OrganizerSetupDraft {
  return {
    branding: {
      ...createEmptyOrganizerSetup().branding
    },
    races: demoRaceFestival.races.map((race) => createOrganizerRaceDraftFromCard(race))
  };
}

export function createDefaultOrganizerSetup(): OrganizerSetupDraft {
  return createEmptyOrganizerSetup();
}

function normalizeOrganizerSetupDraft(parsed?: Partial<OrganizerSetupDraft> | null): OrganizerSetupDraft {
  const fallback = createDefaultOrganizerSetup();

  return {
    branding: {
      ...fallback.branding,
      ...(parsed?.branding ?? {}),
      eventDateAt: normalizeOrganizerDateTimeInputValue(parsed?.branding?.eventDateAt, parsed?.races?.[0]?.startAt ?? fallback.branding.eventDateAt),
      dateRibbon: formatOrganizerDateRibbon(parsed?.branding?.eventDateAt ?? parsed?.races?.[0]?.startAt ?? fallback.branding.eventDateAt)
    },
    races: (parsed?.races ?? []).filter((race) => race.slug).map((race, index) => ({
      ...createOrganizerRaceTemplate(index + 1),
      ...race,
      editionLabel: normalizeOrganizerRaceStateLabel(race.editionLabel),
      raceMode: normalizeRaceMode(race.raceMode),
      startAt: normalizeOrganizerDateTimeInputValue(race.startAt, createOrganizerRaceTemplate(index + 1).startAt),
      scheduleLabel: String(race.scheduleLabel ?? "").trim() || formatOrganizerScheduleLabel(race.startAt),
      loopTargetLaps: normalizePositiveWholeNumber(race.loopTargetLaps),
      loopTimeLimitHours: normalizePositiveWholeNumber(race.loopTimeLimitHours),
      relayLegCount: normalizePositiveWholeNumber(race.relayLegCount),
      waypoints: Array.isArray(race.waypoints) && race.waypoints.length ? race.waypoints : createOrganizerRaceTemplate(index + 1).waypoints,
      profilePoints:
        Array.isArray(race.profilePoints) && race.profilePoints.length
          ? race.profilePoints
          : createOrganizerRaceTemplate(index + 1).profilePoints,
      checkpoints: Array.isArray(race.checkpoints) && race.checkpoints.length ? race.checkpoints : createOrganizerRaceTemplate(index + 1).checkpoints,
      participants: Array.isArray(race.participants) ? race.participants : [],
      crewAssignments: Array.isArray(race.crewAssignments)
        ? race.crewAssignments.map((crew, crewIndex) => normalizeOrganizerCrewAssignment(String(race.slug || "CREW"), crew, crewIndex))
        : [],
      simulatedScans: Array.isArray(race.simulatedScans)
        ? race.simulatedScans.map((scan, scanIndex) => normalizeOrganizerSimulatedScan(String(race.slug || "CREW"), scan, scanIndex))
        : []
    }))
  };
}

export function createDefaultOrganizerWorkspace(): OrganizerWorkspaceStore {
  return {
    activeEventId: null,
    events: []
  };
}

export function loadOrganizerSetup(): OrganizerSetupDraft {
  if (typeof window === "undefined") {
    return createDefaultOrganizerSetup();
  }

  try {
    const raw = window.localStorage.getItem(ORGANIZER_SETUP_STORAGE_KEY);

    if (!raw) {
      return createDefaultOrganizerSetup();
    }

    const parsed = JSON.parse(raw) as Partial<OrganizerSetupDraft> | null;
    return normalizeOrganizerSetupDraft(parsed);
  } catch {
    return createDefaultOrganizerSetup();
  }
}

export function loadOrganizerWorkspace(): OrganizerWorkspaceStore {
  if (typeof window === "undefined") {
    return createDefaultOrganizerWorkspace();
  }

  const fallback = createDefaultOrganizerWorkspace();

  try {
    if (window.localStorage.getItem(ORGANIZER_CLEAN_START_KEY) !== "1") {
      window.localStorage.removeItem(ORGANIZER_WORKSPACE_STORAGE_KEY);
      window.localStorage.removeItem(ORGANIZER_SETUP_STORAGE_KEY);
      window.localStorage.removeItem("trailnesia:organizer-trial-autoseeded");
      window.localStorage.setItem(ORGANIZER_CLEAN_START_KEY, "1");
    }

    const rawWorkspace = window.localStorage.getItem(ORGANIZER_WORKSPACE_STORAGE_KEY);

    if (rawWorkspace) {
      const parsed = JSON.parse(rawWorkspace) as Partial<OrganizerWorkspaceStore> | null;
      const events = Array.isArray(parsed?.events)
        ? parsed.events
            .map((event, index) => {
              if (!event?.setup) {
                return null;
              }

              const normalizedSetup = normalizeOrganizerSetupDraft(event.setup);
              const fallbackRecord = createOrganizerEventRecord(normalizedSetup, Date.now() + index);

              return {
                ...fallbackRecord,
                ...event,
                title: event.title?.trim() || deriveOrganizerEventTitle(normalizedSetup),
                archivedAt: event.archivedAt ?? null,
                setup: normalizedSetup
              } satisfies OrganizerEventRecord;
            })
            .filter((event): event is OrganizerEventRecord => Boolean(event))
        : [];

      const visibleEvents = events.filter((event) => !event.archivedAt);
      const activeEventId =
        parsed?.activeEventId && visibleEvents.some((event) => event.id === parsed.activeEventId)
          ? parsed.activeEventId
          : visibleEvents[0]?.id ?? null;

      return {
        activeEventId,
        events
      };
    }

    const rawLegacy = window.localStorage.getItem(ORGANIZER_SETUP_STORAGE_KEY);
    if (!rawLegacy) {
      return fallback;
    }

    const migratedSetup = loadOrganizerSetup();
    const defaultSetup = createDefaultOrganizerSetup();
    const hasMeaningfulLegacyState =
      migratedSetup.races.length > 0 ||
      migratedSetup.branding.eventLogoDataUrl !== null ||
      migratedSetup.branding.heroBackgroundImageDataUrl !== null ||
      migratedSetup.branding.brandName !== defaultSetup.branding.brandName;

    if (!hasMeaningfulLegacyState) {
      return fallback;
    }

    const record = createOrganizerEventRecord(migratedSetup);
    return {
      activeEventId: record.id,
      events: [record]
    };
  } catch {
    return fallback;
  }
}

export function getOrganizerCheckpointsForRace(race: OrganizerRaceDraft): DemoCourseCheckpoint[] {
  return race.checkpoints?.length ? race.checkpoints : getDemoCourseForRace(race).checkpoints;
}

export function getOrganizerRaceModeLabel(mode: OrganizerRaceMode) {
  switch (mode) {
    case "loop-fixed-laps":
      return "Looping · Fixed laps";
    case "loop-fixed-time":
      return "Looping · Fixed time";
    case "relay":
      return "Relay";
    default:
      return "Standard";
  }
}

export function getOrganizerRaceModeSummary(race: OrganizerRaceDraft) {
  switch (race.raceMode) {
    case "loop-fixed-laps":
      return race.loopTargetLaps ? `${race.loopTargetLaps} laps target` : "Set target laps";
    case "loop-fixed-time":
      return race.loopTimeLimitHours ? `Most loops in ${race.loopTimeLimitHours} hours` : "Set time limit";
    case "relay":
      return race.relayLegCount ? `${race.relayLegCount} relay legs` : "Set relay legs";
    default:
      return "Fastest overall elapsed time";
  }
}

export function getOrganizerRaceDistanceSummary(race: OrganizerRaceDraft) {
  switch (race.raceMode) {
    case "loop-fixed-laps":
      return race.loopTargetLaps ? `${race.distanceKm.toFixed(1)} km per lap · ~${(race.distanceKm * race.loopTargetLaps).toFixed(1)} km total` : `${race.distanceKm.toFixed(1)} km per lap`;
    case "loop-fixed-time":
      return `${race.distanceKm.toFixed(1)} km per lap`;
    case "relay":
      return race.relayLegCount ? `${race.distanceKm.toFixed(1)} km total · ${race.relayLegCount} legs` : `${race.distanceKm.toFixed(1)} km total`;
    default:
      return `${race.distanceKm.toFixed(1)} km total`;
  }
}

export function buildOrganizerCourseFromRaceDraft(race: OrganizerRaceDraft): DemoCourse {
  const fallbackCourse = getDemoCourseForRace(race);
  return {
    slug: race.slug,
    title: race.title,
    subtitle: race.courseDescription,
    location: race.startTown,
    distanceKm: race.distanceKm,
    ascentM: race.ascentM,
    descentM: race.descentM || fallbackCourse.descentM,
    checkpoints:
      Array.isArray(race.checkpoints) && race.checkpoints.length
        ? [...race.checkpoints].sort((left, right) => left.order - right.order)
        : fallbackCourse.checkpoints,
    waypoints: Array.isArray(race.waypoints) && race.waypoints.length ? race.waypoints : fallbackCourse.waypoints,
    profilePoints: Array.isArray(race.profilePoints) && race.profilePoints.length ? race.profilePoints : fallbackCourse.profilePoints
  };
}

export function parseParticipantImportText(text: string): ParticipantImportPreview {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) {
    return {
      columns: [],
      previewColumns: [],
      rows: [],
      totalRows: 0,
      validRows: 0,
      invalidRows: 0,
      duplicateBibs: 0,
      sampleErrors: []
    };
  }

  const delimiter = lines[0].includes("\t") ? "\t" : ",";
  const columns = lines[0]
    .split(delimiter)
    .map((value) => value.trim())
    .filter(Boolean);
  const parsed = parseParticipantImportDraft(lines, delimiter);

  return {
    columns,
    previewColumns: ["BIB", "Name", "Gender", "Country", "Club"],
    rows: parsed.previewRows,
    totalRows: parsed.totalRows,
    validRows: parsed.validRows,
    invalidRows: parsed.invalidRows,
    duplicateBibs: parsed.duplicateBibs,
    sampleErrors: parsed.sampleErrors
  };
}

function normalizeGender(value: string) {
  const normalized = value.trim().toLowerCase();
  return normalized === "woman" || normalized === "women" || normalized === "female" || normalized === "f" ? "women" : "men";
}

function normalizeCountryCode(value: string) {
  return value.trim().toUpperCase().slice(0, 2) || "ID";
}

export function parseParticipantImportRows(text: string): OrganizerParticipantDraft[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    return [];
  }

  const delimiter = lines[0].includes("\t") ? "\t" : ",";
  return parseParticipantImportDraft(lines, delimiter).participants;
}

function parseParticipantImportDraft(lines: string[], delimiter: string) {
  const columns = lines[0].split(delimiter).map((value) => value.trim().toLowerCase());
  const findIndex = (keys: string[]) => columns.findIndex((column) => keys.includes(column));

  const bibIndex = findIndex(["bib", "bib_number", "racebib", "bibnumber"]);
  const nameIndex = findIndex(["name", "runner", "runner_name", "fullname"]);
  const genderIndex = findIndex(["gender", "sex", "category"]);
  const countryIndex = findIndex(["country", "countrycode", "country_code", "nationality"]);
  const clubIndex = findIndex(["club", "team", "team_name"]);

  if (bibIndex === -1 || nameIndex === -1) {
    return {
      participants: [] as OrganizerParticipantDraft[],
      previewRows: [] as string[][],
      totalRows: Math.max(lines.length - 1, 0),
      validRows: 0,
      invalidRows: Math.max(lines.length - 1, 0),
      duplicateBibs: 0,
      sampleErrors: ["Required columns are missing. Include at least 'bib' and 'name'."]
    };
  }

  const seenBibs = new Set<string>();
  const participants: OrganizerParticipantDraft[] = [];
  const previewRows: string[][] = [];
  const sampleErrors: string[] = [];
  let invalidRows = 0;
  let duplicateBibs = 0;

  lines.slice(1).forEach((line, rowIndex) => {
    const row = line.split(delimiter).map((value) => value.trim());
    const rawBib = row[bibIndex] ?? "";
    const rawName = row[nameIndex] ?? "";
    const bib = rawBib.toUpperCase();
    const name = rawName.trim();

    if (!bib || !name) {
      invalidRows += 1;
      if (sampleErrors.length < 4) {
        sampleErrors.push(`Row ${rowIndex + 2}: missing bib or runner name.`);
      }
      return;
    }

    if (seenBibs.has(bib)) {
      duplicateBibs += 1;
      if (sampleErrors.length < 4) {
        sampleErrors.push(`Row ${rowIndex + 2}: duplicate bib ${bib} ignored.`);
      }
      return;
    }

    seenBibs.add(bib);

    const participant: OrganizerParticipantDraft = {
      bib,
      name,
      gender: genderIndex === -1 ? "men" : normalizeGender(row[genderIndex] ?? ""),
      countryCode: countryIndex === -1 ? "ID" : normalizeCountryCode(row[countryIndex] ?? ""),
      club: clubIndex === -1 ? "" : row[clubIndex] ?? ""
    };

    participants.push(participant);

    if (previewRows.length < 6) {
      previewRows.push([
        participant.bib,
        participant.name,
        participant.gender,
        participant.countryCode,
        participant.club || "-"
      ]);
    }
  });

  return {
    participants,
    previewRows,
    totalRows: Math.max(lines.length - 1, 0),
    validRows: participants.length,
    invalidRows,
    duplicateBibs,
    sampleErrors
  };
}

function haversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function sampleTrackPoints<T>(points: T[], maxPoints: number) {
  if (points.length <= maxPoints) {
    return points;
  }

  return Array.from({ length: maxPoints }, (_, index) => {
    const ratio = index / Math.max(maxPoints - 1, 1);
    return points[Math.round(ratio * (points.length - 1))];
  });
}

export function parseOrganizerGpxRoute(
  xmlText: string,
  metadata: {
    routeId: string;
    routeTitle: string;
    startLabel: string;
  }
): OrganizerParsedGpxRoute | null {
  const parser = new DOMParser();
  const documentNode = parser.parseFromString(xmlText, "application/xml");
  const parserError = documentNode.querySelector("parsererror");

  if (parserError) {
    return null;
  }

  const trackPointNodes = Array.from(documentNode.getElementsByTagName("trkpt"));
  const routePointNodes = Array.from(documentNode.getElementsByTagName("rtept"));
  const sourceNodes = trackPointNodes.length >= 2 ? trackPointNodes : routePointNodes;

  if (sourceNodes.length < 2) {
    return null;
  }

  const rawPoints = sourceNodes
    .map((node) => {
      const lat = Number.parseFloat(node.getAttribute("lat") ?? "");
      const lon = Number.parseFloat(node.getAttribute("lon") ?? "");
      const eleNode = node.getElementsByTagName("ele")[0];
      const ele = Number.parseFloat(eleNode?.textContent ?? "0");

      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        return null;
      }

      return {
        lat,
        lon,
        ele: Number.isFinite(ele) ? ele : 0
      };
    })
    .filter((point): point is { lat: number; lon: number; ele: number } => point !== null);

  if (rawPoints.length < 2) {
    return null;
  }

  let cumulativeKm = 0;
  let ascentM = 0;
  let descentM = 0;

  const enrichedPoints = rawPoints.map((point, index) => {
    if (index > 0) {
      const previous = rawPoints[index - 1];
      cumulativeKm += haversineDistanceKm(previous.lat, previous.lon, point.lat, point.lon);
      const elevationDelta = point.ele - previous.ele;
      if (elevationDelta > 0) {
        ascentM += elevationDelta;
      } else {
        descentM += Math.abs(elevationDelta);
      }
    }

    return {
      ...point,
      km: Number(cumulativeKm.toFixed(3))
    };
  });

  const totalDistanceKm = Number(cumulativeKm.toFixed(1));
  const waypoints = sampleTrackPoints(enrichedPoints, 220).map((point, index, points) => ({
    id: `${metadata.routeId}-gpx-${index + 1}`,
    name:
      index === 0
        ? `${metadata.startLabel} start`
        : index === points.length - 1
          ? `${metadata.startLabel} finish`
          : `${metadata.routeTitle} waypoint ${index + 1}`,
    km: Number(point.km.toFixed(1)),
    ele: Math.round(point.ele),
    lat: Number(point.lat.toFixed(6)),
    lon: Number(point.lon.toFixed(6))
  }));
  const profilePoints = sampleTrackPoints(enrichedPoints, 180).map((point) => ({
    km: Number(point.km.toFixed(1)),
    ele: Math.round(point.ele)
  }));

  return {
    distanceKm: totalDistanceKm,
    ascentM: Math.round(ascentM),
    descentM: Math.round(descentM),
    waypoints,
    profilePoints
  };
}

export function parseOrganizerGpxFile(
  xmlText: string,
  fileMeta: { name: string; size: number },
  race: OrganizerRaceDraft
): Partial<OrganizerRaceDraft> | null {
  const parsedRoute = parseOrganizerGpxRoute(xmlText, {
    routeId: race.slug,
    routeTitle: race.title,
    startLabel: race.startTown
  });

  if (!parsedRoute) {
    return null;
  }
  const sourceCheckpoints = race.checkpoints?.length ? race.checkpoints : getDemoCourseForRace(race).checkpoints;
  const currentMaxKm = Math.max(sourceCheckpoints[sourceCheckpoints.length - 1]?.kmMarker ?? race.distanceKm, 1);
  const checkpoints = sourceCheckpoints.map((checkpoint) => ({
    ...checkpoint,
    kmMarker: Number(((checkpoint.kmMarker / currentMaxKm) * parsedRoute.distanceKm).toFixed(1))
  }));

  return {
    ...parsedRoute,
    checkpoints,
    gpxFileName: fileMeta.name,
    gpxFileSize: fileMeta.size
  };
}
