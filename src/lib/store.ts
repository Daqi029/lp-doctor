import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { AnalyzeResult, LeadPayload } from "./types";
import { assertPersistentStorageConfigured, getStorageMode, getSupabaseAdmin, hasSupabaseConfig } from "./supabase";

function resolveDataDir(): string {
  if (process.env.DATA_DIR) return process.env.DATA_DIR;
  if (process.env.NODE_ENV === "production") return path.join("/tmp", "lp-doctor-data");
  return path.join(process.cwd(), "data");
}

const DATA_DIR = resolveDataDir();
const STORE_FILE = path.join(DATA_DIR, "store.json");
const QUOTA_LIMIT = 2;

type CachedEntry = {
  url: string;
  result: AnalyzeResult;
  createdAt: string;
};

type DailyCounter = {
  date: string;
  used: number;
};

type UserState = {
  counter: DailyCounter;
  cache: Record<string, CachedEntry>;
};

type LeadEntry = LeadPayload & {
  id: string;
  userKey: string;
  createdAt: string;
};

export type EventType =
  | "page_view"
  | "submit_url"
  | "result_generated"
  | "download_report"
  | "open_download_gate"
  | "submit_download_gate"
  | "close_download_gate"
  | "click_article"
  | "click_case"
  | "click_quick_call"
  | "click_light_diagnosis"
  | "open_light_diagnosis_payment"
  | "copy_wechat_after_payment"
  | "close_light_diagnosis_payment"
  | "copy_wechat"
  | "quota_exceeded";

export type DeviceType = "mobile" | "desktop" | "tablet" | "unknown";

type EventEntry = {
  id: string;
  type: EventType;
  userKey: string;
  createdAt: string;
  deviceType?: DeviceType;
  url?: string;
  score?: number;
  percentile?: number;
  industry?: string;
  articleSlug?: string;
  articleLabel?: string;
  articlePosition?: number;
};

type SupabaseEventRow = {
  id: string;
  type: string;
  user_key: string;
  created_at: string;
  device_type: DeviceType | null;
  url: string | null;
  score: number | null;
  percentile: number | null;
  industry: string | null;
  article_slug: string | null;
  article_label: string | null;
  article_position: number | null;
};

type SupabaseLeadRow = {
  id: string;
  user_key: string;
  created_at: string;
  url: string;
  score: number;
  percentile: number;
  industry: string;
  summary: string;
};

type StoreShape = {
  users: Record<string, UserState>;
  leads: LeadEntry[];
  events: EventEntry[];
};

const DEFAULT_STORE: StoreShape = { users: {}, leads: [], events: [] };

function normalizeStoreShape(input: unknown): StoreShape {
  if (!input || typeof input !== "object") {
    return { users: {}, leads: [], events: [] };
  }

  const candidate = input as Partial<StoreShape>;
  const rawUsers = candidate.users && typeof candidate.users === "object" ? candidate.users : {};
  const users = Object.fromEntries(
    Object.entries(rawUsers).map(([key, value]) => {
      const entry = value as Partial<UserState> | undefined;
      return [
        key,
        {
          counter:
            entry?.counter && typeof entry.counter.date === "string" && typeof entry.counter.used === "number"
              ? entry.counter
              : { date: getToday(), used: 0 },
          cache: entry?.cache && typeof entry.cache === "object" ? entry.cache : {},
        } satisfies UserState,
      ];
    }),
  );

  return {
    users,
    leads: Array.isArray(candidate.leads) ? candidate.leads : [],
    events: Array.isArray(candidate.events) ? candidate.events : [],
  };
}

type DailySummary = {
  date: string;
  storageMode: "supabase" | "local";
  overview: {
    visitors: number;
    effectiveSubmissionCount: number;
    submitUrl: number;
    resultGenerated: number;
    downloadReport: number;
    downloadGateOpen: number;
    downloadGateSubmit: number;
    articleClick: number;
    caseClick: number;
    quickCallClick: number;
    lightDiagnosisClick: number;
    lightDiagnosisPaymentOpen: number;
    postPaymentWechatCopy: number;
    copyWechat: number;
    quotaExceeded: number;
  };
  deviceMetrics: {
    mobile: DevicePerformance;
    desktop: DevicePerformance;
    tablet: DevicePerformance;
  };
  funnel: {
    label: string;
    count: number;
    rateFromPrev: number | null;
  }[];
  analyzeUsers: number;
  submissions: {
    createdAt: string;
    userKey: string;
    deviceType: DeviceType;
    url: string;
    score: number | null;
    industry: string | null;
    downloadedReport: boolean;
    downloadGateOpened: boolean;
    downloadGateSubmitted: boolean;
    articleClicks: number;
    caseClicks: number;
    quickCallClicks: number;
    lightDiagnosisClicks: number;
    lightDiagnosisPaymentOpened: boolean;
    copiedWechat: boolean;
  }[];
  leads: LeadEntry[];
};

