import { demoRaceFestival } from "./demoRaceFestival";
import { getDemoCourseForRace, type DemoCourseCheckpoint } from "./demoCourseVariants";

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
  startTown: string;
  distanceKm: number;
  ascentM: number;
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
    races: demoRaceFestival.races.map((race) => ({
      slug: race.slug,
      title: race.title,
      editionLabel: race.editionLabel,
      scheduleLabel: race.scheduleLabel,
      startTown: race.startTown,
      distanceKm: race.distanceKm,
      ascentM: race.ascentM,
      checkpoints: getDemoCourseForRace(race).checkpoints,
      participants: []
    }))
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
      races: fallback.races.map((race) => {
        const override = parsed?.races?.find((item) => item.slug === race.slug);
        return {
          ...race,
          ...(override ?? {}),
          checkpoints: Array.isArray(override?.checkpoints) && override.checkpoints.length ? override.checkpoints : race.checkpoints,
          participants: Array.isArray(override?.participants) ? override.participants : race.participants
        };
      })
    };
  } catch {
    return fallback;
  }
}

export function getOrganizerCheckpointsForRace(race: OrganizerRaceDraft): DemoCourseCheckpoint[] {
  return race.checkpoints?.length ? race.checkpoints : getDemoCourseForRace(race).checkpoints;
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
