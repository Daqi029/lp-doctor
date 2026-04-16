"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { track } from "@vercel/analytics";
import type { AnalyzeResponse, AnalyzeResult } from "@/lib/types";
import { buildReportHtml } from "@/lib/report";

type State = {
  loading: boolean;
  error: string;
  result: AnalyzeResult | null;
  quotaText: string;
  inputUrl: string;
  quotaExceeded: boolean;
  downloadGateOpen: boolean;
  downloadContact: string;
  lightDiagnosisGateOpen: boolean;
  wechatCopied: boolean;
  socialProofSubmissions: number | null;
};

const WECHAT_ID = "daqi029";
const QUICK_CALL_URL = process.env.NEXT_PUBLIC_QUICK_CALL_URL || "https://calendly.com/mengqi-pmq/15min";
const ALIPAY_LIGHT_DIAGNOSIS_IMAGE = "/alipay-light-diagnosis.jpg";

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

function getDisplayScore(score: number): number {
  const clamped = Math.max(40, Math.min(71, score));
  return Math.round(55 + ((clamped - 40) * 30) / 31);
}

function scoreTone(score: number): { text: string; accent: string; track: string } {
  if (score < 60) return { text: "text-[#b42828]", accent: "#d63b3b", track: "#f3d9d9" };
  if (score < 75) return { text: "text-[#9a6a07]", accent: "#c98710", track: "#f6ead1" };
  return { text: "text-[#13663f]", accent: "#2d9b68", track: "#dcefe6" };
}

function scorePotentialLabel(score: number): string {
  if (score <= 59) return "很高";
  if (score <= 74) return "较高";
  if (score <= 84) return "中高";
  return "稳定";
}

