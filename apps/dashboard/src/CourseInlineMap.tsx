import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { DemoCourse } from "./demoCourseVariants";

type Props = {
  course: DemoCourse;
  hoveredKm: number | null;
  selectedCheckpointId: string;
  onSelectCheckpoint: (checkpointId: string) => void;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function findClosestWaypoint(course: DemoCourse, targetKm: number) {
  return course.waypoints.reduce((closest, point) => {
    const distance = Math.abs(point.km - targetKm);
    const currentDistance = Math.abs(closest.km - targetKm);
    return distance < currentDistance ? point : closest;
  }, course.waypoints[0]);
}

function interpolateWaypoint(course: DemoCourse, targetKm: number) {
  if (!course.waypoints.length) {
    return null;
  }

  if (targetKm <= course.waypoints[0].km) {
    return course.waypoints[0];
  }

  if (targetKm >= course.waypoints[course.waypoints.length - 1].km) {
    return course.waypoints[course.waypoints.length - 1];
  }

  const nextIndex = course.waypoints.findIndex((point) => point.km >= targetKm);

  if (nextIndex <= 0) {
    return course.waypoints[0];
  }

  const right = course.waypoints[nextIndex];
  const left = course.waypoints[nextIndex - 1];
  const distance = Math.max(right.km - left.km, 0.001);
  const ratio = clamp((targetKm - left.km) / distance, 0, 1);

  if (ratio <= 0.02) {
    return left;
  }

  if (ratio >= 0.98) {
    return right;
  }

  return {
    id: `hover-${targetKm.toFixed(1)}`,
    name: "Hovered point",
    km: Number(targetKm.toFixed(1)),
    ele: left.ele + (right.ele - left.ele) * ratio,
    lat: left.lat + (right.lat - left.lat) * ratio,
    lon: left.lon + (right.lon - left.lon) * ratio
  };
}

function findCheckpointWaypoint(course: DemoCourse, checkpointId: string, targetKm: number) {
  return course.waypoints.find((point) => point.id === checkpointId) ?? findClosestWaypoint(course, targetKm);
}

export function CourseInlineMap({ course, hoveredKm, selectedCheckpointId, onSelectCheckpoint }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const hoverMarkerRef = useRef<L.CircleMarker | null>(null);

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
      hoverMarkerRef.current = null;
      mapRef.current = null;
      map.remove();
    };
  }, [course, onSelectCheckpoint, routeLatLngs, selectedCheckpointId]);

  useEffect(() => {
    const map = mapRef.current;

    if (!map) {
      return;
    }

    if (hoveredKm === null) {
      hoverMarkerRef.current?.remove();
      hoverMarkerRef.current = null;
      return;
    }

    const hoveredWaypoint = interpolateWaypoint(course, hoveredKm);

    if (!hoveredWaypoint) {
      return;
    }

    const hoveredLatLng = L.latLng(hoveredWaypoint.lat, hoveredWaypoint.lon);

    if (!hoverMarkerRef.current) {
      const marker = L.circleMarker(hoveredLatLng, {
        color: "#ffffff",
        fillColor: "#ef3f2f",
        fillOpacity: 1,
        radius: 8,
        weight: 3
      }).addTo(map);

      marker.bindTooltip(`${hoveredWaypoint.km.toFixed(1)} km`, {
        className: "course-map-hover-tooltip",
        direction: "top",
        offset: L.point(0, -14),
        opacity: 0.98
      });

      hoverMarkerRef.current = marker;
    }

    hoverMarkerRef.current.setLatLng(hoveredLatLng);
    hoverMarkerRef.current.setTooltipContent(`${hoveredWaypoint.km.toFixed(1)} km`);
    hoverMarkerRef.current.openTooltip();
    hoverMarkerRef.current.bringToFront();
  }, [course, hoveredKm]);

  return <div className="course-inline-map" ref={containerRef} role="img" aria-label={`${course.title} map`} />;
}
