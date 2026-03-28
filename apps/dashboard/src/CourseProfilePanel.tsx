import { CourseInlineMap } from "./CourseInlineMap";
import type { DemoCourse } from "./demoCourseVariants";

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
  course: DemoCourse;
  courseStops: CourseStop[];
  selectedCheckpointId: string;
  onSelectCheckpoint: (checkpointId: string) => void;
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

function getChartGeometry(course: DemoCourse) {
  const minEle = Math.min(...course.profilePoints.map((point) => point.ele));
  const maxEle = Math.max(...course.profilePoints.map((point) => point.ele));
  const elevationSpan = Math.max(maxEle - minEle, 1);
  const drawableWidth = chartWidth - chartPadding.left - chartPadding.right;
  const drawableHeight = chartHeight - chartPadding.top - chartPadding.bottom;

  const toX = (km: number) =>
    chartPadding.left + clamp((km / course.distanceKm) * drawableWidth, 0, drawableWidth);
  const toY = (ele: number) =>
    chartPadding.top + (1 - (ele - minEle) / elevationSpan) * drawableHeight;

  const linePath = course.profilePoints
    .map((point, index) => `${index === 0 ? "M" : "L"} ${toX(point.km).toFixed(1)} ${toY(point.ele).toFixed(1)}`)
    .join(" ");
  const areaPath = `${linePath} L ${toX(course.distanceKm).toFixed(1)} ${(chartHeight - chartPadding.bottom).toFixed(1)} L ${chartPadding.left} ${(chartHeight - chartPadding.bottom).toFixed(1)} Z`;

  return {
    minEle,
    maxEle,
    toX,
    toY,
    linePath,
    areaPath
  };
}

export function CourseProfilePanel({ course, courseStops, selectedCheckpointId, onSelectCheckpoint, dnfCount }: Props) {
  const chart = getChartGeometry(course);
  const selectedStop = courseStops.find((stop) => stop.id === selectedCheckpointId) ?? courseStops[0];

  return (
    <>
      <article className="panel spotlight-panel course-profile-card">
        <div className="course-profile-stage">
          <div className="course-profile-headline">
            <div className="course-profile-title">
              <span className="detail-label">Elevation Profile</span>
              <strong>{course.title}</strong>
              <small>
                {course.distanceKm.toFixed(1)} km | +{course.ascentM}m | -{course.descentM}m
              </small>
            </div>
            <div className="course-profile-meta-card">
              <span>{selectedStop.code}</span>
              <strong>{selectedStop.name}</strong>
              <small>{selectedStop.totalOfficialScans} official passings</small>
            </div>
          </div>

          <div className="course-elevation-card">
            <svg
              className="course-elevation-chart"
              viewBox={`0 0 ${chartWidth} ${chartHeight}`}
              role="img"
              aria-label={`${course.title} elevation profile`}
            >
              <defs>
                <linearGradient id="courseElevationFill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="rgba(214, 130, 47, 0.76)" />
                  <stop offset="100%" stopColor="rgba(214, 130, 47, 0.06)" />
                </linearGradient>
              </defs>

              {[0.25, 0.5, 0.75].map((ratio) => {
                const y = chartPadding.top + (chartHeight - chartPadding.top - chartPadding.bottom) * ratio;
                return (
                  <line
                    className="course-grid-line"
                    key={ratio}
                    x1={chartPadding.left}
                    x2={chartWidth - chartPadding.right}
                    y1={y}
                    y2={y}
                  />
                );
              })}

              <line
                className="course-baseline"
                x1={chartPadding.left}
                x2={chartWidth - chartPadding.right}
                y1={chartHeight - chartPadding.bottom}
                y2={chartHeight - chartPadding.bottom}
              />
              <path className="course-area" d={chart.areaPath} />
              <path className="course-line" d={chart.linePath} />

              {courseStops.map((stop) => {
                const markerPoint = course.profilePoints.reduce((closest, point) => {
                  const distance = Math.abs(point.km - stop.kmMarker);
                  const currentDistance = Math.abs(closest.km - stop.kmMarker);
                  return distance < currentDistance ? point : closest;
                }, course.profilePoints[0]);

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
                    <circle
                      className={`course-marker-point ${isSelected ? "selected" : stop.isLeaderHere ? "leader" : ""}`}
                      cx={x}
                      cy={y}
                      r={isSelected ? 6 : 4.5}
                    />
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
                <span>{course.distanceKm.toFixed(1)} km</span>
              </div>
            </div>
          </div>
        </div>
      </article>

      <article className="panel course-map-card">
        <div className="course-profile-title course-map-title">
          <span className="detail-label">Map</span>
          <strong>{course.title}</strong>
          <small>{course.location}</small>
        </div>
        <CourseInlineMap course={course} onSelectCheckpoint={onSelectCheckpoint} selectedCheckpointId={selectedCheckpointId} />
      </article>
    </>
  );
}
