import type { AnalyzeResult, Suggestion } from "./types";
import growthKnowledgeBase from "./growth_knowledge_base.json";

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

type GrowthBlock = {
  id: string;
  name: string;
  principle: string;
  commonIssues: string[];
  diagnosticSignals: string[];
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
const GENERIC_HERO_WORDS = ["ai", "platform", "solution", "next-gen", "智能平台", "解决方案", "一体化"];
const FLOW_WORDS = ["step", "流程", "第一步", "第二步", "开始后", "onboarding", "how it works", "3 steps", "三步"];
const OUTCOME_WORDS = ["提升", "增长", "转化", "结果", "ROI", "before", "after", "效率", "节省"];
const FEATURE_WORDS = ["feature", "功能", "模块", "集成", "integration", "dashboard", "api"];
const POSITIONING_WORDS = ["framework", "方法论", "独家", "proprietary", "专为", "only", "category"];
const RISK_REVERSE_WORDS = ["guarantee", "退款", "无风险", "cancel anytime", "满意"];
const growthBlocks: GrowthBlock[] = growthKnowledgeBase.blocks;

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

function extractAttr(tag: string, attr: string): string | null {
  const regex = new RegExp(`${attr}\\s*=\\s*["']([^"']+)["']`, "i");
  const match = tag.match(regex);
  return match?.[1] || null;
}

function extractPreviewImage(html: string, pageUrl: string): string | null {
  const metaRegex = /<meta\s+[^>]*>/gi;
  let match: RegExpExecArray | null = metaRegex.exec(html);
  while (match) {
    const tag = match[0];
    const property = (extractAttr(tag, "property") || extractAttr(tag, "name") || "").toLowerCase();
    const content = extractAttr(tag, "content");
    if (content && (property === "og:image" || property === "twitter:image")) {
      try {
        return new URL(content, pageUrl).toString();
      } catch {
        return null;
      }
    }
    match = metaRegex.exec(html);
  }
  return null;
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

function containsAny(text: string, terms: string[]): boolean {
  const lower = text.toLowerCase();
  return terms.some((term) => lower.includes(term.toLowerCase()));
}

function countMatches(text: string, terms: string[]): number {
  const lower = text.toLowerCase();
  return terms.reduce((sum, term) => sum + (lower.includes(term.toLowerCase()) ? 1 : 0), 0);
}

function buildGrowthSuggestions(
  signals: PageSignals,
  dimensions: AnalyzeResult["dimensions"],
): Suggestion[] {
  const text = `${signals.h1} ${signals.title} ${signals.text}`;
  const ctaPreview = signals.primaryCtas.length > 0 ? signals.primaryCtas.join(" / ") : "未识别到明确行动按钮文案";
  const headlinePreview = signals.h1 || signals.headings[0] || signals.title || "未识别到明确首屏标题";
  const featureDensity = countMatches(text, FEATURE_WORDS);
  const outcomeDensity = countMatches(text, OUTCOME_WORDS);
  const candidates: Array<Suggestion & { score: number }> = [];

  const blockById = (id: string) => growthBlocks.find((block) => block.id === id);

  if (dimensions.valueProp < 72 || containsAny(headlinePreview, GENERIC_HERO_WORDS)) {
    const block = blockById("value_clarity_first");
    if (block) {
      candidates.push({
        title: "用户没看懂你能带来什么结果",
        issue: "首屏没有同时回答“为谁、解决什么、带来什么结果”，用户很难在 3 秒内建立相关性。",
        impact: "用户会在首屏快速流失，后续内容再完整也难以弥补第一印象损失。",
        action: "将首屏改写为“帮助[目标用户]在[场景/周期]获得[可量化结果]”，并让首个 CTA 与该结果一一对应。",
        evidence: `首屏文案：“${headlinePreview}”；CTA：“${ctaPreview}”`,
        priority: "high",
        score: 100 - dimensions.valueProp,
      });
    }
  }

  if (dimensions.structure < 70 || signals.primaryCtas.length >= 3 || signals.headings.length > 12) {
    const block = blockById("reduce_cognitive_load");
    if (block) {
      candidates.push({
        title: "信息太多，用户不知道先做什么",
        issue: "页面在同一视图内承载太多信息或并列动作，用户需要额外思考才能决定下一步。",
        impact: "理解成本上升会显著压低 CTA 点击率，尤其是冷启动流量。",
        action: "每一屏只保留一个主信息与一个主 CTA，其余信息降级到下一屏；用视觉层级强化阅读路径。",
        evidence: `标题层级数 ${signals.headings.length}；主 CTA 数 ${signals.primaryCtas.length}`,
        priority: "high",
        score: 100 - dimensions.structure,
      });
    }
  }

  if (dimensions.cta < 72 || !containsAny(text, FLOW_WORDS)) {
    const block = blockById("activation_path_visible");
    if (block) {
      candidates.push({
        title: "看完后，不知道点击后会发生什么",
        issue: "CTA 触发后的步骤与交付形式没有被清晰说明，用户不知道点击后会发生什么。",
        impact: "高意向用户会因为不确定性停留在“再看看”，导致关键动作损失。",
        action: "在 CTA 附近补一段“点击后 1-2-3 步会发生什么”，明确交付内容、时间与预期结果。",
        evidence: `CTA：“${ctaPreview}”；流程说明命中：${containsAny(text, FLOW_WORDS) ? "有" : "无"}`,
        priority: "high",
        score: 100 - dimensions.cta,
      });
    }
  }

  if (dimensions.copy < 72 || featureDensity > outcomeDensity + 1) {
    const block = blockById("outcome_over_feature");
    if (block) {
      candidates.push({
        title: "讲了功能，但用户看不到收益",
        issue: "页面强调功能与组件，但对“改完后能得到什么增长结果”描述不足。",
        impact: "用户能理解产品，却无法想象收益，转化意愿会停在中段。",
        action: "每个核心功能后补一个结果句（before/after 或增长指标），把“功能描述”转换成“结果画面”。",
        evidence: `功能词命中 ${featureDensity}；结果词命中 ${outcomeDensity}`,
        priority: "high",
        score: 100 - dimensions.copy,
      });
    }
  }

  if (dimensions.trust < 72 || (!signals.hasTestimonial && !signals.hasLogoWall) || !containsAny(text, RISK_REVERSE_WORDS)) {
    const block = blockById("trust_acceleration");
    if (block) {
      candidates.push({
        title: "信任不足，用户不敢马上行动",
        issue: "页面缺少真实案例、可量化成果或风险反转机制，用户难以快速建立信任。",
        impact: "决策速度下降，用户更容易推迟行动或转向竞品比较。",
        action: "补 2-3 条可验证案例（含前后指标）+ 明确交付物 + 风险反转承诺（如可取消/试用保障）。",
        evidence: `案例/评价：${signals.hasTestimonial ? "有" : "无"}；客户背书：${signals.hasLogoWall ? "有" : "无"}`,
        priority: "high",
        score: 100 - dimensions.trust,
      });
    }
  }

  if (signals.primaryCtas.length >= 3 || signals.buttons.length > 20) {
    const block = blockById("friction_kill");
    if (block) {
      candidates.push({
        title: "选项太多，用户不知道先点哪里",
        issue: "页面提供过多路径或按钮，用户需要额外判断“我该点哪一个”。",
        impact: "每多一个选择都会抬升流失，尤其在移动端更明显。",
        action: "压缩为“一个主 CTA + 一个次 CTA”，并减少跳转与输入步骤，让用户更快进入激活动作。",
        evidence: `页面按钮总数 ${signals.buttons.length}；主 CTA 数 ${signals.primaryCtas.length}`,
        priority: "high",
        score: 60 + signals.primaryCtas.length * 4,
      });
    }
  }

  if (dimensions.copy < 75 && !containsAny(text, POSITIONING_WORDS)) {
    const block = blockById("positioning_density");
    if (block) {
      candidates.push({
        title: "看完后，用户不清楚为什么选你",
        issue: "页面没有快速建立“你属于哪个类别、为什么比替代方案更值得选”。",
        impact: "用户即使感兴趣，也容易陷入同质化比较，降低转化确定性。",
        action: "补充方法论/框架名、独特视角和竞争差异一句话，建立 category + authority 的第一印象。",
        evidence: `定位关键词命中：${containsAny(text, POSITIONING_WORDS) ? "有" : "无"}；文案维度分 ${dimensions.copy}`,
        priority: "high",
        score: 100 - dimensions.copy,
      });
    }
  }

  const deduped = new Map<string, Suggestion & { score: number }>();
  for (const item of candidates) {
    if (!deduped.has(item.title)) deduped.set(item.title, item);
  }

  return [...deduped.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((item) => ({
      title: item.title,
      issue: item.issue,
      impact: item.impact,
      action: item.action,
      evidence: item.evidence,
      priority: item.priority,
    }));
}

function buildFallbackSuggestions(
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

  return list.slice(0, 5);
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
  const previewImage = extractPreviewImage(html, url);
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
  const growthSuggestions = buildGrowthSuggestions(signals, dimensions);
  const fallbackSuggestions = buildFallbackSuggestions(signals, dimensions);
  const suggestions = [...growthSuggestions];
  for (const suggestion of fallbackSuggestions) {
    if (suggestions.length >= 3) break;
    if (!suggestions.some((item) => item.title === suggestion.title)) {
      suggestions.push(suggestion);
    }
  }

  return {
    score,
    percentile,
    industry,
    summary,
    previewImage,
    suggestions,
    dimensions,
    source: "fresh",
  };
}
