"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { track } from "@vercel/analytics";
import type { AnalyzeResponse, AnalyzeResult } from "@/lib/types";

type State = {
  loading: boolean;
  error: string;
  result: AnalyzeResult | null;
  quotaText: string;
  inputUrl: string;
  leadSent: boolean;
  quotaExceeded: boolean;
};

const WECHAT_ID = "daqi029";
const CONSULTANT_NAME = "Mengqi";
const CONSULTANT_TITLE = "增长设计顾问";
const CONSULTANT_BIO = "专注于帮助 SaaS 和独立产品团队定位转化瓶颈，明确首屏表达、CTA 路径和说服结构的优先级。";

const PROCESS_STAGES = ["首屏价值诊断完成", "方案区结构诊断完成", "价格区说服力诊断中", "信任背书诊断中", "CTA 链路诊断中"];
const PROCESS_LOGS = [
  "crawl.init -> page fetched",
  "parse.hero -> extracting H1/H2",
  "parse.structure -> grouping sections",
  "parse.pricing -> pricing signals detected",
  "parse.trust -> social proof scan",
  "score.compute -> finalize conversion risk",
];

function normalizeInputUrl(raw: string): string {
  const value = raw.trim();
  if (!value) return "";
  if (value.startsWith("//")) return `https:${value}`;
  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(value)) return value;
  return `https://${value}`;
}

