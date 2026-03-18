import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { analyzeLandingPage } from "@/lib/rules";
import { getCachedResult, getQuota, makeUserKey, normalizeUrl, saveAnalyzeResult } from "@/lib/store";
import type { AnalyzeResponse } from "@/lib/types";

function getClientIp(h: Headers): string {
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return h.get("x-real-ip") || "unknown-ip";
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

    const cached = await getCachedResult(userKey, normalized);
    if (cached) {
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
    const nextQuota = await getQuota(userKey);

    const response = NextResponse.json<AnalyzeResponse>({ ok: true, result, quota: nextQuota });
    response.cookies.set("lp_anon_id", anonId, { httpOnly: true, maxAge: 60 * 60 * 24 * 365, path: "/" });
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "诊断失败，请稍后重试";
    return NextResponse.json<AnalyzeResponse>({ ok: false, message }, { status: 500 });
  }
}
