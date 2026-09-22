/**
 * arXiv Atom 接口的解析（纯函数，离线可测）。
 * 只取摘要级信息：标题、摘要、可引用的 abs 链接、作者、分类。
 * 摘要本身就是可逐字摘录的原文，正好满足题目的 source.snippet 要求。
 */

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", "#39": "'", nbsp: " " };

export function decodeXml(text) {
  return String(text).replace(/&(#?\w+);/g, (m, name) => ENTITIES[name] ?? m);
}

function pick(block, tag) {
  const m = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`).exec(block);
  return m ? decodeXml(m[1]).replace(/\s+/g, " ").trim() : "";
}

export function buildArxivUrl({ query, limit = 10, start = 0, sortBy = "submittedDate" }) {
  const params = new URLSearchParams({
    search_query: query,
    start: String(start),
    max_results: String(limit),
    sortBy,
    sortOrder: "descending"
  });
  return `https://export.arxiv.org/api/query?${params.toString()}`;
}

/** 把 Atom feed 解析成条目数组；解析不出条目返回空数组（由调用方记 warn）。 */
export function parseArxivFeed(xml) {
  const entries = String(xml).split("<entry>").slice(1);
  return entries
    .map((block) => {
      const rawId = pick(block, "id");
      const absUrl = rawId.replace(/^http:/, "https:").replace(/v\d+$/, "");
      return {
        arxivId: absUrl.split("/abs/")[1] ?? rawId,
        title: pick(block, "title"),
        summary: pick(block, "summary"),
        url: absUrl,
        publishedAt: pick(block, "published") || pick(block, "updated"),
        authors: [...block.matchAll(/<author>[\s\S]*?<name>([\s\S]*?)<\/name>/g)].map((m) => decodeXml(m[1]).trim()),
        primaryCategory: /<arxiv:primary_category[^>]*term="([^"]+)"/.exec(block)?.[1] ?? ""
      };
    })
    .filter((e) => e.summary && e.url);
}
