import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { makeUserKey, normalizeUrl, recordEvent, type EventType } from "@/lib/store";

function getClientIp(h: Headers): string {
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return h.get("x-real-ip") || "unknown-ip";
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      type?: EventType;
      url?: string;
      score?: number;
      percentile?: number;
      industry?: string;
    };

    if (!body.type) {
      return NextResponse.json({ ok: false, message: "缺少事件类型" }, { status: 400 });
    }

    const headerStore = await headers();
    const cookieStore = await cookies();
    let anonId = cookieStore.get("lp_anon_id")?.value;
    if (!anonId) anonId = crypto.randomUUID();

    const userKey = makeUserKey(
      getClientIp(headerStore),
      headerStore.get("user-agent") || "unknown-ua",
      anonId,
    );

    await recordEvent(userKey, {
      type: body.type,
      url: body.url ? normalizeUrl(body.url) : undefined,
      score: typeof body.score === "number" ? body.score : undefined,
      percentile: typeof body.percentile === "number" ? body.percentile : undefined,
      industry: body.industry,
    });

    const response = NextResponse.json({ ok: true });
    response.cookies.set("lp_anon_id", anonId, { httpOnly: true, maxAge: 60 * 60 * 24 * 365, path: "/" });
    return response;
  } catch {
    return NextResponse.json({ ok: false, message: "事件记录失败" }, { status: 500 });
  }
}
