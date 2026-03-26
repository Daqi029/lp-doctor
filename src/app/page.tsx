"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { track } from "@vercel/analytics";
import type { AnalyzeResponse, AnalyzeResult } from "@/lib/types";
import { buildReportHtml } from "@/lib/report";
import { getRecommendedArticles } from "@/lib/articles";

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
const SOCIAL_PROOF = {
  visits: 161,
  submissions: 99,
  countries: [
    { flag: "🇺🇸", name: "美国" },
    { flag: "🇨🇳", name: "中国" },
    { flag: "🇸🇬", name: "新加坡" },
    { flag: "🇭🇰", name: "香港" },
    { flag: "🇯🇵", name: "日本" },
  ],
};

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

  useEffect(() => {
    void fetch("/api/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "page_view" }),
    }).catch(() => undefined);
  }, []);

  const progress = Math.round(((stageIndex + 1) / PROCESS_STAGES.length) * 100);

  const scoreStyle = scoreTone(state.result?.score || 0);
  const recommendedArticles = state.result ? getRecommendedArticles(state.result.suggestions) : [];

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

  function handleClickArticle(article: { slug: string; label: string }, position: number) {
    if (!state.result) return;

    track("click_article", {
      article_slug: article.slug,
      article_label: article.label,
      article_position: position,
      url: normalizeInputUrl(state.inputUrl),
      score: state.result.score,
      percentile: state.result.percentile,
      industry: state.result.industry,
    });

    void fetch("/api/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        type: "click_article",
        url: normalizeInputUrl(state.inputUrl),
        score: state.result.score,
        percentile: state.result.percentile,
        industry: state.result.industry,
        articleSlug: article.slug,
        articleLabel: article.label,
        articlePosition: position,
      }),
    }).catch(() => undefined);
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

    void fetch("/api/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "download_report",
        url: normalizeInputUrl(state.inputUrl),
        score: state.result.score,
        percentile: state.result.percentile,
        industry: state.result.industry,
      }),
    }).catch(() => undefined);

    const reportHtml = buildReportHtml({
      url: normalizeInputUrl(state.inputUrl),
      result: state.result,
      wechatId: WECHAT_ID,
    });

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
            30秒找到最该先改的3个问题
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-[#5a6b92] md:text-base">
            输入你的 Landing Page 链接，立即拿到分数、问题判断，以及 3 个可直接推进的优化方向。
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
              {state.loading ? "诊断中..." : "查看优先修改点"}
            </button>
          </form>

          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-[#536283]">
            <span>{state.quotaText}</span>
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
          <>
          <section className="mt-3 rounded-3xl border border-[#d8dff1] bg-white/92 p-5 shadow-[0_14px_28px_rgba(55,79,132,0.06)]">
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-[#203762] md:text-xl">
                已有 {SOCIAL_PROOF.submissions} 个页面提交了诊断
              </h2>
              <p className="mt-2 text-sm leading-6 text-[#5f7197]">
                提交页面来自 <span className="mr-1">🇺🇸</span>美国、<span className="mr-1">🇨🇳</span>中国、<span className="mr-1">🇸🇬</span>新加坡、<span className="mr-1">🇭🇰</span>香港、<span className="mr-1">🇯🇵</span>日本等市场。
              </p>
            </div>
          </section>

          <section className="mt-4 rounded-3xl border border-[#d9dff0] bg-white/85 p-6">
            <p className="text-xs font-semibold tracking-[0.1em] text-[#506187]">客户反馈</p>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <blockquote className="rounded-2xl border border-[#d7dff0] bg-[#f7f9ff] p-4 text-[15px] leading-7 text-[#394765]">
                “我们调整首屏文案后，注册转化明显提升。”
              </blockquote>
              <blockquote className="rounded-2xl border border-[#d7dff0] bg-[#f7f9ff] p-4 text-[15px] leading-7 text-[#394765]">
                “第一次有人这么直接指出我们页面真正的问题。”
              </blockquote>
              <blockquote className="rounded-2xl border border-[#d7dff0] bg-[#f7f9ff] p-4 text-[15px] leading-7 text-[#394765]">
                “改了 CTA 和信任区后，成交转化明显变好。”
              </blockquote>
            </div>
          </section>
          </>
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

            <div className="rounded-2xl border border-[#dce4f4] bg-[#f8fbff] p-5">
              <p className="text-base font-semibold text-[#203762]">下载完整诊断报告，方便你后续改版和内部讨论</p>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[#5c6f96]">
                这份报告会保留当前分数、问题判断和 3 个优先修改方向。适合发给团队成员、设计师或合作伙伴一起讨论。
              </p>
              <div className="mt-4 flex justify-start">
                <button
                  type="button"
                  onClick={handleDownloadReport}
                  className="inline-flex animate-[pulse_2.6s_ease-in-out_infinite] items-center justify-center gap-2 rounded-2xl border border-[#9fd0ac] bg-[#1f6a3b] px-5 py-3 text-sm font-medium text-[#ecfff2] shadow-[0_14px_28px_rgba(31,106,59,0.2)] transition hover:bg-[#17522d]"
                >
                  <span aria-hidden="true" className="text-base leading-none">↓</span>
                  下载完整诊断报告
                </button>
              </div>
            </div>

            {recommendedArticles.length > 0 ? (
              <div className="border-t border-[#dbe3f4] pt-5">
                <div className="flex flex-col gap-2">
                  <p className="text-xs font-semibold tracking-[0.1em] text-[#60729a]">📚 继续自己改</p>
                  <h3 className="text-lg font-semibold text-[#1d2f56]">先看这两篇</h3>
                  <p className="text-sm leading-6 text-[#5a6b8d]">这两篇正好对应你这页最明显的问题。</p>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {recommendedArticles.map((article, index) => (
                    <a
                      key={article.slug}
                      href={article.href}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => handleClickArticle(article, index + 1)}
                      className="group overflow-hidden rounded-2xl border border-[#d8e1f3] bg-white transition hover:-translate-y-0.5 hover:border-[#b7c6e8] hover:shadow-[0_16px_34px_rgba(45,73,131,0.08)]"
                    >
                      <div className="border-b border-[#e7edf8] bg-[linear-gradient(135deg,#f8fbff_0%,#eef4ff_100%)] px-4 py-3">
                        <p className="text-[11px] font-semibold tracking-[0.08em] text-[#6a7ea8]">{article.label}</p>
                      </div>
                      <div className="px-4 py-4">
                        <p className="text-base font-semibold leading-7 text-[#1f355f] transition group-hover:text-[#16376e]">{article.title}</p>
                        <p className="mt-2 text-sm leading-6 text-[#60729a]">{article.reason}</p>
                        <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-[#244783]">
                          打开文章
                          <span aria-hidden="true">↗</span>
                        </span>
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="rounded-3xl border border-[#4f6097] bg-[linear-gradient(145deg,#1d2c56_0%,#26396f_58%,#192447_100%)] p-6 text-[#e7eeff] shadow-[0_24px_60px_rgba(23,36,78,0.36)] md:p-8">
              <div className="grid gap-6 lg:grid-cols-[1.2fr_0.9fr] lg:items-start">
                <div>
                  <p className="text-xs font-semibold tracking-[0.1em] text-[#b9c8f5]">💬 继续深度诊断</p>
                  <h2 className="mt-2 text-2xl font-semibold leading-tight text-white md:text-3xl">
                    如果你准备继续推进，我可以直接告诉你先改哪一块最值
                  </h2>
                  <p className="mt-3 max-w-3xl text-[15px] leading-7 text-[#d8e2ff]">
                    自动结果能帮你快速定位问题，但不会结合你当前的业务目标告诉你先改什么、为什么先改。人工诊断会进一步给出更具体的优先级判断、修改重点和推进方向。
                  </p>
                  <p className="mt-2 text-sm text-[#b8c8f4]">适合已经准备改版、投流或提升当前转化效率的项目。很多客户会先从一次诊断开始，再决定是否进入更深入的项目合作。</p>
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
                      <p className="mt-1 text-xs text-[#c6d5fb]">复制微信，继续深度诊断。把你的页面发我，我会基于当前结果继续往下看。</p>
                    </div>
                  </div>
                </div>
              </div>
              {state.leadSent ? (
                <p className="mt-3 text-sm text-[#d4defa]">微信号已复制。添加后请备注“LP诊断”，我会优先按这次结果继续往下看。</p>
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
