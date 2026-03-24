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

type SuggestionVariant = Pick<Suggestion, "title" | "issue" | "impact" | "action">;

const SUGGESTION_VARIANTS = {
  value_clarity_first: [
    {
      title: "用户没看懂你能带来什么结果",
      issue: "用户一进来，还没看明白你到底是帮谁、解决什么、最后能带来什么结果。",
      impact: "首屏没看懂，很多人就直接关掉了，后面写再多也来不及。",
      action: "把首屏改成一句大白话：你帮谁，在什么场景下，拿到什么结果。CTA 也跟这个结果对上。",
    },
    {
      title: "首屏像介绍产品，不像在卖结果",
      issue: "你现在更像在介绍产品本身，但没直接说清楚“用了之后到底有什么变化”。",
      impact: "用户看完会觉得你讲了很多，但还是不知道这东西值不值得点进去。",
      action: "先把标题改成结果导向，再用一句副标题补清楚：适合谁、用在什么场景、能带来什么好处。",
    },
    {
      title: "价值主张偏空，用户找不到和自己的关系",
      issue: "首屏说得有点虚，用户还得自己想“这和我有什么关系”。",
      impact: "只要用户多想 2 秒，流失就会明显变高。",
      action: "少讲概念，多讲场景。直接写清楚：谁在什么情况下，用你之后能得到什么。",
    },
  ],
  reduce_cognitive_load: [
    {
      title: "信息太多，用户不知道先做什么",
      issue: "这一屏里塞的东西有点多，用户看完还得想一下“我现在到底该点哪儿”。",
      impact: "用户一旦开始犹豫，按钮点击率就会往下掉。",
      action: "每一屏尽量只讲一个重点，只留一个主按钮，其他内容往后放。",
    },
    {
      title: "结构太满，用户阅读路线被打散",
      issue: "模块和动作同时出现过多，用户无法一眼看清应该先理解什么、再执行什么。",
      impact: "阅读没有主线时，页面虽然看起来内容多，但行动率往往先掉。",
      action: "收紧模块顺序，按“问题 -> 方案 -> 证据 -> CTA”推进，并压缩并列按钮数量。",
    },
    {
      title: "页面决策负担偏重，用户容易半路分心",
      issue: "页面把太多信息点放在前半段，用户需要自己组织重点后才敢继续往下看。",
      impact: "这种负担不会直接表现成停留变短，但会明显压低关键动作完成率。",
      action: "把最关键的利益点、证据和主 CTA 前置，其它说明内容后移并做折叠/降级。",
    },
  ],
  activation_path_visible: [
    {
      title: "看完后，不知道点击后会发生什么",
      issue: "用户看得到按钮，但不知道点完以后会发生什么。",
      impact: "本来想点的人，也会因为心里没底先停一下，很多就停没了。",
      action: "在按钮旁边补一句人话：点了之后会看到什么、等多久、下一步是什么。",
    },
    {
      title: "行动路径不透明，用户不敢马上点",
      issue: "页面虽然有 CTA，但没有把点击后的流程、耗时和结果预期说清楚。",
      impact: "越接近转化的用户，越会因为这类不确定性放慢决策。",
      action: "在首屏 CTA 下补充流程说明，明确“提交后多久响应、会看到什么、下一步是什么”。",
    },
    {
      title: "CTA 有了，但缺少“点击之后”的解释",
      issue: "用户能看到按钮，却无法提前预判点击后的成本和收益。",
      impact: "CTA 文案再强，缺少流程解释时也会损失高意向点击。",
      action: "补一个极短流程条或 3 步说明，把行动门槛从“未知”变成“可预期”。",
    },
  ],
  outcome_over_feature: [
    {
      title: "讲了功能，但用户看不到收益",
      issue: "你讲了很多功能，但用户还是不清楚这些功能最后能帮他拿到什么结果。",
      impact: "用户可能觉得你产品不差，但就是提不起马上行动的劲。",
      action: "每讲一个功能，就顺手补一句“它能带来什么好处”，最好能落到结果上。",
    },
    {
      title: "卖点停留在功能层，没打到结果层",
      issue: "你在告诉用户“有什么”，但没有充分回答“为什么这件事值得现在就做”。",
      impact: "页面会显得专业，但不会显得急迫，行动意愿自然偏弱。",
      action: "把功能模块改写成“功能 + 业务结果”的双句式，优先写收益而不是能力名词。",
    },
    {
      title: "功能很多，但用户还是想问一句：然后呢？",
      issue: "页面信息更偏产品能力罗列，缺少把能力翻译成收益的桥梁文案。",
      impact: "这会让页面停留在“懂了产品”，却到不了“我要立刻行动”。",
      action: "每个核心功能后追加一条结果描述，最好带时间、效率或转化类指标。",
    },
  ],
  trust_acceleration: [
    {
      title: "信任不足，用户不敢马上行动",
      issue: "你在说自己不错，但页面上还缺一点让人立刻信你的证据。",
      impact: "用户会先去看看别家，或者干脆先不做决定。",
      action: "补真实案例、结果数据、客户评价，最好再加一句风险小一点的承诺。",
    },
    {
      title: "缺少临门一脚的信任证据",
      issue: "页面里有介绍，但缺少足够强的证明材料让用户确信“这事你真做过、真有效”。",
      impact: "用户会默认继续观望，尤其是在价格或咨询动作前最明显。",
      action: "补客户案例、结果截图、前后对比和风险承诺，把“可信”做成显性模块。",
    },
    {
      title: "说服链条里，信任这一步还是空的",
      issue: "页面缺少第三方背书、结果证据或风险对冲，导致用户只能靠主观感受判断你。",
      impact: "没有证据托底，用户越认真考虑，越容易犹豫。",
      action: "优先补真实案例和结果数据，其次补客户 Logo、评价和可撤回承诺。",
    },
  ],
  friction_kill: [
    {
      title: "选项太多，用户不知道先点哪里",
      issue: "按钮和入口有点多，用户得先判断一下哪个才是你最想让他点的。",
      impact: "选择越多，犹豫越多，最后真正点的人就越少。",
      action: "收成一个主按钮加一个次按钮就够了，别让用户做太多判断题。",
    },
    {
      title: "按钮很多，但主动作不够突出",
      issue: "当前页面给了用户太多并列路径，主 CTA 的优先级被稀释。",
      impact: "页面看起来很热闹，但真正想推进的动作会被分流。",
      action: "收掉低优先级按钮，只保留一个主 CTA，把其它链接降成文字入口或页脚入口。",
    },
    {
      title: "动作入口分散，用户容易点偏",
      issue: "你给了多个选择，但没有用足够明确的主次关系告诉用户哪个最重要。",
      impact: "用户多花一次判断成本，转化通常就会掉一层。",
      action: "统一整页主动作，让首屏、信息区和页尾都围绕同一个目标 CTA 收口。",
    },
  ],
  positioning_density: [
    {
      title: "看完后，用户不清楚为什么选你",
      issue: "用户看完能知道你是做什么的，但还说不出你和别人到底差在哪。",
      impact: "一旦看起来都差不多，用户就容易去比价格、比功能、比运气。",
      action: "补一句最能代表你的差异点，让人一眼知道为什么要先试你。",
    },
    {
      title: "有介绍，但没有打出你的独特位置",
      issue: "页面说明了产品和服务，却没有把“你和别人的不同”压缩成一句强辨识表达。",
      impact: "用户会觉得都差不多，从而把你拖入价格或功能比较。",
      action: "在首屏或方案区补一句定位锚点，明确你最适合谁、最不适合谁、为什么更值得选。",
    },
    {
      title: "差异点不够尖，用户会默认你是同类之一",
      issue: "页面没有足够快地建立类别认知和独特优势，容易被看成普通替代品。",
      impact: "一旦进入模糊比较，页面说服力会明显下降。",
      action: "把独有框架、方法论或服务边界写成一句强标签，让用户快速记住你。",
    },
  ],
} satisfies Record<string, SuggestionVariant[]>;

