"use client";

import { useEffect, useMemo, useState } from "react";

type SubmissionRow = {
  createdAt: string;
  userKey: string;
  deviceType: "mobile" | "desktop" | "tablet" | "unknown";
  url: string;
  score: number | null;
  industry: string | null;
  downloadedReport: boolean;
  articleClicks: number;
  caseClicks: number;
  copiedWechat: boolean;
};

type SummaryPayload = {
  date: string;
  storageMode: "supabase" | "local";
  overview: {
    visitors: number;
    submitUrl: number;
    resultGenerated: number;
    downloadReport: number;
    articleClick: number;
    caseClick: number;
    copyWechat: number;
    quotaExceeded: number;
  };
  deviceMetrics: {
    mobile: DeviceMetrics;
    desktop: DeviceMetrics;
    tablet: DeviceMetrics;
  };
  funnel: {
    label: string;
    count: number;
    rateFromPrev: number | null;
  }[];
  analyzeUsers: number;
  submissions: SubmissionRow[];
};

type DeviceMetrics = {
  visitors: number;
  visitShare: number;
  submitUrl: number;
  submitRate: number | null;
  resultGenerated: number;
  downloadReport: number;
  downloadRate: number | null;
  copyWechat: number;
  copyRate: number | null;
};

const tabs = [
  { id: "data", label: "数据" },
  { id: "device", label: "设备表现" },
  { id: "funnel", label: "图形漏斗" },
] as const;

const ALL_SCOPE = "all";
const INTERNAL_DOMAINS = ["mengqi.cc", "lp.mengqi.cc"];
const REFERENCE_BRAND_DOMAINS = ["apple.com", "google.com", "notion.so", "figma.com", "openai.com", "stripe.com"];

function getHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function matchesDomain(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

function isSpecialSample(url: string): boolean {
  const hostname = getHostname(url);
  return (
    INTERNAL_DOMAINS.some((domain) => matchesDomain(hostname, domain)) ||
    REFERENCE_BRAND_DOMAINS.some((domain) => matchesDomain(hostname, domain))
  );
}

function getLeadIntent(row: SubmissionRow): {
  label: "特殊样本" | "高意向" | "值得跟进" | "普通";
  tone: string;
  rowTone: string;
  muted?: boolean;
} {
  if (isSpecialSample(row.url)) {
    return {
      label: "特殊样本",
      tone: "border-[#d7d9e0] bg-[#f3f4f7] text-[#737885]",
      rowTone: "bg-[#f7f8fa] text-[#8a90a0]",
      muted: true,
    };
  }

  if (row.copiedWechat) {
    return {
      label: "高意向",
      tone: "border-[#b7d8c2] bg-[#ecfaf1] text-[#1b6a3f]",
      rowTone: "bg-[#f3fcf6]",
    };
  }

  if (row.downloadedReport || (row.score !== null && row.score < 60)) {
    return {
      label: "值得跟进",
      tone: "border-[#f0d4a2] bg-[#fff7e8] text-[#9a6408]",
      rowTone: "bg-[#fffbf1]",
    };
  }

  return {
    label: "普通",
    tone: "border-[#d8e0f2] bg-[#f5f8ff] text-[#5b6f99]",
    rowTone: "",
  };
}

function formatScopeLabel(date: string): string {
  return date === ALL_SCOPE ? "全部历史数据" : date;
}

function deviceLabel(device: "mobile" | "desktop" | "tablet"): string {
  if (device === "mobile") return "移动端";
  if (device === "desktop") return "桌面端";
  return "平板";
}

export default function DashboardPage() {
  const todayString = new Date().toISOString().slice(0, 10);
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]["id"]>("data");
  const [data, setData] = useState<SummaryPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [scope, setScope] = useState<string>(ALL_SCOPE);
  const [dateInput, setDateInput] = useState("");

  useEffect(() => {
    async function load(targetScope: string) {
      setLoading(true);
      setError("");
      try {
        const url = targetScope === ALL_SCOPE ? "/api/daily-summary?date=all" : `/api/daily-summary?date=${targetScope}`;
        const response = await fetch(url);
        const payload = (await response.json()) as { ok: boolean; data?: SummaryPayload; message?: string };
        if (!response.ok || !payload.ok || !payload.data) {
          setError(payload.message || "加载看板失败");
          return;
        }
        setData(payload.data);
      } catch {
        setError("加载看板失败");
      } finally {
        setLoading(false);
      }
    }

    void load(scope);
  }, [scope]);

  const maxFunnelCount = useMemo(() => Math.max(...(data?.funnel.map((item) => item.count) || [1])), [data]);
  const metricLabelPrefix = data?.date === ALL_SCOPE ? "累计" : "当日";
  const highIntentCount = useMemo(
    () => data?.submissions.filter((row) => !isSpecialSample(row.url) && row.copiedWechat).length ?? 0,
    [data],
  );
  const followUpCount = useMemo(
    () =>
      data?.submissions.filter(
        (row) => !isSpecialSample(row.url) && (row.copiedWechat || row.downloadedReport || (row.score !== null && row.score < 60)),
      ).length ?? 0,
    [data],
  );

  function handleToday() {
    setDateInput(todayString);
    setScope(todayString);
  }

  function handleAllHistory() {
    setDateInput("");
    setScope(ALL_SCOPE);
  }

  function handleApplyDate() {
    if (!dateInput) return;
    setScope(dateInput);
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#e8eefc_0%,_#f4f6fb_35%,_#f3f2ee_78%)] px-6 py-10 text-[#1a1a1a]">
      <div className="mx-auto max-w-6xl">
        <section className="rounded-3xl border border-[#d6d9e6] bg-[#f8faff]/95 p-7 shadow-[0_28px_70px_rgba(45,73,131,0.09)] md:p-10">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold tracking-[0.1em] text-[#506187]">内部数据看板</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#1d2f56]">Landing Page 增长诊断 Dashboard</h1>
              <p className="mt-2 text-sm text-[#5b6f99]">
                {data ? `统计范围：${formatScopeLabel(data.date)}` : "加载历史数据中..."}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-3">
              <div className="flex items-center gap-2 rounded-2xl border border-[#d7dff0] bg-white px-3 py-2">
                <button
                  type="button"
                  onClick={handleAllHistory}
                  className={`rounded-xl px-3 py-2 text-sm font-medium transition ${
                    scope === ALL_SCOPE ? "bg-[#1f355f] text-white" : "text-[#506187] hover:bg-[#eef3ff]"
                  }`}
                >
                  全部历史
                </button>
                <button
                    type="button"
                    onClick={handleToday}
                    className={`rounded-xl px-3 py-2 text-sm font-medium transition ${
                    scope !== ALL_SCOPE && scope === todayString
                      ? "bg-[#1f355f] text-white"
                      : "text-[#506187] hover:bg-[#eef3ff]"
                  }`}
                >
                  今天
                </button>
                <input
                  type="date"
                  value={dateInput}
                  onChange={(event) => setDateInput(event.target.value)}
                  className="rounded-xl border border-[#d7dff0] px-3 py-2 text-sm text-[#2b3856] outline-none"
                />
                <button
                  type="button"
                  onClick={handleApplyDate}
                  className="rounded-xl bg-[#eef3ff] px-3 py-2 text-sm font-medium text-[#1f355f] transition hover:bg-[#dde8ff]"
                >
                  查看日期
                </button>
              </div>
              <div className="inline-flex rounded-2xl border border-[#d7dff0] bg-white p-1">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                      activeTab === tab.id ? "bg-[#1f355f] text-white" : "text-[#506187] hover:bg-[#eef3ff]"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {loading ? <p className="mt-8 text-sm text-[#5b6f99]">正在加载数据...</p> : null}
          {error ? <p className="mt-8 rounded-xl border border-[#d58b8b] bg-[#fff5f5] px-4 py-3 text-sm text-[#a33b3b]">{error}</p> : null}

          {!loading && data && activeTab === "data" ? (
            <div className="mt-8 space-y-8">
              <div className={`rounded-2xl border px-4 py-3 text-sm ${
                data.storageMode === "supabase"
                  ? "border-[#b9dfc6] bg-[#edf9f1] text-[#1b6a3f]"
                  : "border-[#f0c2a8] bg-[#fff5ee] text-[#9b4a20]"
              }`}>
                当前存储模式：<span className="font-semibold">{data.storageMode}</span>
                {data.storageMode === "supabase"
                  ? "。线上事件、线索和看板数据会持久保存。"
                  : "。当前不是持久化数据库，实例刷新后数据可能丢失。"}
              </div>
              <div className="grid gap-4 md:grid-cols-4 xl:grid-cols-7">
                <MetricCard label={`${metricLabelPrefix}访问`} value={data.overview.visitors} />
                <MetricCard label="提交 URL" value={data.overview.submitUrl} />
                <MetricCard label="生成结果" value={data.overview.resultGenerated} />
                <MetricCard label="下载报告" value={data.overview.downloadReport} />
                <MetricCard label="点击文章" value={data.overview.articleClick} />
                <MetricCard label="点击案例" value={data.overview.caseClick} />
                <MetricCard label="复制微信" value={data.overview.copyWechat} />
                <MetricCard label="额度用完" value={data.overview.quotaExceeded} />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-[#b7d8c2] bg-[#ecfaf1] p-4">
                  <p className="text-xs font-semibold tracking-[0.08em] text-[#1b6a3f]">高意向线索</p>
                  <p className="mt-2 text-3xl font-semibold text-[#154d2c]">{highIntentCount}</p>
                  <p className="mt-2 text-sm text-[#2f6e46]">已复制微信，最值得你优先跟进。</p>
                </div>
                <div className="rounded-2xl border border-[#f0d4a2] bg-[#fff7e8] p-4">
                  <p className="text-xs font-semibold tracking-[0.08em] text-[#9a6408]">值得跟进</p>
                  <p className="mt-2 text-3xl font-semibold text-[#8a5a06]">{followUpCount}</p>
                  <p className="mt-2 text-sm text-[#8a691e]">已下载报告，或分数低于 60，说明痛感已经出现。</p>
                </div>
              </div>

              <div className="rounded-2xl border border-[#d7dff0] bg-white p-5">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold text-[#1d4684]">{data.date === ALL_SCOPE ? "历史线索列表" : "当日线索列表"}</h2>
                  <p className="text-xs text-[#6b7a9d]">共 {data.submissions.length} 条提交</p>
                </div>
                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="text-[#5b6f99]">
                      <tr className="border-b border-[#e5eaf6]">
                        <th className="px-3 py-3 font-medium">时间</th>
                        <th className="px-3 py-3 font-medium">URL</th>
                        <th className="px-3 py-3 font-medium">设备</th>
                        <th className="px-3 py-3 font-medium">分数</th>
                        <th className="px-3 py-3 font-medium">行业</th>
                        <th className="px-3 py-3 font-medium">线索等级</th>
                        <th className="px-3 py-3 font-medium">诊断报告</th>
                        <th className="px-3 py-3 font-medium">下载报告</th>
                        <th className="px-3 py-3 font-medium">点击案例</th>
                        <th className="px-3 py-3 font-medium">点击文章</th>
                        <th className="px-3 py-3 font-medium">复制微信</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.submissions.map((row) => {
                        const intent = getLeadIntent(row);
                        return (
                        <tr
                          key={`${row.createdAt}-${row.url}`}
                          className={`border-b border-[#eef2fb] align-top text-[#2b3856] ${intent.rowTone} ${intent.muted ? "opacity-60" : ""}`}
                        >
                          <td className="px-3 py-3 whitespace-nowrap">{new Date(row.createdAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</td>
                          <td className="max-w-[360px] px-3 py-3">
                            <div className="truncate" title={row.url}>{row.url}</div>
                          </td>
                          <td className="px-3 py-3">{row.deviceType === "mobile" ? "移动端" : row.deviceType === "desktop" ? "桌面端" : row.deviceType === "tablet" ? "平板" : "-"}</td>
                          <td className="px-3 py-3">{row.score ?? "-"}</td>
                          <td className="px-3 py-3">{row.industry ?? "-"}</td>
                          <td className="px-3 py-3">
                            <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${intent.tone}`}>
                              {intent.label}
                            </span>
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap">
                            {intent.muted ? (
                              <span className="text-xs text-[#8b98b5]">跳过</span>
                            ) : row.score !== null ? (
                              <a
                                href={`/api/dashboard-report?userKey=${encodeURIComponent(row.userKey)}&url=${encodeURIComponent(row.url)}`}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex rounded-lg border border-[#cbd7f0] bg-[#f6f9ff] px-3 py-1.5 text-xs font-medium text-[#244783] transition hover:bg-[#eaf1ff]"
                              >
                                查看报告
                              </a>
                            ) : (
                              <span className="text-xs text-[#8b98b5]">暂无</span>
                            )}
                          </td>
                          <td className="px-3 py-3">{row.downloadedReport ? "是" : "否"}</td>
                          <td className="px-3 py-3">{row.caseClicks > 0 ? row.caseClicks : "-"}</td>
                          <td className="px-3 py-3">{row.articleClicks > 0 ? row.articleClicks : "-"}</td>
                          <td className="px-3 py-3">{row.copiedWechat ? "是" : "否"}</td>
                        </tr>
                      )})}
                    </tbody>
                  </table>
                  {data.submissions.length === 0 ? (
                    <p className="px-3 py-6 text-sm text-[#6b7a9d]">{data.date === ALL_SCOPE ? "还没有历史提交数据。" : "这个日期还没有提交数据。"}</p>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          {!loading && data && activeTab === "device" ? (
            <div className="mt-8 rounded-2xl border border-[#d7dff0] bg-white p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-[#1d4684]">设备表现</h2>
                  <p className="mt-1 text-sm text-[#5b6f99]">看移动端占比，以及移动端和桌面端在提交、下载、复制微信上的差异。</p>
                </div>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                {(["mobile", "desktop", "tablet"] as const).map((device) => {
                  const metric = data.deviceMetrics[device];
                  return (
                    <div key={device} className="rounded-2xl border border-[#e1e7f5] bg-[#fbfcff] p-4">
                      <p className="text-xs font-semibold tracking-[0.08em] text-[#60729a]">{deviceLabel(device)}</p>
                      <p className="mt-2 text-2xl font-semibold text-[#1d2f56]">{metric.visitors}</p>
                      <p className="mt-1 text-sm text-[#5b6f99]">访问占比 {metric.visitShare}%</p>
                      <div className="mt-4 space-y-2 text-sm text-[#394765]">
                        <div className="flex items-center justify-between gap-3">
                          <span>提交率</span>
                          <span className="font-semibold text-[#1d2f56]">{metric.submitRate ?? "-"}%</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span>下载率</span>
                          <span className="font-semibold text-[#1d2f56]">{metric.downloadRate ?? "-"}%</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span>复制微信率</span>
                          <span className="font-semibold text-[#1d2f56]">{metric.copyRate ?? "-"}%</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {!loading && data && activeTab === "funnel" ? (
            <div className="mt-8 grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="rounded-2xl border border-[#d7dff0] bg-white p-5">
                <h2 className="text-lg font-semibold text-[#1d4684]">图形漏斗</h2>
                <div className="mt-5 space-y-4">
                  {data.funnel.map((item) => (
                    <div key={item.label}>
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <p className="text-sm font-medium text-[#2b3856]">{item.label}</p>
                        <p className="text-sm text-[#5b6f99]">
                          {item.count}
                          {item.rateFromPrev !== null ? ` · ${item.rateFromPrev}%` : ""}
                        </p>
                      </div>
                      <div className="h-4 overflow-hidden rounded-full bg-[#edf2ff]">
                        <div
                          className="h-full rounded-full bg-[linear-gradient(90deg,#1f6a3b_0%,#56ba77_100%)]"
                          style={{ width: `${Math.max(10, Math.round((item.count / maxFunnelCount) * 100))}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-[#d7dff0] bg-white p-5">
                <h2 className="text-lg font-semibold text-[#1d4684]">漏斗诊断</h2>
                <div className="mt-5 space-y-3">
                  {data.funnel.slice(1).map((item, index) => {
                    const prev = data.funnel[index];
                    const weak = item.rateFromPrev !== null && item.rateFromPrev < 40;
                    return (
                      <div key={item.label} className={`rounded-xl border px-4 py-3 ${weak ? "border-[#f0b2b2] bg-[#fff5f5]" : "border-[#dfe6f6] bg-[#f8fbff]"}`}>
                        <p className={`text-sm font-semibold ${weak ? "text-[#b42828]" : "text-[#2c446e]"}`}>
                          {prev.label} {"->"} {item.label}
                        </p>
                        <p className="mt-1 text-sm text-[#5b6f99]">
                          当前转化率 {item.rateFromPrev ?? 0}%。
                          {weak ? " 这一层明显偏细，优先检查结果说服力和 CTA 引导。" : " 这一层暂时没有明显异常。"}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-[#d7dff0] bg-white p-4">
      <p className="text-xs font-semibold tracking-[0.08em] text-[#60729a]">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-[#1d2f56]">{value}</p>
    </div>
  );
}
