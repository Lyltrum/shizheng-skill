# 时政简报 Skill（China Politics Brief for Claude）

> 仓库：https://github.com/Lyltrum/shizheng-skill ｜ License: MIT

一个让 Claude 帮你**获取并整理中国时政信息、生成每日时政简报**的 skill。聚合多个权威时政源，可按时政简报、分源浏览、逐条全文查看。

> A Claude skill that aggregates authoritative Chinese current-affairs sources
> into a daily politics brief. Read it as a grouped brief, browse by source, or
> open the full transcript. Zero API keys, zero dependencies.

## 数据源

| 源 | id | 内容 | 时效 |
|----|----|------|------|
| 央视《新闻联播》文字版 | `xinwenlianbo` | 全文逐条，时政为主、深度足 | 每晚约 19:00 上线 |
| 央视网国内要闻 | `cctv-china` | 标题 + 摘要 + 原文链接，覆盖时政/政务/外交 | 全天实时滚动 |

> 都是公开源，**无需任何 API key**。后续可在 `scripts/sources/` 下按相同接口扩展更多源。

## 特点

- **零密钥、零依赖、跨平台**：抓取器是 Node.js 脚本，用 Node 18+ 自带的 `fetch`，无需 `npm install`，Windows / macOS / Linux 通用。
- **多源聚合**：并行抓取，单源失败不影响其余源。
- **按人定制**：每个用户用 `~/.shizheng/config.json` 调自己的偏好——`detail`(全文/摘要)、`scope`(全部/只时政)、`cctvLimit`、`dedup`。出厂默认是温和的"摘要+全部"。
- **完整正文**：偏好设 `detail=full` 时，央视每条会抓原文页提取完整正文（图片/视频页无正文则保留摘要）；联播本就是全文。
- **自动去重**：本地状态文件记住已展示内容，重复调用只给**新增**（联播按日期、央视按文章 id），同一天多次调用不刷屏。`--all` 可绕过。
- **自动回退**：联播不指定日期时，先试当天，没上线就回退到昨天。

## 依赖

