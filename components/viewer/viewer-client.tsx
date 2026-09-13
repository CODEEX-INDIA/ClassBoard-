"use client";

import { useEffect, useRef, useState, type PointerEvent, type DragEvent } from "react";
import { useSearchParams } from "next/navigation";
import { importDocument } from "../../lib/importers";
import { pdfExporter } from "../../lib/export/pdf-exporter";
import { bounds, normalizePoint } from "../../lib/annotations/geometry";
import { getSupabaseBrowserClient } from "../../lib/supabase/client";
import { createId } from "../../lib/id";
import type { Annotation, AnnotationType, Point } from "../../types/annotation";
import { AnnotationShape, TransformBoundingBox, type TransformHandle } from "../shapes";

const tools: Array<{ id: AnnotationType | "select" | "pan"; label: string; icon: string }> = [
  { id: "select", label: "Select", icon: "↖" },
  { id: "pan", label: "Pan", icon: "✋" },
  { id: "ink", label: "Pen", icon: "✎" },
  { id: "calligraphy", label: "Calli", icon: "✒️" },
  { id: "highlighter", label: "Highlight", icon: "▰" },
  { id: "stroke-eraser", label: "Erase", icon: "⌫" },
  { id: "partial-eraser", label: "Cut", icon: "✂" },
  { id: "rectangle", label: "Rectangle", icon: "□" },
  { id: "ellipse", label: "Circle", icon: "○" },
  { id: "triangle", label: "Triangle", icon: "△" },
  { id: "diamond", label: "Diamond", icon: "◇" },
  { id: "star", label: "Star", icon: "☆" },
  { id: "cloud", label: "Cloud", icon: "☁" },
  { id: "graph", label: "Graph", icon: "📈" },
  { id: "line", label: "Line", icon: "／" },
  { id: "arrow", label: "Arrow", icon: "➜" },
  { id: "text", label: "Text", icon: "T" },
  { id: "image", label: "Image", icon: "🖼" },
];

const strokeColors = ["#000000", "#ffffff", "#2563eb", "#dc2626", "#16a34a", "#ca8a04"];
const fillColors = ["none", "#ffffff", "#1e293b", "#eef4ff", "#e6f4ea", "#fef7e0", "#fce8e6"];
const strokeWidthPresets = [{ label: "Thin", val: 2 }, { label: "Med", val: 4 }, { label: "Thick", val: 10 }];
const fontFamilies = [
  { label: "Inter / Clean", val: "Inter, system-ui, sans-serif" },
  { label: "Arial Bold", val: "Arial, Helvetica, sans-serif" },
  { label: "Caveat / Handwriting", val: "'Caveat', 'Comic Sans MS', cursive" },
  { label: "Roboto / Modern", val: "Roboto, sans-serif" },
  { label: "Georgia / Serif", val: "Georgia, serif" },
  { label: "Courier / Monospace", val: "'Courier New', monospace" },
  { label: "OpenDyslexic / Readable", val: "'OpenDyslexic', 'Comic Sans MS', sans-serif" },
  { label: "Playfair / Classic", val: "'Playfair Display', Georgia, serif" },
];
const fontSizePresets = [18, 28, 36, 48, 64, 80, 96, 120];

const drawingTypes: AnnotationType[] = ["ink", "calligraphy", "highlighter"];
type ViewerPage = { id: string; sourcePage?: number; background: string; aspectRatio?: "16:9" | "4:3" | "portrait" };
const pageLayoutKey = (documentId: string) => `maples-page-layout:${documentId}`;

const shortTitle = (filename: string) => {
  const extension = filename.match(/\.[^.]+$/)?.[0] ?? "";
  const base = filename.slice(0, filename.length - extension.length).replace(/\.+$/, "").trim();
  return base.length > 28 ? `${base.slice(0, 25).trimEnd()}...${extension}` : filename;
};

function PageThumbnail({ pdf, sourcePage, pageNumber, background, active, onClick }: { pdf: any; sourcePage?: number; pageNumber: number; background: string; active: boolean; onClick: () => void }) {
  const thumbnail = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let cancelled = false;
    if (!sourcePage) {
      const canvas = thumbnail.current;
      if (canvas) {
        canvas.width = 160;
        canvas.height = 90;
        const context = canvas.getContext("2d");
        if (context) {
          context.fillStyle = background || "#1e293b";
          context.fillRect(0, 0, canvas.width, canvas.height);
        }
      }
      return () => { cancelled = true; };
    }
    void pdf?.getPage(sourcePage).then((pdfPage: any) => {
      if (cancelled || !thumbnail.current) return;
      const viewport = pdfPage.getViewport({ scale: 0.2 });
      const canvas = thumbnail.current;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      return pdfPage.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
    });
    return () => { cancelled = true; };
  }, [pdf, sourcePage, pageNumber, background]);
  return <button className={`page-thumb ${active ? "active" : ""}`} onClick={onClick} aria-label={`Go to page ${pageNumber}`}><canvas ref={thumbnail} /><span>{pageNumber}</span></button>;
}


