import { NextResponse } from "next/server";
import { getDailySummary } from "@/lib/store";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date") || undefined;
    const from = searchParams.get("from") || undefined;
    const to = searchParams.get("to") || undefined;
    const data = await getDailySummary({ date, from, to });
    return NextResponse.json({ ok: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "加载看板失败";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
