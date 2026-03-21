import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { AnalyzeResult, LeadPayload } from "./types";

function resolveDataDir(): string {
  if (process.env.DATA_DIR) return process.env.DATA_DIR;
  if (process.env.NODE_ENV === "production") return path.join("/tmp", "lp-doctor-data");
  return path.join(process.cwd(), "data");
}

const DATA_DIR = resolveDataDir();
const STORE_FILE = path.join(DATA_DIR, "store.json");

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
  | "copy_wechat"
  | "quota_exceeded";

type EventEntry = {
  id: string;
  type: EventType;
  userKey: string;
  createdAt: string;
  url?: string;
  score?: number;
  percentile?: number;
  industry?: string;
};

type StoreShape = {
  users: Record<string, UserState>;
  leads: LeadEntry[];
  events: EventEntry[];
};

const DEFAULT_STORE: StoreShape = { users: {}, leads: [], events: [] };

function hashText(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex").slice(0, 16);
}

export function makeUserKey(ip: string, userAgent: string, anonId: string): string {
  return hashText(`${ip}|${userAgent}|${anonId}`);
}

export function normalizeUrl(input: string): string {
  const raw = input.trim();
  if (!raw) {
    throw new Error("empty url");
  }
  const hasProtocol = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(raw);
  const normalizedInput = raw.startsWith("//") ? `https:${raw}` : hasProtocol ? raw : `https://${raw}`;
  const url = new URL(normalizedInput);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("invalid protocol");
  }
  return `${url.origin}${url.pathname}`.replace(/\/$/, "");
}

async function ensureStore(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(STORE_FILE);
  } catch {
    await fs.writeFile(STORE_FILE, JSON.stringify(DEFAULT_STORE, null, 2), "utf8");
  }
}

async function readStore(): Promise<StoreShape> {
  await ensureStore();
  const raw = await fs.readFile(STORE_FILE, "utf8");
  try {
    return JSON.parse(raw) as StoreShape;
  } catch {
    return DEFAULT_STORE;
  }
}

async function writeStore(data: StoreShape): Promise<void> {
  await fs.writeFile(STORE_FILE, JSON.stringify(data, null, 2), "utf8");
}

function getToday(): string {
  const now = new Date();
  return now.toISOString().slice(0, 10);
}

function isSameDay(iso: string, target: string): boolean {
  return iso.slice(0, 10) === target;
}

function getUserState(store: StoreShape, userKey: string): UserState {
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

export async function getQuota(userKey: string): Promise<{ used: number; limit: number; remaining: number }> {
  const store = await readStore();
  const user = getUserState(store, userKey);
  const limit = 2;
  return { used: user.counter.used, limit, remaining: Math.max(0, limit - user.counter.used) };
}

export async function getCachedResult(userKey: string, url: string): Promise<AnalyzeResult | null> {
  const store = await readStore();
  const user = getUserState(store, userKey);
  const cached = user.cache[url];
  if (!cached) return null;

  const ageMs = Date.now() - new Date(cached.createdAt).getTime();
  if (ageMs > 24 * 60 * 60 * 1000) return null;

  return { ...cached.result, source: "cache" };
}

export async function saveAnalyzeResult(userKey: string, url: string, result: AnalyzeResult): Promise<void> {
  const store = await readStore();
  const user = getUserState(store, userKey);
  user.counter.used += 1;
  user.cache[url] = {
    url,
    result,
    createdAt: new Date().toISOString(),
  };
  await writeStore(store);
}

export async function createLead(userKey: string, payload: LeadPayload): Promise<LeadEntry> {
  const store = await readStore();
  const entry: LeadEntry = {
    ...payload,
    id: crypto.randomUUID(),
    userKey,
    createdAt: new Date().toISOString(),
  };

  store.leads.unshift(entry);
  store.leads = store.leads.slice(0, 1000);
  await writeStore(store);
  return entry;
}

export async function recordEvent(
  userKey: string,
  payload: {
    type: EventType;
    url?: string;
    score?: number;
    percentile?: number;
    industry?: string;
  },
): Promise<void> {
  const store = await readStore();
  store.events.unshift({
    id: crypto.randomUUID(),
    userKey,
    createdAt: new Date().toISOString(),
    ...payload,
  });
  store.events = store.events.slice(0, 5000);
  await writeStore(store);
}

export async function getDailySummary(date?: string): Promise<{
  date: string;
  overview: {
    visitors: number;
    submitUrl: number;
    resultGenerated: number;
    downloadReport: number;
    copyWechat: number;
    quotaExceeded: number;
  };
  funnel: {
    label: string;
    count: number;
    rateFromPrev: number | null;
  }[];
  analyzeUsers: number;
  submissions: {
    createdAt: string;
    url: string;
    score: number | null;
    industry: string | null;
    downloadedReport: boolean;
    copiedWechat: boolean;
  }[];
  leads: LeadEntry[];
}> {
  const store = await readStore();
  const target = date ?? getToday();

  const analyzeUsers = Object.values(store.users).filter((u) => u.counter.date === target && u.counter.used > 0).length;
  const leads = store.leads.filter((item) => item.createdAt.slice(0, 10) === target);
  const events = store.events.filter((item) => isSameDay(item.createdAt, target));

  const pageViews = events.filter((item) => item.type === "page_view");
  const submitUrl = events.filter((item) => item.type === "submit_url");
  const resultGenerated = events.filter((item) => item.type === "result_generated");
  const downloadReport = events.filter((item) => item.type === "download_report");
  const copyWechat = events.filter((item) => item.type === "copy_wechat");
  const quotaExceeded = events.filter((item) => item.type === "quota_exceeded");

  const grouped = new Map<string, { createdAt: string; url: string; score: number | null; industry: string | null; downloadedReport: boolean; copiedWechat: boolean }>();

  for (const entry of submitUrl) {
    const key = `${entry.userKey}:${entry.url || "unknown"}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        createdAt: entry.createdAt,
        url: entry.url || "-",
        score: null,
        industry: null,
        downloadedReport: false,
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
    const key = `${entry.userKey}:${entry.url || "unknown"}`;
    const current = grouped.get(key);
    if (current) current.downloadedReport = true;
  }

  for (const entry of copyWechat) {
    const key = `${entry.userKey}:${entry.url || "unknown"}`;
    const current = grouped.get(key);
    if (current) current.copiedWechat = true;
  }

  const funnelCounts = [
    { label: "访问", count: new Set(pageViews.map((item) => item.userKey)).size },
    { label: "提交 URL", count: submitUrl.length },
    { label: "生成结果", count: resultGenerated.length },
    { label: "下载报告", count: downloadReport.length },
    { label: "复制微信", count: copyWechat.length },
  ];

  const funnel = funnelCounts.map((item, index) => ({
    ...item,
    rateFromPrev:
      index === 0 || funnelCounts[index - 1].count === 0
        ? null
        : Math.round((item.count / funnelCounts[index - 1].count) * 100),
  }));

  return {
    date: target,
    overview: {
      visitors: new Set(pageViews.map((item) => item.userKey)).size,
      submitUrl: submitUrl.length,
      resultGenerated: resultGenerated.length,
      downloadReport: downloadReport.length,
      copyWechat: copyWechat.length,
      quotaExceeded: quotaExceeded.length,
    },
    funnel,
    analyzeUsers,
    submissions: Array.from(grouped.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    leads,
  };
}

export async function resetStore(): Promise<void> {
  await ensureStore();
  await writeStore(DEFAULT_STORE);
}
