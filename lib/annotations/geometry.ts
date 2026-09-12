import type { Point } from "../../types/annotation";
export type PageSize = { width: number; height: number };
export function normalizePoint(point: Point, page: PageSize): Point { return { x: point.x / page.width, y: point.y / page.height }; }
export function denormalizePoint(point: Point, page: PageSize): Point { return { x: point.x * page.width, y: point.y * page.height }; }
export function bounds(points: Point[]) { const xs = points.map(p => p.x), ys = points.map(p => p.y); return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) }; }
export function rotatePoint(point: Point, degrees: 0 | 90 | 180 | 270): Point { if (degrees === 90) return { x: 1 - point.y, y: point.x }; if (degrees === 180) return { x: 1 - point.x, y: 1 - point.y }; if (degrees === 270) return { x: point.y, y: 1 - point.x }; return point; }