const INTERNAL_DOMAINS = ["mengqi.cc", "lp.mengqi.cc"];
const REFERENCE_BRAND_DOMAINS = ["apple.com", "google.com", "notion.so", "figma.com", "openai.com", "stripe.com"];

type DevicePerformance = {
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

type SummaryQuery = {
  date?: string;
  from?: string;
  to?: string;
};

type EventPayload = {
  type: EventType;
  deviceType?: DeviceType;
  url?: string;
  score?: number;
  percentile?: number;
  industry?: string;
  articleSlug?: string;
  articleLabel?: string;
  articlePosition?: number;
};

function isMissingArticleEventColumnError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const message = "message" in error && typeof error.message === "string" ? error.message : "";
  return (
    message.includes("article_slug") ||
    message.includes("article_label") ||
    message.includes("article_position")
  );
}

function isMissingDeviceTypeColumnError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const message = "message" in error && typeof error.message === "string" ? error.message : "";
  return message.includes("device_type");
}

function isAllDateScope(date?: string): boolean {
  return date === "all";
}

function isValidDateString(value?: string): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function normalizeSummaryQuery(input?: string | SummaryQuery): SummaryQuery {
  if (!input) return {};
  if (typeof input === "string") return { date: input };
  return input;
}

function formatRangeLabel(from: string, to: string): string {
  return from === to ? from : `${from} 至 ${to}`;
}

function getHostname(url?: string): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function matchesDomain(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

function isEffectiveSubmissionUrl(url?: string): boolean {
  const hostname = getHostname(url);
  if (!hostname) return false;
  return !INTERNAL_DOMAINS.some((domain) => matchesDomain(hostname, domain)) &&
    !REFERENCE_BRAND_DOMAINS.some((domain) => matchesDomain(hostname, domain));
}

function resolveSummaryScope(queryInput?: string | SummaryQuery): {
  mode: "all" | "day" | "range";
  label: string;
  from?: string;
  to?: string;
} {
  const query = normalizeSummaryQuery(queryInput);

  if (isAllDateScope(query.date)) {
    return { mode: "all", label: "all" };
  }

  if (isValidDateString(query.from) && isValidDateString(query.to)) {
    const from = query.from <= query.to ? query.from : query.to;
    const to = query.from <= query.to ? query.to : query.from;
    if (from === to) {
      return { mode: "day", label: from, from, to };
    }
    return { mode: "range", label: formatRangeLabel(from, to), from, to };
  }

  const target = isValidDateString(query.date) ? query.date : getToday();
  return { mode: "day", label: target, from: target, to: target };
}

function hashText(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex").slice(0, 16);
}

export function makeUserKey(ip: string, userAgent: string, anonId: string): string {
  return hashText(`${ip}|${userAgent}|${anonId}`);
}

export function normalizeUrl(input: string): string {
  const raw = input.trim();
  if (!raw) throw new Error("empty url");
  const hasProtocol = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(raw);
  const normalizedInput = raw.startsWith("//") ? `https:${raw}` : hasProtocol ? raw : `https://${raw}`;
  const url = new URL(normalizedInput);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("invalid protocol");
  }
  return `${url.origin}${url.pathname}`.replace(/\/$/, "");
}

function getToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function dayRange(date: string): { start: string; end: string } {
  const start = `${date}T00:00:00.000Z`;
  const day = new Date(start);
  day.setUTCDate(day.getUTCDate() + 1);
  return { start, end: day.toISOString() };
}

function isoWithinDateRange(iso: string, from: string, to: string): boolean {
  const day = iso.slice(0, 10);
  return day >= from && day <= to;
}

