"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { useSearchParams } from "next/navigation";
import { importDocument } from "../../lib/importers";
import { pdfExporter } from "../../lib/export/pdf-exporter";
import { bounds, normalizePoint } from "../../lib/annotations/geometry";
import { getSupabaseBrowserClient } from "../../lib/supabase/client";
import type { Annotation, AnnotationType, Point } from "../../types/annotation";

const tools: Array<{ id: AnnotationType | "select" | "eraser"; label: string; icon: string }> = [
  { id: "select", label: "Select", icon: "↖" },
  { id: "ink", label: "Pen", icon: "✎" },
  { id: "highlighter", label: "Highlight", icon: "▰" },
  { id: "line", label: "Line", icon: "／" },
  { id: "arrow", label: "Arrow", icon: "➜" },
  { id: "rectangle", label: "Rectangle", icon: "□" },
  { id: "ellipse", label: "Circle", icon: "○" },
  { id: "text", label: "Text", icon: "T" },
  { id: "eraser", label: "Erase", icon: "⌫" },
];
const id = () => crypto.randomUUID();
const drawingTypes: AnnotationType[] = ["ink", "pencil", "marker", "calligraphy", "highlighter"];
const shortTitle = (filename: string) => {
  const extension = filename.match(/\.[^.]+$/)?.[0] ?? "";
  const base = filename.slice(0, filename.length - extension.length).replace(/\.+$/, "").trim();
  return base.length > 28 ? `${base.slice(0, 25).trimEnd()}...${extension}` : filename;
};

function PageThumbnail({ pdf, pageNumber, active, onClick }: { pdf: any; pageNumber: number; active: boolean; onClick: () => void }) {
  const thumbnail = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let cancelled = false;
    void pdf?.getPage(pageNumber).then((pdfPage: any) => {
      if (cancelled || !thumbnail.current) return;
      const viewport = pdfPage.getViewport({ scale: 0.2 });
      const canvas = thumbnail.current;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      return pdfPage.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
    });
    return () => { cancelled = true; };
  }, [pdf, pageNumber]);
  return <button className={`page-thumb ${active ? "active" : ""}`} onClick={onClick} aria-label={`Go to page ${pageNumber}`}><canvas ref={thumbnail} /><span>{pageNumber}</span></button>;
}

