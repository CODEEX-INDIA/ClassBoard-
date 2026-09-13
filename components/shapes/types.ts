import type { Annotation, AnnotationStyle, AnnotationType, Point } from "../../types/annotation";

export type { Annotation, AnnotationStyle, AnnotationType, Point };

export type ShapeComponentProps = {
  annotation: Annotation;
  selected?: boolean;
  onPointerDown: (event: React.PointerEvent, annotation: Annotation) => void;
};
