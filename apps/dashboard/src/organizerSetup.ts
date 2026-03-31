import { demoRaceFestival, type DemoRaceCard } from "./demoRaceFestival";
import { getDemoCourseForRace, type DemoCourse, type DemoCourseCheckpoint } from "./demoCourseVariants";
import * as XLSX from "xlsx";

export const ORGANIZER_SETUP_STORAGE_KEY = "trailnesia:organizer-setup";

export type OrganizerBrandingDraft = {
  organizerName: string;
  brandStackTop: string;
  brandStackBottom: string;
  brandName: string;
  editionLabel: string;
  bannerTagline: string;
  homeTitle: string;
  homeSubtitle: string;
  dateRibbon: string;
  locationRibbon: string;
  eventLogoDataUrl: string | null;
  heroBackgroundImageDataUrl: string | null;
  gpxFileName: string | null;
  gpxFileSize: number | null;
};

export type OrganizerRaceDraft = {
  slug: string;
  title: string;
  isPublished: boolean;
  editionLabel: string;
  scheduleLabel: string;
  startAt: string;
  startTown: string;
  courseDescription: string;
  courseHighlights: string[];
  distanceKm: number;
  ascentM: number;
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

const PARTICIPANT_TEMPLATE_HEADERS = ["bib", "name", "gender", "country", "club"];
const PARTICIPANT_TEMPLATE_SAMPLE_ROWS = [
  ["", "", "", "", ""],
  ["", "", "", "", ""]
];

export function createParticipantImportTemplateCsv() {
  return [PARTICIPANT_TEMPLATE_HEADERS.join(","), ...PARTICIPANT_TEMPLATE_SAMPLE_ROWS.map((row) => row.join(","))].join("\n");
}

export function createParticipantImportTemplateWorkbook() {
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
    editionLabel: race.editionLabel,
    scheduleLabel: race.scheduleLabel,
    startAt: race.startAt,
    startTown: race.startTown,
    courseDescription: race.courseDescription,
    courseHighlights: race.courseHighlights,
    distanceKm: race.distanceKm,
    ascentM: race.ascentM,
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
    editionLabel: "Live",
    scheduleLabel: "Sun 01 Jan 05:00",
    startAt: "2026-01-01T05:00:00+07:00",
    startTown: "Start Town",
    courseDescription: "Describe this course for spectators. Include terrain, challenge profile, and what makes this category unique.",
    courseHighlights: ["Signature climb", "Technical descent", "Scenic finish"],
    distanceKm: 25,
    ascentM: 1400,
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

export function createDefaultOrganizerSetup(): OrganizerSetupDraft {
  return {
    branding: {
      organizerName: "Trailnesia Organizer",
      brandStackTop: demoRaceFestival.brandStack[0] ?? "EVENT",
      brandStackBottom: demoRaceFestival.brandStack[1] ?? "RACE",
      brandName: demoRaceFestival.brandName,
      editionLabel: demoRaceFestival.editionLabel,
      bannerTagline: demoRaceFestival.bannerTagline,
      homeTitle: demoRaceFestival.homeTitle,
      homeSubtitle: demoRaceFestival.homeSubtitle,
      dateRibbon: demoRaceFestival.dateRibbon,
      locationRibbon: demoRaceFestival.locationRibbon,
      eventLogoDataUrl: null,
      heroBackgroundImageDataUrl: null,
      gpxFileName: null,
      gpxFileSize: null
    },
    races: demoRaceFestival.races.map((race) => createOrganizerRaceDraftFromCard(race))
  };
}

export function loadOrganizerSetup(): OrganizerSetupDraft {
  if (typeof window === "undefined") {
    return createDefaultOrganizerSetup();
  }

  const fallback = createDefaultOrganizerSetup();

  try {
    const raw = window.localStorage.getItem(ORGANIZER_SETUP_STORAGE_KEY);

    if (!raw) {
      return fallback;
    }

    const parsed = JSON.parse(raw) as Partial<OrganizerSetupDraft> | null;

    return {
      branding: {
        ...fallback.branding,
        ...(parsed?.branding ?? {})
      },
      races: [
        ...fallback.races.map((race) => {
          const override = parsed?.races?.find((item) => item.slug === race.slug);
          return {
            ...race,
            ...(override ?? {}),
            waypoints: Array.isArray(override?.waypoints) && override.waypoints.length ? override.waypoints : race.waypoints,
            profilePoints: Array.isArray(override?.profilePoints) && override.profilePoints.length ? override.profilePoints : race.profilePoints,
            checkpoints: Array.isArray(override?.checkpoints) && override.checkpoints.length ? override.checkpoints : race.checkpoints,
            participants: Array.isArray(override?.participants) ? override.participants : race.participants,
            crewAssignments: Array.isArray((override as Partial<OrganizerRaceDraft> | undefined)?.crewAssignments)
              ? (((override as Partial<OrganizerRaceDraft>).crewAssignments ?? []) as Partial<OrganizerCrewAssignmentDraft>[]).map((crew, index) =>
                  normalizeOrganizerCrewAssignment(race.slug, crew, index)
                )
              : race.crewAssignments,
            simulatedScans: Array.isArray((override as Partial<OrganizerRaceDraft> | undefined)?.simulatedScans)
              ? (((override as Partial<OrganizerRaceDraft>).simulatedScans ?? []) as Partial<OrganizerSimulatedScanDraft>[]).map((scan, index) =>
                  normalizeOrganizerSimulatedScan(race.slug, scan, index)
                )
              : race.simulatedScans
          };
        }),
        ...(parsed?.races ?? [])
          .filter((race) => race.slug && !fallback.races.some((fallbackRace) => fallbackRace.slug === race.slug))
          .map((race) => ({
            ...createOrganizerRaceTemplate(fallback.races.length + 1),
            ...race,
            waypoints: Array.isArray(race.waypoints) && race.waypoints.length ? race.waypoints : createOrganizerRaceTemplate(fallback.races.length + 1).waypoints,
            profilePoints:
              Array.isArray(race.profilePoints) && race.profilePoints.length
                ? race.profilePoints
                : createOrganizerRaceTemplate(fallback.races.length + 1).profilePoints,
            checkpoints: Array.isArray(race.checkpoints) && race.checkpoints.length ? race.checkpoints : createOrganizerRaceTemplate(fallback.races.length + 1).checkpoints,
            participants: Array.isArray(race.participants) ? race.participants : [],
            crewAssignments: Array.isArray(race.crewAssignments)
              ? race.crewAssignments.map((crew, index) =>
                  normalizeOrganizerCrewAssignment(String(race.slug || "CREW"), crew, index)
                )
              : [],
            simulatedScans: Array.isArray(race.simulatedScans)
              ? race.simulatedScans.map((scan, index) =>
                  normalizeOrganizerSimulatedScan(String(race.slug || "CREW"), scan, index)
                )
              : []
          }))
      ]
    };
  } catch {
    return fallback;
  }
}

export function getOrganizerCheckpointsForRace(race: OrganizerRaceDraft): DemoCourseCheckpoint[] {
  return race.checkpoints?.length ? race.checkpoints : getDemoCourseForRace(race).checkpoints;
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

export function parseOrganizerGpxFile(
  xmlText: string,
  fileMeta: { name: string; size: number },
  race: OrganizerRaceDraft
): Partial<OrganizerRaceDraft> | null {
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
    id: `${race.slug}-gpx-${index + 1}`,
    name: index === 0 ? `${race.startTown} start` : index === points.length - 1 ? `${race.startTown} finish` : `${race.title} waypoint ${index + 1}`,
    km: Number(point.km.toFixed(1)),
    ele: Math.round(point.ele),
    lat: Number(point.lat.toFixed(6)),
    lon: Number(point.lon.toFixed(6))
  }));
  const profilePoints = sampleTrackPoints(enrichedPoints, 180).map((point) => ({
    km: Number(point.km.toFixed(1)),
    ele: Math.round(point.ele)
  }));
  const sourceCheckpoints = race.checkpoints?.length ? race.checkpoints : getDemoCourseForRace(race).checkpoints;
  const currentMaxKm = Math.max(sourceCheckpoints[sourceCheckpoints.length - 1]?.kmMarker ?? race.distanceKm, 1);
  const checkpoints = sourceCheckpoints.map((checkpoint) => ({
    ...checkpoint,
    kmMarker: Number(((checkpoint.kmMarker / currentMaxKm) * totalDistanceKm).toFixed(1))
  }));

  return {
    distanceKm: totalDistanceKm,
    ascentM: Math.round(ascentM),
    descentM: Math.round(descentM),
    waypoints,
    profilePoints,
    checkpoints,
    gpxFileName: fileMeta.name,
    gpxFileSize: fileMeta.size
  };
}
