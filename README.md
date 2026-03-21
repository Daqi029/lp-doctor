# Landingpage增长诊断 MVP

这是一个咨询引流型 MVP：
- 用户输入 Landing Page URL
- 系统做低成本规则诊断（总分 + 同行百分位 + 3条高优先级建议）
- 结果页强引导添加微信，点击按钮时记录线索并推送飞书

## 已实现功能
- 单路径诊断流程（不展示多选）
- 规则引擎分析（不依赖 OpenAI API Key）
- 行业自动识别（默认偏向 SaaS）
- 每用户每日 2 次免费诊断限制
- 同 URL 24 小时缓存（命中缓存不重复消耗次数）
- 结果页强引导区（证言 + 稀缺 + 微信二维码）
- 线索记录到本地 `data/store.json`
- 点击微信按钮后推送飞书（可选）
- 日终汇总接口：`/api/daily-summary`

## 项目结构
- `src/app/page.tsx`：首页 + 结果区 + 微信引导
- `src/app/api/analyze/route.ts`：诊断接口、配额限制、缓存命中
- `src/app/api/lead/route.ts`：高意向线索记录 + 飞书通知
- `src/app/api/daily-summary/route.ts`：当天数据汇总
- `src/lib/rules.ts`：规则评分与建议生成
- `src/lib/store.ts`：本地数据存储（配额/缓存/线索）
- `src/lib/notify.ts`：飞书通知

## 环境变量
复制 `.env.example` 到 `.env.local` 并按需填写：

```bash
cp .env.example .env.local
```

- `FEISHU_WEBHOOK_URL`：飞书机器人 webhook（可留空）
- `DASHBOARD_USERNAME`：看板 Basic Auth 用户名（可留空）
- `DASHBOARD_PASSWORD`：看板 Basic Auth 密码（可留空）

## 本地运行
```bash
cd /Users/peidaqi/Desktop/lp-doctor/lp-app
npm install --cache .npm-cache
npm run dev
```

打开 `http://localhost:3000`。

如果你设置了 `DASHBOARD_USERNAME` 和 `DASHBOARD_PASSWORD`，访问以下地址会先弹出密码框：
- `http://localhost:3000/dashboard`
- `http://localhost:3000/api/daily-summary`

## 日终检查
查询当天线索和使用人数：

```bash
curl "http://localhost:3000/api/daily-summary"
```

指定日期（YYYY-MM-DD）：

```bash
curl "http://localhost:3000/api/daily-summary?date=2026-03-17"
```

## 关于“无需 API Key”
当前版本完全可运行，不依赖 OpenAI API。

后续如果你要接入真实 AI 深度分析，优先替换：
- `src/lib/rules.ts`（规则分析后追加 AI 分析）
- `src/app/api/lead/route.ts`（对高潜线索触发 AI 摘要并推送）