export function ViewerClient() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const overlay = useRef<SVGSVGElement>(null);
  const searchParams = useSearchParams();
  const [source, setSource] = useState<ArrayBuffer>();
  const [pdf, setPdf] = useState<any>();
  const [documentId, setDocumentId] = useState<string>();
  const [documentName, setDocumentName] = useState("Untitled lesson");
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(0);
  const [tool, setTool] = useState<AnnotationType | "select" | "eraser">("select");
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [history, setHistory] = useState<Annotation[][]>([]);
  const [future, setFuture] = useState<Annotation[][]>([]);
  const [draft, setDraft] = useState<Point[] | null>(null);
  const [selectedId, setSelectedId] = useState<string>();
  const [color, setColor] = useState("#2563eb");
  const [opacity, setOpacity] = useState(1);
  const [width, setWidth] = useState(3);
  const [size, setSize] = useState(100);
  const [presenting, setPresenting] = useState(false);
  const [status, setStatus] = useState("Cloud sync ready");

  const visible = annotations.filter(annotation => annotation.pageNumber === page);

  const loadPdf = async (data: ArrayBuffer) => {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
    const document = await pdfjs.getDocument({ data: data.slice(0) }).promise;
    setSource(data);
    setPdf(document);
    setPages(document.numPages);
    setPage(1);
  };

  const loadCloudDocument = async (record: { id: string; filename: string; storage_path: string }) => {
    const client = getSupabaseBrowserClient();
    setStatus("Loading from cloud…");
    const { data: file, error: fileError } = await client.storage.from("documents").download(record.storage_path);
    if (fileError || !file) throw fileError ?? new Error("The document could not be downloaded.");
    const { data: rows, error: annotationError } = await client.from("annotations").select("annotation").eq("document_id", record.id);
    if (annotationError) throw annotationError;
    const restored = (rows ?? []).map(row => ({ ...(row.annotation as Annotation), documentId: record.id }));
    setDocumentId(record.id);
    setDocumentName(shortTitle(record.filename));
    setAnnotations(restored);
    await loadPdf(await file.arrayBuffer());
    setStatus("Synced across devices");
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const client = getSupabaseBrowserClient();
      const { data: { user } } = await client.auth.getUser();
      if (!user || cancelled) return;
      const requestedId = searchParams.get("doc");
      const result = requestedId
        ? await client.from("documents").select("id,filename,storage_path").eq("id", requestedId).maybeSingle()
        : await client.from("documents").select("id,filename,storage_path").order("updated_at", { ascending: false }).limit(1).maybeSingle();
      if (result.data && !cancelled) await loadCloudDocument(result.data);
    })().catch(error => { if (!cancelled) setStatus(error instanceof Error ? error.message : "Cloud document unavailable"); });
    return () => { cancelled = true; };
  }, [searchParams]);

  useEffect(() => {
    if (!pdf || !canvas.current) return;
    let cancelled = false;
    void (async () => {
      const renderedPage = await pdf.getPage(page);
      const viewport = renderedPage.getViewport({ scale: 1.5 });
      const target = canvas.current!;
      target.width = viewport.width;
      target.height = viewport.height;
      target.style.aspectRatio = `${viewport.width}/${viewport.height}`;
      await renderedPage.render({ canvasContext: target.getContext("2d")!, viewport }).promise;
      if (!cancelled && overlay.current) overlay.current.setAttribute("viewBox", `0 0 ${viewport.width} ${viewport.height}`);
    })();
    return () => { cancelled = true; };
  }, [pdf, page]);

  const saveCloud = async (next: Annotation[]) => {
    if (!documentId) return;
    const client = getSupabaseBrowserClient();
    setStatus("Saving…");
    const { error: removeError } = await client.from("annotations").delete().eq("document_id", documentId);
    if (removeError) throw removeError;
    if (next.length) {
      const { error } = await client.from("annotations").insert(next.map(annotation => ({ id: annotation.id, document_id: documentId, page_number: annotation.pageNumber, schema_version: 1, annotation, updated_at: annotation.updatedAt })));
      if (error) throw error;
    }
    await client.from("documents").update({ updated_at: new Date().toISOString() }).eq("id", documentId);
    setStatus("Saved to cloud");
  };

  const commit = (next: Annotation[]) => {
    setHistory(current => [...current, annotations]);
    setAnnotations(next);
    setFuture([]);
    void saveCloud(next).catch(error => setStatus(error instanceof Error ? error.message : "Cloud save failed"));
  };

  const open = async (file: File) => {
    const imported = await importDocument(file);
    const client = getSupabaseBrowserClient();
    const { data: { user } } = await client.auth.getUser();
    if (!user) throw new Error("Sign in before opening a document.");
    const path = `${user.id}/${id()}-${imported.name}`;
    const { error: uploadError } = await client.storage.from("documents").upload(path, new Blob([imported.data], { type: imported.mimeType }), { contentType: imported.mimeType });
    if (uploadError) throw uploadError;
    const { data: record, error: documentError } = await client.from("documents").insert({ owner_id: user.id, filename: imported.name, document_type: imported.sourceType, storage_path: path }).select("id,filename,storage_path").single();
    if (documentError || !record) throw documentError ?? new Error("Could not create the cloud document.");
    setAnnotations([]);
    setHistory([]);
    setFuture([]);
    await loadCloudDocument(record);
  };

  const point = (event: PointerEvent): Point => { const rectangle = overlay.current!.getBoundingClientRect(); return normalizePoint({ x: event.clientX - rectangle.left, y: event.clientY - rectangle.top }, { width: rectangle.width, height: rectangle.height }); };
  const finish = (event: PointerEvent) => {
    if (!draft || !overlay.current || tool === "select" || tool === "eraser") return;
    const points = [...draft, point(event)];
    const box = bounds(points);
    const content = tool === "text" ? window.prompt("Enter annotation text") ?? "" : undefined;
    if (tool === "text" && !content) { setDraft(null); return; }
    const annotation: Annotation = { id: id(), documentId: documentId ?? "", pageNumber: page, type: tool, ...box, rotation: 0, style: { color, opacity: tool === "highlighter" ? Math.min(opacity, .45) : opacity, strokeWidth: width, fontSize: 18 * size / 100 }, content, points: drawingTypes.includes(tool as AnnotationType) || tool === "line" || tool === "arrow" ? points : undefined, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    commit([...annotations, annotation]);
    setDraft(null);
  };

  const deleteAnnotation = (annotationId: string) => commit(annotations.filter(annotation => annotation.id !== annotationId));
  const resizeSelected = (value: number) => {
    setSize(value);
    if (!selectedId) return;
    const current = annotations.find(annotation => annotation.id === selectedId);
    if (!current) return;
    const factor = value / 100;
    const next = annotations.map(annotation => annotation.id === selectedId ? { ...annotation, width: current.width * factor, height: current.height * factor, style: { ...annotation.style, fontSize: (annotation.style.fontSize ?? 18) * factor }, updatedAt: new Date().toISOString() } : annotation);
    setAnnotations(next);
    void saveCloud(next).catch(error => setStatus(error instanceof Error ? error.message : "Cloud save failed"));
  };

  const onShapePointerDown = (event: PointerEvent, annotation: Annotation) => {
    event.stopPropagation();
    if (tool === "eraser") deleteAnnotation(annotation.id);
    else if (tool === "select") { setSelectedId(annotation.id); setSize(100); }
  };

  return <main className={presenting ? "viewer presenting" : "viewer"}>
    <header className="viewer-header"><a href="/dashboard" className="viewer-brand">← MAPLES <span>ACADEMY</span></a><div className="document-title"><strong>{documentName}</strong><small>{status}</small></div><label className="upload">Open PDF<input type="file" hidden accept=".pdf,application/pdf" onChange={event => event.target.files?.[0] && open(event.target.files[0]).catch(error => setStatus(error.message))} /></label><button onClick={() => setPresenting(value => !value)}>{presenting ? "Exit presentation" : "Present"}</button></header>
    {pdf ? <div className="viewer-body"><aside className="page-sidebar"><strong>Pages</strong>{Array.from({ length: pages }, (_, index) => <PageThumbnail key={index + 1} pdf={pdf} pageNumber={index + 1} active={page === index + 1} onClick={() => setPage(index + 1)} />)}</aside><section className="viewer-workspace"><div className="stage"><button className="page-nav" aria-label="Previous page" disabled={page === 1} onClick={() => setPage(value => value - 1)}>‹</button><div className="page"><canvas ref={canvas} /><svg ref={overlay} onPointerDown={event => { if (tool !== "select" && tool !== "eraser") { event.currentTarget.setPointerCapture(event.pointerId); setDraft([point(event)]); } else setSelectedId(undefined); }} onPointerMove={event => draft && setDraft(current => current ? [...current, point(event)] : null)} onPointerUp={finish}>{visible.map(annotation => <AnnotationShape key={annotation.id} annotation={annotation} selected={selectedId === annotation.id} onPointerDown={onShapePointerDown} />)}{draft && <polyline className="draft" points={draft.map(current => `${current.x * 1000},${current.y * 1000}`).join(" ")} />}</svg></div><button className="page-nav" aria-label="Next page" disabled={page === pages} onClick={() => setPage(value => value + 1)}>›</button></div><div className="control-dock"><div className="tool-group">{tools.map(item => <button className={tool === item.id ? "tool-active" : ""} key={item.id} title={item.label} aria-label={item.label} onClick={() => setTool(item.id)}><span>{item.icon}</span><small>{item.label}</small></button>)}</div><div className="style-group"><label>Colour <input aria-label="Colour" type="color" value={color} onChange={event => setColor(event.target.value)} /></label><label>Width <input aria-label="Stroke width" type="range" min="1" max="24" value={width} onChange={event => setWidth(+event.target.value)} /><output>{width}px</output></label><label>Size <input aria-label="Selected object size" type="range" min="25" max="200" value={size} onChange={event => resizeSelected(+event.target.value)} /><output>{size}%</output></label><label>Opacity <input aria-label="Opacity" type="range" min="0.1" max="1" step="0.1" value={opacity} onChange={event => setOpacity(+event.target.value)} /><output>{Math.round(opacity * 100)}%</output></label></div><div className="command-group"><button title="Undo" onClick={() => { if (history.length) { const previous = history.at(-1)!; setFuture(current => [annotations, ...current]); setAnnotations(previous); setHistory(current => current.slice(0, -1)); void saveCloud(previous); } }}>↶</button><button title="Redo" onClick={() => { if (future.length) { const next = future[0]; setHistory(current => [...current, annotations]); setAnnotations(next); setFuture(current => current.slice(1)); void saveCloud(next); } }}>↷</button><button onClick={() => commit(annotations.filter(annotation => annotation.pageNumber !== page))}>Clear page</button><button className="export-button" onClick={async () => { if (!source) return; const blob = await pdfExporter.export(source, annotations); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = "annotated-lesson.pdf"; link.click(); }}>Export PDF</button></div></div></section></div> : <section className="viewer-empty"><div><span className="empty-icon">＋</span><h1>Open a lesson to begin</h1><p>PDF files are saved securely to your classroom cloud.</p><label className="primary upload">Choose a PDF<input type="file" hidden accept=".pdf,application/pdf" onChange={event => event.target.files?.[0] && open(event.target.files[0]).catch(error => setStatus(error.message))} /></label></div></section>}
  </main>;
}