export default function Home() {
  const [state, setState] = useState<State>({
    loading: false,
    error: "",
    result: null,
    quotaText: "每日可免费诊断 2 次",
    inputUrl: "",
    quotaExceeded: false,
    downloadGateOpen: false,
    downloadContact: "",
    lightDiagnosisGateOpen: false,
    wechatCopied: false,
    socialProofSubmissions: null,
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

  useEffect(() => {
    void fetch("/api/social-proof")
      .then((response) => response.json())
      .then((payload: { ok: boolean; data?: { effectiveSubmissionCount?: number } }) => {
        const count = payload.data?.effectiveSubmissionCount;
        if (!payload.ok || typeof count !== "number") return;
        setState((prev) => ({ ...prev, socialProofSubmissions: count }));
      })
      .catch(() => undefined);
  }, []);

  const progress = Math.round(((stageIndex + 1) / PROCESS_STAGES.length) * 100);

  const displayScore = state.result ? getDisplayScore(state.result.score) : 0;
  const scoreStyle = scoreTone(displayScore);
  const scorePotential = scorePotentialLabel(displayScore);
  const isSpecialResult = Boolean(state.result?.specialMode);
  const scoreRingDegrees = Math.max(0, Math.min(360, Math.round((displayScore / 100) * 360)));

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

  function handleClickCase(caseLabel: string, position: number) {
    if (!state.result) return;

    track("click_case", {
      case_label: caseLabel,
      case_position: position,
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
        type: "click_case",
        url: normalizeInputUrl(state.inputUrl),
        score: state.result.score,
        percentile: state.result.percentile,
        industry: state.result.industry,
        articleLabel: caseLabel,
        articlePosition: position,
      }),
    }).catch(() => undefined);
  }

  function handleClickQuickCall() {
    if (!state.result) return;

    track("click_quick_call", {
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
        type: "click_quick_call",
        url: normalizeInputUrl(state.inputUrl),
        score: state.result.score,
        percentile: state.result.percentile,
        industry: state.result.industry,
      }),
    }).catch(() => undefined);
  }

  function handleClickLightDiagnosis() {
    if (!state.result) return;

    track("click_light_diagnosis", {
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
        type: "click_light_diagnosis_entry",
        url: normalizeInputUrl(state.inputUrl),
        score: state.result.score,
        percentile: state.result.percentile,
        industry: state.result.industry,
      }),
    }).catch(() => undefined);

    void fetch("/api/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        type: "click_light_diagnosis",
        url: normalizeInputUrl(state.inputUrl),
        score: state.result.score,
        percentile: state.result.percentile,
        industry: state.result.industry,
      }),
    }).catch(() => undefined);

    void fetch("/api/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        type: "open_light_diagnosis_payment",
        url: normalizeInputUrl(state.inputUrl),
        score: state.result.score,
        percentile: state.result.percentile,
        industry: state.result.industry,
      }),
    }).catch(() => undefined);

    setState((prev) => ({ ...prev, lightDiagnosisGateOpen: true, wechatCopied: false }));
  }

  function handleCloseLightDiagnosisGate() {
    if (state.result) {
      void fetch("/api/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        body: JSON.stringify({
          type: "close_light_diagnosis_payment",
          url: normalizeInputUrl(state.inputUrl),
          score: state.result.score,
          percentile: state.result.percentile,
          industry: state.result.industry,
        }),
      }).catch(() => undefined);
    }
    setState((prev) => ({ ...prev, lightDiagnosisGateOpen: false, wechatCopied: false }));
  }

  async function handleCopyWechat() {
    try {
      await navigator.clipboard.writeText(WECHAT_ID);
      if (state.result) {
        void fetch("/api/event", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          keepalive: true,
          body: JSON.stringify({
            type: "copy_wechat_after_payment",
            url: normalizeInputUrl(state.inputUrl),
            score: state.result.score,
            percentile: state.result.percentile,
            industry: state.result.industry,
          }),
        }).catch(() => undefined);
      }
      setState((prev) => ({ ...prev, wechatCopied: true }));
    } catch {
      setState((prev) => ({ ...prev, wechatCopied: false }));
    }
  }


  async function handleDevReset() {
    const response = await fetch("/api/dev-reset", { method: "POST" });
    if (!response.ok) return;
    setState((prev) => ({
      ...prev,
      quotaText: "每日可免费诊断 2 次",
      quotaExceeded: false,
      error: "",
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

  function handleOpenDownloadGate() {
    if (state.result) {
      void fetch("/api/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        body: JSON.stringify({
          type: "open_download_gate",
          url: normalizeInputUrl(state.inputUrl),
          score: state.result.score,
          percentile: state.result.percentile,
          industry: state.result.industry,
        }),
      }).catch(() => undefined);
    }
    setState((prev) => ({ ...prev, downloadGateOpen: true }));
  }

  function handleCloseDownloadGate() {
    if (state.result) {
      void fetch("/api/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        body: JSON.stringify({
          type: "close_download_gate",
          url: normalizeInputUrl(state.inputUrl),
          score: state.result.score,
          percentile: state.result.percentile,
          industry: state.result.industry,
        }),
      }).catch(() => undefined);
    }
    setState((prev) => ({ ...prev, downloadGateOpen: false }));
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
              <h2 className="flex flex-wrap items-end gap-x-2 gap-y-1 text-lg font-semibold tracking-tight text-[#203762] md:text-xl">
                <span>已有</span>
                {state.socialProofSubmissions === null ? (
                  <span className="inline-block h-9 w-18 animate-pulse rounded-md bg-[#e7ecf8] align-middle" aria-label="正在加载提交总数" />
                ) : (
                  <span
                    className="text-3xl leading-none text-[#1d355b] md:text-4xl"
                    style={{ fontFamily: "\"Iowan Old Style\", \"Times New Roman\", Georgia, serif" }}
                  >
                    {state.socialProofSubmissions}
                  </span>
                )}
                <span>个页面提交了诊断</span>
              </h2>
              <p className="mt-2 text-sm leading-6 text-[#5f7197]">
                提交页面来自美国、中国、新加坡、香港、日本等市场。
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
                    <Image src="/wechat-qr.jpg" alt="微信二维码" width={352} height={352} className="rounded-lg object-cover" />
                    <div className="pointer-events-none absolute bottom-[calc(100%+12px)] right-0 z-[60] hidden w-[min(72vw,345px)] rounded-xl border border-[#9acdb0] bg-white p-2 shadow-[0_24px_55px_rgba(29,83,50,0.35)] group-hover:block">
                      <div className="relative aspect-square w-full">
                        <Image
                          src="/wechat-qr.jpg"
                          alt="微信二维码放大预览"
                          fill
                          sizes="(max-width: 768px) 72vw, 345px"
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
            {isSpecialResult ? (
              <div className="rounded-2xl border border-[#b6ddc2] bg-[#f7fff9] px-6 py-8">
                <p className="text-xl font-semibold leading-9 text-[#1f6a3b] md:text-2xl md:leading-10">
                  {state.result.summary}
                </p>
              </div>
            ) : (
              <>
                <div className="mx-auto max-w-5xl space-y-10 border-b border-[#e3e8f5] pb-10">
                  <div className="flex flex-col items-center text-center">
                    <div
                      className="flex h-40 w-40 items-center justify-center rounded-full shadow-[0_10px_30px_rgba(65,89,138,0.08)]"
                      style={{
                        background: `conic-gradient(from -90deg, ${scoreStyle.accent} 0deg ${scoreRingDegrees}deg, ${scoreStyle.track} ${scoreRingDegrees}deg 360deg)`,
                      }}
                    >
                      <div className="flex h-[calc(100%-20px)] w-[calc(100%-20px)] flex-col items-center justify-center rounded-full bg-white">
                        <p className={`text-5xl font-semibold leading-none ${scoreStyle.text}`}>{displayScore}</p>
                        <p className="mt-2 text-sm font-semibold text-[#62739a]">优化潜力值</p>
                      </div>
                    </div>
                    <h2 className="mt-8 text-[28px] font-semibold leading-tight text-[#17376e] md:text-[40px]">
                      转化优化潜力：{scorePotential}
                    </h2>
                    <p className="mt-4 max-w-3xl text-[17px] leading-8 text-[#5b6f96]">
                      基础结构已经具备，但还存在几个会直接影响转化的关键问题。优先解决下面这 3 个点，通常比继续堆内容更有效。
                    </p>
                  </div>

                  <div className="rounded-[28px] border border-[#e1e6f3] bg-[#fcfdff] p-6 shadow-[0_12px_28px_rgba(45,73,131,0.06)] md:p-8">
                    <div className="flex items-center gap-2 text-sm font-semibold tracking-[0.08em] text-[#7c8db1]">
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-[#cdd8f1] text-[11px]">!</span>
                      TOP 3 阻塞点
                    </div>
                    <div className="mt-5 space-y-5">
                      {state.result.suggestions.map((item, index) => (
                        <div key={item.title} className="flex gap-4">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#fff2f2] text-sm font-semibold text-[#ff5a5f]">
                            {index + 1}
                          </div>
                          <div className="min-w-0">
                            <h3 className="text-[22px] font-semibold leading-8 text-[#1d2f55]">{item.title}</h3>
                            <p className="mt-1 text-[16px] leading-7 text-[#62739a]">{item.impact}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="mx-auto max-w-5xl space-y-6">
                    <h2 className="text-center text-xl font-semibold text-[#1d4684]">实际案例</h2>
                    <div className="grid gap-3 md:grid-cols-3">
                    <a
                      href="https://x.com/jaredliu_bravo/status/1836239276549546293"
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => handleClickCase("jared_x_case", 1)}
                      className="rounded-xl border-2 border-[#c8d2ef] bg-[linear-gradient(145deg,#faf8ff_0%,#f5f9ff_52%,#fffaf3_100%)] p-4 text-sm text-[#394765] shadow-[0_10px_24px_rgba(45,73,131,0.06)] transition hover:-translate-y-0.5 hover:border-[#9fb3e4] hover:shadow-[0_20px_44px_rgba(45,73,131,0.14)]"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#cfd9ef] bg-white text-sm font-semibold text-[#28457c] shadow-[0_10px_22px_rgba(45,73,131,0.1)]">
                          JL
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-[#1f355f]">Jared Liu</p>
                          <p className="text-xs text-[#66789d]">AI Reading List 项目 · X 公开反馈</p>
                        </div>
                      </div>
                      <blockquote className="mt-3 text-[15px] leading-7 text-[#32425f]">
                        “原来注册转化率只有 <span className="font-semibold text-[#b42828]">10.6%</span>，按 Mengqi 的建议优化后，注册转化提升了近 <span className="font-semibold text-[#0f8a45]">28%</span>。”
                      </blockquote>
                      <p className="mt-4 text-xs font-medium text-[#5e729c]">查看原帖 ↗</p>
                    </a>
                    <a
                      href="https://x.com/realcoreychiu/status/2044280334653575214"
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => handleClickCase("coreychiu_x_case", 2)}
                      className="rounded-xl border border-[#d8e4d7] bg-[linear-gradient(145deg,#f7fff7_0%,#f4fbf5_50%,#fbfff9_100%)] p-3 text-sm text-[#394765] transition hover:-translate-y-0.5 hover:border-[#a9cfab] hover:shadow-[0_16px_32px_rgba(49,111,74,0.14)]"
                    >
                      <p className="text-sm font-semibold text-[#1f355f]">Corey Chiu · 客户证言</p>
                      <p className="mt-1 text-xs text-[#66789d]">X 公开反馈</p>
                      <blockquote className="mt-3 text-[15px] leading-7 text-[#32425f]">
                        “专业的事还是得找专业的人来做。推荐大琪老师（@daqi029）的增长诊断服务。”
                      </blockquote>
                      <p className="mt-2 text-[15px] leading-7 text-[#32425f]">
                        该客户网站运营一年多后做到
                        <span className="font-semibold text-[#0f8a45]"> 3k MRR </span>
                        ，并表示其中关键转折来自两次增长优化，反馈为“效果非常显著”。
                      </p>
                      <Image
                        src="/corey-chiu-testimonial.jpeg"
                        alt="Corey Chiu 增长数据截图"
                        width={1833}
                        height={876}
                        className="mt-3 h-auto w-full rounded-lg border border-[#cfe1ce]"
                      />
                      <p className="mt-4 text-xs font-medium text-[#5e729c]">查看原帖 ↗</p>
                    </a>
                    <div className="rounded-xl border border-[#ead7e1] bg-[linear-gradient(145deg,#fff7fb_0%,#fff8f3_50%,#fffdf8_100%)] p-3 text-sm text-[#394765]">
                      <p className="text-sm font-semibold text-[#1f355f]">很多项目缺的不是建议，而是优先级判断</p>
                      <p className="mt-1 text-xs text-[#66789d]">服务价值说明</p>
                      <p className="mt-3 text-[15px] leading-7 text-[#32425f]">
                        真正拖慢改版的，往往不是没人发现问题，而是不知道该先改哪一块最值。这也是人工诊断最有价值的地方。
                      </p>
                    </div>
                    </div>
                  </div>

                  <div className="rounded-[30px] border border-[#d6dff3] bg-[linear-gradient(150deg,#f4f8ff_0%,#f6f9ff_42%,#fefcff_100%)] p-6 shadow-[0_14px_30px_rgba(45,73,131,0.1)] md:p-8">
                    <p className="inline-flex rounded-full bg-[#e7eeff] px-3 py-1 text-xs font-semibold tracking-[0.06em] text-[#3d5f9f]">本周主推方案</p>
                    <h3 className="mt-4 text-[28px] font-semibold leading-tight text-[#1d2f55] md:text-[36px]">
                      轻诊断（48小时内交付）：先改哪一块，回报最高
                    </h3>
                    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                      <p className="text-[30px] font-semibold leading-none text-[#17376e]">$199</p>
                      <p className="rounded-full bg-[#fff2dc] px-3 py-1 text-sm font-semibold text-[#9a6a07]">本周仅剩 4 个名额</p>
                    </div>
                    <p className="mt-4 text-[17px] leading-8 text-[#62739a]">
                      你只需要给我页面链接并完成一次 10 分钟对齐。48 小时内我会给你可直接执行的优化报告：改什么、怎么改、为什么改、预估提升区间。
                    </p>
                    <ul className="mt-5 space-y-3 text-[16px] leading-7 text-[#40557e]">
                      <li className="flex items-center gap-3"><span className="text-[#3974ea]">◎</span>1 次 1v1：快速对齐你的主路径目标</li>
                      <li className="flex items-center gap-3"><span className="text-[#3974ea]">◎</span>48h 执行报告：改什么 / 怎么改 / 为什么改</li>
                      <li className="flex items-center gap-3"><span className="text-[#3974ea]">◎</span>1 次复盘讲解：确保你能按优先级推进</li>
                    </ul>
                    <button
                      type="button"
                      onClick={handleClickLightDiagnosis}
                      className="mt-7 inline-flex w-full items-center justify-center rounded-2xl bg-[#3368ea] px-6 py-4 text-lg font-semibold text-white shadow-[0_18px_35px_rgba(51,104,234,0.26)] transition hover:bg-[#295bda]"
                    >
                      支付 $199 获取 48h 轻诊断 →
                    </button>
                    <p className="mt-4 text-sm leading-7 text-[#6f819f]">
                      <span className="mr-1 text-[#30a46c]">◉</span>
                      不含设计稿与代执行，专注给你可落地的判断与动作。
                    </p>
                    <details className="mt-5 border-t border-[#e2e8f6] pt-5">
                      <summary className="group cursor-pointer list-none text-center text-[15px] font-medium text-[#7486a8] transition hover:text-[#4f658d]">
                        <span className="inline-flex items-center gap-2">
                          我适合预约，还是直接买轻诊断？
                          <span aria-hidden="true" className="text-xs transition group-hover:translate-y-0.5">▾</span>
                        </span>
                      </summary>
                      <div className="mt-3 space-y-2 text-center text-sm leading-7 text-[#62739a]">
                        <p>
                          <span className="font-semibold text-[#1d2f55]">Quick Call：</span>
                          回答的是：“我现在最该先动哪一块？”
                        </p>
                        <p>
                          <span className="font-semibold text-[#1d2f55]">48h 轻诊断：</span>
                          回答的是：“你直接告诉我该怎么推进，我照着做。”
                        </p>
                      </div>
                    </details>
                  </div>
                </div>

                <div className="mx-auto max-w-5xl space-y-6">
                  <div className="text-center">
                    <p className="text-sm text-[#6d7ea0]">还不确定是否直接开始？</p>
                    <a
                      href={QUICK_CALL_URL}
                      target="_blank"
                      rel="noreferrer"
                      onClick={handleClickQuickCall}
                      className="mt-2 inline-flex items-center justify-center text-sm font-semibold text-[#3d5f9f] underline underline-offset-4 transition hover:text-[#264a8a]"
                    >
                      先免费聊 15 分钟再决定 ↗
                    </a>
                  </div>

                  <div className="border-t border-[#dbe3f4] pt-5 text-center">
                    <button
                      type="button"
                      onClick={handleOpenDownloadGate}
                      className="inline-flex items-center justify-center gap-2 text-sm font-medium text-[#647aa6] transition hover:text-[#244783]"
                    >
                      <span aria-hidden="true" className="text-base leading-none">↓</span>
                      下载完整诊断报告（仅供存档）
                    </button>
                  </div>
                </div>
              </>
            )}
          </section>
        ) : null}

        {state.downloadGateOpen && state.result ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(19,33,62,0.48)] px-4">
            <div className="w-full max-w-md rounded-[28px] border border-[#d8e1f3] bg-white p-6 shadow-[0_24px_60px_rgba(18,35,75,0.2)]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold tracking-[0.12em] text-[#7183a8]">先留个联系方式</p>
                  <h3 className="mt-2 text-2xl font-semibold text-[#1d2f55]">填写微信或邮箱后下载报告</h3>
                </div>
                <button
                  type="button"
                  onClick={handleCloseDownloadGate}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#d4dcef] text-[#6b7ea5] transition hover:border-[#b8c7e8] hover:text-[#244783]"
                  aria-label="关闭"
                >
                  ×
                </button>
              </div>
              <label className="mt-5 block text-sm font-medium text-[#41557d]">
                微信号或邮箱
                <input
                  value={state.downloadContact}
                  onChange={(e) => setState((prev) => ({ ...prev, downloadContact: e.target.value }))}
                  className="mt-2 h-12 w-full rounded-2xl border border-[#cdd8ef] bg-[#fbfcff] px-4 text-sm text-[#1d2f55] outline-none transition focus:border-[#5f7db8] focus:ring-3 focus:ring-[#e4ecff]"
                />
              </label>
              <button
                type="button"
                onClick={() => {
                  if (state.result) {
                    void fetch("/api/event", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      keepalive: true,
                      body: JSON.stringify({
                        type: "submit_download_gate",
                        url: normalizeInputUrl(state.inputUrl),
                        score: state.result.score,
                        percentile: state.result.percentile,
                        industry: state.result.industry,
                      }),
                    }).catch(() => undefined);
                  }
                  handleDownloadReport();
                  handleCloseDownloadGate();
                }}
                disabled={!state.downloadContact.trim()}
                className="mt-5 inline-flex w-full items-center justify-center rounded-2xl bg-[#223567] px-5 py-3.5 text-base font-semibold text-white transition hover:bg-[#1b2b54] disabled:cursor-not-allowed disabled:bg-[#c8d3ea] disabled:text-[#6d7fa3]"
              >
                下载报告
              </button>
            </div>
          </div>
        ) : null}

        {state.lightDiagnosisGateOpen && state.result ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(19,33,62,0.56)] px-4 py-4 md:py-8">
            <div className="w-full max-w-sm rounded-[26px] border border-[#d8e1f3] bg-white p-5 shadow-[0_24px_60px_rgba(18,35,75,0.24)] md:max-w-md md:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold tracking-[0.12em] text-[#7183a8]">48h 轻诊断付款</p>
                  <h3 className="mt-1.5 text-xl font-semibold text-[#1d2f55] md:text-2xl">扫码支付后，加我微信继续推进</h3>
                </div>
                <button
                  type="button"
                  onClick={handleCloseLightDiagnosisGate}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#d4dcef] text-[#6b7ea5] transition hover:border-[#b8c7e8] hover:text-[#244783]"
                  aria-label="关闭"
                >
                  ×
                </button>
              </div>

              <div className="mt-4 overflow-hidden rounded-2xl border border-[#d9e3f5] bg-[#f7f9fd] p-2">
                <Image
                  src={ALIPAY_LIGHT_DIAGNOSIS_IMAGE}
                  alt="支付宝收款二维码"
                  width={640}
                  height={853}
                  className="mx-auto h-[290px] w-auto max-w-full object-contain md:h-[340px]"
                />
              </div>

              <div className="mt-4 rounded-2xl border border-[#dbe4f5] bg-[#fbfcff] p-3.5 md:p-4">
                <p className="text-sm leading-6 text-[#51658e]">
                  付款完成后，添加微信 <span className="font-semibold text-[#1d2f55]">{WECHAT_ID}</span>，并把支付截图和页面链接发我，我会直接在微信里跟你确认和推进。
                </p>
                <div className="mt-3 flex flex-col gap-2.5 sm:flex-row">
                  <button
                    type="button"
                    onClick={handleCopyWechat}
                    className="inline-flex flex-1 items-center justify-center rounded-2xl bg-[#223567] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#1b2b54]"
                  >
                    复制微信号
                  </button>
                  <button
                    type="button"
                    onClick={handleCloseLightDiagnosisGate}
                    className="inline-flex flex-1 items-center justify-center rounded-2xl border border-[#d4dcef] bg-white px-5 py-2.5 text-sm font-semibold text-[#3d517b] transition hover:bg-[#f8fbff]"
                  >
                    我知道了
                  </button>
                </div>
                {state.wechatCopied ? (
                  <p className="mt-3 text-sm text-[#2f7a57]">微信号已复制，付款后把截图和页面链接发我就行。</p>
                ) : null}
              </div>
            </div>
          </div>
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
