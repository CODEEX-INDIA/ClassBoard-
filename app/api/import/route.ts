import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const converter = process.env.PRESENTATION_CONVERTER_URL;
  if (!converter) return NextResponse.json({ error: "Presentation conversion is not configured." }, { status: 501 });
  const body = await request.formData();
  const upstream = await fetch(converter, { method: "POST", headers: process.env.PRESENTATION_CONVERTER_TOKEN ? { Authorization: `Bearer ${process.env.PRESENTATION_CONVERTER_TOKEN}` } : {}, body });
  if (!upstream.ok) return NextResponse.json({ error: "Presentation conversion failed." }, { status: 502 });
  return new NextResponse(upstream.body, { headers: { "Content-Type": "application/pdf", "Content-Disposition": "inline; filename=converted.pdf" } });
}
