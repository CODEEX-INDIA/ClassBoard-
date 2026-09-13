"use client";

import { BasicShape } from "./basic-shapes";
import { BrushShape } from "./brush-shape";
import { ConnectorShape } from "./connector-shapes";
import { GraphShape } from "./graph-shape";
import { TextImageShape } from "./text-image-shape";
import type { ShapeComponentProps } from "./types";

export { TransformBoundingBox, type TransformHandle } from "./transform-box";

export function AnnotationShape(props: ShapeComponentProps) {
  const { annotation } = props;

  const brushTypes = ["ink", "calligraphy", "highlighter"];
  const basicShapeTypes = ["rectangle", "ellipse", "triangle", "diamond", "star", "cloud"];
  const connectorTypes = ["line", "arrow"];

  if (brushTypes.includes(annotation.type)) {
    return <BrushShape {...props} />;
  }

  if (basicShapeTypes.includes(annotation.type)) {
    return <BasicShape {...props} />;
  }

  if (connectorTypes.includes(annotation.type)) {
    return <ConnectorShape {...props} />;
  }

  if (annotation.type === "graph") {
    return <GraphShape {...props} />;
  }

  if (annotation.type === "text" || annotation.type === "image") {
    return <TextImageShape {...props} />;
  }

  return <BasicShape {...props} />;
}
