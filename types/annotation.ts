export const ANNOTATION_SCHEMA_VERSION = 1 as const;

export type BrushType = "ink" | "calligraphy" | "highlighter";
export type EraserType = "stroke-eraser" | "element-eraser" | "partial-eraser";
export type ShapeType = "rectangle" | "ellipse" | "triangle" | "diamond" | "star" | "cloud" | "line" | "arrow" | "graph";

export type AnnotationType =
  | BrushType
  | EraserType
  | ShapeType
  | "text"
  | "image"
  | "underline"
  | "strikeout"
  | "text-highlight"
  | "note"
  | "signature"
  | "laser";

export type Point = { x: number; y: number };
export type AnnotationStyle = { color: string; opacity: number; strokeWidth: number; fill?: string; fontSize?: number; fontFamily?: string };
export type Annotation = { id: string; documentId: string; pageNumber: number; type: AnnotationType; x: number; y: number; width: number; height: number; rotation: number; style: AnnotationStyle; content?: string; points?: Point[]; createdAt: string; updatedAt: string };
export type AnnotationDocument = { schemaVersion: typeof ANNOTATION_SCHEMA_VERSION; documentId: string; annotations: Annotation[]; updatedAt: string };
