import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { DemoCourse } from "./demoCourseVariants";

type Props = {
  course: DemoCourse;
  selectedCheckpointId: string;
  onSelectCheckpoint: (checkpointId: string) => void;
};

function findClosestWaypoint(course: DemoCourse, targetKm: number) {
  return course.waypoints.reduce((closest, point) => {
    const distance = Math.abs(point.km - targetKm);
    const currentDistance = Math.abs(closest.km - targetKm);
    return distance < currentDistance ? point : closest;
  }, course.waypoints[0]);
}

function findCheckpointWaypoint(course: DemoCourse, checkpointId: string, targetKm: number) {
  return course.waypoints.find((point) => point.id === checkpointId) ?? findClosestWaypoint(course, targetKm);
}

export function CourseInlineMap({ course, selectedCheckpointId, onSelectCheckpoint }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);

  const routeLatLngs = useMemo(
    () => course.waypoints.map((point) => [point.lat, point.lon] as [number, number]),
    [course]
  );

  useEffect(() => {
    if (!containerRef.current || routeLatLngs.length < 2) {
      return;
    }

    const map = L.map(containerRef.current, {
      attributionControl: true,
      scrollWheelZoom: false,
      zoomControl: false
    });
    mapRef.current = map;

    L.control.zoom({ position: "topright" }).addTo(map);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map);

    L.polyline(routeLatLngs, {
      color: "#1d1a14",
      opacity: 0.92,
      weight: 7
    }).addTo(map);

    L.polyline(routeLatLngs, {
      color: "#d6822f",
      opacity: 1,
      weight: 4
    }).addTo(map);

    course.checkpoints.forEach((checkpoint) => {
      const waypoint = findCheckpointWaypoint(course, checkpoint.id, checkpoint.kmMarker);
      const isSelected = checkpoint.id === selectedCheckpointId;
      const marker = L.circleMarker([waypoint.lat, waypoint.lon], {
        color: "#ffffff",
        fillColor: isSelected ? "#1b7c55" : "#d6822f",
        fillOpacity: 1,
        radius: isSelected ? 7 : 5,
        weight: 2
      }).addTo(map);

      marker.bindTooltip(`${checkpoint.name}`, {
        className: `course-map-tooltip${isSelected ? " selected" : ""}`,
        direction: "top",
        offset: L.point(0, -12),
        opacity: 0.98,
        permanent: true
      });

      marker.on("click", () => onSelectCheckpoint(checkpoint.id));
    });

    const bounds = L.latLngBounds(routeLatLngs).pad(0.1);
    map.fitBounds(bounds, { animate: false });
    window.setTimeout(() => {
      map.invalidateSize(false);
      map.fitBounds(bounds, { animate: false });
    }, 0);

    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize(false);
      map.fitBounds(bounds, { animate: false });
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      mapRef.current = null;
      map.remove();
    };
  }, [course, onSelectCheckpoint, routeLatLngs, selectedCheckpointId]);

  return <div className="course-inline-map" ref={containerRef} role="img" aria-label={`${course.title} map`} />;
}
