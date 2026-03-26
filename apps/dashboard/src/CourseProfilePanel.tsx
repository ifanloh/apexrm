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

export function CourseProfilePanel({ courseStops, selectedCheckpointId, onSelectCheckpoint }: Props) {
  const chart = getChartGeometry();

  return (
    <article className="panel spotlight-panel course-profile-card">
      <div className="panel-head compact">
        <div>
          <p className="section-label">Course Profile</p>
          <h3>{demoCourse.title}</h3>
        </div>
        <div className="panel-badge">
          <span>Route</span>
          <strong>{demoCourse.distanceKm.toFixed(1)} KM</strong>
          <span>
            +{demoCourse.ascentM}m / -{demoCourse.descentM}m
          </span>
        </div>
      </div>

      <div className="course-profile-summary">
        <div className="course-stat-card">
          <span>Start</span>
          <strong>{demoCourse.checkpoints[0].name}</strong>
          <small>Live start gate</small>
        </div>
        <div className="course-stat-card">
          <span>Finish</span>
          <strong>{demoCourse.checkpoints.at(-1)?.name}</strong>
          <small>Official finish line</small>
        </div>
        <div className="course-stat-card">
          <span>Waypoints</span>
          <strong>{demoCourse.waypoints.length}</strong>
          <small>GPX support points</small>
        </div>
        <div className="course-stat-card">
          <span>Selected CP</span>
          <strong>{courseStops.find((stop) => stop.id === selectedCheckpointId)?.code ?? "START"}</strong>
          <small>{courseStops.find((stop) => stop.id === selectedCheckpointId)?.name ?? "Millau"}</small>
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
              <g key={stop.id}>
                <line
                  className={`course-marker-line ${isSelected ? "selected" : ""}`}
                  x1={x}
                  x2={x}
                  y1={chartPadding.top + 4}
                  y2={chartHeight - chartPadding.bottom}
                />
                <circle className={`course-marker-point ${isSelected ? "selected" : stop.isLeaderHere ? "leader" : ""}`} cx={x} cy={y} r={isSelected ? 6 : 4.5} />
                <text className={`course-marker-label ${isSelected ? "selected" : ""}`} x={x} y={chartPadding.top - 2} textAnchor="middle">
                  {stop.code}
                </text>
              </g>
            );
          })}
        </svg>

        <div className="course-scale">
          <span>0 km</span>
          <span>{Math.round(chart.minEle)} m</span>
          <span>{Math.round((chart.minEle + chart.maxEle) / 2)} m</span>
          <span>{Math.round(chart.maxEle)} m</span>
          <span>{demoCourse.distanceKm.toFixed(1)} km</span>
        </div>
      </div>

      <div className="course-profile-track">
        {courseStops.map((stop) => {
          const isSelected = stop.id === selectedCheckpointId;

          return (
            <button
              className={`course-stop ${stop.isLeaderHere ? "active" : ""} ${isSelected ? "selected" : ""}`}
              key={stop.id}
              onClick={() => onSelectCheckpoint(stop.id)}
              type="button"
            >
              <span>{stop.code}</span>
              <strong>{formatCheckpointLabel(stop)}</strong>
              <small>{stop.name}</small>
              <small>{stop.totalOfficialScans} official scan</small>
              <small>{stop.leaderBib ? `Leader ${stop.leaderBib}` : "Belum ada leader"}</small>
            </button>
          );
        })}
      </div>

      <div className="course-waypoint-strip">
        {demoCourse.waypoints.map((waypoint) => (
          <div className="course-waypoint-pill" key={waypoint.id}>
            <span>{waypoint.km.toFixed(1)} km</span>
            <strong>{waypoint.name}</strong>
            <small>{waypoint.ele} mdpl</small>
          </div>
        ))}
      </div>
    </article>
  );
}
