export const ANNOTATION_SCHEMA_VERSION = 1 as const;
export type AnnotationType = "ink" | "pencil" | "marker" | "calligraphy" | "highlighter" | "text" | "line" | "arrow" | "rectangle" | "ellipse" | "cloud" | "underline" | "strikeout" | "text-highlight" | "note" | "image" | "signature" | "laser";
export type Point = { x: number; y: number };
export type AnnotationStyle = { color: string; opacity: number; strokeWidth: number; fill?: string; fontSize?: number };
export type Annotation = { id: string; documentId: string; pageNumber: number; type: AnnotationType; x: number; y: number; width: number; height: number; rotation: number; style: AnnotationStyle; content?: string; points?: Point[]; createdAt: string; updatedAt: string };
export type AnnotationDocument = { schemaVersion: typeof ANNOTATION_SCHEMA_VERSION; documentId: string; annotations: Annotation[]; updatedAt: string };
