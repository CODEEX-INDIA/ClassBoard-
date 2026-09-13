"use client";

import type { ShapeComponentProps } from "./types";

export function BasicShape({ annotation, selected, onPointerDown }: ShapeComponentProps) {
  const x = annotation.x * 1000;
  const y = annotation.y * 1000;
  const width = annotation.width * 1000;
  const height = annotation.height * 1000;
  const cx = x + width / 2;
  const cy = y + height / 2;
  const rot = annotation.rotation ?? 0;

  const color = annotation.style.color || "#2563eb";
  const fillColor = annotation.style.fill === "none" || !annotation.style.fill ? "none" : annotation.style.fill;
  const strokeWidth = annotation.style.strokeWidth ?? 3;
  const opacity = annotation.style.opacity ?? 1;

  const commonProps = {
    className: selected ? "annotation selected" : "annotation",
    onPointerDown: (e: React.PointerEvent) => onPointerDown(e, annotation),
    transform: rot ? `rotate(${rot} ${cx} ${cy})` : undefined,
    stroke: color,
    strokeWidth,
    fill: fillColor,
    opacity,
  };

  switch (annotation.type) {
    case "rectangle":
      return <rect x={x} y={y} width={width} height={height} rx={4} ry={4} {...commonProps} />;

    case "ellipse":
      return <ellipse cx={cx} cy={cy} rx={Math.abs(width / 2)} ry={Math.abs(height / 2)} {...commonProps} />;

    case "triangle":
      return <polygon points={`${cx},${y} ${x + width},${y + height} ${x},${y + height}`} {...commonProps} />;

    case "diamond":
      return <polygon points={`${cx},${y} ${x + width},${cy} ${cx},${y + height} ${x},${cy}`} {...commonProps} />;

    case "star": {
      const starPoints = Array.from({ length: 10 }, (_, i) => {
        const r = i % 2 ? Math.min(width, height) * 0.2 : Math.min(width, height) * 0.48;
        const angle = -Math.PI / 2 + (i * Math.PI) / 5;
        return `${cx + Math.cos(angle) * r},${cy + Math.sin(angle) * r}`;
      }).join(" ");
      return <polygon points={starPoints} {...commonProps} />;
    }

    case "cloud": {
      const r1 = width * 0.18;
      const r2 = width * 0.24;
      const r3 = width * 0.18;
      return (
        <g {...commonProps}>
          <rect x={x} y={y + height * 0.3} width={width} height={height * 0.65} rx={8} ry={8} stroke={color} strokeWidth={strokeWidth} fill={fillColor} opacity={opacity} />
          <ellipse cx={x + width * 0.25} cy={y + height * 0.35} rx={r1} ry={height * 0.28} stroke={color} strokeWidth={strokeWidth} fill={fillColor} opacity={opacity} />
          <ellipse cx={x + width * 0.5} cy={y + height * 0.22} rx={r2} ry={height * 0.32} stroke={color} strokeWidth={strokeWidth} fill={fillColor} opacity={opacity} />
          <ellipse cx={x + width * 0.75} cy={y + height * 0.35} rx={r3} ry={height * 0.28} stroke={color} strokeWidth={strokeWidth} fill={fillColor} opacity={opacity} />
        </g>
      );
    }

    default:
      return <rect x={x} y={y} width={width} height={height} {...commonProps} />;
  }
}