function AnnotationShape({ annotation, selected, onPointerDown }: { annotation: Annotation; selected: boolean; onPointerDown: (event: PointerEvent, annotation: Annotation) => void }) {
  const x = annotation.x * 1000, y = annotation.y * 1000, width = annotation.width * 1000, height = annotation.height * 1000;
  const common = { stroke: annotation.style.color, strokeWidth: annotation.style.strokeWidth, opacity: annotation.style.opacity, className: selected ? "annotation selected" : "annotation", onPointerDown: (event: PointerEvent) => onPointerDown(event, annotation) };
  if (drawingTypes.includes(annotation.type)) return <polyline points={(annotation.points ?? []).map(point => `${point.x * 1000},${point.y * 1000}`).join(" ")} fill="none" {...common} />;
  if (annotation.type === "line" || annotation.type === "arrow") return <line x1={x} y1={y} x2={x + width} y2={y + height} {...common} />;
  if (annotation.type === "ellipse") return <ellipse cx={x + width / 2} cy={y + height / 2} rx={width / 2} ry={height / 2} fill="none" {...common} />;
  if (annotation.type === "text") return <text x={x} y={y + (annotation.style.fontSize ?? 18)} fontSize={annotation.style.fontSize ?? 18} fill={annotation.style.color} className={selected ? "annotation selected" : "annotation"} onPointerDown={(event: PointerEvent) => onPointerDown(event, annotation)}>{annotation.content}</text>;
  return <rect x={x} y={y} width={width} height={height} fill="none" {...common} />;
}
