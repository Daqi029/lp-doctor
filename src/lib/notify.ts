import type { LeadPayload } from "./types";

export async function notifyFeishuLead(payload: LeadPayload): Promise<void> {
  const webhook = process.env.FEISHU_WEBHOOK_URL;
  if (!webhook) return;

  const content = [
    "【LP 高意向线索】",
    `URL: ${payload.url}`,
    `总分: ${payload.score} / 100`,
    `同行百分位: ${payload.percentile}%`,
    `行业: ${payload.industry}`,
    `诊断摘要: ${payload.summary}`,
    `时间: ${new Date().toLocaleString("zh-CN", { hour12: false })}`,
  ].join("\n");

  await fetch(webhook, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      msg_type: "text",
      content: { text: content },
    }),
  });
}