async function ensureStore(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(STORE_FILE);
  } catch {
    await fs.writeFile(STORE_FILE, JSON.stringify(DEFAULT_STORE, null, 2), "utf8");
  }
}

async function readLocalStore(): Promise<StoreShape> {
  await ensureStore();
  const raw = await fs.readFile(STORE_FILE, "utf8");
  try {
    const parsed = JSON.parse(raw);
    const store = normalizeStoreShape(parsed);
    if (JSON.stringify(store) !== JSON.stringify(parsed)) {
      await writeLocalStore(store);
    }
    return store;
  } catch {
    await writeLocalStore(DEFAULT_STORE);
    return { users: {}, leads: [], events: [] };
  }
}

async function writeLocalStore(data: StoreShape): Promise<void> {
  await fs.writeFile(STORE_FILE, JSON.stringify(data, null, 2), "utf8");
}

function getLocalUserState(store: StoreShape, userKey: string): UserState {
  if (!store.users[userKey]) {
    store.users[userKey] = {
      counter: { date: getToday(), used: 0 },
      cache: {},
    };
  }

  const user = store.users[userKey];
  if (user.counter.date !== getToday()) {
    user.counter = { date: getToday(), used: 0 };
  }

  return user;
}

async function getQuotaLocal(userKey: string) {
  const store = await readLocalStore();
  const user = getLocalUserState(store, userKey);
  return { used: user.counter.used, limit: QUOTA_LIMIT, remaining: Math.max(0, QUOTA_LIMIT - user.counter.used) };
}

async function getCachedResultLocal(userKey: string, url: string): Promise<AnalyzeResult | null> {
  const store = await readLocalStore();
  const user = getLocalUserState(store, userKey);
  const cached = user.cache[url];
  if (!cached) return null;

  const ageMs = Date.now() - new Date(cached.createdAt).getTime();
  if (ageMs > 24 * 60 * 60 * 1000) return null;
  return { ...cached.result, source: "cache" };
}

async function saveAnalyzeResultLocal(userKey: string, url: string, result: AnalyzeResult): Promise<void> {
  const store = await readLocalStore();
  const user = getLocalUserState(store, userKey);
  user.counter.used += 1;
  user.cache[url] = { url, result, createdAt: new Date().toISOString() };
  await writeLocalStore(store);
}

async function createLeadLocal(userKey: string, payload: LeadPayload): Promise<LeadEntry> {
  const store = await readLocalStore();
  const entry: LeadEntry = {
    ...payload,
    id: crypto.randomUUID(),
    userKey,
    createdAt: new Date().toISOString(),
  };
  store.leads.unshift(entry);
  store.leads = store.leads.slice(0, 1000);
  await writeLocalStore(store);
  return entry;
}

async function recordEventLocal(
  userKey: string,
  payload: EventPayload,
): Promise<void> {
  const store = await readLocalStore();
  store.events.unshift({
    id: crypto.randomUUID(),
    userKey,
    createdAt: new Date().toISOString(),
    ...payload,
  });
  store.events = store.events.slice(0, 5000);
  await writeLocalStore(store);
}