export function ViewerClient() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const overlay = useRef<SVGSVGElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const renderTask = useRef<{ cancel: () => void; promise: Promise<void> } | null>(null);
  const renderQueue = useRef(Promise.resolve());
  const searchParams = useSearchParams();

  const [source, setSource] = useState<ArrayBuffer | null>(null);
  const [pdf, setPdf] = useState<any>();
  const [documentId, setDocumentId] = useState<string>();
  const [documentName, setDocumentName] = useState("Untitled presentation");
  const [page, setPage] = useState(1);
  const [pageOrder, setPageOrder] = useState<ViewerPage[]>([]);
  const [tool, setTool] = useState<AnnotationType | "select" | "pan">("select");
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [history, setHistory] = useState<Annotation[][]>([]);
  const [future, setFuture] = useState<Annotation[][]>([]);
  const [draft, setDraft] = useState<Point[] | null>(null);
  const [selectedId, setSelectedId] = useState<string>();
  const [color, setColor] = useState("#2563eb");
  const [fillColor, setFillColor] = useState("none");
  const [fontFamily, setFontFamily] = useState("Inter, system-ui, sans-serif");
  const [fontSize, setFontSize] = useState(32);
  const [opacity, setOpacity] = useState(1.0); // 100% solid opacity by default for clear readable writing
  const [width, setWidth] = useState(3);
  const [size, setSize] = useState(100);
  const [presenting, setPresenting] = useState(false);
  const [status, setStatusRaw] = useState("Cloud sync ready");
  const [statusDismissed, setStatusDismissed] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [propertiesOpen, setPropertiesOpen] = useState(false);
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [textPoints, setTextPoints] = useState<Point[] | null>(null);
  const [textValue, setTextValue] = useState("");
  const [editingId, setEditingId] = useState<string>();
  const [zoomMenuOpen, setZoomMenuOpen] = useState(false);
  const [showPageCounter, setShowPageCounter] = useState(true);
  const pageCounterTimer = useRef<NodeJS.Timeout | null>(null);
  const [eraserSize, setEraserSize] = useState(24);
  const [isErasing, setIsErasing] = useState(false);
  const [eraserPos, setEraserPos] = useState<Point | null>(null);

  const triggerPageCounter = () => {
    setShowPageCounter(true);
    if (pageCounterTimer.current) clearTimeout(pageCounterTimer.current);
    pageCounterTimer.current = setTimeout(() => {
      setShowPageCounter(false);
    }, 2000);
  };

  useEffect(() => {
    triggerPageCounter();
    return () => {
      if (pageCounterTimer.current) clearTimeout(pageCounterTimer.current);
    };
  }, [page]);

  const toggleFullscreen = () => {
    if (typeof document === "undefined") return;
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  const setStatus = (msg: string) => {
    setStatusRaw(msg);
    setStatusDismissed(false);
  };

  // Pan & Zoom state
  const [zoom, setZoom] = useState(1.0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0 });

  // Transform state
  const [transforming, setTransforming] = useState<{
    handle: TransformHandle;
    startPoint: Point;
    initial: { x: number; y: number; width: number; height: number; rotation: number; points?: Point[] };
  } | null>(null);

  const annotationsRef = useRef(annotations);
  useEffect(() => { annotationsRef.current = annotations; }, [annotations]);

  const visible = annotations.filter(annotation => annotation.pageNumber === page);
  const pages = pageOrder.length;
  const currentPage = pageOrder[page - 1];
  const selectedAnnotation = annotations.find(annotation => annotation.id === selectedId);

  // Initialize a new 16:9 Widescreen Blank Presentation
  const initBlankDocument = async (title = "Untitled Slide Presentation") => {
    setPdf(null);
    setSource(null);
    const defaultPages: ViewerPage[] = [{ id: `blank-1`, background: "#1e293b", aspectRatio: "16:9" }];
    let cloudId: string | undefined;
    let client;
    try { client = getSupabaseBrowserClient(); } catch {}
    if (client) {
      const { data: { user } } = await client.auth.getUser();
      if (user) {
        const { data: record } = await client
          .from("documents")
          .insert({ owner_id: user.id, filename: title, document_type: "pdf", storage_path: "blank" })
          .select("id")
          .single();
        if (record) cloudId = record.id;
      }
    }
    const newDocId = cloudId || createId();
    setDocumentId(newDocId);
    setDocumentName(title);
    setPageOrder(defaultPages);
    setPage(1);
    setAnnotations([]);
    setHistory([]);
    setFuture([]);
    setStatus(cloudId ? "Cloud presentation ready" : "16:9 Presentation Canvas ready");
    if (cloudId) {
      void saveCloud([], defaultPages, cloudId);
    }
  };

  const loadPdf = async (data: ArrayBuffer, savedPages?: ViewerPage[]) => {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
    const document = await pdfjs.getDocument({ data: data.slice(0) }).promise;
    setSource(data);
    setPdf(document);
    setPageOrder(savedPages?.length ? savedPages : Array.from({ length: document.numPages }, (_, index) => ({ id: `pdf-${index + 1}`, sourcePage: index + 1, background: "#ffffff" })));
    setPage(1);
  };

  const loadCloudDocument = async (record: { id: string; filename: string; storage_path: string }) => {
    const client = getSupabaseBrowserClient();
    setStatus("Loading from cloud…");

    const { data: rows, error: annotationError } = await client.from("annotations").select("annotation").eq("document_id", record.id);
    if (annotationError) throw annotationError;

    const rawAnnotations = (rows ?? []).map(row => row.annotation as Annotation);
    const layoutRecord = rawAnnotations.find(a => (a.type as string) === "__page_layout__");
    const restoredAnnotations = rawAnnotations
      .filter(a => (a.type as string) !== "__page_layout__")
      .map(a => ({ ...a, documentId: record.id }));

    setDocumentId(record.id);
    setDocumentName(shortTitle(record.filename));
    setAnnotations(restoredAnnotations);

    let savedPages: ViewerPage[] | undefined;
    if (layoutRecord && layoutRecord.content) {
      try {
        savedPages = JSON.parse(layoutRecord.content) as ViewerPage[];
      } catch {
        savedPages = undefined;
      }
    }
    if (!savedPages) {
      try {
        const stored = window.localStorage.getItem(pageLayoutKey(record.id));
        if (stored) savedPages = JSON.parse(stored) as ViewerPage[];
      } catch {
        savedPages = undefined;
      }
    }

    if (record.storage_path === "blank") {
      setPdf(null);
      setSource(null);
      setPageOrder(savedPages?.length ? savedPages : [{ id: "blank-1", background: "#1e293b", aspectRatio: "16:9" }]);
      setPage(1);
      setStatus("Synced across devices");
      return;
    }

    const { data: file, error: fileError } = await client.storage.from("documents").download(record.storage_path);
    if (fileError || !file) throw fileError ?? new Error("The document could not be downloaded.");
    await loadPdf(await file.arrayBuffer(), savedPages);
    setStatus("Synced across devices");
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let client;
      try { client = getSupabaseBrowserClient(); } catch { return; }
      const { data: { user } } = await client.auth.getUser();
      if (!user || cancelled) return;
      const requestedId = searchParams.get("doc");
      const result = requestedId
        ? await client.from("documents").select("id,filename,storage_path").eq("id", requestedId).maybeSingle()
        : await client.from("documents").select("id,filename,storage_path").order("updated_at", { ascending: false }).limit(1).maybeSingle();
      if (result.data && !cancelled) await loadCloudDocument(result.data);
    })().catch(error => { if (!cancelled) setStatus(error instanceof Error ? error.message : "Cloud document unavailable"); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    if (!stage.current) return;
    const observer = new ResizeObserver(([entry]) => setStageSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(stage.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!canvas.current || !currentPage) return;
    let cancelled = false;
    const operation = renderQueue.current.then(async () => {
      if (cancelled) return;
      if (renderTask.current) {
        try { renderTask.current.cancel(); } catch {}
        renderTask.current = null;
      }
      const target = canvas.current!;
      if (!currentPage.sourcePage || !pdf) {
        // Standard 16:9 Widescreen Landscape Presentation Canvas (960x540)
        target.width = 960;
        target.height = 540;
        target.style.aspectRatio = "16/9";
        const context = target.getContext("2d");
        if (context) {
          context.fillStyle = currentPage.background || "#1e293b";
          context.fillRect(0, 0, target.width, target.height);
        }
        return;
      }
      const renderedPage = await pdf.getPage(currentPage.sourcePage);
      if (cancelled) return;
      const baseViewport = renderedPage.getViewport({ scale: 1 });
      const availableWidth = Math.max(320, stageSize.width - 32);
      const availableHeight = Math.max(240, stageSize.height - 32);
      const scale = Math.min(availableWidth / baseViewport.width, availableHeight / baseViewport.height);
      const displayScale = Math.max(0.25, scale);
      const pixelRatio = typeof window !== "undefined" ? Math.max(2, window.devicePixelRatio || 1) : 2;
      const renderViewport = renderedPage.getViewport({ scale: displayScale * pixelRatio });
      target.width = renderViewport.width;
      target.height = renderViewport.height;
      target.style.aspectRatio = `${baseViewport.width}/${baseViewport.height}`;
      const currentRender = renderedPage.render({ canvasContext: target.getContext("2d")!, viewport: renderViewport });
      renderTask.current = { cancel: () => currentRender.cancel(), promise: currentRender.promise };
      try {
        await currentRender.promise;
      } catch (error) {
        const isCancel = error instanceof Error && (error.name === "RenderingCancelledException" || error.message.includes("cancelled") || error.message.includes("canceled"));
        if (!cancelled && !isCancel) throw error;
      } finally {
        if (renderTask.current?.promise === currentRender.promise) renderTask.current = null;
      }
      if (!cancelled && overlay.current) overlay.current.setAttribute("viewBox", "0 0 1000 1000");
    });
    renderQueue.current = operation.catch(() => undefined);
    void operation.catch(error => { if (!cancelled) setStatus(error instanceof Error ? error.message : "Page render failed"); });
    return () => {
      cancelled = true;
      if (renderTask.current) {
        try { renderTask.current.cancel(); } catch {}
        renderTask.current = null;
      }
    };
  }, [pdf, currentPage, page, stageSize]);

  // ─── Keyboard Shortcuts ───────────────────────────────────────────────────
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;

      const ctrl = event.ctrlKey || event.metaKey;

      if (ctrl && !event.shiftKey && event.key === "z") {
        event.preventDefault();
        setHistory(current => {
          if (!current.length) return current;
          const previous = current.at(-1)!;
          setFuture(f => [annotationsRef.current, ...f]);
          setAnnotations(previous);
          void saveCloud(previous);
          return current.slice(0, -1);
        });
      } else if (ctrl && (event.key === "y" || (event.shiftKey && event.key === "z"))) {
        event.preventDefault();
        setFuture(current => {
          if (!current.length) return current;
          const next = current[0];
          setHistory(h => [...h, annotationsRef.current]);
          setAnnotations(next);
          void saveCloud(next);
          return current.slice(1);
        });
      } else if (event.key === "Delete" || event.key === "Backspace") {
        setSelectedId(current => {
          if (!current) return current;
          const next = annotationsRef.current.filter(a => a.id !== current);
          setHistory(h => [...h, annotationsRef.current]);
          setAnnotations(next);
          setFuture([]);
          void saveCloud(next);
          return undefined;
        });
      } else if (event.key === "Escape") {
        setSelectedId(undefined);
        setDraft(null);
        setTextPoints(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveCloud = async (next: Annotation[], customPageOrder?: ViewerPage[], targetDocId?: string) => {
    const activeDocId = targetDocId || documentId;
    if (!activeDocId) return;
    let client;
    try { client = getSupabaseBrowserClient(); } catch { return; }
    setStatus("Saving…");
    const pagesToSave = customPageOrder || pageOrder;
    const rawUuid = activeDocId.replace(/-/g, "").padEnd(32, "0").slice(0, 32);
    const layoutId = `${rawUuid.slice(0, 8)}-${rawUuid.slice(8, 12)}-${rawUuid.slice(12, 16)}-${rawUuid.slice(16, 20)}-${rawUuid.slice(20, 32)}`;

    const layoutAnnotation: Annotation = {
      id: layoutId,
      documentId: activeDocId,
      pageNumber: 1,
      type: "__page_layout__" as AnnotationType,
      x: 0, y: 0, width: 0, height: 0, rotation: 0,
      style: { color: "none", opacity: 0, strokeWidth: 0 },
      content: JSON.stringify(pagesToSave),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const allAnnotationsToSave = [layoutAnnotation, ...next];
    const { error: removeError } = await client.from("annotations").delete().eq("document_id", activeDocId);
    if (removeError) throw removeError;
    const { error } = await client.from("annotations").insert(
      allAnnotationsToSave.map(annotation => ({
        id: annotation.id,
        document_id: activeDocId,
        page_number: annotation.pageNumber,
        schema_version: 1,
        annotation,
        updated_at: annotation.updatedAt,
      }))
    );
    if (error) throw error;
    await client.from("documents").update({ updated_at: new Date().toISOString() }).eq("id", activeDocId);
    setStatus("Saved to cloud");
  };

  const commit = (next: Annotation[]) => {
    setHistory(current => [...current, annotations]);
    setAnnotations(next);
    setFuture([]);
    void saveCloud(next).catch(error => setStatus(error instanceof Error ? error.message : "Cloud save failed"));
  };

  // Applies erase locally without cloud save — used on every pointer-move.
  // A single commit() is called on pointer-up to persist to cloud.
  const annotationsForErase = useRef(annotations);
  useEffect(() => { annotationsForErase.current = annotations; }, [annotations]);

  const applyEraseLocally = (p: Point): Annotation[] | null => {
    const radius = eraserSize / 1000;
    let modified = false;
    const nextAnnots: Annotation[] = [];
    const current = annotationsForErase.current;

    for (const a of current) {
      if (a.pageNumber !== page) {
        nextAnnots.push(a);
        continue;
      }

      if (tool === "stroke-eraser") {
        let hit = false;
        if (a.points && a.points.length > 0) {
          hit = a.points.some(pt => Math.hypot(pt.x - p.x, pt.y - p.y) <= radius);
        } else {
          hit = p.x >= a.x - radius && p.x <= a.x + a.width + radius && p.y >= a.y - radius && p.y <= a.y + a.height + radius;
        }
        if (hit) { modified = true; } else { nextAnnots.push(a); }
      } else if (tool === "partial-eraser") {
        if (a.points && a.points.length > 0) {
          let changedThisAnnot = false;
          const subStrokes: Point[][] = [];
          let currentSub: Point[] = [];
          for (const pt of a.points) {
            if (Math.hypot(pt.x - p.x, pt.y - p.y) <= radius) {
              changedThisAnnot = true;
              if (currentSub.length >= 2) subStrokes.push(currentSub);
              currentSub = [];
            } else {
              currentSub.push(pt);
            }
          }
          if (currentSub.length >= 2) subStrokes.push(currentSub);

          if (changedThisAnnot) {
            modified = true;
            for (const sub of subStrokes) {
              const minX = Math.min(...sub.map(pt => pt.x));
              const maxX = Math.max(...sub.map(pt => pt.x));
              const minY = Math.min(...sub.map(pt => pt.y));
              const maxY = Math.max(...sub.map(pt => pt.y));
              nextAnnots.push({ ...a, id: createId(), x: minX, y: minY, width: Math.max(maxX - minX, 0.005), height: Math.max(maxY - minY, 0.005), points: sub, updatedAt: new Date().toISOString() });
            }
          } else { nextAnnots.push(a); }
        } else {
          const hit = p.x >= a.x - radius && p.x <= a.x + a.width + radius && p.y >= a.y - radius && p.y <= a.y + a.height + radius;
          if (hit) { modified = true; } else { nextAnnots.push(a); }
        }
      } else { nextAnnots.push(a); }
    }

    if (modified) {
      annotationsForErase.current = nextAnnots;
      setAnnotations(nextAnnots);
      return nextAnnots;
    }
    return null;
  };

  const open = async (file: File) => {
    let client;
    try {
      client = getSupabaseBrowserClient();
    } catch {
      setStatus("Supabase is not configured — viewing locally.");
      const imported = await importDocument(file);
      await loadPdf(imported.data);
      return;
    }
    const imported = await importDocument(file);
    const { data: { user } } = await client.auth.getUser();
    if (!user) {
      await loadPdf(imported.data);
      setDocumentName(shortTitle(imported.name));
      setStatus("Local file loaded (sign in to save cloud revisions)");
      return;
    }
    const path = `${user.id}/${createId()}-${imported.name}`;
    const { error: uploadError } = await client.storage.from("documents").upload(path, new Blob([imported.data], { type: imported.mimeType }), { contentType: imported.mimeType });
    if (uploadError) throw uploadError;
    const { data: record, error: documentError } = await client.from("documents").insert({ owner_id: user.id, filename: imported.name, document_type: imported.sourceType, storage_path: path }).select("id,filename,storage_path").single();
    if (documentError || !record) throw documentError ?? new Error("Could not create the cloud document.");
    setAnnotations([]);
    setHistory([]);
    setFuture([]);
    await loadCloudDocument(record);
  };

  const point = (event: PointerEvent): Point => {
    const rectangle = overlay.current!.getBoundingClientRect();
    return normalizePoint({ x: event.clientX - rectangle.left, y: event.clientY - rectangle.top }, { width: rectangle.width, height: rectangle.height });
  };

  const finish = (event: PointerEvent) => {
    if (!draft || !overlay.current || tool === "select" || tool === "pan" || tool.includes("eraser")) return;
    const points = [...draft, point(event)];
    let rawBox = bounds(points);

    // If tap/click on canvas for shapes/text, use default shape dimensions centered at tap position
    const isClick = rawBox.width < 0.02 && rawBox.height < 0.02;
    if (isClick && !drawingTypes.includes(tool as AnnotationType)) {
      const defaultW = tool === "graph" ? 0.35 : tool === "text" ? 0.22 : tool === "line" || tool === "arrow" ? 0.25 : 0.18;
      const defaultH = tool === "graph" ? 0.25 : tool === "text" ? 0.08 : tool === "line" || tool === "arrow" ? 0.12 : 0.14;
      const pt = points[0];
      rawBox = {
        x: Math.max(0, Math.min(1 - defaultW, pt.x - defaultW / 2)),
        y: Math.max(0, Math.min(1 - defaultH, pt.y - defaultH / 2)),
        width: defaultW,
        height: defaultH,
      };
    }

    const strokeW = tool === "highlighter" ? Math.max(width, 14) : width;
    const currentOpacity = tool === "highlighter" ? Math.min(opacity, 0.45) : opacity;

    let pts: Point[] | undefined = undefined;
    if (drawingTypes.includes(tool as AnnotationType)) {
      pts = points;
    } else if (tool === "line" || tool === "arrow") {
      pts = isClick
        ? [{ x: rawBox.x, y: rawBox.y }, { x: rawBox.x + rawBox.width, y: rawBox.y + rawBox.height }]
        : points;
    }

    const createdId = createId();
    const annotation: Annotation = {
      id: createdId,
      documentId: documentId ?? "",
      pageNumber: page,
      type: tool,
      ...rawBox,
      rotation: 0,
      style: { color, fill: fillColor, opacity: currentOpacity, strokeWidth: strokeW, fontSize, fontFamily },
      content: tool === "text" ? "New Text" : undefined,
      points: pts,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    commit([...annotations, annotation]);
    setDraft(null);

    // Auto-select the newly added shape/annotation directly after creation
    setSelectedId(createdId);
    setTool("select");
    setPropertiesOpen(true);
  };

  const handleImageFile = (file: File, dropPoint?: Point) => {
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = e => {
      const dataUrl = e.target?.result as string;
      if (!dataUrl) return;
      const img = new Image();
      img.onload = () => {
        const aspect = img.height / (img.width || 1);
        const w = 0.35;
        const h = Math.max(0.08, Math.min(0.6, w * aspect));
        const posX = dropPoint ? Math.max(0, dropPoint.x - w / 2) : 0.325;
        const posY = dropPoint ? Math.max(0, dropPoint.y - h / 2) : 0.2;
        const annotation: Annotation = {
          id: createId(),
          documentId: documentId ?? "",
          pageNumber: page,
          type: "image",
          x: posX,
          y: posY,
          width: w,
          height: h,
          rotation: 0,
          style: { color: "#000000", opacity: 1, strokeWidth: 0 },
          content: dataUrl,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        commit([...annotations, annotation]);
        setSelectedId(annotation.id);
        setTool("select");
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  const handleCanvasDrop = (event: DragEvent<SVGSVGElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file && file.type.startsWith("image/")) {
      const rectangle = overlay.current!.getBoundingClientRect();
      const dropPoint = normalizePoint({ x: event.clientX - rectangle.left, y: event.clientY - rectangle.top }, { width: rectangle.width, height: rectangle.height });
      handleImageFile(file, dropPoint);
    }
  };

  const submitText = () => {
    if (!textPoints || !textValue.trim()) { setTextPoints(null); return; }
    const rawBox = bounds(textPoints);
    const box = { ...rawBox, width: Math.max(rawBox.width, 0.12), height: Math.max(rawBox.height, 0.05) };
    if (editingId) commit(annotations.map(annotation => annotation.id === editingId ? { ...annotation, ...box, content: textValue.trim(), style: { ...annotation.style, fontFamily, fontSize }, updatedAt: new Date().toISOString() } : annotation));
    else {
      const annotation: Annotation = { id: createId(), documentId: documentId ?? "", pageNumber: page, type: "text", ...box, rotation: 0, style: { color, opacity, strokeWidth: width, fontSize, fontFamily }, content: textValue.trim(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      commit([...annotations, annotation]);
    }
    setTextPoints(null);
    setTextValue("");
    setEditingId(undefined);
  };

  const deleteAnnotation = (annotationId: string) => commit(annotations.filter(annotation => annotation.id !== annotationId));

  // eraseAtPoint: apply erase visually without cloud save (done on pointer-up)
  const eraseAtPoint = (p: Point) => applyEraseLocally(p);

  const resizeSelected = (value: number) => {
    setSize(value);
    if (!selectedId) return;
    const current = annotations.find(annotation => annotation.id === selectedId);
    if (!current) return;
    const factor = value / size;
    const next = annotations.map(annotation => annotation.id === selectedId ? { ...annotation, width: current.width * factor, height: current.height * factor, style: { ...annotation.style, fontSize: (annotation.style.fontSize ?? 32) * factor }, updatedAt: new Date().toISOString() } : annotation);
    setAnnotations(next);
    void saveCloud(next).catch(error => setStatus(error instanceof Error ? error.message : "Cloud save failed"));
  };

  const updateSelected = (patch: Omit<Partial<Annotation>, "style"> & { style?: Partial<Annotation["style"]> }) => {
    if (!selectedId) return;
    commit(annotations.map(annotation => annotation.id === selectedId ? { ...annotation, ...patch, style: { ...annotation.style, ...patch.style }, updatedAt: new Date().toISOString() } : annotation));
  };

  const editSelected = () => {
    if (!selectedAnnotation || selectedAnnotation.type !== "text") return;
    setEditingId(selectedAnnotation.id);
    setTextValue(selectedAnnotation.content ?? "");
    setFontFamily(selectedAnnotation.style.fontFamily || "Inter, system-ui, sans-serif");
    setFontSize(selectedAnnotation.style.fontSize || 32);
    setTextPoints([{ x: selectedAnnotation.x, y: selectedAnnotation.y }, { x: selectedAnnotation.x + selectedAnnotation.width, y: selectedAnnotation.y + selectedAnnotation.height }]);
  };

  const duplicateSelected = () => {
    if (!selectedAnnotation) return;
    const copy = { ...selectedAnnotation, id: createId(), x: Math.min(0.9, selectedAnnotation.x + 0.03), y: Math.min(0.9, selectedAnnotation.y + 0.03), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    commit([...annotations, copy]);
    setSelectedId(copy.id);
  };

  const addBlankPage = () => {
    const insertAt = page;
    const next = [...pageOrder];
    next.splice(insertAt, 0, { id: createId(), background: "#1e293b", aspectRatio: "16:9" });
    const nextAnnotations = annotations.map(annotation => annotation.pageNumber > page ? { ...annotation, pageNumber: annotation.pageNumber + 1 } : annotation);
    setPageOrder(next);
    setAnnotations(nextAnnotations);
    if (documentId) window.localStorage.setItem(pageLayoutKey(documentId), JSON.stringify(next));
    setPage(insertAt + 1);
    void saveCloud(nextAnnotations, next);
  };

  const reorderPage = (direction: -1 | 1) => {
    const from = page - 1;
    const to = from + direction;
    if (to < 0 || to >= pageOrder.length) return;
    const nextPages = [...pageOrder];
    [nextPages[from], nextPages[to]] = [nextPages[to], nextPages[from]];
    const nextAnnotations = annotations.map(annotation => annotation.pageNumber === from + 1 ? { ...annotation, pageNumber: to + 1 } : annotation.pageNumber === to + 1 ? { ...annotation, pageNumber: from + 1 } : annotation);
    setPageOrder(nextPages);
    if (documentId) window.localStorage.setItem(pageLayoutKey(documentId), JSON.stringify(nextPages));
    setAnnotations(nextAnnotations);
    setPage(to + 1);
    void saveCloud(nextAnnotations, nextPages);
  };

  const deletePage = (indexToDelete?: number) => {
    const targetIdx = indexToDelete !== undefined ? indexToDelete : page - 1;
    if (targetIdx < 0 || targetIdx >= pageOrder.length) return;

    if (pageOrder.length <= 1) {
      if (window.confirm("This is the only page in the document. Do you want to clear all annotations and reset this page?")) {
        const nextAnnotations = annotations.filter(a => a.pageNumber !== 1);
        const resetPageOrder: ViewerPage[] = [{ id: pageOrder[0]?.id || createId(), background: "#1e293b", aspectRatio: "16:9" }];
        setAnnotations(nextAnnotations);
        setPageOrder(resetPageOrder);
        setPage(1);
        if (documentId) window.localStorage.setItem(pageLayoutKey(documentId), JSON.stringify(resetPageOrder));
        void saveCloud(nextAnnotations, resetPageOrder);
      }
      return;
    }

    const targetPageNum = targetIdx + 1;
    const nextPages = pageOrder.filter((_, idx) => idx !== targetIdx);

    const nextAnnotations = annotations
      .filter(annotation => annotation.pageNumber !== targetPageNum)
      .map(annotation => annotation.pageNumber > targetPageNum ? { ...annotation, pageNumber: annotation.pageNumber - 1 } : annotation);

    const newActivePage = Math.max(1, Math.min(page > targetPageNum ? page - 1 : page, nextPages.length));

    setPageOrder(nextPages);
    setAnnotations(nextAnnotations);
    setPage(newActivePage);
    if (documentId) window.localStorage.setItem(pageLayoutKey(documentId), JSON.stringify(nextPages));
    void saveCloud(nextAnnotations, nextPages);
  };

  const changePageBackground = (background: string) => setPageOrder(current => {
    const next = current.map((item, index) => index === page - 1 ? { ...item, background } : item);
    if (documentId) window.localStorage.setItem(pageLayoutKey(documentId), JSON.stringify(next));
    void saveCloud(annotations, next);
    return next;
  });

  // ─── Transform Pointer Handlers (Resize / Move / Rotate) ──────────────────
  const startTransform = (event: PointerEvent, handle: TransformHandle, annotation: Annotation) => {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelectedId(annotation.id);
    setPropertiesOpen(true);
    setTransforming({
      handle,
      startPoint: point(event),
      initial: {
        x: annotation.x,
        y: annotation.y,
        width: annotation.width,
        height: annotation.height,
        rotation: annotation.rotation ?? 0,
        points: annotation.points ? [...annotation.points] : undefined,
      },
    });
  };

  const updateTransform = (event: PointerEvent) => {
    if (!transforming || !selectedId) return;
    const currentP = point(event);
    const dx = currentP.x - transforming.startPoint.x;
    const dy = currentP.y - transforming.startPoint.y;
    const init = transforming.initial;

    if (transforming.handle === "body") {
      const newX = Math.max(0, Math.min(1 - init.width, init.x + dx));
      const newY = Math.max(0, Math.min(1 - init.height, init.y + dy));
      const shiftX = newX - init.x;
      const shiftY = newY - init.y;
      setAnnotations(curr => curr.map(a => a.id === selectedId ? {
        ...a,
        x: newX,
        y: newY,
        points: init.points?.map(p => ({ x: Math.max(0, Math.min(1, p.x + shiftX)), y: Math.max(0, Math.min(1, p.y + shiftY)) })),
      } : a));
    } else if (transforming.handle === "rotate") {
      const cx = init.x + init.width / 2;
      const cy = init.y + init.height / 2;
      const angleRad = Math.atan2(currentP.y - cy, currentP.x - cx);
      const degrees = Math.round((angleRad * (180 / Math.PI) + 90 + 360) % 360);
      setAnnotations(curr => curr.map(a => a.id === selectedId ? { ...a, rotation: degrees } : a));
    } else {
      let newX = init.x;
      let newY = init.y;
      let newW = init.width;
      let newH = init.height;

      const h = transforming.handle;
      if (h.includes("w")) { newX = Math.min(init.x + init.width - 0.02, init.x + dx); newW = init.x + init.width - newX; }
      if (h.includes("e")) { newW = Math.max(0.02, init.width + dx); }
      if (h.includes("n")) { newY = Math.min(init.y + init.height - 0.02, init.y + dy); newH = init.y + init.height - newY; }
      if (h.includes("s")) { newH = Math.max(0.02, init.height + dy); }

      let scaledPoints: Point[] | undefined = undefined;
      if (init.points && init.width > 0 && init.height > 0) {
        scaledPoints = init.points.map(p => ({
          x: newX + ((p.x - init.x) / init.width) * newW,
          y: newY + ((p.y - init.y) / init.height) * newH,
        }));
      }

      let scaledFontSize = selectedAnnotation?.type === "text" ? selectedAnnotation.style.fontSize : undefined;
      if (selectedAnnotation?.type === "text" && init.height > 0) {
        const scaleFactor = newH / init.height;
        const initialFS = selectedAnnotation.style.fontSize ?? 32;
        scaledFontSize = Math.max(12, Math.min(160, Math.round(initialFS * scaleFactor)));
      }

      setAnnotations(curr => curr.map(a => a.id === selectedId ? {
        ...a,
        x: newX,
        y: newY,
        width: newW,
        height: newH,
        points: scaledPoints,
        style: a.type === "text" && scaledFontSize ? { ...a.style, fontSize: scaledFontSize } : a.style,
      } : a));
    }
  };

  const endTransform = () => {
    if (transforming) {
      setTransforming(null);
      void saveCloud(annotationsRef.current);
    }
  };

  const isErrorStatus = status.toLowerCase().includes("failed") || status.toLowerCase().includes("unavailable") || status.toLowerCase().includes("error");

  return (
    <main className={presenting ? "viewer presenting" : "viewer"}>
      {/* Hidden file input for images */}
      <input ref={imageInputRef} type="file" hidden accept="image/*" onChange={e => { const f = e.target.files?.[0]; if (f) handleImageFile(f); e.target.value = ""; }} />

      <header className="viewer-header">
        <a href="/dashboard" className="viewer-brand">← MAPLES <span>ACADEMY</span></a>
        <div className="document-title">
          <strong>{documentName}</strong>
          {status && !statusDismissed && (
            <small className={`status-badge ${isErrorStatus ? "has-error" : ""}`}>
              <span>{status}</span>
              <button type="button" className="status-dismiss" onClick={() => setStatusDismissed(true)} title="Dismiss message">✕</button>
            </small>
          )}
        </div>
        <button type="button" className="secondary" onClick={() => initBlankDocument("New 16:9 Slide Presentation")}>＋ New Blank Presentation</button>
        <label className="upload">Open PDF<input type="file" hidden accept=".pdf,application/pdf" onChange={event => event.target.files?.[0] && open(event.target.files[0]).catch(error => setStatus(error.message))} /></label>
        <button onClick={() => setPresenting(value => !value)}>{presenting ? "Exit presentation" : "Present"}</button>
      </header>

      {(pdf || pageOrder.length > 0) ? (
        <div className={`viewer-body ${sidebarOpen ? "" : "sidebar-collapsed"}`}>
          <aside className="page-sidebar">
            <button className="sidebar-toggle" aria-label={sidebarOpen ? "Collapse page thumbnails" : "Expand page thumbnails"} onClick={() => setSidebarOpen(value => !value)}>{sidebarOpen ? "◀" : "▶"}</button>
            {sidebarOpen && (
              <>
                <strong>Pages</strong>
                <div className="page-sidebar-actions">
                  <button onClick={addBlankPage}>＋ Blank page</button>
                  <button onClick={() => reorderPage(-1)} disabled={page === 1}>↑ Move page</button>
                  <button onClick={() => reorderPage(1)} disabled={page === pages}>↓ Move page</button>
                  <button onClick={() => deletePage()} disabled={pageOrder.length <= 1} className="delete-page-btn">🗑 Delete page</button>
                </div>
                {pageOrder.map((item, index) => (
                  <PageThumbnail key={item.id} pdf={pdf} sourcePage={item.sourcePage} pageNumber={index + 1} background={item.background} active={page === index + 1} onClick={() => setPage(index + 1)} />
                ))}
              </>
            )}
          </aside>

          <section className="viewer-workspace">
            {/* Collapsible Icon Zoom Controls */}
            <div className="zoom-controls-wrapper">
              <button
                className={`zoom-toggle-btn ${zoomMenuOpen ? "active" : ""}`}
                title="Display & Zoom Options"
                onClick={() => setZoomMenuOpen(prev => !prev)}
              >
                <span>🔍 {Math.round(zoom * 100)}%</span>
                <small>▾</small>
              </button>

              {zoomMenuOpen && (
                <div className="zoom-popover-menu">
                  <div className="zoom-menu-row">
                    <button title="Zoom Out" onClick={() => setZoom(z => Math.max(0.25, +(z - 0.15).toFixed(2)))}>–</button>
                    <span className="zoom-val" onClick={() => { setZoom(1.0); setPan({ x: 0, y: 0 }); }}>{Math.round(zoom * 100)}%</span>
                    <button title="Zoom In" onClick={() => setZoom(z => Math.min(4.0, +(z + 0.15).toFixed(2)))}>+</button>
                  </div>
                  <div className="zoom-menu-divider" />
                  <button className="zoom-menu-item" onClick={() => { setZoom(1.0); setPan({ x: 0, y: 0 }); setZoomMenuOpen(false); }}>
                    ⛶ Fit to Screen
                  </button>
                  <button className="zoom-menu-item" onClick={() => { toggleFullscreen(); setZoomMenuOpen(false); }}>
                    {isFullscreen ? "🗗 Exit Fullscreen" : "⛶ Fullscreen"}
                  </button>
                </div>
              )}
            </div>

            <div
              className="stage"
              ref={stage}
              onPointerDown={e => {
                if (tool === "pan" || e.button === 1) {
                  setIsPanning(true);
                  panStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
                  e.currentTarget.setPointerCapture(e.pointerId);
                }
              }}
              onPointerMove={e => {
                if (isPanning) {
                  setPan({ x: e.clientX - panStart.current.x, y: e.clientY - panStart.current.y });
                }
              }}
              onPointerUp={() => setIsPanning(false)}
              onWheel={e => {
                if (e.ctrlKey || e.metaKey) {
                  e.preventDefault();
                  const delta = e.deltaY > 0 ? -0.1 : 0.1;
                  setZoom(z => Math.max(0.25, Math.min(4.0, +(z + delta).toFixed(2))));
                }
              }}
            >
              <button className="page-nav" aria-label="Previous slide" disabled={page === 1} onClick={() => setPage(value => value - 1)}>‹</button>

              <div
                className="page-frame"
                style={{
                  transform: zoom !== 1 || pan.x !== 0 || pan.y !== 0 ? `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)` : undefined,
                  transformOrigin: "center center",
                  transition: isPanning ? "none" : "transform 0.1s cubic-bezier(0,0,0.2,1)",
                }}
              >
                <div
                  className={`page-counter ${showPageCounter ? "visible" : ""}`}
                  onMouseEnter={triggerPageCounter}
                  onTouchStart={triggerPageCounter}
                >
                  <button aria-label="Previous page" disabled={page === 1} onClick={() => setPage(value => value - 1)}>‹</button>
                  <span>Page {page} / {pages}</span>
                  <button aria-label="Next page" disabled={page === pages} onClick={() => setPage(value => value + 1)}>›</button>
                </div>

                <div className="page">
                  <canvas ref={canvas} />
                  <svg
                    ref={overlay}
                    viewBox="0 0 1000 1000"
                    preserveAspectRatio="none"
                    style={{ touchAction: "none", userSelect: "none", WebkitUserSelect: "none" }}
                    onDragOver={e => e.preventDefault()}
                    onDrop={handleCanvasDrop}
                    onPointerDown={event => {
                      const pt = point(event);
                      if (tool.includes("eraser")) {
                        setIsErasing(true);
                        setEraserPos(pt);
                        eraseAtPoint(pt);
                      } else if (tool !== "select" && tool !== "pan") {
                        try { event.currentTarget.setPointerCapture(event.pointerId); } catch {}
                        setDraft([pt]);
                      } else if (tool === "select") {
                        setSelectedId(undefined);
                      }
                    }}
                    onPointerMove={event => {
                      const pt = point(event);
                      if (tool.includes("eraser")) {
                        setEraserPos(pt);
                        if (isErasing || event.buttons === 1) {
                          eraseAtPoint(pt);
                        }
                      } else if (transforming) updateTransform(event);
                      else if (draft) setDraft(current => current ? [...current, pt] : null);
                    }}
                    onPointerUp={event => {
                      if (tool.includes("eraser")) {
                        setIsErasing(false);
                        setEraserPos(null);
                        // Single cloud commit after drag ends — avoids concurrent save races
                        const final = annotationsForErase.current;
                        setHistory(h => [...h, annotations]);
                        setFuture([]);
                        void saveCloud(final).catch(err => setStatus(err instanceof Error ? err.message : "Cloud save failed"));
                      }
                      if (event.currentTarget.hasPointerCapture && event.currentTarget.hasPointerCapture(event.pointerId)) {
                        try { event.currentTarget.releasePointerCapture(event.pointerId); } catch {}
                      }
                      if (transforming) endTransform();
                      finish(event);
                    }}
                    onPointerCancel={event => {
                      if (tool.includes("eraser")) {
                        setIsErasing(false);
                        setEraserPos(null);
                        const final = annotationsForErase.current;
                        setHistory(h => [...h, annotations]);
                        setFuture([]);
                        void saveCloud(final).catch(err => setStatus(err instanceof Error ? err.message : "Cloud save failed"));
                      }
                      if (event.currentTarget.hasPointerCapture && event.currentTarget.hasPointerCapture(event.pointerId)) {
                        try { event.currentTarget.releasePointerCapture(event.pointerId); } catch {}
                      }
                      if (transforming) endTransform();
                      finish(event);
                    }}
                    onPointerLeave={() => {
                      if (isErasing) {
                        const final = annotationsForErase.current;
                        setHistory(h => [...h, annotations]);
                        setFuture([]);
                        void saveCloud(final).catch(err => setStatus(err instanceof Error ? err.message : "Cloud save failed"));
                      }
                      setEraserPos(null);
                      setIsErasing(false);
                    }}
                  >
                    <defs>
                      <marker id="arrowhead" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto" markerUnits="strokeWidth">
                        <path d="M0,0 L0,6 L8,3 Z" fill="context-stroke" />
                      </marker>
                    </defs>
                    {visible.map(annotation => (
                      <AnnotationShape
                        key={annotation.id}
                        annotation={annotation}
                        selected={selectedId === annotation.id}
                        onPointerDown={(e, a) => {
                          if (tool.includes("eraser")) {
                            setIsErasing(true);
                            eraseAtPoint(point(e));
                          } else if (tool === "select") startTransform(e, "body", a);
                        }}
                      />
                    ))}
                    {/* Bounding box & interactive transform handles for selected element */}
                    {selectedAnnotation && (
                      <TransformBoundingBox
                        annotation={selectedAnnotation}
                        onStartTransform={startTransform}
                      />
                    )}
                    {draft && <polyline className="draft" points={draft.map(current => `${current.x * 1000},${current.y * 1000}`).join(" ")} />}
                    {eraserPos && tool.includes("eraser") && (
                      <circle
                        cx={eraserPos.x * 1000}
                        cy={eraserPos.y * 1000}
                        r={eraserSize}
                        fill="rgba(239, 68, 68, 0.18)"
                        stroke="#ef4444"
                        strokeWidth="2"
                        strokeDasharray="4 3"
                        pointerEvents="none"
                      />
                    )}
                  </svg>
                </div>
              </div>

              <button className="page-nav" aria-label="Next slide" disabled={page === pages} onClick={() => setPage(value => value + 1)}>›</button>
            </div>

            {/* Collapsed Trigger Pill & Edge Target for Smartboards */}
            {dockCollapsed && (
              <>
                <div
                  className="dock-edge-target"
                  onClick={() => setDockCollapsed(false)}
                  onTouchStart={() => setDockCollapsed(false)}
                  title="Swipe up or tap to expand toolbar"
                />
                <button
                  type="button"
                  className="dock-trigger-pill"
                  onClick={() => setDockCollapsed(false)}
                  onTouchEnd={e => { e.preventDefault(); setDockCollapsed(false); }}
                  title="Expand Drawing Toolbar"
                  aria-label="Expand Drawing Toolbar"
                >
                  <span>▲ Drawing Tools</span>
                </button>
              </>
            )}

            {/* Bottom Dock Controls */}
            <div className={`control-dock ${dockCollapsed ? "collapsed" : ""}`}>
              <button
                type="button"
                className="dock-toggle-btn"
                onClick={() => setDockCollapsed(true)}
                title="Collapse toolbar for full presentation view"
                aria-label="Collapse toolbar"
              >
                ▼ Hide Toolbar
              </button>
              <div className="tool-group">
                {tools.map(item => (
                  <button
                    className={tool === item.id ? "tool-active" : ""}
                    key={item.id}
                    title={item.label}
                    aria-label={item.label}
                    onClick={() => {
                      if (item.id === "image") {
                        imageInputRef.current?.click();
                        return;
                      }
                      setTool(item.id);
                      if (item.id === "calligraphy" || item.id === "ink") {
                        setOpacity(1.0); // 100% solid opacity for dark clear handwriting
                        if (width > 8) setWidth(3); // 3px precision line thickness
                      } else if (item.id === "highlighter") {
                        setOpacity(0.45); // semi-transparent for text highlighting
                        if (width < 8) setWidth(14);
                      }
                      setPropertiesOpen(!item.id.includes("eraser") && item.id !== "pan");
                    }}
                  >
                    <span>{item.icon}</span>
                    <small>{item.label}</small>
                  </button>
                ))}
              </div>

              {propertiesOpen && (
                <div className="properties-popover">
                  {selectedAnnotation && (
                    <>
                      <button onClick={editSelected} disabled={selectedAnnotation.type !== "text"}>Edit text</button>
                      <button onClick={duplicateSelected}>Duplicate</button>
                      <button className="delete-action" onClick={() => { deleteAnnotation(selectedAnnotation.id); setSelectedId(undefined); }}>Delete</button>
                    </>
                  )}

                  {tool.includes("eraser") && (
                    <label>
                      Eraser Size ({eraserSize}px)
                      <div className="stroke-presets">
                        {[12, 24, 40, 60].map(sz => (
                          <button
                            key={sz}
                            type="button"
                            className={`stroke-btn ${eraserSize === sz ? "active" : ""}`}
                            onClick={() => setEraserSize(sz)}
                          >
                            {sz === 12 ? "Small" : sz === 24 ? "Med" : sz === 40 ? "Large" : "XL"}
                          </button>
                        ))}
                      </div>
                      <input aria-label="Eraser size" type="range" min="10" max="60" value={eraserSize} onChange={e => setEraserSize(+e.target.value)} />
                    </label>
                  )}

                  {/* Font & Text Size Controls */}
                  {(tool === "text" || selectedAnnotation?.type === "text") && (
                    <>
                      <label>
                        Font Family
                        <select
                          value={selectedAnnotation?.style.fontFamily ?? fontFamily}
                          onChange={e => {
                            const newFont = e.target.value;
                            setFontFamily(newFont);
                            if (selectedAnnotation) updateSelected({ style: { fontFamily: newFont } });
                          }}
                        >
                          {fontFamilies.map(f => <option key={f.val} value={f.val}>{f.label}</option>)}
                        </select>
                      </label>

                      <label>
                        Text Size ({(selectedAnnotation?.style.fontSize ?? fontSize)}px)
                        <div className="stroke-presets">
                          <button
                            type="button"
                            className="stroke-btn"
                            title="Decrease text size"
                            onClick={() => {
                              const curr = selectedAnnotation?.style.fontSize ?? fontSize;
                              const nextFS = Math.max(12, curr - 4);
                              setFontSize(nextFS);
                              if (selectedAnnotation) {
                                const estHeight = Math.max(selectedAnnotation.height, (nextFS * 1.5) / 1000);
                                updateSelected({ height: estHeight, style: { fontSize: nextFS } });
                              }
                            }}
                          >
                            A–
                          </button>
                          <button
                            type="button"
                            className="stroke-btn"
                            title="Increase text size"
                            onClick={() => {
                              const curr = selectedAnnotation?.style.fontSize ?? fontSize;
                              const nextFS = Math.min(160, curr + 6);
                              setFontSize(nextFS);
                              if (selectedAnnotation) {
                                const estHeight = Math.max(selectedAnnotation.height, (nextFS * 1.5) / 1000);
                                updateSelected({ height: estHeight, style: { fontSize: nextFS } });
                              }
                            }}
                          >
                            A+
                          </button>
                          {fontSizePresets.map(fs => (
                            <button
                              key={fs}
                              type="button"
                              className={`stroke-btn ${(selectedAnnotation?.style.fontSize ?? fontSize) === fs ? "active" : ""}`}
                              onClick={() => {
                                setFontSize(fs);
                                if (selectedAnnotation) {
                                  const estHeight = Math.max(selectedAnnotation.height, (fs * 1.5) / 1000);
                                  updateSelected({ height: estHeight, style: { fontSize: fs } });
                                }
                              }}
                            >
                              {fs}px
                            </button>
                          ))}
                        </div>
                        <input
                          aria-label="Text size slider"
                          type="range"
                          min="12"
                          max="160"
                          step="2"
                          value={selectedAnnotation?.style.fontSize ?? fontSize}
                          onChange={e => {
                            const val = +e.target.value;
                            setFontSize(val);
                            if (selectedAnnotation) {
                              const estHeight = Math.max(selectedAnnotation.height, (val * 1.5) / 1000);
                              updateSelected({ height: estHeight, style: { fontSize: val } });
                            }
                          }}
                        />
                      </label>
                    </>
                  )}

                  {/* Stroke Color Palette */}
                  <label>
                    Stroke Colour
                    <div className="color-swatches">
                      {strokeColors.map(c => (
                        <button
                          key={c}
                          type="button"
                          className={`color-swatch ${(selectedAnnotation?.style.color ?? color) === c ? "active" : ""}`}
                          style={{ backgroundColor: c, border: c === "#ffffff" ? "1px solid #cbd5e1" : undefined }}
                          onClick={() => {
                            setColor(c);
                            if (selectedAnnotation) updateSelected({ style: { color: c } });
                          }}
                        />
                      ))}
                    </div>
                    <input aria-label="Custom Stroke Colour" type="color" value={selectedAnnotation?.style.color ?? color} onChange={event => { setColor(event.target.value); if (selectedAnnotation) updateSelected({ style: { color: event.target.value } }); }} />
                  </label>

                  {/* Fill Color Palette */}
                  <label>
                    Fill Colour
                    <div className="color-swatches">
                      {fillColors.map(fc => (
                        <button
                          key={fc}
                          type="button"
                          className={`color-swatch ${(selectedAnnotation?.style.fill ?? fillColor) === fc ? "active" : ""}`}
                          style={{ backgroundColor: fc === "none" ? "transparent" : fc, borderStyle: fc === "none" ? "dashed" : "solid" }}
                          title={fc === "none" ? "No fill (Transparent)" : fc}
                          onClick={() => {
                            setFillColor(fc);
                            if (selectedAnnotation) updateSelected({ style: { fill: fc } });
                          }}
                        />
                      ))}
                    </div>
                    <input aria-label="Custom Fill Colour" type="color" value={selectedAnnotation?.style.fill ?? fillColor === "none" ? "#ffffff" : fillColor} onChange={event => { setFillColor(event.target.value); if (selectedAnnotation) updateSelected({ style: { fill: event.target.value } }); }} />
                  </label>

                  {/* Stroke Width Presets & Slider */}
                  <label>
                    Thickness
                    <div className="stroke-presets">
                      {strokeWidthPresets.map(sp => (
                        <button
                          key={sp.val}
                          type="button"
                          className={`stroke-btn ${(selectedAnnotation?.style.strokeWidth ?? width) === sp.val ? "active" : ""}`}
                          onClick={() => { setWidth(sp.val); if (selectedAnnotation) updateSelected({ style: { strokeWidth: sp.val } }); }}
                        >
                          {sp.label}
                        </button>
                      ))}
                    </div>
                    <input aria-label="Stroke width" type="range" min="1" max="48" value={selectedAnnotation?.style.strokeWidth ?? width} onChange={event => { const value = +event.target.value; setWidth(value); if (selectedAnnotation) updateSelected({ style: { strokeWidth: value } }); }} />
                    <output>{selectedAnnotation?.style.strokeWidth ?? width}px</output>
                  </label>

                  <label>
                    Opacity ({Math.round((selectedAnnotation?.style.opacity ?? opacity) * 100)}%)
                    <input aria-label="Opacity" type="range" min="0.1" max="1" step="0.05" value={selectedAnnotation?.style.opacity ?? opacity} onChange={event => { const value = +event.target.value; setOpacity(value); if (selectedAnnotation) updateSelected({ style: { opacity: value } }); }} />
                  </label>

                  <label>Scale <input aria-label="Selected object scale" type="range" min="25" max="200" value={size} onChange={event => resizeSelected(+event.target.value)} /><output>{size}%</output></label>
                  {currentPage && <label>Slide background <input aria-label="Slide background colour" type="color" value={currentPage.background || "#1e293b"} onChange={event => changePageBackground(event.target.value)} /></label>}
                </div>
              )}

              <div className="command-group">
                <button title="Undo (Ctrl+Z)" onClick={() => { if (history.length) { const previous = history.at(-1)!; setFuture(current => [annotations, ...current]); setAnnotations(previous); setHistory(current => current.slice(0, -1)); void saveCloud(previous); } }}>↶</button>
                <button title="Redo (Ctrl+Y)" onClick={() => { if (future.length) { const next = future[0]; setHistory(current => [...current, annotations]); setAnnotations(next); setFuture(current => current.slice(1)); void saveCloud(next); } }}>↷</button>
                <button className="clear-action" onClick={() => { if (window.confirm("Clear all annotations from this page?")) commit(annotations.filter(annotation => annotation.pageNumber !== page)); }}>Clear page</button>
                <button className="export-button" onClick={async () => { const blob = await pdfExporter.export(source, annotations, pageOrder); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = "annotated-lesson.pdf"; link.click(); }}>Export PDF</button>
              </div>
            </div>
          </section>
        </div>
      ) : (
        <section className="viewer-empty">
          <div>
            <span className="empty-icon">＋</span>
            <h1>Open a lesson or start a 16:9 presentation</h1>
            <p>Teach, draw, and present in real time with interactive smartboard tools.</p>
            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center", marginTop: "1rem" }}>
              <button type="button" className="primary" onClick={() => initBlankDocument("New 16:9 Presentation")}>Start 16:9 Presentation</button>
              <label className="secondary upload">Choose a PDF<input type="file" hidden accept=".pdf,application/pdf" onChange={event => event.target.files?.[0] && open(event.target.files[0]).catch(error => setStatus(error.message))} /></label>
            </div>
          </div>
        </section>
      )}

      {textPoints && (
        <div className="text-dialog-backdrop" role="presentation">
          <form className="text-dialog" onSubmit={event => { event.preventDefault(); submitText(); }}>
            <h2>Add text annotation</h2>
            <label>Text<input autoFocus value={textValue} onChange={event => setTextValue(event.target.value)} placeholder="Type text here…" /></label>
            <label>
              Font Family
              <select value={fontFamily} onChange={e => setFontFamily(e.target.value)}>
                {fontFamilies.map(f => <option key={f.val} value={f.val}>{f.label}</option>)}
              </select>
            </label>
            <label>
              Font Size ({fontSize}px)
              <div className="stroke-presets">
                {fontSizePresets.map(fs => (
                  <button key={fs} type="button" className={`stroke-btn ${fontSize === fs ? "active" : ""}`} onClick={() => setFontSize(fs)}>{fs}px</button>
                ))}
              </div>
            </label>
            <div>
              <button type="button" className="secondary" onClick={() => setTextPoints(null)}>Cancel</button>
              <button className="primary" type="submit">Add text</button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}


