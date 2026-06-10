// Render a fetched brief into an Obsidian-friendly Markdown note, and run a
// lightweight deterministic format check on it. Both run in the script so the
// full article text never has to pass through the model's context.

function ymdToDash(d) {
  return d ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : '';
}

// brief = { generatedAt, config, sources }  -> { markdown, filename, date }
export function renderNote(brief) {
  const xwlb = brief.sources.find((s) => s.id === 'xinwenlianbo');
  const cctv = brief.sources.find((s) => s.id === 'cctv-china');
  const today = new Date().toISOString().slice(0, 10);

  let md = '';
  md += `---\n`;
  md += `title: 时政简报 ${today}\n`;
  md += `date: ${today}\n`;
  md += `tags: [时政, 新闻联播, 央视国内要闻]\n`;
  md += `sources: [新闻联播 ${(xwlb && xwlb.date) || ''}, 央视国内要闻]\n`;
  md += `generated: ${brief.generatedAt}\n`;
  md += `---\n\n`;
  md += `# 时政简报 · ${today}\n\n`;
  md += `> 数据源：央视《新闻联播》文字版 + 央视网国内要闻。仅供个人查阅，版权归原发布方。\n\n`;

  if (xwlb && xwlb.status === 'ok') {
    md += `## 📺 新闻联播（${xwlb.dayTitle || ymdToDash(xwlb.date)}，共 ${xwlb.items.length} 条）\n\n`;
    md += `原文：${xwlb.url}\n\n`;
    for (const it of xwlb.items) md += `### ${it.index}. ${it.title}\n\n${it.body}\n\n`;
  }
  if (cctv && cctv.status === 'ok') {
    md += `## 📰 央视国内要闻（共 ${cctv.items.length} 条）\n\n`;
    for (const it of cctv.items) {
      md += `### ${it.index}. ${it.title}\n\n`;
      md += `*${it.time}　·　[原文](${it.url})*\n\n`;
      md += it.body ? `${it.body}\n\n` : `${it.brief}（仅摘要，详见原文）\n\n`;
    }
  }
  return { markdown: md, filename: `${today}-时政简报.md`, date: today };
}

const BAD_TITLE = /对不起|请稍后|网络原因|无此页面|正在加载/;

// Deterministic format check. Returns a small report the model can eyeball cheaply.
export function lintNote(brief, md) {
  const issues = [];
  const fm = md.match(/^---\n([\s\S]*?)\n---\n/);
  if (!fm || !/(^|\n)title:/.test(fm[1])) issues.push('frontmatter 缺失或格式异常');
  else if (!/(^|\n)tags:\s*\[/.test(fm[1])) issues.push('缺少 tags');

  const headingCount = (md.match(/^### /gm) || []).length;
  const srcReport = [];
  let totalItems = 0;

  for (const s of brief.sources) {
    if (s.status !== 'ok') {
      issues.push(`源「${s.name}」状态=${s.status}`);
      srcReport.push({ name: s.name, status: s.status });
      continue;
    }
    const withBody = s.items.filter((i) => i.body).length;
    const badTitles = s.items.filter((i) => BAD_TITLE.test(i.title) || !i.title.trim()).length;
    const emptyXwlb = s.id === 'xinwenlianbo' ? s.items.filter((i) => !i.body).length : 0;
    totalItems += s.items.length;

    if (badTitles > 0) issues.push(`「${s.name}」有 ${badTitles} 条标题异常（占位/空）`);
    if (emptyXwlb > 0) issues.push(`新闻联播有 ${emptyXwlb} 条缺正文`);
    srcReport.push({ name: s.name, status: 'ok', items: s.items.length, withBody });
  }

  if (headingCount !== totalItems) {
    issues.push(`条目数(${totalItems})与 ### 标题数(${headingCount})不一致`);
  }

  return {
    ok: issues.length === 0,
    issues,
    stats: { bytes: Buffer.byteLength(md), headingCount, totalItems, sources: srcReport },
  };
}
