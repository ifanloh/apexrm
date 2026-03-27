import { demoCourse as baseDemoCourse } from "./demoCourse";

export type DemoCoursePoint = {
  id?: string;
  name?: string;
  km: number;
  ele: number;
  lat?: number;
  lon?: number;
};

export type DemoCourseCheckpoint = {
  id: string;
  code: string;
  name: string;
  kmMarker: number;
  order: number;
};

export type DemoCourse = {
  slug: string;
  title: string;
  subtitle: string;
  location: string;
  distanceKm: number;
  ascentM: number;
  descentM: number;
  checkpoints: DemoCourseCheckpoint[];
  waypoints: Array<Required<Pick<DemoCoursePoint, "id" | "name" | "km" | "ele" | "lat" | "lon">>>;
  profilePoints: Array<Required<Pick<DemoCoursePoint, "km" | "ele">>>;
};

type DemoRaceSummary = {
  slug: string;
  title: string;
  distanceKm: number;
  ascentM: number;
  startTown: string;
};

type CoursePreset = {
  location: string;
  subtitle: string;
  checkpointNames: [string, string, string, string, string];
};

const COURSE_CHECKPOINT_IDS = ["cp-start", "cp-10", "cp-21", "cp-30", "finish"] as const;
const COURSE_CHECKPOINT_CODES = ["START", "CP1", "CP2", "CP3", "FIN"] as const;

const coursePresets: Record<string, CoursePreset> = {
  "mantra-116-ultra": {
    location: "Kaliandra Resort, East Java",
    subtitle: "Signature ultra-trail preview across the Arjuno-Welirang mountain complex from Kaliandra Resort, East Java.",
    checkpointNames: ["Kaliandra Resort", "Welirang Hut", "Cangar", "Summit Arjuno", "Kaliandra Finish"]
  },
  "mantra-ultra-68": {
    location: "Kaliandra Resort, East Java",
    subtitle: "Mountain ultra crossing the main Arjuno-Welirang ridges before returning to Kaliandra.",
    checkpointNames: ["Kaliandra Start", "Tretes Ridge", "Welirang Summit", "Cangar Descent", "Kaliandra Finish"]
  },
  "mantra-trail-38": {
    location: "Kaliandra Resort, East Java",
    subtitle: "Fast technical trail highlighting the Welirang flank and forest ridgeline around Kaliandra.",
    checkpointNames: ["Kaliandra Start", "Forest Gate", "Welirang Hut", "Ridge Traverse", "Welirang Finish"]
  },
  "mantra-trail-34": {
    location: "Kaliandra Resort, East Java",
    subtitle: "Compact Arjuno-focused trail climbing quickly before a sharp descent back to Kaliandra.",
    checkpointNames: ["Kaliandra Start", "Tretes Ascent", "Saddle Camp", "Arjuno Ridge", "Arjuno Finish"]
  },
  "mantra-fun-17": {
    location: "Kaliandra Resort, East Java",
    subtitle: "Short mountain race with a scenic ridge turnaround built for fast and scenic pacing.",
    checkpointNames: ["Kaliandra Start", "Pine Forest", "Ridge Turn", "Viewpoint", "Fun Run Finish"]
  },
  "mantra-fun-10": {
    location: "Kaliandra Resort, East Java",
    subtitle: "Intro trail loop around Kaliandra with quick climbs, forest switchbacks, and a fast finish.",
    checkpointNames: ["Kaliandra Start", "Forest Gate", "Hilltop", "Village Turn", "10K Finish"]
  }
};

const baseProfilePoints: Array<{ km: number; ele: number }> = baseDemoCourse.profilePoints.map((point) => ({
  km: Number(point.km),
  ele: Number(point.ele)
}));

