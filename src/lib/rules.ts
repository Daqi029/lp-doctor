import type { AnalyzeResult, Suggestion } from "./types";

type PageSignals = {
  title: string;
  text: string;
  h1: string;
  headings: string[];
  buttons: string[];
  primaryCtas: string[];
  hasPricing: boolean;
  hasTestimonial: boolean;
  hasLogoWall: boolean;
  hasFaq: boolean;
  ctaCount: number;
  heroLen: number;
};

const SAAS_HINTS = [
  "saas",
  "signup",
  "trial",
  "book demo",
  "product",
  "software",
  "platform",
  "dashboard",
  "api",
  "integrations",
  "workspace",
  "automation",
  "b2b",
  "crm",
  "analytics",
  "立即注册",
  "免费试用",
  "预约演示",
  "软件",
  "平台",
];

const ECOM_HINTS = ["add to cart", "buy now", "shop", "checkout", "cart", "立即购买", "加入购物车"];
const INFO_HINTS = ["course", "newsletter", "教程", "订阅", "课程", "社群"];

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractArray(html: string, tag: string): string[] {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi");
  const items: string[] = [];
  let match: RegExpExecArray | null = regex.exec(html);
  while (match) {
    const text = stripHtml(match[1]);
    if (text) items.push(text);
    match = regex.exec(html);
  }
  return items;
}

function detectIndustry(text: string): AnalyzeResult["industry"] {
  const lower = text.toLowerCase();
  const count = (arr: string[]) => arr.reduce((n, term) => n + (lower.includes(term) ? 1 : 0), 0);
  const saas = count(SAAS_HINTS);
  const ecom = count(ECOM_HINTS);
  const info = count(INFO_HINTS);

  if (ecom >= saas && ecom >= 2) return "Ecommerce";
  if (info > saas && info >= 2) return "Info";
  if (saas >= 1) return "SaaS";
  return "General";
}

