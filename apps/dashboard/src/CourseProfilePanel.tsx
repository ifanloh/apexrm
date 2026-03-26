import { formatCheckpointLabel } from "@arm/contracts";
import { demoCourse } from "./demoCourse";

type CourseStop = {
  id: string;
  code: string;
  name: string;
  kmMarker: number;
  totalOfficialScans: number;
  leaderBib: string | null;
  isLeaderHere: boolean;
};

type Props = {
  courseStops: CourseStop[];
  selectedCheckpointId: string;
  onSelectCheckpoint: (checkpointId: string) => void;
  finisherCount: number;
  dnfCount: number;
};

const chartWidth = 960;
const chartHeight = 260;
const chartPadding = {
  top: 18,
  right: 20,
  bottom: 26,
  left: 20
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getChartGeometry() {
  const minEle = Math.min(...demoCourse.profilePoints.map((point) => point.ele));
  const maxEle = Math.max(...demoCourse.profilePoints.map((point) => point.ele));
  const elevationSpan = Math.max(maxEle - minEle, 1);
  const drawableWidth = chartWidth - chartPadding.left - chartPadding.right;
  const drawableHeight = chartHeight - chartPadding.top - chartPadding.bottom;

  const toX = (km: number) =>
    chartPadding.left + clamp((km / demoCourse.distanceKm) * drawableWidth, 0, drawableWidth);
  const toY = (ele: number) =>
    chartPadding.top + (1 - (ele - minEle) / elevationSpan) * drawableHeight;

  const linePath = demoCourse.profilePoints
    .map((point, index) => `${index === 0 ? "M" : "L"} ${toX(point.km).toFixed(1)} ${toY(point.ele).toFixed(1)}`)
    .join(" ");
  const areaPath = `${linePath} L ${toX(demoCourse.distanceKm).toFixed(1)} ${(chartHeight - chartPadding.bottom).toFixed(1)} L ${chartPadding.left} ${(chartHeight - chartPadding.bottom).toFixed(1)} Z`;

  return {
    minEle,
    maxEle,
    toX,
    toY,
    linePath,
    areaPath
  };
}

function getMapGeometry() {
  const lats = demoCourse.waypoints.map((point) => point.lat);
  const lons = demoCourse.waypoints.map((point) => point.lon);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const width = 960;
  const height = 420;
  const padding = 28;
  const lonSpan = Math.max(maxLon - minLon, 0.001);
  const latSpan = Math.max(maxLat - minLat, 0.001);
  const drawableWidth = width - padding * 2;
  const drawableHeight = height - padding * 2;

  const toX = (lon: number) => padding + ((lon - minLon) / lonSpan) * drawableWidth;
  const toY = (lat: number) => padding + (1 - (lat - minLat) / latSpan) * drawableHeight;

  const path = demoCourse.waypoints
    .map((point, index) => `${index === 0 ? "M" : "L"} ${toX(point.lon).toFixed(1)} ${toY(point.lat).toFixed(1)}`)
    .join(" ");

  return {
    width,
    height,
    path,
    toX,
    toY
  };
}

export function CourseProfilePanel({ courseStops, selectedCheckpointId, onSelectCheckpoint, finisherCount, dnfCount }: Props) {
  const chart = getChartGeometry();
  const map = getMapGeometry();
  const selectedStop = courseStops.find((stop) => stop.id === selectedCheckpointId) ?? courseStops[0];

  return (
    <article className="panel spotlight-panel course-profile-card">
      <div className="course-profile-stage">
        <div className="course-profile-headline">
          <div className="course-profile-title">
            <span className="detail-label">Race Profile</span>
            <strong>{demoCourse.title}</strong>
            <small>
              {demoCourse.distanceKm.toFixed(1)} km | +{demoCourse.ascentM}m | -{demoCourse.descentM}m
            </small>
          </div>
          <div className="course-profile-meta-card">
            <span>{selectedStop.code}</span>
            <strong>{selectedStop.name}</strong>
            <small>{selectedStop.totalOfficialScans} official scan</small>
          </div>
        </div>

        <div className="course-elevation-card">
        <svg className="course-elevation-chart" viewBox={`0 0 ${chartWidth} ${chartHeight}`} role="img" aria-label="Course elevation profile">
          <defs>
            <linearGradient id="courseElevationFill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="rgba(255, 191, 110, 0.78)" />
              <stop offset="100%" stopColor="rgba(255, 191, 110, 0.06)" />
            </linearGradient>
          </defs>

          {[0.25, 0.5, 0.75].map((ratio) => {
            const y = chartPadding.top + (chartHeight - chartPadding.top - chartPadding.bottom) * ratio;
            return <line className="course-grid-line" key={ratio} x1={chartPadding.left} x2={chartWidth - chartPadding.right} y1={y} y2={y} />;
          })}

          <line className="course-baseline" x1={chartPadding.left} x2={chartWidth - chartPadding.right} y1={chartHeight - chartPadding.bottom} y2={chartHeight - chartPadding.bottom} />
          <path className="course-area" d={chart.areaPath} />
          <path className="course-line" d={chart.linePath} />

          {courseStops.map((stop) => {
            const markerPoint = demoCourse.profilePoints.reduce((closest, point) => {
              const distance = Math.abs(point.km - stop.kmMarker);
              const currentDistance = Math.abs(closest.km - stop.kmMarker);
              return distance < currentDistance ? point : closest;
            }, demoCourse.profilePoints[0]);

            const x = chart.toX(stop.kmMarker);
            const y = chart.toY(markerPoint.ele);
            const isSelected = stop.id === selectedCheckpointId;

            return (
              <g key={stop.id} onClick={() => onSelectCheckpoint(stop.id)}>
                <line
                  className={`course-marker-line ${isSelected ? "selected" : ""}`}
                  x1={x}
                  x2={x}
                  y1={chartPadding.top + 4}
                  y2={chartHeight - chartPadding.bottom}
                />
                <circle className={`course-marker-point ${isSelected ? "selected" : stop.isLeaderHere ? "leader" : ""}`} cx={x} cy={y} r={isSelected ? 6 : 4.5} />
                <g transform={`translate(${x - 42}, ${chartPadding.top + 2})`}>
                  <rect className={`course-marker-pill ${isSelected ? "selected" : ""}`} height="34" rx="10" width="84" x="0" y="0" />
                  <text className={`course-marker-pill-km ${isSelected ? "selected" : ""}`} x="42" y="13" textAnchor="middle">
                    {stop.kmMarker} km
                  </text>
                  <text className={`course-marker-pill-name ${isSelected ? "selected" : ""}`} x="42" y="25" textAnchor="middle">
                    {stop.name}
                  </text>
                </g>
              </g>
            );
          })}
        </svg>

        <div className="course-profile-footer">
          <div className="course-withdrawal-card">
            <strong>{dnfCount}</strong>
            <span>See details</span>
          </div>
          <div className="course-scale">
            <span>0 km</span>
            <span>{Math.round(chart.minEle)} m</span>
            <span>{Math.round((chart.minEle + chart.maxEle) / 2)} m</span>
            <span>{Math.round(chart.maxEle)} m</span>
            <span>{demoCourse.distanceKm.toFixed(1)} km</span>
          </div>
        </div>

        <div className="course-legend-switch">
          <button className="course-switch-ghost" type="button">
            Runners
          </button>
          <button className="course-switch-active" type="button">
            Withdrawals
          </button>
        </div>
      </div>

      <div className="course-map-card">
        <div className="course-map-copy">
          <span className="detail-label">Route Map</span>
          <strong>Open the map</strong>
          <p>Satellite preview, route outline, and checkpoint anchors for spectators and organizers.</p>
          <button className="download-pill map-cta" type="button">
            Open the Map
          </button>
        </div>
        <div className="course-map-visual">
          <svg className="course-map-svg" viewBox={`0 0 ${map.width} ${map.height}`} role="img" aria-label="Course map preview">
            <defs>
              <linearGradient id="courseMapBg" x1="0" x2="1" y1="0" y2="1">
                <stop offset="0%" stopColor="rgba(247, 244, 234, 0.9)" />
                <stop offset="55%" stopColor="rgba(72, 101, 71, 0.55)" />
                <stop offset="100%" stopColor="rgba(31, 47, 39, 0.9)" />
              </linearGradient>
              <radialGradient id="courseMapGlow" cx="0.2" cy="0.25" r="0.85">
                <stop offset="0%" stopColor="rgba(255,255,255,0.8)" />
                <stop offset="100%" stopColor="rgba(255,255,255,0)" />
              </radialGradient>
            </defs>
            <rect fill="url(#courseMapBg)" height={map.height} rx="26" width={map.width} x="0" y="0" />
            <rect fill="url(#courseMapGlow)" height={map.height} width={map.width} x="0" y="0" />
            {[0.18, 0.38, 0.62, 0.81].map((ratio) => (
              <line
                className="course-map-grid"
                key={`grid-y-${ratio}`}
                x1="0"
                x2={map.width}
                y1={map.height * ratio}
                y2={map.height * ratio}
              />
            ))}
            {[0.22, 0.47, 0.74].map((ratio) => (
              <line
                className="course-map-grid"
                key={`grid-x-${ratio}`}
                x1={map.width * ratio}
                x2={map.width * ratio}
                y1="0"
                y2={map.height}
              />
            ))}
            <path className="course-map-route" d={map.path} />
            {courseStops.map((stop) => {
              const waypoint =
                demoCourse.waypoints.reduce((closest, point) => {
                  const distance = Math.abs(point.km - stop.kmMarker);
                  const currentDistance = Math.abs(closest.km - stop.kmMarker);
                  return distance < currentDistance ? point : closest;
                }, demoCourse.waypoints[0]) ?? demoCourse.waypoints[0];
              const x = map.toX(waypoint.lon);
              const y = map.toY(waypoint.lat);
              const isSelected = stop.id === selectedCheckpointId;

              return (
                <g key={`map-${stop.id}`}>
                  <circle className={`course-map-point ${isSelected ? "selected" : ""}`} cx={x} cy={y} r={isSelected ? 8 : 6} />
                  <text className={`course-map-label ${isSelected ? "selected" : ""}`} x={x} y={y - 14} textAnchor="middle">
                    {stop.code}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>
      </div>
    </article>
  );
}