function scoreTone(score: number): { text: string } {
  if (score < 60) return { text: "text-[#b42828]" };
  if (score < 80) return { text: "text-[#9a6a07]" };
  return { text: "text-[#13663f]" };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export default function Home() {
  const [state, setState] = useState<State>({
    loading: false,
    error: "",
    result: null,
    quotaText: "每日可免费诊断 2 次",
    inputUrl: "",
    leadSent: false,
    quotaExceeded: false,
  });
  const [stageIndex, setStageIndex] = useState(0);
  const diagnosisSectionRef = useRef<HTMLElement | null>(null);
  const isLocalEnv = typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");

  useEffect(() => {
    if (!state.loading) return;
    const timer = window.setInterval(() => {
      setStageIndex((prev) => (prev < PROCESS_STAGES.length - 1 ? prev + 1 : prev));
    }, 650);
    return () => window.clearInterval(timer);
  }, [state.loading]);

  const progress = Math.round(((stageIndex + 1) / PROCESS_STAGES.length) * 100);

  const scoreStyle = scoreTone(state.result?.score || 0);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedUrl = normalizeInputUrl(state.inputUrl);
    if (!normalizedUrl) {
      setState((prev) => ({ ...prev, error: "请先输入有效的 Landing Page 链接" }));
      return;
    }
    track("submit_url", { url: normalizedUrl });
    setState((prev) => ({ ...prev, inputUrl: normalizedUrl }));

    setState((prev) => ({
      ...prev,
      loading: true,
      error: "",
      leadSent: false,
      quotaExceeded: false,
      result: null,
    }));
    setStageIndex(0);
    window.setTimeout(() => {
      diagnosisSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);

    const startAt = Date.now();

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: normalizedUrl }),
      });

      const data = (await response.json()) as AnalyzeResponse;
      const elapsed = Date.now() - startAt;
      const minWait = 2600;
      if (elapsed < minWait) {
        await new Promise((resolve) => setTimeout(resolve, minWait - elapsed));
      }

      if (!response.ok || !data.ok || !data.result) {
        const exceeded = response.status === 429;
        setState((prev) => ({
          ...prev,
          loading: false,
          error: exceeded ? "" : data.message || "诊断失败，请稍后重试",
          quotaExceeded: exceeded,
          result: exceeded ? null : prev.result,
          quotaText: data.quota ? `今日已用 ${data.quota.used}/${data.quota.limit} 次` : prev.quotaText,
        }));
        return;
      }

      setState((prev) => ({
        ...prev,
        loading: false,
        result: data.result || null,
        quotaText: data.quota
          ? `今日已用 ${data.quota.used}/${data.quota.limit} 次（剩余 ${data.quota.remaining} 次）`
          : prev.quotaText,
      }));
      track("result_generated", {
        url: normalizedUrl,
        score: data.result.score,
        percentile: data.result.percentile,
        industry: data.result.industry,
      });
    } catch {
      setState((prev) => ({ ...prev, loading: false, error: "网络异常，请稍后重试" }));
    }
  }

  async function handleCopyWechat() {
    if (!state.result) return;
    track("click_contact", {
      url: normalizeInputUrl(state.inputUrl),
      score: state.result.score,
      percentile: state.result.percentile,
    });

    try {
      await fetch("/api/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: normalizeInputUrl(state.inputUrl),
          score: state.result.score,
          percentile: state.result.percentile,
          industry: state.result.industry,
          summary: state.result.summary,
        }),
      });
    } catch {
      // keep UX smooth even if telemetry fails
    }

    try {
      await navigator.clipboard.writeText(WECHAT_ID);
    } catch {
      // ignore clipboard errors
    }

    setState((prev) => ({ ...prev, leadSent: true }));
  }

  async function handleDevReset() {
    const response = await fetch("/api/dev-reset", { method: "POST" });
    if (!response.ok) return;
    setState((prev) => ({
      ...prev,
      quotaText: "每日可免费诊断 2 次",
      quotaExceeded: false,
      error: "",
      leadSent: false,
    }));
  }

  function handleDownloadReport() {
    if (!state.result) return;

    const reportHtml = `<!doctype html>
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
      .score { width: 130px; height: 130px; border-radius: 999px; display: flex; flex-direction: column; align-items: center; justify-content: center; background: ${state.result.score < 60 ? "#fde9e9" : state.result.score < 80 ? "#fff5dd" : "#e8f7ef"}; color: ${state.result.score < 60 ? "#b42828" : state.result.score < 80 ? "#9a6a07" : "#13663f"}; }
      .score strong { font-size: 52px; line-height: 1; }
      .score span { margin-top: 6px; font-size: 14px; color: #4f5f84; }
      .summary { font-size: 24px; line-height: 1.5; font-weight: 700; color: #b42828; }
      .industry { margin-top: 10px; color: #5d6d92; font-size: 14px; }
      h2 { margin: 34px 0 14px; font-size: 24px; color: #1d4684; }
      .suggestion { margin-top: 16px; background: #fff; border: 1px solid #dbe3f4; border-radius: 20px; padding: 22px; }
      .action { margin: 0; font-size: 24px; line-height: 1.5; font-weight: 800; color: #b42828; }
      .row { margin-top: 14px; font-size: 16px; line-height: 1.9; color: #32415f; }
      .evidence { margin-top: 14px; padding: 10px 14px; background: #edf2ff; border-radius: 14px; color: #445b8d; font-size: 14px; line-height: 1.7; }
      .footer { margin-top: 34px; background: linear-gradient(145deg, #1d2c56 0%, #26396f 58%, #192447 100%); color: #e7eeff; border-radius: 24px; padding: 28px; }
      .footer h3 { margin: 0 0 10px; font-size: 28px; line-height: 1.3; }
      .footer p { margin: 0; font-size: 15px; line-height: 1.9; color: #d6e0ff; }
      .contact { margin-top: 18px; padding-top: 18px; border-top: 1px solid rgba(214, 224, 255, 0.2); }
      .contact strong { color: #fff; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="card">
        <div class="eyebrow">LANDINGPAGE 增长诊断报告</div>
        <h1>3个改了就能见效的点</h1>
        <p class="sub">URL：${escapeHtml(normalizeInputUrl(state.inputUrl))}</p>
        <div class="meta">
          <div class="score">
            <strong>${state.result.score}</strong>
            <span>/100分</span>
          </div>
          <div>
            <div class="summary">${escapeHtml(state.result.summary)}</div>
            <div class="industry">行业识别：${escapeHtml(state.result.industry)} · 超过 ${state.result.percentile}% 同行页面</div>
          </div>
        </div>

        <h2>现在最该先改的 3 件事</h2>
        ${state.result.suggestions
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
        <div class="eyebrow" style="color:#b9c8f5;">人工深度诊断</div>
        <h3>${escapeHtml(CONSULTANT_NAME)}｜${escapeHtml(CONSULTANT_TITLE)}</h3>
        <p>${escapeHtml(CONSULTANT_BIO)}</p>
        <div class="contact">
          <p><strong>微信号：</strong>${escapeHtml(WECHAT_ID)}</p>
          <p><strong>业务说明：</strong>我会亲自查看你的页面，直接告诉你哪段文案要改、CTA 怎么重写、结构顺序怎么调，并给你可执行的优先级方案。</p>
        </div>
      </div>
    </div>
  </body>
</html>`;

    const blob = new Blob([reportHtml], { type: "text/html;charset=utf-8" });
    const fileUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = fileUrl;
    link.download = `lp-diagnosis-report-${Date.now()}.html`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(fileUrl);
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#e8eefc_0%,_#f4f6fb_35%,_#f3f2ee_78%)] text-[#1a1a1a]">
      <main className="mx-auto w-full max-w-6xl px-6 py-10 md:py-14">
        <section className="rounded-3xl border border-[#d6d9e6] bg-[#f8faff]/95 p-7 shadow-[0_28px_70px_rgba(45,73,131,0.09)] md:p-10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="inline-flex rounded-full border border-[#bfc8e3] bg-[#eaf0ff] px-3 py-1 text-xs font-semibold tracking-[0.1em] text-[#445787]">
              LANDINGPAGE 增长诊断
            </p>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <a className="rounded-full border border-[#c7d1ea] px-3 py-1 text-[#3e4d73] hover:bg-[#ebf1ff]" href="https://quaily.com/overseas" target="_blank" rel="noreferrer">我的专栏</a>
              <a className="rounded-full border border-[#c7d1ea] px-3 py-1 text-[#3e4d73] hover:bg-[#ebf1ff]" href="https://mengqi.cc" target="_blank" rel="noreferrer">咨询网站</a>
            </div>
          </div>

          <h1 className="mt-4 max-w-3xl text-3xl font-semibold leading-tight tracking-tight md:text-5xl">
            30秒找出影响网页转化的3个问题
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-[#5a6b92] md:text-base">
            不只告诉你哪里有问题，还会明确先改哪三处、为什么先改、改完看什么。
          </p>

          <form onSubmit={handleSubmit} className="mt-8 grid gap-3 md:grid-cols-[1fr_auto]">
            <input
              value={state.inputUrl}
              onChange={(e) => setState((prev) => ({ ...prev, inputUrl: e.target.value }))}
              onBlur={() =>
                setState((prev) => ({
                  ...prev,
                  inputUrl: normalizeInputUrl(prev.inputUrl),
                }))
              }
              placeholder="输入你的 Landing Page 链接，快速拿到分数、优先级和下一步改版方向。"
              className="h-13 rounded-2xl border border-[#c8d2eb] bg-white px-4 text-sm outline-none transition focus:border-[#6075a7] focus:ring-3 focus:ring-[#dce6ff]"
            />
            <button
              type="submit"
              onClick={() => track("click_start_diagnosis")}
              disabled={state.loading}
              className="h-13 rounded-2xl bg-[#1f355f] px-6 text-sm font-medium text-[#edf3ff] transition hover:bg-[#162745] disabled:cursor-not-allowed disabled:opacity-65"
            >
              {state.loading ? "诊断中..." : "开始诊断"}
            </button>
          </form>

          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-[#536283]">
            <span>{state.quotaText}</span>
            <span>已被 50+ 独立开发者 / 创业者使用和验证</span>
            {isLocalEnv ? (
              <button
                type="button"
                onClick={handleDevReset}
                className="rounded-full border border-[#b8c5e7] bg-white px-3 py-1 text-xs font-medium text-[#385387] hover:bg-[#eef3ff]"
              >
                重置本地额度
              </button>
            ) : null}
          </div>
          {state.error ? (
            <p className="mt-4 rounded-xl border border-[#d58b8b] bg-[#fff5f5] px-4 py-3 text-sm text-[#a33b3b]">{state.error}</p>
          ) : null}
        </section>

        <section ref={diagnosisSectionRef} className="mt-7 min-h-8">
        {!state.loading && !state.result && !state.quotaExceeded ? (
          <section className="mt-7 rounded-3xl border border-[#d9dff0] bg-white/85 p-6">
            <p className="text-xs font-semibold tracking-[0.1em] text-[#506187]">客户反馈</p>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <blockquote className="rounded-2xl border border-[#d7dff0] bg-[#f7f9ff] p-4 text-sm text-[#394765]">
                “我们调整首屏文案后，注册转化明显提升。”
              </blockquote>
              <blockquote className="rounded-2xl border border-[#d7dff0] bg-[#f7f9ff] p-4 text-sm text-[#394765]">
                “第一次有人这么直接指出我们页面真正的问题。”
              </blockquote>
              <blockquote className="rounded-2xl border border-[#d7dff0] bg-[#f7f9ff] p-4 text-sm text-[#394765]">
                “改了 CTA 和信任区后，咨询转化明显变好。”
              </blockquote>
            </div>
          </section>
        ) : null}

        {state.loading ? (
          <section className="mt-8 rounded-3xl border border-[#4e67a8] bg-[linear-gradient(145deg,#111b33_0%,#17284a_48%,#0f1730_100%)] p-7 text-[#dce7ff] shadow-[0_28px_68px_rgba(23,38,78,0.46)] md:p-9">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-semibold text-white">诊断引擎运行中</h2>
              <p className="rounded-full border border-[#4b6296] bg-[#1b2d54] px-3 py-1 text-xs text-[#bcd0ff]">progress {progress}%</p>
            </div>
            <p className="mt-2 text-sm text-[#9fb6ea]">正在解析页面结构与转化链路，请稍候...</p>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#263a67]">
              <div className="h-full rounded-full bg-[linear-gradient(90deg,#52c1ff_0%,#72ffbf_100%)] transition-all duration-500" style={{ width: `${progress}%` }} />
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-[1.2fr_1fr]">
              <div className="space-y-2">
                {PROCESS_STAGES.map((stage, index) => {
                  const done = index < stageIndex;
                  const running = index === stageIndex;
                  return (
                    <div key={stage} className="flex items-center gap-3 rounded-xl border border-[#334b7e] bg-[#16274a]/80 px-4 py-3">
                      <div className={`h-2.5 w-2.5 rounded-full ${done ? "bg-[#60e2a4]" : running ? "animate-pulse bg-[#62b6ff]" : "bg-[#5d76a6]"}`} />
                      <p className={`text-sm ${done ? "text-[#9aefc8]" : running ? "text-[#a7d4ff]" : "text-[#8ea6d4]"}`}>{stage}</p>
                    </div>
                  );
                })}
              </div>
              <div className="rounded-xl border border-[#334b7e] bg-[#0f1a34]/85 p-4 font-mono text-xs text-[#9ac0ff]">
                <p className="mb-2 text-[#8fb4f5]">$ lp-diagnose --url {state.inputUrl || "<pending>"}</p>
                {PROCESS_LOGS.map((line, index) => (
                  <p key={line} className={index <= stageIndex ? "text-[#86f0c1]" : "text-[#6f87b6]"}>
                    [{index <= stageIndex ? "done" : "wait"}] {line}
                  </p>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {state.quotaExceeded ? (
          <section className="mt-8 rounded-3xl border border-[#9bcfae] bg-[linear-gradient(130deg,#f2fff5_0%,#e9fbee_42%,#f3fbf5_100%)] p-7 shadow-[0_24px_55px_rgba(43,112,67,0.12)] md:p-9">
            <p className="text-xs font-semibold tracking-[0.1em] text-[#1f6a3b]">今日免费额度已用完</p>
            <div className="mt-2 grid gap-5 lg:grid-cols-[1.4fr_1fr] lg:items-start">
              <div>
                <h2 className="text-2xl font-semibold text-[#154d2c] md:text-4xl">你现在最需要的是人工深度诊断，不是再跑一次基础评分</h2>
                <p className="mt-3 max-w-3xl text-[15px] leading-7 text-[#2b6e43]">
                  你的免费诊断次数今天已经用完。现在直接加我微信，我会亲自看你的页面，给你更具体的改版建议和优先级路线图。每天仅处理 5 个页面，满额后顺延。
                </p>
              </div>
              <div className="rounded-2xl border border-[#b9ddc6] bg-white/80 p-4">
                <div className="flex items-start gap-4">
                  <div className="group relative rounded-lg border border-[#b9ddc6]">
                    <Image src="/wechat-qr.jpg" alt="微信二维码" width={88} height={88} className="rounded-lg object-cover" />
                    <div className="pointer-events-none absolute bottom-[calc(100%+12px)] right-0 z-[60] hidden w-[min(72vw,460px)] rounded-xl border border-[#9acdb0] bg-white p-2 shadow-[0_24px_55px_rgba(29,83,50,0.35)] group-hover:block">
                      <div className="relative aspect-square w-full">
                        <Image
                          src="/wechat-qr.jpg"
                          alt="微信二维码放大预览"
                          fill
                          sizes="(max-width: 768px) 72vw, 460px"
                          className="rounded-lg object-contain"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-[#24573a]">微信号：{WECHAT_ID}</p>
                    <p className="mt-1 text-xs text-[#3b7a53]">添加时备注“LP诊断”，我会优先查看。</p>
                    <a
                      href="https://mengqi.cc"
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => track("click_contact", { source: "quota_exceeded" })}
                      className="mt-3 inline-flex items-center justify-center rounded-lg bg-[#1f6a3b] px-4 py-2 text-xs font-medium text-[#ebfff2] transition hover:bg-[#17522d]"
                    >
                      立即联系我
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {state.result && !state.quotaExceeded ? (
          <section className="mt-8 space-y-5 rounded-3xl border border-[#d7deef] bg-white/92 p-7 shadow-[0_20px_45px_rgba(65,89,138,0.12)] md:p-10">
            <div className="grid gap-4 border-b border-[#e3e8f5] pb-4 md:grid-cols-[auto_1fr_auto] md:items-center">
              <div className={`flex h-24 w-24 flex-col items-center justify-center rounded-full border-4 border-white shadow-[0_10px_24px_rgba(40,68,123,0.25)] ${scoreStyle.text} ${state.result.score < 60 ? "bg-[#fde9e9]" : state.result.score < 80 ? "bg-[#fff5dd]" : "bg-[#e8f7ef]"}`}>
                <p className="text-4xl font-bold leading-none">{state.result.score}</p>
                <p className="mt-1 text-[11px] font-medium text-[#3f4f72]">/100分</p>
              </div>
              <div>
                <p className="text-[20px] font-semibold leading-8 text-[#b42828]">{state.result.summary}</p>
              </div>
              <div>
                <p className="text-xs tracking-[0.08em] text-[#5f6481]">行业识别</p>
                <p className="mt-1 text-2xl font-semibold text-[#2a3961]">{state.result.industry}</p>
                <p className="mt-1 text-xs text-[#66749b]">超过 {state.result.percentile}% 同行页面</p>
              </div>
            </div>

            <div className="space-y-3">
              <h2 className="text-xl font-semibold text-[#1d4684]">3个改了就能见效的点</h2>
              {state.result.suggestions.map((item) => (
                <article key={item.title} className="rounded-2xl border border-[#e1e6f3] bg-[#fcfdff] p-5">
                  <h3 className="text-xl font-semibold leading-8 text-[#1f6a3b]">{item.action}</h3>
                  <p className="mt-3 text-sm leading-6 text-[#2f3f62]">
                    <span className="font-semibold text-[#31466d]">为什么要先改：</span>
                    {item.issue}
                  </p>
                  <p className="mt-3 rounded-lg bg-[#edf2ff] px-3 py-2 text-xs leading-5 text-[#445b8d]">表现：{item.evidence}</p>
                  <p className="mt-3 text-sm leading-6 text-[#374665]">
                    <span className="font-semibold text-[#31466d]">影响：</span>
                    {item.impact}
                  </p>
                </article>
              ))}
            </div>

            <div className="flex justify-center md:justify-end">
              <button
                type="button"
                onClick={handleDownloadReport}
                className="inline-flex animate-[pulse_2.6s_ease-in-out_infinite] items-center justify-center gap-2 rounded-2xl border border-[#9fd0ac] bg-[#1f6a3b] px-5 py-3 text-sm font-medium text-[#ecfff2] shadow-[0_14px_28px_rgba(31,106,59,0.2)] transition hover:bg-[#17522d]"
              >
                <span aria-hidden="true" className="text-base leading-none">↓</span>
                下载这份诊断报告
              </button>
            </div>

            <div className="rounded-3xl border border-[#4f6097] bg-[linear-gradient(145deg,#1d2c56_0%,#26396f_58%,#192447_100%)] p-6 text-[#e7eeff] shadow-[0_24px_60px_rgba(23,36,78,0.36)] md:p-8">
              <div className="grid gap-6 lg:grid-cols-[1.2fr_0.9fr] lg:items-start">
                <div>
                  <p className="text-xs font-semibold tracking-[0.1em] text-[#b9c8f5]">人工深度诊断名额</p>
                  <h2 className="mt-2 text-2xl font-semibold leading-tight text-white md:text-3xl">
                    还想获取更加深入的优化方案？我会亲自看你的页面，并给你更具体的增长建议
                  </h2>
                  <p className="mt-3 max-w-3xl text-[15px] leading-7 text-[#d8e2ff]">
                    AI审核给你方向，专家诊断会根据你目前的业务规模和卡点告诉你“哪一段文案要改、CTA 怎么重写、结构顺序怎么调”并给你可执行的优先级方案。
                  </p>
                  <p className="mt-2 text-sm text-[#b8c8f4]">每天仅人工深度查看 5 个页面，满额后顺延至明天。</p>
                  <a
                    href="https://mengqi.cc"
                    target="_blank"
                    rel="noreferrer"
                    className="mt-4 inline-flex items-center rounded-lg border border-[#8ca4dc] px-4 py-2 text-sm font-medium text-[#e4ecff] transition hover:bg-[#304579]"
                  >
                    查看专家诊断流程
                  </a>
                </div>

                <div className="rounded-2xl border border-[#5567a1] bg-[#253666]/65 p-4">
                  <div className="flex items-center gap-4">
                    <div className="group relative rounded-lg border border-[#6173ad]">
                      <Image src="/wechat-qr.jpg" alt="微信二维码" width={88} height={88} className="rounded-lg object-cover" />
                      <div className="pointer-events-none absolute bottom-[calc(100%+12px)] right-0 z-[60] hidden w-[min(72vw,460px)] rounded-xl border border-[#7085c7] bg-white p-2 shadow-[0_24px_55px_rgba(22,34,77,0.4)] group-hover:block">
                        <div className="relative aspect-square w-full">
                          <Image
                            src="/wechat-qr.jpg"
                            alt="微信二维码放大预览"
                            fill
                            sizes="(max-width: 768px) 72vw, 460px"
                            className="rounded-lg object-contain"
                          />
                        </div>
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-white">微信号：{WECHAT_ID}</p>
                        <button
                          type="button"
                          onClick={handleCopyWechat}
                          className="rounded-md border border-[#8ca4dc] px-2 py-1 text-xs font-medium text-[#d8e5ff] hover:bg-[#304579]"
                        >
                          复制
                        </button>
                      </div>
                      <p className="mt-1 text-xs text-[#c6d5fb]">点击按钮会自动复制微信号，并记录你的诊断结果给我做跟进。</p>
                    </div>
                  </div>
                </div>
              </div>
              {state.leadSent ? (
                <p className="mt-3 text-sm text-[#d4defa]">已记录你的诊断请求，微信号已复制。添加后请备注“LP诊断”。</p>
              ) : null}
            </div>

            <div className="rounded-2xl border border-[#d7dff0] bg-white/90 p-4">
              <p className="text-xs font-semibold tracking-[0.1em] text-[#506187]">客户反馈</p>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <blockquote className="rounded-xl border border-[#d7dff0] bg-[#f7f9ff] p-3 text-sm text-[#394765]">
                  “我们调整首屏文案后，注册转化明显提升。”
                </blockquote>
                <blockquote className="rounded-xl border border-[#d7dff0] bg-[#f7f9ff] p-3 text-sm text-[#394765]">
                  “第一次有人这么直接指出我们页面真正的问题。”
                </blockquote>
                <blockquote className="rounded-xl border border-[#d7dff0] bg-[#f7f9ff] p-3 text-sm text-[#394765]">
                  “改了 CTA 和信任区后，咨询转化明显变好。”
                </blockquote>
              </div>
            </div>
          </section>
        ) : null}
        </section>

        <footer className="mt-10 border-t border-[#d9dfef] pt-5 text-center text-sm text-[#5b6b8d]">
          <p>
            由增长设计顾问{" "}
            <a
              className="font-semibold text-[#244783] underline decoration-[#9eb4e6] underline-offset-3"
              href="https://x.com/daqi029"
              target="_blank"
              rel="noreferrer"
            >
              Mengqi
            </a>{" "}
            打造，曾帮助多个 SaaS 产品显著提升注册转化率
          </p>
          <p className="mt-1 text-xs text-[#7a88a6]">© 2026 Landingpage 增长诊断</p>
        </footer>
      </main>
    </div>
  );
}
