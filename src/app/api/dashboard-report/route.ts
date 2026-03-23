import { NextResponse } from "next/server";
import { getStoredResult, normalizeUrl } from "@/lib/store";
import { buildReportHtml } from "@/lib/report";

const WECHAT_ID = "daqi029";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userKey = searchParams.get("userKey")?.trim() || "";
    const urlInput = searchParams.get("url")?.trim() || "";

    if (!userKey || !urlInput) {
      return NextResponse.json({ ok: false, message: "缺少报告参数" }, { status: 400 });
    }

    let normalizedUrl = "";
    try {
      normalizedUrl = normalizeUrl(urlInput);
    } catch {
      return NextResponse.json({ ok: false, message: "报告链接格式错误" }, { status: 400 });
    }

    const result = await getStoredResult(userKey, normalizedUrl);
    if (!result) {
      return NextResponse.json({ ok: false, message: "未找到该提交的诊断报告" }, { status: 404 });
    }

    const html = buildReportHtml({
      url: normalizedUrl,
      result,
      wechatId: WECHAT_ID,
    });

    return new NextResponse(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "加载报告失败";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
