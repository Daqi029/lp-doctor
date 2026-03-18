import { NextResponse } from "next/server";
import { getDailySummary } from "@/lib/store";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date") || undefined;
  const data = await getDailySummary(date);
  return NextResponse.json({ ok: true, data });
}
