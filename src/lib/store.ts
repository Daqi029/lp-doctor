import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { AnalyzeResult, LeadPayload } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
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

type StoreShape = {
  users: Record<string, UserState>;
  leads: LeadEntry[];
};

const DEFAULT_STORE: StoreShape = { users: {}, leads: [] };

function hashText(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex").slice(0, 16);
}

export function makeUserKey(ip: string, userAgent: string, anonId: string): string {
  return hashText(`${ip}|${userAgent}|${anonId}`);
}

export function normalizeUrl(input: string): string {
  const raw = input.trim();
  const withProtocol = /^[a-zA-Z][a-zA-Z\\d+\\-.]*:\/\//.test(raw) ? raw : `https://${raw}`;
  const url = new URL(withProtocol);
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

export async function getDailySummary(date?: string): Promise<{
  date: string;
  analyzeUsers: number;
  leads: LeadEntry[];
}> {
  const store = await readStore();
  const target = date ?? getToday();

  const analyzeUsers = Object.values(store.users).filter((u) => u.counter.date === target && u.counter.used > 0).length;
  const leads = store.leads.filter((item) => item.createdAt.slice(0, 10) === target);

  return { date: target, analyzeUsers, leads };
}