function stableHash(input: string): number {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function pickSuggestionVariant(category: keyof typeof SUGGESTION_VARIANTS, seed: string): SuggestionVariant {
  const variants = SUGGESTION_VARIANTS[category];
  return variants[stableHash(`${category}:${seed}`) % variants.length];
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
  const seedBase = `${headlinePreview}|${ctaPreview}|${signals.buttons.length}|${signals.headings.length}|${signals.text.slice(0, 180)}`;

  const blockById = (id: string) => growthBlocks.find((block) => block.id === id);

  if (dimensions.valueProp < 72 || containsAny(headlinePreview, GENERIC_HERO_WORDS)) {
    const block = blockById("value_clarity_first");
    if (block) {
      const variant = pickSuggestionVariant("value_clarity_first", seedBase);
      candidates.push({
        ...variant,
        evidence: `你现在首屏最先让人看到的是“${headlinePreview}”，主按钮文案是“${ctaPreview}”。`,
        priority: "high",
        score: 100 - dimensions.valueProp,
      });
    }
  }

  if (dimensions.structure < 70 || signals.primaryCtas.length >= 3 || signals.headings.length > 12) {
    const block = blockById("reduce_cognitive_load");
    if (block) {
      const variant = pickSuggestionVariant("reduce_cognitive_load", seedBase);
      candidates.push({
        ...variant,
        evidence: `这页里一共识别到 ${signals.headings.length} 个标题层级，主按钮大概有 ${signals.primaryCtas.length} 个。`,
        priority: "high",
        score: 100 - dimensions.structure,
      });
    }
  }

  if (dimensions.cta < 72 || !containsAny(text, FLOW_WORDS)) {
    const block = blockById("activation_path_visible");
    if (block) {
      const variant = pickSuggestionVariant("activation_path_visible", seedBase);
      candidates.push({
        ...variant,
        evidence: `按钮文案是“${ctaPreview}”，但页面里${containsAny(text, FLOW_WORDS) ? "已经提到了一些流程说明" : "还没怎么说点完之后会发生什么" }。`,
        priority: "high",
        score: 100 - dimensions.cta,
      });
    }
  }

  if (dimensions.copy < 72 || featureDensity > outcomeDensity + 1) {
    const block = blockById("outcome_over_feature");
    if (block) {
      const variant = pickSuggestionVariant("outcome_over_feature", seedBase);
      candidates.push({
        ...variant,
        evidence: `这页现在更偏在讲功能点（大概 ${featureDensity} 处），直接讲结果和收益的地方相对少一些（大概 ${outcomeDensity} 处）。`,
        priority: "high",
        score: 100 - dimensions.copy,
      });
    }
  }

  if (dimensions.trust < 72 || (!signals.hasTestimonial && !signals.hasLogoWall) || !containsAny(text, RISK_REVERSE_WORDS)) {
    const block = blockById("trust_acceleration");
    if (block) {
      const variant = pickSuggestionVariant("trust_acceleration", seedBase);
      candidates.push({
        ...variant,
        evidence: `页面里${signals.hasTestimonial ? "有一些案例或评价" : "还没看到明显的案例或评价"}，${signals.hasLogoWall ? "也有客户背书" : "客户背书也不够明显"}。`,
        priority: "high",
        score: 100 - dimensions.trust,
      });
    }
  }

  if (signals.primaryCtas.length >= 3 || signals.buttons.length > 20) {
    const block = blockById("friction_kill");
    if (block) {
      const variant = pickSuggestionVariant("friction_kill", seedBase);
      candidates.push({
        ...variant,
        evidence: `这页总共识别到大约 ${signals.buttons.length} 个可点入口，其中主按钮大概有 ${signals.primaryCtas.length} 个。`,
        priority: "high",
        score: 60 + signals.primaryCtas.length * 4,
      });
    }
  }

  if (dimensions.copy < 75 && !containsAny(text, POSITIONING_WORDS)) {
    const block = blockById("positioning_density");
    if (block) {
      const variant = pickSuggestionVariant("positioning_density", seedBase);
      candidates.push({
        ...variant,
        evidence: `页面里${containsAny(text, POSITIONING_WORDS) ? "有提到一些差异化表达" : "还没看到特别明确的差异化表达"}，文案整体也偏普通。`,
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
        title: "首屏这句话还不够好懂",
        issue: "用户看完首屏，还是不太明白你到底是帮谁、解决什么问题的。",
        impact: "第一眼没看懂，很多人就不会继续往下看。",
        action: "把标题改成一句更直白的话：帮谁，在什么场景下，拿到什么结果。",
        evidence: `现在首屏标题是“${headlinePreview}”。`,
        priority: "high",
      });
    } else if (dim.key === "cta") {
      list.push({
        title: "按钮有了，但下一步不够明确",
        issue: "用户知道你想让他点按钮，但不太清楚到底该点哪个、点了以后去哪里。",
        impact: "想点的人也会多犹豫一下，转化自然会掉。",
        action: "只保留一个最重要的主按钮，并让首屏、正文和页尾都围绕它来。",
        evidence: `现在页面上的按钮文案主要是“${ctaPreview}”。`,
        priority: "high",
      });
    } else if (dim.key === "structure") {
      list.push({
        title: "页面顺序有点乱，用户得自己拼重点",
        issue: "现在的内容顺序不够顺，用户得自己想一遍，才知道你想表达什么。",
        impact: "用户虽然可能会继续看，但行动意愿会在中间慢慢掉下去。",
        action: "尽量按“问题 -> 方案 -> 证据 -> CTA”来排，让用户顺着看就能做决定。",
        evidence: `这页识别到 ${signals.headings.length} 个标题层级，${signals.hasFaq ? "FAQ 已经有了" : "FAQ 还没看到"}。`,
        priority: "high",
      });
    } else if (dim.key === "trust") {
      list.push({
        title: "还差一点让人放心下单的东西",
        issue: "页面里缺少让人放心的证据，比如案例、评价、客户背书这些。",
        impact: "用户会觉得“还行”，但不会马上行动。",
        action: "补 2-3 个真实案例，最好带结果数据，再放点客户评价或客户 Logo。",
        evidence: `页面里${signals.hasTestimonial ? "有案例或评价" : "还没有明显案例或评价"}，${signals.hasLogoWall ? "也有客户背书" : "客户背书也不明显"}。`,
        priority: "high",
      });
    } else if (dim.key === "copy") {
      list.push({
        title: "文案有点虚，像在讲概念",
        issue: "现在文案更像在说自己厉害，但没怎么说用户到底会得到什么。",
        impact: "看的人可能觉得你说得挺多，但记不住重点，也不容易被打动。",
        action: "少讲概念，多讲场景和结果。最好每段都能让人看懂“这对我有什么用”。",
        evidence: `这页目前能分析出来的文案内容大约有 ${signals.text.length} 个字符。`,
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
      ? `这页现在偏弱，在${industry}类页面里大概落在后 ${100 - percentile}% 。最大问题不是流量，而是用户看完不够想点。`
      : `这页不算差，基本框架已经有了，但离“让用户更想点、更想聊”还有一段距离。`;

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
