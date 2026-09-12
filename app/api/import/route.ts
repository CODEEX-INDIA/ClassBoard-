import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  return NextResponse.json({ error: "Only PDF files are supported." }, { status: 415 });
}
