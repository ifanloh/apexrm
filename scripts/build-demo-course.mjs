import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const inputPath = path.resolve(process.argv[2] ?? "C:/Users/FA-10746/Downloads/track.gpx");
const outputPath = path.resolve(process.argv[3] ?? "apps/dashboard/src/demoCourse.ts");

function asciiFold(value) {
  return value
    .normalize("NFKD")
    .replace(/[^\x00-\x7F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(value) {
  return asciiFold(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function haversineDistanceKm(left, right) {
  const earthRadiusKm = 6371;
  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const latDelta = toRadians(right.lat - left.lat);
  const lonDelta = toRadians(right.lon - left.lon);
  const lat1 = toRadians(left.lat);
  const lat2 = toRadians(right.lat);

  const a =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(lonDelta / 2) ** 2;

  return 2 * earthRadiusKm * Math.asin(Math.sqrt(a));
}

function round(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function extractWaypoints(gpx) {
  const matches = [...gpx.matchAll(/<wpt lat="([^"]+)" lon="([^"]+)">([\s\S]*?)<\/wpt>/g)];

  return matches.map((match) => {
    const lat = Number(match[1]);
    const lon = Number(match[2]);
    const body = match[3];
    const ele = Number(body.match(/<ele>([^<]+)<\/ele>/)?.[1] ?? 0);
    const rawName = body.match(/<name>([^<]+)<\/name>/)?.[1] ?? "Waypoint";
    const distanceMeters = Number(body.match(/<distance>([^<]+)<\/distance>/)?.[1] ?? 0);
    const name = asciiFold(rawName);

    return {
      id: slugify(name || `waypoint-${distanceMeters}`),
      name,
      km: round(distanceMeters / 1000, 1),
      ele: Math.round(ele),
      lat: round(lat, 5),
      lon: round(lon, 5)
    };
  });
}

function extractTrackPoints(gpx) {
  const matches = [...gpx.matchAll(/<trkpt lat="([^"]+)" lon="([^"]+)">([\s\S]*?)<\/trkpt>/g)];

  return matches.map((match) => {
    const lat = Number(match[1]);
    const lon = Number(match[2]);
    const ele = Number(match[3].match(/<ele>([^<]+)<\/ele>/)?.[1] ?? 0);

    return {
      lat,
      lon,
      ele
    };
  });
}

function buildProfilePoints(trackPoints, sampleCount = 120) {
  if (trackPoints.length === 0) {
    return [];
  }

  const withDistance = [];
  let totalDistanceKm = 0;

  for (let index = 0; index < trackPoints.length; index += 1) {
    const point = trackPoints[index];

    if (index > 0) {
      totalDistanceKm += haversineDistanceKm(trackPoints[index - 1], point);
    }

    withDistance.push({
      km: totalDistanceKm,
      ele: point.ele
    });
  }

  const targetStepKm = totalDistanceKm / sampleCount;
  const sampled = [];
  let nextTarget = 0;

  for (const point of withDistance) {
    if (point.km >= nextTarget || sampled.length === 0) {
      sampled.push({
        km: round(point.km, 1),
        ele: Math.round(point.ele)
      });
      nextTarget += targetStepKm;
    }
  }

  const lastPoint = withDistance.at(-1);
  const sampledLastPoint = sampled.at(-1);

  if (lastPoint && sampledLastPoint && sampledLastPoint.km !== round(lastPoint.km, 1)) {
    sampled.push({
      km: round(lastPoint.km, 1),
      ele: Math.round(lastPoint.ele)
    });
  }

  return sampled;
}

function buildElevationStats(trackPoints) {
  let ascentM = 0;
  let descentM = 0;

  for (let index = 1; index < trackPoints.length; index += 1) {
    const delta = trackPoints[index].ele - trackPoints[index - 1].ele;

    if (delta > 0) {
      ascentM += delta;
    } else {
      descentM += Math.abs(delta);
    }
  }

  return {
    ascentM: Math.round(ascentM),
    descentM: Math.round(descentM)
  };
}

function findWaypoint(waypoints, matcher) {
  const match = waypoints.find((waypoint) => matcher.test(waypoint.name));

  if (!match) {
    throw new Error(`Waypoint not found for ${matcher}`);
  }

  return match;
}

async function main() {
  const gpx = await readFile(inputPath, "utf8");
  const waypoints = extractWaypoints(gpx);
  const trackPoints = extractTrackPoints(gpx);
  const profilePoints = buildProfilePoints(trackPoints);
  const { ascentM, descentM } = buildElevationStats(trackPoints);
  const totalDistanceKm = Math.max(profilePoints.at(-1)?.km ?? 0, waypoints.at(-1)?.km ?? 0);

  const start = findWaypoint(waypoints, /^Millau$/i);
  const cp1 = findWaypoint(waypoints, /^Peyreleau$/i);
  const cp2 = findWaypoint(waypoints, /^Roquesaltes$/i);
  const cp3 = findWaypoint(waypoints, /^La Salvage$/i);
  const checkpoints = [
    { id: "cp-start", code: "START", name: start.name, kmMarker: 0, order: 0 },
    { id: "cp-10", code: "CP1", name: cp1.name, kmMarker: cp1.km, order: 1 },
    { id: "cp-21", code: "CP2", name: cp2.name, kmMarker: cp2.km, order: 2 },
    { id: "cp-30", code: "CP3", name: cp3.name, kmMarker: cp3.km, order: 3 },
    { id: "finish", code: "FIN", name: "Arrivee Millau", kmMarker: round(totalDistanceKm, 1), order: 4 }
  ];

  const output = `export const demoCourse = ${JSON.stringify(
    {
      slug: "grand-trail-des-templiers",
      title: "Grand Trail des Templiers",
      subtitle: "Sample course dari GPX untuk dashboard live trial dan mini race.",
      location: "Millau, France",
      distanceKm: round(totalDistanceKm, 1),
      ascentM,
      descentM,
      checkpoints,
      waypoints,
      profilePoints
    },
    null,
    2
  )} as const;\n`;

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, output, "utf8");

  console.log(`Demo course written to ${outputPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
