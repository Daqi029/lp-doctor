"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Image from "next/image";
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

const PROCESS_STAGES = ["首屏价值诊断完成", "方案区结构诊断完成", "价格区说服力诊断中", "信任背书诊断中", "CTA 链路诊断中"];
const PROCESS_LOGS = [
  "crawl.init -> page fetched",
  "parse.hero -> extracting H1/H2",
  "parse.structure -> grouping sections",
  "parse.pricing -> pricing signals detected",
  "parse.trust -> social proof scan",
  "score.compute -> finalize conversion risk",
];

function scoreTone(score: number): { text: string; bg: string; ring: string } {
  if (score < 60) return { text: "text-[#b42828]", bg: "bg-[#fde9e9]", ring: "ring-[#e9b1b1]" };
  if (score < 80) return { text: "text-[#9a6a07]", bg: "bg-[#fff5dd]", ring: "ring-[#edd7a6]" };
  return { text: "text-[#13663f]", bg: "bg-[#e8f7ef]", ring: "ring-[#b9e3cc]" };
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

  useEffect(() => {
    if (!state.loading) return;
    const timer = window.setInterval(() => {
      setStageIndex((prev) => (prev < PROCESS_STAGES.length - 1 ? prev + 1 : prev));
    }, 650);
    return () => window.clearInterval(timer);
  }, [state.loading]);

  const anxietyLabel = useMemo(() => {
    if (!state.result) return "";
    if (state.result.percentile < 35) return "你当前落在行业后段，首屏和 CTA 的损失正在直接吃掉本可成交的流量。";
    if (state.result.percentile < 60) return "页面有基础，但关键说服链路仍偏弱，用户在“想了解”和“愿意行动”之间被卡住。";
    return "你已高于中位线，下一步是做关键节点提效，把高意向流量吃干净。";
  }, [state.result]);
  const progress = Math.round(((stageIndex + 1) / PROCESS_STAGES.length) * 100);

  const scoreStyle = scoreTone(state.result?.score || 0);
  const percentileStyle = scoreTone(state.result?.percentile || 0);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!state.inputUrl.trim()) {
      setState((prev) => ({ ...prev, error: "请先输入有效的 Landing Page 链接" }));
      return;
    }

    setState((prev) => ({
      ...prev,
      loading: true,
      error: "",
      leadSent: false,
      quotaExceeded: false,
      result: null,
    }));
    setStageIndex(0);

    const startAt = Date.now();

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: state.inputUrl.trim() }),
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
    } catch {
      setState((prev) => ({ ...prev, loading: false, error: "网络异常，请稍后重试" }));
    }
  }

  async function handleLeadClick() {
    if (!state.result) return;

    try {
      await fetch("/api/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: state.inputUrl.trim(),
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

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#e8eefc_0%,_#f4f6fb_35%,_#f3f2ee_78%)] text-[#1a1a1a]">
      <main className="mx-auto w-full max-w-5xl px-6 py-10 md:py-14">
        <section className="rounded-3xl border border-[#d6d9e6] bg-[#f8faff]/95 p-7 shadow-[0_28px_70px_rgba(45,73,131,0.09)] md:p-10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="inline-flex rounded-full border border-[#bfc8e3] bg-[#eaf0ff] px-3 py-1 text-xs font-semibold tracking-[0.1em] text-[#445787]">
              LANDINGPAGE 增长诊断
            </p>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <a className="rounded-full border border-[#c7d1ea] px-3 py-1 text-[#3e4d73] hover:bg-[#ebf1ff]" href="https://quaily.com/overseas" target="_blank" rel="noreferrer">我的专栏</a>
              <a className="rounded-full border border-[#c7d1ea] px-3 py-1 text-[#3e4d73] hover:bg-[#ebf1ff]" href="https://mengqi.cc" target="_blank" rel="noreferrer">咨询网站</a>
              <a className="rounded-full border border-[#c7d1ea] px-3 py-1 text-[#3e4d73] hover:bg-[#ebf1ff]" href="https://x.com/daqi029" target="_blank" rel="noreferrer">@daqi029</a>
            </div>
          </div>

          <h1 className="mt-4 max-w-3xl text-3xl font-semibold leading-tight tracking-tight md:text-5xl">
            30秒找到你落地页最影响转化的3个问题
          </h1>
          <p className="mt-4 max-w-3xl text-base text-[#404f72] md:text-lg">
            输入你的 Landing Page 链接，快速获得转化诊断分数、同行位置和高优先级优化建议。
          </p>

          <form onSubmit={handleSubmit} className="mt-8 grid gap-3 md:grid-cols-[1fr_auto]">
            <input
              value={state.inputUrl}
              onChange={(e) => setState((prev) => ({ ...prev, inputUrl: e.target.value }))}
              placeholder="https://your-landing-page.com"
              className="h-13 rounded-2xl border border-[#c8d2eb] bg-white px-4 text-sm outline-none transition focus:border-[#6075a7] focus:ring-3 focus:ring-[#dce6ff]"
            />
            <button
              type="submit"
              disabled={state.loading}
              className="h-13 rounded-2xl bg-[#1f355f] px-6 text-sm font-medium text-[#edf3ff] transition hover:bg-[#162745] disabled:cursor-not-allowed disabled:opacity-65"
            >
              {state.loading ? "诊断中..." : "开始诊断"}
            </button>
          </form>

          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-[#536283]">
            <span>{state.quotaText}</span>
            <span>已被 50+ 独立开发者 / 创业者使用和验证</span>
          </div>

          {state.error ? (
            <p className="mt-4 rounded-xl border border-[#d58b8b] bg-[#fff5f5] px-4 py-3 text-sm text-[#a33b3b]">{state.error}</p>
          ) : null}
        </section>

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
          <section className="mt-8 rounded-3xl border border-[#d8a5a5] bg-[linear-gradient(130deg,#fff4f4_0%,#ffeded_42%,#f9f3f3_100%)] p-7 shadow-[0_24px_55px_rgba(134,58,58,0.12)] md:p-9">
            <p className="text-xs font-semibold tracking-[0.1em] text-[#934242]">今日免费额度已用完</p>
            <h2 className="mt-2 text-2xl font-semibold text-[#5a1f1f] md:text-3xl">你现在最需要的是人工深度诊断，不是再跑一次基础评分</h2>
            <p className="mt-3 max-w-3xl text-[15px] leading-7 text-[#6e3030]">
              你的免费诊断次数今天已经用完。现在直接加我微信，我会亲自看你的页面，给你更具体的改版建议和优先级路线图。每天仅处理 5 个页面，满额后顺延。
            </p>
            <div className="mt-5 grid gap-3 md:grid-cols-3">
              <a className="rounded-xl border border-[#d7b3b3] bg-white px-4 py-3 text-sm text-[#623232]" href="https://quaily.com/overseas" target="_blank" rel="noreferrer">专栏：quaily.com/overseas</a>
              <a className="rounded-xl border border-[#d7b3b3] bg-white px-4 py-3 text-sm text-[#623232]" href="https://mengqi.cc" target="_blank" rel="noreferrer">咨询网站：mengqi.cc</a>
              <a className="rounded-xl border border-[#d7b3b3] bg-white px-4 py-3 text-sm text-[#623232]" href="https://x.com/daqi029" target="_blank" rel="noreferrer">推特：@daqi029</a>
            </div>
            <div className="mt-5 flex flex-col gap-4 rounded-2xl border border-[#d8b2b2] bg-white/80 p-4 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-4">
                <Image src="/wechat-qr.jpg" alt="微信二维码" width={88} height={88} className="rounded-lg border border-[#dabbbb] object-cover" />
                <div>
                  <p className="text-sm font-semibold text-[#5c2c2c]">微信号：{WECHAT_ID}</p>
                  <p className="mt-1 text-xs text-[#764646]">添加时备注“LP诊断”，我会优先查看。</p>
                </div>
              </div>
              <a href="https://mengqi.cc" target="_blank" rel="noreferrer" className="rounded-xl bg-[#6d2f2f] px-5 py-3 text-sm font-medium text-[#fff2f2] transition hover:bg-[#4f2121]">
                立即联系我，申请人工深度诊断
              </a>
            </div>
          </section>
        ) : null}

        {state.result && !state.quotaExceeded ? (
          <section className="mt-8 space-y-5 rounded-3xl border border-[#d7deef] bg-white/92 p-7 shadow-[0_20px_45px_rgba(65,89,138,0.12)] md:p-10">
            <div className="grid gap-4 md:grid-cols-3">
              <div className={`rounded-2xl border border-[#e3d8c5] ${scoreStyle.bg} p-5 ring-1 ${scoreStyle.ring}`}>
                <p className="text-xs tracking-[0.08em] text-[#5f6481]">总分（100分）</p>
                <p className={`mt-2 text-4xl font-semibold ${scoreStyle.text}`}>{state.result.score}</p>
              </div>
              <div className={`rounded-2xl border border-[#e3d8c5] ${percentileStyle.bg} p-5 ring-1 ${percentileStyle.ring}`}>
                <p className="text-xs tracking-[0.08em] text-[#5f6481]">同行位置</p>
                <p className={`mt-2 text-4xl font-semibold ${percentileStyle.text}`}>{state.result.percentile}%</p>
                <p className="mt-1 text-xs text-[#5f6481]">超过 {state.result.percentile}% 同类页面</p>
              </div>
              <div className="rounded-2xl border border-[#dce1ef] bg-[#f6f8fe] p-5">
                <p className="text-xs tracking-[0.08em] text-[#5f6481]">行业识别</p>
                <p className="mt-2 text-2xl font-semibold text-[#2a3961]">{state.result.industry}</p>
                <p className="mt-1 text-xs text-[#66749b]">{state.result.source === "cache" ? "24h 缓存结果" : "实时规则诊断"}</p>
              </div>
            </div>

            <div className="rounded-2xl border border-[#e7b46f] bg-[linear-gradient(135deg,#fff6e4_0%,#ffeacd_55%,#fff9ef_100%)] p-5 shadow-[inset_0_0_0_1px_rgba(229,169,74,0.22)]">
              <p className="text-sm font-semibold text-[#8b4f05]">关键风险结论（优先处理）</p>
              <p className="mt-2 text-[15px] leading-7 text-[#56340f]">{state.result.summary}</p>
              <p className="mt-2 text-sm font-medium text-[#7a4708]">{anxietyLabel}</p>
            </div>

            <div className="space-y-3">
              <h2 className="text-xl font-semibold text-[#24365d]">3 条高优先级优化建议</h2>
              {state.result.suggestions.map((item, index) => (
                <article key={item.title} className="rounded-2xl border border-[#e1e6f3] bg-[#fcfdff] p-5">
                  <p className="text-xs tracking-[0.08em] text-[#60719a]">建议 {index + 1}</p>
                  <h3 className="mt-1 text-lg font-semibold text-[#1d2f54]">{item.title}</h3>
                  <p className="mt-2 rounded-lg bg-[#edf2ff] px-3 py-2 text-xs leading-5 text-[#445b8d]">证据：{item.evidence}</p>
                  <p className="mt-2 text-sm leading-6 text-[#374665]">问题：{item.issue}</p>
                  <p className="mt-1 text-sm leading-6 text-[#374665]">影响：{item.impact}</p>
                  <p className="mt-1 text-sm leading-6 text-[#2f3f62]">优先动作：{item.action}</p>
                </article>
              ))}
            </div>

            <div className="rounded-3xl border border-[#4f6097] bg-[linear-gradient(145deg,#1d2c56_0%,#26396f_58%,#192447_100%)] p-6 text-[#e7eeff] shadow-[0_24px_60px_rgba(23,36,78,0.36)] md:p-8">
              <p className="text-xs font-semibold tracking-[0.1em] text-[#b9c8f5]">人工深度诊断名额</p>
              <h2 className="mt-2 text-2xl font-semibold leading-tight text-white md:text-3xl">
                我会亲自看你的页面，并给你更具体的改版建议
              </h2>
              <p className="mt-3 max-w-3xl text-[15px] leading-7 text-[#d8e2ff]">
                自动结果只能定位方向。人工诊断会直接告诉你“哪一段文案要改、CTA 怎么重写、结构顺序怎么调”，并给你可执行的优先级方案。
              </p>
              <p className="mt-2 text-sm font-semibold text-[#d1ddff]">裴梦琪（Mengqi Pei）｜独立产品增长设计师</p>
              <p className="text-sm text-[#b8c8f4]">每天仅人工深度查看 5 个页面，满额后顺延至明天。</p>

              <div className="mt-5">
                <p className="text-xs font-semibold tracking-[0.1em] text-[#aebeea]">客户反馈</p>
                <div className="mt-3 grid gap-4 md:grid-cols-3">
                  <blockquote className="rounded-2xl border border-[#4e5d8e] bg-[#213261]/70 p-4 text-sm text-[#d5e0ff]">
                    “我们调整首屏文案后，注册转化明显提升。”
                  </blockquote>
                  <blockquote className="rounded-2xl border border-[#4e5d8e] bg-[#213261]/70 p-4 text-sm text-[#d5e0ff]">
                    “第一次有人这么直接指出我们页面真正的问题。”
                  </blockquote>
                  <blockquote className="rounded-2xl border border-[#4e5d8e] bg-[#213261]/70 p-4 text-sm text-[#d5e0ff]">
                    “改了 CTA 和信任区后，咨询转化明显变好。”
                  </blockquote>
                </div>
              </div>

              <div className="mt-6 flex flex-col gap-4 rounded-2xl border border-[#5567a1] bg-[#253666]/65 p-4 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-4">
                  <Image src="/wechat-qr.jpg" alt="微信二维码" width={88} height={88} className="rounded-lg border border-[#6173ad] object-cover" />
                  <div>
                    <p className="text-sm font-semibold text-white">微信号：{WECHAT_ID}</p>
                    <p className="mt-1 text-xs text-[#c6d5fb]">点击按钮会自动复制微信号，并记录你的诊断结果给我做跟进。</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleLeadClick}
                  className="rounded-xl bg-[#f2f6ff] px-5 py-3 text-sm font-medium text-[#1d2f54] transition hover:bg-white"
                >
                  添加微信，申请今日深度诊断名额
                </button>
              </div>
              {state.leadSent ? (
                <p className="mt-3 text-sm text-[#d4defa]">已记录你的诊断请求，微信号已复制。添加后请备注“LP诊断”。</p>
              ) : null}
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}
