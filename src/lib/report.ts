import type { AnalyzeResult } from "@/lib/types";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}


function getDisplayScore(score: number): number {
  const clamped = Math.max(40, Math.min(71, score));
  return Math.round(55 + ((clamped - 40) * 30) / 31);
}

export function buildReportHtml({
  url,
  result,
  wechatId,
  lightDiagnosisPrice = "$199",
  paymentMethod = "支付宝扫码",
  paymentQrImageUrl = "/alipay-light-diagnosis.jpg",
}: {
  url: string;
  result: AnalyzeResult;
  wechatId: string;
  lightDiagnosisPrice?: string;
  paymentMethod?: string;
  paymentQrImageUrl?: string;
}): string {
  const displayScore = getDisplayScore(result.score);

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Landing Page 增长诊断报告</title>
    <style>
      body { margin: 0; background: #f4f6fb; color: #1f2c46; font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", sans-serif; }
      .wrap { max-width: 860px; margin: 0 auto; padding: 40px 24px 64px; }
      .card { background: #ffffff; border: 1px solid #d8e0f2; border-radius: 24px; padding: 28px; box-shadow: 0 18px 40px rgba(37, 59, 112, 0.08); }
      .eyebrow { font-size: 12px; letter-spacing: 0.12em; color: #5b6f99; font-weight: 700; }
      h1 { margin: 14px 0 8px; font-size: 34px; line-height: 1.2; color: #1d2f56; }
      .sub { margin: 0; color: #516486; font-size: 15px; line-height: 1.8; }
      .meta { display: grid; grid-template-columns: 130px 1fr; gap: 18px; margin-top: 28px; align-items: center; }
      .score { width: 130px; height: 130px; border-radius: 999px; display: flex; flex-direction: column; align-items: center; justify-content: center; background: ${displayScore < 60 ? "#fde9e9" : displayScore < 75 ? "#fff5dd" : "#e8f7ef"}; color: ${displayScore < 60 ? "#b42828" : displayScore < 75 ? "#9a6a07" : "#13663f"}; }
      .score strong { font-size: 52px; line-height: 1; }
      .score span { margin-top: 6px; font-size: 14px; color: #4f5f84; }
      .summary { font-size: 24px; line-height: 1.5; font-weight: 700; color: #b42828; }
      .industry { margin-top: 10px; color: #5d6d92; font-size: 14px; }
      h2 { margin: 34px 0 14px; font-size: 24px; color: #1d4684; }
      .suggestion { margin-top: 16px; background: #fff; border: 1px solid #dbe3f4; border-radius: 20px; padding: 22px; }
      .action { margin: 0; font-size: 24px; line-height: 1.5; font-weight: 800; color: #1f6a3b; }
      .row { margin-top: 14px; font-size: 16px; line-height: 1.9; color: #32415f; }
      .evidence { margin-top: 14px; padding: 10px 14px; background: #edf2ff; border-radius: 14px; color: #445b8d; font-size: 14px; line-height: 1.7; }
      .footer { margin-top: 34px; background: linear-gradient(145deg, #1d2c56 0%, #26396f 58%, #192447 100%); color: #e7eeff; border-radius: 24px; padding: 28px; }
      .footer h3 { margin: 0 0 10px; font-size: 28px; line-height: 1.3; }
      .footer p { margin: 0; font-size: 15px; line-height: 1.9; color: #d6e0ff; }
      .cta-block { margin-top: 16px; padding: 16px 18px; border-radius: 18px; border: 1px solid rgba(214, 224, 255, 0.16); background: rgba(255,255,255,0.06); }
      .cta-block strong { color: #fff; }
      .bullets { margin: 10px 0 0; padding-left: 18px; color: #d6e0ff; }
      .bullets li { margin-top: 6px; }
      .pay-info { margin-top: 12px; padding: 12px 14px; border-radius: 14px; border: 1px solid rgba(214, 224, 255, 0.22); background: rgba(255,255,255,0.04); }
      .pay-info p { margin: 0; font-size: 14px; line-height: 1.8; color: #d6e0ff; }
      .pay-info p + p { margin-top: 4px; }
      .pay-qr { margin-top: 12px; border-radius: 14px; border: 1px solid rgba(214, 224, 255, 0.22); overflow: hidden; background: rgba(255,255,255,0.06); }
      .pay-qr img { display: block; width: 100%; max-width: 320px; height: auto; margin: 0 auto; }
      .contact { margin-top: 18px; padding-top: 18px; border-top: 1px solid rgba(214, 224, 255, 0.2); }
      .contact p + p { margin-top: 8px; }
      .contact strong { color: #fff; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="card">
        <div class="eyebrow">LANDINGPAGE 增长诊断报告</div>
        <h1>3个改了就能见效的点</h1>
        <p class="sub">URL：${escapeHtml(url)}</p>
        <div class="meta">
          <div class="score">
            <strong>${displayScore}</strong>
            <span>/100分</span>
          </div>
          <div>
            <div class="summary">${escapeHtml(result.summary)}</div>
            <div class="industry">行业识别：${escapeHtml(result.industry)} · 超过 ${result.percentile}% 同行页面</div>
          </div>
        </div>

        <h2>现在最该先改的 3 件事</h2>
        ${result.suggestions
          .map(
            (item) => `<section class="suggestion">
              <p class="action">${escapeHtml(item.action)}</p>
              <p class="row"><strong>为什么要先改：</strong>${escapeHtml(item.issue)}</p>
              <div class="evidence"><strong>表现：</strong>${escapeHtml(item.evidence)}</div>
              <p class="row"><strong>影响：</strong>${escapeHtml(item.impact)}</p>
            </section>`,
          )
          .join("")}
      </div>

      <div class="footer">
        <div class="eyebrow" style="color:#b9c8f5;">下一步</div>
        <h3>这份 PDF 适合存档和内部讨论，不等于完整诊断。</h3>
        <p>如果你想确认“到底先改哪一个最值”，优先走下面两条路径，而不是只把报告带走。</p>
        <div class="cta-block">
          <p><strong>免费15分钟 1:1 确认优先级 #1：</strong><a href="https://calendly.com/mengqi-pmq/15min" style="color:#fff; text-decoration:underline;">预约 Quick Call</a></p>
          <p>我会从这 3 个问题里，帮你先挑出最该改的那 1 个，并给你专属修改优先级建议。</p>
        </div>
        <div class="cta-block">
          <p><strong>48h 轻诊断：</strong>付款后添加微信 <strong>${escapeHtml(wechatId)}</strong>，把支付截图和页面链接发我继续推进。</p>
          <div class="pay-info">
            <p><strong>价格：</strong>${escapeHtml(lightDiagnosisPrice)}</p>
            <p><strong>支付方式：</strong>${escapeHtml(paymentMethod)}</p>
            <p><strong>付款后动作：</strong>添加微信并发送「支付截图 + 页面链接」。</p>
          </div>
          ${paymentQrImageUrl ? `<div class="pay-qr"><img src="${escapeHtml(paymentQrImageUrl)}" alt="轻诊断支付二维码" /></div>` : ""}
          <ul class="bullets">
            <li>Top 3 完整优先级排序</li>
            <li>关键页面修改方向</li>
            <li>一份可直接执行的行动清单</li>
          </ul>
        </div>
        <div class="contact">
          <p><strong>文章方法论：</strong><a href="https://quaily.com/overseas/p/landing-page-structure-and-golden-rule" style="color:#fff; text-decoration:underline;">查看我如何分析转化问题</a></p>
        </div>
      </div>
    </div>
  </body>
</html>`;
}
