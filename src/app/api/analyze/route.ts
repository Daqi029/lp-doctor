import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { analyzeLandingPage } from "@/lib/rules";
import { getCachedResult, getQuota, makeUserKey, normalizeUrl, recordEvent, saveAnalyzeResult, type DeviceType } from "@/lib/store";
import type { AnalyzeResponse } from "@/lib/types";

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

function toUserFriendlyMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "";

  if (/fetch failed/i.test(message)) {
    return "这个链接打不开，请检查网址有没有写对。";
  }

  if (/页面抓取失败（404）/.test(message)) {
    return "这个页面不存在，请检查链接有没有写错。";
  }

  if (/页面抓取失败（403|401）/.test(message)) {
    return "这个页面暂时不让外部访问，我现在还读不到它。";
  }

  if (/页面抓取失败（5\d\d）/.test(message)) {
    return "这个网站现在有点不稳定，稍后再试一次。";
  }

  if (/页面抓取失败/.test(message)) {
    return "这个页面暂时抓不到，你可以检查一下链接，或者稍后再试。";
  }

  return "这次没读到这个页面，你可以检查一下链接，或者稍后再试。";
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { url?: string };
    const urlInput = body.url?.trim() || "";

    if (!urlInput) {
      return NextResponse.json<AnalyzeResponse>({ ok: false, message: "请先输入落地页链接" }, { status: 400 });
    }

    let normalized = "";
    try {
      normalized = normalizeUrl(urlInput);
    } catch {
      return NextResponse.json<AnalyzeResponse>({ ok: false, message: "链接格式不正确，请输入完整 URL" }, { status: 400 });
    }

    const headerStore = await headers();
    const cookieStore = await cookies();

    let anonId = cookieStore.get("lp_anon_id")?.value;
    if (!anonId) {
      anonId = crypto.randomUUID();
    }

    const userKey = makeUserKey(
      getClientIp(headerStore),
      headerStore.get("user-agent") || "unknown-ua",
      anonId,
    );
    const deviceType = detectDeviceType(headerStore.get("user-agent") || "");

    await recordEvent(userKey, { type: "submit_url", deviceType, url: normalized });

    const cached = await getCachedResult(userKey, normalized);
    if (cached) {
      await recordEvent(userKey, {
        type: "result_generated",
        deviceType,
        url: normalized,
        score: cached.score,
        percentile: cached.percentile,
        industry: cached.industry,
      });
      const quota = await getQuota(userKey);
      const response = NextResponse.json<AnalyzeResponse>({
        ok: true,
        result: cached,
        quota,
      });
      response.cookies.set("lp_anon_id", anonId, { httpOnly: true, maxAge: 60 * 60 * 24 * 365, path: "/" });
      return response;
    }

    const quota = await getQuota(userKey);
    if (quota.remaining <= 0) {
      await recordEvent(userKey, { type: "quota_exceeded", deviceType, url: normalized });
      const response = NextResponse.json<AnalyzeResponse>(
        {
          ok: false,
          quota,
          message: "你今天的免费诊断次数已用完。若要继续，请添加微信申请人工深度诊断。",
        },
        { status: 429 },
      );
      response.cookies.set("lp_anon_id", anonId, { httpOnly: true, maxAge: 60 * 60 * 24 * 365, path: "/" });
      return response;
    }

    const result = await analyzeLandingPage(normalized);
    await saveAnalyzeResult(userKey, normalized, result);
    await recordEvent(userKey, {
      type: "result_generated",
      deviceType,
      url: normalized,
      score: result.score,
      percentile: result.percentile,
      industry: result.industry,
    });
    const nextQuota = await getQuota(userKey);

    const response = NextResponse.json<AnalyzeResponse>({ ok: true, result, quota: nextQuota });
    response.cookies.set("lp_anon_id", anonId, { httpOnly: true, maxAge: 60 * 60 * 24 * 365, path: "/" });
    return response;
  } catch (error) {
    const message = toUserFriendlyMessage(error);
    return NextResponse.json<AnalyzeResponse>({ ok: false, message }, { status: 500 });
  }
}
