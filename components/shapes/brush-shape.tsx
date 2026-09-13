"use client";

import type { ShapeComponentProps } from "./types";

function pointsToSmoothPath(points: { x: number; y: number }[]): string {
  if (!points || points.length === 0) return "";
  if (points.length === 1) {
    const p = points[0];
    return `M ${p.x * 1000} ${p.y * 1000} L ${(p.x + 0.0005) * 1000} ${(p.y + 0.0005) * 1000}`;
  }
  if (points.length === 2) {
    return `M ${points[0].x * 1000} ${points[0].y * 1000} L ${points[1].x * 1000} ${points[1].y * 1000}`;
  }

  let d = `M ${points[0].x * 1000} ${points[0].y * 1000}`;
  for (let i = 1; i < points.length - 1; i++) {
    const xc = (points[i].x + points[i + 1].x) / 2;
    const yc = (points[i].y + points[i + 1].y) / 2;
    d += ` Q ${points[i].x * 1000} ${points[i].y * 1000}, ${xc * 1000} ${yc * 1000}`;
  }
  d += ` L ${points[points.length - 1].x * 1000} ${points[points.length - 1].y * 1000}`;
  return d;
}

export function BrushShape({ annotation, selected, onPointerDown }: ShapeComponentProps) {
  const rot = annotation.rotation ?? 0;
  const cx = (annotation.x + annotation.width / 2) * 1000;
  const cy = (annotation.y + annotation.height / 2) * 1000;

  const points = annotation.points ?? [];
  const pathData = pointsToSmoothPath(points);

  const color = annotation.style.color || "#2563eb";
  const strokeWidth = annotation.style.strokeWidth ?? 3;
  const opacity = annotation.style.opacity ?? 1;

  const commonProps = {
    className: selected ? "annotation selected" : "annotation",
    onPointerDown: (e: React.PointerEvent) => onPointerDown(e, annotation),
    transform: rot ? `rotate(${rot} ${cx} ${cy})` : undefined,
  };

  switch (annotation.type) {
    case "highlighter":
      return (
        <path
          d={pathData}
          stroke={color}
          strokeWidth={Math.max(strokeWidth, 16)}
          fill="none"
          opacity={Math.min(opacity, 0.45)}
          strokeLinecap="square"
          strokeLinejoin="miter"
          style={{ mixBlendMode: "multiply" }}
          {...commonProps}
        />
      );

    case "calligraphy":
      return (
        <path
          d={pathData}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          opacity={opacity}
          strokeLinecap="square"
          strokeLinejoin="bevel"
          {...commonProps}
        />
      );

    case "ink":
    default:
      return (
        <path
          d={pathData}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          opacity={opacity}
          strokeLinecap="round"
          strokeLinejoin="round"
          {...commonProps}
        />
      );
  }
}
