import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildArxivUrl, decodeXml, parseArxivFeed } from "./arxiv.mjs";

const FEED = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>ArXiv Query</title>
  <entry>
    <id>http://arxiv.org/abs/2401.00001v2</id>
    <updated>2024-01-02T00:00:00Z</updated>
    <published>2024-01-01T00:00:00Z</published>
    <title>Retrieval  Augmented
      Generation</title>
    <summary>We study &amp; measure RAG.</summary>
    <author><name>Ada L</name></author>
    <author><name>Bo Z</name></author>
    <arxiv:primary_category xmlns:arxiv="http://arxiv.org/schemas/atom" term="cs.CL"/>
  </entry>
  <entry>
    <id>http://arxiv.org/abs/2401.00002v1</id>
    <title>没有摘要的条目</title>
    <summary></summary>
    <author><name>Cy</name></author>
  </entry>
</feed>`;

describe("decodeXml", () => {
  it("还原常见实体，未知实体保持原样", () => {
    assert.equal(decodeXml("a &amp; b &lt;c&gt; &#39;d&#39; &weird;"), "a & b <c> 'd' &weird;");
  });
});

describe("buildArxivUrl", () => {
  it("查询式被正确编码，带上条数与排序", () => {
    const url = new URL(buildArxivUrl({ query: 'all:"retrieval augmented generation"', limit: 4 }));
    assert.equal(url.origin + url.pathname, "https://export.arxiv.org/api/query");
    assert.equal(url.searchParams.get("search_query"), 'all:"retrieval augmented generation"');
    assert.equal(url.searchParams.get("max_results"), "4");
    assert.equal(url.searchParams.get("sortBy"), "submittedDate");
  });
});

describe("parseArxivFeed", () => {
  const entries = parseArxivFeed(FEED);

  it("解析出条目并去掉版本号后缀", () => {
    assert.equal(entries.length, 1);
    assert.equal(entries[0].arxivId, "2401.00001");
    assert.equal(entries[0].url, "https://arxiv.org/abs/2401.00001");
  });

  it("标题折行被压平，实体被还原", () => {
    assert.equal(entries[0].title, "Retrieval Augmented Generation");
    assert.equal(entries[0].summary, "We study & measure RAG.");
  });

  it("带出作者、分类与发布时间，供出处引用", () => {
    assert.deepEqual(entries[0].authors, ["Ada L", "Bo Z"]);
    assert.equal(entries[0].primaryCategory, "cs.CL");
    assert.equal(entries[0].publishedAt, "2024-01-01T00:00:00Z");
  });

  it("没有摘要的条目被丢掉（无法引用原文）", () => {
    assert.ok(!entries.some((e) => e.arxivId === "2401.00002"));
  });

  it("不是 feed 时返回空数组，由调用方记 warn", () => {
    assert.deepEqual(parseArxivFeed("<html>error</html>"), []);
  });
});