function buildDailySummary(date: string, events: EventEntry[], leads: LeadEntry[], analyzeUsers: number): DailySummary {
  const pageViews = events.filter((item) => item.type === "page_view");
  const submitUrl = events.filter((item) => item.type === "submit_url");
  const resultGenerated = events.filter((item) => item.type === "result_generated");
  const downloadReport = events.filter((item) => item.type === "download_report");
  const downloadGateOpen = events.filter((item) => item.type === "open_download_gate");
  const downloadGateSubmit = events.filter((item) => item.type === "submit_download_gate");
  const articleClick = events.filter((item) => item.type === "click_article");
  const caseClick = events.filter((item) => item.type === "click_case");
  const quickCallClick = events.filter((item) => item.type === "click_quick_call");
  const lightDiagnosisClick = events.filter((item) => item.type === "click_light_diagnosis");
  const lightDiagnosisPaymentOpen = events.filter((item) => item.type === "open_light_diagnosis_payment");
  const postPaymentWechatCopy = events.filter((item) => item.type === "copy_wechat_after_payment");
  const copyWechat = events.filter((item) => item.type === "copy_wechat" || item.type === "copy_wechat_after_payment");
  const quotaExceeded = events.filter((item) => item.type === "quota_exceeded");
  const effectiveSubmissionCount = submitUrl.filter((item) => isEffectiveSubmissionUrl(item.url)).length;

  const grouped = new Map<
    string,
    {
      createdAt: string;
      userKey: string;
      deviceType: DeviceType;
      url: string;
      score: number | null;
      industry: string | null;
      downloadedReport: boolean;
      downloadGateOpened: boolean;
      downloadGateSubmitted: boolean;
      articleClicks: number;
      caseClicks: number;
      quickCallClicks: number;
      lightDiagnosisClicks: number;
      lightDiagnosisPaymentOpened: boolean;
      copiedWechat: boolean;
    }
  >();

  for (const entry of submitUrl) {
    const key = `${entry.userKey}:${entry.url || "unknown"}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        createdAt: entry.createdAt,
        userKey: entry.userKey,
        deviceType: entry.deviceType || "unknown",
        url: entry.url || "-",
        score: null,
        industry: null,
        downloadedReport: false,
        downloadGateOpened: false,
        downloadGateSubmitted: false,
        articleClicks: 0,
        caseClicks: 0,
        quickCallClicks: 0,
        lightDiagnosisClicks: 0,
        lightDiagnosisPaymentOpened: false,
        copiedWechat: false,
      });
    }
  }

  for (const entry of resultGenerated) {
    const key = `${entry.userKey}:${entry.url || "unknown"}`;
    const current = grouped.get(key);
    if (current) {
      current.score = typeof entry.score === "number" ? entry.score : current.score;
      current.industry = entry.industry || current.industry;
    }
  }

  for (const entry of downloadReport) {
    const current = grouped.get(`${entry.userKey}:${entry.url || "unknown"}`);
    if (current) current.downloadedReport = true;
  }

  for (const entry of downloadGateOpen) {
    const current = grouped.get(`${entry.userKey}:${entry.url || "unknown"}`);
    if (current) current.downloadGateOpened = true;
  }

  for (const entry of downloadGateSubmit) {
    const current = grouped.get(`${entry.userKey}:${entry.url || "unknown"}`);
    if (current) current.downloadGateSubmitted = true;
  }

  for (const entry of articleClick) {
    const current = grouped.get(`${entry.userKey}:${entry.url || "unknown"}`);
    if (current) current.articleClicks += 1;
  }

  for (const entry of caseClick) {
    const current = grouped.get(`${entry.userKey}:${entry.url || "unknown"}`);
    if (current) current.caseClicks += 1;
  }

  for (const entry of quickCallClick) {
    const current = grouped.get(`${entry.userKey}:${entry.url || "unknown"}`);
    if (current) current.quickCallClicks += 1;
  }

  for (const entry of lightDiagnosisClick) {
    const current = grouped.get(`${entry.userKey}:${entry.url || "unknown"}`);
    if (current) current.lightDiagnosisClicks += 1;
  }

  for (const entry of lightDiagnosisPaymentOpen) {
    const current = grouped.get(`${entry.userKey}:${entry.url || "unknown"}`);
    if (current) current.lightDiagnosisPaymentOpened = true;
  }

  for (const entry of copyWechat) {
    const current = grouped.get(`${entry.userKey}:${entry.url || "unknown"}`);
    if (current) current.copiedWechat = true;
  }

  const allVisitorKeys = new Set(pageViews.map((item) => item.userKey));
  const totalVisitors = allVisitorKeys.size;
  const buildDevicePerformance = (device: DeviceType): DevicePerformance => {
    const devicePageViews = pageViews.filter((item) => item.deviceType === device);
    const deviceVisitors = new Set(devicePageViews.map((item) => item.userKey)).size;
    const deviceSubmit = submitUrl.filter((item) => item.deviceType === device).length;
    const deviceResult = resultGenerated.filter((item) => item.deviceType === device).length;
    const deviceDownload = downloadReport.filter((item) => item.deviceType === device).length;
    const deviceCopy = copyWechat.filter((item) => item.deviceType === device).length;

    return {
      visitors: deviceVisitors,
      visitShare: totalVisitors === 0 ? 0 : Math.round((deviceVisitors / totalVisitors) * 100),
      submitUrl: deviceSubmit,
      submitRate: deviceVisitors === 0 ? null : Math.round((deviceSubmit / deviceVisitors) * 100),
      resultGenerated: deviceResult,
      downloadReport: deviceDownload,
      downloadRate: deviceResult === 0 ? null : Math.round((deviceDownload / deviceResult) * 100),
      copyWechat: deviceCopy,
      copyRate: deviceResult === 0 ? null : Math.round((deviceCopy / deviceResult) * 100),
    };
  };

  const funnelCounts = [
    { label: "访问", count: totalVisitors },
    { label: "提交 URL", count: submitUrl.length },
    { label: "生成结果", count: resultGenerated.length },
    { label: "预约 Quick Call", count: quickCallClick.length },
    { label: "打开轻诊断支付", count: lightDiagnosisPaymentOpen.length },
    { label: "支付后复制微信", count: postPaymentWechatCopy.length },
    { label: "留资下载报告", count: downloadGateSubmit.length },
  ];

  const funnel = funnelCounts.map((item, index) => ({
    ...item,
    rateFromPrev: index === 0 || funnelCounts[index - 1].count === 0 ? null : Math.round((item.count / funnelCounts[index - 1].count) * 100),
  }));

  return {
    date,
    storageMode: getStorageMode(),
    overview: {
      visitors: totalVisitors,
      effectiveSubmissionCount,
      submitUrl: submitUrl.length,
      resultGenerated: resultGenerated.length,
      downloadReport: downloadReport.length,
      downloadGateOpen: downloadGateOpen.length,
      downloadGateSubmit: downloadGateSubmit.length,
      articleClick: articleClick.length,
      caseClick: caseClick.length,
      quickCallClick: quickCallClick.length,
      lightDiagnosisClick: lightDiagnosisClick.length,
      lightDiagnosisPaymentOpen: lightDiagnosisPaymentOpen.length,
      postPaymentWechatCopy: postPaymentWechatCopy.length,
      copyWechat: copyWechat.length,
      quotaExceeded: quotaExceeded.length,
    },
    deviceMetrics: {
      mobile: buildDevicePerformance("mobile"),
      desktop: buildDevicePerformance("desktop"),
      tablet: buildDevicePerformance("tablet"),
    },
    funnel,
    analyzeUsers,
    submissions: Array.from(grouped.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    leads,
  };
}

async function getDailySummaryLocal(queryInput?: string | SummaryQuery): Promise<DailySummary> {
  const store = await readLocalStore();
  const scope = resolveSummaryScope(queryInput);

  if (scope.mode === "all") {
    const analyzeUsers = Object.values(store.users).filter((u) => u.counter.used > 0).length;
    return buildDailySummary("all", store.events, store.leads, analyzeUsers);
  }

  const from = scope.from!;
  const to = scope.to!;
  const analyzeUsers = Object.values(store.users).filter((u) => u.counter.date >= from && u.counter.date <= to && u.counter.used > 0).length;
  const leads = store.leads.filter((item) => isoWithinDateRange(item.createdAt, from, to));
  const events = store.events.filter((item) => isoWithinDateRange(item.createdAt, from, to));
  return buildDailySummary(scope.label, events, leads, analyzeUsers);
}

async function resetStoreLocal(): Promise<void> {
  await ensureStore();
  await writeLocalStore(DEFAULT_STORE);
}

async function getQuotaSupabase(userKey: string) {
  const supabase = getSupabaseAdmin();
  const today = getToday();
  const { data } = (await supabase
    .from("user_daily_quotas")
    .select("used")
    .eq("user_key", userKey)
    .eq("date", today)
    .maybeSingle()) as { data: { used: number } | null };

  const used = data?.used ?? 0;
  return { used, limit: QUOTA_LIMIT, remaining: Math.max(0, QUOTA_LIMIT - used) };
}

async function getCachedResultSupabase(userKey: string, url: string): Promise<AnalyzeResult | null> {
  const supabase = getSupabaseAdmin();
  const { data } = (await supabase
    .from("cached_results")
    .select("result, created_at")
    .eq("user_key", userKey)
    .eq("url", url)
    .maybeSingle()) as { data: { result: AnalyzeResult; created_at: string } | null };

  if (!data) return null;
  const ageMs = Date.now() - new Date(data.created_at).getTime();
  if (ageMs > 24 * 60 * 60 * 1000) return null;
  return { ...(data.result as AnalyzeResult), source: "cache" };
}

async function getStoredResultSupabase(userKey: string, url: string): Promise<AnalyzeResult | null> {
  const supabase = getSupabaseAdmin();
  const { data } = (await supabase
    .from("cached_results")
    .select("result")
    .eq("user_key", userKey)
    .eq("url", url)
    .maybeSingle()) as { data: { result: AnalyzeResult } | null };

  if (!data?.result) return null;
  return data.result;
}

async function saveAnalyzeResultSupabase(userKey: string, url: string, result: AnalyzeResult): Promise<void> {
  const supabase = getSupabaseAdmin();
  const today = getToday();
  const { data: quotaRow } = (await supabase
    .from("user_daily_quotas")
    .select("used")
    .eq("user_key", userKey)
    .eq("date", today)
    .maybeSingle()) as { data: { used: number } | null };

  const used = quotaRow?.used ?? 0;

  const quotaPromise = supabase.from("user_daily_quotas").upsert(
    {
      user_key: userKey,
      date: today,
      used: used + 1,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_key,date" },
  );

  const cachePromise = supabase.from("cached_results").upsert(
    {
      user_key: userKey,
      url,
      result,
      created_at: new Date().toISOString(),
    },
    { onConflict: "user_key,url" },
  );

  await Promise.all([quotaPromise, cachePromise]);
}

async function createLeadSupabase(userKey: string, payload: LeadPayload): Promise<LeadEntry> {
  const supabase = getSupabaseAdmin();
  const entry = {
    user_key: userKey,
    url: payload.url,
    score: payload.score,
    percentile: payload.percentile,
    industry: payload.industry,
    summary: payload.summary,
  };

  const { data, error } = await supabase
    .from("leads")
    .insert(entry)
    .select("id, user_key, url, score, percentile, industry, summary, created_at")
    .single();

  if (error || !data) {
    throw new Error("failed to create lead");
  }

  return {
    id: data.id,
    userKey: data.user_key,
    url: data.url,
    score: data.score,
    percentile: data.percentile,
    industry: data.industry,
    summary: data.summary,
    createdAt: data.created_at,
  };
}

async function recordEventSupabase(
  userKey: string,
  payload: EventPayload,
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const eventRow = {
    user_key: userKey,
    type: payload.type,
    device_type: payload.deviceType,
    url: payload.url,
    score: payload.score,
    percentile: payload.percentile,
    industry: payload.industry,
    article_slug: payload.articleSlug,
    article_label: payload.articleLabel,
    article_position: payload.articlePosition,
  };

  const { error } = await supabase.from("events").insert(eventRow);
  if (!error) return;

  if (isMissingArticleEventColumnError(error) || isMissingDeviceTypeColumnError(error)) {
    const { error: fallbackError } = await supabase.from("events").insert({
      user_key: userKey,
      type: payload.type,
      url: payload.url,
      score: payload.score,
      percentile: payload.percentile,
      industry: payload.industry,
    });
    if (!fallbackError) return;
  }

  throw new Error("failed to record event");
}

async function getDailySummarySupabase(queryInput?: string | SummaryQuery): Promise<DailySummary> {
  const supabase = getSupabaseAdmin();
  const scope = resolveSummaryScope(queryInput);
  const eventsQuery = supabase
    .from("events")
    .select("id, type, user_key, created_at, device_type, url, score, percentile, industry")
    .order("created_at", { ascending: false });
  const leadsQuery = supabase
    .from("leads")
    .select("id, user_key, created_at, url, score, percentile, industry, summary")
    .order("created_at", { ascending: false });
  const quotaQuery = supabase.from("user_daily_quotas").select("user_key").gt("used", 0);

  if (scope.mode !== "all") {
    const fromRange = dayRange(scope.from!);
    const toRange = dayRange(scope.to!);
    eventsQuery.gte("created_at", fromRange.start).lt("created_at", toRange.end);
    leadsQuery.gte("created_at", fromRange.start).lt("created_at", toRange.end);
    quotaQuery.gte("date", scope.from!).lte("date", scope.to!);
  }

  const [{ data: eventRows, error: eventError }, { data: leadRows, error: leadError }, { data: quotaRows, error: quotaError }] =
    await Promise.all([eventsQuery, leadsQuery, quotaQuery]);

  if ((eventError && !isMissingDeviceTypeColumnError(eventError)) || leadError || quotaError) {
    throw new Error("failed to load summary");
  }

  let safeEventRows = (eventRows ?? []) as SupabaseEventRow[];
  if (eventError && isMissingDeviceTypeColumnError(eventError)) {
    const { data: legacyRows, error: legacyError } = await supabase
      .from("events")
      .select("id, type, user_key, created_at, url, score, percentile, industry")
      .order("created_at", { ascending: false });
    if (legacyError) {
      throw new Error("failed to load summary");
    }
    safeEventRows = (legacyRows ?? []).map((row: unknown) => ({ ...(row as SupabaseEventRow), device_type: null }));
  }

  const events: EventEntry[] = safeEventRows.map((row) => ({
    id: row.id,
    type: row.type as EventType,
    userKey: row.user_key,
    createdAt: row.created_at,
    deviceType: row.device_type ?? "unknown",
    url: row.url ?? undefined,
    score: row.score ?? undefined,
    percentile: row.percentile ?? undefined,
    industry: row.industry ?? undefined,
  }));

  const leads: LeadEntry[] = ((leadRows ?? []) as SupabaseLeadRow[]).map((row) => ({
    id: row.id,
    userKey: row.user_key,
    createdAt: row.created_at,
    url: row.url,
    score: row.score,
    percentile: row.percentile,
    industry: row.industry,
    summary: row.summary,
  }));

  return buildDailySummary(scope.label, events, leads, quotaRows?.length ?? 0);
}

async function getStoredResultLocal(userKey: string, url: string): Promise<AnalyzeResult | null> {
  const store = await readLocalStore();
  const user = getLocalUserState(store, userKey);
  const cached = user.cache[url];
  if (!cached) return null;
  return cached.result;
}

async function resetStoreSupabase(): Promise<void> {
  const supabase = getSupabaseAdmin();
  await Promise.all([
    supabase.from("events").delete().neq("id", ""),
    supabase.from("leads").delete().neq("id", ""),
    supabase.from("cached_results").delete().neq("url", ""),
    supabase.from("user_daily_quotas").delete().neq("user_key", ""),
  ]);
}

export async function getQuota(userKey: string): Promise<{ used: number; limit: number; remaining: number }> {
  assertPersistentStorageConfigured();
  return hasSupabaseConfig() ? getQuotaSupabase(userKey) : getQuotaLocal(userKey);
}

export async function getCachedResult(userKey: string, url: string): Promise<AnalyzeResult | null> {
  assertPersistentStorageConfigured();
  return hasSupabaseConfig() ? getCachedResultSupabase(userKey, url) : getCachedResultLocal(userKey, url);
}

export async function getStoredResult(userKey: string, url: string): Promise<AnalyzeResult | null> {
  assertPersistentStorageConfigured();
  return hasSupabaseConfig() ? getStoredResultSupabase(userKey, url) : getStoredResultLocal(userKey, url);
}

export async function saveAnalyzeResult(userKey: string, url: string, result: AnalyzeResult): Promise<void> {
  assertPersistentStorageConfigured();
  if (hasSupabaseConfig()) {
    await saveAnalyzeResultSupabase(userKey, url, result);
    return;
  }
  await saveAnalyzeResultLocal(userKey, url, result);
}

export async function createLead(userKey: string, payload: LeadPayload): Promise<LeadEntry> {
  assertPersistentStorageConfigured();
  return hasSupabaseConfig() ? createLeadSupabase(userKey, payload) : createLeadLocal(userKey, payload);
}

export async function recordEvent(
  userKey: string,
  payload: EventPayload,
): Promise<void> {
  assertPersistentStorageConfigured();
  if (hasSupabaseConfig()) {
    await recordEventSupabase(userKey, payload);
    return;
  }
  await recordEventLocal(userKey, payload);
}

export async function getDailySummary(queryInput?: string | SummaryQuery): Promise<DailySummary> {
  assertPersistentStorageConfigured();
  return hasSupabaseConfig() ? getDailySummarySupabase(queryInput) : getDailySummaryLocal(queryInput);
}

export async function resetStore(): Promise<void> {
  assertPersistentStorageConfigured();
  if (hasSupabaseConfig()) {
    await resetStoreSupabase();
    return;
  }
  await resetStoreLocal();
}