- [Node.js](https://nodejs.org/) **18 或更高版本**（`node --version` 检查）。
- 一个能运行 skill 的 Claude 客户端（Claude Code 等）。

## 安装

一键 clone 到 Claude Code 的用户级 skills 目录：

```bash
# macOS / Linux
git clone https://github.com/Lyltrum/shizheng-skill ~/.claude/skills/shizheng

# Windows (PowerShell)
git clone https://github.com/Lyltrum/shizheng-skill "$env:USERPROFILE\.claude\skills\shizheng"
```

或手动把整个文件夹放进 skills 目录（目录名用 `shizheng`）：

| 客户端 | 路径 |
|--------|------|
| Claude Code（用户级） | `~/.claude/skills/shizheng/`（Windows：`%USERPROFILE%\.claude\skills\shizheng\`） |
| Claude Code（项目级） | `<项目>/.claude/skills/shizheng/` |

放好后重启 / 刷新客户端，skill 即可被识别。

## 使用

自然语言触发，或显式调用 `/shizheng`：

- “今天时政有啥” / “看今天的时政简报” → 多源时政简报
- “新闻联播说了什么” → 联播内容
- “看央视国内要闻” → 央视实时要闻列表
- “6 月 9 日的新闻联播” → 指定日期联播
- “联播第 7 条详细说说” → 输出该条全文

也可脱离 Claude，直接命令行运行聚合器：

```bash
node scripts/fetch-brief.mjs                   # 按个人偏好抓取（默认去重）
node scripts/fetch-brief.mjs --date 20260609   # 指定新闻联播日期
node scripts/fetch-brief.mjs --source cctv-china   # 只抓某一源
node scripts/fetch-brief.mjs --full            # 本次强制全文（--brief 反之）
node scripts/fetch-brief.mjs --all             # 本次绕过去重，显示全部
node scripts/fetch-brief.mjs --save ~/notes    # 渲染成 Markdown 笔记直接写入目录
node scripts/fetch-brief.mjs --reset           # 清空去重记录
```

### 保存 / 归档（省 token）

`--save <目录>` 让脚本**自己**把简报渲染成带 frontmatter 的 Markdown 笔记
（`YYYY-MM-DD-时政简报.md`，完整正文 + 完整快照）写入目录，**全文不经过模型上下文**，
只返回一份很小的格式自检报告（`ok` / `issues` / 条目数 / 字节数）。配合 Obsidian
做每日时政归档非常省 token——用 Claude 时直接说"把今天的时政简报存到 `<目录>`"即可。

### 个人偏好

行为由 `~/.shizheng/config.json` 决定，每个人各自独立。改偏好（持久生效）：

```bash
node scripts/fetch-brief.mjs --config-set detail=full scope=all   # 默认全文+全部
node scripts/fetch-brief.mjs --config-set scope=politics          # 默认只给时政简报
node scripts/fetch-brief.mjs --config-set cctvLimit=40 dedup=false
node scripts/fetch-brief.mjs --show-config                        # 查看当前偏好
```

| 字段 | 取值 | 含义 | 默认 |
|------|------|------|------|
| `detail` | `full` / `brief` | 每条完整正文 / 只摘要 | `brief` |
| `scope` | `all` / `politics` | 全部条目 / 只挑时政分组 | `all` |
| `cctvLimit` | 数字 | 央视要闻条数上限 | `20` |
| `dedup` | `true` / `false` | 是否只给新增 | `true` |

用 Claude 时直接说"以后默认给我全文""只要时政摘要"即可，我会帮你写入配置。

输出为 JSON：

```jsonc
{
  "generatedAt": "2026-06-10T10:58:34.241Z",
  "sources": [
    {
      "id": "xinwenlianbo", "name": "新闻联播", "status": "ok",
      "date": "20260609", "dayTitle": "2026年6月9日 新闻联播", "url": "…",
      "items": [ { "index": 1, "title": "…", "body": "…完整文字稿…" } ]
    },
    {
      "id": "cctv-china", "name": "央视国内要闻", "status": "ok", "url": "…",
      "items": [ { "index": 1, "title": "…", "brief": "…摘要…", "url": "…原文…", "time": "2026-06-10 18:10:14" } ]
    }
  ]
}
```

注意两源 `items` 字段不同：联播条目有 `body`（全文），央视要闻条目有 `brief` + `url` + `time`。

## 目录结构

```
shizheng/
├── SKILL.md                     # 给 Claude 的工作流（源、参数、呈现形态）
├── README.md                    # 本文件
├── LICENSE
├── scripts/
│   ├── fetch-brief.mjs          # 聚合入口：并行抓取所有源 → JSON（含去重/全文）
│   ├── config.mjs               # 用户偏好（~/.shizheng/config.json）
│   ├── state.mjs                # 本地去重状态（~/.shizheng/state.json）
│   └── sources/                 # 每个数据源一个模块，接口统一，便于扩展
│       ├── _html.mjs            # 共享 HTML 解析工具
│       ├── xinwenlianbo.mjs     # 新闻联播
│       └── cctv-china.mjs       # 央视国内要闻（含原文页全文提取）
└── prompts/
    └── summarize.md             # 时政简报生成规则
```

> 偏好和去重状态都存在用户目录 `~/.shizheng/`（不在 skill 目录内，不随分发传播；每个用户各自独立）。去重记录 14 天后自动清理。

### 扩展新源

在 `scripts/sources/` 新建一个模块，导出一个 `async` 函数，返回
`{ id, name, status, url, items: [...] }`，再到 `fetch-brief.mjs` 里 import 并加进任务列表即可。

## 说明与限制

- 数据来自第三方公开站点/接口，其可用性与更新时效不由本 skill 控制；个别源失败时简报会用其余源继续。
- 内容版权归原始发布方所有，本 skill 仅做个人查阅与整理，请勿用于商业用途。
- 若源站点结构变化导致解析失效，需更新对应 `scripts/sources/*.mjs` 里的解析逻辑。
- 央视要闻仅提供摘要，全文需点该条 `url` 到原站查看。

## License

MIT，详见 [LICENSE](./LICENSE)。
