import { NextResponse } from "next/server";
import { getDailySummary } from "@/lib/store";

export async function GET() {
  try {
    const data = await getDailySummary({ date: "all" });
    return NextResponse.json({
      ok: true,
      data: {
        effectiveSubmissionCount: data.overview.effectiveSubmissionCount,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "加载社交背书失败";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
