import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { createLead, makeUserKey, recordEvent, type DeviceType } from "@/lib/store";
import { notifyFeishuLead } from "@/lib/notify";
import type { LeadPayload } from "@/lib/types";

function getClientIp(h: Headers): string {
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return h.get("x-real-ip") || "unknown-ip";
}

function detectDeviceType(userAgent: string): DeviceType {
  const ua = userAgent.toLowerCase();
  if (/ipad|tablet/.test(ua)) return "tablet";
  if (/mobi|android|iphone|ipod|mobile/.test(ua)) return "mobile";
  if (ua) return "desktop";
  return "unknown";
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<LeadPayload>;
    if (!body.url || typeof body.score !== "number") {
      return NextResponse.json({ ok: false, message: "参数不完整" }, { status: 400 });
    }

    const headerStore = await headers();
    const cookieStore = await cookies();
    const anonId = cookieStore.get("lp_anon_id")?.value || "unknown-anon";

    const userKey = makeUserKey(
      getClientIp(headerStore),
      headerStore.get("user-agent") || "unknown-ua",
      anonId,
    );
    const deviceType = detectDeviceType(headerStore.get("user-agent") || "");

    const payload: LeadPayload = {
      url: body.url,
      score: body.score,
      percentile: body.percentile || 0,
      industry: body.industry || "Unknown",
      summary: body.summary || "",
    };

    await createLead(userKey, payload);
    await recordEvent(userKey, {
      type: "copy_wechat",
      deviceType,
      url: payload.url,
      score: payload.score,
      percentile: payload.percentile,
      industry: payload.industry,
    });
    await notifyFeishuLead(payload);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, message: "线索记录失败" }, { status: 500 });
  }
}
