import type { Suggestion } from "./types";

type ArticleCard = {
  slug: string;
  title: string;
  reason: string;
};

export type RecommendedArticle = ArticleCard & {
  href: string;
};

const BASE_URL = "https://quaily.com/overseas/p";

const ARTICLE_POOL: Record<Suggestion["category"], ArticleCard[]> = {
  value_clarity_first: [
    {
      slug: "your-landing-page-why-is-it-not-converting",
      title: "你的 Landing Page 为什么不转化？90% 的人都在第一屏就输了",
      reason: "这篇专门讲首屏怎么说人话，最适合先改第一屏。",
    },
    {
      slug: "dont-make-visitors-guess-how-to-double-conversion-rate-with-foolproof-landing-page",
      title: "别把愿景挂在首屏：把“动作”摆上来，成交才会上来",
      reason: "如果首屏说不清，这篇能帮你更快改出一个能让人看懂的版本。",
    },
  ],
  reduce_cognitive_load: [
    {
      slug: "landing-page-structure-and-golden-rule",
      title: "90% 的 Landing Page 都挂在这一步：结构与黄金法则",
      reason: "这篇专门讲页面顺序怎么排，适合先把结构理顺。",
    },
    {
      slug: "your-landing-page-why-is-it-not-converting",
      title: "你的 Landing Page 为什么不转化？90% 的人都在第一屏就输了",
      reason: "如果页面又乱又散，这篇能帮你先抓住最影响转化的顺序问题。",
    },
  ],
  activation_path_visible: [
    {
      slug: "dont-make-visitors-guess-how-to-double-conversion-rate-with-foolproof-landing-page",
      title: "别把愿景挂在首屏：把“动作”摆上来，成交才会上来",
      reason: "这篇专门讲 CTA 和行动指引，适合先解决“用户不知道点哪”的问题。",
    },
    {
      slug: "let-users-click-cta-decision-psychology-growth-strategies",
      title: "让用户更愿意点 CTA：背后的决策心理学",
      reason: "如果按钮有人看但没人点，这篇更适合继续往下看。",
    },
  ],
  outcome_over_feature: [
    {
      slug: "your-landing-page-why-is-it-not-converting",
      title: "你的 Landing Page 为什么不转化？90% 的人都在第一屏就输了",
      reason: "这篇很适合解决“讲了很多功能，但用户还是不想点”的问题。",
    },
    {
      slug: "six-90-percent-lp-copy-is-slowly-suiciding-wake-up-sleeping-users-with-5s-formula",
      title: "90% 的 LP 文案都在慢性自杀：用 5 秒公式叫醒用户",
      reason: "如果文案偏虚、偏概念，这篇更适合你先拿去改文案。",
    },
  ],
  trust_acceleration: [
    {
      slug: "how-to-build-trust-user-not-trust-you-conversion-rate-will-not-go-up",
      title: "如何建立信任？用户不信任你，转化率就上不去",
      reason: "这篇专门讲怎么补信任感，适合先解决“看完还不敢点”的问题。",
    },
    {
      slug: "visual-design-unveiled-how-to-make-your-lp-look-more-professional",
      title: "视觉设计揭秘：怎么让你的 LP 看起来更专业",
      reason: "如果页面看起来不够靠谱，这篇更适合继续补专业感。",
    },
  ],
  friction_kill: [
    {
      slug: "dont-make-visitors-guess-how-to-double-conversion-rate-with-foolproof-landing-page",
      title: "别把愿景挂在首屏：把“动作”摆上来，成交才会上来",
      reason: "这篇很适合解决按钮太多、用户不知道点哪个的问题。",
    },
    {
      slug: "remove-input-box-earn-more-dollars",
      title: "去掉一个输入框，可能就能多赚不少钱",
      reason: "如果流程太长、步骤太多，这篇更适合先减阻力。",
    },
  ],
  positioning_density: [
    {
      slug: "your-landing-page-why-is-it-not-converting",
      title: "你的 Landing Page 为什么不转化？90% 的人都在第一屏就输了",
      reason: "如果别人看完还是觉得你和其他人差不多，先看这篇。",
    },
    {
      slug: "landing-page-structure-and-golden-rule",
      title: "90% 的 Landing Page 都挂在这一步：结构与黄金法则",
      reason: "这篇能帮你把“你到底哪里不一样”放到更该出现的位置。",
    },
  ],
  fallback_value_prop: [
    {
      slug: "your-landing-page-why-is-it-not-converting",
      title: "你的 Landing Page 为什么不转化？90% 的人都在第一屏就输了",
      reason: "如果你只想先改最明显的一块，先从首屏开始看这篇。",
    },
  ],
  fallback_cta: [
    {
      slug: "dont-make-visitors-guess-how-to-double-conversion-rate-with-foolproof-landing-page",
      title: "别把愿景挂在首屏：把“动作”摆上来，成交才会上来",
      reason: "如果下一步动作不够明确，这篇最适合先看。",
    },
  ],
  fallback_structure: [
    {
      slug: "landing-page-structure-and-golden-rule",
      title: "90% 的 Landing Page 都挂在这一步：结构与黄金法则",
      reason: "如果你想先把页面顺一遍，这篇最有用。",
    },
  ],
  fallback_trust: [
    {
      slug: "how-to-build-trust-user-not-trust-you-conversion-rate-will-not-go-up",
      title: "如何建立信任？用户不信任你，转化率就上不去",
      reason: "如果用户看完还不敢信你，这篇最适合先补这一块。",
    },
  ],
  fallback_copy: [
    {
      slug: "six-90-percent-lp-copy-is-slowly-suiciding-wake-up-sleeping-users-with-5s-formula",
      title: "90% 的 LP 文案都在慢性自杀：用 5 秒公式叫醒用户",
      reason: "如果文案太虚、太像概念，这篇最适合先看。",
    },
  ],
};

export function getRecommendedArticles(suggestions: Suggestion[]): RecommendedArticle[] {
  const picked: RecommendedArticle[] = [];
  const seenSlug = new Set<string>();

  for (const suggestion of suggestions) {
    const articles = ARTICLE_POOL[suggestion.category] || [];
    for (const article of articles) {
      if (seenSlug.has(article.slug)) continue;
      picked.push({
        ...article,
        href: `${BASE_URL}/${article.slug}`,
      });
      seenSlug.add(article.slug);
      break;
    }
    if (picked.length >= 2) break;
  }

  return picked.slice(0, 2);
}
