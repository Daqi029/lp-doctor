export type Suggestion = {
  title: string;
  issue: string;
  impact: string;
  action: string;
  evidence: string;
  priority: "high" | "medium";
};

export type AnalyzeResult = {
  score: number;
  percentile: number;
  industry: "SaaS" | "Ecommerce" | "Info" | "General";
  summary: string;
  previewImage?: string | null;
  suggestions: Suggestion[];
  dimensions: {
    valueProp: number;
    structure: number;
    cta: number;
    trust: number;
    copy: number;
  };
  source: "fresh" | "cache";
};

export type QuotaInfo = {
  used: number;
  limit: number;
  remaining: number;
};

export type AnalyzeResponse = {
  ok: boolean;
  result?: AnalyzeResult;
  quota?: QuotaInfo;
  message?: string;
};

export type LeadPayload = {
  url: string;
  score: number;
  percentile: number;
  industry: string;
  summary: string;
};