const baseWaypoints: Array<{ id: string; name: string; km: number; ele: number; lat: number; lon: number }> =
  baseDemoCourse.waypoints.map((point) => ({
    id: point.id,
    name: point.name,
    km: Number(point.km),
    ele: Number(point.ele),
    lat: Number(point.lat),
    lon: Number(point.lon)
  }));

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function interpolateNumericPoint<T extends { km: number }>(
  points: readonly T[],
  targetKm: number,
  interpolate: (left: T, right: T, ratio: number, km: number) => T
) {
  if (targetKm <= points[0].km) {
    return points[0];
  }

  if (targetKm >= points[points.length - 1].km) {
    return points[points.length - 1];
  }

  const nextIndex = points.findIndex((point) => point.km >= targetKm);
  const right = points[nextIndex];
  const left = points[nextIndex - 1];
  const distance = Math.max(right.km - left.km, 0.001);
  const ratio = clamp((targetKm - left.km) / distance, 0, 1);

  return interpolate(left, right, ratio, targetKm);
}

function interpolateProfilePoint(targetKm: number) {
  return interpolateNumericPoint(baseProfilePoints, targetKm, (left, right, ratio, km) => ({
    km,
    ele: left.ele + (right.ele - left.ele) * ratio
  }));
}

function interpolateWaypoint(targetKm: number) {
  return interpolateNumericPoint(baseWaypoints, targetKm, (left, right, ratio, km) => ({
    id: `${left.id}-interp-${Math.round(km * 10)}`,
    name: `${left.name} segment`,
    km,
    ele: left.ele + (right.ele - left.ele) * ratio,
    lat: left.lat + (right.lat - left.lat) * ratio,
    lon: left.lon + (right.lon - left.lon) * ratio
  }));
}

function buildTrimmedProfile(distanceKm: number) {
  const points = baseProfilePoints
    .filter((point) => point.km <= distanceKm)
    .map((point) => ({ ...point }));

  if (!points.length || points[points.length - 1].km < distanceKm) {
    points.push(interpolateProfilePoint(distanceKm));
  }

  return points.map((point) => ({
    km: Number(point.km.toFixed(1)),
    ele: Math.round(point.ele)
  }));
}

function buildTrimmedWaypoints(distanceKm: number, finishName: string) {
  const points = baseWaypoints
    .filter((point) => point.km <= distanceKm)
    .map((point) => ({ ...point }));

  if (!points.length || points[points.length - 1].km < distanceKm) {
    points.push(interpolateWaypoint(distanceKm));
  }

  return points.map((point, index, items) => ({
    id: index === items.length - 1 ? `${finishName.toLowerCase().replace(/\s+/g, "-")}-finish` : point.id,
    name: index === items.length - 1 ? finishName : point.name,
    km: Number(point.km.toFixed(1)),
    ele: Math.round(point.ele),
    lat: Number(point.lat.toFixed(6)),
    lon: Number(point.lon.toFixed(6))
  }));
}

function buildCourseCheckpoints(distanceKm: number, names: CoursePreset["checkpointNames"]): DemoCourseCheckpoint[] {
  const kmMarkers = [0, distanceKm * 0.28, distanceKm * 0.52, distanceKm * 0.76, distanceKm].map((value) =>
    Number(value.toFixed(1))
  );

  return COURSE_CHECKPOINT_IDS.map((id, index) => ({
    id,
    code: COURSE_CHECKPOINT_CODES[index],
    name: names[index],
    kmMarker: kmMarkers[index],
    order: index
  }));
}

export function getDemoCourseForRace(race: DemoRaceSummary): DemoCourse {
  const preset = coursePresets[race.slug] ?? coursePresets["mantra-116-ultra"];
  const distanceKm = Number(Math.min(race.distanceKm, baseDemoCourse.distanceKm).toFixed(1));

  return {
    slug: race.slug,
    title: race.title,
    subtitle: preset.subtitle,
    location: preset.location,
    distanceKm,
    ascentM: race.ascentM,
    descentM: Math.round(race.ascentM * 0.98),
    checkpoints: buildCourseCheckpoints(distanceKm, preset.checkpointNames),
    waypoints: buildTrimmedWaypoints(distanceKm, preset.checkpointNames[4]),
    profilePoints: buildTrimmedProfile(distanceKm)
  };
}
