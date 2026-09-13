"use client";

import type { ShapeComponentProps } from "./types";

export function BrushShape({ annotation, selected, onPointerDown }: ShapeComponentProps) {
  const rot = annotation.rotation ?? 0;
  const cx = (annotation.x + annotation.width / 2) * 1000;
  const cy = (annotation.y + annotation.height / 2) * 1000;

  const points = annotation.points ?? [];
  const pointsString = points.map(p => `${p.x * 1000},${p.y * 1000}`).join(" ");

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
        <polyline
          points={pointsString}
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
        <g {...commonProps}>
          <polyline
            points={pointsString}
            stroke={color}
            strokeWidth={strokeWidth}
            fill="none"
            opacity={opacity}
            strokeLinecap="square"
            strokeLinejoin="bevel"
          />
        </g>
      );

    case "ink":
    default:
      return (
        <polyline
          points={pointsString}
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
