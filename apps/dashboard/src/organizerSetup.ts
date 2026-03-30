import { demoRaceFestival, type DemoRaceCard } from "./demoRaceFestival";
import { getDemoCourseForRace, type DemoCourse, type DemoCourseCheckpoint } from "./demoCourseVariants";

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
  gpxFileName: string | null;
  gpxFileSize: number | null;
};

export type OrganizerRaceDraft = {
  slug: string;
  title: string;
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

export type ParticipantImportPreview = {
  columns: string[];
  rows: string[][];
  totalRows: number;
};

export function createOrganizerRaceDraftFromCard(race: DemoRaceCard): OrganizerRaceDraft {
  const course = getDemoCourseForRace(race);
  return {
    slug: race.slug,
    title: race.title,
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
    participants: []
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
    participants: []
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
          participants: Array.isArray(override?.participants) ? override.participants : race.participants
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
            participants: Array.isArray(race.participants) ? race.participants : []
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
      rows: [],
      totalRows: 0
    };
  }

  const delimiter = lines[0].includes("\t") ? "\t" : ",";
  const columns = lines[0]
    .split(delimiter)
    .map((value) => value.trim())
    .filter(Boolean);

  const rows = lines.slice(1).map((line) => line.split(delimiter).map((value) => value.trim()));

  return {
    columns,
    rows: rows.slice(0, 6),
    totalRows: rows.length
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
  const columns = lines[0].split(delimiter).map((value) => value.trim().toLowerCase());
  const findIndex = (keys: string[]) => columns.findIndex((column) => keys.includes(column));

  const bibIndex = findIndex(["bib", "bib_number", "racebib"]);
  const nameIndex = findIndex(["name", "runner", "runner_name"]);
  const genderIndex = findIndex(["gender", "sex", "category"]);
  const countryIndex = findIndex(["country", "countrycode", "nationality"]);
  const clubIndex = findIndex(["club", "team", "team_name"]);

  if (bibIndex === -1 || nameIndex === -1) {
    return [];
  }

  return lines
    .slice(1)
    .map((line) => line.split(delimiter).map((value) => value.trim()))
    .filter((row) => row[bibIndex] && row[nameIndex])
    .map((row) => ({
      bib: row[bibIndex].toUpperCase(),
      name: row[nameIndex],
      gender: genderIndex === -1 ? "men" : normalizeGender(row[genderIndex] ?? ""),
      countryCode: countryIndex === -1 ? "ID" : normalizeCountryCode(row[countryIndex] ?? ""),
      club: clubIndex === -1 ? "" : row[clubIndex] ?? ""
    }));
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