function toSignals(html: string): PageSignals {
  const text = stripHtml(html).slice(0, 12000);
  const h1List = extractArray(html, "h1");
  const headings = [...h1List, ...extractArray(html, "h2"), ...extractArray(html, "h3")].slice(0, 20);
  const buttons = [...extractArray(html, "button"), ...extractArray(html, "a")]
    .filter((item) => item.length > 1 && item.length < 45)
    .slice(0, 40);
  const primaryCtas = buttons
    .filter((b) => /(start|trial|demo|book|sign|立即|开始|咨询|注册|试用|联系|预约|购买)/i.test(b))
    .slice(0, 8);

  const title = extractArray(html, "title")[0] || "";

  return {
    title,
    text,
    h1: h1List[0] || "",
    headings,
    buttons,
    primaryCtas,
    hasPricing: /(pricing|price|套餐|价格)/i.test(text),
    hasTestimonial: /(testimonial|review|case study|客户评价|用户反馈|案例)/i.test(text),
    hasLogoWall: /(trusted by|clients|customer logos|合作客户|服务客户)/i.test(text),
    hasFaq: /(faq|常见问题)/i.test(text),
    ctaCount: buttons.filter((b) => /(start|trial|demo|book|sign|立即|开始|咨询|注册|试用)/i.test(b)).length,
    heroLen: headings[0]?.length || 0,
  };
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function buildSuggestions(
  signals: PageSignals,
  dimensions: AnalyzeResult["dimensions"],
): Suggestion[] {
  const list: Suggestion[] = [];
  const ctaPreview = signals.primaryCtas.length > 0 ? signals.primaryCtas.join(" / ") : "未识别到明确行动按钮文案";
  const headlinePreview = signals.h1 || signals.headings[0] || signals.title || "未识别到明确首屏标题";

  const weakDimensions = [
    { key: "valueProp", score: dimensions.valueProp },
    { key: "cta", score: dimensions.cta },
    { key: "structure", score: dimensions.structure },
    { key: "trust", score: dimensions.trust },
    { key: "copy", score: dimensions.copy },
  ].sort((a, b) => a.score - b.score);

  for (const dim of weakDimensions) {
    if (list.length >= 3) break;
    if (dim.key === "valueProp") {
      list.push({
        title: "首屏价值主张需要具体化",
        issue: "首屏信息没有同时说清“目标用户 + 结果收益 + 时间/场景”，用户很难快速判断是否与自己相关。",
        impact: "前 5 秒无法建立价值感，会直接拉高首屏流失。",
        action:
          "把 H1 改为“帮谁在什么场景下获得什么结果”，并在副标题补上一个可量化结果（如提升注册率、缩短部署时间）。",
        evidence: `检测到首屏标题：“${headlinePreview}”`,
        priority: "high",
      });
    } else if (dim.key === "cta") {
      list.push({
        title: "CTA 不够聚焦，动作成本偏高",
        issue: "CTA 文案和落点没有形成单一路径，用户知道你在介绍产品，但不知道下一步该点哪里。",
        impact: "直接损失高意向点击，导致注册/咨询转化偏低。",
        action:
          "统一一个主 CTA（建议“免费试用”或“预约演示”），并固定在首屏、方案区和页尾各出现一次，其他按钮降级为次级样式。",
        evidence: `检测到 CTA 文案：${ctaPreview}`,
        priority: "high",
      });
    } else if (dim.key === "structure") {
      list.push({
        title: "结构顺序影响转化决策",
        issue: "页面模块顺序不够“决策友好”，用户需要自己拼接信息后才敢行动。",
        impact: "阅读深度增加但行动率下降，转化漏斗中段流失明显。",
        action:
          "按“痛点 -> 方案 -> 结果证据 -> 价格/承诺 -> CTA”重排；每个模块末尾都给一个对应行动入口。",
        evidence: `检测到标题层级数量 ${signals.headings.length}，FAQ ${signals.hasFaq ? "已存在" : "缺失"}`,
        priority: "high",
      });
    } else if (dim.key === "trust") {
      list.push({
        title: "信任证据不足，难以完成临门一脚",
        issue: "缺少足够的案例、评价或客户背书，用户无法判断风险。",
        impact: "会出现“感觉不错但再看看”的犹豫，转化在下单前被拦截。",
        action: "补 2-3 条结果型证言（改版前后指标），并增加客户 Logo 或公开案例链接作为验证材料。",
        evidence: `案例/评价：${signals.hasTestimonial ? "有" : "无"}；客户背书：${signals.hasLogoWall ? "有" : "无"}`,
        priority: "high",
      });
    } else if (dim.key === "copy") {
      list.push({
        title: "文案偏抽象，目标用户画像不够尖锐",
        issue: "文案更多是能力描述，而不是用户场景和具体结果描述。",
        impact: "吸引到泛流量，精准用户反而无法快速确认“这是给我的”。",
        action:
          "将核心模块改成“适用人群 -> 典型场景 -> 结果承诺”，每段至少加入 1 个可验证数据或具体场景。",
        evidence: `页面可分析文本长度约 ${signals.text.length} 字符`,
        priority: "high",
      });
    }
  }

  return list.slice(0, 3);
}

export async function analyzeLandingPage(url: string): Promise<AnalyzeResult> {
  const response = await fetch(url, {
    method: "GET",
    redirect: "follow",
    headers: {
      "User-Agent": "Mozilla/5.0 LP-Diagnosis-Bot",
      Accept: "text/html,application/xhtml+xml",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`页面抓取失败（${response.status}）`);
  }

  const html = await response.text();
  const signals = toSignals(html);
  const industry = detectIndustry(`${signals.title} ${signals.text}`);

  const valueProp = clampScore(
    45 +
      (signals.heroLen >= 16 ? 12 : 0) +
      (signals.headings.length >= 4 ? 8 : 0) +
      (/(for|帮助|面向|专为)/i.test(signals.text) ? 10 : 0),
  );
  const structure = clampScore(40 + (signals.headings.length >= 6 ? 20 : 10) + (signals.hasFaq ? 8 : 0));
  const cta = clampScore(35 + Math.min(25, signals.ctaCount * 8) + (signals.hasPricing ? 10 : 0));
  const trust = clampScore(30 + (signals.hasTestimonial ? 25 : 0) + (signals.hasLogoWall ? 20 : 0));
  const copy = clampScore(
    42 +
      (signals.text.length > 2000 ? 12 : 0) +
      (/(case|results|提升|增长|转化)/i.test(signals.text) ? 12 : 0),
  );

  const score = clampScore(valueProp * 0.24 + structure * 0.2 + cta * 0.24 + trust * 0.16 + copy * 0.16);

  const industryMedian = {
    SaaS: 64,
    Ecommerce: 60,
    Info: 58,
    General: 61,
  } as const;

  const rawPercentile = 50 + (score - industryMedian[industry]) * 1.8;
  const percentile = clampScore(rawPercentile);

  const summary =
    score < 60
      ? `你的页面当前处于${industry}类页面后 ${100 - percentile}% 区间，首屏表达与行动触发会持续拉低转化。`
      : `你的页面有基本转化框架，但在${industry}类页面中仍有明显优化空间，尤其是关键说服节点。`;

  const dimensions = { valueProp, structure, cta, trust, copy };

  return {
    score,
    percentile,
    industry,
    summary,
    suggestions: buildSuggestions(signals, dimensions),
    dimensions,
    source: "fresh",
  };
}
